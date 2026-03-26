// =============================================================================
// Video Generator — create demo videos for Play Store listing
// =============================================================================
// Two strategies:
// 1. If device/emulator connected: use `adb screenrecord` for real app recording
// 2. Fallback: create a slideshow from screenshots using ffmpeg
// If ffmpeg is not available, skip video generation gracefully.
// =============================================================================

import { existsSync, mkdirSync, writeFileSync, readFileSync, readdirSync } from "fs";
import path from "path";
import { execFile } from "child_process";
import { promisify } from "util";
import type { VideoOrientation } from "./types";

const execFileAsync = promisify(execFile);
const RECORD_DURATION = 30; // seconds

type DeviceOrientation = "portrait" | "landscape";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getVideoFilter(orientation: VideoOrientation | DeviceOrientation): string {
  if (orientation === "landscape") {
    return "scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:-1:-1:color=black,fps=30";
  }
  return "scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:-1:-1:color=black,fps=30";
}

async function getDeviceOrientation(adbPath: string, serial: string): Promise<DeviceOrientation> {
  try {
    const { stdout } = await execFileAsync(
      adbPath,
      ["-s", serial, "shell", "dumpsys", "input"],
      { timeout: 5000, windowsHide: true }
    );
    if (/SurfaceOrientation:\s*(1|3)/i.test(stdout) || /landscape/i.test(stdout)) {
      return "landscape";
    }
  } catch {
    // ignore
  }
  return "portrait";
}

// ---------------------------------------------------------------------------
// Strategy 1: Record from device/emulator via adb screenrecord
// ---------------------------------------------------------------------------

export async function recordFromDevice(
  adbPath: string,
  serial: string,
  outputDir: string,
  durationSeconds: number = RECORD_DURATION,
  orientation: VideoOrientation = "auto"
): Promise<string | null> {
  mkdirSync(outputDir, { recursive: true });

  const remotePath = "/sdcard/blitz_demo.mp4";
  const localPath = path.join(outputDir, "demo_video.mp4");
  const normalizedPath = path.join(outputDir, "demo_video_normalized.mp4");

  try {
    // Ensure previous recording does not block start
    await execFileAsync(adbPath, ["-s", serial, "shell", "rm", remotePath], {
      timeout: 5000,
      windowsHide: true,
    }).catch(() => {});

    // Start recording — this blocks for the duration, then exits
    // Using a timeout slightly longer than the recording duration
    await execFileAsync(
      adbPath,
      [
        "-s",
        serial,
        "shell",
        "screenrecord",
        "--time-limit",
        `${durationSeconds}`,
        "--bit-rate",
        "6000000", // 6 Mbps for good quality
        remotePath,
      ],
      { timeout: (durationSeconds + 10) * 1000, windowsHide: true }
    );

    await sleep(250);

    // Pull video to local
    await execFileAsync(adbPath, ["-s", serial, "pull", remotePath, localPath], {
      timeout: 30000,
      windowsHide: true,
    });

    // Clean up on device
    await execFileAsync(adbPath, ["-s", serial, "shell", "rm", remotePath], {
      timeout: 5000,
      windowsHide: true,
    }).catch(() => {});

    if (!existsSync(localPath)) return null;

    const ffmpegPath = await findFfmpeg();
    if (!ffmpegPath) return localPath;

    const resolvedOrientation: DeviceOrientation | VideoOrientation =
      orientation === "auto"
        ? await getDeviceOrientation(adbPath, serial)
        : orientation;

    try {
      await execFileAsync(
        ffmpegPath,
        [
          "-y",
          "-i",
          localPath,
          "-vf",
          getVideoFilter(resolvedOrientation),
          "-c:v",
          "libx264",
          "-pix_fmt",
          "yuv420p",
          "-preset",
          "fast",
          "-crf",
          "23",
          normalizedPath,
        ],
        { timeout: 180000, windowsHide: true }
      );

      if (existsSync(normalizedPath)) {
        return normalizedPath;
      }
    } catch {
      // fall back to raw recording
    }

    return localPath;
  } catch (err) {
    console.error("Failed to record from device:", err);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Strategy 2: Create slideshow from screenshots via ffmpeg
// ---------------------------------------------------------------------------

export async function createSlideshowVideo(
  screenshotPaths: string[],
  outputDir: string,
  durationPerSlide: number = 3,
  orientation: VideoOrientation = "portrait"
): Promise<string | null> {
  if (screenshotPaths.length === 0) return null;

  mkdirSync(outputDir, { recursive: true });
  const outputPath = path.join(outputDir, "demo_slideshow.mp4");

  // Check if ffmpeg is available
  const ffmpegPath = await findFfmpeg();
  if (!ffmpegPath) {
    console.warn("ffmpeg not found — skipping slideshow video generation");
    // Try Playwright-based approach instead
    return await createPlaywrightVideo(
      screenshotPaths,
      outputDir,
      durationPerSlide,
      orientation
    );
  }

  try {
    // Create a concat file for ffmpeg
    const concatPath = path.join(outputDir, "concat.txt");
    const lines = screenshotPaths.map(
      (p) => `file '${p.replace(/\\/g, "/").replace(/'/g, "'\\''")}'
duration ${durationPerSlide}`
    );
    // Repeat last image to fix ffmpeg duration bug
    lines.push(`file '${screenshotPaths[screenshotPaths.length - 1].replace(/\\/g, "/").replace(/'/g, "'\\''")}'`);
    writeFileSync(concatPath, lines.join("\n"), "utf-8");

    await execFileAsync(
      ffmpegPath,
      [
        "-y",
        "-f", "concat",
        "-safe", "0",
        "-i", concatPath,
        "-vf", getVideoFilter(orientation === "auto" ? "portrait" : orientation),
        "-c:v", "libx264",
        "-pix_fmt", "yuv420p",
        "-preset", "fast",
        "-crf", "23",
        outputPath,
      ],
      { timeout: 120000, windowsHide: true }
    );

    return existsSync(outputPath) ? outputPath : null;
  } catch (err) {
    console.error("Failed to create slideshow video:", err);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Strategy 3: Playwright-based video from screenshots (no ffmpeg needed)
// ---------------------------------------------------------------------------

async function createPlaywrightVideo(
  screenshotPaths: string[],
  outputDir: string,
  _durationPerSlide: number,
  orientation: VideoOrientation
): Promise<string | null> {
  let chromium: any;
  try {
    chromium = (await import("playwright-core")).chromium;
  } catch {
    console.warn("playwright-core not available, skipping video generation entirely");
    return null;
  }

  let browser;
  try {
    browser = await chromium.launch({ channel: "chrome", headless: true });
  } catch {
    try {
      browser = await chromium.launch({ channel: "msedge", headless: true });
    } catch {
      return null;
    }
  }

  try {
    // Playwright can record videos of page interactions
    const size =
      orientation === "landscape"
        ? { width: 1920, height: 1080 }
        : { width: 1080, height: 1920 };

    const context = await browser.newContext({
      recordVideo: {
        dir: outputDir,
        size,
      },
    });

    const page = await context.newPage();

    // Display each screenshot for a few seconds
    for (const ssPath of screenshotPaths) {
      const imgData = readFileSync(ssPath).toString("base64");
      await page.setContent(
        `<!DOCTYPE html><html><body style="margin:0;background:#000;display:flex;align-items:center;justify-content:center;width:${size.width}px;height:${size.height}px;">
        <img src="data:image/png;base64,${imgData}" style="max-width:100%;max-height:100%;object-fit:contain;" />
        </body></html>`,
        { waitUntil: "load" }
      );
      await page.waitForTimeout(3000);
    }

    await context.close(); // This saves the video

    // Find the video file in the output dir
    const videoFiles = readdirSync(outputDir).filter(
      (f: string) => f.endsWith(".webm") || f.endsWith(".mp4")
    );

    if (videoFiles.length > 0) {
      return path.join(outputDir, videoFiles[videoFiles.length - 1]);
    }
  } catch (err) {
    console.error("Failed to create Playwright video:", err);
  } finally {
    await browser.close().catch(() => {});
  }

  return null;
}

// ---------------------------------------------------------------------------
// Generate demo video — orchestrates the best available strategy
// ---------------------------------------------------------------------------

export async function generateDemoVideo(
  adbPath: string,
  serial: string | null,
  screenshotPaths: string[],
  outputDir: string,
  options?: { durationSeconds?: number; orientation?: VideoOrientation }
): Promise<string | null> {
  mkdirSync(outputDir, { recursive: true });

  const durationSeconds = options?.durationSeconds ?? RECORD_DURATION;
  const orientation = options?.orientation ?? "auto";

  // Strategy 1: Record from a connected device
  if (serial) {
    const video = await recordFromDevice(adbPath, serial, outputDir, durationSeconds, orientation);
    if (video) return video;
  }

  // Strategy 2/3: Create from screenshots
  if (screenshotPaths.length > 0) {
    const slideDuration = Math.max(2, Math.min(8, Math.round(durationSeconds / Math.max(1, screenshotPaths.length))));
    return createSlideshowVideo(
      screenshotPaths,
      outputDir,
      slideDuration,
      orientation === "auto" ? "portrait" : orientation
    );
  }

  return null;
}

export async function recordDemoVideoNow(
  adbPath: string,
  serial: string,
  outputDir: string,
  durationSeconds: number,
  orientation: VideoOrientation
): Promise<{ videoPath: string | null; durationSeconds: number; orientation: VideoOrientation }> {
  const clampedDuration = Math.max(5, Math.min(180, Math.floor(durationSeconds || RECORD_DURATION)));
  const videoPath = await recordFromDevice(adbPath, serial, outputDir, clampedDuration, orientation);
  return { videoPath, durationSeconds: clampedDuration, orientation };
}

// ---------------------------------------------------------------------------
// Utility: find ffmpeg in PATH
// ---------------------------------------------------------------------------

async function findFfmpeg(): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync("where", ["ffmpeg"], {
      timeout: 5000,
      windowsHide: true,
    });
    const lines = stdout.trim().split("\n");
    if (lines.length > 0 && existsSync(lines[0].trim())) {
      return lines[0].trim();
    }
  } catch {
    // Not found
  }

  // Check common locations on Windows
  const commonPaths = [
    "C:\\ffmpeg\\bin\\ffmpeg.exe",
    "C:\\Program Files\\ffmpeg\\bin\\ffmpeg.exe",
    path.join(process.env.LOCALAPPDATA || "", "ffmpeg", "bin", "ffmpeg.exe"),
  ];

  for (const p of commonPaths) {
    if (existsSync(p)) return p;
  }

  return null;
}
