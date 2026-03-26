// =============================================================================
// Dashboard — Overview of devices, emulators, builds, and projects
// =============================================================================

import { useEffect } from "react";
import { useBlitzStore } from "../store";

export function Dashboard() {
  const devices = useBlitzStore((s) => s.devices);
  const avds = useBlitzStore((s) => s.avds);
  const builds = useBlitzStore((s) => s.builds);
  const projects = useBlitzStore((s) => s.projects);
  const sdkConfig = useBlitzStore((s) => s.sdkConfig);
  const companionRunning = useBlitzStore((s) => s.companionRunning);
  const loadDevices = useBlitzStore((s) => s.loadDevices);
  const loadAvds = useBlitzStore((s) => s.loadAvds);
  const setActiveTab = useBlitzStore((s) => s.setActiveTab);

  // Refresh devices periodically
  useEffect(() => {
    const interval = setInterval(() => {
      loadDevices();
      loadAvds();
    }, 10000);
    return () => clearInterval(interval);
  }, [loadDevices, loadAvds]);

  const connectedDevices = devices.filter((d) => d.status === "device");
  const runningEmulators = devices.filter((d) => d.isEmulator && d.status !== "offline");
  const activeBuilds = builds.filter(
    (b) => b.phase !== "complete" && b.phase !== "failed" && b.phase !== "cancelled"
  );

  return (
    <div className="h-full overflow-y-auto p-6">
      <h2 className="text-xl font-semibold mb-6">Dashboard</h2>

      {/* Status Cards */}
      <div className="grid grid-cols-4 gap-4 mb-8">
        <StatusCard
          label="Physical Devices"
          value={`${connectedDevices.length} connected`}
          color={connectedDevices.length > 0 ? "success" : "default"}
          onClick={() => setActiveTab("devices")}
        />
        <StatusCard
          label="Emulators"
          value={`${runningEmulators.length} running / ${avds.length} available`}
          color={runningEmulators.length > 0 ? "success" : "default"}
          onClick={() => setActiveTab("emulators")}
        />
        <StatusCard
          label="Active Builds"
          value={`${activeBuilds.length}`}
          color={activeBuilds.length > 0 ? "warning" : "default"}
          onClick={() => setActiveTab("builds")}
        />
        <StatusCard
          label="Projects"
          value={`${projects.length}`}
          color="default"
          onClick={() => setActiveTab("projects")}
        />
      </div>

      {/* SDK Info */}
      <section className="mb-8">
        <h3 className="text-sm font-semibold text-[var(--text-secondary)] uppercase tracking-wider mb-3">
          Environment
        </h3>
        <div className="p-4 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border)] grid grid-cols-2 gap-3 text-sm">
          <InfoRow label="Android SDK" value={sdkConfig?.androidSdkPath || "Not configured"} />
          <InfoRow label="Java Home" value={sdkConfig?.javaHome || "Not configured"} />
          <InfoRow
            label="Companion Server"
            value={companionRunning ? "Running" : "Stopped"}
            valueColor={companionRunning ? "success" : "default"}
          />
          <InfoRow label="Platform" value="Windows" />
        </div>
      </section>

      {/* Connected Devices */}
      <section className="mb-8">
        <h3 className="text-sm font-semibold text-[var(--text-secondary)] uppercase tracking-wider mb-3">
          Connected Devices
        </h3>
        {devices.length === 0 ? (
          <div className="p-6 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border)] text-center text-sm text-[var(--text-secondary)]">
            No devices connected. Plug in an Android device or start an emulator.
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {devices.map((device) => (
              <div
                key={device.serial}
                onClick={() => {
                  useBlitzStore.getState().selectDevice(device.serial);
                  setActiveTab("devices");
                }}
                className="p-4 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border)] hover:border-[var(--accent)] cursor-pointer transition-colors"
              >
                <div className="flex items-center gap-2 mb-1">
                  <div
                    className={`w-2 h-2 rounded-full ${
                      device.status === "device"
                        ? "bg-[var(--success)]"
                        : device.status === "unauthorized"
                          ? "bg-[var(--warning)]"
                          : "bg-[var(--text-secondary)]"
                    }`}
                  />
                  <h4 className="font-medium text-[var(--text-primary)]">
                    {device.model || device.serial}
                  </h4>
                </div>
                <p className="text-xs text-[var(--text-secondary)]">
                  {device.isEmulator ? "Emulator" : "Physical"} &middot;{" "}
                  Android {device.androidVersion || "?"} &middot; API {device.apiLevel || "?"}
                </p>
                <p className="text-[10px] text-[var(--text-secondary)] font-mono mt-1">
                  {device.serial}
                </p>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Recent Builds */}
      <section>
        <h3 className="text-sm font-semibold text-[var(--text-secondary)] uppercase tracking-wider mb-3">
          Recent Builds
        </h3>
        {builds.length === 0 ? (
          <div className="p-6 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border)] text-center text-sm text-[var(--text-secondary)]">
            No builds yet. Start a Gradle build from the Builds tab.
          </div>
        ) : (
          <div className="space-y-2">
            {builds.slice(-5).reverse().map((build) => (
              <div
                key={build.id}
                className="flex items-center justify-between p-3 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border)]"
              >
                <div>
                  <span className="text-sm font-medium">
                    {build.task}
                  </span>
                  <span className="text-xs text-[var(--text-secondary)] ml-3">
                    {build.phase}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  {build.phase !== "complete" && build.phase !== "failed" && (
                    <div className="w-24 h-1.5 bg-[var(--bg-tertiary)] rounded-full overflow-hidden">
                      <div
                        className="h-full bg-[var(--accent)] rounded-full transition-all"
                        style={{ width: `${build.progress}%` }}
                      />
                    </div>
                  )}
                  <span
                    className={`text-xs font-medium ${
                      build.phase === "complete"
                        ? "text-[var(--success)]"
                        : build.phase === "failed"
                          ? "text-[var(--error)]"
                          : "text-[var(--text-secondary)]"
                    }`}
                  >
                    {build.phase === "complete" || build.phase === "failed"
                      ? build.phase
                      : `${build.progress}%`}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function StatusCard({
  label,
  value,
  color,
  onClick,
}: {
  label: string;
  value: string;
  color: "success" | "error" | "warning" | "default";
  onClick?: () => void;
}) {
  const colorMap = {
    success: "text-[var(--success)]",
    error: "text-[var(--error)]",
    warning: "text-[var(--warning)]",
    default: "text-[var(--text-primary)]",
  };

  return (
    <div
      onClick={onClick}
      className="p-4 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border)] hover:border-[var(--accent)] cursor-pointer transition-colors"
    >
      <p className="text-xs text-[var(--text-secondary)] mb-1">{label}</p>
      <p className={`text-sm font-semibold ${colorMap[color]}`}>{value}</p>
    </div>
  );
}

function InfoRow({
  label,
  value,
  valueColor = "default",
}: {
  label: string;
  value: string;
  valueColor?: "success" | "error" | "default";
}) {
  const colorMap = {
    success: "text-[var(--success)]",
    error: "text-[var(--error)]",
    default: "text-[var(--text-primary)]",
  };

  return (
    <div className="flex justify-between">
      <span className="text-[var(--text-secondary)]">{label}</span>
      <span className={`font-mono text-xs truncate ml-2 ${colorMap[valueColor]}`}>
        {value}
      </span>
    </div>
  );
}
