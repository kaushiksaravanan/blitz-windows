// =============================================================================
// Blitz Windows Controller — Zustand State Store
// =============================================================================
// Central state management using Zustand. All operations are local Tauri
// commands (adb, emulator, gradle) — no remote worker connection needed.
// =============================================================================

import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

// =============================================================================
// Types (mirrors Rust structs from lib.rs)
// =============================================================================

export interface SdkConfig {
  android_sdk_path: string;
  java_home: string;
  flutter_sdk_path: string;
}

export interface CompanionConfig {
  port: number;
  api_key: string;
  enabled: boolean;
}

export interface AdbDevice {
  serial: string;
  type: string; // "device" | "emulator" | "unauthorized" | "offline"
  model: string;
  product: string;
  transport_id: string;
  android_version: string;
  api_level: number;
  is_emulator: boolean;
}

export interface AvdInfo {
  name: string;
  device: string;
  path: string;
  target: string;
  api_level: number;
  abi: string;
  is_running: boolean;
  running_serial: string | null;
}

export interface BuildInfo {
  id: string;
  project_path: string;
  task: string;
  phase: string;
  progress: number;
  started_at: string;
  finished_at: string | null;
  output_apk: string | null;
  logs: string[];
  error: string | null;
}

export interface ProjectInfo {
  id: string;
  name: string;
  path: string;
  application_id: string;
  project_type: string;
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
  | "settings";

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

  // AVDs (Emulators)
  avds: AvdInfo[];
  avdsLoading: boolean;

  // Builds (Gradle)
  builds: BuildInfo[];
  activeBuildId: string | null;
  buildLogs: string[];
  buildLoading: boolean;

  // Logcat
  logcatLines: string[];
  logcatSerial: string | null;
  logcatLoading: boolean;

  // Packages (APK)
  packages: string[];
  packagesSerial: string | null;
  packagesLoading: boolean;

  // Projects
  projects: ProjectInfo[];
  activeProjectId: string | null;
  projectsLoading: boolean;

  // Companion Server
  companionConfig: CompanionConfig | null;
  companionRunning: boolean;

  // Event listeners
  _unlistenBuildLog: UnlistenFn | null;

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
  addProject: (path: string, name?: string) => Promise<void>;
  removeProject: (id: string) => Promise<void>;
  setActiveProject: (id: string | null) => void;

  // Companion
  loadCompanionConfig: () => Promise<void>;
  startCompanionServer: (port: number, apiKey: string) => Promise<void>;
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
  avds: [],
  avdsLoading: false,
  builds: [],
  activeBuildId: null,
  buildLogs: [],
  buildLoading: false,
  logcatLines: [],
  logcatSerial: null,
  logcatLoading: false,
  packages: [],
  packagesSerial: null,
  packagesLoading: false,
  projects: [],
  activeProjectId: null,
  projectsLoading: false,
  companionConfig: null,
  companionRunning: false,
  _unlistenBuildLog: null,

  // --------------------------------------------------------------------------
  // Initialization — load SDK config and initial data
  // --------------------------------------------------------------------------

  initialize: async () => {
    try {
      const sdkConfig = await invoke<SdkConfig>("get_sdk_config");
      set({ sdkConfig, initialized: true, initError: null });

      // Set up build log listener (Tauri events from gradle.rs)
      const unlisten = await listen<string>("build-log", (event) => {
        set((state) => ({
          buildLogs: [...state.buildLogs, event.payload],
        }));
      });
      set({ _unlistenBuildLog: unlisten });

      // Load initial data in parallel
      const { loadDevices, loadAvds, loadProjects, loadCompanionConfig } = get();
      await Promise.allSettled([
        loadDevices(),
        loadAvds(),
        loadProjects(),
        loadCompanionConfig(),
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
      const sdkConfig = await invoke<SdkConfig>("get_sdk_config");
      set({ sdkConfig });
    } catch (e) {
      console.error("Failed to load SDK config:", e);
    }
  },

  setSdkConfig: async (sdkPath, javaHome, flutterSdkPath) => {
    try {
      await invoke("set_sdk_config", {
        sdkPath,
        javaHome,
        flutterSdkPath: flutterSdkPath ?? null,
      });
      set({
        sdkConfig: {
          android_sdk_path: sdkPath,
          java_home: javaHome,
          flutter_sdk_path: flutterSdkPath ?? "",
        },
      });
    } catch (e) {
      console.error("Failed to set SDK config:", e);
    }
  },

  // --------------------------------------------------------------------------
  // Devices (ADB)
  // --------------------------------------------------------------------------

  loadDevices: async () => {
    set({ devicesLoading: true });
    try {
      const devices = await invoke<AdbDevice[]>("list_devices");
      set({ devices, devicesLoading: false });
    } catch (e) {
      console.error("Failed to load devices:", e);
      set({ devicesLoading: false });
    }
  },

  selectDevice: (serial) => set({ selectedDeviceSerial: serial }),

  takeScreenshot: async (serial) => {
    try {
      const base64 = await invoke<string>("take_screenshot", { serial });
      set({ deviceScreenshot: `data:image/png;base64,${base64}` });
    } catch (e) {
      console.error("Failed to take screenshot:", e);
    }
  },

  sendDeviceInput: async (serial, action, params = {}) => {
    try {
      const result = await invoke<string>("device_input", {
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
    set({ avdsLoading: true });
    try {
      const avds = await invoke<AvdInfo[]>("list_avds");
      set({ avds, avdsLoading: false });
    } catch (e) {
      console.error("Failed to load AVDs:", e);
      set({ avdsLoading: false });
    }
  },

  startAvd: async (name, coldBoot = false) => {
    try {
      await invoke<string>("start_avd", { name, coldBoot });
      // Refresh AVD list after a delay (emulator takes time to boot)
      setTimeout(() => get().loadAvds(), 3000);
    } catch (e) {
      console.error("Failed to start AVD:", e);
      throw e;
    }
  },

  stopAvd: async (serial) => {
    try {
      await invoke("stop_avd", { serial });
      await get().loadAvds();
    } catch (e) {
      console.error("Failed to stop AVD:", e);
      throw e;
    }
  },

  // --------------------------------------------------------------------------
  // Builds (Gradle)
  // --------------------------------------------------------------------------

  startBuild: async (projectPath, task, extraArgs) => {
    set({ buildLogs: [], buildLoading: true });
    try {
      const buildInfo = await invoke<BuildInfo>("start_build", {
        projectPath,
        task,
        extraArgs: extraArgs ?? null,
      });
      set((state) => ({
        builds: [...state.builds, buildInfo],
        activeBuildId: buildInfo.id,
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
      const info = await invoke<BuildInfo | null>("get_build_status", {
        buildId,
      });
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
    set({ logcatLoading: true, logcatSerial: serial });
    try {
      const logLines = await invoke<string[]>("get_logcat", { serial, lines });
      set({ logcatLines: logLines, logcatLoading: false });
    } catch (e) {
      console.error("Failed to load logcat:", e);
      set({ logcatLoading: false });
    }
  },

  clearLogcat: async (serial) => {
    try {
      await invoke("clear_logcat", { serial });
      set({ logcatLines: [] });
    } catch (e) {
      console.error("Failed to clear logcat:", e);
    }
  },

  // --------------------------------------------------------------------------
  // APK / Package Management
  // --------------------------------------------------------------------------

  installApk: async (serial, apkPath, reinstall = false) => {
    try {
      await invoke<string>("install_apk", { serial, apkPath, reinstall });
    } catch (e) {
      console.error("Failed to install APK:", e);
      throw e;
    }
  },

  uninstallPackage: async (serial, packageName) => {
    try {
      await invoke<string>("uninstall_package", { serial, packageName });
      // Refresh package list
      await get().loadPackages(serial);
    } catch (e) {
      console.error("Failed to uninstall package:", e);
      throw e;
    }
  },

  loadPackages: async (serial) => {
    set({ packagesLoading: true, packagesSerial: serial });
    try {
      const packages = await invoke<string[]>("list_packages", { serial });
      set({ packages, packagesLoading: false });
    } catch (e) {
      console.error("Failed to load packages:", e);
      set({ packagesLoading: false });
    }
  },

  // --------------------------------------------------------------------------
  // Projects
  // --------------------------------------------------------------------------

  loadProjects: async () => {
    set({ projectsLoading: true });
    try {
      const projects = await invoke<ProjectInfo[]>("list_projects");
      set({ projects, projectsLoading: false });
    } catch (e) {
      console.error("Failed to load projects:", e);
      set({ projectsLoading: false });
    }
  },

  addProject: async (path, name) => {
    try {
      const project = await invoke<ProjectInfo>("add_project", {
        path,
        name: name ?? null,
      });
      set((state) => ({ projects: [...state.projects, project] }));
    } catch (e) {
      console.error("Failed to add project:", e);
      throw e;
    }
  },

  removeProject: async (id) => {
    try {
      await invoke("remove_project", { id });
      set((state) => ({
        projects: state.projects.filter((p) => p.id !== id),
        activeProjectId:
          state.activeProjectId === id ? null : state.activeProjectId,
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
      const config = await invoke<CompanionConfig>("get_companion_config");
      set({ companionConfig: config, companionRunning: config.enabled });
    } catch (e) {
      console.error("Failed to load companion config:", e);
    }
  },

  startCompanionServer: async (port, apiKey) => {
    try {
      await invoke<string>("start_companion_server", { port, apiKey });
      set({
        companionConfig: { port, api_key: apiKey, enabled: true },
        companionRunning: true,
      });
    } catch (e) {
      console.error("Failed to start companion server:", e);
      throw e;
    }
  },
}));
