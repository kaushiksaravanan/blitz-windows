// Emulator service — wraps Android emulator CLI commands

import { execFile, spawn } from "child_process";
import { promisify } from "util";
import { existsSync, readFileSync } from "fs";
import path from "path";
import type { AvdInfo } from "./types";
import { runAdbCommand } from "./adb";

const execFileAsync = promisify(execFile);
const TIMEOUT = 15_000;
const MAX_BUFFER = 20 * 1024 * 1024;

type ExecError = Error & {
  code?: string | number;
  stderr?: string | Buffer;
  stdout?: string | Buffer;
};

function toText(value: unknown): string {
  if (Buffer.isBuffer(value)) return value.toString("utf-8");
  return typeof value === "string" ? value : String(value ?? "");
}

function formatEmulatorError(emulatorPath: string, args: string[], error: unknown): Error {
  const err = error as ExecError;
  const detail = [err.message, toText(err.stderr), toText(err.stdout)]
    .filter(Boolean)
    .join("\n")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, 4)
    .join(" | ");

  if (err.code === "ENOENT") {
    return new Error(
      `Emulator executable not found: ${emulatorPath}. Configure Android SDK path in Settings.`
    );
  }

  return new Error(
    `Emulator command failed (${args.join(" ")}). ${detail || "Unknown error"}`
  );
}

async function runEmulatorCommand(
  emulatorPath: string,
  args: string[],
  timeout: number = TIMEOUT
): Promise<{ stdout: string; stderr: string }> {
  try {
    const { stdout, stderr } = await execFileAsync(emulatorPath, args, {
      timeout,
      windowsHide: true,
      maxBuffer: MAX_BUFFER,
    });
    return {
      stdout: toText(stdout),
      stderr: toText(stderr),
    };
  } catch (error) {
    throw formatEmulatorError(emulatorPath, args, error);
  }
}

export interface EmulatorDiagnosticsResult {
  emulatorPath: string;
  version: string;
  avdCount: number;
  avdNames: string[];
  details: string[];
}

export async function getEmulatorDiagnostics(
  emulatorPath: string
): Promise<EmulatorDiagnosticsResult> {
  const details: string[] = [];

  const { stdout: versionOut } = await runEmulatorCommand(emulatorPath, ["-version"], 5000);
  const versionLine = versionOut
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => /^android emulator version/i.test(line));
  const version = versionLine || versionOut.split(/\r?\n/)[0]?.trim() || "Unknown";
  details.push(`Emulator version: ${version}`);

  const { stdout: avdOut } = await runEmulatorCommand(emulatorPath, ["-list-avds"]);
  const avdNames = avdOut
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  details.push(`Detected AVDs: ${avdNames.length}`);

  return {
    emulatorPath,
    version,
    avdCount: avdNames.length,
    avdNames,
    details,
  };
}

// ---------------------------------------------------------------------------
// List AVDs
// ---------------------------------------------------------------------------

export async function listAvds(
  emulatorPath: string,
  adbPath: string
): Promise<AvdInfo[]> {
  let stdout: string;
  try {
    const result = await execFileAsync(emulatorPath, ["-list-avds"], {
      timeout: TIMEOUT,
      windowsHide: true,
    });
    stdout = result.stdout;
  } catch (error) {
    throw formatEmulatorError(emulatorPath, ["-list-avds"], error);
  }

  const names = stdout
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  const running = await getRunningEmulators(adbPath);

  const avdHome =
    process.env.ANDROID_AVD_HOME ||
    path.join(process.env.USERPROFILE || "", ".android", "avd");

  const avds: AvdInfo[] = [];

  for (const name of names) {
    const configPath = path.join(avdHome, `${name}.avd`, "config.ini");
    const { device, target, apiLevel, abi, avdPath } = parseAvdConfig(
      configPath,
      avdHome,
      name
    );

    const match = running.find(([, n]) => n === name);

    avds.push({
      name,
      device,
      target,
      apiLevel,
      abi,
      path: avdPath,
      running: !!match,
      serial: match ? match[0] : null,
    });
  }

  return avds;
}

// ---------------------------------------------------------------------------
// Parse AVD config
// ---------------------------------------------------------------------------

interface AvdConfig {
  device: string;
  target: string;
  apiLevel: number;
  abi: string;
  avdPath: string;
}

function parseAvdConfig(
  configPath: string,
  avdHome: string,
  name: string
): AvdConfig {
  let device = "";
  let target = "";
  let apiLevel = 0;
  let abi = "";
  let avdPath = path.join(avdHome, `${name}.avd`);

  try {
    const content = readFileSync(configPath, "utf-8");
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      const eqIdx = trimmed.indexOf("=");
      if (eqIdx < 0) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      const value = trimmed.slice(eqIdx + 1).trim();

      switch (key) {
        case "hw.device.name":
          device = value;
          break;
        case "tag.display":
        case "tag.id":
          if (!target) target = value;
          break;
        case "image.sysdir.1": {
          const androidPart = value
            .split(/[\\/]/)
            .find((p) => p.startsWith("android-"));
          if (androidPart) {
            const level = parseInt(androidPart.replace("android-", ""), 10);
            if (!isNaN(level)) apiLevel = level;
          }
          const lastSegment = value.replace(/[\\/]+$/, "").split(/[\\/]/).pop();
          if (lastSegment) abi = lastSegment;
          break;
        }
        case "abi.type":
          if (!abi) abi = value;
          break;
      }
    }
  } catch {
    // config.ini may not exist
  }

  // Also check the top-level .ini file
  const iniPath = path.join(avdHome, `${name}.ini`);
  try {
    const content = readFileSync(iniPath, "utf-8");
    for (const line of content.split("\n")) {
      const eqIdx = line.indexOf("=");
      if (eqIdx < 0) continue;
      const key = line.slice(0, eqIdx).trim();
      const value = line.slice(eqIdx + 1).trim();
      if (key === "target" && !target) target = value;
      if (key === "path" && value) avdPath = value;
    }
  } catch {
    // .ini may not exist
  }

  return { device, target, apiLevel, abi, avdPath };
}

// ---------------------------------------------------------------------------
// Start / Stop AVD
// ---------------------------------------------------------------------------

export function startAvd(
  emulatorPath: string,
  name: string,
  coldBoot: boolean
): void {
  if (!existsSync(emulatorPath)) {
    throw new Error(
      `Emulator executable not found: ${emulatorPath}. Configure Android SDK path in Settings.`
    );
  }

  const args = [`@${name}`];
  if (coldBoot) args.push("-no-snapshot-load");

  // Spawn detached — emulator runs independently
  const child = spawn(emulatorPath, args, {
    detached: true,
    stdio: "ignore",
  });
  child.on("error", (err) => {
    console.error(`Failed to start emulator "${name}":`, err);
  });
  child.unref();
}

export async function stopAvd(
  adbPath: string,
  serial: string
): Promise<string> {
  const { stdout } = await runAdbCommand(adbPath, ["-s", serial, "emu", "kill"], TIMEOUT);
  return stdout.trim();
}

// ---------------------------------------------------------------------------
// Running emulators
// ---------------------------------------------------------------------------

async function getRunningEmulators(
  adbPath: string
): Promise<[string, string][]> {
  const result: [string, string][] = [];

  try {
    const { stdout } = await runAdbCommand(adbPath, ["devices"], TIMEOUT);
    const serials = stdout
      .split("\n")
      .filter((l) => l.includes("device") && !l.startsWith("List"))
      .map((l) => l.split(/\s+/)[0])
      .filter((s) => s.startsWith("emulator-"));

    for (const serial of serials) {
      try {
        const { stdout: avdName } = await runAdbCommand(
          adbPath,
          ["-s", serial, "emu", "avd", "name"],
          5000
        );
        const name = avdName.split("\n")[0].trim();
        if (name) result.push([serial, name]);
      } catch {
        // Skip if can't get name
      }
    }
  } catch {
    // ADB not available
  }

  return result;
}
