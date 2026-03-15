use crate::BuildInfo;
use tauri::{AppHandle, Emitter};
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::sync::broadcast;
use uuid::Uuid;

/// Start a Flutter build, streaming output as Tauri events.
///
/// The `task` parameter is a Flutter CLI subcommand string, e.g.:
/// - "build apk --debug"
/// - "build apk --release"
/// - "build appbundle"
/// - "clean"
/// - "test"
/// - "pub get"
pub async fn start_build(
    project_path: &str,
    task: &str,
    flutter_bin: &str,
    extra_args: Option<&[String]>,
    event_tx: broadcast::Sender<String>,
    app: AppHandle,
) -> Result<BuildInfo, String> {
    let build_id = Uuid::new_v4().to_string();
    let started_at = chrono::Utc::now().to_rfc3339();

    // Determine the Flutter executable
    let flutter_exe = if std::path::Path::new(flutter_bin).exists() {
        flutter_bin.to_string()
    } else {
        // Fallback: try to find flutter in PATH
        which::which("flutter")
            .map(|p| p.to_string_lossy().to_string())
            .map_err(|_| "Flutter SDK not found. Set FLUTTER_HOME or add flutter to PATH.".to_string())?
    };

    // Parse the task into arguments
    // e.g. "build apk --debug" → ["build", "apk", "--debug"]
    // Strip "flutter " prefix if present (user may pass "flutter build apk" or just "build apk")
    let task_clean = task.strip_prefix("flutter ").unwrap_or(task);
    let task_args: Vec<&str> = task_clean.split_whitespace().collect();

    if task_args.is_empty() {
        return Err("No Flutter task specified".to_string());
    }

    let mut cmd = tokio::process::Command::new(&flutter_exe);
    for arg in &task_args {
        cmd.arg(arg);
    }
    cmd.current_dir(project_path);

    // Add extra arguments
    if let Some(args) = extra_args {
        for arg in args {
            cmd.arg(arg);
        }
    }

    // Disable Flutter analytics prompts in CI-like environments
    cmd.env("CI", "true");
    cmd.env("FLUTTER_SUPPRESS_ANALYTICS", "true");

    cmd.stdout(std::process::Stdio::piped());
    cmd.stderr(std::process::Stdio::piped());

    let mut child = cmd.spawn()
        .map_err(|e| format!("Failed to start Flutter: {}", e))?;

    let build_id_clone = build_id.clone();
    let app_clone = app.clone();

    // Stream stdout
    if let Some(stdout) = child.stdout.take() {
        let bid = build_id_clone.clone();
        let app_out = app_clone.clone();
        let tx = event_tx.clone();
        tokio::spawn(async move {
            let reader = BufReader::new(stdout);
            let mut lines = reader.lines();
            while let Ok(Some(line)) = lines.next_line().await {
                let event = serde_json::json!({
                    "type": "build_log",
                    "buildId": bid,
                    "line": line,
                    "stream": "stdout"
                });
                let _ = app_out.emit("build-log", event.to_string());
                let _ = tx.send(event.to_string());
            }
        });
    }

    // Stream stderr
    if let Some(stderr) = child.stderr.take() {
        let bid = build_id_clone.clone();
        let app_err = app_clone.clone();
        let tx = event_tx.clone();
        tokio::spawn(async move {
            let reader = BufReader::new(stderr);
            let mut lines = reader.lines();
            while let Ok(Some(line)) = lines.next_line().await {
                let event = serde_json::json!({
                    "type": "build_log",
                    "buildId": bid,
                    "line": line,
                    "stream": "stderr"
                });
                let _ = app_err.emit("build-log", event.to_string());
                let _ = tx.send(event.to_string());
            }
        });
    }

    // Wait for build to finish in background
    let bid_final = build_id.clone();
    let app_final = app.clone();
    let project_path_owned = project_path.to_string();
    let task_owned = task.to_string();
    let tx_final = event_tx.clone();

    tokio::spawn(async move {
        let status = child.wait().await;
        let (phase, error) = match status {
            Ok(s) if s.success() => ("complete".to_string(), None),
            Ok(s) => ("failed".to_string(), Some(format!("Flutter exited with code {:?}", s.code()))),
            Err(e) => ("failed".to_string(), Some(format!("Process error: {}", e))),
        };

        // Try to find the output APK
        let output_apk = find_flutter_output_apk(&project_path_owned, &task_owned);

        let event = serde_json::json!({
            "type": "build_status",
            "buildId": bid_final,
            "phase": phase,
            "progress": 100,
            "outputApk": output_apk,
            "error": error,
        });
        let _ = app_final.emit("build-status", event.to_string());
        let _ = tx_final.send(event.to_string());
    });

    Ok(BuildInfo {
        id: build_id,
        project_path: project_path.to_string(),
        task: task.to_string(),
        phase: "compiling".into(),
        progress: 0,
        started_at,
        finished_at: None,
        output_apk: None,
        logs: Vec::new(),
        error: None,
    })
}

/// Try to locate the Flutter output APK/AAB after a build.
pub fn find_flutter_output_apk(project_path: &str, task: &str) -> Option<String> {
    let task_lower = task.to_lowercase();

    // App Bundle output
    if task_lower.contains("appbundle") || task_lower.contains("aab") {
        let aab_dir = format!("{}\\build\\app\\outputs\\bundle\\release", project_path);
        if let Some(found) = find_file_with_ext(&aab_dir, "aab") {
            return Some(found);
        }
    }

    // APK output — Flutter puts APKs in build/app/outputs/flutter-apk/
    let variant = if task_lower.contains("release") {
        "release"
    } else {
        "debug"
    };

    // Primary Flutter APK location
    let flutter_apk_dir = format!("{}\\build\\app\\outputs\\flutter-apk", project_path);
    let expected_apk = format!("{}\\app-{}.apk", flutter_apk_dir, variant);
    if std::path::Path::new(&expected_apk).exists() {
        return Some(expected_apk);
    }

    // Scan the flutter-apk directory for any APK
    if let Some(found) = find_file_with_ext(&flutter_apk_dir, "apk") {
        return Some(found);
    }

    // Also check the traditional Gradle APK location (some Flutter versions)
    let gradle_apk_dir = format!("{}\\build\\app\\outputs\\apk\\{}", project_path, variant);
    if let Some(found) = find_file_with_ext(&gradle_apk_dir, "apk") {
        return Some(found);
    }

    None
}

/// Find the first file with the given extension in a directory.
fn find_file_with_ext(dir: &str, ext: &str) -> Option<String> {
    if let Ok(entries) = std::fs::read_dir(dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.extension().map(|e| e == ext).unwrap_or(false) {
                return Some(path.to_string_lossy().to_string());
            }
        }
    }
    None
}
