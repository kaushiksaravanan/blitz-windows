use crate::{run_command, AdbDevice};
use base64::Engine;

/// List all ADB-connected devices (physical and emulator instances).
pub async fn list_devices(adb: &str) -> Result<Vec<AdbDevice>, String> {
    let output = run_command(adb, &["devices", "-l"]).await?;
    let mut devices = Vec::new();

    for line in output.lines().skip(1) {
        let line = line.trim();
        if line.is_empty() || line.starts_with('*') {
            continue;
        }

        let parts: Vec<&str> = line.split_whitespace().collect();
        if parts.len() < 2 {
            continue;
        }

        let serial = parts[0].to_string();
        let status = parts[1].to_string();

        // Parse key:value pairs from the rest
        let mut model = String::new();
        let mut product = String::new();
        let mut transport_id = String::new();

        for part in &parts[2..] {
            if let Some((key, value)) = part.split_once(':') {
                match key {
                    "model" => model = value.to_string(),
                    "product" => product = value.to_string(),
                    "transport_id" => transport_id = value.to_string(),
                    _ => {}
                }
            }
        }

        let is_emulator = serial.starts_with("emulator-");

        // Get Android version and API level if device is online
        let (android_version, api_level) = if status == "device" {
            let ver = get_prop(adb, &serial, "ro.build.version.release").await.unwrap_or_default();
            let api = get_prop(adb, &serial, "ro.build.version.sdk").await
                .unwrap_or_default()
                .trim()
                .parse::<u32>()
                .unwrap_or(0);
            (ver.trim().to_string(), api)
        } else {
            (String::new(), 0)
        };

        devices.push(AdbDevice {
            serial,
            device_type: status,
            model,
            product,
            transport_id,
            android_version,
            api_level,
            is_emulator,
        });
    }

    Ok(devices)
}

/// Get detailed device properties.
pub async fn get_device_details(adb: &str, serial: &str) -> Result<serde_json::Value, String> {
    let props = vec![
        ("manufacturer", "ro.product.manufacturer"),
        ("model", "ro.product.model"),
        ("brand", "ro.product.brand"),
        ("android_version", "ro.build.version.release"),
        ("api_level", "ro.build.version.sdk"),
        ("screen_density", "ro.sf.lcd_density"),
        ("abi", "ro.product.cpu.abi"),
        ("build_type", "ro.build.type"),
        ("build_display", "ro.build.display.id"),
        ("security_patch", "ro.build.version.security_patch"),
    ];

    let mut details = serde_json::Map::new();
    details.insert("serial".into(), serde_json::Value::String(serial.to_string()));

    for (key, prop) in props {
        let value = get_prop(adb, serial, prop).await.unwrap_or_default().trim().to_string();
        details.insert(key.into(), serde_json::Value::String(value));
    }

    // Get screen resolution
    let wm_output = run_command(adb, &["-s", serial, "shell", "wm", "size"]).await.unwrap_or_default();
    let resolution = wm_output
        .lines()
        .find(|l| l.contains("Physical size"))
        .map(|l| l.split(':').nth(1).unwrap_or("").trim().to_string())
        .unwrap_or_default();
    details.insert("screen_resolution".into(), serde_json::Value::String(resolution));

    // Get battery level
    let battery_output = run_command(adb, &["-s", serial, "shell", "dumpsys", "battery"]).await.unwrap_or_default();
    let battery_level = battery_output
        .lines()
        .find(|l| l.trim().starts_with("level:"))
        .map(|l| l.split(':').nth(1).unwrap_or("0").trim().to_string())
        .unwrap_or_else(|| "0".into());
    details.insert("battery_level".into(), serde_json::Value::String(battery_level));

    Ok(serde_json::Value::Object(details))
}

/// Take a screenshot and return base64-encoded PNG.
pub async fn take_screenshot(adb: &str, serial: &str) -> Result<String, String> {
    // screencap on device, pull to stdout as PNG
    let output = tokio::process::Command::new(adb)
        .args(["-s", serial, "exec-out", "screencap", "-p"])
        .output()
        .await
        .map_err(|e| format!("Failed to take screenshot: {}", e))?;

    if !output.status.success() {
        return Err(format!("screencap failed: {}", String::from_utf8_lossy(&output.stderr)));
    }

    let b64 = base64::engine::general_purpose::STANDARD.encode(&output.stdout);
    Ok(b64)
}

/// Send input events to a device via adb shell input.
pub async fn device_input(
    adb: &str,
    serial: &str,
    action: &str,
    x: Option<i32>,
    y: Option<i32>,
    to_x: Option<i32>,
    to_y: Option<i32>,
    text: Option<String>,
    key_code: Option<i32>,
    duration: Option<i32>,
) -> Result<String, String> {
    let args: Vec<String> = match action {
        "tap" => {
            let x = x.ok_or("tap requires x")?;
            let y = y.ok_or("tap requires y")?;
            vec!["-s".into(), serial.into(), "shell".into(), "input".into(), "tap".into(),
                 x.to_string(), y.to_string()]
        }
        "swipe" => {
            let x = x.ok_or("swipe requires x")?;
            let y = y.ok_or("swipe requires y")?;
            let tx = to_x.ok_or("swipe requires toX")?;
            let ty = to_y.ok_or("swipe requires toY")?;
            let dur = duration.unwrap_or(300);
            vec!["-s".into(), serial.into(), "shell".into(), "input".into(), "swipe".into(),
                 x.to_string(), y.to_string(), tx.to_string(), ty.to_string(), dur.to_string()]
        }
        "longPress" => {
            let x = x.ok_or("longPress requires x")?;
            let y = y.ok_or("longPress requires y")?;
            let dur = duration.unwrap_or(1000);
            // long press = swipe to same point with duration
            vec!["-s".into(), serial.into(), "shell".into(), "input".into(), "swipe".into(),
                 x.to_string(), y.to_string(), x.to_string(), y.to_string(), dur.to_string()]
        }
        "inputText" => {
            let txt = text.ok_or("inputText requires text")?;
            // Escape spaces for adb shell input text
            let escaped = txt.replace(' ', "%s");
            vec!["-s".into(), serial.into(), "shell".into(), "input".into(), "text".into(), escaped]
        }
        "keyEvent" => {
            let code = key_code.ok_or("keyEvent requires keyCode")?;
            vec!["-s".into(), serial.into(), "shell".into(), "input".into(), "keyevent".into(),
                 code.to_string()]
        }
        "dumpUi" => {
            // Dump UI hierarchy
            run_command(adb, &["-s", serial, "shell", "uiautomator", "dump", "/dev/tty"]).await?;
            return Ok("UI dump captured".into());
        }
        _ => return Err(format!("Unknown action: {}", action)),
    };

    let args_refs: Vec<&str> = args.iter().map(|s| s.as_str()).collect();
    run_command(adb, &args_refs).await
}

/// Install an APK on a device.
pub async fn install_apk(adb: &str, serial: &str, apk_path: &str, reinstall: bool) -> Result<String, String> {
    let mut args = vec!["-s", serial, "install"];
    if reinstall {
        args.push("-r");
    }
    args.push("-g"); // grant all permissions
    args.push(apk_path);
    run_command(adb, &args).await
}

/// Uninstall a package from a device.
pub async fn uninstall_package(adb: &str, serial: &str, package_name: &str) -> Result<String, String> {
    run_command(adb, &["-s", serial, "uninstall", package_name]).await
}

/// List installed packages on a device.
pub async fn list_packages(adb: &str, serial: &str) -> Result<Vec<String>, String> {
    let output = run_command(adb, &["-s", serial, "shell", "pm", "list", "packages", "-3"]).await?;
    let packages: Vec<String> = output
        .lines()
        .filter_map(|line| line.strip_prefix("package:"))
        .map(|s| s.trim().to_string())
        .collect();
    Ok(packages)
}

/// Get a device property via adb shell getprop.
async fn get_prop(adb: &str, serial: &str, prop: &str) -> Result<String, String> {
    run_command(adb, &["-s", serial, "shell", "getprop", prop]).await
}

/// Get recent logcat output.
pub async fn get_logcat(adb: &str, serial: &str, lines: u32) -> Result<Vec<String>, String> {
    let output = run_command(adb, &[
        "-s", serial, "logcat", "-d", "-t", &lines.to_string(), "-v", "threadtime"
    ]).await?;
    Ok(output.lines().map(|l| l.to_string()).collect())
}

/// Clear logcat buffer.
pub async fn clear_logcat(adb: &str, serial: &str) -> Result<(), String> {
    run_command(adb, &["-s", serial, "logcat", "-c"]).await?;
    Ok(())
}
