// React Native build service — spawns react-native CLI and streams output
// NEW — not ported from Rust (Rust backend didn't have this)

import { spawn } from "child_process";
import { existsSync } from "fs";
import path from "path";
import type { BrowserWindow } from "electron";
import type { EventEmitter } from "events";
import { findFileWithExt } from "./gradle";
import { appState } from "./state";

// ---------------------------------------------------------------------------
// Build
// ---------------------------------------------------------------------------

export function startBuild(
  projectPath: string,
  task: string,
  extraArgs: string | undefined,
  eventBus: EventEmitter,
  mainWindow: BrowserWindow | null,
  buildId: string
): Promise<{ outputApk: string | null }> {
  return new Promise((resolve, reject) => {
    // React Native builds can use either:
    // 1. `npx react-native run-android` (from project root)
    // 2. `gradlew.bat assembleDebug` (from android/ directory)
    //
    // We support both by checking the task string:
    // - "run-android" or "react-native run-android" → use npx react-native
    // - "assembleDebug", "assembleRelease" → use gradlew.bat in android/

    let cmd: string;
    let args: string[];
    let cwd: string;

    const isGradleTask =
      task.startsWith("assemble") ||
      task.startsWith("bundle") ||
      task.startsWith("install");

    if (isGradleTask) {
      // Use gradlew.bat in the android/ subdirectory
      const gradlew = path.join(projectPath, "android", "gradlew.bat");
      if (!existsSync(gradlew)) {
        reject(
          new Error(`gradlew.bat not found in ${path.join(projectPath, "android")}`)
        );
        return;
      }
      cmd = gradlew;
      args = [task];
      cwd = path.join(projectPath, "android");
    } else {
      // Use npx react-native
      cmd = "npx";
      const rnTask = task.replace(/^(npx\s+)?react-native\s*/, "");
      args = ["react-native", rnTask || "run-android"];
      cwd = projectPath;
    }

    if (extraArgs) {
      args.push(...extraArgs.split(/\s+/).filter(Boolean));
    }

    const child = spawn(cmd, args, {
      cwd,
      env: process.env as Record<string, string>,
      shell: true,
    });

    const emitLog = (line: string) => {
      eventBus.emit("build-log", { buildId, line });
      mainWindow?.webContents.send("build-log", { buildId, line });
      const build = appState.builds.get(buildId);
      if (build) build.logs.push(line);
    };

    child.stdout?.on("data", (data: Buffer) => {
      for (const line of data.toString().split("\n")) {
        if (line.trim()) emitLog(line);
      }
    });

    child.stderr?.on("data", (data: Buffer) => {
      for (const line of data.toString().split("\n")) {
        if (line.trim()) emitLog(`[stderr] ${line}`);
      }
    });

    child.on("close", (code) => {
      const exitCode = code ?? 1; // null means killed by signal
      if (exitCode === 0) {
        const outputApk = findReactNativeOutputApk(projectPath, task);
        const payload = {
          buildId,
          phase: "complete",
          progress: 100,
          outputApk,
          error: null,
        };
        eventBus.emit("build-status", payload);
        mainWindow?.webContents.send("build-status", payload);
        resolve({ outputApk });
      } else {
        const errMsg = `React Native build failed with exit code ${exitCode}`;
        const payload = {
          buildId,
          phase: "failed",
          progress: 100,
          outputApk: null,
          error: errMsg,
        };
        eventBus.emit("build-status", payload);
        mainWindow?.webContents.send("build-status", payload);
        reject(new Error(errMsg));
      }
    });

    child.on("error", (err) => {
      reject(err);
    });
  });
}

// ---------------------------------------------------------------------------
// Find output APK
// ---------------------------------------------------------------------------

export function findReactNativeOutputApk(
  projectPath: string,
  task: string
): string | null {
  const isRelease = task.toLowerCase().includes("release");
  const buildType = isRelease ? "release" : "debug";

  const searchPaths = [
    path.join(projectPath, "android", "app", "build", "outputs", "apk", buildType),
    path.join(projectPath, "android", "app", "build", "outputs", "apk"),
  ];

  for (const dir of searchPaths) {
    const apk = findFileWithExt(dir, ".apk");
    if (apk) return apk;
  }

  return null;
}
