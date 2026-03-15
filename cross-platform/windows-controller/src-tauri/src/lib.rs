use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager, State};
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use tokio::process::Command;
use tokio::sync::broadcast;

pub mod adb;
pub mod emulator;
pub mod gradle;
pub mod flutter;
pub mod companion_server;

// ---------------------------------------------------------------------------
// Shared App State
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SdkConfig {
    pub android_sdk_path: String,
    pub java_home: String,
    pub flutter_sdk_path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CompanionConfig {
    pub port: u16,
    pub api_key: String,
    pub enabled: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AdbDevice {
    pub serial: String,
    #[serde(rename = "type")]
    pub device_type: String,
    pub model: String,
    pub product: String,
    pub transport_id: String,
    pub android_version: String,
    pub api_level: u32,
    pub is_emulator: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AvdInfo {
    pub name: String,
    pub device: String,
    pub path: String,
    pub target: String,
    pub api_level: u32,
    pub abi: String,
    pub is_running: bool,
    pub running_serial: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BuildInfo {
    pub id: String,
    pub project_path: String,
    pub task: String,
    pub phase: String,
    pub progress: u32,
    pub started_at: String,
    pub finished_at: Option<String>,
    pub output_apk: Option<String>,
    pub logs: Vec<String>,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProjectInfo {
    pub id: String,
    pub name: String,
    pub path: String,
    pub application_id: String,
    pub project_type: String, // "android-native" | "flutter"
}

pub struct AppState {
    pub sdk_config: Mutex<SdkConfig>,
    pub companion_config: Mutex<CompanionConfig>,
    pub devices: Mutex<Vec<AdbDevice>>,
    pub avds: Mutex<Vec<AvdInfo>>,
    pub builds: Mutex<HashMap<String, BuildInfo>>,
    pub projects: Mutex<Vec<ProjectInfo>>,
    pub logcat_lines: Mutex<Vec<String>>,
    pub event_tx: broadcast::Sender<String>,
}

impl AppState {
    pub fn new() -> Self {
        let (event_tx, _) = broadcast::channel(1024);

        // Auto-detect SDK paths from environment
        let sdk_path = std::env::var("ANDROID_HOME")
            .or_else(|_| std::env::var("ANDROID_SDK_ROOT"))
            .unwrap_or_else(|_| {
                let home = std::env::var("LOCALAPPDATA").unwrap_or_default();
                format!("{}\\Android\\Sdk", home)
            });

        let java_home = std::env::var("JAVA_HOME")
            .unwrap_or_default();

        // Auto-detect Flutter SDK path
        let flutter_sdk_path = detect_flutter_sdk();

        Self {
            sdk_config: Mutex::new(SdkConfig {
                android_sdk_path: sdk_path,
                java_home,
                flutter_sdk_path,
            }),
            companion_config: Mutex::new(CompanionConfig {
                port: 9400,
                api_key: uuid::Uuid::new_v4().to_string(),
                enabled: false,
            }),
            devices: Mutex::new(Vec::new()),
            avds: Mutex::new(Vec::new()),
            builds: Mutex::new(HashMap::new()),
            projects: Mutex::new(Vec::new()),
            logcat_lines: Mutex::new(Vec::new()),
            event_tx,
        }
    }

    pub fn adb_path(&self) -> String {
        let config = self.sdk_config.lock().unwrap();
        format!("{}\\platform-tools\\adb.exe", config.android_sdk_path)
    }

    pub fn emulator_path(&self) -> String {
        let config = self.sdk_config.lock().unwrap();
        format!("{}\\emulator\\emulator.exe", config.android_sdk_path)
    }

    pub fn avdmanager_path(&self) -> String {
        let config = self.sdk_config.lock().unwrap();
        format!("{}\\cmdline-tools\\latest\\bin\\avdmanager.bat", config.android_sdk_path)
    }

    pub fn flutter_path(&self) -> String {
        let config = self.sdk_config.lock().unwrap();
        if config.flutter_sdk_path.is_empty() {
            "flutter".to_string() // fallback to PATH
        } else {
            format!("{}\\bin\\flutter.bat", config.flutter_sdk_path)
        }
    }
}

/// Detect Flutter SDK path from FLUTTER_HOME, FLUTTER_ROOT, or PATH.
fn detect_flutter_sdk() -> String {
    // Check env vars first
    if let Ok(path) = std::env::var("FLUTTER_HOME") {
        if std::path::Path::new(&path).join("bin").join("flutter.bat").exists() {
            return path;
        }
    }
    if let Ok(path) = std::env::var("FLUTTER_ROOT") {
        if std::path::Path::new(&path).join("bin").join("flutter.bat").exists() {
            return path;
        }
    }

    // Try to find flutter.bat in PATH using `which` crate
    if let Ok(flutter_exe) = which::which("flutter") {
        // flutter.bat is typically at <FLUTTER_SDK>/bin/flutter.bat
        if let Some(bin_dir) = flutter_exe.parent() {
            if let Some(sdk_dir) = bin_dir.parent() {
                return sdk_dir.to_string_lossy().to_string();
            }
        }
    }

    String::new()
}

// ---------------------------------------------------------------------------
// Helper: run a command and capture output
// ---------------------------------------------------------------------------

pub async fn run_command(program: &str, args: &[&str]) -> Result<String, String> {
    let output = Command::new(program)
        .args(args)
        .output()
        .await
        .map_err(|e| format!("Failed to execute {}: {}", program, e))?;

    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).to_string())
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr);
        let stdout = String::from_utf8_lossy(&output.stdout);
        Err(format!("Command failed (exit {}): {} {}", output.status, stderr, stdout))
    }
}

// ---------------------------------------------------------------------------
// Project detection helpers
// ---------------------------------------------------------------------------

/// Detect project type by examining the directory contents.
fn detect_project_type(path: &str) -> &'static str {
    let p = std::path::Path::new(path);

    // Flutter: has pubspec.yaml with flutter dependency
    let pubspec = p.join("pubspec.yaml");
    if pubspec.exists() {
        if let Ok(content) = std::fs::read_to_string(&pubspec) {
            if content.contains("flutter:") || content.contains("sdk: flutter") {
                return "flutter";
            }
        }
    }

    // Android-native: has build.gradle or build.gradle.kts at root
    if p.join("build.gradle").exists()
        || p.join("build.gradle.kts").exists()
        || p.join("gradlew.bat").exists()
    {
        return "android-native";
    }

    "android-native" // default fallback
}

/// Try to parse the application ID from the project.
fn parse_application_id(path: &str, project_type: &str) -> String {
    let p = std::path::Path::new(path);

    match project_type {
        "flutter" => {
            // For Flutter, parse android/app/build.gradle for applicationId
            // or namespace, or fall back to pubspec.yaml name
            let build_gradle = p.join("android").join("app").join("build.gradle");
            let build_gradle_kts = p.join("android").join("app").join("build.gradle.kts");

            let gradle_path = if build_gradle.exists() {
                Some(build_gradle)
            } else if build_gradle_kts.exists() {
                Some(build_gradle_kts)
            } else {
                None
            };

            if let Some(gp) = gradle_path {
                if let Ok(content) = std::fs::read_to_string(&gp) {
                    // Look for applicationId "com.example.app" or namespace "com.example.app"
                    if let Some(app_id) = extract_gradle_string(&content, "applicationId") {
                        return app_id;
                    }
                    if let Some(ns) = extract_gradle_string(&content, "namespace") {
                        return ns;
                    }
                }
            }

            // Fallback: try AndroidManifest.xml package attribute
            let manifest = p.join("android").join("app").join("src").join("main").join("AndroidManifest.xml");
            if let Ok(content) = std::fs::read_to_string(&manifest) {
                if let Some(pkg) = extract_xml_package(&content) {
                    return pkg;
                }
            }

            String::new()
        }
        _ => {
            // Android-native: check app/build.gradle
            let build_gradle = p.join("app").join("build.gradle");
            let build_gradle_kts = p.join("app").join("build.gradle.kts");

            let gradle_path = if build_gradle.exists() {
                Some(build_gradle)
            } else if build_gradle_kts.exists() {
                Some(build_gradle_kts)
            } else {
                None
            };

            if let Some(gp) = gradle_path {
                if let Ok(content) = std::fs::read_to_string(&gp) {
                    if let Some(app_id) = extract_gradle_string(&content, "applicationId") {
                        return app_id;
                    }
                    if let Some(ns) = extract_gradle_string(&content, "namespace") {
                        return ns;
                    }
                }
            }

            String::new()
        }
    }
}

/// Extract a string value like `applicationId "com.example.app"` from Gradle files.
fn extract_gradle_string(content: &str, key: &str) -> Option<String> {
    for line in content.lines() {
        let trimmed = line.trim();
        if trimmed.starts_with(key) || trimmed.starts_with(&format!("{}(", key)) {
            // Handle: applicationId "com.example" or applicationId("com.example") or applicationId = "com.example"
            let value_part = trimmed
                .trim_start_matches(key)
                .trim()
                .trim_start_matches('=')
                .trim()
                .trim_start_matches('(')
                .trim();
            // Extract the string between quotes
            if let Some(start) = value_part.find('"') {
                if let Some(end) = value_part[start + 1..].find('"') {
                    return Some(value_part[start + 1..start + 1 + end].to_string());
                }
            }
            // Also handle single quotes
            if let Some(start) = value_part.find('\'') {
                if let Some(end) = value_part[start + 1..].find('\'') {
                    return Some(value_part[start + 1..start + 1 + end].to_string());
                }
            }
        }
    }
    None
}

/// Extract package="..." from AndroidManifest.xml.
fn extract_xml_package(content: &str) -> Option<String> {
    // Simple regex-free extraction: find package="..."
    if let Some(idx) = content.find("package=\"") {
        let rest = &content[idx + 9..];
        if let Some(end) = rest.find('"') {
            let pkg = &rest[..end];
            if !pkg.is_empty() {
                return Some(pkg.to_string());
            }
        }
    }
    None
}

// ---------------------------------------------------------------------------
// Tauri Commands — SDK Configuration
// ---------------------------------------------------------------------------

#[tauri::command]
fn get_sdk_config(state: State<'_, AppState>) -> Result<SdkConfig, String> {
    let config = state.sdk_config.lock().map_err(|e| e.to_string())?;
    Ok(config.clone())
}

#[tauri::command]
fn set_sdk_config(
    state: State<'_, AppState>,
    sdk_path: String,
    java_home: String,
    flutter_sdk_path: Option<String>,
) -> Result<(), String> {
    let mut config = state.sdk_config.lock().map_err(|e| e.to_string())?;
    config.android_sdk_path = sdk_path;
    config.java_home = java_home;
    if let Some(fp) = flutter_sdk_path {
        config.flutter_sdk_path = fp;
    }
    Ok(())
}

// ---------------------------------------------------------------------------
// Tauri Commands — ADB Devices
// ---------------------------------------------------------------------------

#[tauri::command]
async fn list_devices(state: State<'_, AppState>) -> Result<Vec<AdbDevice>, String> {
    let adb = state.adb_path();
    let devices = adb::list_devices(&adb).await?;
    *state.devices.lock().map_err(|e| e.to_string())? = devices.clone();
    Ok(devices)
}

#[tauri::command]
async fn get_device_details(state: State<'_, AppState>, serial: String) -> Result<serde_json::Value, String> {
    let adb = state.adb_path();
    adb::get_device_details(&adb, &serial).await
}

#[tauri::command]
async fn take_screenshot(state: State<'_, AppState>, serial: String) -> Result<String, String> {
    let adb = state.adb_path();
    adb::take_screenshot(&adb, &serial).await
}

#[tauri::command]
async fn device_input(
    state: State<'_, AppState>,
    serial: String,
    action: String,
    x: Option<i32>,
    y: Option<i32>,
    to_x: Option<i32>,
    to_y: Option<i32>,
    text: Option<String>,
    key_code: Option<i32>,
    duration: Option<i32>,
) -> Result<String, String> {
    let adb = state.adb_path();
    adb::device_input(&adb, &serial, &action, x, y, to_x, to_y, text, key_code, duration).await
}

#[tauri::command]
async fn install_apk(state: State<'_, AppState>, serial: String, apk_path: String, reinstall: bool) -> Result<String, String> {
    let adb = state.adb_path();
    adb::install_apk(&adb, &serial, &apk_path, reinstall).await
}

#[tauri::command]
async fn uninstall_package(state: State<'_, AppState>, serial: String, package_name: String) -> Result<String, String> {
    let adb = state.adb_path();
    adb::uninstall_package(&adb, &serial, &package_name).await
}

#[tauri::command]
async fn list_packages(state: State<'_, AppState>, serial: String) -> Result<Vec<String>, String> {
    let adb = state.adb_path();
    adb::list_packages(&adb, &serial).await
}

// ---------------------------------------------------------------------------
// Tauri Commands — Logcat
// ---------------------------------------------------------------------------

#[tauri::command]
async fn get_logcat(state: State<'_, AppState>, serial: String, lines: Option<u32>) -> Result<Vec<String>, String> {
    let adb = state.adb_path();
    adb::get_logcat(&adb, &serial, lines.unwrap_or(200)).await
}

#[tauri::command]
async fn clear_logcat(state: State<'_, AppState>, serial: String) -> Result<(), String> {
    let adb = state.adb_path();
    adb::clear_logcat(&adb, &serial).await
}

// ---------------------------------------------------------------------------
// Tauri Commands — AVDs (Emulators)
// ---------------------------------------------------------------------------

#[tauri::command]
async fn list_avds(state: State<'_, AppState>) -> Result<Vec<AvdInfo>, String> {
    let emulator_bin = state.emulator_path();
    let adb = state.adb_path();
    let avds = emulator::list_avds(&emulator_bin, &adb).await?;
    *state.avds.lock().map_err(|e| e.to_string())? = avds.clone();
    Ok(avds)
}

#[tauri::command]
async fn start_avd(state: State<'_, AppState>, name: String, cold_boot: bool) -> Result<String, String> {
    let emulator_bin = state.emulator_path();
    emulator::start_avd(&emulator_bin, &name, cold_boot).await
}

#[tauri::command]
async fn stop_avd(state: State<'_, AppState>, serial: String) -> Result<(), String> {
    let adb = state.adb_path();
    emulator::stop_avd(&adb, &serial).await
}

// ---------------------------------------------------------------------------
// Tauri Commands — Builds (Gradle + Flutter)
// ---------------------------------------------------------------------------

#[tauri::command]
async fn start_build(
    state: State<'_, AppState>,
    app: AppHandle,
    project_path: String,
    task: String,
    extra_args: Option<Vec<String>>,
) -> Result<BuildInfo, String> {
    let (java_home, flutter_path) = {
        let config = state.sdk_config.lock().map_err(|e| e.to_string())?;
        (config.java_home.clone(), config.flutter_sdk_path.clone())
    };
    let event_tx = state.event_tx.clone();

    // Determine if this is a Flutter or Gradle build based on task prefix or project type
    let project_type = detect_project_type(&project_path);
    let is_flutter_task = task.starts_with("flutter ") || project_type == "flutter";

    let build_info = if is_flutter_task || project_type == "flutter" {
        let flutter_bin = if flutter_path.is_empty() {
            "flutter".to_string()
        } else {
            format!("{}\\bin\\flutter.bat", flutter_path)
        };
        flutter::start_build(
            &project_path,
            &task,
            &flutter_bin,
            extra_args.as_deref(),
            event_tx,
            app,
        ).await?
    } else {
        gradle::start_build(
            &project_path,
            &task,
            &java_home,
            extra_args.as_deref(),
            event_tx,
            app,
        ).await?
    };

    state.builds.lock().map_err(|e| e.to_string())?
        .insert(build_info.id.clone(), build_info.clone());

    Ok(build_info)
}

#[tauri::command]
fn get_build_status(state: State<'_, AppState>, build_id: String) -> Result<Option<BuildInfo>, String> {
    let builds = state.builds.lock().map_err(|e| e.to_string())?;
    Ok(builds.get(&build_id).cloned())
}

// ---------------------------------------------------------------------------
// Tauri Commands — Projects
// ---------------------------------------------------------------------------

#[tauri::command]
fn list_projects(state: State<'_, AppState>) -> Result<Vec<ProjectInfo>, String> {
    let projects = state.projects.lock().map_err(|e| e.to_string())?;
    Ok(projects.clone())
}

#[tauri::command]
fn add_project(state: State<'_, AppState>, path: String, name: Option<String>) -> Result<ProjectInfo, String> {
    // Validate path exists
    if !std::path::Path::new(&path).exists() {
        return Err(format!("Path does not exist: {}", path));
    }

    let project_name = name.unwrap_or_else(|| {
        std::path::Path::new(&path)
            .file_name()
            .map(|f| f.to_string_lossy().to_string())
            .unwrap_or_else(|| "Unnamed".into())
    });

    // Auto-detect project type
    let project_type = detect_project_type(&path);

    // Auto-detect application ID
    let application_id = parse_application_id(&path, project_type);

    let project = ProjectInfo {
        id: uuid::Uuid::new_v4().to_string(),
        name: project_name,
        path: path.clone(),
        application_id,
        project_type: project_type.to_string(),
    };

    state.projects.lock().map_err(|e| e.to_string())?
        .push(project.clone());

    Ok(project)
}

#[tauri::command]
fn remove_project(state: State<'_, AppState>, id: String) -> Result<(), String> {
    let mut projects = state.projects.lock().map_err(|e| e.to_string())?;
    projects.retain(|p| p.id != id);
    Ok(())
}

// ---------------------------------------------------------------------------
// Tauri Commands — Companion Server
// ---------------------------------------------------------------------------

#[tauri::command]
fn get_companion_config(state: State<'_, AppState>) -> Result<CompanionConfig, String> {
    let config = state.companion_config.lock().map_err(|e| e.to_string())?;
    Ok(config.clone())
}

#[tauri::command]
async fn start_companion_server(
    state: State<'_, AppState>,
    app: AppHandle,
    port: u16,
    api_key: String,
) -> Result<String, String> {
    {
        let mut config = state.companion_config.lock().map_err(|e| e.to_string())?;
        config.port = port;
        config.api_key = api_key.clone();
        config.enabled = true;
    }

    // Clone the Arc-wrapped AppState for the background task.
    // Tauri manages AppState, but we need an Arc<AppState> for the companion server.
    // We extract the data we need and pass an Arc<AppState> by creating one from
    // the Tauri-managed state.
    let app_state: Arc<AppState> = Arc::new(AppState {
        sdk_config: Mutex::new(state.sdk_config.lock().map_err(|e| e.to_string())?.clone()),
        companion_config: Mutex::new(state.companion_config.lock().map_err(|e| e.to_string())?.clone()),
        devices: Mutex::new(state.devices.lock().map_err(|e| e.to_string())?.clone()),
        avds: Mutex::new(state.avds.lock().map_err(|e| e.to_string())?.clone()),
        builds: Mutex::new(state.builds.lock().map_err(|e| e.to_string())?.clone()),
        projects: Mutex::new(state.projects.lock().map_err(|e| e.to_string())?.clone()),
        logcat_lines: Mutex::new(state.logcat_lines.lock().map_err(|e| e.to_string())?.clone()),
        event_tx: state.event_tx.clone(),
    });

    tokio::spawn(async move {
        if let Err(e) = companion_server::run(port, api_key, app_state).await {
            eprintln!("Companion server error: {}", e);
        }
    });

    Ok(format!("Companion server started on port {}", port))
}

// ---------------------------------------------------------------------------
// App Entry Point
// ---------------------------------------------------------------------------

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(AppState::new())
        .invoke_handler(tauri::generate_handler![
            // SDK
            get_sdk_config,
            set_sdk_config,
            // Devices
            list_devices,
            get_device_details,
            take_screenshot,
            device_input,
            install_apk,
            uninstall_package,
            list_packages,
            // Logcat
            get_logcat,
            clear_logcat,
            // AVDs
            list_avds,
            start_avd,
            stop_avd,
            // Builds (Gradle + Flutter)
            start_build,
            get_build_status,
            // Projects
            list_projects,
            add_project,
            remove_project,
            // Companion
            get_companion_config,
            start_companion_server,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Blitz");
}
