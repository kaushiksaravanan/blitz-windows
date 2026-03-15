use crate::{run_command, AvdInfo};

/// List all configured AVDs and check which are currently running.
pub async fn list_avds(emulator_bin: &str, adb: &str) -> Result<Vec<AvdInfo>, String> {
    // Get list of AVD names
    let output = run_command(emulator_bin, &["-list-avds"]).await?;
    let avd_names: Vec<String> = output
        .lines()
        .filter(|l| !l.trim().is_empty())
        .map(|l| l.trim().to_string())
        .collect();

    // Get running emulators to match serial <-> AVD name
    let running = get_running_emulators(adb).await;

    // Determine .android AVD directory
    let avd_home = std::env::var("ANDROID_AVD_HOME").unwrap_or_else(|_| {
        let home = std::env::var("USERPROFILE").unwrap_or_default();
        format!("{}\\.android\\avd", home)
    });

    let mut avds = Vec::new();
    for name in avd_names {
        let running_serial = running.iter()
            .find(|(_, avd_name)| avd_name == &name)
            .map(|(serial, _)| serial.clone());

        // Try to parse config.ini for richer info
        let config_path = format!("{}\\{}.avd\\config.ini", avd_home, name);
        let (device, target, api_level, abi, path) = parse_avd_config(&config_path, &avd_home, &name);

        avds.push(AvdInfo {
            name: name.clone(),
            device,
            path,
            target,
            api_level,
            abi,
            is_running: running_serial.is_some(),
            running_serial,
        });
    }

    Ok(avds)
}

/// Parse an AVD config.ini file for device info.
fn parse_avd_config(config_path: &str, avd_home: &str, name: &str) -> (String, String, u32, String, String) {
    let mut device = String::new();
    let mut target = String::new();
    let mut api_level: u32 = 0;
    let mut abi = String::new();
    let mut path = format!("{}\\{}.avd", avd_home, name);

    if let Ok(content) = std::fs::read_to_string(config_path) {
        for line in content.lines() {
            let line = line.trim();
            if let Some((key, value)) = line.split_once('=') {
                let key = key.trim();
                let value = value.trim();
                match key {
                    "hw.device.name" => device = value.to_string(),
                    "tag.display" | "tag.id" => {
                        if target.is_empty() {
                            target = value.to_string();
                        }
                    }
                    "image.sysdir.1" => {
                        // Extract API level from path like "system-images/android-34/google_apis/x86_64/"
                        if let Some(android_part) = value.split('/').find(|p| p.starts_with("android-")) {
                            if let Some(level_str) = android_part.strip_prefix("android-") {
                                api_level = level_str.parse().unwrap_or(0);
                            }
                        }
                        // Extract ABI from path
                        if let Some(last) = value.trim_end_matches('/').rsplit('/').next() {
                            abi = last.to_string();
                        }
                    }
                    "abi.type" => {
                        if abi.is_empty() {
                            abi = value.to_string();
                        }
                    }
                    "AvdId" | "avd.ini.displayname" => {
                        // Could use for display name but we already have `name`
                    }
                    _ => {}
                }
            }
        }
    }

    // Also try the .ini file (not config.ini) for the target
    let ini_path = format!("{}\\{}.ini", avd_home, name);
    if let Ok(content) = std::fs::read_to_string(ini_path) {
        for line in content.lines() {
            if let Some((key, value)) = line.split_once('=') {
                let key = key.trim();
                let value = value.trim();
                if key == "target" && target.is_empty() {
                    target = value.to_string();
                }
                if key == "path" && !value.is_empty() {
                    path = value.to_string();
                }
            }
        }
    }

    (device, target, api_level, abi, path)
}

/// Start an AVD emulator. Returns immediately (emulator launches in background).
pub async fn start_avd(emulator_bin: &str, name: &str, cold_boot: bool) -> Result<String, String> {
    let mut args = vec!["-avd", name, "-no-snapshot-save"];
    if cold_boot {
        args.push("-no-snapshot-load");
    }

    // Spawn detached — we don't want to block waiting for the emulator
    let child = tokio::process::Command::new(emulator_bin)
        .args(&args)
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .spawn()
        .map_err(|e| format!("Failed to start emulator: {}", e))?;

    Ok(format!("Emulator '{}' starting (PID: {:?})", name, child.id()))
}

/// Stop an emulator by sending `emu kill` via its serial.
pub async fn stop_avd(adb: &str, serial: &str) -> Result<(), String> {
    run_command(adb, &["-s", serial, "emu", "kill"]).await?;
    Ok(())
}

/// Get running emulator serials and their AVD names.
async fn get_running_emulators(adb: &str) -> Vec<(String, String)> {
    let devices_output = run_command(adb, &["devices"]).await.unwrap_or_default();
    let mut results = Vec::new();

    for line in devices_output.lines().skip(1) {
        let parts: Vec<&str> = line.split_whitespace().collect();
        if parts.len() >= 2 && parts[0].starts_with("emulator-") && parts[1] == "device" {
            let serial = parts[0].to_string();
            // Query the AVD name from the running emulator
            if let Ok(name) = run_command(adb, &["-s", &serial, "emu", "avd", "name"]).await {
                let avd_name = name.lines().next().unwrap_or("").trim().to_string();
                if !avd_name.is_empty() {
                    results.push((serial, avd_name));
                }
            }
        }
    }

    results
}
