// Gradle build service — spawns gradlew.bat and streams output
// Ported from src-tauri/src/gradle.rs

import { spawn } from "child_process";
import { existsSync, readdirSync } from "fs";
import path from "path";
import type { BrowserWindow } from "electron";
import type { EventEmitter } from "events";
import { appState } from "./state";

// ---------------------------------------------------------------------------
// Build
// ---------------------------------------------------------------------------

export function startBuild(
  projectPath: string,
  task: string,
  javaHome: string | undefined,
  extraArgs: string | undefined,
  eventBus: EventEmitter,
  mainWindow: BrowserWindow | null,
  buildId: string
): Promise<{ outputApk: string | null }> {
  return new Promise((resolve, reject) => {
    const gradlew = path.join(projectPath, "gradlew.bat");
    if (!existsSync(gradlew)) {
      reject(new Error(`gradlew.bat not found in ${projectPath}`));
      return;
    }

    const args = [task];
    if (extraArgs) {
      args.push(...extraArgs.split(/\s+/).filter(Boolean));
    }

    const env: Record<string, string> = { ...process.env } as Record<string, string>;
    if (javaHome) env.JAVA_HOME = javaHome;

    const child = spawn(gradlew, args, {
      cwd: projectPath,
      env,
      shell: true,
    });

    const emitLog = (line: string) => {
      eventBus.emit("build-log", { buildId, line });
      mainWindow?.webContents.send("build-log", { buildId, line });
      // Also push to the in-memory build log
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
        const outputApk = findOutputApk(projectPath, task);
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
        const errMsg = `Gradle build failed with exit code ${exitCode}`;
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

export function findOutputApk(
  projectPath: string,
  task: string
): string | null {
  // Determine build type from task name
  const isRelease = task.toLowerCase().includes("release");
  const buildType = isRelease ? "release" : "debug";

  const searchPaths = [
    path.join(projectPath, "app", "build", "outputs", "apk", buildType),
    path.join(projectPath, "app", "build", "outputs", "apk"),
    path.join(projectPath, "build", "outputs", "apk", buildType),
    path.join(projectPath, "build", "outputs", "apk"),
    // Flutter APK paths (in case a Flutter project has gradlew too)
    path.join(projectPath, "build", "app", "outputs", "flutter-apk"),
    path.join(projectPath, "build", "app", "outputs", "apk", buildType),
  ];

  for (const dir of searchPaths) {
    const apk = findFileWithExt(dir, ".apk");
    if (apk) return apk;
  }

  return null;
}

export function findFileWithExt(dir: string, ext: string): string | null {
  try {
    if (!existsSync(dir)) return null;
    const files = readdirSync(dir);
    for (const file of files) {
      if (file.endsWith(ext)) {
        return path.join(dir, file);
      }
    }
  } catch {
    // Directory doesn't exist or not readable
  }
  return null;
}
