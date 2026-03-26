// =============================================================================
// Screenshot Service — capture, frame, and generate Play Store assets
// =============================================================================
// Captures screenshots from connected devices/emulators via ADB, creates
// device-framed versions, and generates feature graphics. Uses Playwright
// for HTML-to-image rendering (no native image deps like sharp needed).
// =============================================================================

import { existsSync, mkdirSync, readFileSync } from "fs";
import path from "path";
import { execFile } from "child_process";
import { promisify } from "util";
import type {
  AppAnalysis,
  AssetGenerationOptions,
  PlayStoreAssets,
  ScreenshotTemplatePreset,
} from "./types";

const execFileAsync = promisify(execFile);

const DEFAULT_ASSET_OPTIONS: AssetGenerationOptions = {
  screenshotCount: 4,
  templatePreset: "launchpad-pro",
  locale: "en-US",
  headline: "Built for Android",
  subheadline: "Fast setup, clean workflow",
  includeDeviceFrame: true,
  videoDurationSeconds: 30,
  videoOrientation: "auto",
};

function normalizeOptions(options?: Partial<AssetGenerationOptions>): AssetGenerationOptions {
  const merged = { ...DEFAULT_ASSET_OPTIONS, ...(options || {}) };
  const safeCount = Number.isFinite(merged.screenshotCount)
    ? Math.max(1, Math.min(8, Math.floor(merged.screenshotCount)))
    : DEFAULT_ASSET_OPTIONS.screenshotCount;
  const safeDuration = Number.isFinite(merged.videoDurationSeconds)
    ? Math.max(5, Math.min(180, Math.floor(merged.videoDurationSeconds)))
    : DEFAULT_ASSET_OPTIONS.videoDurationSeconds;

  return {
    ...merged,
    screenshotCount: safeCount,
    videoDurationSeconds: safeDuration,
    locale: (merged.locale || DEFAULT_ASSET_OPTIONS.locale).trim() || DEFAULT_ASSET_OPTIONS.locale,
    headline:
      (merged.headline || DEFAULT_ASSET_OPTIONS.headline).trim() ||
      DEFAULT_ASSET_OPTIONS.headline,
    subheadline:
      (merged.subheadline || DEFAULT_ASSET_OPTIONS.subheadline).trim() ||
      DEFAULT_ASSET_OPTIONS.subheadline,
  };
}

// ---------------------------------------------------------------------------
// Screenshot capture from device/emulator
// ---------------------------------------------------------------------------

export async function captureScreenshots(
  adbPath: string,
  serial: string,
  outputDir: string,
  count: number = 4
): Promise<string[]> {
  mkdirSync(outputDir, { recursive: true });

  const screenshots: string[] = [];

  for (let i = 0; i < count; i++) {
    const fileName = `screenshot_${i + 1}.png`;
    const remotePath = `/sdcard/blitz_screenshot_${i}.png`;
    const localPath = path.join(outputDir, fileName);

    try {
      // Capture screenshot on device
      await execFileAsync(adbPath, ["-s", serial, "shell", "screencap", "-p", remotePath], {
        timeout: 10000,
      });

      // Pull to local
      await execFileAsync(adbPath, ["-s", serial, "pull", remotePath, localPath], {
        timeout: 10000,
      });

      // Clean up on device
      await execFileAsync(adbPath, ["-s", serial, "shell", "rm", remotePath], {
        timeout: 5000,
      }).catch(() => {});

      if (existsSync(localPath)) {
        screenshots.push(localPath);
      }
    } catch (err) {
      console.error(`Failed to capture screenshot ${i + 1}:`, err);
    }

    // Wait a moment between captures for user to navigate
    if (i < count - 1) {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }

  return screenshots;
}

// ---------------------------------------------------------------------------
// Frame screenshots with device mockup (HTML-based rendering)
// ---------------------------------------------------------------------------

export async function frameScreenshots(
  screenshotPaths: string[],
  outputDir: string,
  options?: Partial<AssetGenerationOptions>
): Promise<string[]> {
  const normalized = normalizeOptions(options);
  mkdirSync(outputDir, { recursive: true });
  const framedPaths: string[] = [];

  // Try to use Playwright for rendering, fall back to raw screenshots
  let chromium: any;
  try {
    chromium = (await import("playwright-core")).chromium;
  } catch {
    console.warn("playwright-core not available, returning unframed screenshots");
    return screenshotPaths;
  }

  let browser;
  try {
    browser = await chromium.launch({ channel: "chrome", headless: true });
  } catch {
    try {
      browser = await chromium.launch({ channel: "msedge", headless: true });
    } catch {
      console.warn("No browser available for framing, returning unframed screenshots");
      return screenshotPaths;
    }
  }

  try {
    const page = await browser.newPage();

    for (let i = 0; i < screenshotPaths.length; i++) {
      const screenshotPath = screenshotPaths[i];
      const outputPath = path.join(outputDir, `framed_${i + 1}.png`);

      // Read screenshot as base64
      const imgData = readFileSync(screenshotPath).toString("base64");

      const html = generateDeviceFrameHtml(
        imgData,
        normalized,
        i,
        screenshotPaths.length
      );
      await page.setContent(html, { waitUntil: "load" });
      await page.setViewportSize({ width: 1080, height: 1920 });

      await page.screenshot({
        path: outputPath,
        clip: { x: 0, y: 0, width: 1080, height: 1920 },
      });

      if (existsSync(outputPath)) {
        framedPaths.push(outputPath);
      }
    }
  } finally {
    await browser.close().catch(() => {});
  }

  return framedPaths.length > 0 ? framedPaths : screenshotPaths;
}

function templateBackground(preset: ScreenshotTemplatePreset): string {
  switch (preset) {
    case "launchpad-pro":
      return "radial-gradient(circle at 16% 18%, #00a3ff 0%, #0066ff 36%, #021b5b 72%, #070b1d 100%)";
    case "localized-story":
      return "linear-gradient(125deg, #101522 0%, #1f3a5f 38%, #326f95 68%, #d3ecff 100%)";
    case "clean-device":
      return "linear-gradient(180deg, #111827 0%, #1f2937 100%)";
    case "minimal-light":
      return "linear-gradient(180deg, #f8fafc 0%, #e2e8f0 100%)";
    case "store-spotlight":
      return "radial-gradient(circle at 20% 20%, #2563eb 0%, #1d4ed8 40%, #0f172a 100%)";
    case "gradient-hero":
    default:
      return "linear-gradient(135deg, #667eea 0%, #764ba2 100%)";
  }
}

function generateDeviceFrameHtml(
  screenshotBase64: string,
  options: AssetGenerationOptions,
  index: number,
  total: number
): string {
  const bg = templateBackground(options.templatePreset);
  const isLight =
    options.templatePreset === "minimal-light" || options.templatePreset === "localized-story";
  const headingColor = isLight ? "#0f172a" : "#ffffff";
  const subColor = isLight ? "#334155" : "rgba(255,255,255,0.9)";
  const pillBg = isLight ? "rgba(15,23,42,0.08)" : "rgba(255,255,255,0.12)";

  const headingFont =
    options.templatePreset === "launchpad-pro"
      ? "'Segoe UI Semibold', 'Segoe UI', system-ui, sans-serif"
      : options.templatePreset === "localized-story"
        ? "'Trebuchet MS', 'Segoe UI', sans-serif"
        : "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif";

  const layoutClass = options.templatePreset === "launchpad-pro" ? "layout-launchpad" : "";

  const localeBadge =
    options.templatePreset === "localized-story"
      ? `${escapeHtml(options.locale)} · Localized`
      : escapeHtml(options.locale);

  return `<!DOCTYPE html>
<html>
<head>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    width: 1080px;
    height: 1920px;
    background: ${bg};
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 28px;
    font-family: ${headingFont};
    padding: 90px 70px;
    position: relative;
    overflow: hidden;
  }
  body::before {
    content: '';
    position: absolute;
    width: 620px;
    height: 620px;
    border-radius: 50%;
    background: rgba(255,255,255,0.08);
    top: -220px;
    right: -120px;
  }
  body::after {
    content: '';
    position: absolute;
    width: 420px;
    height: 420px;
    border-radius: 50%;
    background: rgba(255,255,255,0.05);
    bottom: -180px;
    left: -120px;
  }
  .top {
    width: 100%;
    display: flex;
    flex-direction: column;
    gap: 10px;
    align-items: flex-start;
  }
  .locale {
    font-size: 20px;
    color: ${subColor};
    background: ${pillBg};
    border-radius: 999px;
    padding: 8px 14px;
  }
  .headline {
    font-size: 58px;
    line-height: 1.05;
    font-weight: 800;
    color: ${headingColor};
    letter-spacing: -1px;
    text-wrap: balance;
    max-width: 900px;
  }
  .layout-launchpad .headline {
    font-size: 64px;
    letter-spacing: -1.4px;
  }
  .subheadline {
    font-size: 30px;
    line-height: 1.25;
    color: ${subColor};
    max-width: 840px;
  }
  .frame-wrap {
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    flex: 1;
  }
  .layout-launchpad .phone-frame {
    width: 420px;
    height: 860px;
    border-radius: 48px;
    box-shadow: 0 42px 80px rgba(0,0,0,0.46), 0 0 0 2px rgba(255,255,255,0.14);
  }
  .phone-frame {
    width: 380px;
    height: 780px;
    background: #1a1a2e;
    border-radius: 40px;
    padding: 12px;
    box-shadow: 0 30px 60px rgba(0,0,0,0.4), 0 0 0 2px rgba(255,255,255,0.1);
    position: relative;
  }
  .phone-frame::before {
    content: '';
    position: absolute;
    top: 16px;
    left: 50%;
    transform: translateX(-50%);
    width: 120px;
    height: 24px;
    background: #0d0d1a;
    border-radius: 12px;
    z-index: 10;
  }
  .screen {
    width: 100%;
    height: 100%;
    border-radius: 28px;
    overflow: hidden;
    background: #000;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .screen img {
    width: 100%;
    height: 100%;
    object-fit: contain;
  }
  .image-flat {
    width: min(920px, 86vw);
    height: min(1460px, 74vh);
    border-radius: 28px;
    overflow: hidden;
    box-shadow: 0 30px 60px rgba(0,0,0,0.35);
    border: 2px solid rgba(255,255,255,0.18);
  }
  .image-flat img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
  .footer {
    width: 100%;
    display: flex;
    justify-content: center;
    color: ${subColor};
    font-size: 20px;
  }
</style>
</head>
<body class="${layoutClass}">
  <div class="top">
    <div class="locale">${localeBadge}</div>
    <div class="headline">${escapeHtml(options.headline)}</div>
    <div class="subheadline">${escapeHtml(options.subheadline)}</div>
  </div>
  <div class="frame-wrap">
    ${
      options.includeDeviceFrame
        ? `<div class="phone-frame"><div class="screen"><img src="data:image/png;base64,${screenshotBase64}" /></div></div>`
        : `<div class="image-flat"><img src="data:image/png;base64,${screenshotBase64}" /></div>`
    }
  </div>
  <div class="footer">
    <span>Screen ${index + 1} of ${total}</span>
  </div>
</body>
</html>`;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ---------------------------------------------------------------------------
// Feature Graphic generation (1024x500)
// ---------------------------------------------------------------------------

export async function generateFeatureGraphic(
  analysis: AppAnalysis,
  outputDir: string
): Promise<string | null> {
  mkdirSync(outputDir, { recursive: true });
  const outputPath = path.join(outputDir, "feature_graphic.png");

  let chromium: any;
  try {
    chromium = (await import("playwright-core")).chromium;
  } catch {
    console.warn("playwright-core not available, skipping feature graphic generation");
    return null;
  }

  let browser;
  try {
    browser = await chromium.launch({ channel: "chrome", headless: true });
  } catch {
    try {
      browser = await chromium.launch({ channel: "msedge", headless: true });
    } catch {
      console.warn("No browser available for feature graphic generation");
      return null;
    }
  }

  try {
    const page = await browser.newPage();
    const html = generateFeatureGraphicHtml(analysis);

    await page.setContent(html, { waitUntil: "load" });
    await page.setViewportSize({ width: 1024, height: 500 });

    await page.screenshot({
      path: outputPath,
      clip: { x: 0, y: 0, width: 1024, height: 500 },
    });

    return existsSync(outputPath) ? outputPath : null;
  } finally {
    await browser.close().catch(() => {});
  }
}

function generateFeatureGraphicHtml(analysis: AppAnalysis): string {
  // Read icon as base64 if available
  let iconB64 = "";
  if (analysis.iconPath && existsSync(analysis.iconPath)) {
    iconB64 = readFileSync(analysis.iconPath).toString("base64");
  }

  const gradients: Record<string, string> = {
    PRODUCTIVITY: "linear-gradient(135deg, #0061ff 0%, #60efff 100%)",
    GAME_ACTION: "linear-gradient(135deg, #ff0844 0%, #ffb199 100%)",
    PHOTOGRAPHY: "linear-gradient(135deg, #f093fb 0%, #f5576c 100%)",
    SOCIAL: "linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)",
    TOOLS: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
    HEALTH_AND_FITNESS: "linear-gradient(135deg, #11998e 0%, #38ef7d 100%)",
    MUSIC_AND_AUDIO: "linear-gradient(135deg, #ee0979 0%, #ff6a00 100%)",
    FINANCE: "linear-gradient(135deg, #2af598 0%, #009efd 100%)",
    EDUCATION: "linear-gradient(135deg, #fccb90 0%, #d57eeb 100%)",
  };

  const bg = gradients[inferCategoryFromAnalysis(analysis)] || gradients.TOOLS;

  return `<!DOCTYPE html>
<html>
<head>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    width: 1024px;
    height: 500px;
    background: ${bg};
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    overflow: hidden;
    position: relative;
  }
  .content {
    display: flex;
    align-items: center;
    gap: 48px;
    z-index: 1;
  }
  .icon-container {
    width: 160px;
    height: 160px;
    background: rgba(255,255,255,0.15);
    border-radius: 36px;
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 20px 40px rgba(0,0,0,0.2);
    backdrop-filter: blur(10px);
  }
  .icon-container img {
    width: 120px;
    height: 120px;
    border-radius: 24px;
  }
  .icon-placeholder {
    width: 120px;
    height: 120px;
    background: rgba(255,255,255,0.3);
    border-radius: 24px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 48px;
    color: white;
    font-weight: bold;
  }
  .text-content {
    color: white;
    text-shadow: 0 2px 10px rgba(0,0,0,0.2);
  }
  .app-title {
    font-size: 52px;
    font-weight: 800;
    letter-spacing: -1px;
    margin-bottom: 12px;
  }
  .app-tagline {
    font-size: 22px;
    font-weight: 400;
    opacity: 0.9;
    max-width: 400px;
    line-height: 1.4;
  }
  .decoration {
    position: absolute;
    border-radius: 50%;
    background: rgba(255,255,255,0.08);
  }
  .d1 { width: 300px; height: 300px; top: -100px; right: -50px; }
  .d2 { width: 200px; height: 200px; bottom: -60px; left: -40px; }
  .d3 { width: 150px; height: 150px; top: 50%; left: 60%; }
</style>
</head>
<body>
  <div class="decoration d1"></div>
  <div class="decoration d2"></div>
  <div class="decoration d3"></div>
  <div class="content">
    <div class="icon-container">
      ${
        iconB64
          ? `<img src="data:image/png;base64,${iconB64}" />`
          : `<div class="icon-placeholder">${analysis.appName.charAt(0).toUpperCase()}</div>`
      }
    </div>
    <div class="text-content">
      <div class="app-title">${escapeHtml(analysis.appName)}</div>
      <div class="app-tagline">Your essential Android companion</div>
    </div>
  </div>
</body>
</html>`;
}

function inferCategoryFromAnalysis(analysis: AppAnalysis): string {
  const pkg = analysis.packageName.toLowerCase();
  if (pkg.includes("game")) return "GAME_ACTION";
  if (pkg.includes("timer") || pkg.includes("todo") || pkg.includes("task"))
    return "PRODUCTIVITY";
  if (pkg.includes("photo") || pkg.includes("camera")) return "PHOTOGRAPHY";
  if (pkg.includes("music") || pkg.includes("audio")) return "MUSIC_AND_AUDIO";
  if (pkg.includes("health") || pkg.includes("fitness")) return "HEALTH_AND_FITNESS";
  if (pkg.includes("finance") || pkg.includes("bank")) return "FINANCE";
  if (pkg.includes("edu") || pkg.includes("learn")) return "EDUCATION";
  return "TOOLS";
}

// ---------------------------------------------------------------------------
// Generate all Play Store assets
// ---------------------------------------------------------------------------

export async function generateAllAssets(
  adbPath: string,
  serial: string | null,
  analysis: AppAnalysis,
  outputDir: string,
  options?: Partial<AssetGenerationOptions>
): Promise<PlayStoreAssets> {
  const normalized = normalizeOptions(options);
  mkdirSync(outputDir, { recursive: true });

  const assets: PlayStoreAssets = {
    iconPath: analysis.iconPath,
    featureGraphicPath: null,
    screenshotPaths: [],
    demoVideoPath: null,
    templatePreset: normalized.templatePreset,
  };

  // Generate feature graphic
  const featureGraphic = await generateFeatureGraphic(analysis, outputDir);
  if (featureGraphic) assets.featureGraphicPath = featureGraphic;

  // Capture screenshots from device/emulator if available
  if (serial) {
    const rawScreenshots = await captureScreenshots(
      adbPath,
      serial,
      path.join(outputDir, "raw"),
      normalized.screenshotCount
    );

    if (rawScreenshots.length > 0) {
      // Frame the screenshots
      const framedScreenshots = await frameScreenshots(
        rawScreenshots,
        path.join(outputDir, "framed"),
        normalized
      );
      assets.screenshotPaths = framedScreenshots;
    }
  }

  return assets;
}
