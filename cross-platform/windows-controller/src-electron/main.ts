// Electron main process — app entry point

import { app, BrowserWindow } from "electron";
import path from "path";
import { registerIpcHandlers } from "./ipc-handlers";
import { stopCompanionServer } from "./services/companion-server";

let mainWindow: BrowserWindow | null = null;
let isQuitting = false;
let reopenTimer: ReturnType<typeof setTimeout> | null = null;

const isDev = !app.isPackaged;

if (isDev) {
  // Avoid noisy cache permission warnings on locked enterprise environments.
  app.commandLine.appendSwitch("disable-http-cache");
  app.commandLine.appendSwitch("disable-gpu-shader-disk-cache");
}

function createWindow() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.show();
    mainWindow.focus();
    return;
  }

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 600,
    title: "Blitz — Android Dev Tools for Windows",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false, // needed for preload contextBridge
    },
  });

  if (isDev) {
    // In dev, load from Vite dev server
    void mainWindow.loadURL("http://localhost:1420").catch((err) => {
      console.error("Failed to load dev URL:", err);
      scheduleWindowReopen(1500);
    });
    if (process.env.BLITZ_OPEN_DEVTOOLS === "1") {
      mainWindow.webContents.openDevTools();
    }
  } else {
    // In production, load built files
    void mainWindow.loadFile(path.join(__dirname, "..", "dist", "index.html")).catch((err) => {
      console.error("Failed to load production UI:", err);
      scheduleWindowReopen(1500);
    });
  }

  mainWindow.on("close", (event) => {
    if (isQuitting) return;
    event.preventDefault();
    if (mainWindow && !mainWindow.isDestroyed()) {
      if (mainWindow.isFullScreen()) {
        mainWindow.setFullScreen(false);
      }
      mainWindow.minimize();
    }
  });

  mainWindow.webContents.on("render-process-gone", (_event, details) => {
    console.error("Renderer process gone:", details.reason);
    if (!isQuitting) {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.destroy();
      }
      scheduleWindowReopen(1200);
    }
  });

  mainWindow.webContents.on("unresponsive", () => {
    console.warn("Renderer became unresponsive, reloading");
    if (!isQuitting && mainWindow && !mainWindow.isDestroyed()) {
      void mainWindow.webContents.reload();
    }
  });

  mainWindow.webContents.on("did-fail-load", (_event, code, description) => {
    if (code === -3) return;
    console.error(`Window failed to load: [${code}] ${description}`);
    if (!isQuitting) {
      scheduleWindowReopen(1500);
    }
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
    if (!isQuitting) {
      scheduleWindowReopen(1200);
    }
  });
}

function scheduleWindowReopen(delayMs: number): void {
  if (isQuitting) return;
  if (reopenTimer) return;
  reopenTimer = setTimeout(() => {
    reopenTimer = null;
    if (!mainWindow || mainWindow.isDestroyed()) {
      createWindow();
      return;
    }

    if (isDev) {
      void mainWindow.loadURL("http://localhost:1420").catch((err) => {
        console.error("Retry load failed (dev):", err);
        scheduleWindowReopen(1500);
      });
    } else {
      void mainWindow.loadFile(path.join(__dirname, "..", "dist", "index.html")).catch((err) => {
        console.error("Retry load failed (prod):", err);
        scheduleWindowReopen(1500);
      });
    }
  }, delayMs);
}

app.whenReady().then(() => {
  // Register IPC handlers after app is ready (avoids sync subprocess calls during module init)
  registerIpcHandlers(() => mainWindow);
  createWindow();

  app.on("activate", () => {
    if (!mainWindow || mainWindow.isDestroyed()) {
      createWindow();
    } else {
      mainWindow.show();
      mainWindow.focus();
    }
  });
});

app.on("window-all-closed", () => {
  if (isQuitting) {
    app.quit();
  }
});

app.on("before-quit", () => {
  isQuitting = true;
  if (reopenTimer) {
    clearTimeout(reopenTimer);
    reopenTimer = null;
  }
  stopCompanionServer();
});
