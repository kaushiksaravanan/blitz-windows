// =============================================================================
// Play Store Publishing Service — browser automation via Playwright + Chrome CDP
// =============================================================================
// Orchestrates the full Play Store publishing flow:
// 1. Analyze app metadata
// 2. Generate store listing content
// 3. Generate screenshots, feature graphic, demo video
// 4. Connect to Chrome via CDP (user's logged-in session)
// 5. Automate Play Console forms: create app, store listing, content rating,
//    app content declarations, data safety, upload AAB, submit for review
// =============================================================================
//
// PLAY CONSOLE AUTOMATION KNOWLEDGE BASE (proven on TiltTimer Pro, March 2026)
// =============================================================================
//
// 1. CDP keyboard events do NOT work in background tabs. They dispatch events
//    but the browser ignores them. Use page.evaluate(.click()) instead.
//
// 2. page.evaluate(.click()) works on MOST Play Console buttons, EXCEPT:
//    - [debug-id=main-button] (Save and publish / Roll out)
//    These buttons require the tab to be in the foreground.
//    SOLUTION: Call page.bringToFront() BEFORE clicking main-button.
//
// 3. For file uploads (AAB, CSV):
//    - Use page.setInputFiles() via Playwright CDP
//    - Play Console's Angular file upload detects this correctly
//    - After setting file, wait 10-15 seconds for server-side processing
//
// 4. For Angular Material radio buttons:
//    - Do NOT click the <input type=radio> element directly
//    - Click the <material-radio> grandparent element instead
//    - The DOM path is: input -> div.mdc-radio -> material-radio (click this)
//
// 5. For Angular textareas (release notes, descriptions):
//    - Use native setter to bypass Angular's change detection:
//      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set
//    - Then dispatch both 'input' and 'change' events with bubbles:true
//
// 6. Data safety radio layout (Step 2):
//    - Radio #0: "Yes" for "Does your app collect..." (group 0)
//    - Radio #4: "No" for "Does your app collect..." (group 2)
//    - These are in SEPARATE radio groups!
//    - Radios #1-#3 are for data deletion question
//
// 7. Wait times: Play Console SPA is slow.
//    - After navigate: wait 3-5s
//    - After clicking buttons: wait 1-3s
//    - After file upload: wait 10-15s
//    - Use waitForSelector pattern instead of fixed waits where possible
//
// 8. debug-id selectors are more reliable than text selectors:
//    - [debug-id=button-next], [debug-id=main-button], [debug-id=yes-button]
//    - [debug-id=button-import-csv], [debug-id=import-button]
//
// =============================================================================

import { existsSync, mkdirSync } from "fs";
import path from "path";
import { spawn } from "child_process";
import { BrowserWindow } from "electron";
import { EventEmitter } from "events";
import { appState } from "./state";
import { analyzeApp, generateStoreContent } from "./content-generator";
import { generateAllAssets } from "./screenshot-service";
import { generateDemoVideo, recordDemoVideoNow } from "./video-generator";
import {
  generatePlayStoreDraft,
  getGenAiConfig,
  reviewTextWithGenAi,
  setGenAiConfig,
} from "./genai";
import type {
  AssetGenerationOptions,
  AppAnalysis,
  GenAiConfig,
  GenAiConfigUpdate,
  GenAiDraft,
  GenAiTextReview,
  PlayStoreConfig,
  PlayStoreAssets,
  PlayStorePublishState,
  PlayStorePhase,
  ProjectType,
  VideoOrientation,
} from "./types";

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

function mergeAssetOptions(options?: Partial<AssetGenerationOptions>): AssetGenerationOptions {
  return {
    ...DEFAULT_ASSET_OPTIONS,
    ...(options || {}),
  };
}

// Singleton publish state
let publishState: PlayStorePublishState = createInitialState();

// Store browser reference for cleanup and step-by-step flow
let activeBrowser: any = null;

function createInitialState(): PlayStorePublishState {
  return {
    phase: "idle",
    progress: 0,
    currentStep: "",
    config: null,
    assets: null,
    analysis: null,
    error: null,
    logs: [],
    browserConnected: false,
  };
}

// ---------------------------------------------------------------------------
// State management
// ---------------------------------------------------------------------------

function updateState(
  partial: Partial<PlayStorePublishState>,
  mainWindow: BrowserWindow | null,
  eventBus: EventEmitter
) {
  Object.assign(publishState, partial);

  // Emit to UI via IPC
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("playstore-state", { ...publishState });
  }

  // Emit to event bus (companion server)
  eventBus.emit("playstore-state", { ...publishState });
}

function addLog(
  msg: string,
  mainWindow: BrowserWindow | null,
  eventBus: EventEmitter
) {
  publishState.logs.push(`[${new Date().toLocaleTimeString()}] ${msg}`);
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("playstore-log", msg);
  }
  eventBus.emit("playstore-log", msg);
}

export function getPublishState(): PlayStorePublishState {
  return { ...publishState };
}

export function resetPublishState(): void {
  publishState = createInitialState();
}

// ---------------------------------------------------------------------------
// Phase 1: Analyze App
// ---------------------------------------------------------------------------

export async function analyzeProject(
  projectPath: string,
  projectType: ProjectType,
  mainWindow: BrowserWindow | null,
  eventBus: EventEmitter
): Promise<AppAnalysis> {
  updateState({ phase: "analyzing", progress: 5, currentStep: "Analyzing app metadata..." }, mainWindow, eventBus);
  addLog(`Analyzing project at: ${projectPath}`, mainWindow, eventBus);

  const analysis = analyzeApp(projectPath, projectType);

  addLog(`Package: ${analysis.packageName}`, mainWindow, eventBus);
  addLog(`App name: ${analysis.appName}`, mainWindow, eventBus);
  addLog(`Version: ${analysis.versionName} (${analysis.versionCode})`, mainWindow, eventBus);
  addLog(`Min SDK: ${analysis.minSdk}, Target SDK: ${analysis.targetSdk}`, mainWindow, eventBus);
  addLog(`Permissions: ${analysis.permissions.length} found`, mainWindow, eventBus);
  addLog(`Activities: ${analysis.activities.length} found`, mainWindow, eventBus);
  if (analysis.apkPath) addLog(`APK found: ${analysis.apkPath}`, mainWindow, eventBus);

  updateState({ analysis, progress: 10 }, mainWindow, eventBus);

  return analysis;
}

// ---------------------------------------------------------------------------
// Phase 2: Generate Content
// ---------------------------------------------------------------------------

export async function generateContent(
  analysis: AppAnalysis,
  mainWindow: BrowserWindow | null,
  eventBus: EventEmitter
): Promise<PlayStoreConfig> {
  updateState({ phase: "generating-content", progress: 15, currentStep: "Generating store listing content..." }, mainWindow, eventBus);
  addLog("Generating store listing content from app metadata...", mainWindow, eventBus);

  const config = generateStoreContent(analysis);

  addLog(`Title: ${config.appTitle}`, mainWindow, eventBus);
  addLog(`Category: ${config.category}`, mainWindow, eventBus);
  addLog(`Short description: ${config.shortDescription}`, mainWindow, eventBus);
  addLog("Full description generated", mainWindow, eventBus);

  updateState({ config, progress: 20 }, mainWindow, eventBus);

  return config;
}

// ---------------------------------------------------------------------------
// Phase 3: Generate Assets (screenshots, feature graphic, video)
// ---------------------------------------------------------------------------

export async function generateAssets(
  analysis: AppAnalysis,
  serial: string | null,
  outputDir: string,
  options: Partial<AssetGenerationOptions> | undefined,
  mainWindow: BrowserWindow | null,
  eventBus: EventEmitter
): Promise<PlayStoreAssets> {
  const mergedOptions = mergeAssetOptions(options);
  const assetsDir = path.join(outputDir, "playstore-assets");
  mkdirSync(assetsDir, { recursive: true });

  // Screenshots + feature graphic
  updateState({ phase: "generating-screenshots", progress: 25, currentStep: "Capturing screenshots..." }, mainWindow, eventBus);

  if (serial) {
    addLog(`Capturing screenshots from device: ${serial}`, mainWindow, eventBus);
  } else {
    addLog("No device connected — skipping screenshot capture", mainWindow, eventBus);
  }

  const assets = await generateAllAssets(
    appState.sdkConfig.adbPath,
    serial,
    analysis,
    assetsDir,
    mergedOptions
  );

  addLog(`Screenshots captured: ${assets.screenshotPaths.length}`, mainWindow, eventBus);

  // Feature graphic
  updateState({ phase: "generating-feature-graphic", progress: 40, currentStep: "Generating feature graphic..." }, mainWindow, eventBus);
  addLog(`Feature graphic: ${assets.featureGraphicPath ? "generated" : "skipped"}`, mainWindow, eventBus);

  // Demo video
  updateState({ phase: "generating-video", progress: 50, currentStep: "Generating demo video..." }, mainWindow, eventBus);
  addLog("Generating demo video...", mainWindow, eventBus);

  const videoPath = await generateDemoVideo(
    appState.sdkConfig.adbPath,
    serial,
    assets.screenshotPaths,
    path.join(assetsDir, "video"),
    {
      durationSeconds: mergedOptions.videoDurationSeconds,
      orientation: mergedOptions.videoOrientation,
    }
  );

  if (videoPath) {
    assets.demoVideoPath = videoPath;
    addLog(`Demo video created: ${videoPath}`, mainWindow, eventBus);
  } else {
    addLog("Demo video generation skipped (no device or ffmpeg)", mainWindow, eventBus);
  }

  updateState({ assets, progress: 60 }, mainWindow, eventBus);

  return assets;
}

// ---------------------------------------------------------------------------
// Phase 4: Connect to Chrome Browser via CDP
// ---------------------------------------------------------------------------

export async function connectBrowser(
  chromePort: number = 9222,
  mainWindow: BrowserWindow | null,
  eventBus: EventEmitter
): Promise<any> {
  updateState({ phase: "connecting-browser", progress: 65, currentStep: "Connecting to Chrome..." }, mainWindow, eventBus);

  let chromium: any;
  try {
    chromium = (await import("playwright-core")).chromium;
  } catch (err) {
    throw new Error("playwright-core is not installed. Run: npm install playwright-core");
  }

  // Try to connect to existing Chrome with debugging port
  addLog(`Connecting to Chrome on port ${chromePort}...`, mainWindow, eventBus);

  try {
    const browser = await chromium.connectOverCDP(`http://localhost:${chromePort}`);
    addLog("Connected to Chrome browser session", mainWindow, eventBus);
    updateState({ browserConnected: true, progress: 70 }, mainWindow, eventBus);
    activeBrowser = browser;
    return browser;
  } catch {
    addLog("Could not connect to Chrome. Launching Chrome with debugging port...", mainWindow, eventBus);

    // Launch Chrome with debugging port
    const chromePaths = [
      "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
      "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
      path.join(process.env.LOCALAPPDATA || "", "Google", "Chrome", "Application", "chrome.exe"),
    ];

    let chromePath: string | null = null;
    let isEdge = false;
    for (const p of chromePaths) {
      if (existsSync(p)) {
        chromePath = p;
        break;
      }
    }

    if (!chromePath) {
      // Try Edge as fallback
      const edgePaths = [
        "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
        "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
      ];
      for (const p of edgePaths) {
        if (existsSync(p)) {
          chromePath = p;
          isEdge = true;
          break;
        }
      }
    }

    if (!chromePath) {
      throw new Error("Chrome/Edge not found. Please install Chrome or launch it with --remote-debugging-port=9222");
    }

    // Launch Chrome with remote debugging — use correct user data dir for Chrome vs Edge
    const userDataDir = isEdge
      ? path.join(process.env.LOCALAPPDATA || "", "Microsoft", "Edge", "User Data")
      : path.join(process.env.LOCALAPPDATA || "", "Google", "Chrome", "User Data");

    addLog(`Launching ${isEdge ? "Edge" : "Chrome"} from: ${chromePath}`, mainWindow, eventBus);

    spawn(
      chromePath,
      [
        `--remote-debugging-port=${chromePort}`,
        `--user-data-dir=${userDataDir}`,
        "--no-first-run",
        "https://play.google.com/console",
      ],
      { detached: true, stdio: "ignore" }
    ).unref();

    // Retry connection with exponential backoff
    const maxRetries = 5;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      const delay = attempt * 2000; // 2s, 4s, 6s, 8s, 10s
      addLog(`Waiting ${delay / 1000}s before connection attempt ${attempt}/${maxRetries}...`, mainWindow, eventBus);
      await new Promise((resolve) => setTimeout(resolve, delay));

      try {
        const browser = await chromium.connectOverCDP(`http://localhost:${chromePort}`);
        addLog("Connected to Chrome browser session", mainWindow, eventBus);
        updateState({ browserConnected: true, progress: 70 }, mainWindow, eventBus);
        activeBrowser = browser;
        return browser;
      } catch {
        if (attempt === maxRetries) {
          throw new Error(
            `Failed to connect to Chrome on port ${chromePort} after ${maxRetries} attempts. ` +
            `Please launch Chrome manually with: chrome.exe --remote-debugging-port=${chromePort}`
          );
        }
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Play Console Helper — Angular-aware interactions (proven playbook)
// ---------------------------------------------------------------------------

/**
 * Set a textarea value using the native setter to bypass Angular change detection.
 * After setting, dispatch both 'input' and 'change' events.
 */
async function angularSetTextarea(page: any, selector: string, value: string): Promise<boolean> {
  return page.evaluate(
    ({ sel, val }: { sel: string; val: string }) => {
      const ta = document.querySelector(sel) as HTMLTextAreaElement | null;
      if (!ta) return false;
      const nativeSetter = Object.getOwnPropertyDescriptor(
        HTMLTextAreaElement.prototype,
        "value"
      )?.set;
      if (nativeSetter) {
        nativeSetter.call(ta, val);
      } else {
        ta.value = val;
      }
      ta.dispatchEvent(new Event("input", { bubbles: true }));
      ta.dispatchEvent(new Event("change", { bubbles: true }));
      return true;
    },
    { sel: selector, val: value }
  );
}

/**
 * Set an input value using the native setter to bypass Angular change detection.
 */
async function angularSetInput(page: any, selector: string, value: string): Promise<boolean> {
  return page.evaluate(
    ({ sel, val }: { sel: string; val: string }) => {
      const input = document.querySelector(sel) as HTMLInputElement | null;
      if (!input) return false;
      const nativeSetter = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value"
      )?.set;
      if (nativeSetter) {
        nativeSetter.call(input, val);
      } else {
        input.value = val;
      }
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
      return true;
    },
    { sel: selector, val: value }
  );
}

/**
 * Click an Angular Material radio button by clicking the material-radio grandparent.
 * Direct input click does NOT work in Play Console.
 */
async function clickMaterialRadio(page: any, index: number): Promise<boolean> {
  return page.evaluate((idx: number) => {
    const radios = document.querySelectorAll('input[type="radio"][role="radio"]');
    const radio = radios[idx] as HTMLElement | undefined;
    if (!radio) return false;
    // Walk up: input -> div.mdc-radio -> material-radio
    const grandparent = radio.parentElement?.parentElement;
    if (grandparent) {
      grandparent.click();
      return true;
    }
    // Fallback: click the parent
    radio.parentElement?.click();
    return true;
  }, index);
}

/**
 * Click a button by its debug-id attribute (preferred over text selectors).
 */
async function clickDebugId(page: any, debugId: string): Promise<boolean> {
  return page.evaluate((id: string) => {
    const btn = document.querySelector(`[debug-id="${id}"]`) as HTMLButtonElement | null;
    if (!btn) return false;
    if (btn.disabled) return false;
    btn.click();
    return true;
  }, debugId);
}

/**
 * Click a button by visible text content.
 */
async function clickButtonByText(page: any, text: string): Promise<boolean> {
  return page.evaluate((txt: string) => {
    const buttons = Array.from(document.querySelectorAll("button"));
    const btn = buttons.find((b) => b.textContent?.trim() === txt);
    if (!btn || btn.disabled) return false;
    btn.click();
    return true;
  }, text);
}

/**
 * Wait for text to appear on the page body.
 */
async function waitForBodyText(page: any, text: string, timeoutMs: number = 15000): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const found = await page.evaluate((t: string) => document.body.innerText.includes(t), text);
    if (found) return true;
    await page.waitForTimeout(500);
  }
  return false;
}

/**
 * Get the current data safety step number (e.g. "Step 2 of 5").
 */
async function getDataSafetyStep(page: any): Promise<string> {
  return page.evaluate(() => {
    const match = document.body.innerText.match(/Step (\d) of 5/);
    return match?.[1] || "?";
  });
}

// ---------------------------------------------------------------------------
// Phase 5: Automate Play Console — Create App
// ---------------------------------------------------------------------------

async function createApp(
  browser: any,
  config: PlayStoreConfig,
  mainWindow: BrowserWindow | null,
  eventBus: EventEmitter
): Promise<any> {
  updateState({ phase: "creating-app", progress: 72, currentStep: "Creating app in Play Console..." }, mainWindow, eventBus);
  addLog("Navigating to Play Console...", mainWindow, eventBus);

  const contexts = browser.contexts();
  const context = contexts[0] || (await browser.newContext());
  const page = await context.newPage();

  // Navigate to Play Console (wait 5s for SPA load)
  await page.goto("https://play.google.com/console", { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForTimeout(5000);

  addLog("On Play Console. Looking for 'Create app' button...", mainWindow, eventBus);

  // Click "Create app" button
  try {
    const createBtn = page.locator('text="Create app"').first();
    await createBtn.waitFor({ timeout: 10000 });
    await createBtn.click();
    await page.waitForTimeout(3000);
    addLog("Clicked 'Create app'", mainWindow, eventBus);
  } catch {
    addLog("'Create app' button not found — app may already exist", mainWindow, eventBus);
  }

  // Fill app details form
  try {
    // App name — use Angular-aware setter
    const appNameInput = page.locator('input[aria-label*="App name"], input[aria-label*="app name"]').first();
    await appNameInput.waitFor({ timeout: 5000 });
    await angularSetInput(page, 'input[aria-label*="App name"], input[aria-label*="app name"]', config.appTitle);
    addLog(`Filled app name: ${config.appTitle}`, mainWindow, eventBus);
    await page.waitForTimeout(500);

    // Free/Paid selection — click material-radio grandparent, not input
    if (config.isFree) {
      try {
        // "Free" is typically the first radio in the group
        await page.evaluate(() => {
          const labels = Array.from(document.querySelectorAll("material-radio"));
          const freeRadio = labels.find((el) => el.textContent?.includes("Free"));
          if (freeRadio) (freeRadio as HTMLElement).click();
        });
        addLog("Selected: Free", mainWindow, eventBus);
      } catch {
        addLog("Could not select Free/Paid option", mainWindow, eventBus);
      }
    }
    await page.waitForTimeout(500);

    // App type (App vs Game) — click material-radio grandparent
    try {
      await page.evaluate(() => {
        const labels = Array.from(document.querySelectorAll("material-radio"));
        const appRadio = labels.find((el) => el.textContent?.trim() === "App");
        if (appRadio) (appRadio as HTMLElement).click();
      });
      addLog("Selected: App", mainWindow, eventBus);
    } catch {
      addLog("Could not select App/Game option", mainWindow, eventBus);
    }
    await page.waitForTimeout(500);

    // Accept declarations (checkboxes) — use evaluate for reliability
    const checkedCount = await page.evaluate(() => {
      const cbs = document.querySelectorAll('input[type="checkbox"]');
      let count = 0;
      cbs.forEach((cb) => {
        const input = cb as HTMLInputElement;
        if (!input.checked) {
          // Click the label/parent for Angular Material checkboxes
          const parent = input.closest("material-checkbox") || input.parentElement;
          if (parent) (parent as HTMLElement).click();
          count++;
        }
      });
      return count;
    });
    addLog(`Accepted ${checkedCount} declaration(s)`, mainWindow, eventBus);
    await page.waitForTimeout(500);

    // Click "Create app" submit button
    try {
      const submitBtn = page.locator('button:has-text("Create app")').last();
      await submitBtn.click();
      await page.waitForTimeout(5000);
      addLog("App created successfully!", mainWindow, eventBus);
    } catch {
      addLog("Could not click submit — app may already exist", mainWindow, eventBus);
    }
  } catch (err) {
    addLog(`Form filling error: ${err}`, mainWindow, eventBus);
  }

  return page;
}

// ---------------------------------------------------------------------------
// Phase 6: Fill Store Listing
// ---------------------------------------------------------------------------

async function fillStoreListing(
  page: any,
  config: PlayStoreConfig,
  assets: PlayStoreAssets,
  mainWindow: BrowserWindow | null,
  eventBus: EventEmitter
): Promise<void> {
  updateState({ phase: "filling-listing", progress: 78, currentStep: "Filling store listing..." }, mainWindow, eventBus);

  // Navigate to Store listing page
  try {
    const storeListingLink = page.locator('text="Main store listing"').first();
    await storeListingLink.click({ timeout: 5000 });
    await page.waitForTimeout(2000);
  } catch {
    // Try navigating via URL if link not found
    const currentUrl = page.url();
    if (currentUrl.includes("/app/")) {
      const appSection = currentUrl.match(/\/app\/(\d+)\//);
      if (appSection) {
        await page.goto(
          `https://play.google.com/console/developers/${appSection[1]}/app/store-listing`,
          { waitUntil: "domcontentloaded" }
        );
      }
    }
  }

  addLog("Filling store listing fields...", mainWindow, eventBus);

  // Short description
  try {
    const shortDescInput = page.locator('textarea[aria-label*="Short description"], [data-field="shortDescription"] textarea').first();
    await shortDescInput.fill(config.shortDescription);
    addLog(`Short description: ${config.shortDescription}`, mainWindow, eventBus);
  } catch {
    addLog("Could not fill short description field", mainWindow, eventBus);
  }

  // Full description
  try {
    const fullDescInput = page.locator('textarea[aria-label*="Full description"], [data-field="fullDescription"] textarea').first();
    await fullDescInput.fill(config.fullDescription);
    addLog("Full description filled", mainWindow, eventBus);
  } catch {
    addLog("Could not fill full description field", mainWindow, eventBus);
  }

  // Upload screenshots
  if (assets.screenshotPaths.length > 0) {
    addLog(`Uploading ${assets.screenshotPaths.length} screenshots...`, mainWindow, eventBus);
    try {
      // Find the screenshots upload area
      const fileInputs = page.locator('input[type="file"]');
      const fileInputCount = await fileInputs.count();
      if (fileInputCount > 0) {
        await fileInputs.first().setInputFiles(assets.screenshotPaths);
        await page.waitForTimeout(3000);
        addLog("Screenshots uploaded", mainWindow, eventBus);
      }
    } catch (err) {
      addLog(`Screenshot upload error: ${err}`, mainWindow, eventBus);
    }
  }

  // Upload feature graphic
  if (assets.featureGraphicPath) {
    addLog("Uploading feature graphic...", mainWindow, eventBus);
    try {
      const fgInputs = page.locator('input[type="file"]');
      const fgCount = await fgInputs.count();
      // Feature graphic input is usually the second or third file input
      if (fgCount > 1) {
        await fgInputs.nth(1).setInputFiles([assets.featureGraphicPath]);
        await page.waitForTimeout(2000);
        addLog("Feature graphic uploaded", mainWindow, eventBus);
      }
    } catch (err) {
      addLog(`Feature graphic upload error: ${err}`, mainWindow, eventBus);
    }
  }

  // Upload app icon
  if (assets.iconPath && existsSync(assets.iconPath)) {
    addLog("Uploading app icon...", mainWindow, eventBus);
    try {
      const iconInputs = page.locator('input[type="file"]');
      const iconCount = await iconInputs.count();
      if (iconCount > 2) {
        await iconInputs.nth(2).setInputFiles([assets.iconPath]);
        await page.waitForTimeout(2000);
        addLog("App icon uploaded", mainWindow, eventBus);
      }
    } catch (err) {
      addLog(`Icon upload error: ${err}`, mainWindow, eventBus);
    }
  }

  // Save
  try {
    const saveBtn = page.locator('button:has-text("Save")').first();
    await saveBtn.click();
    await page.waitForTimeout(2000);
    addLog("Store listing saved", mainWindow, eventBus);
  } catch {
    addLog("Could not save store listing", mainWindow, eventBus);
  }
}

// ---------------------------------------------------------------------------
// Phase 7: Fill Content Rating
// ---------------------------------------------------------------------------

async function fillContentRating(
  page: any,
  analysis: AppAnalysis,
  mainWindow: BrowserWindow | null,
  eventBus: EventEmitter
): Promise<void> {
  updateState({ phase: "filling-content-rating", progress: 85, currentStep: "Filling content rating questionnaire..." }, mainWindow, eventBus);
  addLog("Navigating to content rating...", mainWindow, eventBus);

  // Navigate to content rating section
  try {
    const contentRatingLink = page.locator('text="Content rating"').first();
    await contentRatingLink.click({ timeout: 5000 });
    await page.waitForTimeout(2000);
  } catch {
    addLog("Could not navigate to content rating page", mainWindow, eventBus);
    return;
  }

  // Start questionnaire
  try {
    const startBtn = page.locator('button:has-text("Start questionnaire"), button:has-text("Start new questionnaire")').first();
    await startBtn.click({ timeout: 5000 });
    await page.waitForTimeout(2000);
    addLog("Started content rating questionnaire", mainWindow, eventBus);
  } catch {
    addLog("Could not start questionnaire — may already be completed", mainWindow, eventBus);
  }

  // Fill email if asked
  try {
    const emailInput = page.locator('input[type="email"]').first();
    await emailInput.waitFor({ timeout: 3000 });
    await emailInput.fill(publishState.config?.contactEmail || "developer@example.com");
    addLog("Filled email for content rating", mainWindow, eventBus);
  } catch {
    // Email field might not be present
  }

  // Select category
  try {
    const categoryOption = page.locator('text="Utility, Productivity, Communication, or other"').first();
    await categoryOption.click({ timeout: 3000 });
    addLog("Selected app category for IARC", mainWindow, eventBus);
  } catch {
    // Try alternative categories
    try {
      const altCategory = page.locator('[role="radio"]').first();
      await altCategory.click();
    } catch {
      addLog("Could not select IARC category", mainWindow, eventBus);
    }
  }

  // Answer "No" to all sensitive content questions (safe defaults)
  // The questionnaire typically asks about violence, sexuality, language, etc.
  try {
    const noButtons = page.locator('text="No"');
    const count = await noButtons.count();
    for (let i = 0; i < count; i++) {
      try {
        await noButtons.nth(i).click();
        await page.waitForTimeout(300);
      } catch {
        // Some might be hidden
      }
    }
    addLog(`Answered ${count} questionnaire items with 'No' (safe defaults)`, mainWindow, eventBus);
  } catch {
    addLog("Could not fill questionnaire answers", mainWindow, eventBus);
  }

  // Next/Save/Submit
  try {
    const nextBtn = page.locator('button:has-text("Next"), button:has-text("Save"), button:has-text("Submit")').first();
    await nextBtn.click();
    await page.waitForTimeout(2000);
    addLog("Content rating questionnaire submitted", mainWindow, eventBus);
  } catch {
    addLog("Could not submit content rating", mainWindow, eventBus);
  }
}

// ---------------------------------------------------------------------------
// Phase 8: Fill App Content Declarations
// ---------------------------------------------------------------------------

async function fillAppContent(
  page: any,
  config: PlayStoreConfig,
  analysis: AppAnalysis,
  mainWindow: BrowserWindow | null,
  eventBus: EventEmitter
): Promise<void> {
  updateState({ phase: "filling-app-content", progress: 88, currentStep: "Filling app content declarations..." }, mainWindow, eventBus);

  // Privacy policy
  if (config.privacyPolicyUrl) {
    try {
      const privacyLink = page.locator('text="App content"').first();
      await privacyLink.click({ timeout: 5000 });
      await page.waitForTimeout(2000);

      const urlInput = page.locator('input[aria-label*="Privacy policy URL"], input[placeholder*="URL"]').first();
      await urlInput.fill(config.privacyPolicyUrl);
      addLog(`Privacy policy URL set: ${config.privacyPolicyUrl}`, mainWindow, eventBus);
    } catch {
      addLog("Could not set privacy policy URL", mainWindow, eventBus);
    }
  }

  // Ads declaration
  try {
    const adsSection = page.locator('text="Ads"').first();
    await adsSection.click({ timeout: 3000 });
    await page.waitForTimeout(1000);

    if (config.containsAds) {
      await page.locator('text="Yes, my app contains ads"').first().click();
    } else {
      await page.locator('text="No, my app does not contain ads"').first().click();
    }
    addLog(`Ads declaration: ${config.containsAds ? "contains ads" : "no ads"}`, mainWindow, eventBus);

    const saveBtn = page.locator('button:has-text("Save")').first();
    await saveBtn.click();
    await page.waitForTimeout(1000);
  } catch {
    addLog("Could not fill ads declaration", mainWindow, eventBus);
  }

  // Target audience
  try {
    const targetSection = page.locator('text="Target audience"').first();
    await targetSection.click({ timeout: 3000 });
    await page.waitForTimeout(1000);

    // Select age group (default: 18 and over for safety)
    try {
      await page.locator('text="18 and over"').first().click();
      addLog("Target audience: 18 and over", mainWindow, eventBus);
    } catch {
      addLog("Could not set target audience", mainWindow, eventBus);
    }

    const saveBtn = page.locator('button:has-text("Save"), button:has-text("Next")').first();
    await saveBtn.click();
    await page.waitForTimeout(1000);
  } catch {
    addLog("Could not fill target audience section", mainWindow, eventBus);
  }
}

// ---------------------------------------------------------------------------
// Phase 9: Upload Build (APK/AAB)
// ---------------------------------------------------------------------------

async function uploadBuild(
  page: any,
  analysis: AppAnalysis,
  mainWindow: BrowserWindow | null,
  eventBus: EventEmitter
): Promise<void> {
  if (!analysis.apkPath || !existsSync(analysis.apkPath)) {
    addLog("No APK/AAB found to upload — skipping build upload", mainWindow, eventBus);
    return;
  }

  updateState({ phase: "uploading-build", progress: 92, currentStep: "Uploading build artifact..." }, mainWindow, eventBus);

  try {
    // Navigate to Production track
    const productionLink = page.locator('text="Production"').first();
    await productionLink.click({ timeout: 5000 });
    await page.waitForTimeout(2000);

    // Create new release
    const createReleaseBtn = page.locator('button:has-text("Create new release")').first();
    await createReleaseBtn.click({ timeout: 5000 });
    await page.waitForTimeout(2000);

    // Upload APK
    const fileInput = page.locator('input[type="file"]').first();
    await fileInput.setInputFiles([analysis.apkPath]);
    addLog(`Uploading APK: ${path.basename(analysis.apkPath)}`, mainWindow, eventBus);
    await page.waitForTimeout(10000); // Wait for upload

    // Release notes
    try {
      const releaseNotesInput = page.locator('textarea[aria-label*="Release notes"], textarea').first();
      await releaseNotesInput.fill(`Version ${analysis.versionName} - Initial release`);
      addLog("Added release notes", mainWindow, eventBus);
    } catch {
      addLog("Could not add release notes", mainWindow, eventBus);
    }

    // Save
    try {
      const saveBtn = page.locator('button:has-text("Save"), button:has-text("Review release")').first();
      await saveBtn.click();
      await page.waitForTimeout(2000);
      addLog("Release saved", mainWindow, eventBus);
    } catch {
      addLog("Could not save release", mainWindow, eventBus);
    }
  } catch (err) {
    addLog(`Build upload error: ${err}`, mainWindow, eventBus);
  }
}

// ---------------------------------------------------------------------------
// Full Publish Flow — orchestrates all phases
// ---------------------------------------------------------------------------

export async function publishToPlayStore(
  projectPath: string,
  projectType: ProjectType,
  serial: string | null,
  configOverrides: Partial<PlayStoreConfig>,
  assetOptions: Partial<AssetGenerationOptions> | undefined,
  chromePort: number,
  mainWindow: BrowserWindow | null,
  eventBus: EventEmitter
): Promise<void> {
  publishState = createInitialState();

  try {
    // Phase 1: Analyze
    const analysis = await analyzeProject(projectPath, projectType, mainWindow, eventBus);

    // Phase 2: Generate content
    const config = await generateContent(analysis, mainWindow, eventBus);

    // Apply user overrides
    Object.assign(config, configOverrides);
    updateState({ config }, mainWindow, eventBus);

    // Phase 3: Generate assets
    const outputDir = path.join(projectPath, ".blitz");
    const assets = await generateAssets(
      analysis,
      serial,
      outputDir,
      assetOptions,
      mainWindow,
      eventBus
    );

    // Phase 4: Connect browser
    const browser = await connectBrowser(chromePort, mainWindow, eventBus);

    // Phase 5: Create app
    const page = await createApp(browser, config, mainWindow, eventBus);

    // Phase 6: Fill store listing
    await fillStoreListing(page, config, assets, mainWindow, eventBus);

    // Phase 7: Content rating
    await fillContentRating(page, analysis, mainWindow, eventBus);

    // Phase 8: App content
    await fillAppContent(page, config, analysis, mainWindow, eventBus);

    // Phase 9: Upload build
    await uploadBuild(page, analysis, mainWindow, eventBus);

    // Done!
    updateState(
      { phase: "complete", progress: 100, currentStep: "Publishing complete!" },
      mainWindow,
      eventBus
    );
    addLog("Play Store publishing flow complete!", mainWindow, eventBus);
    addLog("Review your listing in Play Console and submit for review when ready.", mainWindow, eventBus);
  } catch (err: any) {
    updateState(
      { phase: "error", error: err.message || String(err), currentStep: "Error occurred" },
      mainWindow,
      eventBus
    );
    addLog(`ERROR: ${err.message || err}`, mainWindow, eventBus);
    throw err;
  } finally {
    // Always disconnect browser to prevent resource leak
    if (activeBrowser) {
      try {
        await activeBrowser.disconnect();
      } catch {
        // Browser may already be disconnected
      }
      activeBrowser = null;
    }
  }
}

// ---------------------------------------------------------------------------
// Individual step execution (for manual step-by-step flow from UI)
// ---------------------------------------------------------------------------

export async function runAnalyzeOnly(
  projectPath: string,
  projectType: ProjectType,
  mainWindow: BrowserWindow | null,
  eventBus: EventEmitter
): Promise<{ analysis: AppAnalysis; config: PlayStoreConfig }> {
  publishState = createInitialState();
  const analysis = await analyzeProject(projectPath, projectType, mainWindow, eventBus);
  const config = await generateContent(analysis, mainWindow, eventBus);
  updateState({ phase: "idle", currentStep: "Analysis complete" }, mainWindow, eventBus);
  return { analysis, config };
}

export async function runGenerateAssetsOnly(
  projectPath: string,
  projectType: ProjectType,
  serial: string | null,
  options: Partial<AssetGenerationOptions> | undefined,
  mainWindow: BrowserWindow | null,
  eventBus: EventEmitter
): Promise<PlayStoreAssets> {
  const analysis = analyzeApp(projectPath, projectType);
  updateState({ analysis }, mainWindow, eventBus);
  const outputDir = path.join(projectPath, ".blitz");
  const assets = await generateAssets(analysis, serial, outputDir, options, mainWindow, eventBus);
  updateState({ phase: "idle", currentStep: "Asset generation complete" }, mainWindow, eventBus);
  return assets;
}

export async function runConnectBrowserOnly(
  chromePort: number,
  mainWindow: BrowserWindow | null,
  eventBus: EventEmitter
): Promise<boolean> {
  try {
    const browser = await connectBrowser(chromePort, mainWindow, eventBus);
    activeBrowser = browser;
    updateState({ phase: "idle", currentStep: "Browser connected" }, mainWindow, eventBus);
    return true;
  } catch {
    return false;
  }
}

export async function runRecordDemoOnly(
  serial: string,
  outputDir: string,
  durationSeconds: number,
  orientation: VideoOrientation
): Promise<{ videoPath: string | null; durationSeconds: number; orientation: VideoOrientation }> {
  return recordDemoVideoNow(
    appState.sdkConfig.adbPath,
    serial,
    outputDir,
    durationSeconds,
    orientation
  );
}

export function getAssetDefaults(): AssetGenerationOptions {
  return { ...DEFAULT_ASSET_OPTIONS };
}

export function getGenAiSettings(): GenAiConfig {
  return getGenAiConfig();
}

export function updateGenAiSettings(update: GenAiConfigUpdate): GenAiConfig {
  return setGenAiConfig(update);
}

export async function generateStoreDraftWithAi(
  projectPath: string,
  projectType: ProjectType,
  userPrompt: string,
  existingConfig: PlayStoreConfig | null
): Promise<GenAiDraft> {
  const analysis = analyzeApp(projectPath, projectType);
  return generatePlayStoreDraft(analysis, existingConfig, userPrompt);
}

export async function reviewTextWithAi(
  inputText: string,
  instruction: string
): Promise<GenAiTextReview> {
  return reviewTextWithGenAi(inputText, instruction);
}
