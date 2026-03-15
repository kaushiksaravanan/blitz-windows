use crate::BuildInfo;
use tauri::{AppHandle, Emitter};
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::sync::broadcast;
use uuid::Uuid;

/// Start a Gradle build, streaming output as Tauri events.
pub async fn start_build(
    project_path: &str,
    task: &str,
    java_home: &str,
    extra_args: Option<&[String]>,
    event_tx: broadcast::Sender<String>,
    app: AppHandle,
) -> Result<BuildInfo, String> {
    let build_id = Uuid::new_v4().to_string();
    let started_at = chrono::Utc::now().to_rfc3339();

    // Determine gradlew path
    let gradlew = if cfg!(windows) {
        format!("{}\\gradlew.bat", project_path)
    } else {
        format!("{}/gradlew", project_path)
    };

    // Check if gradlew exists
    if !std::path::Path::new(&gradlew).exists() {
        return Err(format!("gradlew not found at: {}", gradlew));
    }

    let mut cmd = tokio::process::Command::new(&gradlew);
    cmd.arg(task);
    cmd.current_dir(project_path);

    // Set JAVA_HOME if provided
    if !java_home.is_empty() {
        cmd.env("JAVA_HOME", java_home);
    }

    // Add extra arguments
    if let Some(args) = extra_args {
        for arg in args {
            cmd.arg(arg);
        }
    }

    cmd.stdout(std::process::Stdio::piped());
    cmd.stderr(std::process::Stdio::piped());

    let mut child = cmd.spawn()
        .map_err(|e| format!("Failed to start Gradle: {}", e))?;

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
            Ok(s) => ("failed".to_string(), Some(format!("Gradle exited with code {:?}", s.code()))),
            Err(e) => ("failed".to_string(), Some(format!("Process error: {}", e))),
        };

        // Try to find the output APK
        let output_apk = find_output_apk(&project_path_owned, &task_owned);

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

/// Public wrapper for companion server to call find_output_apk.
pub fn find_output_apk_public(project_path: &str, task: &str) -> Option<String> {
    find_output_apk(project_path, task)
}

/// Try to locate the output APK after a build.
fn find_output_apk(project_path: &str, task: &str) -> Option<String> {
    let variant = if task.contains("Release") || task.contains("release") {
        "release"
    } else {
        "debug"
    };

    // Standard Gradle APK output location
    let apk_dir = format!("{}\\app\\build\\outputs\\apk\\{}", project_path, variant);
    if let Some(found) = find_file_with_ext(&apk_dir, "apk") {
        return Some(found);
    }

    // Flutter APK output location (flutter build apk goes here)
    let flutter_apk_dir = format!("{}\\build\\app\\outputs\\flutter-apk", project_path);
    let expected = format!("{}\\app-{}.apk", flutter_apk_dir, variant);
    if std::path::Path::new(&expected).exists() {
        return Some(expected);
    }
    if let Some(found) = find_file_with_ext(&flutter_apk_dir, "apk") {
        return Some(found);
    }

    // Flutter uses build/app/outputs/apk/{variant} in some versions
    let flutter_gradle_dir = format!("{}\\build\\app\\outputs\\apk\\{}", project_path, variant);
    if let Some(found) = find_file_with_ext(&flutter_gradle_dir, "apk") {
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
