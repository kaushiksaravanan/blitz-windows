// =============================================================================
// Blitz Windows Controller — Main App Component
// =============================================================================

import { useEffect } from "react";
import { useBlitzStore } from "./store";
import { Sidebar } from "./components/Sidebar";
import { Dashboard } from "./components/Dashboard";
import { DevicePanel } from "./components/DevicePanel";
import { EmulatorPanel } from "./components/EmulatorPanel";
import { GradleBuildPanel } from "./components/GradleBuildPanel";
import { LogcatViewer } from "./components/LogcatViewer";
import { ApkManager } from "./components/ApkManager";
import { ProjectPanel } from "./components/ProjectPanel";
import { SettingsPanel } from "./components/SettingsPanel";
import { PlayStorePanel } from "./components/PlayStorePanel";
import { AutomationPanel } from "./components/AutomationPanel";

export function App() {
  const activeTab = useBlitzStore((s) => s.activeTab);
  const initialized = useBlitzStore((s) => s.initialized);
  const initError = useBlitzStore((s) => s.initError);
  const initialize = useBlitzStore((s) => s.initialize);

  useEffect(() => {
    initialize();
    // initialize is a stable Zustand action — no need to list as dependency
  }, []);

  if (!initialized) {
    return (
      <div className="flex items-center justify-center h-screen w-screen bg-[var(--bg-primary)]">
        <div className="text-center">
          <div className="text-2xl font-bold text-[var(--text-primary)] mb-2">
            Blitz
          </div>
          <p className="text-sm text-[var(--text-secondary)]">
            Initializing Android SDK...
          </p>
        </div>
      </div>
    );
  }

  if (initError) {
    return (
      <div className="flex items-center justify-center h-screen w-screen bg-[var(--bg-primary)]">
        <div className="max-w-md text-center p-8 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border)]">
          <div className="text-2xl font-bold text-[var(--text-primary)] mb-2">
            Blitz
          </div>
          <p className="text-sm text-[var(--error)] mb-4">
            Failed to initialize: {initError}
          </p>
          <p className="text-xs text-[var(--text-secondary)] mb-4">
            Make sure Android SDK is installed and ANDROID_HOME is set.
          </p>
          <button
            onClick={initialize}
            className="px-6 py-2 rounded-lg bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white font-medium text-sm transition-colors"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[var(--bg-primary)]">
      <Sidebar />
      <main className="flex-1 overflow-hidden">
        {activeTab === "dashboard" && <Dashboard />}
        {activeTab === "devices" && <DevicePanel />}
        {activeTab === "emulators" && <EmulatorPanel />}
        {activeTab === "builds" && <GradleBuildPanel />}
        {activeTab === "logcat" && <LogcatViewer />}
        {activeTab === "apk-manager" && <ApkManager />}
        {activeTab === "projects" && <ProjectPanel />}
        {activeTab === "publish" && <PlayStorePanel />}
        {activeTab === "automation" && <AutomationPanel />}
        {activeTab === "settings" && <SettingsPanel />}
      </main>
    </div>
  );
}
