# Blitz Cross-Platform Architecture

## System Overview

Blitz is a Windows-native Android development toolkit. The Windows controller app runs Android SDK tools (ADB, emulator, Gradle) directly on the local machine. An optional Android companion app connects back to the Windows machine for remote monitoring and control.

```
+---------------------+                  +---------------------+
|  Windows Controller  |                  |  Android Companion  |
|  (Electron + React)  |                  |  (Kotlin/Compose)   |
+----------+----------+                  +----------+----------+
           |                                        |
           |  Electron IPC                          |  HTTP + WebSocket
           |  (ipcMain <-> preload)                 |  (port 9400)
           |                                        |
+----------+----------+                             |
|  Node.js Backend     |<----------------------------+
|  (Express companion  |
|   server, ADB,       |
|   emulator, Gradle)  |
+----------+----------+
           |
           |  Direct process execution
           |
     +-----+------+--------+--------+
     |            |        |        |
+----+----+ +----+---+ +--+-----+ +--+--------+
| adb.exe | | emula- | | gradle | | Android   |
|         | | tor.exe| | w.bat  | | SDK tools |
+---------+ +--------+ +--------+ +-----------+
```

There is no remote server. Everything runs locally on the Windows machine.

## Components

### 1. Core TypeScript Library (`cross-platform/core/`)

Platform-independent TypeScript types shared between the React frontend and potentially other clients.

- `api-types.ts` -- Data model interfaces for ADB devices, AVDs, builds, projects, logcat entries
- `client.ts` -- HTTP/WebSocket client class targeting the companion server API (used by the Android companion or any external client)

### 2. Windows Controller (`cross-platform/windows-controller/`)

Electron desktop application with a Node.js backend and React frontend.

**Node.js Backend (`src-electron/`)**
- `main.ts` -- Electron app entry point, BrowserWindow creation, registers IPC handlers
- `preload.ts` -- `contextBridge.exposeInMainWorld` — exposes `window.electronAPI` with `invoke()` and `on()` methods
- `ipc-handlers.ts` -- All `ipcMain.handle()` channels (~25 handlers covering SDK config, devices, emulators, builds, projects, companion, dialogs, Play Store)
- `services/state.ts` -- `appState` singleton: devices, AVDs, builds map, projects, SDK config, companion config, EventEmitter bus
- `services/types.ts` -- Backend TypeScript interfaces (AdbDevice, AvdInfo, BuildInfo, ProjectInfo, PlayStoreConfig, etc.)
- `services/adb.ts` -- ADB operations: list devices, device details, install/uninstall APK, screenshots, packages, logcat, input
- `services/emulator.ts` -- AVD management: list AVDs (parses config.ini + running state), start/stop emulators
- `services/gradle.ts` -- Gradle build execution with streaming log output via `mainWindow.webContents.send("build-log")`
- `services/flutter.ts` -- Flutter build execution with streaming logs
- `services/react-native.ts` -- React Native build execution with streaming logs
- `services/companion-server.ts` -- Express.js HTTP + WebSocket server on port 9400
- `services/play-store.ts` -- Playwright CDP browser automation for Google Play Console
- `services/content-generator.ts` -- AI-style listing content generation
- `services/screenshot-service.ts` -- Screenshot composition via Playwright HTML rendering
- `services/video-generator.ts` -- Promo video from adb screenrecord + ffmpeg

**React Frontend (`src/`)**
- `store.ts` -- Zustand state management (polls backend via IPC, listens for push events)
- `App.tsx` -- Root component with tab routing based on `activeTab`
- `components/Sidebar.tsx` -- Navigation sidebar with tab groups (Develop, Tools, Publishing, System)
- `components/Dashboard.tsx` -- Overview: device/AVD/project counts, quick actions
- `components/DevicePanel.tsx` -- Device list with details, screenshot, package management
- `components/EmulatorPanel.tsx` -- AVD list with start/stop/cold boot
- `components/GradleBuildPanel.tsx` -- Build panel: project selector, task input, streaming log output
- `components/LogcatViewer.tsx` -- Real-time logcat viewer with filtering
- `components/ApkManager.tsx` -- APK install/uninstall management
- `components/ProjectPanel.tsx` -- Project list with add/remove, type detection
- `components/PlayStorePanel.tsx` -- Play Store publishing workflow (analyze, generate assets, connect browser, publish)
- `components/SettingsPanel.tsx` -- SDK paths, companion server config

**Key details:**
- The React frontend communicates with the Node.js backend via Electron IPC (`window.electronAPI.invoke(channel, ...args)`). No network connection.
- `contextIsolation: true`, `nodeIntegration: false` — security best practice.
- Build logs streamed from backend to frontend via `mainWindow.webContents.send("build-log", { buildId, line })`.
- Android SDK path is auto-detected from `ANDROID_HOME`, `ANDROID_SDK_ROOT`, or `%LOCALAPPDATA%\Android\Sdk`.

### 3. Android Companion App (`cross-platform/android-companion/`)

Kotlin + Jetpack Compose mobile app that connects to the Windows controller's companion server over the network.

**Data Layer (`data/`)**
- `Models.kt` -- Serializable data classes matching the backend types (`AdbDevice`, `AvdInfo`, `BuildInfo`, `ProjectInfo`, etc.) with `@SerialName` annotations
- `BlitzApiClient.kt` -- Ktor HTTP + WebSocket client targeting all `/api/v1/*` endpoints
- `ConnectionPreferences.kt` -- DataStore-backed preferences for host, port, API key

**ViewModel Layer (`ui/viewmodel/`)**
- `DashboardViewModel` -- Fetches devices, AVDs, projects, health status
- `DevicesViewModel` -- Device list, screenshots, package management, install/uninstall
- `EmulatorViewModel` -- AVD list, start/stop/cold boot
- `BuildsViewModel` -- Project list, trigger builds, log streaming
- `LogcatViewModel` -- Device selector, logcat fetch/clear, text filtering

**Screen Layer (`ui/screens/`)**
- `ConnectionScreen` -- Enter host/port/API key, health check, save preferences
- `DashboardScreen` -- Overview cards for devices, AVDs, projects
- `DevicesScreen` -- Device cards with screenshot preview, package list
- `EmulatorScreen` -- AVD cards with start/cold boot/stop actions
- `BuildsScreen` -- Project selector, task input, build log output
- `LogcatScreen` -- Device selector, filter bar, color-coded log lines
- `SettingsScreen` -- Connection management, disconnect, about section

**Navigation (`ui/BlitzApp.kt`)**
- Bottom navigation bar: Dashboard, Devices, Emulators, Builds, Logcat
- Settings accessible via top bar icon
- Connection screen shown when not connected

**Build config:**
- Kotlin 2.0.0, AGP 8.5.0, compileSdk 35, minSdk 28, JDK 17
- Compose BOM 2024.06.00, Ktor 2.3.12, kotlinx-serialization-json 1.7.1
- DataStore preferences, Coil for image loading, Navigation Compose 2.7.7

## Communication

### Windows Controller (local)

```
React Frontend --invoke()--> Electron IPC (ipcMain.handle) --> Node.js services --> adb.exe / emulator.exe / gradlew.bat
```

No network involved. The React frontend calls Node.js backend functions through Electron's IPC bridge.

### Android Companion (remote)

```
Android App --HTTP/WS--> Companion Server (port 9400) --> Node.js Backend --> Android SDK tools
```

The companion server is an Express.js HTTP server embedded in the Electron backend. It exposes:

**REST Endpoints (`/api/v1/`):**
| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Health check (no auth) |
| GET | `/status` | Host status with devices/AVDs/SDK info |
| GET | `/devices` | List ADB devices |
| GET | `/devices/:serial` | Device details |
| GET | `/devices/:serial/screenshot` | Base64 screenshot |
| GET | `/devices/:serial/packages` | List installed packages |
| POST | `/devices/:serial/install` | Install APK |
| POST | `/devices/:serial/uninstall` | Uninstall package |
| GET | `/avds` | List AVDs |
| POST | `/avds/:name/action` | Start/stop emulator |
| POST | `/builds` | Start build |
| GET | `/builds/:id` | Build status |
| GET | `/projects` | List projects |
| GET | `/logcat/:serial` | Dump logcat |
| POST | `/logcat/:serial/clear` | Clear logcat |

**WebSocket (`/ws/events`):**
Real-time events for build progress, device connect/disconnect, logcat streaming.

**Authentication:**
Bearer token API key in the `Authorization` header. Configured in Windows controller settings.

## Port Assignments

| Service | Default Port | Description |
|---------|-------------|-------------|
| Companion Server | 9400 | REST + WebSocket for Android companion |
| Vite Dev Server | 1420 | Dev mode only |
| Chrome Debug | 9222 | Play Store publishing (Playwright CDP) |

## Data Flow Examples

### Trigger a build from Android companion
1. Android app sends `POST /api/v1/builds` with project path and Gradle task
2. Companion server receives request, validates Bearer token
3. Node.js backend spawns `gradlew.bat` with streaming output
4. Build progress events pushed over WebSocket `/ws/events`
5. Android app displays live build logs

### Take a device screenshot from Windows controller
1. User clicks screenshot button in DevicePanel
2. React calls `window.electronAPI.invoke("take_screenshot", serial)` via IPC
3. Node.js backend runs `adb exec-out screencap -p`
4. Base64-encoded image returned to React frontend
5. Displayed inline in the UI

### Play Store publishing
1. User analyzes project — IPC calls `playstore_analyze` which detects project type, reads manifests, generates content
2. User generates assets — `playstore_generate_assets` creates screenshots via Playwright HTML rendering, video via adb screenrecord + ffmpeg
3. User launches Chrome with `--remote-debugging-port=9222` and signs into Play Console
4. User connects browser — `playstore_connect_browser` connects Playwright CDP to the running Chrome instance
5. User publishes — `playstore_publish` automates form filling on Play Console via CDP
