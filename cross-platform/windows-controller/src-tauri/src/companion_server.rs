use crate::AppState;
use axum::{
    extract::{ws::WebSocketUpgrade, Path, State as AxumState},
    http::{HeaderMap, StatusCode},
    response::{IntoResponse, Json},
    routing::{get, post},
    Router,
};
use serde::Deserialize;
use std::sync::Arc;
use tower_http::cors::CorsLayer;

/// Run the companion HTTP server (for Android companion app to connect).
pub async fn run(port: u16, api_key: String, state: Arc<AppState>) -> Result<(), String> {
    let shared = Arc::new(CompanionState { api_key, app: state });

    let app = Router::new()
        // Health
        .route("/api/v1/health", get(health))
        .route("/api/v1/status", get(host_status))
        // Devices
        .route("/api/v1/devices", get(list_devices))
        .route("/api/v1/devices/{serial}", get(device_details))
        .route("/api/v1/devices/{serial}/screenshot", get(device_screenshot))
        .route("/api/v1/devices/{serial}/packages", get(device_packages))
        .route("/api/v1/devices/{serial}/install", post(install_apk))
        .route("/api/v1/devices/{serial}/uninstall", post(uninstall_apk))
        // AVDs
        .route("/api/v1/avds", get(list_avds))
        .route("/api/v1/avds/{name}/action", post(avd_action))
        // Builds
        .route("/api/v1/builds", post(start_build))
        .route("/api/v1/builds/{id}", get(build_status))
        // Projects
        .route("/api/v1/projects", get(list_projects))
        // Logcat
        .route("/api/v1/logcat/{serial}", get(logcat_dump))
        .route("/api/v1/logcat/{serial}/clear", post(logcat_clear))
        // WebSocket
        .route("/ws/events", get(ws_events))
        .layer(CorsLayer::permissive())
        .with_state(shared);

    let addr = format!("0.0.0.0:{}", port);
    let listener = tokio::net::TcpListener::bind(&addr)
        .await
        .map_err(|e| format!("Failed to bind {}: {}", addr, e))?;

    println!("Companion server listening on {}", addr);

    axum::serve(listener, app)
        .await
        .map_err(|e| format!("Server error: {}", e))
}

struct CompanionState {
    api_key: String,
    app: Arc<AppState>,
}

/// Verify Bearer token from request headers.
fn check_auth(headers: &HeaderMap, expected: &str) -> Result<(), StatusCode> {
    let auth = headers
        .get("authorization")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("");

    if auth == format!("Bearer {}", expected) {
        Ok(())
    } else {
        Err(StatusCode::UNAUTHORIZED)
    }
}

// ---------------------------------------------------------------------------
// Route Handlers
// ---------------------------------------------------------------------------

async fn health() -> impl IntoResponse {
    Json(serde_json::json!({
        "status": "ok",
        "platform": "windows",
        "timestamp": chrono::Utc::now().to_rfc3339()
    }))
}

async fn host_status(
    headers: HeaderMap,
    AxumState(state): AxumState<Arc<CompanionState>>,
) -> Result<impl IntoResponse, StatusCode> {
    check_auth(&headers, &state.api_key)?;

    let devices = state.app.devices.lock().unwrap().clone();
    let avds = state.app.avds.lock().unwrap().clone();
    let sdk = state.app.sdk_config.lock().unwrap().clone();

    let host = hostname::get()
        .map(|h| h.to_string_lossy().to_string())
        .unwrap_or_else(|_| "unknown".to_string());

    Ok(Json(serde_json::json!({
        "status": "online",
        "platform": "windows",
        "hostname": host,
        "sdkPath": sdk.android_sdk_path,
        "flutterSdkPath": sdk.flutter_sdk_path,
        "connectedDevices": devices,
        "availableAvds": avds,
    })))
}

async fn list_devices(
    headers: HeaderMap,
    AxumState(state): AxumState<Arc<CompanionState>>,
) -> Result<impl IntoResponse, StatusCode> {
    check_auth(&headers, &state.api_key)?;
    let adb = state.app.adb_path();
    match crate::adb::list_devices(&adb).await {
        Ok(devices) => Ok(Json(serde_json::json!(devices))),
        Err(e) => Ok(Json(serde_json::json!({ "error": e }))),
    }
}

async fn device_details(
    headers: HeaderMap,
    Path(serial): Path<String>,
    AxumState(state): AxumState<Arc<CompanionState>>,
) -> Result<impl IntoResponse, StatusCode> {
    check_auth(&headers, &state.api_key)?;
    let adb = state.app.adb_path();
    match crate::adb::get_device_details(&adb, &serial).await {
        Ok(details) => Ok(Json(details)),
        Err(e) => Ok(Json(serde_json::json!({ "error": e }))),
    }
}

async fn device_screenshot(
    headers: HeaderMap,
    Path(serial): Path<String>,
    AxumState(state): AxumState<Arc<CompanionState>>,
) -> Result<impl IntoResponse, StatusCode> {
    check_auth(&headers, &state.api_key)?;
    let adb = state.app.adb_path();
    match crate::adb::take_screenshot(&adb, &serial).await {
        Ok(b64) => Ok(Json(serde_json::json!({ "success": true, "data": b64 }))),
        Err(e) => Ok(Json(serde_json::json!({ "success": false, "error": e }))),
    }
}

async fn device_packages(
    headers: HeaderMap,
    Path(serial): Path<String>,
    AxumState(state): AxumState<Arc<CompanionState>>,
) -> Result<impl IntoResponse, StatusCode> {
    check_auth(&headers, &state.api_key)?;
    let adb = state.app.adb_path();
    match crate::adb::list_packages(&adb, &serial).await {
        Ok(packages) => Ok(Json(serde_json::json!(packages))),
        Err(e) => Ok(Json(serde_json::json!({ "error": e }))),
    }
}

#[derive(Deserialize)]
struct InstallRequest {
    apk_path: String,
    reinstall: Option<bool>,
}

async fn install_apk(
    headers: HeaderMap,
    Path(serial): Path<String>,
    AxumState(state): AxumState<Arc<CompanionState>>,
    Json(body): Json<InstallRequest>,
) -> Result<impl IntoResponse, StatusCode> {
    check_auth(&headers, &state.api_key)?;
    let adb = state.app.adb_path();
    match crate::adb::install_apk(&adb, &serial, &body.apk_path, body.reinstall.unwrap_or(false)).await {
        Ok(msg) => Ok(Json(serde_json::json!({ "success": true, "message": msg }))),
        Err(e) => Ok(Json(serde_json::json!({ "success": false, "message": e }))),
    }
}

#[derive(Deserialize)]
struct UninstallRequest {
    package_name: String,
}

async fn uninstall_apk(
    headers: HeaderMap,
    Path(serial): Path<String>,
    AxumState(state): AxumState<Arc<CompanionState>>,
    Json(body): Json<UninstallRequest>,
) -> Result<impl IntoResponse, StatusCode> {
    check_auth(&headers, &state.api_key)?;
    let adb = state.app.adb_path();
    match crate::adb::uninstall_package(&adb, &serial, &body.package_name).await {
        Ok(msg) => Ok(Json(serde_json::json!({ "success": true, "message": msg }))),
        Err(e) => Ok(Json(serde_json::json!({ "success": false, "message": e }))),
    }
}

async fn list_avds(
    headers: HeaderMap,
    AxumState(state): AxumState<Arc<CompanionState>>,
) -> Result<impl IntoResponse, StatusCode> {
    check_auth(&headers, &state.api_key)?;
    let emulator_bin = state.app.emulator_path();
    let adb = state.app.adb_path();
    match crate::emulator::list_avds(&emulator_bin, &adb).await {
        Ok(avds) => Ok(Json(serde_json::json!(avds))),
        Err(e) => Ok(Json(serde_json::json!({ "error": e }))),
    }
}

#[derive(Deserialize)]
struct AvdActionRequest {
    action: String,
    cold_boot: Option<bool>,
}

async fn avd_action(
    headers: HeaderMap,
    Path(name): Path<String>,
    AxumState(state): AxumState<Arc<CompanionState>>,
    Json(body): Json<AvdActionRequest>,
) -> Result<impl IntoResponse, StatusCode> {
    check_auth(&headers, &state.api_key)?;

    match body.action.as_str() {
        "start" => {
            let emulator_bin = state.app.emulator_path();
            match crate::emulator::start_avd(&emulator_bin, &name, body.cold_boot.unwrap_or(false)).await {
                Ok(msg) => Ok(Json(serde_json::json!({ "success": true, "message": msg }))),
                Err(e) => Ok(Json(serde_json::json!({ "success": false, "message": e }))),
            }
        }
        "stop" => {
            // Find the serial for this AVD
            let adb = state.app.adb_path();
            let avds = state.app.avds.lock().unwrap().clone();
            if let Some(avd) = avds.iter().find(|a| a.name == name) {
                if let Some(serial) = &avd.running_serial {
                    match crate::emulator::stop_avd(&adb, serial).await {
                        Ok(()) => Ok(Json(serde_json::json!({ "success": true, "message": "Emulator stopped" }))),
                        Err(e) => Ok(Json(serde_json::json!({ "success": false, "message": e }))),
                    }
                } else {
                    Ok(Json(serde_json::json!({ "success": false, "message": "Emulator not running" })))
                }
            } else {
                Ok(Json(serde_json::json!({ "success": false, "message": "AVD not found" })))
            }
        }
        _ => Ok(Json(serde_json::json!({ "success": false, "message": "Unknown action" }))),
    }
}

#[derive(Deserialize)]
struct BuildRequest {
    project_path: String,
    task: String,
    extra_args: Option<Vec<String>>,
}

async fn start_build(
    headers: HeaderMap,
    AxumState(state): AxumState<Arc<CompanionState>>,
    Json(body): Json<BuildRequest>,
) -> Result<impl IntoResponse, StatusCode> {
    check_auth(&headers, &state.api_key)?;

    let sdk_config = state.app.sdk_config.lock().unwrap().clone();
    let event_tx = state.app.event_tx.clone();

    // Determine project type and build accordingly
    let project_type = crate::detect_project_type(&body.project_path);
    let task_is_flutter = body.task.starts_with("flutter ") || project_type == "flutter";

    let build_id = uuid::Uuid::new_v4().to_string();
    let started_at = chrono::Utc::now().to_rfc3339();

    // Build in a background task — companion server doesn't have AppHandle,
    // so we use a simplified approach that only streams to the broadcast channel
    let project_path = body.project_path.clone();
    let task = body.task.clone();
    let extra_args = body.extra_args.clone();
    let bid = build_id.clone();
    let tx = event_tx.clone();
    let app_state = state.app.clone(); // Clone the Arc, not the Mutex

    let build_info = crate::BuildInfo {
        id: build_id.clone(),
        project_path: body.project_path.clone(),
        task: body.task.clone(),
        phase: "compiling".into(),
        progress: 0,
        started_at: started_at.clone(),
        finished_at: None,
        output_apk: None,
        logs: Vec::new(),
        error: None,
    };

    // Store the build
    if let Ok(mut b) = app_state.builds.lock() {
        b.insert(build_id.clone(), build_info.clone());
    }

    tokio::spawn(async move {
        let result = if task_is_flutter {
            run_flutter_build_headless(&project_path, &task, &sdk_config.flutter_sdk_path, extra_args.as_deref(), &tx, &bid).await
        } else {
            run_gradle_build_headless(&project_path, &task, &sdk_config.java_home, extra_args.as_deref(), &tx, &bid).await
        };

        let (phase, output_apk, error) = match result {
            Ok(apk) => ("complete".to_string(), apk, None),
            Err(e) => ("failed".to_string(), None, Some(e)),
        };

        // Update build status
        if let Ok(mut b) = app_state.builds.lock() {
            if let Some(info) = b.get_mut(&bid) {
                info.phase = phase.clone();
                info.progress = 100;
                info.finished_at = Some(chrono::Utc::now().to_rfc3339());
                info.output_apk = output_apk.clone();
                info.error = error.clone();
            }
        }

        let event = serde_json::json!({
            "type": "build_status",
            "buildId": bid,
            "phase": phase,
            "progress": 100,
            "outputApk": output_apk,
            "error": error,
        });
        let _ = tx.send(event.to_string());
    });

    Ok(Json(serde_json::json!({
        "success": true,
        "buildId": build_id,
        "message": "Build started — use WebSocket or GET /api/v1/builds/:id for status",
        "projectPath": body.project_path,
        "task": body.task,
        "projectType": project_type,
    })))
}

/// Run a Gradle build without AppHandle (headless, for companion server).
async fn run_gradle_build_headless(
    project_path: &str,
    task: &str,
    java_home: &str,
    extra_args: Option<&[String]>,
    tx: &tokio::sync::broadcast::Sender<String>,
    build_id: &str,
) -> Result<Option<String>, String> {
    use tokio::io::{AsyncBufReadExt, BufReader};

    let gradlew = format!("{}\\gradlew.bat", project_path);
    if !std::path::Path::new(&gradlew).exists() {
        return Err(format!("gradlew.bat not found at: {}", gradlew));
    }

    let mut cmd = tokio::process::Command::new(&gradlew);
    cmd.arg(task);
    cmd.current_dir(project_path);
    if !java_home.is_empty() {
        cmd.env("JAVA_HOME", java_home);
    }
    if let Some(args) = extra_args {
        for arg in args { cmd.arg(arg); }
    }
    cmd.stdout(std::process::Stdio::piped());
    cmd.stderr(std::process::Stdio::piped());

    let mut child = cmd.spawn().map_err(|e| format!("Failed to start Gradle: {}", e))?;

    // Stream output to broadcast channel
    if let Some(stdout) = child.stdout.take() {
        let tx_c = tx.clone();
        let bid = build_id.to_string();
        tokio::spawn(async move {
            let reader = BufReader::new(stdout);
            let mut lines = reader.lines();
            while let Ok(Some(line)) = lines.next_line().await {
                let event = serde_json::json!({ "type": "build_log", "buildId": bid, "line": line, "stream": "stdout" });
                let _ = tx_c.send(event.to_string());
            }
        });
    }
    if let Some(stderr) = child.stderr.take() {
        let tx_c = tx.clone();
        let bid = build_id.to_string();
        tokio::spawn(async move {
            let reader = BufReader::new(stderr);
            let mut lines = reader.lines();
            while let Ok(Some(line)) = lines.next_line().await {
                let event = serde_json::json!({ "type": "build_log", "buildId": bid, "line": line, "stream": "stderr" });
                let _ = tx_c.send(event.to_string());
            }
        });
    }

    let status = child.wait().await.map_err(|e| format!("Process error: {}", e))?;
    if !status.success() {
        return Err(format!("Gradle exited with code {:?}", status.code()));
    }

    // Try to find output APK
    let apk = crate::gradle::find_output_apk_public(project_path, task);
    Ok(apk)
}

/// Run a Flutter build without AppHandle (headless, for companion server).
async fn run_flutter_build_headless(
    project_path: &str,
    task: &str,
    flutter_sdk_path: &str,
    extra_args: Option<&[String]>,
    tx: &tokio::sync::broadcast::Sender<String>,
    build_id: &str,
) -> Result<Option<String>, String> {
    use tokio::io::{AsyncBufReadExt, BufReader};

    let flutter_exe = if !flutter_sdk_path.is_empty() {
        let candidate = format!("{}\\bin\\flutter.bat", flutter_sdk_path);
        if std::path::Path::new(&candidate).exists() {
            candidate
        } else {
            "flutter".to_string()
        }
    } else {
        "flutter".to_string()
    };

    let task_clean = task.strip_prefix("flutter ").unwrap_or(task);
    let task_args: Vec<&str> = task_clean.split_whitespace().collect();

    let mut cmd = tokio::process::Command::new(&flutter_exe);
    for arg in &task_args { cmd.arg(arg); }
    cmd.current_dir(project_path);
    cmd.env("CI", "true");
    cmd.env("FLUTTER_SUPPRESS_ANALYTICS", "true");
    if let Some(args) = extra_args {
        for arg in args { cmd.arg(arg); }
    }
    cmd.stdout(std::process::Stdio::piped());
    cmd.stderr(std::process::Stdio::piped());

    let mut child = cmd.spawn().map_err(|e| format!("Failed to start Flutter: {}", e))?;

    if let Some(stdout) = child.stdout.take() {
        let tx_c = tx.clone();
        let bid = build_id.to_string();
        tokio::spawn(async move {
            let reader = BufReader::new(stdout);
            let mut lines = reader.lines();
            while let Ok(Some(line)) = lines.next_line().await {
                let event = serde_json::json!({ "type": "build_log", "buildId": bid, "line": line, "stream": "stdout" });
                let _ = tx_c.send(event.to_string());
            }
        });
    }
    if let Some(stderr) = child.stderr.take() {
        let tx_c = tx.clone();
        let bid = build_id.to_string();
        tokio::spawn(async move {
            let reader = BufReader::new(stderr);
            let mut lines = reader.lines();
            while let Ok(Some(line)) = lines.next_line().await {
                let event = serde_json::json!({ "type": "build_log", "buildId": bid, "line": line, "stream": "stderr" });
                let _ = tx_c.send(event.to_string());
            }
        });
    }

    let status = child.wait().await.map_err(|e| format!("Process error: {}", e))?;
    if !status.success() {
        return Err(format!("Flutter exited with code {:?}", status.code()));
    }

    let apk = crate::flutter::find_flutter_output_apk(project_path, task);
    Ok(apk)
}

async fn build_status(
    headers: HeaderMap,
    Path(id): Path<String>,
    AxumState(state): AxumState<Arc<CompanionState>>,
) -> Result<impl IntoResponse, StatusCode> {
    check_auth(&headers, &state.api_key)?;
    let builds = state.app.builds.lock().unwrap();
    match builds.get(&id) {
        Some(info) => Ok(Json(serde_json::json!(info))),
        None => Ok(Json(serde_json::json!({ "error": "Build not found" }))),
    }
}

async fn list_projects(
    headers: HeaderMap,
    AxumState(state): AxumState<Arc<CompanionState>>,
) -> Result<impl IntoResponse, StatusCode> {
    check_auth(&headers, &state.api_key)?;
    let projects = state.app.projects.lock().unwrap().clone();
    Ok(Json(serde_json::json!({ "projects": projects })))
}

async fn logcat_dump(
    headers: HeaderMap,
    Path(serial): Path<String>,
    AxumState(state): AxumState<Arc<CompanionState>>,
) -> Result<impl IntoResponse, StatusCode> {
    check_auth(&headers, &state.api_key)?;
    let adb = state.app.adb_path();
    match crate::adb::get_logcat(&adb, &serial, 200).await {
        Ok(lines) => Ok(Json(serde_json::json!(lines))),
        Err(e) => Ok(Json(serde_json::json!({ "error": e }))),
    }
}

async fn logcat_clear(
    headers: HeaderMap,
    Path(serial): Path<String>,
    AxumState(state): AxumState<Arc<CompanionState>>,
) -> Result<impl IntoResponse, StatusCode> {
    check_auth(&headers, &state.api_key)?;
    let adb = state.app.adb_path();
    match crate::adb::clear_logcat(&adb, &serial).await {
        Ok(()) => Ok(Json(serde_json::json!({ "success": true }))),
        Err(e) => Ok(Json(serde_json::json!({ "success": false, "error": e }))),
    }
}

async fn ws_events(
    ws: WebSocketUpgrade,
    AxumState(state): AxumState<Arc<CompanionState>>,
) -> impl IntoResponse {
    ws.on_upgrade(move |mut socket| async move {
        let mut rx = state.app.event_tx.subscribe();
        while let Ok(msg) = rx.recv().await {
            if socket
                .send(axum::extract::ws::Message::Text(msg))
                .await
                .is_err()
            {
                break;
            }
        }
    })
}
