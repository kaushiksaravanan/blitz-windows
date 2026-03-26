import { existsSync, mkdirSync, statSync, writeFileSync } from "fs";
import path from "path";
import { createHash } from "crypto";
import { BrowserWindow } from "electron";
import { EventEmitter } from "events";
import { execFile, spawn } from "child_process";
import { promisify } from "util";
import * as adb from "./adb";
import type {
  UiAutomationAction,
  UiAutomationEdge,
  UiAutomationRequest,
  UiAutomationRunResult,
  UiAutomationRunState,
  UiAutomationScreenNode,
} from "./types";

const execFileAsync = promisify(execFile);

type ParsedNode = {
  text: string;
  contentDesc: string;
  resourceId: string;
  className: string;
  bounds: string;
  clickable: boolean;
  enabled: boolean;
  centerX: number;
  centerY: number;
};

type RunContext = {
  nodesByHash: Map<string, UiAutomationScreenNode>;
  edges: UiAutomationEdge[];
  events: Array<Record<string, unknown>>;
  executedActionsByScreen: Map<string, Set<string>>;
  notes: string[];
};

type RecordingHandle = {
  started: boolean;
  reason?: string;
  stop: () => Promise<string | null>;
};

type RunControl = {
  paused: boolean;
  stopRequested: boolean;
  waiters: Array<() => void>;
};

let runState: UiAutomationRunState = createInitialState();
let activeRun: Promise<UiAutomationRunResult> | null = null;

const MAX_XML_SIZE = 6 * 1024 * 1024;
const MAX_LOG_LINES_STORED_PER_STEP = 120;
const MAX_LOG_LINE_LENGTH = 1400;
const control: RunControl = {
  paused: false,
  stopRequested: false,
  waiters: [],
};
let stateDispatchers:
  | {
      mainWindow: BrowserWindow | null;
      eventBus: EventEmitter;
    }
  | null = null;

function createInitialState(): UiAutomationRunState {
  return {
    phase: "idle",
    progress: 0,
    currentStep: "",
    startedAt: null,
    finishedAt: null,
    error: null,
  };
}

function updateState(
  partial: Partial<UiAutomationRunState>,
  mainWindow: BrowserWindow | null,
  eventBus: EventEmitter
): void {
  runState = { ...runState, ...partial };
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("ui-automation-state", { ...runState });
  }
  eventBus.emit("ui-automation-state", { ...runState });
}

function addLog(message: string, mainWindow: BrowserWindow | null, eventBus: EventEmitter): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("ui-automation-log", message);
  }
  eventBus.emit("ui-automation-log", message);
}

function flushWaiters(): void {
  const waiters = [...control.waiters];
  control.waiters = [];
  for (const waiter of waiters) waiter();
}

async function waitWhilePaused(): Promise<void> {
  while (control.paused && !control.stopRequested) {
    await new Promise<void>((resolve) => {
      control.waiters.push(resolve);
    });
  }
}

function ensureNotStopped(): void {
  if (control.stopRequested) {
    throw new Error("AUTOMATION_STOPPED_BY_USER");
  }
}

async function checkControlPoint(): Promise<void> {
  ensureNotStopped();
  await waitWhilePaused();
  ensureNotStopped();
}

async function controlledDelay(totalMs: number): Promise<void> {
  let remaining = Math.max(0, Math.floor(totalMs));
  while (remaining > 0) {
    await checkControlPoint();
    const slice = Math.min(200, remaining);
    await sleep(slice);
    remaining -= slice;
  }
  await checkControlPoint();
}

export function getUiAutomationState(): UiAutomationRunState {
  return { ...runState };
}

export function pauseUiAutomation(): { success: boolean; state: UiAutomationRunState } {
  if (!activeRun) {
    throw new Error("No automation run is active");
  }
  if (control.stopRequested) {
    throw new Error("Automation is already stopping");
  }
  if (control.paused) {
    return { success: true, state: { ...runState } };
  }
  control.paused = true;
  if (stateDispatchers) {
    addLog("Pause requested", stateDispatchers.mainWindow, stateDispatchers.eventBus);
    updateState(
      {
        phase: "paused",
        currentStep: "Paused by user",
      },
      stateDispatchers.mainWindow,
      stateDispatchers.eventBus
    );
  }
  return { success: true, state: { ...runState } };
}

export function resumeUiAutomation(): { success: boolean; state: UiAutomationRunState } {
  if (!activeRun) {
    throw new Error("No automation run is active");
  }
  if (control.stopRequested) {
    throw new Error("Automation is already stopping");
  }
  if (!control.paused) {
    return { success: true, state: { ...runState } };
  }
  control.paused = false;
  flushWaiters();
  if (stateDispatchers) {
    addLog("Resume requested", stateDispatchers.mainWindow, stateDispatchers.eventBus);
    updateState(
      {
        phase: "running",
        currentStep: "Resuming automation",
      },
      stateDispatchers.mainWindow,
      stateDispatchers.eventBus
    );
  }
  return { success: true, state: { ...runState } };
}

export function stopUiAutomation(): { success: boolean; state: UiAutomationRunState } {
  if (!activeRun) {
    throw new Error("No automation run is active");
  }
  if (control.stopRequested) {
    return { success: true, state: { ...runState } };
  }
  control.stopRequested = true;
  control.paused = false;
  flushWaiters();
  if (stateDispatchers) {
    addLog("Stop requested", stateDispatchers.mainWindow, stateDispatchers.eventBus);
    updateState(
      {
        phase: "stopped",
        currentStep: "Stopping automation...",
      },
      stateDispatchers.mainWindow,
      stateDispatchers.eventBus
    );
  }
  return { success: true, state: { ...runState } };
}

function ensureDir(dir: string): void {
  mkdirSync(dir, { recursive: true });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseBounds(bounds: string): { centerX: number; centerY: number } | null {
  const match = bounds.match(/\[(\d+),(\d+)\]\[(\d+),(\d+)\]/);
  if (!match) return null;
  const x1 = parseInt(match[1], 10);
  const y1 = parseInt(match[2], 10);
  const x2 = parseInt(match[3], 10);
  const y2 = parseInt(match[4], 10);
  if (!Number.isFinite(x1) || !Number.isFinite(y1) || !Number.isFinite(x2) || !Number.isFinite(y2)) {
    return null;
  }
  return {
    centerX: Math.floor((x1 + x2) / 2),
    centerY: Math.floor((y1 + y2) / 2),
  };
}

function parseXmlNodes(xml: string): ParsedNode[] {
  const nodes: ParsedNode[] = [];
  const tags = xml.match(/<node\b[^>]*>/g) || [];

  for (const tag of tags) {
    const attrs: Record<string, string> = {};
    for (const match of tag.matchAll(/([\w:-]+)="([^"]*)"/g)) {
      attrs[match[1]] = match[2];
    }

    const bounds = attrs.bounds || "";
    const parsed = parseBounds(bounds);
    if (!parsed) continue;

    nodes.push({
      text: attrs.text || "",
      contentDesc: attrs["content-desc"] || "",
      resourceId: attrs["resource-id"] || "",
      className: attrs.class || "",
      bounds,
      clickable: attrs.clickable === "true" || attrs["long-clickable"] === "true",
      enabled: attrs.enabled !== "false",
      centerX: parsed.centerX,
      centerY: parsed.centerY,
    });
  }

  return nodes;
}

function stableScreenHash(xml: string): string {
  const normalized = xml
    .replace(/index="\d+"/g, "")
    .replace(/bounds="\[[^\]]+\]\[[^\]]+\]"/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return createHash("sha1").update(normalized).digest("hex");
}

function extractKeywords(instruction: string): string[] {
  const stopWords = new Set([
    "the",
    "and",
    "with",
    "this",
    "that",
    "then",
    "from",
    "into",
    "your",
    "will",
    "just",
    "open",
    "try",
    "all",
    "app",
  ]);

  const tokens = instruction
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 3 && !stopWords.has(token));

  const seeded = ["order", "buy", "checkout", "cart", "pay", "continue", "confirm"];
  return Array.from(new Set([...tokens, ...seeded]));
}

function scoreAction(node: ParsedNode, keywords: string[]): number {
  const haystack = `${node.text} ${node.contentDesc} ${node.resourceId} ${node.className}`.toLowerCase();

  let score = 0;
  if (node.clickable) score += 6;
  if (node.enabled) score += 4;
  if (node.text) score += 3;
  if (node.contentDesc) score += 2;
  if (/button|imagebutton/i.test(node.className)) score += 5;
  if (/btn|button|action|submit|order|buy|checkout|cart|pay|next|continue|confirm/i.test(node.resourceId)) score += 5;

  for (const keyword of keywords) {
    if (haystack.includes(keyword)) score += 8;
  }

  if (/cancel|dismiss|close/.test(haystack)) score -= 1;
  return score;
}

function buildActions(xml: string, instruction: string): UiAutomationAction[] {
  const parsedNodes = parseXmlNodes(xml);
  const keywords = extractKeywords(instruction);
  const deduped = new Map<string, UiAutomationAction>();

  for (const node of parsedNodes) {
    if (!node.clickable || !node.enabled) continue;
    const seed = `${node.text}|${node.contentDesc}|${node.resourceId}|${node.bounds}`;
    const id = createHash("sha1").update(seed).digest("hex").slice(0, 12);
    if (deduped.has(id)) continue;

    deduped.set(id, {
      id,
      text: node.text,
      contentDesc: node.contentDesc,
      resourceId: node.resourceId,
      className: node.className,
      bounds: node.bounds,
      centerX: node.centerX,
      centerY: node.centerY,
      score: scoreAction(node, keywords),
    });
  }

  return Array.from(deduped.values()).sort((a, b) => b.score - a.score);
}

function extractUiText(xml: string): string {
  const texts: string[] = [];

  for (const match of xml.matchAll(/\btext="([^"]+)"/g)) {
    const text = match[1].trim();
    if (text) texts.push(text);
    if (texts.length >= 30) break;
  }

  if (texts.length === 0) {
    for (const match of xml.matchAll(/\bcontent-desc="([^"]+)"/g)) {
      const text = match[1].trim();
      if (text) texts.push(text);
      if (texts.length >= 30) break;
    }
  }

  return texts.join(" | ");
}

async function captureStepScreenshot(
  adbPath: string,
  serial: string,
  screenshotsDir: string,
  step: number
): Promise<string | null> {
  try {
    const b64 = await adb.takeScreenshot(adbPath, serial);
    const filePath = path.join(screenshotsDir, `step_${String(step).padStart(3, "0")}.png`);
    writeFileSync(filePath, Buffer.from(b64, "base64"));
    return filePath;
  } catch {
    return null;
  }
}

async function findTesseract(): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync("where", ["tesseract"], {
      timeout: 5000,
      windowsHide: true,
    });
    const candidate = stdout
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find((line) => !!line);
    return candidate || null;
  } catch {
    return null;
  }
}

async function runOcr(
  tesseractPath: string,
  screenshotPath: string,
  fallbackText: string
): Promise<string> {
  try {
    const { stdout } = await execFileAsync(
      tesseractPath,
      [screenshotPath, "stdout", "--psm", "6"],
      { timeout: 12000, windowsHide: true, maxBuffer: 1024 * 1024 }
    );
    const normalized = stdout
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .join(" ")
      .slice(0, 700);
    return normalized || fallbackText;
  } catch {
    return fallbackText;
  }
}

async function dumpUiXml(adbPath: string, serial: string): Promise<string> {
  let xml: unknown;
  try {
    xml = await adb.deviceInput(adbPath, serial, "dumpUi");
  } catch {
    return "";
  }
  if (typeof xml !== "string") return "";
  const trimmed = xml.trim();
  if (!trimmed || trimmed.length > MAX_XML_SIZE) return "";
  return trimmed;
}

async function getCurrentActivity(adbPath: string, serial: string): Promise<string> {
  try {
    const { stdout } = await adb.runAdbCommand(adbPath, [
      "-s",
      serial,
      "shell",
      "dumpsys",
      "window",
      "windows",
    ]);
    const currentFocus = stdout.match(/mCurrentFocus=.*\{[^\s]+\s+([^\s\}]+)\}/i);
    if (currentFocus?.[1]) return currentFocus[1];
    const focusedApp = stdout.match(/mFocusedApp=.*\s([A-Za-z0-9_.$/]+)\s/i);
    if (focusedApp?.[1]) return focusedApp[1];
  } catch {
    // ignore
  }
  return "unknown";
}

async function sendTap(adbPath: string, serial: string, x: number, y: number): Promise<void> {
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    throw new Error("Tap coordinates are invalid");
  }
  await adb.runAdbCommand(adbPath, [
    "-s",
    serial,
    "shell",
    "input",
    "tap",
    `${x}`,
    `${y}`,
  ]);
}

async function sendBack(adbPath: string, serial: string): Promise<void> {
  await adb.runAdbCommand(adbPath, ["-s", serial, "shell", "input", "keyevent", "4"]);
}

function chooseNextAction(
  screen: UiAutomationScreenNode,
  executedActionsByScreen: Map<string, Set<string>>,
  planningMode: boolean
): UiAutomationAction | null {
  const used = executedActionsByScreen.get(screen.id) || new Set<string>();
  const candidates = screen.actions.filter((action) => !used.has(action.id));
  if (candidates.length === 0) return null;

  if (planningMode) {
    const targeted = candidates.filter((action) => action.score >= 10);
    if (targeted.length > 0) return targeted[0];
  }

  return candidates[0];
}

async function startBackgroundRecording(
  adbPath: string,
  serial: string,
  outputDir: string,
  durationSeconds: number
): Promise<RecordingHandle> {
  const remotePath = "/sdcard/blitz_ui_automation.mp4";
  const localPath = path.join(outputDir, "ui_automation_run.mp4");
  const timeoutSeconds = Math.max(10, Math.min(180, Math.floor(durationSeconds || 90)));

  const disabledStopHandle: RecordingHandle = {
    started: false,
    reason: "Record start failed",
    stop: async () => null,
  };

  await adb
    .runAdbCommand(adbPath, ["-s", serial, "shell", "rm", remotePath])
    .catch(() => {});

  let child;
  try {
    child = spawn(
      adbPath,
      [
        "-s",
        serial,
        "shell",
        "screenrecord",
        "--time-limit",
        `${timeoutSeconds}`,
        "--bit-rate",
        "6000000",
        remotePath,
      ],
      { windowsHide: true, stdio: "ignore" }
    );
  } catch {
    return disabledStopHandle;
  }

  if (!child || child.killed) {
    return disabledStopHandle;
  }

  const stop = async (): Promise<string | null> => {
    await adb
      .runAdbCommand(adbPath, ["-s", serial, "shell", "pkill", "-INT", "screenrecord"])
      .catch(() => {});
    await adb
      .runAdbCommand(adbPath, ["-s", serial, "shell", "killall", "-INT", "screenrecord"])
      .catch(() => {});

    try {
      if (!child.killed) child.kill();
    } catch {
      // ignore
    }

    await sleep(1200);

    const validateRemote = async (): Promise<boolean> => {
      try {
        const { stdout } = await adb.runAdbCommand(adbPath, [
          "-s",
          serial,
          "shell",
          "ls",
          "-l",
          remotePath,
        ]);
        return /blitz_ui_automation\.mp4/.test(stdout);
      } catch {
        return false;
      }
    };

    const remoteExists = await validateRemote();
    if (!remoteExists) {
      return null;
    }

    try {
      await adb.runAdbCommand(adbPath, ["-s", serial, "pull", remotePath, localPath], 30000);
      await adb
        .runAdbCommand(adbPath, ["-s", serial, "shell", "rm", remotePath])
        .catch(() => {});
      if (!existsSync(localPath)) return null;
      const fileSize = fileSizeOrZero(localPath);
      if (fileSize < 64 * 1024) {
        return null;
      }
      return localPath;
    } catch {
      return null;
    }
  };

  return { started: true, stop };
}

function toJsonLines(events: Array<Record<string, unknown>>): string {
  return events.map((event) => JSON.stringify(event)).join("\n") + (events.length ? "\n" : "");
}

function persistRunArtifacts(
  request: UiAutomationRequest,
  context: RunContext,
  finishedAt: string
): {
  graphPath: string;
  eventLogPath: string;
  summaryPath: string;
  nodes: UiAutomationScreenNode[];
} {
  const graphPath = path.join(request.outputDir, "screen-graph.json");
  const eventLogPath = path.join(request.outputDir, "events.jsonl");
  const summaryPath = path.join(request.outputDir, "summary.json");
  const nodes = Array.from(context.nodesByHash.values()).map((node) => ({
    ...node,
    actions: node.actions.slice(0, 30),
  }));

  safeFileWrite(
    graphPath,
    JSON.stringify(
      {
        packageName: request.packageName,
        instruction: request.instruction,
        createdAt: finishedAt,
        nodes,
        edges: context.edges,
      },
      null,
      2
    )
  );
  safeFileWrite(eventLogPath, toJsonLines(context.events));

  return { graphPath, eventLogPath, summaryPath, nodes };
}

function safeFileWrite(filePath: string, content: string): void {
  const dir = path.dirname(filePath);
  mkdirSync(dir, { recursive: true });
  writeFileSync(filePath, content, "utf-8");
}

function fileSizeOrZero(filePath: string): number {
  try {
    return statSync(filePath).size;
  } catch {
    return 0;
  }
}

function trimLogLines(lines: string[]): string[] {
  return lines
    .slice(0, MAX_LOG_LINES_STORED_PER_STEP)
    .map((line) => (line.length > MAX_LOG_LINE_LENGTH ? `${line.slice(0, MAX_LOG_LINE_LENGTH)}...` : line));
}

function getActionLabel(action: UiAutomationAction): string {
  return (
    action.text ||
    action.contentDesc ||
    action.resourceId ||
    action.className ||
    action.id
  );
}

function isStopError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return message === "AUTOMATION_STOPPED_BY_USER";
}

export function createAutomationRequest(input: {
  projectPath: string;
  serial: string;
  packageName: string;
  instruction: string;
  maxSteps: number;
  actionDelayMs: number;
  maxActionsPerScreen: number;
  captureVideo: boolean;
  videoDurationSeconds: number;
  enableOcr: boolean;
  logcatLinesPerStep: number;
}): UiAutomationRequest {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const safeName = input.packageName.replace(/[^a-zA-Z0-9_.-]+/g, "_").slice(0, 80);
  const outputDir = path.join(input.projectPath, ".blitz", "automation", `${safeName}_${stamp}`);

  return {
    projectPath: input.projectPath,
    serial: input.serial,
    packageName: input.packageName,
    instruction: input.instruction,
    outputDir,
    maxSteps: Math.max(3, Math.min(500, Math.floor(input.maxSteps || 80))),
    actionDelayMs: Math.max(150, Math.min(5000, Math.floor(input.actionDelayMs || 900))),
    maxActionsPerScreen: Math.max(1, Math.min(30, Math.floor(input.maxActionsPerScreen || 8))),
    captureVideo: !!input.captureVideo,
    videoDurationSeconds: Math.max(10, Math.min(180, Math.floor(input.videoDurationSeconds || 90))),
    enableOcr: !!input.enableOcr,
    logcatLinesPerStep: Math.max(20, Math.min(500, Math.floor(input.logcatLinesPerStep || 60))),
  };
}

export async function runUiAutomation(
  request: UiAutomationRequest,
  adbPath: string,
  mainWindow: BrowserWindow | null,
  eventBus: EventEmitter
): Promise<UiAutomationRunResult> {
  if (activeRun) {
    throw new Error("UI automation is already running");
  }

  control.paused = false;
  control.stopRequested = false;
  control.waiters = [];
  stateDispatchers = { mainWindow, eventBus };

  const startedAt = new Date().toISOString();
  runState = {
    phase: "running",
    progress: 0,
    currentStep: "Preparing automation run",
    startedAt,
    finishedAt: null,
    error: null,
  };
  updateState(runState, mainWindow, eventBus);

  const runPromise = (async (): Promise<UiAutomationRunResult> => {
    const context: RunContext = {
      nodesByHash: new Map(),
      edges: [],
      events: [],
      executedActionsByScreen: new Map(),
      notes: [],
    };

    ensureDir(request.outputDir);
    const screenshotsDir = path.join(request.outputDir, "screenshots");
    ensureDir(screenshotsDir);

    let ocrEngine: "tesseract" | "uiautomator" = "uiautomator";
    let tesseractPath: string | null = null;
    if (request.enableOcr) {
      tesseractPath = await findTesseract();
      if (tesseractPath) {
        ocrEngine = "tesseract";
        addLog(`OCR engine: tesseract (${tesseractPath})`, mainWindow, eventBus);
      } else {
        context.notes.push("Tesseract not found. OCR fallback uses UI hierarchy text.");
        addLog("OCR fallback active: tesseract not found", mainWindow, eventBus);
      }
    }

    addLog(`Starting UI automation on ${request.serial}`, mainWindow, eventBus);
    addLog(`Target package: ${request.packageName}`, mainWindow, eventBus);
    addLog(`Instruction: ${request.instruction}`, mainWindow, eventBus);

      let recordingHandle: RecordingHandle | null = null;
      if (request.captureVideo) {
        try {
          recordingHandle = await startBackgroundRecording(
            adbPath,
            request.serial,
            request.outputDir,
            request.videoDurationSeconds
          );
          if (recordingHandle.started) {
            addLog(`Run video recording started (${request.videoDurationSeconds}s)`, mainWindow, eventBus);
          } else {
            const reason = recordingHandle.reason || "unknown reason";
            context.notes.push(`Video recording did not start (${reason}).`);
            addLog(`Video recording unavailable (${reason})`, mainWindow, eventBus);
          }
        } catch (recordErr) {
          const reason = recordErr instanceof Error ? recordErr.message : String(recordErr);
          context.notes.push(`Video recording setup failed (${reason}).`);
          addLog(`Video recording setup failed (${reason})`, mainWindow, eventBus);
          recordingHandle = {
            started: false,
            reason,
            stop: async () => null,
          };
        }
      }

    let previousScreenId: string | null = null;
    let previousHash: string | null = null;
    let previousAction: UiAutomationAction | null = null;
    let exploredActions = 0;
    let treeChangeCount = 0;
    let planningMode = false;
    let firstHash: string | null = null;
    let executedSteps = 0;
    try {
      await checkControlPoint();
      await adb
        .runAdbCommand(adbPath, ["-s", request.serial, "shell", "am", "force-stop", request.packageName])
        .catch(() => {});

      await checkControlPoint();
      await adb.runAdbCommand(adbPath, [
        "-s",
        request.serial,
        "shell",
        "monkey",
        "-p",
        request.packageName,
        "-c",
        "android.intent.category.LAUNCHER",
        "1",
      ]);

      await controlledDelay(Math.max(700, request.actionDelayMs));
      await checkControlPoint();
      await adb.clearLogcat(adbPath, request.serial).catch(() => {});

      for (let step = 1; step <= request.maxSteps; step++) {
        await checkControlPoint();
        executedSteps = step;
        const progress = Math.min(96, Math.floor((step / Math.max(1, request.maxSteps)) * 92) + 3);
        updateState(
          {
            phase: control.paused ? "paused" : "running",
            progress,
            currentStep: `Exploring UI tree and graph (step ${step}/${request.maxSteps})`,
          },
          mainWindow,
          eventBus
        );

        const xml = await dumpUiXml(adbPath, request.serial);
        if (!xml || !xml.includes("hierarchy")) {
          throw new Error("Failed to capture UI hierarchy dump from device");
        }

        const hash = stableScreenHash(xml);
        if (!firstHash) firstHash = hash;

        if (firstHash && hash !== firstHash && step > 1) {
          addLog("Detected structural change from initial tree, starting re-index pass", mainWindow, eventBus);
        }

        const activity = await getCurrentActivity(adbPath, request.serial);
        const actions = buildActions(xml, request.instruction).slice(0, request.maxActionsPerScreen);
        const screenshotPath = await captureStepScreenshot(adbPath, request.serial, screenshotsDir, step);
        const fallbackUiText = extractUiText(xml).slice(0, 700);

        let ocrTextSample = fallbackUiText;
        if (request.enableOcr && tesseractPath && screenshotPath) {
          ocrTextSample = await runOcr(tesseractPath, screenshotPath, fallbackUiText);
        }

        let screen = context.nodesByHash.get(hash);
        if (!screen) {
          screen = {
            id: `screen_${context.nodesByHash.size + 1}`,
            hash,
            discoveredAtStep: step,
            visitCount: 0,
            activity,
            actions,
            ocrTextSample,
          };
          context.nodesByHash.set(hash, screen);
          addLog(`New screen indexed: ${screen.id} (${actions.length} actions)`, mainWindow, eventBus);
        }

        screen.visitCount += 1;
        screen.activity = activity;
        if (actions.length > screen.actions.length) {
          screen.actions = actions;
        }
        if (ocrTextSample.length > screen.ocrTextSample.length) {
          screen.ocrTextSample = ocrTextSample;
        }

        if (previousHash && previousHash !== hash) {
          treeChangeCount += 1;
          addLog("UI tree changed, re-indexing action graph", mainWindow, eventBus);
        }

        const switchToPlan = !planningMode && (step > Math.max(3, Math.floor(request.maxSteps * 0.45)) || context.nodesByHash.size >= 4);
        if (switchToPlan) {
          planningMode = true;
          addLog("Exploration complete. Executing planned action paths", mainWindow, eventBus);
        }

        if (previousScreenId && previousAction) {
          context.edges.push({
            fromScreenId: previousScreenId,
            toScreenId: screen.id,
            step,
            actionId: previousAction.id,
            actionLabel:
              previousAction.text || previousAction.contentDesc || previousAction.resourceId || "tap",
            treeChanged: previousHash !== hash,
          });
        }

        const selectedAction = chooseNextAction(
          screen,
          context.executedActionsByScreen,
          planningMode
        );

        const stepLogTailRaw = await adb
          .getLogcat(adbPath, request.serial, request.logcatLinesPerStep)
          .catch(() => [] as string[]);
        const stepLogTail = trimLogLines(stepLogTailRaw);

        context.events.push({
          step,
          timestamp: new Date().toISOString(),
          screenId: screen.id,
          hash,
          activity,
          actionsAvailable: screen.actions.length,
          selectedActionId: selectedAction?.id || null,
          selectedActionLabel:
            selectedAction?.text || selectedAction?.contentDesc || selectedAction?.resourceId || null,
          screenshotPath,
          ocrTextSample: screen.ocrTextSample,
          logcatTail: stepLogTail,
        });

        if (context.events.length > request.maxSteps * 2) {
          context.events = context.events.slice(-request.maxSteps * 2);
        }

        await checkControlPoint();
        if (selectedAction) {
          const used = context.executedActionsByScreen.get(screen.id) || new Set<string>();
          used.add(selectedAction.id);
          context.executedActionsByScreen.set(screen.id, used);

          exploredActions += 1;
          previousScreenId = screen.id;
          previousHash = hash;
          previousAction = selectedAction;

          addLog(
            `Step ${step}: tap ${getActionLabel(selectedAction)}`,
            mainWindow,
            eventBus
          );

          await sendTap(adbPath, request.serial, selectedAction.centerX, selectedAction.centerY);
        } else {
          addLog(`Step ${step}: no new action on ${screen.id}, sending Back`, mainWindow, eventBus);
          await sendBack(adbPath, request.serial);

          previousScreenId = screen.id;
          previousHash = hash;
          previousAction = {
            id: `back-${step}`,
            text: "Back",
            contentDesc: "",
            resourceId: "",
            className: "system",
            bounds: "",
            centerX: 0,
            centerY: 0,
            score: -1,
          };
        }

        await controlledDelay(request.actionDelayMs);
      }

      const finishedAt = new Date().toISOString();
      const { graphPath, eventLogPath, summaryPath, nodes } = persistRunArtifacts(
        request,
        context,
        finishedAt
      );

      let videoPath: string | null = null;
      if (recordingHandle) {
        videoPath = await recordingHandle.stop();
        if (videoPath) {
          addLog(`Run video saved: ${videoPath}`, mainWindow, eventBus);
        } else {
          context.notes.push(
            recordingHandle.started
              ? "Video recording was requested, but no video file was produced."
              : `Video recording was not started (${recordingHandle.reason || "unknown reason"}).`
          );
          addLog("Video recording unavailable for this run", mainWindow, eventBus);
        }
      }

      const result: UiAutomationRunResult = {
        serial: request.serial,
        packageName: request.packageName,
        instruction: request.instruction,
        startedAt,
        finishedAt,
        totalSteps: executedSteps,
        exploredActions,
        discoveredScreens: nodes.length,
        treeChangeCount,
        graphPath,
        eventLogPath,
        summaryPath,
        outputDir: request.outputDir,
        videoPath,
        ocrEngine,
        finalPhase: "complete",
        stoppedByUser: false,
        notes: context.notes,
      };

      safeFileWrite(summaryPath, JSON.stringify(result, null, 2));

      updateState(
        {
          phase: "complete",
          progress: 100,
          currentStep: "Automation complete",
          finishedAt,
          error: null,
        },
        mainWindow,
        eventBus
      );

      addLog(
        `Automation complete: ${nodes.length} screens, ${exploredActions} actions, ${treeChangeCount} structure changes`,
        mainWindow,
        eventBus
      );

      return result;
    } catch (error) {
      const stopByUser = isStopError(error);
      const message = stopByUser
        ? "Automation stopped by user"
        : error instanceof Error
          ? error.message
          : String(error);

      let videoPath: string | null = null;
      if (recordingHandle) {
        videoPath = await recordingHandle.stop().catch(() => null);
        if (!videoPath && recordingHandle.started) {
          context.notes.push("Video recording ended without a retrievable output file.");
        }
      }

      const finishedAt = new Date().toISOString();
      const { graphPath, eventLogPath, summaryPath, nodes } = persistRunArtifacts(
        request,
        context,
        finishedAt
      );
      const partialResult: UiAutomationRunResult = {
        serial: request.serial,
        packageName: request.packageName,
        instruction: request.instruction,
        startedAt,
        finishedAt,
        totalSteps: context.events.length,
        exploredActions: context.events.filter((e) => !!e.selectedActionId).length,
        discoveredScreens: nodes.length,
        treeChangeCount: context.edges.filter((e) => e.treeChanged).length,
        graphPath,
        eventLogPath,
        summaryPath,
        outputDir: request.outputDir,
        videoPath,
        ocrEngine,
        finalPhase: stopByUser ? "stopped" : "error",
        stoppedByUser: stopByUser,
        notes: context.notes,
      };
      safeFileWrite(summaryPath, JSON.stringify(partialResult, null, 2));

      if (stopByUser) {
        updateState(
          {
            phase: "stopped",
            currentStep: "Stopped by user",
            finishedAt,
            error: null,
          },
          mainWindow,
          eventBus
        );
        addLog("Automation stopped by user", mainWindow, eventBus);
        return partialResult;
      }

      updateState(
        {
          phase: "error",
          currentStep: "Automation failed",
          finishedAt,
          error: message,
        },
        mainWindow,
        eventBus
      );
      addLog(`Automation error: ${message}`, mainWindow, eventBus);
      throw error;
    }
  })();

  activeRun = runPromise;
  try {
    return await runPromise;
  } finally {
    activeRun = null;
    control.paused = false;
    control.stopRequested = false;
    control.waiters = [];
    stateDispatchers = null;
    if (runState.phase !== "complete" && runState.phase !== "error" && runState.phase !== "stopped") {
      updateState({ phase: "idle", progress: 0, currentStep: "", finishedAt: new Date().toISOString() }, mainWindow, eventBus);
    }
  }
}
