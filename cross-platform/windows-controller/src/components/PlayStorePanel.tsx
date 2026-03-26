// =============================================================================
// PlayStorePanel — Play Store publishing UI
// =============================================================================
// Full publishing workflow with step-by-step controls:
// 1. Select project to publish
// 2. Analyze app and review/edit generated content
// 3. Generate screenshots, feature graphic, demo video
// 4. Connect to Chrome (user's Play Console session)
// 5. One-click publish or step-by-step manual control
// =============================================================================

import { useState, useEffect } from "react";
import {
  useBlitzStore,
  type AssetGenerationOptions,
  type GenAiDraft,
  type GenAiTextReview,
  type PlayStoreConfig,
  type PlayStorePhase,
  type VideoOrientation,
} from "../store";

const PHASE_LABELS: Record<PlayStorePhase, string> = {
  idle: "Ready",
  analyzing: "Analyzing app...",
  "generating-content": "Generating content...",
  "generating-screenshots": "Capturing screenshots...",
  "generating-feature-graphic": "Creating feature graphic...",
  "generating-video": "Generating demo video...",
  "connecting-browser": "Connecting to Chrome...",
  "creating-app": "Creating app in Play Console...",
  "filling-listing": "Filling store listing...",
  "filling-content-rating": "Completing content rating...",
  "filling-app-content": "Filling app content declarations...",
  "uploading-assets": "Uploading assets...",
  "uploading-build": "Uploading build artifact...",
  submitting: "Submitting for review...",
  complete: "Publishing complete!",
  error: "Error occurred",
};

// ---------------------------------------------------------------------------
// Subcomponents
// ---------------------------------------------------------------------------

function StepIndicator({ phase, progress }: { phase: PlayStorePhase; progress: number }) {
  const isActive = phase !== "idle" && phase !== "complete" && phase !== "error";
  const isComplete = phase === "complete";
  const isError = phase === "error";

  return (
    <div className="mb-6">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium text-[var(--text-primary)]">
          {PHASE_LABELS[phase]}
        </span>
        <span className="text-xs text-[var(--text-secondary)]">{progress}%</span>
      </div>
      <div className="w-full bg-[var(--bg-tertiary)] rounded-full h-2">
        <div
          className={`h-2 rounded-full transition-all duration-500 ${
            isError
              ? "bg-[var(--error)]"
              : isComplete
                ? "bg-[var(--success)]"
                : "bg-[var(--accent)]"
          }`}
          style={{ width: `${progress}%` }}
        />
      </div>
      {isActive && (
        <div className="flex items-center gap-2 mt-2">
          <div className="w-3 h-3 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
          <span className="text-xs text-[var(--text-secondary)]">In progress...</span>
        </div>
      )}
    </div>
  );
}

function ContentEditor({
  config,
  onChange,
}: {
  config: PlayStoreConfig;
  onChange: (updates: Partial<PlayStoreConfig>) => void;
}) {
  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold text-[var(--text-primary)]">Store Listing Content</h3>

      <div>
        <label className="block text-xs text-[var(--text-secondary)] mb-1">
          App Title (max 30 chars)
        </label>
        <input
          type="text"
          maxLength={30}
          value={config.appTitle}
          onChange={(e) => onChange({ appTitle: e.target.value })}
          className="w-full px-3 py-1.5 text-sm rounded-md bg-[var(--bg-tertiary)] text-[var(--text-primary)] border border-[var(--border)] focus:outline-none focus:border-[var(--accent)]"
        />
        <span className="text-[10px] text-[var(--text-secondary)]">{config.appTitle.length}/30</span>
      </div>

      <div>
        <label className="block text-xs text-[var(--text-secondary)] mb-1">
          Short Description (max 80 chars)
        </label>
        <input
          type="text"
          maxLength={80}
          value={config.shortDescription}
          onChange={(e) => onChange({ shortDescription: e.target.value })}
          className="w-full px-3 py-1.5 text-sm rounded-md bg-[var(--bg-tertiary)] text-[var(--text-primary)] border border-[var(--border)] focus:outline-none focus:border-[var(--accent)]"
        />
        <span className="text-[10px] text-[var(--text-secondary)]">
          {config.shortDescription.length}/80
        </span>
      </div>

      <div>
        <label className="block text-xs text-[var(--text-secondary)] mb-1">
          Full Description (max 4000 chars)
        </label>
        <textarea
          maxLength={4000}
          value={config.fullDescription}
          onChange={(e) => onChange({ fullDescription: e.target.value })}
          rows={8}
          className="w-full px-3 py-1.5 text-sm rounded-md bg-[var(--bg-tertiary)] text-[var(--text-primary)] border border-[var(--border)] focus:outline-none focus:border-[var(--accent)] resize-y font-mono"
        />
        <span className="text-[10px] text-[var(--text-secondary)]">
          {config.fullDescription.length}/4000
        </span>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-xs text-[var(--text-secondary)] mb-1">Category</label>
          <select
            value={config.category}
            onChange={(e) => onChange({ category: e.target.value })}
            className="w-full px-3 py-1.5 text-sm rounded-md bg-[var(--bg-tertiary)] text-[var(--text-primary)] border border-[var(--border)] focus:outline-none focus:border-[var(--accent)]"
          >
            <option value="TOOLS">Tools</option>
            <option value="PRODUCTIVITY">Productivity</option>
            <option value="GAME_ACTION">Game - Action</option>
            <option value="PHOTOGRAPHY">Photography</option>
            <option value="SOCIAL">Social</option>
            <option value="MUSIC_AND_AUDIO">Music & Audio</option>
            <option value="MAPS_AND_NAVIGATION">Maps & Navigation</option>
            <option value="HEALTH_AND_FITNESS">Health & Fitness</option>
            <option value="FINANCE">Finance</option>
            <option value="EDUCATION">Education</option>
            <option value="SHOPPING">Shopping</option>
            <option value="WEATHER">Weather</option>
            <option value="NEWS_AND_MAGAZINES">News & Magazines</option>
          </select>
        </div>

        <div>
          <label className="block text-xs text-[var(--text-secondary)] mb-1">Package Name</label>
          <input
            type="text"
            value={config.packageName}
            readOnly
            className="w-full px-3 py-1.5 text-sm rounded-md bg-[var(--bg-primary)] text-[var(--text-secondary)] border border-[var(--border)] font-mono"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-xs text-[var(--text-secondary)] mb-1">Contact Email</label>
          <input
            type="email"
            value={config.contactEmail}
            onChange={(e) => onChange({ contactEmail: e.target.value })}
            placeholder="developer@example.com"
            className="w-full px-3 py-1.5 text-sm rounded-md bg-[var(--bg-tertiary)] text-[var(--text-primary)] border border-[var(--border)] focus:outline-none focus:border-[var(--accent)]"
          />
        </div>

        <div>
          <label className="block text-xs text-[var(--text-secondary)] mb-1">
            Privacy Policy URL
          </label>
          <input
            type="url"
            value={config.privacyPolicyUrl}
            onChange={(e) => onChange({ privacyPolicyUrl: e.target.value })}
            placeholder="https://..."
            className="w-full px-3 py-1.5 text-sm rounded-md bg-[var(--bg-tertiary)] text-[var(--text-primary)] border border-[var(--border)] focus:outline-none focus:border-[var(--accent)]"
          />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <label className="flex items-center gap-2 text-sm text-[var(--text-primary)]">
          <input
            type="checkbox"
            checked={config.isFree}
            onChange={(e) => onChange({ isFree: e.target.checked })}
            className="accent-[var(--accent)]"
          />
          Free app
        </label>

        <label className="flex items-center gap-2 text-sm text-[var(--text-primary)]">
          <input
            type="checkbox"
            checked={config.containsAds}
            onChange={(e) => onChange({ containsAds: e.target.checked })}
            className="accent-[var(--accent)]"
          />
          Contains ads
        </label>

        <div>
          <select
            value={config.targetAudience}
            onChange={(e) =>
              onChange({
                targetAudience: e.target.value as PlayStoreConfig["targetAudience"],
              })
            }
            className="w-full px-3 py-1.5 text-sm rounded-md bg-[var(--bg-tertiary)] text-[var(--text-primary)] border border-[var(--border)]"
          >
            <option value="everyone">Everyone</option>
            <option value="older-users">Older users (18+)</option>
            <option value="mixed">Mixed audience</option>
          </select>
        </div>
      </div>
    </div>
  );
}

function AssetPreview({
  assets,
}: {
  assets: { iconPath: string | null; screenshotPaths: string[]; featureGraphicPath: string | null; demoVideoPath: string | null };
}) {
  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-[var(--text-primary)]">Generated Assets</h3>

      <div className="grid grid-cols-2 gap-3">
        <div className="p-3 rounded-lg bg-[var(--bg-tertiary)] border border-[var(--border)]">
          <div className="text-xs font-medium text-[var(--text-secondary)] mb-1">Screenshots</div>
          <div className="text-lg font-bold text-[var(--text-primary)]">
            {assets.screenshotPaths.length}
          </div>
          <div className="text-[10px] text-[var(--text-secondary)]">
            {assets.screenshotPaths.length >= 2 ? "\u2713 Minimum met" : "\u2717 Need at least 2"}
          </div>
        </div>

        <div className="p-3 rounded-lg bg-[var(--bg-tertiary)] border border-[var(--border)]">
          <div className="text-xs font-medium text-[var(--text-secondary)] mb-1">
            Feature Graphic
          </div>
          <div className="text-lg font-bold text-[var(--text-primary)]">
            {assets.featureGraphicPath ? "\u2713" : "\u2717"}
          </div>
          <div className="text-[10px] text-[var(--text-secondary)]">1024 x 500 px</div>
        </div>

        <div className="p-3 rounded-lg bg-[var(--bg-tertiary)] border border-[var(--border)]">
          <div className="text-xs font-medium text-[var(--text-secondary)] mb-1">Demo Video</div>
          <div className="text-lg font-bold text-[var(--text-primary)]">
            {assets.demoVideoPath ? "\u2713" : "Optional"}
          </div>
          <div className="text-[10px] text-[var(--text-secondary)]">
            {assets.demoVideoPath ? "Ready" : "Not generated"}
          </div>
        </div>

        <div className="p-3 rounded-lg bg-[var(--bg-tertiary)] border border-[var(--border)]">
          <div className="text-xs font-medium text-[var(--text-secondary)] mb-1">App Icon</div>
          <div className="text-lg font-bold text-[var(--text-primary)]">{assets.iconPath ? "\u2713" : "\u2717"}</div>
          <div className="text-[10px] text-[var(--text-secondary)]">512 x 512 px</div>
        </div>
      </div>
    </div>
  );
}

function LogViewer({ logs }: { logs: string[] }) {
  return (
    <div className="mt-4">
      <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-2">Activity Log</h3>
      <div className="bg-[var(--bg-primary)] rounded-lg border border-[var(--border)] p-3 max-h-48 overflow-y-auto font-mono text-[11px] text-[var(--text-secondary)]">
        {logs.length === 0 ? (
          <p className="text-[var(--text-secondary)]">No activity yet</p>
        ) : (
          logs.map((log, i) => (
            <div key={i} className="py-0.5">
              {log}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export function PlayStorePanel() {
  const projects = useBlitzStore((s) => s.projects);
  const devices = useBlitzStore((s) => s.devices);
  const playstoreState = useBlitzStore((s) => s.playstoreState);
  const playstoreLogs = useBlitzStore((s) => s.playstoreLogs);
  const playstoreAnalyze = useBlitzStore((s) => s.playstoreAnalyze);
  const playstoreGenerateAssets = useBlitzStore((s) => s.playstoreGenerateAssets);
  const playstoreRecordDemo = useBlitzStore((s) => s.playstoreRecordDemo);
  const playstoreConnectBrowser = useBlitzStore((s) => s.playstoreConnectBrowser);
  const playstorePublish = useBlitzStore((s) => s.playstorePublish);
  const playstoreReset = useBlitzStore((s) => s.playstoreReset);
  const playstoreAssetOptions = useBlitzStore((s) => s.playstoreAssetOptions);
  const setAssetOptions = useBlitzStore((s) => s.setAssetOptions);
  const generateStoreDraftWithAi = useBlitzStore((s) => s.generateStoreDraftWithAi);
  const reviewTextWithAi = useBlitzStore((s) => s.reviewTextWithAi);
  const genAiConfig = useBlitzStore((s) => s.genAiConfig);
  const debugMode = useBlitzStore((s) => s.debugMode);
  const setDebugMode = useBlitzStore((s) => s.setDebugMode);

  const [selectedProject, setSelectedProject] = useState<string>("");
  const [selectedDevice, setSelectedDevice] = useState<string>("");
  const [chromePort, setChromePort] = useState(9222);
  const [editedConfig, setEditedConfig] = useState<PlayStoreConfig | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [aiPrompt, setAiPrompt] = useState(
    "Improve listing clarity and conversion while keeping language natural and factual."
  );
  const [aiDraft, setAiDraft] = useState<GenAiDraft | null>(null);
  const [aiRunning, setAiRunning] = useState(false);
  const [reviewInput, setReviewInput] = useState("");
  const [reviewInstruction, setReviewInstruction] = useState(
    "Rewrite this text to sound natural, direct, and not AI-generated. Never use em dash punctuation."
  );
  const [reviewResult, setReviewResult] = useState<GenAiTextReview | null>(null);
  const [reviewRunning, setReviewRunning] = useState(false);
  const [recordingDemo, setRecordingDemo] = useState(false);

  // When analysis completes, use the generated config for editing
  useEffect(() => {
    if (playstoreState.config && !editedConfig) {
      setEditedConfig({ ...playstoreState.config });
    }
  }, [playstoreState.config, editedConfig]);

  const connectedDevices = devices.filter((d) => d.status === "device");

  const isIdle = playstoreState.phase === "idle";
  const isRunning =
    playstoreState.phase !== "idle" &&
    playstoreState.phase !== "complete" &&
    playstoreState.phase !== "error";

  const handleAnalyze = async () => {
    if (!selectedProject) return;
    setEditedConfig(null);
    setActionError(null);
    try {
      await playstoreAnalyze(selectedProject);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e));
    }
  };

  const handleGenerateAssets = async () => {
    if (!selectedProject) return;
    setActionError(null);
    try {
      await playstoreGenerateAssets(selectedProject, selectedDevice || null, playstoreAssetOptions);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e));
    }
  };

  const handleRecordDemo = async () => {
    if (!selectedProject || !selectedDevice) return;
    setActionError(null);
    setRecordingDemo(true);
    try {
      const result = await playstoreRecordDemo(
        selectedProject,
        selectedDevice,
        playstoreAssetOptions.videoDurationSeconds,
        playstoreAssetOptions.videoOrientation
      );
      if (!result.videoPath) {
        setActionError("Recording completed but no video file was generated.");
      }
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e));
    }
    setRecordingDemo(false);
  };

  const handleGenerateAiDraft = async () => {
    if (!selectedProject || !editedConfig) return;
    setActionError(null);
    setAiRunning(true);
    try {
      const draft = await generateStoreDraftWithAi(selectedProject, aiPrompt, editedConfig);
      setAiDraft(draft);
      setEditedConfig({ ...editedConfig, ...draft.config, packageName: editedConfig.packageName });
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e));
    }
    setAiRunning(false);
  };

  const handleReviewText = async () => {
    if (!reviewInput.trim()) return;
    setActionError(null);
    setReviewRunning(true);
    try {
      const result = await reviewTextWithAi(reviewInput, reviewInstruction);
      setReviewResult(result);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e));
    }
    setReviewRunning(false);
  };

  const handleConnectBrowser = async () => {
    setActionError(null);
    try {
      await playstoreConnectBrowser(chromePort);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e));
    }
  };

  const handlePublish = async () => {
    if (!selectedProject) return;
    setActionError(null);
    try {
      await playstorePublish(
        selectedProject,
        selectedDevice || null,
        editedConfig || {},
        playstoreAssetOptions,
        chromePort
      );
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e));
    }
  };

  const handleConfigChange = (updates: Partial<PlayStoreConfig>) => {
    if (editedConfig) {
      setEditedConfig({ ...editedConfig, ...updates });
    }
  };

  const handleAssetOptionsChange = (updates: Partial<AssetGenerationOptions>) => {
    setAssetOptions(updates);
  };

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-[var(--border)] flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-[var(--text-primary)]">
            Play Store Publishing
          </h2>
          <p className="text-xs text-[var(--text-secondary)] mt-0.5">
            Analyze, generate assets, and publish to Google Play
          </p>
        </div>
        {(playstoreState.phase === "complete" || playstoreState.phase === "error") && (
          <button
            onClick={playstoreReset}
            className="px-4 py-1.5 text-sm rounded-lg bg-[var(--bg-tertiary)] text-[var(--text-primary)] hover:bg-[var(--border)] transition-colors"
          >
            Reset
          </button>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        {/* Progress */}
        {playstoreState.phase !== "idle" && (
          <StepIndicator phase={playstoreState.phase} progress={playstoreState.progress} />
        )}

        {/* Error */}
        {(playstoreState.error || actionError) && (
          <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-sm text-[var(--error)]">
            {playstoreState.error || actionError}
          </div>
        )}

        {/* Project & Device Selection */}
        <div className="p-4 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border)] space-y-3">
          <h3 className="text-sm font-semibold text-[var(--text-primary)]">
            1. Select Project & Device
          </h3>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-[var(--text-secondary)] mb-1">Project</label>
              <select
                value={selectedProject}
                onChange={(e) => setSelectedProject(e.target.value)}
                disabled={isRunning}
                className="w-full px-3 py-1.5 text-sm rounded-md bg-[var(--bg-tertiary)] text-[var(--text-primary)] border border-[var(--border)]"
              >
                <option value="">Select a project...</option>
                {projects.map((p) => (
                  <option key={p.path} value={p.path}>
                    {p.name} ({p.projectType})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs text-[var(--text-secondary)] mb-1">
                Device (for screenshots)
              </label>
              <select
                value={selectedDevice}
                onChange={(e) => setSelectedDevice(e.target.value)}
                disabled={isRunning}
                className="w-full px-3 py-1.5 text-sm rounded-md bg-[var(--bg-tertiary)] text-[var(--text-primary)] border border-[var(--border)]"
              >
                <option value="">No device (skip screenshots)</option>
                {connectedDevices.map((d) => (
                  <option key={d.serial} value={d.serial}>
                    {d.model || d.serial}{" "}
                    {d.isEmulator ? "(Emulator)" : "(Physical)"}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <button
            onClick={handleAnalyze}
            disabled={!selectedProject || isRunning}
            className="px-4 py-2 text-sm rounded-lg bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Analyze App
          </button>
        </div>

        {/* Content Editor (after analysis) */}
        {editedConfig && (
          <div className="p-4 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border)]">
            <ContentEditor config={editedConfig} onChange={handleConfigChange} />
          </div>
        )}

        {/* Asset Generation */}
        {editedConfig && (
          <div className="p-4 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border)] space-y-3">
            <h3 className="text-sm font-semibold text-[var(--text-primary)]">
              2. Generate Assets
            </h3>
            <p className="text-xs text-[var(--text-secondary)]">
              Capture screenshots from the selected device, generate a feature graphic, and
              create a demo video.
            </p>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-[var(--text-secondary)] mb-1">Template Preset</label>
                <select
                  value={playstoreAssetOptions.templatePreset}
                  onChange={(e) =>
                    handleAssetOptionsChange({
                      templatePreset: e.target.value as AssetGenerationOptions["templatePreset"],
                    })
                  }
                  disabled={isRunning}
                  className="w-full px-3 py-1.5 text-sm rounded-md bg-[var(--bg-tertiary)] text-[var(--text-primary)] border border-[var(--border)]"
                >
                  <option value="gradient-hero">Gradient Hero</option>
                  <option value="launchpad-pro">Launchpad Pro</option>
                  <option value="localized-story">Localized Story</option>
                  <option value="clean-device">Clean Device</option>
                  <option value="minimal-light">Minimal Light</option>
                  <option value="store-spotlight">Store Spotlight</option>
                </select>
              </div>

              <div>
                <label className="block text-xs text-[var(--text-secondary)] mb-1">Screenshot Count</label>
                <input
                  type="number"
                  min={1}
                  max={8}
                  value={playstoreAssetOptions.screenshotCount}
                  onChange={(e) =>
                    handleAssetOptionsChange({
                      screenshotCount: Math.max(1, Math.min(8, parseInt(e.target.value, 10) || 4)),
                    })
                  }
                  disabled={isRunning}
                  className="w-full px-3 py-1.5 text-sm rounded-md bg-[var(--bg-tertiary)] text-[var(--text-primary)] border border-[var(--border)]"
                />
              </div>

              <div>
                <label className="block text-xs text-[var(--text-secondary)] mb-1">Locale</label>
                <input
                  type="text"
                  value={playstoreAssetOptions.locale}
                  onChange={(e) => handleAssetOptionsChange({ locale: e.target.value })}
                  disabled={isRunning}
                  className="w-full px-3 py-1.5 text-sm rounded-md bg-[var(--bg-tertiary)] text-[var(--text-primary)] border border-[var(--border)]"
                />
              </div>

              <div>
                <label className="block text-xs text-[var(--text-secondary)] mb-1">Video Orientation</label>
                <select
                  value={playstoreAssetOptions.videoOrientation}
                  onChange={(e) =>
                    handleAssetOptionsChange({
                      videoOrientation: e.target.value as VideoOrientation,
                    })
                  }
                  disabled={isRunning}
                  className="w-full px-3 py-1.5 text-sm rounded-md bg-[var(--bg-tertiary)] text-[var(--text-primary)] border border-[var(--border)]"
                >
                  <option value="auto">Auto</option>
                  <option value="portrait">Portrait</option>
                  <option value="landscape">Landscape</option>
                </select>
              </div>

              <div className="col-span-2">
                <label className="block text-xs text-[var(--text-secondary)] mb-1">Headline</label>
                <input
                  type="text"
                  value={playstoreAssetOptions.headline}
                  onChange={(e) => handleAssetOptionsChange({ headline: e.target.value })}
                  disabled={isRunning}
                  className="w-full px-3 py-1.5 text-sm rounded-md bg-[var(--bg-tertiary)] text-[var(--text-primary)] border border-[var(--border)]"
                />
              </div>

              <div className="col-span-2">
                <label className="block text-xs text-[var(--text-secondary)] mb-1">Subheadline</label>
                <input
                  type="text"
                  value={playstoreAssetOptions.subheadline}
                  onChange={(e) => handleAssetOptionsChange({ subheadline: e.target.value })}
                  disabled={isRunning}
                  className="w-full px-3 py-1.5 text-sm rounded-md bg-[var(--bg-tertiary)] text-[var(--text-primary)] border border-[var(--border)]"
                />
              </div>

              <label className="flex items-center gap-2 text-sm text-[var(--text-primary)] col-span-2">
                <input
                  type="checkbox"
                  checked={playstoreAssetOptions.includeDeviceFrame}
                  onChange={(e) =>
                    handleAssetOptionsChange({ includeDeviceFrame: e.target.checked })
                  }
                  disabled={isRunning}
                />
                Include device frame
              </label>

              <div>
                <label className="block text-xs text-[var(--text-secondary)] mb-1">Video Duration (sec)</label>
                <input
                  type="number"
                  min={5}
                  max={180}
                  value={playstoreAssetOptions.videoDurationSeconds}
                  onChange={(e) =>
                    handleAssetOptionsChange({
                      videoDurationSeconds: Math.max(
                        5,
                        Math.min(180, parseInt(e.target.value, 10) || 30)
                      ),
                    })
                  }
                  disabled={isRunning}
                  className="w-full px-3 py-1.5 text-sm rounded-md bg-[var(--bg-tertiary)] text-[var(--text-primary)] border border-[var(--border)]"
                />
              </div>
            </div>

            <div className="flex gap-2 flex-wrap">
              <button
                onClick={handleGenerateAssets}
                disabled={!selectedProject || isRunning}
                className="px-4 py-2 text-sm rounded-lg bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Generate Assets
              </button>
              <button
                onClick={handleRecordDemo}
                disabled={!selectedProject || !selectedDevice || isRunning || recordingDemo}
                className="px-4 py-2 text-sm rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {recordingDemo ? "Recording..." : "Record Demo Now"}
              </button>
            </div>

            {playstoreState.assets && <AssetPreview assets={playstoreState.assets} />}
          </div>
        )}

        {/* Debug Menu */}
        {editedConfig && (
          <div className="p-4 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border)] space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-[var(--text-primary)]">Debug Menu</h3>
              <label className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
                <input
                  type="checkbox"
                  checked={debugMode}
                  onChange={(e) => setDebugMode(e.target.checked)}
                />
                Enable Debug Mode
              </label>
            </div>

            {debugMode && (
              <>
                <p className="text-xs text-[var(--text-secondary)]">
                  Use GenAI to draft listing content. System style guardrails enforce natural human tone and avoid em dash punctuation.
                </p>
                <div className="text-xs text-[var(--text-secondary)]">
                  Provider: <span className="font-mono">{genAiConfig?.provider || "not configured"}</span> | Model: <span className="font-mono">{genAiConfig?.model || "n/a"}</span>
                </div>
                <div className="text-[11px] text-[var(--text-secondary)] rounded-md bg-[var(--bg-tertiary)] border border-[var(--border)] px-3 py-2">
                  Prompt guardrail: avoid AI-generated sounding phrasing and never output em dash punctuation.
                </div>
                <textarea
                  value={aiPrompt}
                  onChange={(e) => setAiPrompt(e.target.value)}
                  rows={3}
                  className="w-full px-3 py-2 text-sm rounded-md bg-[var(--bg-tertiary)] text-[var(--text-primary)] border border-[var(--border)]"
                />
                <div className="flex gap-2">
                  <button
                    onClick={handleGenerateAiDraft}
                    disabled={aiRunning || !selectedProject}
                    className="px-4 py-2 text-sm rounded-lg bg-violet-600 hover:bg-violet-700 text-white font-medium transition-colors disabled:opacity-50"
                  >
                    {aiRunning ? "Generating..." : "Generate AI Draft"}
                  </button>
                </div>

                {aiDraft && (
                  <div className="space-y-2">
                    <div className="text-xs text-[var(--text-secondary)]">
                      Draft from <span className="font-mono">{aiDraft.provider}</span> / <span className="font-mono">{aiDraft.model}</span> applied to editor.
                    </div>
                    <details className="rounded-md border border-[var(--border)] bg-[var(--bg-tertiary)] p-2">
                      <summary className="cursor-pointer text-xs text-[var(--text-secondary)]">
                        Raw AI JSON output
                      </summary>
                      <pre className="mt-2 text-[11px] font-mono text-[var(--text-primary)] whitespace-pre-wrap break-words">
                        {aiDraft.outputJson}
                      </pre>
                    </details>
                  </div>
                )}

                <div className="pt-3 border-t border-[var(--border)] space-y-2">
                  <h4 className="text-xs font-semibold text-[var(--text-primary)]">AI Text Review</h4>
                  <textarea
                    value={reviewInput}
                    onChange={(e) => setReviewInput(e.target.value)}
                    rows={4}
                    placeholder="Paste draft text here for style review"
                    className="w-full px-3 py-2 text-sm rounded-md bg-[var(--bg-tertiary)] text-[var(--text-primary)] border border-[var(--border)]"
                  />
                  <input
                    type="text"
                    value={reviewInstruction}
                    onChange={(e) => setReviewInstruction(e.target.value)}
                    className="w-full px-3 py-2 text-sm rounded-md bg-[var(--bg-tertiary)] text-[var(--text-primary)] border border-[var(--border)]"
                  />
                  <button
                    onClick={handleReviewText}
                    disabled={reviewRunning || !reviewInput.trim()}
                    className="px-4 py-2 text-sm rounded-lg bg-sky-600 hover:bg-sky-700 text-white font-medium transition-colors disabled:opacity-50"
                  >
                    {reviewRunning ? "Reviewing..." : "Review Text"}
                  </button>

                  {reviewResult && (
                    <details className="rounded-md border border-[var(--border)] bg-[var(--bg-tertiary)] p-2">
                      <summary className="cursor-pointer text-xs text-[var(--text-secondary)]">
                        Reviewed output ({reviewResult.provider} / {reviewResult.model})
                      </summary>
                      <pre className="mt-2 text-[11px] font-mono text-[var(--text-primary)] whitespace-pre-wrap break-words">
                        {reviewResult.outputText}
                      </pre>
                    </details>
                  )}
                </div>
              </>
            )}
          </div>
        )}

        {/* Browser Connection & Publishing */}
        {editedConfig && (
          <div className="p-4 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border)] space-y-3">
            <h3 className="text-sm font-semibold text-[var(--text-primary)]">
              3. Publish to Play Store
            </h3>
            <p className="text-xs text-[var(--text-secondary)]">
              Connect to your Chrome browser (must be logged into Play Console), then publish.
            </p>

            <div className="flex items-center gap-3">
              <div>
                <label className="block text-xs text-[var(--text-secondary)] mb-1">
                  Chrome Debug Port
                </label>
                <input
                  type="number"
                  value={chromePort}
                  onChange={(e) => setChromePort(parseInt(e.target.value, 10) || 9222)}
                  className="w-24 px-3 py-1.5 text-sm rounded-md bg-[var(--bg-tertiary)] text-[var(--text-primary)] border border-[var(--border)]"
                />
              </div>

              <div className="flex items-center gap-2 mt-4">
                <button
                  onClick={handleConnectBrowser}
                  disabled={isRunning}
                  className="px-4 py-2 text-sm rounded-lg bg-[var(--bg-tertiary)] hover:bg-[var(--border)] text-[var(--text-primary)] font-medium transition-colors disabled:opacity-50"
                >
                  Test Connection
                </button>

                {playstoreState.browserConnected && (
                  <span className="text-xs text-[var(--success)] flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-[var(--success)]" />
                    Connected
                  </span>
                )}
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <button
                onClick={handlePublish}
                disabled={!selectedProject || isRunning}
                className="px-6 py-2.5 text-sm rounded-lg bg-green-600 hover:bg-green-700 text-white font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Publish to Play Store
              </button>

              {playstoreState.phase === "complete" && (
                <span className="flex items-center text-sm text-[var(--success)] font-medium">
                  Done! Review your listing in Play Console.
                </span>
              )}
            </div>
          </div>
        )}

        {/* Logs */}
        <LogViewer logs={playstoreLogs} />
      </div>
    </div>
  );
}
