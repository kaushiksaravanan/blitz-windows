// Preload script — exposes safe IPC bridge to renderer
// This runs in a sandboxed context with access to Node.js APIs

import { contextBridge, ipcRenderer } from "electron";

const ALLOWED_INVOKE_CHANNELS = new Set<string>([
  "get_sdk_config",
  "set_sdk_config",
  "list_devices",
  "get_device_details",
  "take_screenshot",
  "device_input",
  "install_apk",
  "uninstall_package",
  "list_packages",
  "get_logcat",
  "clear_logcat",
  "list_avds",
  "start_avd",
  "stop_avd",
  "start_build",
  "get_build_status",
  "list_projects",
  "add_project",
  "remove_project",
  "get_companion_config",
  "start_companion_server",
  "stop_companion_server",
  "show_open_dialog",
  "playstore_get_state",
  "playstore_reset",
  "playstore_analyze",
  "playstore_generate_assets",
  "playstore_connect_browser",
  "playstore_publish",
  "playstore_record_demo",
  "playstore_get_asset_defaults",
  "genai_get_config",
  "genai_set_config",
  "genai_generate_store_draft",
  "genai_review_text",
  "repair_adb",
  "adb_diagnostics",
  "emulator_diagnostics",
  "validate_sdk_tools",
  "ui_automation_get_state",
  "ui_automation_pause",
  "ui_automation_resume",
  "ui_automation_stop",
  "ui_automation_run",
]);

const ALLOWED_EVENT_CHANNELS = new Set<string>([
  "build-log",
  "build-status",
  "playstore-state",
  "playstore-log",
  "ui-automation-state",
  "ui-automation-log",
  "companion-event",
]);

function assertAllowedInvoke(channel: string): void {
  if (!ALLOWED_INVOKE_CHANNELS.has(channel)) {
    throw new Error(`Blocked IPC invoke channel: ${channel}`);
  }
}

function assertAllowedEvent(channel: string): void {
  if (!ALLOWED_EVENT_CHANNELS.has(channel)) {
    throw new Error(`Blocked IPC event channel: ${channel}`);
  }
}

// Expose a typed API to the renderer process
contextBridge.exposeInMainWorld("electronAPI", {
  // Generic invoke — maps to ipcMain.handle channels
  invoke: (channel: string, ...args: any[]) => {
    assertAllowedInvoke(channel);
    return ipcRenderer.invoke(channel, ...args);
  },

  // Event listeners (for build-log, build-status, etc.)
  on: (channel: string, callback: (...args: any[]) => void) => {
    assertAllowedEvent(channel);
    const listener = (_event: Electron.IpcRendererEvent, ...args: any[]) =>
      callback(...args);
    ipcRenderer.on(channel, listener);
    // Return cleanup function
    return () => ipcRenderer.removeListener(channel, listener);
  },

  // One-time event listener
  once: (channel: string, callback: (...args: any[]) => void) => {
    assertAllowedEvent(channel);
    ipcRenderer.once(channel, (_event, ...args) => callback(...args));
  },
});
