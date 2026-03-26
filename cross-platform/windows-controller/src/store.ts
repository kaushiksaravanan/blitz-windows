// =============================================================================
// Blitz Windows Controller — Zustand State Store
// =============================================================================
// Central state management using Zustand. All operations go through Electron
// IPC to the main process backend services.
// =============================================================================

import { create } from "zustand";

// =============================================================================
// Types (matches src-electron/services/types.ts)
// =============================================================================

export interface SdkConfig {
  androidSdkPath: string;
  javaHome: string;
  adbPath: string;
  emulatorPath: string;
  flutterSdkPath: string;
}

export interface CompanionConfig {
  port: number;
  apiKey: string;
  running: boolean;
}

export interface AdbRepairResult {
  success: boolean;
  adbPath: string;
  message: string;
  details: string[];
  devicesFound: number;
}

export interface AdbDiagnosticsResult {
  adbPath: string;
  version: string;
  devicesFound: number;
  details: string[];
  rawDevices: string[];
}

export interface EmulatorDiagnosticsResult {
  emulatorPath: string;
  version: string;
  avdCount: number;
  avdNames: string[];
  details: string[];
}

export interface SdkToolValidationResult {
  checkedAt: string;
  adbPath: string;
  adbPathStatus: "exists" | "missing" | "lookup";
  emulatorPath: string;
  emulatorPathStatus: "exists" | "missing" | "lookup";
  javaHome: string;
  javaHomeStatus: "exists" | "missing";
  javaBin: string;
  javaBinStatus: "exists" | "missing";
  flutterSdkPath: string;
  flutterSdkPathStatus: "exists" | "missing";
  flutterBin: string;
  flutterBinStatus: "exists" | "missing";
}

export interface AdbDevice {
  serial: string;
  status: string;
  model: string;
  product: string;
  transportId: string;
  deviceType: string;
  androidVersion: string;
  apiLevel: number;
  isEmulator: boolean;
}

export interface AvdInfo {
  name: string;
  device: string;
  target: string;
  apiLevel: number;
  abi: string;
  path: string;
  running: boolean;
  serial: string | null;
}

export type BuildPhase = "compiling" | "linking" | "complete" | "failed" | "cancelled";
export type ProjectType = "android-native" | "flutter" | "react-native" | "unknown";

export interface BuildInfo {
  id: string;
  projectPath: string;
  task: string;
  phase: BuildPhase;
  progress: number;
  startedAt: string;
  finishedAt: string | null;
  outputApk: string | null;
  logs: string[];
  error: string | null;
}

export interface ProjectInfo {
  path: string;
  name: string;
  applicationId: string;
  projectType: ProjectType;
}

// =============================================================================
// Play Store Publishing Types
// =============================================================================

export interface PlayStoreConfig {
  packageName: string;
  appTitle: string;
  shortDescription: string;
  fullDescription: string;
  category: string;
  contactEmail: string;
  contactPhone: string;
  contactWebsite: string;
  privacyPolicyUrl: string;
  defaultLanguage: string;
  isFree: boolean;
  containsAds: boolean;
  targetAudience: "everyone" | "older-users" | "mixed";
}

export interface PlayStoreAssets {
  iconPath: string | null;
  featureGraphicPath: string | null;
  screenshotPaths: string[];
  demoVideoPath: string | null;
  templatePreset?: ScreenshotTemplatePreset;
}

export type ScreenshotTemplatePreset =
  | "clean-device"
  | "gradient-hero"
  | "minimal-light"
  | "store-spotlight"
  | "launchpad-pro"
  | "localized-story";

export type VideoOrientation = "auto" | "portrait" | "landscape";

export interface AssetGenerationOptions {
  screenshotCount: number;
  templatePreset: ScreenshotTemplatePreset;
  locale: string;
  headline: string;
  subheadline: string;
  includeDeviceFrame: boolean;
  videoDurationSeconds: number;
  videoOrientation: VideoOrientation;
}

export type GenAiProvider =
  | "openrouter"
  | "groq"
  | "openai"
  | "anthropic"
  | "google"
  | "together"
  | "fireworks"
  | "deepseek"
  | "xai"
  | "mistral"
  | "perplexity"
  | "custom";

export interface GenAiConfig {
  provider: GenAiProvider;
  model: string;
  baseUrl: string;
  temperature: number;
  enabled: boolean;
  systemPrompt: string;
  hasApiKey: boolean;
  apiKeyPreview: string;
}

export interface GenAiConfigUpdate {
  provider?: GenAiProvider;
  model?: string;
  baseUrl?: string;
  temperature?: number;
  enabled?: boolean;
  systemPrompt?: string;
  apiKey?: string;
}

export interface GenAiDraft {
  provider: GenAiProvider;
  model: string;
  systemPrompt: string;
  userPrompt: string;
  outputJson: string;
  config: PlayStoreConfig;
}

export interface GenAiTextReview {
  provider: GenAiProvider;
  model: string;
  instruction: string;
  inputText: string;
  outputText: string;
  rawOutput: string;
}

export type PlayStorePhase =
  | "idle"
  | "analyzing"
  | "generating-content"
  | "generating-screenshots"
  | "generating-feature-graphic"
  | "generating-video"
  | "connecting-browser"
  | "creating-app"
  | "filling-listing"
  | "filling-content-rating"
  | "filling-app-content"
  | "uploading-assets"
  | "uploading-build"
  | "submitting"
  | "complete"
  | "error";

export interface PlayStoreState {
  phase: PlayStorePhase;
  progress: number;
  currentStep: string;
  config: PlayStoreConfig | null;
  assets: PlayStoreAssets | null;
  analysis: unknown | null;
  error: string | null;
  logs: string[];
  browserConnected: boolean;
}

export interface DemoRecordResult {
  videoPath: string | null;
  durationSeconds: number;
  orientation: VideoOrientation;
}

export interface UiAutomationAction {
  id: string;
  text: string;
  contentDesc: string;
  resourceId: string;
  className: string;
  bounds: string;
  centerX: number;
  centerY: number;
  score: number;
}

export interface UiAutomationScreenNode {
  id: string;
  hash: string;
  discoveredAtStep: number;
  visitCount: number;
  activity: string;
  actions: UiAutomationAction[];
  ocrTextSample: string;
}

export interface UiAutomationEdge {
  fromScreenId: string;
  toScreenId: string;
  step: number;
  actionId: string;
  actionLabel: string;
  treeChanged: boolean;
}

export interface UiAutomationRunState {
  phase: "idle" | "running" | "paused" | "stopped" | "complete" | "error";
  progress: number;
  currentStep: string;
  startedAt: string | null;
  finishedAt: string | null;
  error: string | null;
}

export interface UiAutomationRunResult {
  serial: string;
  packageName: string;
  instruction: string;
  startedAt: string;
  finishedAt: string;
  totalSteps: number;
  exploredActions: number;
  discoveredScreens: number;
  treeChangeCount: number;
  graphPath: string;
  eventLogPath: string;
  summaryPath: string;
  outputDir: string;
  videoPath: string | null;
  ocrEngine: "tesseract" | "uiautomator";
  finalPhase: "complete" | "stopped" | "error";
  stoppedByUser: boolean;
  notes: string[];
}

export interface UiAutomationRunOptions {
  projectPath: string;
  serial: string;
  packageName: string;
  instruction: string;
  maxSteps: number;
  actionDelayMs: number;
  maxActionsPerScreen: number;
  captureVideo: boolean;
  videoDurationSeconds: number;
  enableOcr: boolean;
  logcatLinesPerStep: number;
}

// =============================================================================
// Tab Navigation
// =============================================================================

export type ActiveTab =
  | "dashboard"
  | "devices"
  | "emulators"
  | "builds"
  | "logcat"
  | "apk-manager"
  | "projects"
  | "publish"
  | "automation"
  | "settings";

// =============================================================================
// IPC Helper — typed wrapper around window.electronAPI.invoke
// =============================================================================

async function ipc<T = unknown>(channel: string, ...args: unknown[]): Promise<T> {
  return window.electronAPI.invoke(channel, ...args) as Promise<T>;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return String(error);
}

// =============================================================================
// Store Interface
// =============================================================================

interface BlitzState {
  // Initialization
  initialized: boolean;
  initError: string | null;

  // Navigation
  activeTab: ActiveTab;

  // SDK Config
  sdkConfig: SdkConfig | null;

  // Devices (ADB)
  devices: AdbDevice[];
  selectedDeviceSerial: string | null;
  deviceScreenshot: string | null;
  devicesLoading: boolean;
  devicesError: string | null;

  // AVDs (Emulators)
  avds: AvdInfo[];
  avdsLoading: boolean;
  avdsError: string | null;

  // Builds (Gradle / Flutter / React Native)
  builds: BuildInfo[];
  activeBuildId: string | null;
  buildLogs: string[];
  buildLoading: boolean;

  // Logcat
  logcatLines: string[];
  logcatSerial: string | null;
  logcatLoading: boolean;
  logcatError: string | null;

  // Packages (APK)
  packages: string[];
  packagesSerial: string | null;
  packagesLoading: boolean;
  packagesError: string | null;

  // Projects
  projects: ProjectInfo[];
  activeProjectId: string | null;
  projectsLoading: boolean;

  // Companion Server
  companionConfig: CompanionConfig | null;
  companionRunning: boolean;

  // Play Store Publishing
  playstoreState: PlayStoreState;
  playstoreLogs: string[];
  playstoreAssetOptions: AssetGenerationOptions;
  genAiConfig: GenAiConfig | null;
  debugMode: boolean;

  // UI Automation Testing
  uiAutomationState: UiAutomationRunState;
  uiAutomationLogs: string[];
  uiAutomationLastResult: UiAutomationRunResult | null;

  // Event listener cleanup
  _unlistenBuildLog: (() => void) | null;
  _unlistenBuildStatus: (() => void) | null;
  _unlistenPlaystoreState: (() => void) | null;
  _unlistenPlaystoreLog: (() => void) | null;
  _unlistenUiAutomationState: (() => void) | null;
  _unlistenUiAutomationLog: (() => void) | null;

  // Actions
  initialize: () => Promise<void>;
  setActiveTab: (tab: ActiveTab) => void;

  // SDK
  loadSdkConfig: () => Promise<void>;
  setSdkConfig: (sdkPath: string, javaHome: string, flutterSdkPath?: string) => Promise<void>;

  // Devices
  loadDevices: () => Promise<void>;
  selectDevice: (serial: string | null) => void;
  takeScreenshot: (serial: string) => Promise<void>;
  sendDeviceInput: (
    serial: string,
    action: string,
    params?: {
      x?: number;
      y?: number;
      toX?: number;
      toY?: number;
      text?: string;
      keyCode?: number;
      duration?: number;
    }
  ) => Promise<string>;

  // AVDs
  loadAvds: () => Promise<void>;
  startAvd: (name: string, coldBoot?: boolean) => Promise<void>;
  stopAvd: (serial: string) => Promise<void>;

  // Builds
  startBuild: (
    projectPath: string,
    task: string,
    extraArgs?: string[]
  ) => Promise<void>;
  getBuildStatus: (buildId: string) => Promise<BuildInfo | null>;

  // Logcat
  loadLogcat: (serial: string, lines?: number) => Promise<void>;
  clearLogcat: (serial: string) => Promise<void>;

  // APK / Packages
  installApk: (serial: string, apkPath: string, reinstall?: boolean) => Promise<void>;
  uninstallPackage: (serial: string, packageName: string) => Promise<void>;
  loadPackages: (serial: string) => Promise<void>;

  // Projects
  loadProjects: () => Promise<void>;
  addProject: (path: string) => Promise<void>;
  removeProject: (projectPath: string) => Promise<void>;
  setActiveProject: (id: string | null) => void;

  // Companion
  loadCompanionConfig: () => Promise<void>;
  startCompanionServer: (port: number, apiKey: string) => Promise<void>;
  stopCompanionServer: () => Promise<void>;
  repairAdb: () => Promise<AdbRepairResult>;
  getAdbDiagnostics: () => Promise<AdbDiagnosticsResult>;
  getEmulatorDiagnostics: () => Promise<EmulatorDiagnosticsResult>;
  validateSdkTools: () => Promise<SdkToolValidationResult>;

  // Play Store
  playstoreAnalyze: (projectPath: string) => Promise<void>;
  playstoreGenerateAssets: (
    projectPath: string,
    serial: string | null,
    options?: Partial<AssetGenerationOptions>
  ) => Promise<void>;
  playstoreRecordDemo: (
    projectPath: string,
    serial: string,
    durationSeconds: number,
    orientation: VideoOrientation
  ) => Promise<DemoRecordResult>;
  playstoreConnectBrowser: (chromePort: number) => Promise<void>;
  playstorePublish: (
    projectPath: string,
    serial: string | null,
    configOverrides: Partial<PlayStoreConfig>,
    assetOptions: Partial<AssetGenerationOptions>,
    chromePort: number
  ) => Promise<void>;
  playstoreReset: () => void;
  loadAssetDefaults: () => Promise<void>;
  setAssetOptions: (updates: Partial<AssetGenerationOptions>) => void;
  loadGenAiConfig: () => Promise<void>;
  setGenAiConfig: (update: GenAiConfigUpdate) => Promise<void>;
  generateStoreDraftWithAi: (
    projectPath: string,
    userPrompt: string,
    existingConfig: PlayStoreConfig | null
  ) => Promise<GenAiDraft>;
  reviewTextWithAi: (inputText: string, instruction: string) => Promise<GenAiTextReview>;
  setDebugMode: (enabled: boolean) => void;

  // UI Automation Testing
  loadUiAutomationState: () => Promise<void>;
  runUiAutomationTest: (options: UiAutomationRunOptions) => Promise<UiAutomationRunResult>;
  pauseUiAutomationTest: () => Promise<void>;
  resumeUiAutomationTest: () => Promise<void>;
  stopUiAutomationTest: () => Promise<void>;
}

// =============================================================================
// Store
// =============================================================================

export const useBlitzStore = create<BlitzState>((set, get) => ({
  // Initial state
  initialized: false,
  initError: null,
  activeTab: "dashboard",
  sdkConfig: null,
  devices: [],
  selectedDeviceSerial: null,
  deviceScreenshot: null,
  devicesLoading: false,
  devicesError: null,
  avds: [],
  avdsLoading: false,
  avdsError: null,
  builds: [],
  activeBuildId: null,
  buildLogs: [],
  buildLoading: false,
  logcatLines: [],
  logcatSerial: null,
  logcatLoading: false,
  logcatError: null,
  packages: [],
  packagesSerial: null,
  packagesLoading: false,
  packagesError: null,
  projects: [],
  activeProjectId: null,
  projectsLoading: false,
  companionConfig: null,
  companionRunning: false,

  // Play Store Publishing
  playstoreState: {
    phase: "idle",
    progress: 0,
    currentStep: "",
    config: null,
    assets: null,
    analysis: null,
    error: null,
    logs: [],
    browserConnected: false,
  },
  playstoreLogs: [],
  playstoreAssetOptions: {
    screenshotCount: 4,
    templatePreset: "launchpad-pro",
    locale: "en-US",
    headline: "Built for Android",
    subheadline: "Fast setup, clean workflow",
    includeDeviceFrame: true,
    videoDurationSeconds: 30,
    videoOrientation: "auto",
  },
  genAiConfig: null,
  debugMode: false,
  uiAutomationState: {
    phase: "idle",
    progress: 0,
    currentStep: "",
    startedAt: null,
    finishedAt: null,
    error: null,
  },
  uiAutomationLogs: [],
  uiAutomationLastResult: null,
  _unlistenBuildLog: null,
  _unlistenBuildStatus: null,
  _unlistenPlaystoreState: null,
  _unlistenPlaystoreLog: null,
  _unlistenUiAutomationState: null,
  _unlistenUiAutomationLog: null,

  // --------------------------------------------------------------------------
  // Initialization — load SDK config and initial data
  // --------------------------------------------------------------------------

  initialize: async () => {
    // Reset state at start of initialization (supports retry)
    set({ initialized: false, initError: null });

    try {
      // Clean up old listeners before re-registering (prevents duplicates on retry)
      const prev = get();
      prev._unlistenBuildLog?.();
      prev._unlistenBuildStatus?.();
      prev._unlistenPlaystoreState?.();
      prev._unlistenPlaystoreLog?.();
      prev._unlistenUiAutomationState?.();
      prev._unlistenUiAutomationLog?.();

      const sdkConfig = await ipc<SdkConfig>("get_sdk_config");
      set({ sdkConfig, initialized: true, initError: null });

      // Set up build log listener — scoped to activeBuildId
      const unlistenBuildLog = window.electronAPI.on("build-log", (data: unknown) => {
        const { buildId, line } = data as { buildId: string; line: string };
        const state = get();
        if (state.activeBuildId === buildId) {
          set({ buildLogs: [...state.buildLogs, line] });
        }
        // Also store in BuildInfo.logs
        set((s) => ({
          builds: s.builds.map((b) =>
            b.id === buildId ? { ...b, logs: [...b.logs, line] } : b
          ),
        }));
      });

      // Set up build status listener (push events for completion/failure)
      const unlistenBuildStatus = window.electronAPI.on("build-status", (data: unknown) => {
        const info = data as BuildInfo;
        set((s) => ({
          builds: s.builds.map((b) => (b.id === info.id ? info : b)),
        }));
      });

      // Set up Play Store event listeners
      const unlistenPsState = window.electronAPI.on(
        "playstore-state",
        (state: unknown) => {
          set({ playstoreState: state as PlayStoreState });
        }
      );

      const unlistenPsLog = window.electronAPI.on(
        "playstore-log",
        (line: unknown) => {
          set((s) => ({
            playstoreLogs: [...s.playstoreLogs, line as string],
          }));
        }
      );

      const unlistenUiAutomationState = window.electronAPI.on(
        "ui-automation-state",
        (state: unknown) => {
          set({ uiAutomationState: state as UiAutomationRunState });
        }
      );

      const unlistenUiAutomationLog = window.electronAPI.on(
        "ui-automation-log",
        (line: unknown) => {
          set((s) => ({
            uiAutomationLogs: [...s.uiAutomationLogs, line as string],
          }));
        }
      );

      set({
        _unlistenBuildLog: unlistenBuildLog,
        _unlistenBuildStatus: unlistenBuildStatus,
        _unlistenPlaystoreState: unlistenPsState,
        _unlistenPlaystoreLog: unlistenPsLog,
        _unlistenUiAutomationState: unlistenUiAutomationState,
        _unlistenUiAutomationLog: unlistenUiAutomationLog,
      });

      // Load initial data in parallel
      const {
        loadDevices,
        loadAvds,
        loadProjects,
        loadCompanionConfig,
        loadAssetDefaults,
        loadGenAiConfig,
        loadUiAutomationState,
      } = get();
      await Promise.allSettled([
        loadDevices(),
        loadAvds(),
        loadProjects(),
        loadCompanionConfig(),
        loadAssetDefaults(),
        loadGenAiConfig(),
        loadUiAutomationState(),
      ]);
    } catch (error) {
      set({
        initialized: true,
        initError: error instanceof Error ? error.message : String(error),
      });
    }
  },

  // --------------------------------------------------------------------------
  // Navigation
  // --------------------------------------------------------------------------

  setActiveTab: (tab) => set({ activeTab: tab }),

  // --------------------------------------------------------------------------
  // SDK Config
  // --------------------------------------------------------------------------

  loadSdkConfig: async () => {
    try {
      const sdkConfig = await ipc<SdkConfig>("get_sdk_config");
      set({ sdkConfig });
    } catch (e) {
      console.error("Failed to load SDK config:", e);
    }
  },

  setSdkConfig: async (sdkPath, javaHome, flutterSdkPath) => {
    try {
      await ipc("set_sdk_config", {
        androidSdkPath: sdkPath,
        javaHome,
        flutterSdkPath: flutterSdkPath ?? "",
      });
      // Reload the full config (includes derived paths like adbPath)
      const sdkConfig = await ipc<SdkConfig>("get_sdk_config");
      set({ sdkConfig });
    } catch (e) {
      console.error("Failed to set SDK config:", e);
    }
  },

  // --------------------------------------------------------------------------
  // Devices (ADB)
  // --------------------------------------------------------------------------

  loadDevices: async () => {
    set({ devicesLoading: true, devicesError: null });
    try {
      const devices = await ipc<AdbDevice[]>("list_devices");
      set({ devices, devicesLoading: false, devicesError: null });
    } catch (e) {
      console.error("Failed to load devices:", e);
      set({ devicesLoading: false, devicesError: getErrorMessage(e) });
    }
  },

  selectDevice: (serial) => set({ selectedDeviceSerial: serial }),

  takeScreenshot: async (serial) => {
    try {
      const base64 = await ipc<string>("take_screenshot", serial);
      set({ deviceScreenshot: `data:image/png;base64,${base64}` });
    } catch (e) {
      console.error("Failed to take screenshot:", e);
    }
  },

  sendDeviceInput: async (serial, action, params = {}) => {
    try {
      const result = await ipc<string>("device_input", {
        serial,
        action,
        x: params.x ?? null,
        y: params.y ?? null,
        toX: params.toX ?? null,
        toY: params.toY ?? null,
        text: params.text ?? null,
        keyCode: params.keyCode ?? null,
        duration: params.duration ?? null,
      });
      return result;
    } catch (e) {
      console.error("Failed to send device input:", e);
      throw e;
    }
  },

  // --------------------------------------------------------------------------
  // AVDs (Emulators)
  // --------------------------------------------------------------------------

  loadAvds: async () => {
    set({ avdsLoading: true, avdsError: null });
    try {
      const avds = await ipc<AvdInfo[]>("list_avds");
      set({ avds, avdsLoading: false, avdsError: null });
    } catch (e) {
      console.error("Failed to load AVDs:", e);
      set({ avdsLoading: false, avdsError: getErrorMessage(e) });
    }
  },

  startAvd: async (name, coldBoot = false) => {
    try {
      await ipc<string>("start_avd", name, coldBoot);
      // Refresh AVD list after a delay (emulator takes time to boot)
      setTimeout(() => get().loadAvds(), 3000);
    } catch (e) {
      console.error("Failed to start AVD:", e);
      throw e;
    }
  },

  stopAvd: async (serial) => {
    try {
      await ipc("stop_avd", serial);
      await get().loadAvds();
    } catch (e) {
      console.error("Failed to stop AVD:", e);
      throw e;
    }
  },

  // --------------------------------------------------------------------------
  // Builds (Gradle / Flutter / React Native)
  // --------------------------------------------------------------------------

  startBuild: async (projectPath, task, extraArgs) => {
    set({ buildLogs: [], buildLoading: true });
    try {
      const result = await ipc<{ buildId: string; projectPath: string; task: string; projectType: ProjectType; message: string }>(
        "start_build",
        projectPath,
        task,
        extraArgs ?? null
      );
      const buildInfo: BuildInfo = {
        id: result.buildId,
        projectPath: result.projectPath,
        task: result.task,
        phase: "compiling",
        progress: 0,
        startedAt: new Date().toISOString(),
        finishedAt: null,
        outputApk: null,
        logs: [],
        error: null,
      };
      set((state) => ({
        builds: [...state.builds, buildInfo],
        activeBuildId: result.buildId,
        buildLoading: false,
      }));
    } catch (e) {
      console.error("Failed to start build:", e);
      set({ buildLoading: false });
      throw e;
    }
  },

  getBuildStatus: async (buildId) => {
    try {
      const info = await ipc<BuildInfo | null>("get_build_status", buildId);
      if (info) {
        set((state) => ({
          builds: state.builds.map((b) => (b.id === info.id ? info : b)),
        }));
      }
      return info;
    } catch (e) {
      console.error("Failed to get build status:", e);
      return null;
    }
  },

  // --------------------------------------------------------------------------
  // Logcat
  // --------------------------------------------------------------------------

  loadLogcat: async (serial, lines = 500) => {
    set({ logcatLoading: true, logcatSerial: serial, logcatError: null });
    try {
      const logLines = await ipc<string[]>("get_logcat", serial, lines);
      set({ logcatLines: logLines, logcatLoading: false, logcatError: null });
    } catch (e) {
      console.error("Failed to load logcat:", e);
      set({ logcatLoading: false, logcatError: getErrorMessage(e) });
    }
  },

  clearLogcat: async (serial) => {
    try {
      await ipc("clear_logcat", serial);
      set({ logcatLines: [], logcatError: null });
    } catch (e) {
      console.error("Failed to clear logcat:", e);
      set({ logcatError: getErrorMessage(e) });
    }
  },

  // --------------------------------------------------------------------------
  // APK / Package Management
  // --------------------------------------------------------------------------

  installApk: async (serial, apkPath, reinstall = false) => {
    try {
      await ipc<string>("install_apk", serial, apkPath, reinstall);
    } catch (e) {
      console.error("Failed to install APK:", e);
      throw e;
    }
  },

  uninstallPackage: async (serial, packageName) => {
    try {
      await ipc<string>("uninstall_package", serial, packageName);
      // Refresh package list
      await get().loadPackages(serial);
    } catch (e) {
      console.error("Failed to uninstall package:", e);
      throw e;
    }
  },

  loadPackages: async (serial) => {
    set({ packagesLoading: true, packagesSerial: serial, packagesError: null });
    try {
      const packages = await ipc<string[]>("list_packages", serial);
      set({ packages, packagesLoading: false, packagesError: null });
    } catch (e) {
      console.error("Failed to load packages:", e);
      set({ packagesLoading: false, packagesError: getErrorMessage(e) });
    }
  },

  // --------------------------------------------------------------------------
  // Projects
  // --------------------------------------------------------------------------

  loadProjects: async () => {
    set({ projectsLoading: true });
    try {
      const projects = await ipc<ProjectInfo[]>("list_projects");
      set({ projects, projectsLoading: false });
    } catch (e) {
      console.error("Failed to load projects:", e);
      set({ projectsLoading: false });
    }
  },

  addProject: async (projectPath) => {
    try {
      const project = await ipc<ProjectInfo>("add_project", projectPath);
      set((state) => ({ projects: [...state.projects, project] }));
    } catch (e) {
      console.error("Failed to add project:", e);
      throw e;
    }
  },

  removeProject: async (projectPath) => {
    try {
      await ipc("remove_project", projectPath);
      set((state) => ({
        projects: state.projects.filter((p) => p.path !== projectPath),
        activeProjectId:
          state.activeProjectId === projectPath ? null : state.activeProjectId,
      }));
    } catch (e) {
      console.error("Failed to remove project:", e);
      throw e;
    }
  },

  setActiveProject: (id) => set({ activeProjectId: id }),

  // --------------------------------------------------------------------------
  // Companion Server
  // --------------------------------------------------------------------------

  loadCompanionConfig: async () => {
    try {
      const config = await ipc<CompanionConfig>("get_companion_config");
      set({ companionConfig: config, companionRunning: config.running });
    } catch (e) {
      console.error("Failed to load companion config:", e);
    }
  },

  startCompanionServer: async (port, apiKey) => {
    try {
      await ipc<{ port: number; running: boolean }>("start_companion_server", port, apiKey);
      set({
        companionConfig: { port, apiKey, running: true },
        companionRunning: true,
      });
    } catch (e) {
      console.error("Failed to start companion server:", e);
      throw e;
    }
  },

  stopCompanionServer: async () => {
    try {
      await ipc<{ running: boolean }>("stop_companion_server");
      set((s) => ({
        companionConfig: s.companionConfig
          ? { ...s.companionConfig, running: false }
          : null,
        companionRunning: false,
      }));
    } catch (e) {
      console.error("Failed to stop companion server:", e);
      throw e;
    }
  },

  repairAdb: async () => {
    const result = await ipc<AdbRepairResult>("repair_adb");
    // refresh device/emulator data after repair
    await Promise.allSettled([get().loadDevices(), get().loadAvds()]);
    return result;
  },

  getAdbDiagnostics: async () => {
    return ipc<AdbDiagnosticsResult>("adb_diagnostics");
  },

  getEmulatorDiagnostics: async () => {
    return ipc<EmulatorDiagnosticsResult>("emulator_diagnostics");
  },

  validateSdkTools: async () => {
    return ipc<SdkToolValidationResult>("validate_sdk_tools");
  },

  // --------------------------------------------------------------------------
  // Play Store Publishing
  // --------------------------------------------------------------------------

  playstoreAnalyze: async (projectPath) => {
    set({ playstoreLogs: [] });
    try {
      // Backend runAnalyzeOnly returns { analysis, config } — no assets at this stage
      const result = await ipc<{ analysis: unknown; config: PlayStoreConfig }>(
        "playstore_analyze",
        projectPath
      );
      set((s) => ({
        playstoreState: {
          ...s.playstoreState,
          config: result.config,
        },
      }));
    } catch (e) {
      console.error("Failed to analyze project for Play Store:", e);
      throw e;
    }
  },

  playstoreGenerateAssets: async (projectPath, serial, options) => {
    try {
      const assetOptions = { ...get().playstoreAssetOptions, ...(options || {}) };
      const assets = await ipc<PlayStoreAssets>(
        "playstore_generate_assets",
        projectPath,
        serial,
        assetOptions
      );
      set((s) => ({
        playstoreState: {
          ...s.playstoreState,
          assets,
        },
        playstoreAssetOptions: assetOptions,
      }));
    } catch (e) {
      console.error("Failed to generate Play Store assets:", e);
      throw e;
    }
  },

  playstoreRecordDemo: async (projectPath, serial, durationSeconds, orientation) => {
    const result = await ipc<DemoRecordResult>("playstore_record_demo", {
      projectPath,
      serial,
      durationSeconds,
      orientation,
    });

    if (result.videoPath) {
      set((s) => ({
        playstoreState: {
          ...s.playstoreState,
          assets: {
            iconPath: s.playstoreState.assets?.iconPath || null,
            featureGraphicPath: s.playstoreState.assets?.featureGraphicPath || null,
            screenshotPaths: s.playstoreState.assets?.screenshotPaths || [],
            demoVideoPath: result.videoPath,
            templatePreset: s.playstoreState.assets?.templatePreset,
          },
        },
      }));
    }

    return result;
  },

  playstoreConnectBrowser: async (chromePort) => {
    try {
      const result = await ipc<{ connected: boolean }>(
        "playstore_connect_browser",
        chromePort
      );
      set((s) => ({
        playstoreState: {
          ...s.playstoreState,
          browserConnected: result.connected,
        },
      }));
    } catch (e) {
      console.error("Failed to connect to Chrome browser:", e);
      throw e;
    }
  },

  playstorePublish: async (projectPath, serial, configOverrides, assetOptions, chromePort) => {
    try {
      await ipc("playstore_publish", {
        projectPath,
        serial,
        configOverrides,
        assetOptions,
        chromePort,
      });
    } catch (e) {
      console.error("Failed to publish to Play Store:", e);
      throw e;
    }
  },

  playstoreReset: () => {
    // Fire-and-forget reset on backend
    ipc("playstore_reset").catch((e) =>
      console.error("Failed to reset playstore state:", e)
    );
    set({
      playstoreState: {
        phase: "idle",
        progress: 0,
        currentStep: "",
        config: null,
        assets: null,
        analysis: null,
        error: null,
        logs: [],
        browserConnected: false,
      },
      playstoreLogs: [],
    });
  },

  loadAssetDefaults: async () => {
    try {
      const defaults = await ipc<AssetGenerationOptions>("playstore_get_asset_defaults");
      set({ playstoreAssetOptions: defaults });
    } catch (e) {
      console.error("Failed to load asset defaults:", e);
    }
  },

  setAssetOptions: (updates) => {
    set((s) => ({ playstoreAssetOptions: { ...s.playstoreAssetOptions, ...updates } }));
  },

  loadGenAiConfig: async () => {
    try {
      const cfg = await ipc<GenAiConfig>("genai_get_config");
      set({ genAiConfig: cfg });
    } catch (e) {
      console.error("Failed to load GenAI config:", e);
    }
  },

  setGenAiConfig: async (update) => {
    const cfg = await ipc<GenAiConfig>("genai_set_config", update);
    set({ genAiConfig: cfg });
  },

  generateStoreDraftWithAi: async (projectPath, userPrompt, existingConfig) => {
    return ipc<GenAiDraft>("genai_generate_store_draft", {
      projectPath,
      userPrompt,
      existingConfig,
    });
  },

  reviewTextWithAi: async (inputText, instruction) => {
    return ipc<GenAiTextReview>("genai_review_text", {
      inputText,
      instruction,
    });
  },

  setDebugMode: (enabled) => set({ debugMode: enabled }),

  // --------------------------------------------------------------------------
  // UI Automation Testing
  // --------------------------------------------------------------------------

  loadUiAutomationState: async () => {
    try {
      const state = await ipc<UiAutomationRunState>("ui_automation_get_state");
      set({ uiAutomationState: state });
    } catch (e) {
      console.error("Failed to load UI automation state:", e);
    }
  },

  runUiAutomationTest: async (options) => {
    set({ uiAutomationLogs: [] });
    try {
      const result = await ipc<UiAutomationRunResult>("ui_automation_run", options);
      set((s) => ({
        uiAutomationLastResult: result,
        uiAutomationState: {
          ...s.uiAutomationState,
          phase: result.finalPhase,
          progress: result.finalPhase === "complete" ? 100 : s.uiAutomationState.progress,
          currentStep:
            result.finalPhase === "complete"
              ? "Automation complete"
              : result.finalPhase === "stopped"
                ? "Stopped by user"
                : "Automation failed",
          finishedAt: result.finishedAt,
          error: result.finalPhase === "error" ? "Automation run ended with errors" : null,
        },
      }));
      return result;
    } catch (e) {
      const message = getErrorMessage(e);
      set((s) => ({
        uiAutomationState: {
          ...s.uiAutomationState,
          phase: "error",
          currentStep: "Automation failed",
          finishedAt: new Date().toISOString(),
          error: message,
        },
      }));
      throw e;
    }
  },

  pauseUiAutomationTest: async () => {
    const phase = get().uiAutomationState.phase;
    if (phase !== "running") return;
    try {
      await ipc("ui_automation_pause");
      set((s) => ({
        uiAutomationState: {
          ...s.uiAutomationState,
          phase: "paused",
          currentStep: "Paused",
          error: null,
        },
      }));
    } catch (e) {
      const message = getErrorMessage(e);
      set((s) => ({
        uiAutomationState: {
          ...s.uiAutomationState,
          error: message,
        },
      }));
      throw e;
    }
  },

  resumeUiAutomationTest: async () => {
    const phase = get().uiAutomationState.phase;
    if (phase !== "paused") return;
    try {
      await ipc("ui_automation_resume");
      set((s) => ({
        uiAutomationState: {
          ...s.uiAutomationState,
          phase: "running",
          currentStep: "Resuming automation",
          error: null,
        },
      }));
    } catch (e) {
      const message = getErrorMessage(e);
      set((s) => ({
        uiAutomationState: {
          ...s.uiAutomationState,
          error: message,
        },
      }));
      throw e;
    }
  },

  stopUiAutomationTest: async () => {
    const phase = get().uiAutomationState.phase;
    if (phase !== "running" && phase !== "paused") return;
    try {
      await ipc("ui_automation_stop");
      set((s) => ({
        uiAutomationState: {
          ...s.uiAutomationState,
          phase: "stopped",
          currentStep: "Stopping automation...",
          error: null,
        },
      }));
    } catch (e) {
      const message = getErrorMessage(e);
      set((s) => ({
        uiAutomationState: {
          ...s.uiAutomationState,
          error: message,
        },
      }));
      throw e;
    }
  },
}));
