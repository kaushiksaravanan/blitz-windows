# Blitz Cross-Platform Architecture

## System Overview

Blitz is a Windows-native Android development toolkit. The Windows controller app runs Android SDK tools (ADB, emulator, Gradle) directly on the local machine. An optional Android companion app connects back to the Windows machine for remote monitoring and control.

```
+---------------------+                  +---------------------+
|  Windows Controller |                  |  Android Companion  |
|  (Tauri v2 + React) |                  |  (Kotlin/Compose)   |
+----------+----------+                  +----------+----------+
           |                                        |
           |  Local Tauri invoke()                   |  HTTP + WebSocket
           |  (Rust <-> JS IPC)                      |  (port 9400)
           |                                        |
+----------+----------+                             |
|  Tauri Rust Backend |<----------------------------+
|  (Axum companion    |
|   server, ADB,      |
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

There is no remote macOS worker or server. Everything runs locally on the Windows machine.

## Components

### 1. Core TypeScript Library (`cross-platform/core/`)

Platform-independent TypeScript types shared between the React frontend and potentially other clients.

- `api-types.ts` -- Data model interfaces for ADB devices, AVDs, builds, projects, logcat entries
- `client.ts` -- HTTP/WebSocket client class targeting the companion server API (used by the Android companion or any external client)

### 2. Windows Controller (`cross-platform/windows-controller/`)

Tauri v2 desktop application with a Rust backend and React frontend.

**Rust Backend (`src-tauri/src/`)**
- `lib.rs` -- App state, SDK config auto-detection, ~20 Tauri command handlers
- `adb.rs` -- ADB operations: list devices, device details, install/uninstall APK, screenshots, packages, logcat
- `emulator.rs` -- AVD management: list AVDs, start/stop emulators, cold boot
- `gradle.rs` -- Gradle build execution with streaming log output
- `companion_server.rs` -- Axum HTTP + WebSocket server on port 9400 (serves the Android companion app)

**React Frontend (`src/`)**
- `store.ts` -- Zustand state management
- `App.tsx` -- Root component with tab routing
- `components/` -- Sidebar, Dashboard, DevicePanel, EmulatorPanel, GradleBuildPanel, LogcatViewer, ApkManager, ProjectPanel, SettingsPanel

**Key details:**
- The React frontend communicates with the Rust backend via local `invoke()` calls (Tauri IPC). There is no network connection from the frontend.
- The companion server (port 9400) is an optional Axum HTTP/WebSocket server that only exists for the Android companion app to connect remotely.
- Android SDK path is auto-detected from `ANDROID_HOME`, `ANDROID_SDK_ROOT`, or `%LOCALAPPDATA%\Android\Sdk`.

### 3. Android Companion App (`cross-platform/android-companion/`)

Kotlin + Jetpack Compose mobile app that connects to the Windows controller's companion server over the network.

**Data Layer (`data/`)**
- `Models.kt` -- Serializable data classes matching the Rust backend structs (`AdbDevice`, `AvdInfo`, `BuildInfo`, `ProjectInfo`, etc.) with `@SerialName` annotations
- `BlitzApiClient.kt` -- Ktor HTTP + WebSocket client targeting all `/api/v1/*` endpoints
- `ConnectionPreferences.kt` -- DataStore-backed preferences for host, port, API key

**ViewModel Layer (`ui/viewmodel/`)**
- `DashboardViewModel` -- Fetches devices, AVDs, projects, health status
- `DevicesViewModel` -- Device list, screenshots, package management, install/uninstall
- `EmulatorViewModel` -- AVD list, start/stop/cold boot
- `BuildsViewModel` -- Project list, trigger Gradle builds, log streaming
- `LogcatViewModel` -- Device selector, logcat fetch/clear, text filtering

**Screen Layer (`ui/screens/`)**
- `ConnectionScreen` -- Enter host/port/API key, health check, save preferences
- `DashboardScreen` -- Overview cards for devices, AVDs, projects
- `DevicesScreen` -- Device cards with screenshot preview, package list
- `EmulatorScreen` -- AVD cards with start/cold boot/stop actions
- `BuildsScreen` -- Project selector, Gradle task input, build log output
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

### 4. Dead Code (`cross-platform/macos-worker/`)

This directory is leftover from the original iOS/macOS architecture and is not used. It can be safely ignored or deleted.

## Communication

### Windows Controller (local)

```
React Frontend  --invoke()--> Tauri Rust Backend --> adb.exe / emulator.exe / gradlew.bat
```

No network involved. The React frontend calls Rust commands through Tauri's IPC bridge.

### Android Companion (remote)

```
Android App --HTTP/WS--> Companion Server (port 9400) --> Rust Backend --> Android SDK tools
```

The companion server is an Axum HTTP server embedded in the Tauri backend. It exposes:

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
| POST | `/builds` | Start Gradle build |
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
| Vite Dev Server | 1420 | Tauri dev mode only |

## Data Flow Examples

### Trigger a build from Android companion
1. Android app sends `POST /api/v1/builds` with project path and Gradle task
2. Companion server receives request, validates Bearer token
3. Rust backend spawns `gradlew.bat` with streaming output
4. Build progress events pushed over WebSocket `/ws/events`
5. Android app displays live build logs

### Take a device screenshot from Windows controller
1. User clicks screenshot button in DevicePanel
2. React calls `invoke("take_screenshot", { serial })` via Tauri IPC
3. Rust backend runs `adb exec-out screencap -p` 
4. Base64-encoded image returned to React frontend
5. Displayed inline in the UI
