// IPC handlers — registers all ipcMain.handle channels

import { ipcMain, dialog, BrowserWindow } from "electron";
import { randomUUID } from "crypto";
import { existsSync } from "fs";
import path from "path";
import { appState, detectProjectType, parseApplicationId } from "./services/state";
import * as adb from "./services/adb";
import * as emulatorSvc from "./services/emulator";
import * as gradle from "./services/gradle";
import * as flutter from "./services/flutter";
import * as reactNative from "./services/react-native";
import * as companionServer from "./services/companion-server";
import * as playStore from "./services/play-store";
import * as uiAutomation from "./services/ui-automation";
import type {
  AssetGenerationOptions,
  BuildInfo,
  GenAiConfigUpdate,
  PlayStoreConfig,
  VideoOrientation,
} from "./services/types";

function assertString(value: unknown, field: string, maxLen: number = 5000): string {
  if (typeof value !== "string") throw new Error(`${field} must be a string`);
  const trimmed = value.trim();
  if (!trimmed) throw new Error(`${field} is required`);
  if (trimmed.length > maxLen) throw new Error(`${field} is too long`);
  return trimmed;
}

function assertOptionalString(value: unknown, field: string, maxLen: number = 5000): string | null {
  if (value == null) return null;
  if (typeof value !== "string") throw new Error(`${field} must be a string`);
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.length > maxLen) throw new Error(`${field} is too long`);
  return trimmed;
}

function assertPort(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${field} must be a number`);
  }
  const int = Math.floor(value);
  if (int < 1 || int > 65535) {
    throw new Error(`${field} must be between 1 and 65535`);
  }
  return int;
}

function normalizeAssetOptions(value: unknown): Partial<AssetGenerationOptions> | undefined {
  if (value == null) return undefined;
  if (typeof value !== "object") throw new Error("assetOptions must be an object");
  const opts = value as Partial<AssetGenerationOptions>;

  const normalized: Partial<AssetGenerationOptions> = {};
  if (opts.screenshotCount !== undefined) {
    if (typeof opts.screenshotCount !== "number" || !Number.isFinite(opts.screenshotCount)) {
      throw new Error("assetOptions.screenshotCount must be a number");
    }
    normalized.screenshotCount = Math.max(1, Math.min(8, Math.floor(opts.screenshotCount)));
  }
  if (opts.templatePreset !== undefined) {
    normalized.templatePreset = opts.templatePreset;
  }
  if (opts.locale !== undefined) {
    normalized.locale = assertString(opts.locale, "assetOptions.locale", 20);
  }
  if (opts.headline !== undefined) {
    normalized.headline = assertString(opts.headline, "assetOptions.headline", 120);
  }
  if (opts.subheadline !== undefined) {
    normalized.subheadline = assertString(opts.subheadline, "assetOptions.subheadline", 200);
  }
  if (opts.includeDeviceFrame !== undefined) {
    if (typeof opts.includeDeviceFrame !== "boolean") {
      throw new Error("assetOptions.includeDeviceFrame must be a boolean");
    }
    normalized.includeDeviceFrame = opts.includeDeviceFrame;
  }
  if (opts.videoDurationSeconds !== undefined) {
    if (typeof opts.videoDurationSeconds !== "number" || !Number.isFinite(opts.videoDurationSeconds)) {
      throw new Error("assetOptions.videoDurationSeconds must be a number");
    }
    normalized.videoDurationSeconds = Math.max(5, Math.min(180, Math.floor(opts.videoDurationSeconds)));
  }
  if (opts.videoOrientation !== undefined) {
    normalized.videoOrientation = opts.videoOrientation;
  }

  return normalized;
}

function assertBoolean(value: unknown, field: string): boolean {
  if (typeof value !== "boolean") throw new Error(`${field} must be a boolean`);
  return value;
}

function assertPackageName(value: unknown, field: string): string {
  const pkg = assertString(value, field, 220);
  if (!/^[a-zA-Z][a-zA-Z0-9_]*(\.[a-zA-Z][a-zA-Z0-9_]*)+$/.test(pkg)) {
    throw new Error(`${field} must be a valid Android package name`);
  }
  return pkg;
}

function assertSerial(value: unknown, field: string): string {
  const serial = assertString(value, field, 120);
  if (!/^[a-zA-Z0-9._:-]+$/.test(serial)) {
    throw new Error(`${field} contains invalid characters`);
  }
  return serial;
}

export function registerIpcHandlers(getMainWindow: () => BrowserWindow | null) {
  // =========================================================================
  // SDK Config
  // =========================================================================

  ipcMain.handle("get_sdk_config", () => {
    return appState.sdkConfig;
  });

  ipcMain.handle("set_sdk_config", (_e, config: { androidSdkPath?: string; javaHome?: string; flutterSdkPath?: string }) => {
    if (config.androidSdkPath !== undefined) {
      appState.sdkConfig.androidSdkPath = config.androidSdkPath;
      // Re-derive tool paths from new SDK path
      const adbCandidate = path.join(config.androidSdkPath, "platform-tools", "adb.exe");
      appState.sdkConfig.adbPath = existsSync(adbCandidate) ? adbCandidate : "adb";
      const emuCandidate = path.join(config.androidSdkPath, "emulator", "emulator.exe");
      appState.sdkConfig.emulatorPath = existsSync(emuCandidate) ? emuCandidate : "emulator";
    }
    if (config.javaHome !== undefined) {
      appState.sdkConfig.javaHome = config.javaHome;
    }
    if (config.flutterSdkPath !== undefined) {
      appState.sdkConfig.flutterSdkPath = config.flutterSdkPath;
    }
    return appState.sdkConfig;
  });

  // =========================================================================
  // Devices
  // =========================================================================

  ipcMain.handle("list_devices", async () => {
    const devices = await adb.listDevices(appState.sdkConfig.adbPath);
    appState.devices = devices;
    return devices;
  });

  ipcMain.handle("get_device_details", async (_e, serial: string) => {
    return adb.getDeviceDetails(appState.sdkConfig.adbPath, serial);
  });

  ipcMain.handle("take_screenshot", async (_e, serial: string) => {
    return adb.takeScreenshot(appState.sdkConfig.adbPath, serial);
  });

  ipcMain.handle(
    "device_input",
    async (
      _e,
      opts: {
        serial: string;
        action: string;
        x?: number | null;
        y?: number | null;
        toX?: number | null;
        toY?: number | null;
        text?: string | null;
        keyCode?: number | null;
        duration?: number | null;
      }
    ) => {
      return adb.deviceInput(
        appState.sdkConfig.adbPath,
        opts.serial,
        opts.action,
        opts.x ?? undefined,
        opts.y ?? undefined,
        opts.toX ?? undefined,
        opts.toY ?? undefined,
        opts.duration ?? undefined,
        opts.text ?? undefined,
        opts.keyCode ?? undefined
      );
    }
  );

  ipcMain.handle(
    "install_apk",
    async (_e, serial: string, apkPath: string, reinstall: boolean) => {
      return adb.installApk(appState.sdkConfig.adbPath, serial, apkPath, reinstall);
    }
  );

  ipcMain.handle("uninstall_package", async (_e, serial: string, packageName: string) => {
    return adb.uninstallPackage(appState.sdkConfig.adbPath, serial, packageName);
  });

  ipcMain.handle("list_packages", async (_e, serial: string) => {
    return adb.listPackages(appState.sdkConfig.adbPath, serial);
  });

  // =========================================================================
  // Logcat
  // =========================================================================

  ipcMain.handle("get_logcat", async (_e, serial: string, lines: number) => {
    return adb.getLogcat(appState.sdkConfig.adbPath, serial, lines);
  });

  ipcMain.handle("clear_logcat", async (_e, serial: string) => {
    return adb.clearLogcat(appState.sdkConfig.adbPath, serial);
  });

  ipcMain.handle("repair_adb", async () => {
    const result = await adb.repairAdb(appState.sdkConfig.adbPath);
    // Refresh cached device list after repair
    try {
      appState.devices = await adb.listDevices(appState.sdkConfig.adbPath);
    } catch {
      // ignore refresh errors; repair result is still useful
    }
    return result;
  });

  ipcMain.handle("adb_diagnostics", async () => {
    return adb.getAdbDiagnostics(appState.sdkConfig.adbPath);
  });

  ipcMain.handle("emulator_diagnostics", async () => {
    return emulatorSvc.getEmulatorDiagnostics(appState.sdkConfig.emulatorPath);
  });

  ipcMain.handle("validate_sdk_tools", async () => {
    const sdk = appState.sdkConfig;
    const javaBin = sdk.javaHome
      ? path.join(sdk.javaHome, "bin", process.platform === "win32" ? "java.exe" : "java")
      : "";
    const flutterBin = sdk.flutterSdkPath
      ? path.join(
          sdk.flutterSdkPath,
          "bin",
          process.platform === "win32" ? "flutter.bat" : "flutter"
        )
      : "";

    const pathStatus = (value: string): "exists" | "missing" | "lookup" => {
      if (!value) return "missing";
      // PATH lookup command (not absolute path)
      if (!value.includes("\\") && !value.includes("/")) return "lookup";
      return existsSync(value) ? "exists" : "missing";
    };

    return {
      checkedAt: new Date().toISOString(),
      adbPath: sdk.adbPath,
      adbPathStatus: pathStatus(sdk.adbPath),
      emulatorPath: sdk.emulatorPath,
      emulatorPathStatus: pathStatus(sdk.emulatorPath),
      javaHome: sdk.javaHome,
      javaHomeStatus: sdk.javaHome ? (existsSync(sdk.javaHome) ? "exists" : "missing") : "missing",
      javaBin,
      javaBinStatus: javaBin ? (existsSync(javaBin) ? "exists" : "missing") : "missing",
      flutterSdkPath: sdk.flutterSdkPath,
      flutterSdkPathStatus: sdk.flutterSdkPath
        ? (existsSync(sdk.flutterSdkPath) ? "exists" : "missing")
        : "missing",
      flutterBin,
      flutterBinStatus: flutterBin ? (existsSync(flutterBin) ? "exists" : "missing") : "missing",
    };
  });

  // =========================================================================
  // AVDs / Emulator
  // =========================================================================

  ipcMain.handle("list_avds", async () => {
    const avds = await emulatorSvc.listAvds(
      appState.sdkConfig.emulatorPath,
      appState.sdkConfig.adbPath
    );
    appState.avds = avds;
    return avds;
  });

  ipcMain.handle("start_avd", (_e, name: string, coldBoot: boolean) => {
    emulatorSvc.startAvd(appState.sdkConfig.emulatorPath, name, coldBoot);
    return `Starting AVD ${name}`;
  });

  ipcMain.handle("stop_avd", async (_e, serial: string) => {
    return emulatorSvc.stopAvd(appState.sdkConfig.adbPath, serial);
  });

  // =========================================================================
  // Builds
  // =========================================================================

  ipcMain.handle(
    "start_build",
    async (_e, projectPath: string, task: string, extraArgs?: string) => {
      const projectType = detectProjectType(projectPath);
      const buildId = randomUUID();
      const startedAt = new Date().toISOString();
      const mainWindow = getMainWindow();

      const buildInfo: BuildInfo = {
        id: buildId,
        projectPath,
        task,
        phase: "compiling",
        progress: 0,
        startedAt,
        finishedAt: null,
        outputApk: null,
        logs: [],
        error: null,
      };

      appState.builds.set(buildId, buildInfo);

      // Build in background — don't await
      const buildPromise =
        projectType === "flutter"
          ? flutter.startBuild(
              projectPath,
              task,
              appState.sdkConfig.flutterSdkPath
                ? `${appState.sdkConfig.flutterSdkPath}\\bin\\flutter.bat`
                : undefined,
              extraArgs,
              appState.eventBus,
              mainWindow,
              buildId
            )
          : projectType === "react-native"
            ? reactNative.startBuild(
                projectPath,
                task,
                extraArgs,
                appState.eventBus,
                mainWindow,
                buildId
              )
            : gradle.startBuild(
                projectPath,
                task,
                appState.sdkConfig.javaHome || undefined,
                extraArgs,
                appState.eventBus,
                mainWindow,
                buildId
              );

      buildPromise
        .then(({ outputApk }) => {
          const info = appState.builds.get(buildId);
          if (info) {
            info.phase = "complete";
            info.progress = 100;
            info.finishedAt = new Date().toISOString();
            info.outputApk = outputApk;
          }
        })
        .catch((err) => {
          const info = appState.builds.get(buildId);
          if (info) {
            info.phase = "failed";
            info.progress = 100;
            info.finishedAt = new Date().toISOString();
            info.error = err.message;
          }
        });

      return {
        buildId,
        projectPath,
        task,
        projectType,
        message: `Build started (${projectType})`,
      };
    }
  );

  ipcMain.handle("get_build_status", (_e, buildId: string) => {
    const build = appState.builds.get(buildId);
    if (!build) throw new Error("Build not found");
    return build;
  });

  // =========================================================================
  // Projects
  // =========================================================================

  ipcMain.handle("list_projects", () => {
    return appState.projects;
  });

  ipcMain.handle("add_project", (_e, projectPath: string) => {
    // Check if already added
    if (appState.projects.find((p) => p.path === projectPath)) {
      throw new Error("Project already added");
    }

    const projectType = detectProjectType(projectPath);
    const applicationId = parseApplicationId(projectPath, projectType);
    const name = projectPath.split(/[\\/]/).pop() || projectPath;

    const project = { path: projectPath, name, applicationId, projectType };
    appState.projects.push(project);
    return project;
  });

  ipcMain.handle("remove_project", (_e, projectPath: string) => {
    const idx = appState.projects.findIndex((p) => p.path === projectPath);
    if (idx >= 0) appState.projects.splice(idx, 1);
    return "ok";
  });

  // =========================================================================
  // Companion Server
  // =========================================================================

  ipcMain.handle("get_companion_config", () => {
    return appState.companionConfig;
  });

  ipcMain.handle("start_companion_server", async (_e, port: number, apiKey: string) => {
    await companionServer.startCompanionServer(port, apiKey);
    return { port, running: true };
  });

  ipcMain.handle("stop_companion_server", () => {
    companionServer.stopCompanionServer();
    return { running: false };
  });

  // =========================================================================
  // Native dialogs
  // =========================================================================

  ipcMain.handle("show_open_dialog", async (_e, options: Electron.OpenDialogOptions) => {
    const mainWindow = getMainWindow();
    if (!mainWindow) throw new Error("No main window");
    const result = await dialog.showOpenDialog(mainWindow, options);
    return result.canceled ? null : result.filePaths[0] ?? null;
  });

  // =========================================================================
  // Play Store Publishing
  // =========================================================================

  ipcMain.handle("playstore_get_state", () => {
    return playStore.getPublishState();
  });

  ipcMain.handle("playstore_reset", () => {
    playStore.resetPublishState();
    return { success: true };
  });

  ipcMain.handle("playstore_analyze", async (_e, projectPath: string) => {
    const safeProjectPath = assertString(projectPath, "projectPath", 500);
    const projectType = detectProjectType(safeProjectPath);
    const mainWindow = getMainWindow();
    const result = await playStore.runAnalyzeOnly(
      safeProjectPath,
      projectType,
      mainWindow,
      appState.eventBus
    );
    return result;
  });

  ipcMain.handle(
    "playstore_generate_assets",
    async (
      _e,
      projectPath: string,
      serial: string | null,
      options?: Partial<AssetGenerationOptions>
    ) => {
      const safeProjectPath = assertString(projectPath, "projectPath", 500);
      const safeSerial = assertOptionalString(serial, "serial", 100);
      const assetOptions = normalizeAssetOptions(options);
      const projectType = detectProjectType(safeProjectPath);
      const mainWindow = getMainWindow();
      const assets = await playStore.runGenerateAssetsOnly(
        safeProjectPath,
        projectType,
        safeSerial,
        assetOptions,
        mainWindow,
        appState.eventBus
      );
      return assets;
    }
  );

  ipcMain.handle("playstore_connect_browser", async (_e, chromePort: number) => {
    const safePort = assertPort(chromePort, "chromePort");
    const mainWindow = getMainWindow();
    const connected = await playStore.runConnectBrowserOnly(
      safePort,
      mainWindow,
      appState.eventBus
    );
    return { connected };
  });

  ipcMain.handle(
    "playstore_publish",
    async (
      _e,
      opts: {
        projectPath: string;
        serial: string | null;
        configOverrides: Partial<PlayStoreConfig>;
        assetOptions?: Partial<AssetGenerationOptions>;
        chromePort: number;
      }
    ) => {
      const safeProjectPath = assertString(opts.projectPath, "projectPath", 500);
      const safeSerial = assertOptionalString(opts.serial, "serial", 100);
      const safePort = assertPort(opts.chromePort, "chromePort");
      const assetOptions = normalizeAssetOptions(opts.assetOptions);
      const projectType = detectProjectType(safeProjectPath);
      const mainWindow = getMainWindow();
      await playStore.publishToPlayStore(
        safeProjectPath,
        projectType,
        safeSerial,
        opts.configOverrides,
        assetOptions,
        safePort,
        mainWindow,
        appState.eventBus
      );
      return { success: true };
    }
  );

  ipcMain.handle(
    "playstore_record_demo",
    async (
      _e,
      opts: {
        serial: string;
        projectPath: string;
        durationSeconds?: number;
        orientation?: VideoOrientation;
      }
    ) => {
      const serial = assertString(opts.serial, "serial", 100);
      const projectPath = assertString(opts.projectPath, "projectPath", 500);
      const duration =
        typeof opts.durationSeconds === "number" && Number.isFinite(opts.durationSeconds)
          ? Math.max(5, Math.min(180, Math.floor(opts.durationSeconds)))
          : 30;
      const orientation: VideoOrientation =
        opts.orientation === "landscape" ||
        opts.orientation === "portrait" ||
        opts.orientation === "auto"
          ? opts.orientation
          : "auto";

      const outputDir = path.join(projectPath, ".blitz", "playstore-assets", "video");
      return playStore.runRecordDemoOnly(serial, outputDir, duration, orientation);
    }
  );

  ipcMain.handle("playstore_get_asset_defaults", () => {
    return playStore.getAssetDefaults();
  });

  ipcMain.handle("genai_get_config", () => {
    return playStore.getGenAiSettings();
  });

  ipcMain.handle("genai_set_config", (_e, update: GenAiConfigUpdate) => {
    const safe: GenAiConfigUpdate = {};
    if (update && typeof update === "object") {
      if (update.provider !== undefined) {
        const allowed = [
          "openrouter",
          "groq",
          "openai",
          "anthropic",
          "google",
          "together",
          "fireworks",
          "deepseek",
          "xai",
          "mistral",
          "perplexity",
          "custom",
        ] as const;
        if (!allowed.includes(update.provider)) {
          throw new Error("Invalid GenAI provider");
        }
        safe.provider = update.provider;
      }
      if (update.model !== undefined) safe.model = assertString(update.model, "model", 200);
      if (update.baseUrl !== undefined) safe.baseUrl = assertString(update.baseUrl, "baseUrl", 500);
      if (update.temperature !== undefined) {
        if (typeof update.temperature !== "number" || !Number.isFinite(update.temperature)) {
          throw new Error("temperature must be a number");
        }
        safe.temperature = Math.max(0, Math.min(1, update.temperature));
      }
      if (update.enabled !== undefined) safe.enabled = assertBoolean(update.enabled, "enabled");
      if (update.systemPrompt !== undefined) {
        safe.systemPrompt = assertString(update.systemPrompt, "systemPrompt", 8000);
      }
      if (update.apiKey !== undefined) {
        if (typeof update.apiKey !== "string") throw new Error("apiKey must be a string");
        safe.apiKey = update.apiKey;
      }
    }
    return playStore.updateGenAiSettings(safe);
  });

  ipcMain.handle(
    "genai_review_text",
    async (
      _e,
      opts: {
        inputText: string;
        instruction: string;
      }
    ) => {
      const inputText = assertString(opts.inputText, "inputText", 20000);
      const instruction = assertString(opts.instruction, "instruction", 4000);
      return playStore.reviewTextWithAi(inputText, instruction);
    }
  );

  ipcMain.handle(
    "genai_generate_store_draft",
    async (
      _e,
      opts: {
        projectPath: string;
        userPrompt: string;
        existingConfig: PlayStoreConfig | null;
      }
    ) => {
      const projectPath = assertString(opts.projectPath, "projectPath", 500);
      const userPrompt = assertString(opts.userPrompt, "userPrompt", 4000);
      const projectType = detectProjectType(projectPath);

      return playStore.generateStoreDraftWithAi(
        projectPath,
        projectType,
        userPrompt,
        opts.existingConfig || null
      );
    }
  );

  ipcMain.handle("ui_automation_get_state", () => {
    return uiAutomation.getUiAutomationState();
  });

  ipcMain.handle("ui_automation_pause", () => {
    return uiAutomation.pauseUiAutomation();
  });

  ipcMain.handle("ui_automation_resume", () => {
    return uiAutomation.resumeUiAutomation();
  });

  ipcMain.handle("ui_automation_stop", () => {
    return uiAutomation.stopUiAutomation();
  });

  ipcMain.handle(
    "ui_automation_run",
    async (
      _e,
      opts: {
        projectPath: string;
        serial: string;
        packageName: string;
        instruction: string;
        maxSteps?: number;
        actionDelayMs?: number;
        maxActionsPerScreen?: number;
        captureVideo?: boolean;
        videoDurationSeconds?: number;
        enableOcr?: boolean;
        logcatLinesPerStep?: number;
      }
    ) => {
      const projectPath = assertString(opts.projectPath, "projectPath", 500);
      const serial = assertSerial(opts.serial, "serial");
      const packageName = assertPackageName(opts.packageName, "packageName");
      const instruction = assertString(opts.instruction, "instruction", 4000);

      const request = uiAutomation.createAutomationRequest({
        projectPath,
        serial,
        packageName,
        instruction,
        maxSteps:
          typeof opts.maxSteps === "number" && Number.isFinite(opts.maxSteps)
            ? opts.maxSteps
            : 80,
        actionDelayMs:
          typeof opts.actionDelayMs === "number" && Number.isFinite(opts.actionDelayMs)
            ? opts.actionDelayMs
            : 900,
        maxActionsPerScreen:
          typeof opts.maxActionsPerScreen === "number" && Number.isFinite(opts.maxActionsPerScreen)
            ? opts.maxActionsPerScreen
            : 8,
        captureVideo: opts.captureVideo === undefined ? true : assertBoolean(opts.captureVideo, "captureVideo"),
        videoDurationSeconds:
          typeof opts.videoDurationSeconds === "number" && Number.isFinite(opts.videoDurationSeconds)
            ? opts.videoDurationSeconds
            : 90,
        enableOcr: opts.enableOcr === undefined ? true : assertBoolean(opts.enableOcr, "enableOcr"),
        logcatLinesPerStep:
          typeof opts.logcatLinesPerStep === "number" && Number.isFinite(opts.logcatLinesPerStep)
            ? opts.logcatLinesPerStep
            : 60,
      });

      const mainWindow = getMainWindow();
      return uiAutomation.runUiAutomation(
        request,
        appState.sdkConfig.adbPath,
        mainWindow,
        appState.eventBus
      );
    }
  );
}
