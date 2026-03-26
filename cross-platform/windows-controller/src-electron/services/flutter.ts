// Flutter build service — spawns flutter CLI and streams output
// Ported from src-tauri/src/flutter.rs

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
  flutterBin: string | undefined,
  extraArgs: string | undefined,
  eventBus: EventEmitter,
  mainWindow: BrowserWindow | null,
  buildId: string
): Promise<{ outputApk: string | null }> {
  return new Promise((resolve, reject) => {
    const flutter = flutterBin || "flutter";

    // Parse task: "flutter build apk --debug" → ["build", "apk", "--debug"]
    const taskParts = task
      .replace(/^flutter\s+/, "")
      .split(/\s+/)
      .filter(Boolean);

    const args = [...taskParts];
    if (extraArgs) {
      args.push(...extraArgs.split(/\s+/).filter(Boolean));
    }

    const env: Record<string, string> = {
      ...(process.env as Record<string, string>),
      CI: "true",
      FLUTTER_SUPPRESS_ANALYTICS: "true",
    };

    const child = spawn(flutter, args, {
      cwd: projectPath,
      env,
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
        const outputApk = findFlutterOutputApk(projectPath, task);
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
        const errMsg = `Flutter build failed with exit code ${exitCode}`;
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

export function findFlutterOutputApk(
  projectPath: string,
  task: string
): string | null {
  const isRelease = task.toLowerCase().includes("release");
  const isAppBundle = task.toLowerCase().includes("appbundle");

  if (isAppBundle) {
    const bundlePaths = [
      path.join(projectPath, "build", "app", "outputs", "bundle", "release"),
      path.join(projectPath, "build", "app", "outputs", "bundle", "debug"),
    ];
    for (const dir of bundlePaths) {
      const aab = findFileWithExt(dir, ".aab");
      if (aab) return aab;
    }
  }

  const buildType = isRelease ? "release" : "debug";
  const apkPaths = [
    path.join(projectPath, "build", "app", "outputs", "flutter-apk"),
    path.join(projectPath, "build", "app", "outputs", "apk", buildType),
    path.join(projectPath, "build", "app", "outputs", "apk"),
  ];

  for (const dir of apkPaths) {
    const apk = findFileWithExt(dir, ".apk");
    if (apk) return apk;
  }

  return null;
}
