// =============================================================================
// Content Generator — AI-powered store listing generation from app metadata
// =============================================================================
// Analyzes the app's AndroidManifest.xml, project structure, and metadata to
// generate Play Store listing content (title, descriptions, category, tags).
// Uses template-based generation enriched with intelligent inference from
// package name, permissions, features, and activity names.
// =============================================================================

import { existsSync, readFileSync, readdirSync, statSync } from "fs";
import path from "path";
import type { AppAnalysis, PlayStoreConfig, ProjectType } from "./types";

// ---------------------------------------------------------------------------
// App Analysis — extract metadata from project
// ---------------------------------------------------------------------------

export function analyzeApp(projectPath: string, projectType: ProjectType): AppAnalysis {
  const androidDir =
    projectType === "android-native" ? projectPath : path.join(projectPath, "android");

  const analysis: AppAnalysis = {
    packageName: "",
    appName: path.basename(projectPath),
    versionName: "1.0.0",
    versionCode: 1,
    minSdk: 21,
    targetSdk: 34,
    permissions: [],
    activities: [],
    features: [],
    projectType,
    hasInternet: false,
    hasCamera: false,
    hasLocation: false,
    hasStorage: false,
    hasBluetooth: false,
    hasMicrophone: false,
    iconPath: null,
    apkPath: null,
  };

  // Parse AndroidManifest.xml
  const manifestPath = path.join(androidDir, "app", "src", "main", "AndroidManifest.xml");
  if (existsSync(manifestPath)) {
    try {
      const manifest = readFileSync(manifestPath, "utf-8");
      parseManifest(manifest, analysis, androidDir);
    } catch {
      // fall through
    }
  }

  // Parse build.gradle for version info and applicationId
  for (const gradleFile of ["app/build.gradle", "app/build.gradle.kts"]) {
    const gradlePath = path.join(androidDir, gradleFile);
    if (existsSync(gradlePath)) {
      try {
        const content = readFileSync(gradlePath, "utf-8");
        parseGradle(content, analysis);
      } catch {
        // fall through
      }
      break;
    }
  }

  // Flutter: parse pubspec.yaml for app name and version
  if (projectType === "flutter") {
    const pubspecPath = path.join(projectPath, "pubspec.yaml");
    if (existsSync(pubspecPath)) {
      try {
        const content = readFileSync(pubspecPath, "utf-8");
        parsePubspec(content, analysis);
      } catch {
        // fall through
      }
    }
  }

  // React Native: parse package.json for name and version
  if (projectType === "react-native") {
    const pkgPath = path.join(projectPath, "package.json");
    if (existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
        if (pkg.name) analysis.appName = humanizeName(pkg.name);
        if (pkg.version) analysis.versionName = pkg.version;
      } catch {
        // fall through
      }
    }
  }

  // Find built APK
  analysis.apkPath = findApk(projectPath, projectType);

  // Find app icon
  analysis.iconPath = findIcon(androidDir);

  // Derive capability flags from permissions
  analysis.hasInternet = analysis.permissions.some((p) => p.includes("INTERNET"));
  analysis.hasCamera = analysis.permissions.some((p) => p.includes("CAMERA"));
  analysis.hasLocation = analysis.permissions.some(
    (p) => p.includes("ACCESS_FINE_LOCATION") || p.includes("ACCESS_COARSE_LOCATION")
  );
  analysis.hasStorage = analysis.permissions.some(
    (p) => p.includes("READ_EXTERNAL_STORAGE") || p.includes("WRITE_EXTERNAL_STORAGE")
  );
  analysis.hasBluetooth = analysis.permissions.some((p) => p.includes("BLUETOOTH"));
  analysis.hasMicrophone = analysis.permissions.some((p) => p.includes("RECORD_AUDIO"));

  return analysis;
}

function parseManifest(xml: string, analysis: AppAnalysis, androidDir: string): void {
  // Package name
  const pkgMatch = xml.match(/package\s*=\s*"([^"]+)"/);
  if (pkgMatch) analysis.packageName = pkgMatch[1];

  // Permissions
  const permRegex = /uses-permission[^>]*android:name\s*=\s*"([^"]+)"/g;
  let match;
  while ((match = permRegex.exec(xml)) !== null) {
    analysis.permissions.push(match[1]);
  }

  // Features
  const featRegex = /uses-feature[^>]*android:name\s*=\s*"([^"]+)"/g;
  while ((match = featRegex.exec(xml)) !== null) {
    analysis.features.push(match[1]);
  }

  // Activities
  const actRegex = /activity[^>]*android:name\s*=\s*"([^"]+)"/g;
  while ((match = actRegex.exec(xml)) !== null) {
    analysis.activities.push(match[1]);
  }

  // App label (android:label)
  const labelMatch = xml.match(
    /<application[^>]*android:label\s*=\s*"([^"@]+)"/
  );
  if (labelMatch) analysis.appName = labelMatch[1];

  // Try @string/app_name — will use as fallback
  const stringRefMatch = xml.match(
    /<application[^>]*android:label\s*=\s*"@string\/([^"]+)"/
  );
  if (stringRefMatch) {
    const resolved = resolveStringResource(stringRefMatch[1], androidDir);
    if (resolved) analysis.appName = resolved;
  }

  // Min/target SDK
  const minSdkMatch = xml.match(/minSdkVersion\s*=\s*"(\d+)"/);
  if (minSdkMatch) analysis.minSdk = parseInt(minSdkMatch[1], 10);
  const targetSdkMatch = xml.match(/targetSdkVersion\s*=\s*"(\d+)"/);
  if (targetSdkMatch) analysis.targetSdk = parseInt(targetSdkMatch[1], 10);
}

function parseGradle(content: string, analysis: AppAnalysis): void {
  const appIdMatch = content.match(/applicationId\s*=?\s*["']([^"']+)["']/);
  if (appIdMatch) analysis.packageName = appIdMatch[1];

  const namespaceMatch = content.match(/namespace\s*=?\s*["']([^"']+)["']/);
  if (namespaceMatch && !analysis.packageName) analysis.packageName = namespaceMatch[1];

  const versionNameMatch = content.match(/versionName\s*=?\s*["']([^"']+)["']/);
  if (versionNameMatch) analysis.versionName = versionNameMatch[1];

  const versionCodeMatch = content.match(/versionCode\s*=?\s*(\d+)/);
  if (versionCodeMatch) analysis.versionCode = parseInt(versionCodeMatch[1], 10);

  const minSdkMatch = content.match(/minSdk\s*=?\s*(\d+)/);
  if (minSdkMatch) analysis.minSdk = parseInt(minSdkMatch[1], 10);

  const targetSdkMatch = content.match(/targetSdk\s*=?\s*(\d+)/);
  if (targetSdkMatch) analysis.targetSdk = parseInt(targetSdkMatch[1], 10);
}

function parsePubspec(content: string, analysis: AppAnalysis): void {
  const nameMatch = content.match(/^name:\s*(.+)$/m);
  if (nameMatch) analysis.appName = humanizeName(nameMatch[1].trim());

  const versionMatch = content.match(/^version:\s*(.+)$/m);
  if (versionMatch) {
    const versionStr = versionMatch[1].trim();
    const plusIdx = versionStr.indexOf("+");
    if (plusIdx >= 0) {
      analysis.versionName = versionStr.substring(0, plusIdx);
      analysis.versionCode = parseInt(versionStr.substring(plusIdx + 1), 10) || 1;
    } else {
      analysis.versionName = versionStr;
    }
  }
}

function resolveStringResource(name: string, androidDir: string): string | null {
  // Try to read res/values/strings.xml — used when android:label="@string/app_name"
  try {
    const stringsXmlPaths = [
      path.join(androidDir, "app", "src", "main", "res", "values", "strings.xml"),
      path.join(androidDir, "src", "main", "res", "values", "strings.xml"),
    ];

    const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(
      `<string\\s+name=["']${escapedName}["'][^>]*>([\\s\\S]*?)</string>`
    );

    for (const stringsXmlPath of stringsXmlPaths) {
      if (!existsSync(stringsXmlPath)) continue;
      const xml = readFileSync(stringsXmlPath, "utf-8");
      const match = xml.match(regex);
      if (!match) continue;

      const value = match[1]
        .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
        .replace(/\s+/g, " ")
        .trim();

      if (value) return value;
    }
  } catch {
    // Fall through — best effort
  }
  return null;
}

function humanizeName(name: string): string {
  return name
    .replace(/[-_]/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

function findApk(projectPath: string, projectType: ProjectType): string | null {
  const searchDirs: string[] = [];

  if (projectType === "flutter") {
    searchDirs.push(path.join(projectPath, "build", "app", "outputs", "flutter-apk"));
    searchDirs.push(path.join(projectPath, "build", "app", "outputs", "apk"));
  } else if (projectType === "react-native") {
    searchDirs.push(path.join(projectPath, "android", "app", "build", "outputs", "apk"));
  } else {
    searchDirs.push(path.join(projectPath, "app", "build", "outputs", "apk"));
  }

  for (const dir of searchDirs) {
    if (!existsSync(dir)) continue;
    const apk = findFileRecursive(dir, /\.apk$/i, 3);
    if (apk) return apk;
  }
  return null;
}

function findIcon(androidDir: string): string | null {
  const resDir = path.join(androidDir, "app", "src", "main", "res");
  if (!existsSync(resDir)) return null;

  // Look for highest-res icon first
  const densities = ["xxxhdpi", "xxhdpi", "xhdpi", "hdpi", "mdpi"];
  for (const density of densities) {
    const mipmapDir = path.join(resDir, `mipmap-${density}`);
    if (!existsSync(mipmapDir)) continue;
    for (const iconName of ["ic_launcher.png", "ic_launcher_round.png"]) {
      const iconPath = path.join(mipmapDir, iconName);
      if (existsSync(iconPath)) return iconPath;
    }
  }
  return null;
}

function findFileRecursive(dir: string, pattern: RegExp, maxDepth: number): string | null {
  if (maxDepth <= 0 || !existsSync(dir)) return null;
  try {
    const entries = readdirSync(dir);
    for (const entry of entries) {
      const full = path.join(dir, entry);
      if (pattern.test(entry)) return full;
      try {
        if (statSync(full).isDirectory()) {
          const found = findFileRecursive(full, pattern, maxDepth - 1);
          if (found) return found;
        }
      } catch {
        // permission error, skip
      }
    }
  } catch {
    // can't read dir
  }
  return null;
}

// ---------------------------------------------------------------------------
// Content Generation — intelligent template-based
// ---------------------------------------------------------------------------

export function generateStoreContent(analysis: AppAnalysis): PlayStoreConfig {
  const category = inferCategory(analysis);
  const title = cleanTitle(analysis.appName);
  const shortDesc = generateShortDescription(analysis, category);
  const fullDesc = generateFullDescription(analysis, category);

  return {
    packageName: analysis.packageName,
    appTitle: title.substring(0, 30), // Play Store limit
    shortDescription: shortDesc.substring(0, 80), // Play Store limit
    fullDescription: fullDesc.substring(0, 4000), // Play Store limit
    category,
    contactEmail: "",
    contactPhone: "",
    contactWebsite: "",
    privacyPolicyUrl: "",
    defaultLanguage: "en-US",
    isFree: true,
    containsAds: false,
    targetAudience: "everyone",
  };
}

function cleanTitle(name: string): string {
  // Remove common suffixes and clean up
  return name
    .replace(/\s*(app|application|android|mobile)$/i, "")
    .trim() || name;
}

function inferCategory(analysis: AppAnalysis): string {
  const pkg = analysis.packageName.toLowerCase();
  const name = analysis.appName.toLowerCase();

  // Game detection
  if (
    pkg.includes("game") ||
    name.includes("game") ||
    analysis.features.some((f) => f.includes("gamepad") || f.includes("vulkan"))
  ) {
    return "GAME_ACTION";
  }

  // Camera/photo apps
  if (analysis.hasCamera || pkg.includes("camera") || pkg.includes("photo")) {
    return "PHOTOGRAPHY";
  }

  // Social/messaging
  if (
    pkg.includes("chat") ||
    pkg.includes("message") ||
    pkg.includes("social") ||
    name.includes("chat")
  ) {
    return "SOCIAL";
  }

  // Music/audio
  if (
    analysis.hasMicrophone ||
    pkg.includes("music") ||
    pkg.includes("audio") ||
    pkg.includes("sound") ||
    name.includes("music")
  ) {
    return "MUSIC_AND_AUDIO";
  }

  // Maps/navigation
  if (analysis.hasLocation && (pkg.includes("map") || pkg.includes("nav"))) {
    return "MAPS_AND_NAVIGATION";
  }

  // Health/fitness
  if (
    pkg.includes("health") ||
    pkg.includes("fitness") ||
    pkg.includes("workout") ||
    name.includes("fitness")
  ) {
    return "HEALTH_AND_FITNESS";
  }

  // Timer/clock/productivity
  if (
    pkg.includes("timer") ||
    pkg.includes("clock") ||
    pkg.includes("todo") ||
    pkg.includes("task") ||
    name.includes("timer")
  ) {
    return "PRODUCTIVITY";
  }

  // Finance
  if (pkg.includes("finance") || pkg.includes("bank") || pkg.includes("money")) {
    return "FINANCE";
  }

  // Education
  if (pkg.includes("edu") || pkg.includes("learn") || pkg.includes("study")) {
    return "EDUCATION";
  }

  // Shopping
  if (pkg.includes("shop") || pkg.includes("store") || pkg.includes("market")) {
    return "SHOPPING";
  }

  // Weather
  if (pkg.includes("weather")) return "WEATHER";

  // News
  if (pkg.includes("news")) return "NEWS_AND_MAGAZINES";

  // Default: tools
  return "TOOLS";
}

function generateShortDescription(analysis: AppAnalysis, category: string): string {
  const name = analysis.appName;
  const features: string[] = [];

  if (analysis.hasCamera) features.push("camera");
  if (analysis.hasLocation) features.push("location-aware");
  if (analysis.hasBluetooth) features.push("Bluetooth-enabled");

  const categoryLabel = categoryToLabel(category);

  if (features.length > 0) {
    return `${name} - A ${categoryLabel.toLowerCase()} app with ${features.join(", ")} features`;
  }

  return `${name} - Your go-to ${categoryLabel.toLowerCase()} app for Android`;
}

function generateFullDescription(analysis: AppAnalysis, category: string): string {
  const name = analysis.appName;
  const sections: string[] = [];

  // Opening
  sections.push(
    `${name} is a powerful ${categoryToLabel(category).toLowerCase()} application designed for Android devices.\n`
  );

  // Key Features
  const keyFeatures: string[] = [];

  if (analysis.hasInternet) keyFeatures.push("Cloud sync and online connectivity");
  if (analysis.hasCamera) keyFeatures.push("Integrated camera functionality");
  if (analysis.hasLocation) keyFeatures.push("Location-based features and services");
  if (analysis.hasBluetooth) keyFeatures.push("Bluetooth device connectivity");
  if (analysis.hasMicrophone) keyFeatures.push("Audio recording and voice features");
  if (analysis.hasStorage) keyFeatures.push("Local file management and storage");

  // Infer features from activities
  for (const act of analysis.activities) {
    const lower = act.toLowerCase();
    if (lower.includes("settings") || lower.includes("preference")) {
      keyFeatures.push("Customizable settings and preferences");
      break;
    }
  }

  if (analysis.projectType === "flutter") {
    keyFeatures.push("Beautiful, fluid Material Design interface");
    keyFeatures.push("Smooth 60fps animations and transitions");
  } else if (analysis.projectType === "react-native") {
    keyFeatures.push("Modern, responsive user interface");
    keyFeatures.push("Cross-platform design excellence");
  }

  keyFeatures.push("Optimized performance for Android devices");
  keyFeatures.push("Regular updates and improvements");

  if (keyFeatures.length > 0) {
    sections.push("KEY FEATURES:");
    for (const feat of keyFeatures.slice(0, 8)) {
      sections.push(`\u2022 ${feat}`);
    }
    sections.push("");
  }

  // Technical details
  sections.push("TECHNICAL DETAILS:");
  sections.push(`\u2022 Minimum Android version: ${sdkToAndroidVersion(analysis.minSdk)}`);
  sections.push(`\u2022 Optimized for Android ${sdkToAndroidVersion(analysis.targetSdk)}`);
  if (analysis.projectType === "flutter") {
    sections.push("\u2022 Built with Flutter for exceptional performance");
  } else if (analysis.projectType === "react-native") {
    sections.push("\u2022 Built with React Native for a native experience");
  }
  sections.push("");

  // Closing
  sections.push(
    `Download ${name} today and experience a seamless Android application designed with care and attention to detail.`
  );
  sections.push("");
  sections.push(
    "We value your feedback! If you enjoy using the app, please leave a review. For support or feature requests, contact us through the developer contact information."
  );

  return sections.join("\n");
}

function categoryToLabel(category: string): string {
  const labels: Record<string, string> = {
    GAME_ACTION: "Action Game",
    PHOTOGRAPHY: "Photography",
    SOCIAL: "Social",
    MUSIC_AND_AUDIO: "Music & Audio",
    MAPS_AND_NAVIGATION: "Maps & Navigation",
    HEALTH_AND_FITNESS: "Health & Fitness",
    PRODUCTIVITY: "Productivity",
    FINANCE: "Finance",
    EDUCATION: "Education",
    SHOPPING: "Shopping",
    WEATHER: "Weather",
    NEWS_AND_MAGAZINES: "News & Magazines",
    TOOLS: "Tools",
  };
  return labels[category] || "Tools";
}

function sdkToAndroidVersion(sdk: number): string {
  const versions: Record<number, string> = {
    21: "5.0 (Lollipop)",
    22: "5.1",
    23: "6.0 (Marshmallow)",
    24: "7.0 (Nougat)",
    25: "7.1",
    26: "8.0 (Oreo)",
    27: "8.1",
    28: "9.0 (Pie)",
    29: "10",
    30: "11",
    31: "12",
    32: "12L",
    33: "13",
    34: "14",
    35: "15",
  };
  return versions[sdk] || `API ${sdk}`;
}
