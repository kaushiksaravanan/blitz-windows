// Blitz Core Client — Platform-independent API client for Android development
// Used by Windows Controller and Android Companion to talk to the Blitz companion server.
// Only includes methods for endpoints actually implemented in the Rust backend.

import type {
  AuthCredentials,
  HostInfo,
  AdbDevice,
  AdbDeviceDetails,
  AvdInfo,
  AvdActionRequest,
  AvdActionResponse,
  DeviceActionResponse,
  InstalledPackage,
  InstallApkRequest,
  UninstallApkRequest,
  ApkActionResponse,
  GradleBuildInfo,
  GradleBuildRequest,
  GradleBuildResponse,
  ProjectListResponse,
  WSEvent,
} from "./api-types";

import { API_ROUTES } from "./api-types";

export class BlitzClient {
  private baseURL: string;
  private token: string;
  private ws: WebSocket | null = null;
  private eventHandlers: Map<string, Set<(event: WSEvent) => void>> = new Map();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private maxReconnectDelay = 30000;
  private reconnectAttempts = 0;

  constructor(credentials: AuthCredentials) {
    this.baseURL = `http://${credentials.host}:${credentials.port}`;
    this.token = credentials.apiKey;
  }

  // ==========================================================================
  // HTTP helpers
  // ==========================================================================

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
    params?: Record<string, string>
  ): Promise<T> {
    let resolvedPath = path;
    if (params) {
      for (const [key, value] of Object.entries(params)) {
        resolvedPath = resolvedPath.replace(`:${key}`, encodeURIComponent(value));
      }
    }

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${this.token}`,
    };

    const response = await fetch(`${this.baseURL}${resolvedPath}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new BlitzAPIError(response.status, errorBody, resolvedPath);
    }

    const contentType = response.headers.get("content-type");
    if (contentType?.includes("application/json")) {
      return (await response.json()) as T;
    }
    return (await response.text()) as unknown as T;
  }

  private get<T>(path: string, params?: Record<string, string>): Promise<T> {
    return this.request<T>("GET", path, undefined, params);
  }

  private post<T>(path: string, body?: unknown, params?: Record<string, string>): Promise<T> {
    return this.request<T>("POST", path, body, params);
  }

  // ==========================================================================
  // Health / Status
  // ==========================================================================

  async healthCheck(): Promise<boolean> {
    try {
      await this.get(API_ROUTES.HEALTH);
      return true;
    } catch {
      return false;
    }
  }

  async getHostStatus(): Promise<HostInfo> {
    return this.get<HostInfo>(API_ROUTES.HOST_STATUS);
  }

  // ==========================================================================
  // ADB Devices
  // ==========================================================================

  async listDevices(): Promise<AdbDevice[]> {
    return this.get<AdbDevice[]>(API_ROUTES.DEVICES_LIST);
  }

  async getDeviceDetails(serial: string): Promise<AdbDeviceDetails> {
    return this.get<AdbDeviceDetails>(API_ROUTES.DEVICE_DETAILS, { serial });
  }

  async takeScreenshot(serial: string): Promise<DeviceActionResponse> {
    return this.get<DeviceActionResponse>(API_ROUTES.DEVICE_SCREENSHOT, { serial });
  }

  async listPackages(serial: string): Promise<InstalledPackage[]> {
    return this.get<InstalledPackage[]>(API_ROUTES.DEVICE_PACKAGES, { serial });
  }

  // ==========================================================================
  // APK Management
  // ==========================================================================

  async installApk(request: InstallApkRequest): Promise<ApkActionResponse> {
    return this.post<ApkActionResponse>(API_ROUTES.APK_INSTALL, request, {
      serial: request.serial,
    });
  }

  async uninstallApk(request: UninstallApkRequest): Promise<ApkActionResponse> {
    return this.post<ApkActionResponse>(API_ROUTES.APK_UNINSTALL, request, {
      serial: request.serial,
    });
  }

  // ==========================================================================
  // AVDs (Android Virtual Devices / Emulators)
  // ==========================================================================

  async listAvds(): Promise<AvdInfo[]> {
    return this.get<AvdInfo[]>(API_ROUTES.AVDS_LIST);
  }

  async avdAction(request: AvdActionRequest): Promise<AvdActionResponse> {
    return this.post<AvdActionResponse>(API_ROUTES.AVD_ACTION, request, { name: request.name });
  }

  async startAvd(name: string, coldBoot = false): Promise<AvdActionResponse> {
    return this.avdAction({ name, action: "start", coldBoot });
  }

  async stopAvd(name: string): Promise<AvdActionResponse> {
    return this.avdAction({ name, action: "stop" });
  }

  async wipeAvd(name: string): Promise<AvdActionResponse> {
    return this.avdAction({ name, action: "wipe" });
  }

  async deleteAvd(name: string): Promise<AvdActionResponse> {
    return this.avdAction({ name, action: "delete" });
  }

  // ==========================================================================
  // Builds (Gradle + Flutter)
  // ==========================================================================

  async startBuild(request: GradleBuildRequest): Promise<GradleBuildResponse> {
    return this.post<GradleBuildResponse>(API_ROUTES.BUILD_START, request);
  }

  async getBuildStatus(buildId: string): Promise<GradleBuildInfo> {
    return this.get<GradleBuildInfo>(API_ROUTES.BUILD_STATUS, { id: buildId });
  }

  // ==========================================================================
  // Projects
  // ==========================================================================

  async listProjects(): Promise<ProjectListResponse> {
    return this.get<ProjectListResponse>(API_ROUTES.PROJECTS_LIST);
  }

  // ==========================================================================
  // Logcat
  // ==========================================================================

  async getLogcatDump(serial: string): Promise<string[]> {
    return this.get<string[]>(API_ROUTES.LOGCAT_DUMP, { serial });
  }

  async clearLogcat(serial: string): Promise<void> {
    await this.post(API_ROUTES.LOGCAT_CLEAR, undefined, { serial });
  }

  // ==========================================================================
  // WebSocket — Real-time Events
  // ==========================================================================

  connectWebSocket(): void {
    if (this.ws?.readyState === WebSocket.OPEN) return;

    const wsURL = `ws://${this.baseURL.replace(/^https?:\/\//, "")}${API_ROUTES.WS_EVENTS}?token=${this.token}`;
    this.ws = new WebSocket(wsURL);

    this.ws.onopen = () => {
      console.log("[BlitzClient] WebSocket connected");
      this.reconnectAttempts = 0;
    };

    this.ws.onmessage = (event: MessageEvent) => {
      try {
        const wsEvent = JSON.parse(event.data as string) as WSEvent;
        this.dispatchEvent(wsEvent);
      } catch (e) {
        console.error("[BlitzClient] Failed to parse WebSocket message:", e);
      }
    };

    this.ws.onclose = () => {
      console.log("[BlitzClient] WebSocket disconnected, scheduling reconnect");
      this.scheduleReconnect();
    };

    this.ws.onerror = (error: Event) => {
      console.error("[BlitzClient] WebSocket error:", error);
    };
  }

  disconnectWebSocket(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.onclose = null;
      this.ws.close();
      this.ws = null;
    }
  }

  on(eventType: string, handler: (event: WSEvent) => void): () => void {
    if (!this.eventHandlers.has(eventType)) {
      this.eventHandlers.set(eventType, new Set());
    }
    this.eventHandlers.get(eventType)!.add(handler);
    return () => {
      this.eventHandlers.get(eventType)?.delete(handler);
    };
  }

  private dispatchEvent(event: WSEvent): void {
    const handlers = this.eventHandlers.get(event.type);
    if (handlers) {
      for (const handler of handlers) handler(event);
    }
    const wildcardHandlers = this.eventHandlers.get("*");
    if (wildcardHandlers) {
      for (const handler of wildcardHandlers) handler(event);
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;
    const delay = Math.min(1000 * 2 ** this.reconnectAttempts, this.maxReconnectDelay);
    this.reconnectAttempts++;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connectWebSocket();
    }, delay);
  }
}

// ==========================================================================
// Error Types
// ==========================================================================

export class BlitzAPIError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly body: string,
    public readonly path: string
  ) {
    super(`HTTP ${statusCode} on ${path}: ${body}`);
    this.name = "BlitzAPIError";
  }
}
