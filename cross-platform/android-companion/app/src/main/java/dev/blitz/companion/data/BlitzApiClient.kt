package dev.blitz.companion.data

import io.ktor.client.*
import io.ktor.client.call.*
import io.ktor.client.engine.okhttp.*
import io.ktor.client.plugins.*
import io.ktor.client.plugins.contentnegotiation.*
import io.ktor.client.plugins.logging.*
import io.ktor.client.plugins.websocket.*
import io.ktor.client.request.*
import io.ktor.client.statement.*
import io.ktor.http.*
import io.ktor.serialization.kotlinx.json.*
import io.ktor.websocket.*
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.serialization.json.Json

/**
 * API client for communicating with the Windows Blitz companion server.
 * Targets the Axum HTTP server running on the Windows controller (port 9400 by default).
 */
class BlitzApiClient {

    private var httpClient: HttpClient? = null
    private var connection: HostConnection? = null
    private var wsJob: Job? = null

    val isConnected: Boolean get() = connection != null

    private val json = Json {
        ignoreUnknownKeys = true
        isLenient = true
        encodeDefaults = true
        prettyPrint = false
    }

    private val _events = MutableSharedFlow<WSEvent>(extraBufferCapacity = 64)
    val events: SharedFlow<WSEvent> = _events

    // -----------------------------------------------------------------------
    // Connection management
    // -----------------------------------------------------------------------

    fun connect(conn: HostConnection) {
        disconnect()
        connection = conn
        httpClient = HttpClient(OkHttp) {
            install(ContentNegotiation) {
                json(json)
            }
            install(Logging) {
                level = LogLevel.HEADERS
            }
            install(WebSockets)
            defaultRequest {
                url(conn.baseUrl)
                contentType(ContentType.Application.Json)
                header(HttpHeaders.Authorization, "Bearer ${conn.apiKey}")
            }
            install(HttpTimeout) {
                requestTimeoutMillis = 30_000
                connectTimeoutMillis = 10_000
            }
        }
    }

    fun disconnect() {
        wsJob?.cancel()
        wsJob = null
        httpClient?.close()
        httpClient = null
        connection = null
    }

    private fun requireClient(): HttpClient =
        httpClient ?: throw IllegalStateException("Not connected to Windows host")

    // -----------------------------------------------------------------------
    // Health (no auth required)
    // -----------------------------------------------------------------------

    suspend fun health(): HealthResponse =
        requireClient().get("/api/v1/health").body()

    suspend fun hostStatus(): HostStatus =
        requireClient().get("/api/v1/status").body()

    // -----------------------------------------------------------------------
    // Devices (ADB)
    // -----------------------------------------------------------------------

    suspend fun listDevices(): List<AdbDevice> =
        requireClient().get("/api/v1/devices").body()

    suspend fun getDeviceDetails(serial: String): AdbDevice =
        requireClient().get("/api/v1/devices/$serial").body()

    suspend fun takeScreenshot(serial: String): ScreenshotResponse =
        requireClient().get("/api/v1/devices/$serial/screenshot").body()

    suspend fun listPackages(serial: String): List<String> =
        requireClient().get("/api/v1/devices/$serial/packages").body()

    suspend fun installApk(serial: String, apkPath: String, reinstall: Boolean = false): ActionResponse =
        requireClient().post("/api/v1/devices/$serial/install") {
            setBody(InstallRequest(apkPath, reinstall))
        }.body()

    suspend fun uninstallPackage(serial: String, packageName: String): ActionResponse =
        requireClient().post("/api/v1/devices/$serial/uninstall") {
            setBody(UninstallRequest(packageName))
        }.body()

    // -----------------------------------------------------------------------
    // AVDs (Emulators)
    // -----------------------------------------------------------------------

    suspend fun listAvds(): List<AvdInfo> =
        requireClient().get("/api/v1/avds").body()

    suspend fun avdAction(name: String, action: String, coldBoot: Boolean = false): ActionResponse =
        requireClient().post("/api/v1/avds/$name/action") {
            setBody(AvdActionRequest(action, coldBoot))
        }.body()

    suspend fun startAvd(name: String, coldBoot: Boolean = false) =
        avdAction(name, "start", coldBoot)

    suspend fun stopAvd(name: String) =
        avdAction(name, "stop")

    // -----------------------------------------------------------------------
    // Builds (Gradle + Flutter)
    // -----------------------------------------------------------------------

    suspend fun startBuild(projectPath: String, task: String, extraArgs: List<String>? = null): BuildStartResponse =
        requireClient().post("/api/v1/builds") {
            setBody(BuildRequest(projectPath, task, extraArgs))
        }.body()

    suspend fun getBuildStatus(buildId: String): BuildInfo =
        requireClient().get("/api/v1/builds/$buildId").body()

    // -----------------------------------------------------------------------
    // Projects
    // -----------------------------------------------------------------------

    suspend fun listProjects(): ProjectsResponse =
        requireClient().get("/api/v1/projects").body()

    // -----------------------------------------------------------------------
    // Logcat
    // -----------------------------------------------------------------------

    suspend fun getLogcat(serial: String): List<String> =
        requireClient().get("/api/v1/logcat/$serial").body()

    suspend fun clearLogcat(serial: String): ActionResponse =
        requireClient().post("/api/v1/logcat/$serial/clear").body()

    // -----------------------------------------------------------------------
    // WebSocket for real-time events
    // -----------------------------------------------------------------------

    fun startEventStream(scope: CoroutineScope) {
        val conn = connection ?: return
        wsJob?.cancel()
        wsJob = scope.launch(Dispatchers.IO) {
            try {
                requireClient().webSocket(urlString = conn.wsUrl) {
                    for (frame in incoming) {
                        when (frame) {
                            is Frame.Text -> {
                                try {
                                    val event = json.decodeFromString<WSEvent>(frame.readText())
                                    _events.emit(event)
                                } catch (_: Exception) {
                                    // Skip malformed events
                                }
                            }
                            else -> {}
                        }
                    }
                }
            } catch (_: CancellationException) {
                // Normal cancellation
            } catch (_: Exception) {
                // Connection lost — caller can retry
            }
        }
    }

    fun stopEventStream() {
        wsJob?.cancel()
        wsJob = null
    }
}
