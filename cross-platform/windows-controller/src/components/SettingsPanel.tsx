// =============================================================================
// SettingsPanel — Android SDK configuration and companion server settings
// =============================================================================

import { useEffect, useState } from "react";
import { useBlitzStore, type GenAiProvider } from "../store";

export function SettingsPanel() {
  const sdkConfig = useBlitzStore((s) => s.sdkConfig);
  const companionConfig = useBlitzStore((s) => s.companionConfig);
  const companionRunning = useBlitzStore((s) => s.companionRunning);
  const setSdkConfig = useBlitzStore((s) => s.setSdkConfig);
  const loadSdkConfig = useBlitzStore((s) => s.loadSdkConfig);
  const startCompanionServer = useBlitzStore((s) => s.startCompanionServer);
  const stopCompanionServer = useBlitzStore((s) => s.stopCompanionServer);
  const genAiConfig = useBlitzStore((s) => s.genAiConfig);
  const loadGenAiConfig = useBlitzStore((s) => s.loadGenAiConfig);
  const setGenAiConfig = useBlitzStore((s) => s.setGenAiConfig);
  const debugMode = useBlitzStore((s) => s.debugMode);
  const setDebugMode = useBlitzStore((s) => s.setDebugMode);
  const repairAdb = useBlitzStore((s) => s.repairAdb);
  const getAdbDiagnostics = useBlitzStore((s) => s.getAdbDiagnostics);
  const getEmulatorDiagnostics = useBlitzStore((s) => s.getEmulatorDiagnostics);
  const validateSdkTools = useBlitzStore((s) => s.validateSdkTools);

  // SDK fields
  const [sdkPath, setSdkPath] = useState("");
  const [javaHome, setJavaHome] = useState("");
  const [flutterSdkPath, setFlutterSdkPath] = useState("");
  const [sdkSaved, setSdkSaved] = useState(false);

  // Companion fields
  const [companionPort, setCompanionPort] = useState("9400");
  const [companionApiKey, setCompanionApiKey] = useState("");
  const [companionStarting, setCompanionStarting] = useState(false);
  const [companionStopping, setCompanionStopping] = useState(false);
  const [companionError, setCompanionError] = useState<string | null>(null);

  // GenAI provider settings
  const [genAiProvider, setGenAiProvider] = useState("openrouter");
  const [genAiModel, setGenAiModel] = useState("");
  const [genAiBaseUrl, setGenAiBaseUrl] = useState("");
  const [genAiTemperature, setGenAiTemperature] = useState("0.4");
  const [genAiApiKey, setGenAiApiKey] = useState("");
  const [genAiSystemPrompt, setGenAiSystemPrompt] = useState("");
  const [genAiEnabled, setGenAiEnabled] = useState(false);
  const [genAiSaving, setGenAiSaving] = useState(false);
  const [genAiSaved, setGenAiSaved] = useState(false);
  const [genAiError, setGenAiError] = useState<string | null>(null);

  // Tool health / diagnostics
  const [repairingAdb, setRepairingAdb] = useState(false);
  const [runningDiagnostics, setRunningDiagnostics] = useState(false);
  const [diagnosticsError, setDiagnosticsError] = useState<string | null>(null);
  const [repairMessage, setRepairMessage] = useState<string | null>(null);
  const [toolValidation, setToolValidation] = useState<Awaited<
    ReturnType<typeof validateSdkTools>
  > | null>(null);
  const [adbDiagnostics, setAdbDiagnostics] = useState<Awaited<
    ReturnType<typeof getAdbDiagnostics>
  > | null>(null);
  const [emulatorDiagnostics, setEmulatorDiagnostics] = useState<Awaited<
    ReturnType<typeof getEmulatorDiagnostics>
  > | null>(null);

  // Load current values
  useEffect(() => {
    if (sdkConfig) {
      setSdkPath(sdkConfig.androidSdkPath);
      setJavaHome(sdkConfig.javaHome);
      setFlutterSdkPath(sdkConfig.flutterSdkPath ?? "");
    }
  }, [sdkConfig]);

  useEffect(() => {
    if (companionConfig) {
      setCompanionPort(companionConfig.port.toString());
      setCompanionApiKey(companionConfig.apiKey);
    }
  }, [companionConfig]);

  useEffect(() => {
    if (genAiConfig) {
      setGenAiProvider(genAiConfig.provider);
      setGenAiModel(genAiConfig.model);
      setGenAiBaseUrl(genAiConfig.baseUrl);
      setGenAiTemperature(String(genAiConfig.temperature));
      setGenAiSystemPrompt(genAiConfig.systemPrompt);
      setGenAiEnabled(genAiConfig.enabled);
      setGenAiApiKey("");
    }
  }, [genAiConfig]);

  useEffect(() => {
    loadGenAiConfig();
  }, [loadGenAiConfig]);

  const handleSaveSdk = async () => {
    await setSdkConfig(sdkPath, javaHome, flutterSdkPath || undefined);
    setSdkSaved(true);
    setTimeout(() => setSdkSaved(false), 2000);
  };

  const handleStartCompanion = async () => {
    setCompanionStarting(true);
    setCompanionError(null);
    try {
      await startCompanionServer(parseInt(companionPort) || 9400, companionApiKey);
    } catch (e) {
      setCompanionError(e instanceof Error ? e.message : String(e));
    }
    setCompanionStarting(false);
  };

  const handleStopCompanion = async () => {
    setCompanionStopping(true);
    setCompanionError(null);
    try {
      await stopCompanionServer();
    } catch (e) {
      setCompanionError(e instanceof Error ? e.message : String(e));
    }
    setCompanionStopping(false);
  };

  const handleSaveGenAi = async () => {
    setGenAiSaving(true);
    setGenAiSaved(false);
    setGenAiError(null);
    try {
      await setGenAiConfig({
        provider: genAiProvider as GenAiProvider,
        model: genAiModel,
        baseUrl: genAiBaseUrl,
        temperature: Math.max(0, Math.min(1, Number(genAiTemperature) || 0.4)),
        enabled: genAiEnabled,
        systemPrompt: genAiSystemPrompt,
        apiKey: genAiApiKey || undefined,
      });
      setGenAiSaved(true);
      setGenAiApiKey("");
      setTimeout(() => setGenAiSaved(false), 2000);
    } catch (e) {
      setGenAiError(e instanceof Error ? e.message : String(e));
    }
    setGenAiSaving(false);
  };

  const handleRepairAdb = async () => {
    setRepairingAdb(true);
    setDiagnosticsError(null);
    setRepairMessage(null);
    try {
      const result = await repairAdb();
      setRepairMessage(result.message);
      const [validation, adbDiag, emuDiag] = await Promise.all([
        validateSdkTools(),
        getAdbDiagnostics(),
        getEmulatorDiagnostics(),
      ]);
      setToolValidation(validation);
      setAdbDiagnostics(adbDiag);
      setEmulatorDiagnostics(emuDiag);
    } catch (e) {
      setDiagnosticsError(e instanceof Error ? e.message : String(e));
    }
    setRepairingAdb(false);
  };

  const handleRunDiagnostics = async () => {
    setRunningDiagnostics(true);
    setDiagnosticsError(null);
    try {
      const [validation, adbDiag, emuDiag] = await Promise.all([
        validateSdkTools(),
        getAdbDiagnostics(),
        getEmulatorDiagnostics(),
      ]);
      setToolValidation(validation);
      setAdbDiagnostics(adbDiag);
      setEmulatorDiagnostics(emuDiag);
    } catch (e) {
      setDiagnosticsError(e instanceof Error ? e.message : String(e));
    }
    setRunningDiagnostics(false);
  };

  const pathStatusLabel = (status: "exists" | "missing" | "lookup") => {
    if (status === "exists") return "OK";
    if (status === "lookup") return "PATH";
    return "Missing";
  };

  const pathStatusClass = (status: "exists" | "missing" | "lookup") => {
    if (status === "exists") return "text-[var(--success)]";
    if (status === "lookup") return "text-[var(--warning)]";
    return "text-[var(--error)]";
  };

  return (
    <div className="h-full overflow-y-auto p-6">
      <h2 className="text-lg font-semibold mb-6">Settings</h2>

      {/* Android SDK Configuration */}
      <section className="mb-8 max-w-lg">
        <h3 className="text-sm font-semibold text-[var(--text-secondary)] uppercase tracking-wider mb-3">
          Android SDK
        </h3>
        <div className="space-y-3 p-4 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border)]">
          <div>
            <label className="block text-xs text-[var(--text-secondary)] mb-1">
              Android SDK Path
            </label>
            <input
              type="text"
              value={sdkPath}
              onChange={(e) => setSdkPath(e.target.value)}
              placeholder="C:\Users\...\Android\Sdk"
              className="w-full px-3 py-2 rounded-lg bg-[var(--bg-tertiary)] border border-[var(--border)] text-sm text-[var(--text-primary)] font-mono focus:outline-none focus:border-[var(--accent)]"
            />
            <p className="text-[10px] text-[var(--text-secondary)] mt-1">
              Auto-detected from ANDROID_HOME or ANDROID_SDK_ROOT environment variables
            </p>
          </div>
          <div>
            <label className="block text-xs text-[var(--text-secondary)] mb-1">
              Java Home
            </label>
            <input
              type="text"
              value={javaHome}
              onChange={(e) => setJavaHome(e.target.value)}
              placeholder="C:\Program Files\Java\jdk-17"
              className="w-full px-3 py-2 rounded-lg bg-[var(--bg-tertiary)] border border-[var(--border)] text-sm text-[var(--text-primary)] font-mono focus:outline-none focus:border-[var(--accent)]"
            />
            <p className="text-[10px] text-[var(--text-secondary)] mt-1">
              Auto-detected from JAVA_HOME environment variable
            </p>
          </div>
          <div>
            <label className="block text-xs text-[var(--text-secondary)] mb-1">
              Flutter SDK Path (optional)
            </label>
            <input
              type="text"
              value={flutterSdkPath}
              onChange={(e) => setFlutterSdkPath(e.target.value)}
              placeholder="C:\flutter or auto-detected from PATH"
              className="w-full px-3 py-2 rounded-lg bg-[var(--bg-tertiary)] border border-[var(--border)] text-sm text-[var(--text-primary)] font-mono focus:outline-none focus:border-[var(--accent)]"
            />
            <p className="text-[10px] text-[var(--text-secondary)] mt-1">
              Auto-detected from FLUTTER_HOME, FLUTTER_ROOT, or flutter in PATH
            </p>
          </div>
          <div className="flex items-center gap-3 pt-1">
            <button
              onClick={handleSaveSdk}
              className="px-4 py-2 rounded-lg bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white text-sm font-medium transition-colors"
            >
              Save
            </button>
            <button
              onClick={loadSdkConfig}
              className="px-4 py-2 rounded-lg bg-[var(--bg-tertiary)] text-sm text-[var(--text-secondary)] hover:bg-[var(--bg-primary)] transition-colors"
            >
              Reset to Auto-detect
            </button>
            {sdkSaved && (
              <span className="text-xs text-[var(--success)]">Saved</span>
            )}
          </div>
        </div>
      </section>

      {/* GenAI Provider Settings */}
      <section className="mb-8 max-w-3xl">
        <h3 className="text-sm font-semibold text-[var(--text-secondary)] uppercase tracking-wider mb-3">
          GenAI Providers
        </h3>
        <p className="text-xs text-[var(--text-secondary)] mb-3">
          Configure your own API key for OpenRouter, Groq, OpenAI, Anthropic, or a custom compatible endpoint.
        </p>
        <div className="space-y-3 p-4 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border)]">
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-sm text-[var(--text-primary)]">
              <input
                type="checkbox"
                checked={genAiEnabled}
                onChange={(e) => setGenAiEnabled(e.target.checked)}
              />
              Enable GenAI Drafting
            </label>

            <label className="flex items-center gap-2 text-sm text-[var(--text-primary)]">
              <input
                type="checkbox"
                checked={debugMode}
                onChange={(e) => setDebugMode(e.target.checked)}
              />
              Enable Debug Menu
            </label>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs text-[var(--text-secondary)] mb-1">Provider</label>
              <select
                value={genAiProvider}
                onChange={(e) => setGenAiProvider(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-[var(--bg-tertiary)] border border-[var(--border)] text-sm"
              >
                <option value="openrouter">OpenRouter</option>
                <option value="groq">Groq</option>
                <option value="openai">OpenAI</option>
                <option value="anthropic">Anthropic</option>
                <option value="google">Google Gemini API</option>
                <option value="together">Together AI</option>
                <option value="fireworks">Fireworks AI</option>
                <option value="deepseek">DeepSeek</option>
                <option value="xai">xAI</option>
                <option value="mistral">Mistral</option>
                <option value="perplexity">Perplexity</option>
                <option value="custom">Custom (OpenAI-compatible)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs text-[var(--text-secondary)] mb-1">Model</label>
              <input
                type="text"
                value={genAiModel}
                onChange={(e) => setGenAiModel(e.target.value)}
                placeholder="e.g. openai/gpt-4o-mini"
                className="w-full px-3 py-2 rounded-lg bg-[var(--bg-tertiary)] border border-[var(--border)] text-sm font-mono"
              />
            </div>

            <div>
              <label className="block text-xs text-[var(--text-secondary)] mb-1">Temperature</label>
              <input
                type="number"
                min={0}
                max={1}
                step="0.1"
                value={genAiTemperature}
                onChange={(e) => setGenAiTemperature(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-[var(--bg-tertiary)] border border-[var(--border)] text-sm"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs text-[var(--text-secondary)] mb-1">API Base URL</label>
            <input
              type="text"
              value={genAiBaseUrl}
              onChange={(e) => setGenAiBaseUrl(e.target.value)}
              placeholder="https://.../chat/completions"
              className="w-full px-3 py-2 rounded-lg bg-[var(--bg-tertiary)] border border-[var(--border)] text-sm font-mono"
            />
          </div>

          <div>
            <label className="block text-xs text-[var(--text-secondary)] mb-1">API Key</label>
            <input
              type="password"
              value={genAiApiKey}
              onChange={(e) => setGenAiApiKey(e.target.value)}
              placeholder={genAiConfig?.hasApiKey ? `Saved key: ${genAiConfig.apiKeyPreview}` : "Enter provider API key"}
              className="w-full px-3 py-2 rounded-lg bg-[var(--bg-tertiary)] border border-[var(--border)] text-sm font-mono"
            />
            <p className="text-[10px] text-[var(--text-secondary)] mt-1">
              Leave blank to keep currently stored key.
            </p>
          </div>

          <div className="text-[11px] text-[var(--text-secondary)] rounded-lg bg-[var(--bg-tertiary)] border border-[var(--border)] px-3 py-2">
            Prompt guardrail: generated copy should never use em dash punctuation and should not sound AI-generated.
          </div>

          <div>
            <label className="block text-xs text-[var(--text-secondary)] mb-1">System Prompt (style guardrails)</label>
            <textarea
              rows={4}
              value={genAiSystemPrompt}
              onChange={(e) => setGenAiSystemPrompt(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-[var(--bg-tertiary)] border border-[var(--border)] text-sm font-mono"
            />
          </div>

          {genAiError && (
            <div className="px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/30 text-[var(--error)] text-xs">
              {genAiError}
            </div>
          )}

          <div className="flex items-center gap-3">
            <button
              onClick={handleSaveGenAi}
              disabled={genAiSaving}
              className="px-4 py-2 rounded-lg bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white text-sm font-medium transition-colors disabled:opacity-50"
            >
              {genAiSaving ? "Saving..." : "Save GenAI Settings"}
            </button>
            {genAiSaved && <span className="text-xs text-[var(--success)]">Saved</span>}
          </div>
        </div>
      </section>

      {/* Companion Server */}
      <section className="mb-8 max-w-lg">
        <h3 className="text-sm font-semibold text-[var(--text-secondary)] uppercase tracking-wider mb-3">
          Companion Server
        </h3>
        <p className="text-xs text-[var(--text-secondary)] mb-3">
          Start an HTTP/WebSocket server so the Android companion app can connect
          to this Windows machine over the network.
        </p>
        <div className="space-y-3 p-4 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border)]">
          <div className="flex items-center gap-2 mb-2">
            <div
              className={`w-2 h-2 rounded-full ${
                companionRunning ? "bg-[var(--success)]" : "bg-[var(--text-secondary)]"
              }`}
            />
            <span className="text-sm">
              {companionRunning ? "Running" : "Stopped"}
            </span>
          </div>

          <div className="flex gap-3">
            <div className="w-24">
              <label className="block text-xs text-[var(--text-secondary)] mb-1">
                Port
              </label>
              <input
                type="text"
                value={companionPort}
                onChange={(e) => setCompanionPort(e.target.value)}
                placeholder="9400"
                disabled={companionRunning}
                className="w-full px-3 py-2 rounded-lg bg-[var(--bg-tertiary)] border border-[var(--border)] text-sm text-[var(--text-primary)] font-mono focus:outline-none focus:border-[var(--accent)] disabled:opacity-50"
              />
            </div>
            <div className="flex-1">
              <label className="block text-xs text-[var(--text-secondary)] mb-1">
                API Key
              </label>
              <input
                type="text"
                value={companionApiKey}
                onChange={(e) => setCompanionApiKey(e.target.value)}
                placeholder="Auto-generated UUID"
                disabled={companionRunning}
                className="w-full px-3 py-2 rounded-lg bg-[var(--bg-tertiary)] border border-[var(--border)] text-sm text-[var(--text-primary)] font-mono focus:outline-none focus:border-[var(--accent)] disabled:opacity-50"
              />
            </div>
          </div>

          {companionError && (
            <div className="px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-xs">
              {companionError}
            </div>
          )}

          {!companionRunning ? (
            <button
              onClick={handleStartCompanion}
              disabled={companionStarting}
              className="px-4 py-2 rounded-lg bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white text-sm font-medium transition-colors disabled:opacity-50"
            >
              {companionStarting ? "Starting..." : "Start Server"}
            </button>
          ) : (
            <div className="space-y-2">
              <div className="text-xs text-[var(--text-secondary)] p-2 rounded bg-[var(--bg-tertiary)]">
                <p>
                  Companion server is running on <strong>port {companionPort}</strong>.
                </p>
                <p className="mt-1">
                  Share the API key with the Android companion app to connect.
                </p>
              </div>
              <button
                onClick={handleStopCompanion}
                disabled={companionStopping}
                className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white text-sm font-medium transition-colors disabled:opacity-50"
              >
                {companionStopping ? "Stopping..." : "Stop Server"}
              </button>
            </div>
          )}
        </div>
      </section>

      {/* SDK Paths (read-only) */}
      <section className="max-w-lg">
        <h3 className="text-sm font-semibold text-[var(--text-secondary)] uppercase tracking-wider mb-3">
          Detected Tool Paths
        </h3>
        <div className="p-4 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border)] space-y-2 text-sm">
          <Row
            label="adb"
            value={sdkConfig?.adbPath || "N/A"}
          />
          <Row
            label="emulator"
            value={sdkConfig?.emulatorPath || "N/A"}
          />
          <Row
            label="avdmanager"
            value={
              sdkConfig?.androidSdkPath
                ? `${sdkConfig.androidSdkPath}\\cmdline-tools\\latest\\bin\\avdmanager.bat`
                : "N/A"
            }
          />
          <Row label="JAVA_HOME" value={sdkConfig?.javaHome || "Not set"} />
          <Row
            label="flutter"
            value={
              sdkConfig?.flutterSdkPath
                ? `${sdkConfig.flutterSdkPath}\\bin\\flutter.bat`
                : "Not configured"
            }
          />
        </div>
      </section>

      {/* Tool Health & Diagnostics */}
      <section className="mt-8 max-w-3xl">
        <h3 className="text-sm font-semibold text-[var(--text-secondary)] uppercase tracking-wider mb-3">
          Tool Health & Diagnostics
        </h3>
        <div className="p-4 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border)] space-y-3">
          <p className="text-xs text-[var(--text-secondary)]">
            Use these actions to recover ADB and inspect SDK tool health.
          </p>

          <div className="flex flex-wrap gap-2">
            <button
              onClick={handleRepairAdb}
              disabled={repairingAdb || runningDiagnostics}
              className="px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-600 text-white text-sm font-medium transition-colors disabled:opacity-50"
            >
              {repairingAdb ? "Repairing ADB..." : "Repair ADB"}
            </button>
            <button
              onClick={handleRunDiagnostics}
              disabled={repairingAdb || runningDiagnostics}
              className="px-4 py-2 rounded-lg bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white text-sm font-medium transition-colors disabled:opacity-50"
            >
              {runningDiagnostics ? "Running Diagnostics..." : "Run Diagnostics"}
            </button>
          </div>

          {repairMessage && (
            <div className="px-3 py-2 rounded-lg bg-green-500/10 border border-green-500/30 text-[var(--success)] text-sm">
              {repairMessage}
            </div>
          )}

          {diagnosticsError && (
            <div className="px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/30 text-[var(--error)] text-sm whitespace-pre-wrap break-words">
              {diagnosticsError}
            </div>
          )}

          {toolValidation && (
            <div className="space-y-2 text-sm">
              <h4 className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider">
                SDK Path Validation
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                <StatusRow
                  label="adb"
                  value={toolValidation.adbPath}
                  status={pathStatusLabel(toolValidation.adbPathStatus)}
                  statusClass={pathStatusClass(toolValidation.adbPathStatus)}
                />
                <StatusRow
                  label="emulator"
                  value={toolValidation.emulatorPath}
                  status={pathStatusLabel(toolValidation.emulatorPathStatus)}
                  statusClass={pathStatusClass(toolValidation.emulatorPathStatus)}
                />
                <StatusRow
                  label="JAVA_HOME"
                  value={toolValidation.javaHome || "Not set"}
                  status={toolValidation.javaHomeStatus === "exists" ? "OK" : "Missing"}
                  statusClass={
                    toolValidation.javaHomeStatus === "exists"
                      ? "text-[var(--success)]"
                      : "text-[var(--error)]"
                  }
                />
                <StatusRow
                  label="java bin"
                  value={toolValidation.javaBin || "N/A"}
                  status={toolValidation.javaBinStatus === "exists" ? "OK" : "Missing"}
                  statusClass={
                    toolValidation.javaBinStatus === "exists"
                      ? "text-[var(--success)]"
                      : "text-[var(--error)]"
                  }
                />
                <StatusRow
                  label="Flutter SDK"
                  value={toolValidation.flutterSdkPath || "Not configured"}
                  status={
                    toolValidation.flutterSdkPathStatus === "exists" ? "OK" : "Missing"
                  }
                  statusClass={
                    toolValidation.flutterSdkPathStatus === "exists"
                      ? "text-[var(--success)]"
                      : "text-[var(--warning)]"
                  }
                />
                <StatusRow
                  label="flutter bin"
                  value={toolValidation.flutterBin || "N/A"}
                  status={toolValidation.flutterBinStatus === "exists" ? "OK" : "Missing"}
                  statusClass={
                    toolValidation.flutterBinStatus === "exists"
                      ? "text-[var(--success)]"
                      : "text-[var(--warning)]"
                  }
                />
              </div>
            </div>
          )}

          {adbDiagnostics && (
            <div className="space-y-2 text-sm">
              <h4 className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider">
                ADB Diagnostics
              </h4>
              <p className="text-xs text-[var(--text-secondary)] font-mono break-all">
                {adbDiagnostics.version}
              </p>
              <ul className="text-xs text-[var(--text-primary)] space-y-1">
                {adbDiagnostics.details.map((line) => (
                  <li key={line}>
                    {line}
                  </li>
                ))}
              </ul>
              {adbDiagnostics.rawDevices.length > 0 && (
                <div className="px-3 py-2 rounded bg-[var(--bg-tertiary)] border border-[var(--border)]">
                  {adbDiagnostics.rawDevices.map((line) => (
                    <div key={line} className="text-xs font-mono text-[var(--text-primary)] break-all">
                      {line}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {emulatorDiagnostics && (
            <div className="space-y-2 text-sm">
              <h4 className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider">
                Emulator Diagnostics
              </h4>
              <p className="text-xs text-[var(--text-secondary)] font-mono break-all">
                {emulatorDiagnostics.version}
              </p>
              <ul className="text-xs text-[var(--text-primary)] space-y-1">
                {emulatorDiagnostics.details.map((line) => (
                  <li key={line}>
                    {line}
                  </li>
                ))}
              </ul>
              {emulatorDiagnostics.avdNames.length > 0 && (
                <div className="px-3 py-2 rounded bg-[var(--bg-tertiary)] border border-[var(--border)]">
                  {emulatorDiagnostics.avdNames.map((name) => (
                    <div key={name} className="text-xs font-mono text-[var(--text-primary)]">
                      {name}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-[var(--text-secondary)] shrink-0">{label}</span>
      <span className="text-[var(--text-primary)] font-mono text-xs truncate">
        {value}
      </span>
    </div>
  );
}

function StatusRow({
  label,
  value,
  status,
  statusClass,
}: {
  label: string;
  value: string;
  status: string;
  statusClass: string;
}) {
  return (
    <div className="p-2 rounded bg-[var(--bg-tertiary)] border border-[var(--border)]">
      <div className="flex items-center justify-between gap-2 mb-1">
        <span className="text-[10px] text-[var(--text-secondary)] uppercase tracking-wide">
          {label}
        </span>
        <span className={`text-[10px] font-semibold ${statusClass}`}>{status}</span>
      </div>
      <div className="text-xs font-mono text-[var(--text-primary)] truncate" title={value}>
        {value}
      </div>
    </div>
  );
}
