<div align="center">
  <img src=".github/assets/logo.png" width="100" />
  <h1>Blitz for Windows</h1>
  <p>Windows desktop app for building, testing, and shipping Android apps</p>

  [![License](https://img.shields.io/badge/license-Apache%202.0-blue)](LICENSE)
</div>

<br />

Blitz is a Windows desktop app that streamlines the Android development lifecycle — device/emulator management, Gradle/Flutter/React Native builds, logcat viewing, APK management, and automated Play Store publishing. Built with Electron + React + TypeScript.

## Features

- **Device Management** — List, inspect, screenshot, and control ADB devices
- **Emulator Management** — List AVDs, start/stop/cold boot emulators
- **Build Execution** — Run Gradle, Flutter, or React Native builds with streaming logs
- **Logcat Viewer** — Real-time log viewing with filtering
- **APK Manager** — Install/uninstall APKs, list packages
- **Project Management** — Auto-detect project types (Android, Flutter, RN)
- **Play Store Publishing** — Content generation, screenshot composition, video capture, and browser-automated Play Console submission
- **Android Companion App** — Optional Kotlin/Compose mobile app that connects to the desktop controller over HTTP/WebSocket

## Requirements

- **Windows 10/11** (64-bit)
- **Node.js 18+**
- **Android SDK** — via [Android Studio](https://developer.android.com/studio) or [command-line tools](https://developer.android.com/studio#command-line-tools-only)
- **Git**

Optional:
- **Java JDK 17+** — for Gradle builds (usually bundled with Android Studio)
- **Flutter SDK** — for Flutter project builds
- **Chrome** — for Play Store publishing automation (launched with `--remote-debugging-port=9222`)
- **ffmpeg** — for promo video generation

## Build from Source

```powershell
# Clone
git clone https://github.com/user/blitz-windows.git
cd blitz-windows\cross-platform\windows-controller

# Install dependencies
npm install

# Development mode (Vite + Electron)
npm run dev:electron

# Build everything
npm run build:all

# Package as Windows installer (NSIS)
npm run dist
```

## Architecture

```
cross-platform/
  core/                    # Shared TypeScript library (@blitz/core)
  windows-controller/      # Electron desktop app
    src/                   # React frontend (Vite + Tailwind + Zustand)
    src-electron/          # Electron main process (Node.js backend)
      services/            # ADB, emulator, gradle, play-store, etc.
  android-companion/       # Kotlin + Jetpack Compose Android app
```

The React frontend communicates with the Node.js backend via Electron IPC (`contextBridge`). An optional companion server (Express.js on port 9400) lets the Android companion app connect remotely.

See [CLAUDE.md](CLAUDE.md) for detailed architecture documentation. See [cross-platform/ARCHITECTURE.md](cross-platform/ARCHITECTURE.md) for system diagrams and data flow.

## Security and Privacy

- **No analytics or telemetry.** No tracking calls, no data collection.
- **No native addons.** Pure Node.js backend — avoids Windows Defender false positives.
- **Companion server is opt-in.** Only enabled manually from Settings. Uses Bearer token authentication.
- **Play Store automation uses your own Chrome instance.** No credentials stored — Playwright CDP connects to your already-signed-in browser.

## License

[Apache License 2.0](LICENSE)
