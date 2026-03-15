// =============================================================================
// ApkManager — Install, uninstall, and list APKs on connected devices
// =============================================================================

import { useState } from "react";
import { useBlitzStore } from "../store";
import { open } from "@tauri-apps/plugin-dialog";

export function ApkManager() {
  const devices = useBlitzStore((s) => s.devices);
  const packages = useBlitzStore((s) => s.packages);
  const packagesLoading = useBlitzStore((s) => s.packagesLoading);
  const packagesSerial = useBlitzStore((s) => s.packagesSerial);
  const loadPackages = useBlitzStore((s) => s.loadPackages);
  const installApk = useBlitzStore((s) => s.installApk);
  const uninstallPackage = useBlitzStore((s) => s.uninstallPackage);

  const [selectedSerial, setSelectedSerial] = useState("");
  const [searchFilter, setSearchFilter] = useState("");
  const [installing, setInstalling] = useState(false);
  const [uninstalling, setUninstalling] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const handleSelectDevice = async (serial: string) => {
    setSelectedSerial(serial);
    setMessage(null);
    if (serial) {
      await loadPackages(serial);
    }
  };

  const handleInstallApk = async () => {
    if (!selectedSerial) return;
    setMessage(null);

    try {
      const filePath = await open({
        filters: [{ name: "Android Package", extensions: ["apk"] }],
        multiple: false,
      });

      if (!filePath) return; // User cancelled

      setInstalling(true);
      await installApk(selectedSerial, filePath as string);
      setMessage({ type: "success", text: "APK installed successfully" });
      // Refresh package list
      await loadPackages(selectedSerial);
    } catch (e) {
      setMessage({
        type: "error",
        text: e instanceof Error ? e.message : String(e),
      });
    }
    setInstalling(false);
  };

  const handleUninstall = async (packageName: string) => {
    if (!selectedSerial) return;
    setMessage(null);
    setUninstalling(packageName);
    try {
      await uninstallPackage(selectedSerial, packageName);
      setMessage({ type: "success", text: `${packageName} uninstalled` });
    } catch (e) {
      setMessage({
        type: "error",
        text: e instanceof Error ? e.message : String(e),
      });
    }
    setUninstalling(null);
  };

  const filteredPackages = packages.filter((p) =>
    p.toLowerCase().includes(searchFilter.toLowerCase())
  );

  return (
    <div className="h-full flex flex-col">
      {/* Header + Controls */}
      <div className="p-4 border-b border-[var(--border)]">
        <h2 className="text-lg font-semibold mb-4">APK Manager</h2>

        <div className="flex gap-3 items-end">
          {/* Device Selector */}
          <div className="w-64">
            <label className="block text-xs text-[var(--text-secondary)] mb-1">
              Device
            </label>
            <select
              value={selectedSerial}
              onChange={(e) => handleSelectDevice(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-[var(--bg-tertiary)] border border-[var(--border)] text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]"
            >
              <option value="">Select device...</option>
              {devices.map((d) => (
                <option key={d.serial} value={d.serial}>
                  {d.model || d.serial} ({d.serial})
                </option>
              ))}
            </select>
          </div>

          {/* Install APK */}
          <button
            onClick={handleInstallApk}
            disabled={!selectedSerial || installing}
            className="px-4 py-2 rounded-lg bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white font-medium text-sm transition-colors disabled:opacity-50"
          >
            {installing ? "Installing..." : "Install APK..."}
          </button>

          {/* Refresh */}
          <button
            onClick={() => selectedSerial && loadPackages(selectedSerial)}
            disabled={!selectedSerial || packagesLoading}
            className="px-4 py-2 rounded-lg bg-[var(--bg-tertiary)] text-sm text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)] transition-colors disabled:opacity-50"
          >
            Refresh
          </button>
        </div>

        {message && (
          <div
            className={`mt-3 px-3 py-2 rounded-lg text-sm ${
              message.type === "success"
                ? "bg-green-500/10 border border-green-500/30 text-[var(--success)]"
                : "bg-red-500/10 border border-red-500/30 text-[var(--error)]"
            }`}
          >
            {message.text}
          </div>
        )}
      </div>

      {/* Package List */}
      <div className="flex-1 overflow-hidden flex flex-col">
        {selectedSerial && (
          <div className="px-4 py-2 border-b border-[var(--border)]">
            <input
              type="text"
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
              placeholder="Search packages..."
              className="w-full px-3 py-2 rounded-lg bg-[var(--bg-tertiary)] border border-[var(--border)] text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]"
            />
            <p className="text-[10px] text-[var(--text-secondary)] mt-1">
              {filteredPackages.length} / {packages.length} packages
              {packagesSerial && ` on ${packagesSerial}`}
            </p>
          </div>
        )}

        <div className="flex-1 overflow-y-auto">
          {!selectedSerial ? (
            <div className="h-full flex items-center justify-center">
              <div className="text-center">
                <div className="text-4xl mb-3 opacity-20">{"\u25A0"}</div>
                <p className="text-sm text-[var(--text-secondary)]">
                  Select a device to manage its packages
                </p>
              </div>
            </div>
          ) : packagesLoading ? (
            <div className="h-full flex items-center justify-center text-sm text-[var(--text-secondary)]">
              Loading packages...
            </div>
          ) : filteredPackages.length === 0 ? (
            <div className="h-full flex items-center justify-center text-sm text-[var(--text-secondary)]">
              {searchFilter ? "No packages match the filter" : "No packages found"}
            </div>
          ) : (
            <div className="divide-y divide-[var(--border)]">
              {filteredPackages.map((pkg) => (
                <div
                  key={pkg}
                  className="flex items-center justify-between px-4 py-2 hover:bg-[var(--bg-secondary)] transition-colors"
                >
                  <span className="text-sm font-mono text-[var(--text-primary)] truncate">
                    {pkg}
                  </span>
                  <button
                    onClick={() => handleUninstall(pkg)}
                    disabled={uninstalling === pkg}
                    className="shrink-0 ml-3 px-2.5 py-1 rounded text-[10px] font-medium text-[var(--error)] bg-red-500/10 hover:bg-red-500/20 transition-colors disabled:opacity-50"
                  >
                    {uninstalling === pkg ? "..." : "Uninstall"}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
