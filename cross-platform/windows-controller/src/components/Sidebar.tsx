// =============================================================================
// Sidebar — Navigation sidebar for Android development tools
// =============================================================================

import { useBlitzStore, type ActiveTab } from "../store";

type Tab = {
  id: ActiveTab;
  label: string;
  icon: string;
};

const DEVELOP_TABS: Tab[] = [
  { id: "dashboard", label: "Dashboard", icon: "grid" },
  { id: "devices", label: "Devices", icon: "phone" },
  { id: "emulators", label: "Emulators", icon: "monitor" },
  { id: "builds", label: "Builds", icon: "hammer" },
];

const TOOLS_TABS: Tab[] = [
  { id: "logcat", label: "Logcat", icon: "terminal" },
  { id: "apk-manager", label: "APK Manager", icon: "package" },
  { id: "projects", label: "Projects", icon: "folder" },
];

const SYSTEM_TABS: Tab[] = [
  { id: "settings", label: "Settings", icon: "settings" },
];

function TabGroup({ label, tabs }: { label: string; tabs: Tab[] }) {
  const activeTab = useBlitzStore((s) => s.activeTab);
  const setActiveTab = useBlitzStore((s) => s.setActiveTab);

  return (
    <div className="mb-4">
      <h3 className="px-3 mb-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
        {label}
      </h3>
      {tabs.map((tab) => (
        <button
          key={tab.id}
          onClick={() => setActiveTab(tab.id)}
          className={`w-full flex items-center gap-2.5 px-3 py-1.5 rounded-md text-sm transition-colors ${
            activeTab === tab.id
              ? "bg-[var(--accent)] text-white"
              : "text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)]"
          }`}
        >
          <span className="w-4 text-center text-xs">{getIcon(tab.icon)}</span>
          {tab.label}
        </button>
      ))}
    </div>
  );
}

function getIcon(name: string): string {
  const icons: Record<string, string> = {
    grid: "\u25A6",
    phone: "\u260E",
    monitor: "\u25A3",
    hammer: "\u2692",
    terminal: "\u25B6",
    package: "\u25A0",
    folder: "\u25C7",
    settings: "\u2699",
  };
  return icons[name] || "\u25CF";
}

export function Sidebar() {
  const devices = useBlitzStore((s) => s.devices);
  const sdkConfig = useBlitzStore((s) => s.sdkConfig);
  const companionRunning = useBlitzStore((s) => s.companionRunning);

  const connectedCount = devices.filter(
    (d) => d.type === "device" || d.type === "emulator"
  ).length;

  return (
    <aside className="w-52 h-full bg-[var(--bg-secondary)] border-r border-[var(--border)] flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-[var(--border)]">
        <h1 className="text-lg font-bold text-[var(--text-primary)]">Blitz</h1>
        <p className="text-[10px] text-[var(--text-secondary)] mt-0.5">
          Android Development Tools
        </p>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-2 overflow-y-auto">
        <TabGroup label="Develop" tabs={DEVELOP_TABS} />
        <TabGroup label="Tools" tabs={TOOLS_TABS} />
        <TabGroup label="System" tabs={SYSTEM_TABS} />
      </nav>

      {/* Status Footer */}
      <div className="p-3 border-t border-[var(--border)] space-y-1.5">
        <div className="flex items-center gap-2">
          <div
            className={`w-2 h-2 rounded-full ${
              connectedCount > 0 ? "bg-[var(--success)]" : "bg-[var(--text-secondary)]"
            }`}
          />
          <span className="text-xs text-[var(--text-secondary)]">
            {connectedCount} device{connectedCount !== 1 ? "s" : ""} connected
          </span>
        </div>
        {companionRunning && (
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-[var(--accent)]" />
            <span className="text-xs text-[var(--text-secondary)]">
              Companion server active
            </span>
          </div>
        )}
        {sdkConfig && (
          <p className="text-[9px] text-[var(--text-secondary)] truncate font-mono">
            SDK: {sdkConfig.android_sdk_path}
          </p>
        )}
      </div>
    </aside>
  );
}
