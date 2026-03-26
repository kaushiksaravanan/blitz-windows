# Changelog

## 1.0.0 (Windows Electron Port)
- Forked from blitz-macos and rewritten as an Electron app for Windows
- Electron main process (Node.js) replaces Tauri Rust backend
- React frontend communicates via ipcRenderer/ipcMain bridge (contextBridge)
- ADB, emulator, Gradle, Flutter, and React Native build services
- Express.js companion server on port 9400 for Android companion app
- Play Store publishing: content generation, screenshot composition, video capture, Playwright CDP browser automation
- Zustand state management in frontend
- Tailwind CSS styling
- Logcat viewer, APK manager, project management, device/emulator panels
