// Application state — single shared instance used by both Electron IPC and companion server
// This fixes the old Rust architecture where the companion server got a SNAPSHOT of state.

import { EventEmitter } from "events";
import { existsSync, readFileSync } from "fs";
import path from "path";
import { execFileSync } from "child_process";
import type {
  SdkConfig,
  CompanionConfig,
  AdbDevice,
  AvdInfo,
  BuildInfo,
  ProjectInfo,
  ProjectType,
} from "./types";

class AppState {
  sdkConfig: SdkConfig;
  companionConfig: CompanionConfig;
  devices: AdbDevice[] = [];
  avds: AvdInfo[] = [];
  builds: Map<string, BuildInfo> = new Map();
  projects: ProjectInfo[] = [];

  /** Shared event bus — companion server, build services, and IPC handlers all use this */
  eventBus = new EventEmitter();

  constructor() {
    this.sdkConfig = detectSdkPaths();
    this.companionConfig = { port: 9400, apiKey: "", running: false };
  }
}

// ---------------------------------------------------------------------------
// SDK auto-detection
// ---------------------------------------------------------------------------

function detectSdkPaths(): SdkConfig {
  const androidSdk =
    process.env.ANDROID_HOME ||
    process.env.ANDROID_SDK_ROOT ||
    path.join(process.env.LOCALAPPDATA || "", "Android", "Sdk");

  const javaHome = process.env.JAVA_HOME || "";

  const adbPath = existsSync(path.join(androidSdk, "platform-tools", "adb.exe"))
    ? path.join(androidSdk, "platform-tools", "adb.exe")
    : "adb";

  const emulatorPath = existsSync(path.join(androidSdk, "emulator", "emulator.exe"))
    ? path.join(androidSdk, "emulator", "emulator.exe")
    : "emulator";

  let flutterSdkPath = process.env.FLUTTER_HOME || process.env.FLUTTER_ROOT || "";

  if (!flutterSdkPath) {
    try {
      const whichResult = execFileSync("where", ["flutter"], {
        timeout: 5000,
        encoding: "utf-8",
        stdio: ["ignore", "pipe", "ignore"],
        windowsHide: true,
      }).trim();
      if (whichResult) {
        // `where flutter` returns path to flutter.bat — SDK is 2 dirs up (bin/flutter.bat)
        const flutterBat = whichResult.split("\n")[0].trim();
        const binDir = path.dirname(flutterBat);
        flutterSdkPath = path.dirname(binDir);
      }
    } catch {
      // Flutter not on PATH
    }
  }

  return { androidSdkPath: androidSdk, javaHome, adbPath, emulatorPath, flutterSdkPath };
}

// ---------------------------------------------------------------------------
// Project detection helpers
// ---------------------------------------------------------------------------

export function detectProjectType(projectPath: string): ProjectType {
  // Check Flutter first (pubspec.yaml with flutter section)
  const pubspecPath = path.join(projectPath, "pubspec.yaml");
  if (existsSync(pubspecPath)) {
    try {
      const content = readFileSync(pubspecPath, "utf-8");
      if (/^flutter\s*:/m.test(content)) return "flutter";
    } catch {
      // fall through
    }
  }

  // Check React Native (package.json with react-native dep + android/ dir)
  const pkgPath = path.join(projectPath, "package.json");
  if (existsSync(pkgPath) && existsSync(path.join(projectPath, "android"))) {
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
      const deps = { ...pkg.dependencies, ...pkg.devDependencies };
      if (deps["react-native"]) return "react-native";
    } catch {
      // fall through
    }
  }

  // Check Android-native (build.gradle or build.gradle.kts at root, or gradlew.bat)
  if (
    existsSync(path.join(projectPath, "build.gradle")) ||
    existsSync(path.join(projectPath, "build.gradle.kts")) ||
    existsSync(path.join(projectPath, "gradlew.bat"))
  ) {
    return "android-native";
  }

  return "unknown";
}

export function parseApplicationId(projectPath: string, projectType: ProjectType): string {
  // For Flutter and React Native, check android/ subdirectory
  const androidDir =
    projectType === "android-native"
      ? projectPath
      : path.join(projectPath, "android");

  // Try app/build.gradle or app/build.gradle.kts
  for (const gradleFile of ["app/build.gradle", "app/build.gradle.kts"]) {
    const gradlePath = path.join(androidDir, gradleFile);
    if (!existsSync(gradlePath)) continue;

    try {
      const content = readFileSync(gradlePath, "utf-8");
      const appId = extractGradleString(content, "applicationId");
      if (appId) return appId;
      const namespace = extractGradleString(content, "namespace");
      if (namespace) return namespace;
    } catch {
      // fall through
    }
  }

  // Try AndroidManifest.xml
  const manifestPath = path.join(androidDir, "app", "src", "main", "AndroidManifest.xml");
  if (existsSync(manifestPath)) {
    try {
      const content = readFileSync(manifestPath, "utf-8");
      const match = content.match(/package\s*=\s*"([^"]+)"/);
      if (match) return match[1];
    } catch {
      // fall through
    }
  }

  return "";
}

function extractGradleString(content: string, key: string): string {
  // Matches: applicationId "com.example" or applicationId = "com.example"
  // Also matches single quotes
  const regex = new RegExp(`${key}\\s*=?\\s*["']([^"']+)["']`);
  const match = content.match(regex);
  return match ? match[1] : "";
}

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

export const appState = new AppState();
