package dev.blitz.companion.data

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

// ---------------------------------------------------------------------------
// Connection to Windows Blitz controller
// ---------------------------------------------------------------------------

@Serializable
data class HostConnection(
    val host: String,
    val port: Int,
    val apiKey: String,
) {
    val baseUrl: String get() = "http://$host:$port"
    val wsUrl: String get() = "ws://$host:$port/ws/events"
}

// ---------------------------------------------------------------------------
// Health
// ---------------------------------------------------------------------------

@Serializable
data class HealthResponse(
    val status: String,
    val platform: String,
    val timestamp: String,
)

// ---------------------------------------------------------------------------
// Host status
// ---------------------------------------------------------------------------

@Serializable
data class HostStatus(
    val status: String,
    val platform: String,
    val hostname: String = "",
    val sdkPath: String = "",
    val connectedDevices: List<AdbDevice> = emptyList(),
    val availableAvds: List<AvdInfo> = emptyList(),
)

// ---------------------------------------------------------------------------
// ADB Devices — matches Rust AdbDevice struct
// ---------------------------------------------------------------------------

@Serializable
data class AdbDevice(
    val serial: String,
    @SerialName("type") val deviceType: String = "",
    val model: String = "",
    val product: String = "",
    @SerialName("transport_id") val transportId: String = "",
    @SerialName("android_version") val androidVersion: String = "",
    @SerialName("api_level") val apiLevel: Int = 0,
    @SerialName("is_emulator") val isEmulator: Boolean = false,
)

// ---------------------------------------------------------------------------
// AVD (Android Virtual Device) — matches Rust AvdInfo struct
// ---------------------------------------------------------------------------

@Serializable
data class AvdInfo(
    val name: String,
    val device: String = "",
    val path: String = "",
    val target: String = "",
    @SerialName("api_level") val apiLevel: Int = 0,
    val abi: String = "",
    @SerialName("is_running") val isRunning: Boolean = false,
    @SerialName("running_serial") val runningSerial: String? = null,
)

@Serializable
data class AvdActionRequest(
    val action: String, // "start" or "stop"
    @SerialName("cold_boot") val coldBoot: Boolean = false,
)

// ---------------------------------------------------------------------------
// Projects — matches Rust ProjectInfo struct
// ---------------------------------------------------------------------------

@Serializable
data class ProjectInfo(
    val id: String,
    val name: String,
    val path: String,
    @SerialName("application_id") val applicationId: String = "",
    @SerialName("project_type") val projectType: String = "",
)

@Serializable
data class ProjectsResponse(
    val projects: List<ProjectInfo>,
)

// ---------------------------------------------------------------------------
// Gradle / Flutter Builds — matches Rust BuildInfo struct
// ---------------------------------------------------------------------------

@Serializable
data class BuildRequest(
    @SerialName("project_path") val projectPath: String,
    val task: String,
    @SerialName("extra_args") val extraArgs: List<String>? = null,
)

@Serializable
data class BuildStartResponse(
    val success: Boolean,
    @SerialName("buildId") val buildId: String = "",
    val message: String = "",
    @SerialName("projectPath") val projectPath: String = "",
    val task: String = "",
    @SerialName("projectType") val projectType: String = "",
)

@Serializable
data class BuildInfo(
    val id: String,
    @SerialName("project_path") val projectPath: String = "",
    val task: String = "",
    val phase: String = "",
    val progress: Int = 0,
    @SerialName("started_at") val startedAt: String = "",
    @SerialName("finished_at") val finishedAt: String? = null,
    @SerialName("output_apk") val outputApk: String? = null,
    val logs: List<String> = emptyList(),
    val error: String? = null,
)

// ---------------------------------------------------------------------------
// APK Install / Uninstall
// ---------------------------------------------------------------------------

@Serializable
data class InstallRequest(
    @SerialName("apk_path") val apkPath: String,
    val reinstall: Boolean = false,
)

@Serializable
data class UninstallRequest(
    @SerialName("package_name") val packageName: String,
)

// ---------------------------------------------------------------------------
// Logcat
// ---------------------------------------------------------------------------

@Serializable
data class LogcatEntry(
    val timestamp: String = "",
    val level: String = "",
    val tag: String = "",
    val message: String = "",
)

// ---------------------------------------------------------------------------
// Screenshot
// ---------------------------------------------------------------------------

@Serializable
data class ScreenshotResponse(
    val success: Boolean,
    val data: String? = null,
    val error: String? = null,
)

// ---------------------------------------------------------------------------
// Generic success/error responses
// ---------------------------------------------------------------------------

@Serializable
data class ActionResponse(
    val success: Boolean,
    val message: String = "",
    val error: String? = null,
)

// ---------------------------------------------------------------------------
// WebSocket events
// ---------------------------------------------------------------------------

@Serializable
data class WSEvent(
    val type: String,
    val payload: String = "{}",
    val timestamp: String = "",
)
