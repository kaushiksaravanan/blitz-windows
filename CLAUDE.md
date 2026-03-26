# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Run Commands

```powershell
# Install dependencies (from windows-controller directory)
cd cross-platform\windows-controller
npm install

# Dev mode — Vite frontend only (http://localhost:1420)
npm run dev

# Dev mode — full Electron app (Vite + TypeScript watch + Electron)
npm run dev:electron

# Build frontend (type-check + vite build)
npm run build

# Build Electron backend TypeScript
npm run build:electron

# Build everything
npm run build:all

# Package as Windows installer (NSIS)
npm run dist

# Launch packaged app
npm run start
```

## Architecture

**Blitz** is a Windows Electron app for Android development. It provides device/emulator management, Gradle/Flutter/RN build execution, logcat viewing, APK management, and Play Store publishing automation. Built with Electron + React + TypeScript.

### Directory Structure

```
blitz-windows/
  cross-platform/
    core/                    # Shared TypeScript library (@blitz/core)
    windows-controller/      # Electron desktop app
      src/                   # React frontend (Vite + Tailwind + Zustand)
      src-electron/          # Electron main process (Node.js backend)
        main.ts              # App entry point, window creation
        preload.ts           # contextBridge — exposes window.electronAPI
        ipc-handlers.ts      # All ipcMain.handle() channels
        services/            # Backend services (adb, emulator, gradle, etc.)
    android-companion/       # Kotlin + Jetpack Compose Android app
```

### IPC Pattern

Frontend communicates with the backend via Electron IPC:

```
React (renderer) → window.electronAPI.invoke(channel, ...args) → ipcMain.handle(channel)
React (renderer) ← window.electronAPI.on(channel, callback) ← mainWindow.webContents.send(channel)
```

The preload script (`preload.ts`) uses `contextBridge.exposeInMainWorld` to expose a safe `electronAPI` object. `contextIsolation: true`, `nodeIntegration: false`.

### App State

Backend: `appState` singleton in `services/state.ts` holds devices, AVDs, builds, projects, SDK config, companion config, and an EventEmitter bus.

Frontend: Zustand store in `store.ts`. Polls backend via IPC on intervals and listens for push events (`build-log`, `companion-event`).

### Backend Services (`src-electron/services/`)

| Service | File | Description |
|---------|------|-------------|
| ADB | `adb.ts` | Device listing, details, screenshot, install/uninstall, logcat, input |
| Emulator | `emulator.ts` | AVD listing (parses config.ini), start/stop emulators |
| Gradle | `gradle.ts` | Gradle build execution with streaming logs |
| Flutter | `flutter.ts` | Flutter build execution |
| React Native | `react-native.ts` | RN build execution |
| Companion | `companion-server.ts` | Express.js HTTP + WebSocket server on port 9400 |
| Play Store | `play-store.ts` | Playwright CDP browser automation for Play Console |
| Content Gen | `content-generator.ts` | AI-style listing content generation |
| Screenshots | `screenshot-service.ts` | Screenshot composition via Playwright HTML rendering |
| Video Gen | `video-generator.ts` | Promo video from adb screenrecord + ffmpeg |

### Navigation

`ActiveTab` type in `store.ts` defines all tabs. `App.tsx` switches on `activeTab`. Tabs: dashboard, devices, emulators, builds, logcat, apk-manager, projects, publish, settings.

### Companion Server

```
Android Companion App ←HTTP/WS→ Express server (port 9400) → same appState → ADB/SDK tools
```

Optional server that lets the Android companion app connect remotely. REST endpoints under `/api/v1/` plus WebSocket at `/ws/events`.

### Play Store Publishing

```
Electron App → playwright-core (CDP) → Chrome with --remote-debugging-port → Google Play Console
```

Hybrid approach: playwright-core connects to user's Chrome via Chrome DevTools Protocol. No bundled browser. Image composition uses Playwright HTML rendering (no sharp/native deps). Video uses `adb screenrecord` + `ffmpeg`.

## Port Assignments

| Service | Port | Notes |
|---------|------|-------|
| Vite Dev Server | 1420 | Dev mode only |
| Companion Server | 9400 | For Android companion app |
| Chrome Debug | 9222 | For Play Store publishing |

## Key Patterns

- All process execution via `child_process.execFile` / `spawn` (async, with quoted paths for Windows spaces)
- Path separators: always use `path.join()` or `[\\/]` regex for cross-compat
- Frontend uses Zustand (not Redux, not Context)
- CSS: Tailwind with CSS custom properties for theming (var(--bg-primary), etc.)
- Types: camelCase everywhere (TypeScript native)
- No native Node.js addons — avoids Windows Defender issues (reason for Electron over Tauri)
- `ProjectInfo` uses `path` as unique identifier (no `id` field)
- Build logs streamed via `mainWindow.webContents.send("build-log", { buildId, line })`
