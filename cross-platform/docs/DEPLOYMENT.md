# Blitz Deployment Guide

This document explains how to build, run, and deploy the Blitz Android development toolkit:
1. **Windows Controller App** -- Tauri v2 desktop application (Rust + React)
2. **Android Companion App** -- Kotlin + Jetpack Compose mobile application

There is no remote server or macOS worker. Everything runs locally on your Windows machine.

## Prerequisites

### For Windows Controller

- **Windows 10/11** (64-bit)
- **Android SDK** -- Install via [Android Studio](https://developer.android.com/studio) or standalone [command-line tools](https://developer.android.com/studio#command-line-tools-only)
- **Rust Toolchain** -- Install from [rustup.rs](https://www.rust-lang.org/tools/install) (stable channel)
- **Node.js 18+** -- For the React frontend build
- **Git**

The Android SDK path is auto-detected from these locations (in order):
1. `ANDROID_HOME` environment variable
2. `ANDROID_SDK_ROOT` environment variable
3. `%LOCALAPPDATA%\Android\Sdk` (Android Studio default)

Ensure `adb.exe` and `emulator.exe` are accessible under the SDK's `platform-tools/` and `emulator/` directories.

### For Android Companion

- **Android Studio** (Flamingo or later recommended)
- **Android SDK 35** (compileSdkVersion)
- **JDK 17**
- **Android device** (API 28+) or emulator
- Network connectivity to the Windows machine running the controller

## Step 1: Build and Run Windows Controller

### Development Mode

```powershell
cd cross-platform\windows-controller

# Install frontend dependencies
npm install

# Start Tauri dev server (Rust backend + React frontend with hot reload)
npm run tauri:dev
```

This starts:
- Vite dev server on `http://localhost:1420` (frontend hot reload)
- Tauri Rust backend compiled and launched automatically
- Companion server on port 9400 (if enabled in settings)

### Production Build

```powershell
cd cross-platform\windows-controller

npm install
npm run tauri:build
```

Output installers:
- NSIS installer: `src-tauri\target\release\bundle\nsis\blitz-windows-controller-X.X.X.Setup.exe`
- MSI installer: `src-tauri\target\release\bundle\msi\blitz-windows-controller-X.X.X.msi`

### First Launch

1. Launch the application
2. The app auto-detects your Android SDK location
3. If detection fails, go to **Settings** and set the SDK path manually
4. Connected ADB devices and available AVDs appear automatically on the Dashboard

No "connect to server" step is needed. The Windows controller runs everything locally.

### Companion Server (Optional)

The companion server allows the Android companion app to connect to your Windows machine remotely.

To enable it:
1. Go to **Settings** in the Windows controller
2. Enable the companion server
3. Set a port (default: 9400)
4. Set an API key (used for authentication)
5. The server starts automatically

Ensure your Windows firewall allows incoming TCP connections on the chosen port.

## Step 2: Build and Run Android Companion

### Development Mode (Android Studio)

1. Open `cross-platform/android-companion` in Android Studio
2. Wait for Gradle sync to complete
3. Connect an Android device (USB or wireless) or start an emulator
4. Click **Run** to install and launch

### Production Build (Release APK)

```powershell
cd cross-platform\android-companion

# Generate signing key (first time only)
keytool -genkey -v -keystore blitz-release-key.jks -keyalg RSA -keysize 2048 -validity 10000 -alias blitz

# Build release APK
.\gradlew assembleRelease

# Output: app\build\outputs\apk\release\app-release.apk

# Or build release AAB (for Play Store)
.\gradlew bundleRelease

# Output: app\build\outputs\bundle\release\app-release.aab
```

### Connecting to Windows Controller

1. Launch the companion app on your Android device
2. On the **Connection** screen, enter:
   - **Host**: Your Windows machine's IP address on the local network (e.g., `192.168.1.100`)
   - **Port**: `9400` (or whatever you configured)
   - **API Key**: The key you set in the Windows controller's settings
3. Tap **Connect**
4. The app performs a health check and saves the connection for next time

### Network Requirements

- The Android device and Windows machine must be on the same network (or have a route between them)
- Windows firewall must allow incoming TCP on port 9400
- No special Android permissions beyond `INTERNET` and `ACCESS_NETWORK_STATE`

## Verify Everything Works

### From the Windows Controller
1. **Dashboard** should show connected ADB devices and available AVDs
2. **Devices** tab lists physical and emulator devices with details
3. **Emulators** tab shows AVDs you can start/stop
4. **Build** panel can run Gradle tasks on your Android projects
5. **Logcat** viewer shows real-time device logs

### From the Android Companion
1. **Dashboard** shows device/AVD/project counts from the Windows host
2. **Devices** tab lists connected devices with screenshots
3. **Emulators** tab allows starting/stopping AVDs remotely
4. **Builds** tab can trigger Gradle builds and stream logs
5. **Logcat** tab displays filterable device logs

## Troubleshooting

| Symptom | Solution |
|---------|----------|
| "Android SDK not found" | Set `ANDROID_HOME` env var or configure path in Settings |
| No devices showing | Run `adb devices` in terminal to verify ADB works. Check USB debugging is enabled on device |
| Emulator won't start | Verify HAXM/Hyper-V is enabled. Check `emulator -list-avds` output |
| Companion can't connect | Check Windows firewall, verify IP address, ensure companion server is enabled |
| Authentication failed | Verify API key matches between Windows controller settings and Android app |
| Build fails | Check Gradle/JDK setup. Run `gradlew tasks` manually to verify |
| WebSocket disconnects | Check network stability. The companion auto-reconnects on disconnect |

## Logs and Diagnostics

- **Windows controller logs**: Check the Tauri console output (dev mode) or `%LOCALAPPDATA%\Blitz\logs\`
- **Android companion logs**: Use `adb logcat -s BlitzCompanion` or Android Studio Logcat
- **ADB diagnostics**: `adb devices -l` to verify device connectivity
- **Companion server health**: `curl http://localhost:9400/api/v1/health` from the Windows machine

## Uninstallation

### Windows Controller
Use **Windows Settings > Apps > Blitz Controller > Uninstall**, or run the NSIS uninstaller.

### Android Companion
Long-press the app icon and tap Uninstall, or use **Settings > Apps > Blitz Companion > Uninstall**.

## Security Notes

- The companion server API key acts as a password. Use a strong, random key.
- Do not commit API keys to version control.
- The companion server binds to `0.0.0.0` by default (all interfaces). For tighter security, bind to a specific interface or use it only on trusted networks.
- All communication between the Android companion and Windows controller is unencrypted HTTP. For use over untrusted networks, consider an SSH tunnel or VPN.

---
*Blitz for Windows + Android v1.0.0*
