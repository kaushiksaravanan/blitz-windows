// Companion HTTP/WebSocket server — Express-based
// Shares the SAME appState instance

import express from "express";
import cors from "cors";
import { WebSocketServer, WebSocket } from "ws";
import http from "http";
import os from "os";
import { appState, detectProjectType } from "./state";
import * as adb from "./adb";
import * as emulator from "./emulator";
import * as gradle from "./gradle";
import * as flutter from "./flutter";
import * as reactNative from "./react-native";
import { randomUUID } from "crypto";
import type { BuildInfo } from "./types";

let server: http.Server | null = null;
let wss: WebSocketServer | null = null;

// Named listener references so we can remove them on stop
let buildLogListener: ((data: any) => void) | null = null;
let buildStatusListener: ((data: any) => void) | null = null;

// ---------------------------------------------------------------------------
// Auth middleware
// ---------------------------------------------------------------------------

function authMiddleware(apiKey: string) {
  return (req: express.Request, res: express.Response, next: express.NextFunction) => {
    // Skip auth for health endpoint
    if (req.path === "/api/v1/health") return next();

    const auth = req.headers.authorization;
    if (!auth || auth !== `Bearer ${apiKey}`) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    next();
  };
}

// ---------------------------------------------------------------------------
// Start server
// ---------------------------------------------------------------------------

export async function startCompanionServer(
  port: number,
  apiKey: string
): Promise<void> {
  if (server) {
    throw new Error("Companion server is already running");
  }

  const app = express();
  app.use(cors());
  app.use(express.json());
  app.use(authMiddleware(apiKey));

  // --- Health ---
  app.get("/api/v1/health", (_req, res) => {
    res.json({ status: "ok", version: "1.0.0" });
  });

  // --- Status ---
  app.get("/api/v1/status", (_req, res) => {
    const sdk = appState.sdkConfig;
    res.json({
      hostname: os.hostname(),
      platform: process.platform,
      sdkPath: sdk.androidSdkPath,
      javaHome: sdk.javaHome,
      adbPath: sdk.adbPath,
      emulatorPath: sdk.emulatorPath,
      flutterSdkPath: sdk.flutterSdkPath,
      devicesCount: appState.devices.length,
      projectsCount: appState.projects.length,
    });
  });

  // --- Devices ---
  app.get("/api/v1/devices", async (_req, res) => {
    try {
      const devices = await adb.listDevices(appState.sdkConfig.adbPath);
      appState.devices = devices;
      res.json({ devices });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/v1/devices/:serial", async (req, res) => {
    try {
      const details = await adb.getDeviceDetails(
        appState.sdkConfig.adbPath,
        req.params.serial
      );
      res.json(details);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/v1/devices/:serial/screenshot", async (req, res) => {
    try {
      const b64 = await adb.takeScreenshot(
        appState.sdkConfig.adbPath,
        req.params.serial
      );
      res.json({ screenshot: b64 });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/v1/devices/:serial/packages", async (req, res) => {
    try {
      const packages = await adb.listPackages(
        appState.sdkConfig.adbPath,
        req.params.serial
      );
      res.json({ packages });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/v1/devices/:serial/install", async (req, res) => {
    try {
      const { apkPath, reinstall } = req.body;
      const result = await adb.installApk(
        appState.sdkConfig.adbPath,
        req.params.serial,
        apkPath,
        reinstall ?? false
      );
      res.json({ success: true, message: result });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/v1/devices/:serial/uninstall", async (req, res) => {
    try {
      const { packageName } = req.body;
      const result = await adb.uninstallPackage(
        appState.sdkConfig.adbPath,
        req.params.serial,
        packageName
      );
      res.json({ success: true, message: result });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // --- AVDs ---
  app.get("/api/v1/avds", async (_req, res) => {
    try {
      const avds = await emulator.listAvds(
        appState.sdkConfig.emulatorPath,
        appState.sdkConfig.adbPath
      );
      appState.avds = avds;
      res.json({ avds });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/v1/avds/:name/action", (req, res) => {
    try {
      const { action, serial, coldBoot } = req.body;
      if (action === "start") {
        emulator.startAvd(
          appState.sdkConfig.emulatorPath,
          req.params.name,
          coldBoot ?? false
        );
        res.json({ success: true, message: `Starting AVD ${req.params.name}` });
      } else if (action === "stop") {
        if (!serial) {
          res.status(400).json({ error: "serial required to stop AVD" });
          return;
        }
        emulator
          .stopAvd(appState.sdkConfig.adbPath, serial)
          .then(() =>
            res.json({ success: true, message: `Stopping AVD ${req.params.name}` })
          )
          .catch((e: any) => res.status(500).json({ error: e.message }));
      } else {
        res.status(400).json({ error: `Unknown action: ${action}` });
      }
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // --- Builds ---
  app.post("/api/v1/builds", async (req, res) => {
    try {
      const { projectPath, task, extraArgs } = req.body;
      const projectType = detectProjectType(projectPath);
      const buildId = randomUUID();
      const startedAt = new Date().toISOString();

      const buildInfo: BuildInfo = {
        id: buildId,
        projectPath,
        task,
        phase: "compiling",
        progress: 0,
        startedAt,
        finishedAt: null,
        outputApk: null,
        logs: [],
        error: null,
      };

      appState.builds.set(buildId, buildInfo);

      // Run build in background
      const buildPromise =
        projectType === "flutter"
          ? flutter.startBuild(
              projectPath,
              task,
              appState.sdkConfig.flutterSdkPath
                ? `${appState.sdkConfig.flutterSdkPath}\\bin\\flutter.bat`
                : undefined,
              extraArgs,
              appState.eventBus,
              null, // no mainWindow in companion server context
              buildId
            )
          : projectType === "react-native"
            ? reactNative.startBuild(
                projectPath,
                task,
                extraArgs,
                appState.eventBus,
                null,
                buildId
              )
            : gradle.startBuild(
                projectPath,
                task,
                appState.sdkConfig.javaHome || undefined,
                extraArgs,
                appState.eventBus,
                null,
                buildId
              );

      buildPromise
        .then(({ outputApk }) => {
          const info = appState.builds.get(buildId);
          if (info) {
            info.phase = "complete";
            info.progress = 100;
            info.finishedAt = new Date().toISOString();
            info.outputApk = outputApk;
          }
        })
        .catch((err) => {
          const info = appState.builds.get(buildId);
          if (info) {
            info.phase = "failed";
            info.progress = 100;
            info.finishedAt = new Date().toISOString();
            info.error = err.message;
          }
        });

      res.json({
        success: true,
        buildId,
        message: `Build started for ${projectType} project`,
        projectPath,
        task,
        projectType,
      });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/v1/builds/:id", (req, res) => {
    const build = appState.builds.get(req.params.id);
    if (!build) {
      res.status(404).json({ error: "Build not found" });
      return;
    }
    res.json(build);
  });

  // --- Projects ---
  app.get("/api/v1/projects", (_req, res) => {
    res.json({ projects: appState.projects });
  });

  // --- Logcat ---
  app.get("/api/v1/logcat/:serial", async (req, res) => {
    try {
      const lines = parseInt(req.query.lines as string, 10) || 500;
      const logcat = await adb.getLogcat(
        appState.sdkConfig.adbPath,
        req.params.serial,
        lines
      );
      res.json({ logcat });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/v1/logcat/:serial/clear", async (req, res) => {
    try {
      await adb.clearLogcat(appState.sdkConfig.adbPath, req.params.serial);
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // --- HTTP Server + WebSocket ---
  server = http.createServer(app);
  wss = new WebSocketServer({ server, path: "/ws/events" });

  // Forward eventBus events to all WebSocket clients
  const forwardEvent = (type: string, data: any) => {
    const msg = JSON.stringify({ type, ...data });
    wss?.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(msg);
      }
    });
  };

  // Store named listener references for cleanup
  buildLogListener = (data) => forwardEvent("build_log", data);
  buildStatusListener = (data) => forwardEvent("build_status", data);

  appState.eventBus.on("build-log", buildLogListener);
  appState.eventBus.on("build-status", buildStatusListener);

  return new Promise((resolve, reject) => {
    server!.listen(port, "0.0.0.0", () => {
      console.log(`Companion server listening on 0.0.0.0:${port}`);
      appState.companionConfig.running = true;
      appState.companionConfig.port = port;
      appState.companionConfig.apiKey = apiKey;
      resolve();
    });
    server!.on("error", reject);
  });
}

export function stopCompanionServer(): void {
  // Remove eventBus listeners to prevent accumulation on restart
  if (buildLogListener) {
    appState.eventBus.removeListener("build-log", buildLogListener);
    buildLogListener = null;
  }
  if (buildStatusListener) {
    appState.eventBus.removeListener("build-status", buildStatusListener);
    buildStatusListener = null;
  }

  wss?.close();
  server?.close();
  wss = null;
  server = null;
  appState.companionConfig.running = false;
}
