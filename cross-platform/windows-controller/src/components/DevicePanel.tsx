// =============================================================================
// DevicePanel — ADB device listing, screenshots, and device interaction
// =============================================================================

import { useEffect, useState } from "react";
import { useBlitzStore } from "../store";

export function DevicePanel() {
  const devices = useBlitzStore((s) => s.devices);
  const selectedDeviceSerial = useBlitzStore((s) => s.selectedDeviceSerial);
  const deviceScreenshot = useBlitzStore((s) => s.deviceScreenshot);
  const devicesLoading = useBlitzStore((s) => s.devicesLoading);
  const devicesError = useBlitzStore((s) => s.devicesError);
  const loadDevices = useBlitzStore((s) => s.loadDevices);
  const selectDevice = useBlitzStore((s) => s.selectDevice);
  const takeScreenshot = useBlitzStore((s) => s.takeScreenshot);
  const sendDeviceInput = useBlitzStore((s) => s.sendDeviceInput);
  const [refreshing, setRefreshing] = useState(false);
  const [inputText, setInputText] = useState("");

  useEffect(() => {
    loadDevices();
  }, [loadDevices]);

  // Auto-refresh screenshot when a device is selected
  useEffect(() => {
    if (!selectedDeviceSerial) return;
    // Verify device is still connected before taking screenshots
    const deviceConnected = devices.some(
      (d) => d.serial === selectedDeviceSerial && d.status === "device"
    );
    if (!deviceConnected) return;
    takeScreenshot(selectedDeviceSerial);
    const interval = setInterval(() => {
      // Re-check in case device disconnects between intervals
      const stillConnected = useBlitzStore.getState().devices.some(
        (d) => d.serial === selectedDeviceSerial && d.status === "device"
      );
      if (stillConnected) {
        takeScreenshot(selectedDeviceSerial);
      }
    }, 3000);
    return () => clearInterval(interval);
  }, [selectedDeviceSerial, takeScreenshot, devices]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadDevices();
    setRefreshing(false);
  };

  const handleSendText = async () => {
    if (!selectedDeviceSerial || !inputText.trim()) return;
    await sendDeviceInput(selectedDeviceSerial, "inputText", { text: inputText });
    setInputText("");
  };

  const handleKeyEvent = async (keyCode: number) => {
    if (!selectedDeviceSerial) return;
    await sendDeviceInput(selectedDeviceSerial, "keyEvent", { keyCode });
  };

  const selectedDevice = devices.find((d) => d.serial === selectedDeviceSerial);
  const physicalDevices = devices.filter((d) => !d.isEmulator);
  const emulatorDevices = devices.filter((d) => d.isEmulator);

  return (
    <div className="h-full flex">
      {/* Device List */}
      <div className="w-80 border-r border-[var(--border)] overflow-y-auto p-4">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Devices</h2>
          <button
            onClick={handleRefresh}
            disabled={refreshing || devicesLoading}
            className="px-2 py-1 rounded text-xs text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] transition-colors"
          >
            {refreshing ? "..." : "Refresh"}
          </button>
        </div>

        {devices.length === 0 && (
          <div className="p-4 rounded-lg bg-[var(--bg-tertiary)] text-center text-sm text-[var(--text-secondary)]">
            No devices found. Connect an Android device via USB or start an emulator.
          </div>
        )}

        {devicesError && (
          <div className="mt-3 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-xs text-[var(--error)] whitespace-pre-wrap break-words">
            {devicesError}
          </div>
        )}

        {physicalDevices.length > 0 && (
          <div className="mb-4">
            <h3 className="text-[10px] font-semibold uppercase tracking-wider text-[var(--success)] mb-2">
              Physical Devices ({physicalDevices.length})
            </h3>
            {physicalDevices.map((device) => (
              <DeviceRow
                key={device.serial}
                device={device}
                isSelected={device.serial === selectedDeviceSerial}
                onSelect={() => selectDevice(device.serial)}
              />
            ))}
          </div>
        )}

        {emulatorDevices.length > 0 && (
          <div>
            <h3 className="text-[10px] font-semibold uppercase tracking-wider text-[var(--accent)] mb-2">
              Emulators ({emulatorDevices.length})
            </h3>
            {emulatorDevices.map((device) => (
              <DeviceRow
                key={device.serial}
                device={device}
                isSelected={device.serial === selectedDeviceSerial}
                onSelect={() => selectDevice(device.serial)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Device Detail / Screenshot */}
      <div className="flex-1 flex flex-col bg-[var(--bg-primary)]">
        {selectedDevice ? (
          <>
            {/* Device Info Bar */}
            <div className="px-6 py-3 border-b border-[var(--border)] flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold">
                  {selectedDevice.model || selectedDevice.serial}
                </h3>
                <p className="text-xs text-[var(--text-secondary)]">
                  Android {selectedDevice.androidVersion} &middot; API{" "}
                  {selectedDevice.apiLevel} &middot; {selectedDevice.serial}
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => takeScreenshot(selectedDevice.serial)}
                  className="px-3 py-1.5 rounded-lg bg-[var(--bg-tertiary)] text-xs text-[var(--text-primary)] hover:bg-[var(--accent)] transition-colors"
                >
                  Screenshot
                </button>
              </div>
            </div>

            {/* Screenshot + Controls */}
            <div className="flex-1 flex overflow-hidden">
              {/* Screenshot area */}
              <div className="flex-1 flex items-center justify-center p-8">
                {deviceScreenshot ? (
                  <img
                    src={deviceScreenshot}
                    alt="Device screen"
                    className="max-h-[80vh] rounded-2xl shadow-2xl border border-[var(--border)]"
                  />
                ) : (
                  <div className="text-center">
                    <div className="text-6xl mb-4 opacity-20">{"\u25A1"}</div>
                    <p className="text-sm text-[var(--text-secondary)]">
                      Loading screenshot...
                    </p>
                  </div>
                )}
              </div>

              {/* Quick Actions Sidebar */}
              <div className="w-64 border-l border-[var(--border)] p-4 overflow-y-auto">
                <h4 className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider mb-3">
                  Quick Actions
                </h4>

                {/* Navigation keys */}
                <div className="space-y-2 mb-4">
                  <button
                    onClick={() => handleKeyEvent(3)}
                    className="w-full px-3 py-2 rounded-lg bg-[var(--bg-tertiary)] text-xs text-[var(--text-primary)] hover:bg-[var(--bg-secondary)] transition-colors"
                  >
                    Home (KEYCODE_HOME)
                  </button>
                  <button
                    onClick={() => handleKeyEvent(4)}
                    className="w-full px-3 py-2 rounded-lg bg-[var(--bg-tertiary)] text-xs text-[var(--text-primary)] hover:bg-[var(--bg-secondary)] transition-colors"
                  >
                    Back (KEYCODE_BACK)
                  </button>
                  <button
                    onClick={() => handleKeyEvent(187)}
                    className="w-full px-3 py-2 rounded-lg bg-[var(--bg-tertiary)] text-xs text-[var(--text-primary)] hover:bg-[var(--bg-secondary)] transition-colors"
                  >
                    Recents (KEYCODE_APP_SWITCH)
                  </button>
                  <button
                    onClick={() => handleKeyEvent(26)}
                    className="w-full px-3 py-2 rounded-lg bg-[var(--bg-tertiary)] text-xs text-[var(--text-primary)] hover:bg-[var(--bg-secondary)] transition-colors"
                  >
                    Power (KEYCODE_POWER)
                  </button>
                </div>

                {/* Text input */}
                <h4 className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider mb-2">
                  Input Text
                </h4>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleSendText()}
                    placeholder="Type text..."
                    className="flex-1 px-2 py-1.5 rounded-lg bg-[var(--bg-tertiary)] border border-[var(--border)] text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]"
                  />
                  <button
                    onClick={handleSendText}
                    className="px-2 py-1.5 rounded-lg bg-[var(--accent)] text-xs text-white hover:bg-[var(--accent-hover)] transition-colors"
                  >
                    Send
                  </button>
                </div>
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <div className="text-6xl mb-4 opacity-20">{"\u260E"}</div>
              <p className="text-sm text-[var(--text-secondary)]">
                Select a device to view its screen and interact with it
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function DeviceRow({
  device,
  isSelected,
  onSelect,
}: {
  device: {
    serial: string;
    model: string;
    status: string;
    androidVersion: string;
    apiLevel: number;
    isEmulator: boolean;
  };
  isSelected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      onClick={onSelect}
      className={`w-full text-left p-2.5 rounded-lg mb-1 transition-colors ${
        isSelected
          ? "bg-indigo-500/10 border border-indigo-500/30"
          : "hover:bg-[var(--bg-tertiary)]"
      }`}
    >
      <div className="flex items-center gap-2">
        <div
          className={`w-2 h-2 rounded-full shrink-0 ${
            device.status === "device"
              ? "bg-[var(--success)]"
              : device.status === "unauthorized"
                ? "bg-[var(--warning)]"
                : "bg-[var(--text-secondary)]"
          }`}
        />
        <p className="text-sm font-medium text-[var(--text-primary)] truncate">
          {device.model || device.serial}
        </p>
      </div>
      <p className="text-[10px] text-[var(--text-secondary)] mt-0.5 ml-4">
        {device.status} &middot; Android {device.androidVersion || "?"} &middot;{" "}
        <span className="font-mono">{device.serial}</span>
      </p>
    </button>
  );
}
