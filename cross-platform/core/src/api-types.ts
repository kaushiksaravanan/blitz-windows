// Core API Types — Shared between Windows Controller and Android Companion
// Defines the REST API contract for Android development tooling on Windows.

// ============================================================================
// Authentication
// ============================================================================

export interface AuthCredentials {
  apiKey: string;
  host: string;
  port: number;
}

// ============================================================================
// Host Status (Windows machine running Android SDK)
// ============================================================================

export type HostStatus = "online" | "offline" | "busy" | "error";

export interface HostInfo {
  status: HostStatus;
  hostname: string;
  platform: "windows";
  sdkPath: string;
  adbVersion: string;
  gradleVersion: string | null;
  javaVersion: string | null;
  connectedDevices: AdbDevice[];
  availableAvds: AvdInfo[];
  activeBuild: GradleBuildInfo | null;
  uptime: number; // seconds
}

// ============================================================================
// ADB Devices (physical + emulator instances)
// ============================================================================

export type AdbDeviceType = "device" | "emulator" | "unauthorized" | "offline";

export interface AdbDevice {
  serial: string; // e.g. "emulator-5554" or "R5CT32XXXXX"
  type: AdbDeviceType;
  model: string;
  product: string;
  transportId: string;
  androidVersion: string;
  apiLevel: number;
  isEmulator: boolean;
}

export interface AdbDeviceDetails {
  serial: string;
  manufacturer: string;
  model: string;
  brand: string;
  androidVersion: string;
  apiLevel: number;
  screenResolution: string;
  screenDensity: number;
  batteryLevel: number;
  isCharging: boolean;
  availableStorage: string;
  totalStorage: string;
  installedPackages: string[];
}

// ============================================================================
// Android Virtual Devices (AVDs — emulator images)
// ============================================================================

export interface AvdInfo {
  name: string;
  device: string; // e.g. "pixel_7"
  path: string;
  target: string; // e.g. "google_apis/x86_64"
  apiLevel: number;
  abi: string;
  isRunning: boolean;
  runningSerial: string | null; // serial when running, e.g. "emulator-5554"
}

export interface CreateAvdRequest {
  name: string;
  packagePath: string; // system image path
  device: string; // hardware profile
  force?: boolean;
}

export interface AvdActionRequest {
  name: string;
  action: "start" | "stop" | "wipe" | "delete";
  coldBoot?: boolean;
  noWindow?: boolean;
  gpuMode?: "auto" | "host" | "swiftshader_indirect" | "off";
}

export interface AvdActionResponse {
  success: boolean;
  message: string;
  serial?: string; // serial of started emulator
}

// ============================================================================
// Device Interaction (ADB input commands)
// ============================================================================

export type DeviceActionType =
  | "tap"
  | "swipe"
  | "longPress"
  | "inputText"
  | "keyEvent"
  | "screenshot"
  | "screenRecord"
  | "dumpUi";

export interface DeviceAction {
  type: DeviceActionType;
  serial: string;
  x?: number;
  y?: number;
  toX?: number;
  toY?: number;
  duration?: number; // ms
  text?: string;
  keyCode?: number;
}

export interface DeviceActionResponse {
  success: boolean;
  data?: string; // base64 screenshot, UI XML dump, etc.
  message?: string;
}

// ============================================================================
// APK Management
// ============================================================================

export interface InstalledPackage {
  packageName: string;
  versionName: string;
  versionCode: number;
  targetSdk: number;
  isSystemApp: boolean;
  apkPath: string;
}

export interface InstallApkRequest {
  serial: string;
  apkPath: string;
  reinstall?: boolean;
  grantPermissions?: boolean;
}

export interface UninstallApkRequest {
  serial: string;
  packageName: string;
  keepData?: boolean;
}

export interface ApkActionResponse {
  success: boolean;
  message: string;
}

// ============================================================================
// Gradle Build Pipeline
// ============================================================================

export type GradleBuildPhase =
  | "idle"
  | "configuring"
  | "compiling"
  | "assembling"
  | "testing"
  | "linting"
  | "installing"
  | "complete"
  | "failed"
  | "cancelled";

export interface GradleBuildInfo {
  id: string;
  projectPath: string;
  task: string; // e.g. "assembleDebug", "test", "lint"
  phase: GradleBuildPhase;
  progress: number; // 0-100
  startedAt: string;
  finishedAt: string | null;
  outputApk: string | null; // path to built APK
  logs: string[];
  error?: string;
}

export interface GradleBuildRequest {
  projectPath: string;
  task: string;
  variant?: string; // "debug" | "release"
  installOnDevice?: string; // serial to install after build
  extraArgs?: string[];
}

export interface GradleBuildResponse {
  buildId: string;
  status: GradleBuildPhase;
}

export interface GradleTaskListResponse {
  tasks: GradleTask[];
}

export interface GradleTask {
  name: string;
  path: string;
  description: string;
  group: string;
}

// ============================================================================
// Logcat
// ============================================================================

export type LogcatLevel = "V" | "D" | "I" | "W" | "E" | "F";

export interface LogcatEntry {
  timestamp: string;
  pid: number;
  tid: number;
  level: LogcatLevel;
  tag: string;
  message: string;
}

export interface LogcatFilter {
  serial: string;
  tags?: string[];
  minLevel?: LogcatLevel;
  packageName?: string;
  maxLines?: number;
}

// ============================================================================
// Projects (local Android project directories)
// ============================================================================

export type ProjectType = "android-native" | "react-native" | "flutter" | "compose";

export interface ProjectMetadata {
  id: string;
  name: string;
  type: ProjectType;
  applicationId: string;
  path: string;
  createdAt: string;
  lastOpenedAt: string;
  minSdk: number;
  targetSdk: number;
  gradleVersion?: string;
  kotlinVersion?: string;
  buildVariants: string[];
  modules: string[];
}

export interface ProjectListResponse {
  projects: ProjectMetadata[];
}

export interface AddProjectRequest {
  path: string;
  name?: string;
}

// ============================================================================
// Settings
// ============================================================================

export interface BlitzSettings {
  androidSdkPath: string;
  javaHomePath: string;
  adbPath: string;
  emulatorPath: string;
  gradlePath: string;
  defaultBuildVariant: string;
  logcatBufferSize: number;
  companionServerPort: number;
  companionApiKey: string;
  theme: "dark" | "light" | "system";
  autoConnectDevices: boolean;
  enableLogcatOnConnect: boolean;
}

// ============================================================================
// WebSocket Events
// ============================================================================

export type WSEventType =
  | "build_log"
  | "build_status"
  | "device_connected"
  | "device_disconnected"
  | "emulator_started"
  | "emulator_stopped"
  | "logcat_entry"
  | "logcat_batch"
  | "apk_installed"
  | "host_status"
  | "error";

export interface WSEvent<T = unknown> {
  type: WSEventType;
  timestamp: string;
  payload: T;
}

export interface BuildLogEvent {
  buildId: string;
  line: string;
  stream: "stdout" | "stderr";
}

export interface BuildStatusEvent {
  buildId: string;
  phase: GradleBuildPhase;
  progress: number;
  outputApk?: string;
  error?: string;
}

export interface DeviceEvent {
  serial: string;
  model: string;
  type: AdbDeviceType;
}

export interface EmulatorEvent {
  name: string;
  serial: string | null;
  action: "started" | "stopped";
}

export interface LogcatBatchEvent {
  serial: string;
  entries: LogcatEntry[];
}

// ============================================================================
// REST API Routes
// ============================================================================

export const API_ROUTES = {
  // Health
  HEALTH: "/api/v1/health",
  HOST_STATUS: "/api/v1/status",

  // Devices (ADB)
  DEVICES_LIST: "/api/v1/devices",
  DEVICE_DETAILS: "/api/v1/devices/:serial",
  DEVICE_SCREENSHOT: "/api/v1/devices/:serial/screenshot",
  DEVICE_PACKAGES: "/api/v1/devices/:serial/packages",

  // APK Management
  APK_INSTALL: "/api/v1/devices/:serial/install",
  APK_UNINSTALL: "/api/v1/devices/:serial/uninstall",

  // Emulators (AVDs)
  AVDS_LIST: "/api/v1/avds",
  AVD_ACTION: "/api/v1/avds/:name/action",

  // Builds (Gradle + Flutter)
  BUILD_START: "/api/v1/builds",
  BUILD_STATUS: "/api/v1/builds/:id",

  // Projects
  PROJECTS_LIST: "/api/v1/projects",

  // Logcat
  LOGCAT_DUMP: "/api/v1/logcat/:serial",
  LOGCAT_CLEAR: "/api/v1/logcat/:serial/clear",

  // WebSocket
  WS_EVENTS: "/ws/events",
} as const;
