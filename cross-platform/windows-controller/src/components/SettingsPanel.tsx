// =============================================================================
// SettingsPanel — Android SDK configuration and companion server settings
// =============================================================================

import { useEffect, useState } from "react";
import { useBlitzStore } from "../store";

export function SettingsPanel() {
  const sdkConfig = useBlitzStore((s) => s.sdkConfig);
  const companionConfig = useBlitzStore((s) => s.companionConfig);
  const companionRunning = useBlitzStore((s) => s.companionRunning);
  const setSdkConfig = useBlitzStore((s) => s.setSdkConfig);
  const loadSdkConfig = useBlitzStore((s) => s.loadSdkConfig);
  const startCompanionServer = useBlitzStore((s) => s.startCompanionServer);

  // SDK fields
  const [sdkPath, setSdkPath] = useState("");
  const [javaHome, setJavaHome] = useState("");
  const [flutterSdkPath, setFlutterSdkPath] = useState("");
  const [sdkSaved, setSdkSaved] = useState(false);

  // Companion fields
  const [companionPort, setCompanionPort] = useState("9400");
  const [companionApiKey, setCompanionApiKey] = useState("");
  const [companionStarting, setCompanionStarting] = useState(false);
  const [companionError, setCompanionError] = useState<string | null>(null);

  // Load current values
  useEffect(() => {
    if (sdkConfig) {
      setSdkPath(sdkConfig.android_sdk_path);
      setJavaHome(sdkConfig.java_home);
      setFlutterSdkPath(sdkConfig.flutter_sdk_path ?? "");
    }
  }, [sdkConfig]);

  useEffect(() => {
    if (companionConfig) {
      setCompanionPort(companionConfig.port.toString());
      setCompanionApiKey(companionConfig.api_key);
    }
  }, [companionConfig]);

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
            <div className="text-xs text-[var(--text-secondary)] p-2 rounded bg-[var(--bg-tertiary)]">
              <p>
                Companion server is running on <strong>port {companionPort}</strong>.
              </p>
              <p className="mt-1">
                Share the API key with the Android companion app to connect.
                The server will stop when Blitz is closed.
              </p>
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
            value={sdkPath ? `${sdkPath}\\platform-tools\\adb.exe` : "N/A"}
          />
          <Row
            label="emulator"
            value={sdkPath ? `${sdkPath}\\emulator\\emulator.exe` : "N/A"}
          />
          <Row
            label="avdmanager"
            value={
              sdkPath
                ? `${sdkPath}\\cmdline-tools\\latest\\bin\\avdmanager.bat`
                : "N/A"
            }
          />
          <Row label="JAVA_HOME" value={javaHome || "Not set"} />
          <Row
            label="flutter"
            value={
              flutterSdkPath
                ? `${flutterSdkPath}\\bin\\flutter.bat`
                : "Not configured"
            }
          />
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
