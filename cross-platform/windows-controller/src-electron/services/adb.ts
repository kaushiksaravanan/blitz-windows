// ADB service — wraps Android Debug Bridge CLI commands
// Ported from src-tauri/src/adb.rs

import { execFile } from "child_process";
import { promisify } from "util";
import type { AdbDevice, AdbDeviceDetails } from "./types";

const execFileAsync = promisify(execFile);

const TIMEOUT = 15_000;
const MAX_BUFFER = 50 * 1024 * 1024;

type ExecError = Error & {
  code?: string | number;
  cmd?: string;
  stderr?: string | Buffer;
  stdout?: string | Buffer;
};

const TRANSIENT_DAEMON_ERROR_PATTERNS = [
  /daemon not running/i,
  /cannot connect to daemon/i,
  /failed to start daemon/i,
  /failed to check server version/i,
  /adb server.*out of date/i,
  /cannot bind.*5037/i,
];

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function toText(value: unknown): string {
  if (Buffer.isBuffer(value)) return value.toString("utf-8");
  return typeof value === "string" ? value : String(value ?? "");
}

function errorText(error: unknown): string {
  const err = error as ExecError;
  return [
    err.message,
    toText(err.stderr),
    toText(err.stdout),
  ]
    .filter(Boolean)
    .join("\n");
}

function isTransientDaemonError(error: unknown): boolean {
  const text = errorText(error);
  return TRANSIENT_DAEMON_ERROR_PATTERNS.some((re) => re.test(text));
}

function formatAdbError(adbPath: string, args: string[], error: unknown): Error {
  const err = error as ExecError;
  const text = errorText(error);

  if (err.code === "ENOENT") {
    return new Error(
      `ADB executable not found: ${adbPath}. Configure Android SDK/ADB path in Settings.`
    );
  }

  if (/unauthorized/i.test(text)) {
    return new Error(
      "ADB device is unauthorized. Unlock the device and accept the USB debugging prompt, then retry."
    );
  }

  if (/device offline/i.test(text)) {
    return new Error(
      "ADB device is offline. Reconnect the device (or restart the emulator) and retry."
    );
  }

  if (isTransientDaemonError(error)) {
    return new Error(
      "ADB daemon is unavailable. Please retry; if it continues, restart adb.exe or reboot your machine."
    );
  }

  const detail = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, 4)
    .join(" | ");

  return new Error(
    `ADB command failed (${args.join(" ")}). ${detail || err.message || "Unknown error"}`
  );
}

async function runAdbRaw(
  adbPath: string,
  args: string[],
  timeout: number = TIMEOUT
): Promise<{ stdout: string; stderr: string }> {
  const { stdout, stderr } = await execFileAsync(adbPath, args, {
    timeout,
    windowsHide: true,
    maxBuffer: MAX_BUFFER,
  });

  return {
    stdout: toText(stdout),
    stderr: toText(stderr),
  };
}

async function runAdbRawBuffer(
  adbPath: string,
  args: string[],
  timeout: number = TIMEOUT
): Promise<{ stdout: Buffer; stderr: string }> {
  const { stdout, stderr } = await execFileAsync(adbPath, args, {
    timeout,
    windowsHide: true,
    maxBuffer: MAX_BUFFER,
    encoding: "buffer" as unknown as string,
  });

  const outBuffer = Buffer.isBuffer(stdout)
    ? stdout
    : Buffer.from(toText(stdout), "utf-8");

  return {
    stdout: outBuffer,
    stderr: toText(stderr),
  };
}

async function tryStartServer(adbPath: string): Promise<void> {
  try {
    await runAdbRaw(adbPath, ["start-server"], 5000);
  } catch {
    // best effort
  }
}

export async function runAdbCommand(
  adbPath: string,
  args: string[],
  timeout: number = TIMEOUT
): Promise<{ stdout: string; stderr: string }> {
  try {
    return await runAdbRaw(adbPath, args, timeout);
  } catch (error) {
    if (isTransientDaemonError(error)) {
      await tryStartServer(adbPath);
      await sleep(300);
      try {
        return await runAdbRaw(adbPath, args, timeout);
      } catch (retryError) {
        throw formatAdbError(adbPath, args, retryError);
      }
    }
    throw formatAdbError(adbPath, args, error);
  }
}

async function runAdbBufferCommand(
  adbPath: string,
  args: string[],
  timeout: number = TIMEOUT
): Promise<{ stdout: Buffer; stderr: string }> {
  try {
    return await runAdbRawBuffer(adbPath, args, timeout);
  } catch (error) {
    if (isTransientDaemonError(error)) {
      await tryStartServer(adbPath);
      await sleep(300);
      try {
        return await runAdbRawBuffer(adbPath, args, timeout);
      } catch (retryError) {
        throw formatAdbError(adbPath, args, retryError);
      }
    }
    throw formatAdbError(adbPath, args, error);
  }
}

export interface AdbRepairResult {
  success: boolean;
  adbPath: string;
  message: string;
  details: string[];
  devicesFound: number;
}

export interface AdbDiagnosticsResult {
  adbPath: string;
  version: string;
  devicesFound: number;
  details: string[];
  rawDevices: string[];
}

export async function repairAdb(adbPath: string): Promise<AdbRepairResult> {
  const details: string[] = [];

  try {
    await runAdbRaw(adbPath, ["kill-server"], 5000);
    details.push("Stopped existing ADB server process.");
  } catch (error) {
    const err = error as ExecError;
    if (err.code === "ENOENT") {
      throw formatAdbError(adbPath, ["kill-server"], error);
    }
    details.push("ADB server was not running or could not be stopped cleanly.");
  }

  await sleep(250);

  try {
    await runAdbRaw(adbPath, ["start-server"], 7000);
    details.push("Started ADB server.");
  } catch (error) {
    throw formatAdbError(adbPath, ["start-server"], error);
  }

  await sleep(300);

  const { stdout } = await runAdbCommand(adbPath, ["devices", "-l"]);
  const rawDevices = stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("List of"));

  const onlineDevices = rawDevices.filter((line) => /\sdevice(\s|$)/.test(line)).length;
  details.push(
    `Detected ${rawDevices.length} attached device(s), ${onlineDevices} online.`
  );

  return {
    success: true,
    adbPath,
    message: `ADB repair completed successfully. Found ${rawDevices.length} device(s).`,
    details,
    devicesFound: rawDevices.length,
  };
}

export async function getAdbDiagnostics(adbPath: string): Promise<AdbDiagnosticsResult> {
  const details: string[] = [];

  const { stdout: versionOut } = await runAdbCommand(adbPath, ["version"], 5000);
  const versionLine = versionOut
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => /^android debug bridge version/i.test(line));
  const version = versionLine || versionOut.trim() || "Unknown";
  details.push(`ADB version: ${version}`);

  const { stdout: devicesOut } = await runAdbCommand(adbPath, ["devices", "-l"]);
  const rawDevices = devicesOut
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("List of"));

  const onlineDevices = rawDevices.filter((line) => /\sdevice(\s|$)/.test(line)).length;
  const unauthorized = rawDevices.filter((line) => /\sunauthorized(\s|$)/.test(line)).length;
  const offline = rawDevices.filter((line) => /\soffline(\s|$)/.test(line)).length;

  details.push(`Detected devices: ${rawDevices.length}`);
  details.push(`Online: ${onlineDevices}`);
  if (unauthorized > 0) details.push(`Unauthorized: ${unauthorized}`);
  if (offline > 0) details.push(`Offline: ${offline}`);
  if (rawDevices.length === 0) details.push("No connected devices or emulators detected.");

  return {
    adbPath,
    version,
    devicesFound: rawDevices.length,
    details,
    rawDevices,
  };
}

// ---------------------------------------------------------------------------
// Device listing
// ---------------------------------------------------------------------------

export async function listDevices(adbPath: string): Promise<AdbDevice[]> {
  const { stdout } = await runAdbCommand(adbPath, ["devices", "-l"]);

  const rawDevices: Array<{
    serial: string;
    status: string;
    model: string;
    product: string;
    transportId: string;
    isEmulator: boolean;
    deviceType: string;
  }> = [];

  for (const line of stdout.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("List of")) continue;

    const parts = trimmed.split(/\s+/);
    if (parts.length < 2) continue;

    const serial = parts[0];
    const status = parts[1];
    let model = "";
    let product = "";
    let transportId = "";

    for (const part of parts.slice(2)) {
      if (part.startsWith("model:")) model = part.slice(6);
      else if (part.startsWith("product:")) product = part.slice(8);
      else if (part.startsWith("transport_id:")) transportId = part.slice(13);
    }

    const isEmulator =
      serial.startsWith("emulator-") || serial.startsWith("localhost:");
    const deviceType = status === "device" ? (isEmulator ? "emulator" : "physical") : status;

    rawDevices.push({ serial, status, model, product, transportId, isEmulator, deviceType });
  }

  // Enrich online devices with Android version + API level (parallel)
  const devices: AdbDevice[] = await Promise.all(
    rawDevices.map(async (d) => {
      let androidVersion = "";
      let apiLevel = 0;
      if (d.status === "device") {
        const [ver, sdk] = await Promise.all([
          getProp(adbPath, d.serial, "ro.build.version.release"),
          getProp(adbPath, d.serial, "ro.build.version.sdk"),
        ]);
        androidVersion = ver;
        apiLevel = parseInt(sdk, 10) || 0;
      }
      return { ...d, androidVersion, apiLevel };
    })
  );

  return devices;
}

// ---------------------------------------------------------------------------
// Device details
// ---------------------------------------------------------------------------

async function getProp(
  adbPath: string,
  serial: string,
  prop: string
): Promise<string> {
  try {
    const { stdout } = await runAdbCommand(adbPath, [
      "-s",
      serial,
      "shell",
      "getprop",
      prop,
    ]);
    return stdout.trim();
  } catch {
    return "";
  }
}

export async function getDeviceDetails(
  adbPath: string,
  serial: string
): Promise<AdbDeviceDetails> {
  const [
    manufacturer,
    model,
    androidVersion,
    sdkVersion,
    buildNumber,
    hardware,
    abi,
    locale,
    timezone,
    networkOperator,
    screenSize,
    batteryLevel,
  ] = await Promise.all([
    getProp(adbPath, serial, "ro.product.manufacturer"),
    getProp(adbPath, serial, "ro.product.model"),
    getProp(adbPath, serial, "ro.build.version.release"),
    getProp(adbPath, serial, "ro.build.version.sdk"),
    getProp(adbPath, serial, "ro.build.display.id"),
    getProp(adbPath, serial, "ro.hardware"),
    getProp(adbPath, serial, "ro.product.cpu.abi"),
    getProp(adbPath, serial, "persist.sys.locale"),
    getProp(adbPath, serial, "persist.sys.timezone"),
    getProp(adbPath, serial, "gsm.operator.alpha"),
    runAdbCommand(adbPath, ["-s", serial, "shell", "wm", "size"])
      .then(({ stdout }) => {
        const match = stdout.match(/Physical size:\s*(\d+x\d+)/);
        return match ? match[1] : "";
      })
      .catch(() => ""),
    runAdbCommand(adbPath, ["-s", serial, "shell", "dumpsys", "battery"])
      .then(({ stdout }) => {
        const match = stdout.match(/level:\s*(\d+)/);
        return match ? match[1] : "";
      })
      .catch(() => ""),
  ]);

  return {
    serial,
    manufacturer,
    model,
    androidVersion,
    sdkVersion: parseInt(sdkVersion, 10) || 0,
    buildNumber,
    hardware,
    abi,
    locale,
    timezone,
    networkOperator,
    screenSize,
    batteryLevel: parseInt(batteryLevel, 10) || 0,
  };
}

// ---------------------------------------------------------------------------
// Screenshot
// ---------------------------------------------------------------------------

export async function takeScreenshot(
  adbPath: string,
  serial: string
): Promise<string> {
  const { stdout } = await runAdbBufferCommand(adbPath, [
    "-s",
    serial,
    "exec-out",
    "screencap",
    "-p",
  ]);
  return stdout.toString("base64");
}

// ---------------------------------------------------------------------------
// Device input
// ---------------------------------------------------------------------------

export async function deviceInput(
  adbPath: string,
  serial: string,
  action: string,
  x?: number,
  y?: number,
  x2?: number,
  y2?: number,
  duration?: number,
  text?: string,
  keyCode?: number
): Promise<string> {
  let args: string[];

  switch (action) {
    case "tap":
      if (x == null || y == null) throw new Error("tap requires x and y");
      args = ["-s", serial, "shell", "input", "tap", `${x}`, `${y}`];
      break;
    case "swipe":
      if (x == null || y == null || x2 == null || y2 == null)
        throw new Error("swipe requires x, y, x2, y2");
      args = [
        "-s", serial, "shell", "input", "swipe",
        `${x}`, `${y}`, `${x2}`, `${y2}`, `${duration ?? 300}`,
      ];
      break;
    case "longPress":
      if (x == null || y == null) throw new Error("longPress requires x and y");
      args = [
        "-s", serial, "shell", "input", "swipe",
        `${x}`, `${y}`, `${x}`, `${y}`, `${duration ?? 1000}`,
      ];
      break;
    case "inputText":
      if (!text) throw new Error("inputText requires text");
      args = ["-s", serial, "shell", "input", "text", text.replace(/ /g, "%s")];
      break;
    case "keyEvent":
      if (keyCode == null) throw new Error("keyEvent requires keyCode");
      args = ["-s", serial, "shell", "input", "keyevent", `${keyCode}`];
      break;
    case "dumpUi":
      await runAdbCommand(adbPath, [
        "-s",
        serial,
        "shell",
        "uiautomator",
        "dump",
        "/sdcard/window_dump.xml",
      ]);
      const { stdout: xmlOut } = await runAdbCommand(adbPath, [
        "-s",
        serial,
        "shell",
        "cat",
        "/sdcard/window_dump.xml",
      ]);
      return xmlOut;
    default:
      throw new Error(`Unknown action: ${action}`);
  }

  await runAdbCommand(adbPath, args);
  return "ok";
}

// ---------------------------------------------------------------------------
// APK install / uninstall
// ---------------------------------------------------------------------------

export async function installApk(
  adbPath: string,
  serial: string,
  apkPath: string,
  reinstall: boolean
): Promise<string> {
  const args = ["-s", serial, "install"];
  if (reinstall) args.push("-r");
  args.push("-g", apkPath);

  const { stdout } = await runAdbCommand(adbPath, args, 120_000);
  return stdout.trim();
}

export async function uninstallPackage(
  adbPath: string,
  serial: string,
  packageName: string
): Promise<string> {
  const { stdout } = await runAdbCommand(
    adbPath,
    ["-s", serial, "uninstall", packageName],
    30_000
  );
  return stdout.trim();
}

// ---------------------------------------------------------------------------
// Packages
// ---------------------------------------------------------------------------

export async function listPackages(
  adbPath: string,
  serial: string
): Promise<string[]> {
  const { stdout } = await runAdbCommand(adbPath, [
    "-s",
    serial,
    "shell",
    "pm",
    "list",
    "packages",
    "-3",
  ]);
  return stdout
    .split("\n")
    .map((l) => l.trim().replace(/^package:/, ""))
    .filter(Boolean);
}

// ---------------------------------------------------------------------------
// Logcat
// ---------------------------------------------------------------------------

export async function getLogcat(
  adbPath: string,
  serial: string,
  lines: number
): Promise<string[]> {
  const { stdout } = await runAdbCommand(adbPath, [
    "-s",
    serial,
    "logcat",
    "-d",
    "-t",
    `${lines}`,
    "-v",
    "threadtime",
  ]);
  return stdout.split("\n").filter(Boolean);
}

export async function clearLogcat(
  adbPath: string,
  serial: string
): Promise<string> {
  await runAdbCommand(adbPath, ["-s", serial, "logcat", "-c"]);
  return "ok";
}
