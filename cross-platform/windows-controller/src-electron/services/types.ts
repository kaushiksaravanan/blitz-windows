// Shared types for Electron backend services
// Single source of truth — frontend mirrors these via IPC

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

// =============================================================================
// GenAI Provider Settings
// =============================================================================

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

export interface AdbDeviceDetails {
  serial: string;
  manufacturer: string;
  model: string;
  androidVersion: string;
  sdkVersion: number;
  buildNumber: string;
  hardware: string;
  abi: string;
  locale: string;
  timezone: string;
  networkOperator: string;
  screenSize: string;
  batteryLevel: number;
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

export type ProjectType = "android-native" | "flutter" | "react-native" | "unknown";

// =============================================================================
// Play Store Publishing
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

export interface AppAnalysis {
  packageName: string;
  appName: string;
  versionName: string;
  versionCode: number;
  minSdk: number;
  targetSdk: number;
  permissions: string[];
  activities: string[];
  features: string[];
  projectType: ProjectType;
  hasInternet: boolean;
  hasCamera: boolean;
  hasLocation: boolean;
  hasStorage: boolean;
  hasBluetooth: boolean;
  hasMicrophone: boolean;
  iconPath: string | null;
  apkPath: string | null;
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

export interface PlayStorePublishState {
  phase: PlayStorePhase;
  progress: number;
  currentStep: string;
  config: PlayStoreConfig | null;
  assets: PlayStoreAssets | null;
  analysis: AppAnalysis | null;
  error: string | null;
  logs: string[];
  browserConnected: boolean;
}

// =============================================================================
// Assistive UI Automation Testing
// =============================================================================

export interface UiAutomationRequest {
  projectPath: string;
  serial: string;
  packageName: string;
  instruction: string;
  outputDir: string;
  maxSteps: number;
  actionDelayMs: number;
  maxActionsPerScreen: number;
  captureVideo: boolean;
  videoDurationSeconds: number;
  enableOcr: boolean;
  logcatLinesPerStep: number;
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
