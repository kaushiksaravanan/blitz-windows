import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import path from "path";
import { app } from "electron";
import type {
  AppAnalysis,
  GenAiConfig,
  GenAiConfigUpdate,
  GenAiDraft,
  GenAiProvider,
  GenAiTextReview,
  PlayStoreConfig,
} from "./types";

interface StoredGenAiConfig {
  provider: GenAiProvider;
  model: string;
  baseUrl: string;
  temperature: number;
  enabled: boolean;
  systemPrompt: string;
  apiKey: string;
}

const MODEL_MAX_LEN = 200;
const URL_MAX_LEN = 800;
const PROMPT_MAX_LEN = 8000;
const API_KEY_MAX_LEN = 2000;
const INPUT_TEXT_MAX_LEN = 20000;
const INSTRUCTION_MAX_LEN = 4000;

function getConfigPath(): { dir: string; file: string } {
  let baseDir = process.cwd();
  try {
    if (app?.isReady?.()) {
      baseDir = app.getPath("userData");
    }
  } catch {
    // Fallback to cwd during early startup
  }
  const dir = path.join(baseDir, "config");
  const file = path.join(dir, "genai.json");
  return { dir, file };
}

const PROVIDER_DEFAULTS: Record<GenAiProvider, { model: string; baseUrl: string }> = {
  openrouter: {
    model: "openai/gpt-4o-mini",
    baseUrl: "https://openrouter.ai/api/v1/chat/completions",
  },
  groq: {
    model: "llama-3.3-70b-versatile",
    baseUrl: "https://api.groq.com/openai/v1/chat/completions",
  },
  openai: {
    model: "gpt-4o-mini",
    baseUrl: "https://api.openai.com/v1/chat/completions",
  },
  anthropic: {
    model: "claude-3-5-sonnet-latest",
    baseUrl: "https://api.anthropic.com/v1/messages",
  },
  google: {
    model: "gemini-2.0-flash",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
  },
  together: {
    model: "meta-llama/Llama-3.3-70B-Instruct-Turbo",
    baseUrl: "https://api.together.xyz/v1/chat/completions",
  },
  fireworks: {
    model: "accounts/fireworks/models/llama-v3p1-70b-instruct",
    baseUrl: "https://api.fireworks.ai/inference/v1/chat/completions",
  },
  deepseek: {
    model: "deepseek-chat",
    baseUrl: "https://api.deepseek.com/v1/chat/completions",
  },
  xai: {
    model: "grok-2-latest",
    baseUrl: "https://api.x.ai/v1/chat/completions",
  },
  mistral: {
    model: "mistral-small-latest",
    baseUrl: "https://api.mistral.ai/v1/chat/completions",
  },
  perplexity: {
    model: "sonar-pro",
    baseUrl: "https://api.perplexity.ai/chat/completions",
  },
  custom: {
    model: "",
    baseUrl: "",
  },
};

const DEFAULT_SYSTEM_PROMPT =
  "You are a senior app store copy editor. Write concise, natural copy that sounds human. Never use em dash punctuation. Use regular hyphen when needed. Avoid AI-sounding phrases, hype, repetitive structure, and synthetic marketing tone. Keep claims factual and specific. Return JSON only with keys: appTitle, shortDescription, fullDescription, category.";

function ensureConfigDir() {
  const { dir } = getConfigPath();
  mkdirSync(dir, { recursive: true });
}

function maskApiKey(key: string): string {
  if (!key) return "";
  if (key.length <= 8) return "*".repeat(key.length);
  return `${key.slice(0, 4)}...${key.slice(-4)}`;
}

function getDefaultStoredConfig(): StoredGenAiConfig {
  const d = PROVIDER_DEFAULTS.openrouter;
  return {
    provider: "openrouter",
    model: d.model,
    baseUrl: d.baseUrl,
    temperature: 0.4,
    enabled: false,
    systemPrompt: DEFAULT_SYSTEM_PROMPT,
    apiKey: "",
  };
}

function toPublicConfig(config: StoredGenAiConfig): GenAiConfig {
  return {
    provider: config.provider,
    model: config.model,
    baseUrl: config.baseUrl,
    temperature: config.temperature,
    enabled: config.enabled,
    systemPrompt: config.systemPrompt,
    hasApiKey: !!config.apiKey,
    apiKeyPreview: maskApiKey(config.apiKey),
  };
}

function readStoredConfig(): StoredGenAiConfig {
  try {
    const { file } = getConfigPath();
    if (!existsSync(file)) return getDefaultStoredConfig();
    const parsed = JSON.parse(readFileSync(file, "utf-8")) as StoredGenAiConfig;
    const provider = parsed.provider || "openrouter";
    const providerDefaults = PROVIDER_DEFAULTS[provider] || PROVIDER_DEFAULTS.openrouter;
    return sanitizeStoredConfig({
      ...getDefaultStoredConfig(),
      ...parsed,
      provider,
      model: parsed.model || providerDefaults.model,
      baseUrl: parsed.baseUrl || providerDefaults.baseUrl,
    });
  } catch {
    return getDefaultStoredConfig();
  }
}

function writeStoredConfig(config: StoredGenAiConfig): void {
  ensureConfigDir();
  const { file } = getConfigPath();
  writeFileSync(file, JSON.stringify(config, null, 2), "utf-8");
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0.4;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

function trimTo(value: string, maxLen: number): string {
  return value.trim().slice(0, maxLen);
}

function sanitizeStoredConfig(config: StoredGenAiConfig): StoredGenAiConfig {
  const providerDefaults = PROVIDER_DEFAULTS[config.provider] || PROVIDER_DEFAULTS.openrouter;
  return {
    ...config,
    provider: config.provider,
    model: trimTo(config.model || providerDefaults.model, MODEL_MAX_LEN),
    baseUrl: trimTo(config.baseUrl || providerDefaults.baseUrl, URL_MAX_LEN),
    temperature: clamp01(config.temperature),
    enabled: !!config.enabled,
    systemPrompt: trimTo(config.systemPrompt || DEFAULT_SYSTEM_PROMPT, PROMPT_MAX_LEN),
    apiKey: trimTo(config.apiKey || "", API_KEY_MAX_LEN),
  };
}

export function getGenAiConfig(): GenAiConfig {
  return toPublicConfig(readStoredConfig());
}

export function setGenAiConfig(update: GenAiConfigUpdate): GenAiConfig {
  const current = readStoredConfig();
  const provider = update.provider ?? current.provider;
  const defaults = PROVIDER_DEFAULTS[provider];

  const next: StoredGenAiConfig = {
    ...current,
    provider,
    model:
      update.model !== undefined
        ? trimTo(update.model, MODEL_MAX_LEN)
        : update.provider
          ? defaults.model
          : current.model,
    baseUrl:
      update.baseUrl !== undefined
        ? trimTo(update.baseUrl, URL_MAX_LEN)
        : update.provider
          ? defaults.baseUrl
          : current.baseUrl,
    temperature: update.temperature ?? current.temperature,
    enabled: update.enabled ?? current.enabled,
    systemPrompt:
      update.systemPrompt !== undefined
        ? trimTo(update.systemPrompt, PROMPT_MAX_LEN)
        : current.systemPrompt,
    apiKey: update.apiKey !== undefined ? trimTo(update.apiKey, API_KEY_MAX_LEN) : current.apiKey,
  };

  next.temperature = clamp01(next.temperature);

  if (next.provider !== "custom") {
    if (!next.baseUrl) next.baseUrl = defaults.baseUrl;
    if (!next.model) next.model = defaults.model;
  }

  if (next.baseUrl && !/^https:\/\//i.test(next.baseUrl)) {
    throw new Error("baseUrl must start with https://");
  }

  const safe = sanitizeStoredConfig(next);
  writeStoredConfig(safe);
  return toPublicConfig(safe);
}

function getAuthHeaders(config: StoredGenAiConfig): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (!config.apiKey) return headers;

  if (config.provider === "anthropic") {
    headers["x-api-key"] = config.apiKey;
    headers["anthropic-version"] = "2023-06-01";
  } else if (config.provider === "google") {
    headers["x-goog-api-key"] = config.apiKey;
  } else {
    headers.Authorization = `Bearer ${config.apiKey}`;
  }

  // Helpful for OpenRouter routing/analytics
  if (config.provider === "openrouter") {
    headers["HTTP-Referer"] = "https://blitz.local";
    headers["X-Title"] = "Blitz Windows Controller";
  }

  return headers;
}

function buildUserPrompt(
  analysis: AppAnalysis,
  existingConfig: PlayStoreConfig | null,
  userPrompt: string
): string {
  const context = {
    appName: analysis.appName,
    packageName: analysis.packageName,
    versionName: analysis.versionName,
    minSdk: analysis.minSdk,
    targetSdk: analysis.targetSdk,
    permissions: analysis.permissions,
    activities: analysis.activities,
    features: analysis.features,
    projectType: analysis.projectType,
    existingConfig,
  };

  return [
    "Generate polished Play Store listing fields as JSON.",
    "Style constraints:",
    "- Do not use em dash punctuation.",
    "- Use normal hyphen punctuation when needed.",
    "- Avoid language that sounds AI-generated.",
    "- Keep tone direct, concrete, and human.",
    "- No exaggerated marketing claims.",
    "User request:",
    userPrompt || "Improve clarity and conversion while staying factual.",
    "Context JSON:",
    JSON.stringify(context, null, 2),
  ].join("\n");
}

async function runChatCompletions(config: StoredGenAiConfig, prompt: string): Promise<string> {
  const body = {
    model: config.model,
    temperature: config.temperature,
    messages: [
      { role: "system", content: config.systemPrompt || DEFAULT_SYSTEM_PROMPT },
      { role: "user", content: prompt },
    ],
    response_format: { type: "json_object" },
  };

  const res = await fetch(config.baseUrl, {
    method: "POST",
    headers: getAuthHeaders(config),
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GenAI request failed (${res.status}): ${text.slice(0, 500)}`);
  }

  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = data.choices?.[0]?.message?.content?.trim();
  if (!content) throw new Error("GenAI provider returned empty content");
  return content;
}

async function runChatCompletionsText(config: StoredGenAiConfig, prompt: string): Promise<string> {
  const body = {
    model: config.model,
    temperature: config.temperature,
    messages: [
      { role: "system", content: config.systemPrompt || DEFAULT_SYSTEM_PROMPT },
      { role: "user", content: prompt },
    ],
  };

  const res = await fetch(config.baseUrl, {
    method: "POST",
    headers: getAuthHeaders(config),
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GenAI request failed (${res.status}): ${text.slice(0, 500)}`);
  }

  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = data.choices?.[0]?.message?.content?.trim();
  if (!content) throw new Error("GenAI provider returned empty content");
  return content;
}

async function runAnthropicMessages(config: StoredGenAiConfig, prompt: string): Promise<string> {
  const body = {
    model: config.model,
    max_tokens: 1200,
    temperature: config.temperature,
    system: config.systemPrompt || DEFAULT_SYSTEM_PROMPT,
    messages: [{ role: "user", content: prompt }],
  };

  const res = await fetch(config.baseUrl, {
    method: "POST",
    headers: getAuthHeaders(config),
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GenAI request failed (${res.status}): ${text.slice(0, 500)}`);
  }

  const data = (await res.json()) as {
    content?: Array<{ type: string; text?: string }>;
  };
  const textBlock = data.content?.find((c) => c.type === "text")?.text?.trim();
  if (!textBlock) throw new Error("GenAI provider returned empty content");
  return textBlock;
}

function parseConfigJson(raw: string): PlayStoreConfig {
  let cleaned = raw.trim();
  if (cleaned.startsWith("```") && cleaned.endsWith("```")) {
    cleaned = cleaned.replace(/^```[a-zA-Z]*\s*/, "").replace(/```$/, "").trim();
  }

  const parsed = JSON.parse(cleaned) as Partial<PlayStoreConfig>;
  if (!parsed.appTitle || !parsed.shortDescription || !parsed.fullDescription || !parsed.category) {
    throw new Error("Generated JSON missing required fields");
  }

  return {
    packageName: parsed.packageName || "",
    appTitle: parsed.appTitle,
    shortDescription: parsed.shortDescription,
    fullDescription: parsed.fullDescription,
    category: parsed.category,
    contactEmail: parsed.contactEmail || "",
    contactPhone: parsed.contactPhone || "",
    contactWebsite: parsed.contactWebsite || "",
    privacyPolicyUrl: parsed.privacyPolicyUrl || "",
    defaultLanguage: parsed.defaultLanguage || "en-US",
    isFree: parsed.isFree ?? true,
    containsAds: parsed.containsAds ?? false,
    targetAudience: parsed.targetAudience || "everyone",
  };
}

export async function generatePlayStoreDraft(
  analysis: AppAnalysis,
  existingConfig: PlayStoreConfig | null,
  userPrompt: string
): Promise<GenAiDraft> {
  const stored = readStoredConfig();
  if (!stored.enabled) {
    throw new Error("GenAI is disabled. Enable it in Settings > Tool Health & Diagnostics.");
  }
  if (!stored.apiKey) {
    throw new Error("No API key configured for GenAI provider.");
  }
  if (!stored.baseUrl || !stored.model) {
    throw new Error("GenAI provider configuration is incomplete.");
  }

  const prompt = buildUserPrompt(analysis, existingConfig, userPrompt);
  const outputJson =
    stored.provider === "anthropic"
      ? await runAnthropicMessages(stored, prompt)
      : await runChatCompletions(stored, prompt);

  const config = parseConfigJson(outputJson);

  return {
    provider: stored.provider,
    model: stored.model,
    systemPrompt: stored.systemPrompt,
    userPrompt,
    outputJson,
    config,
  };
}

function buildReviewPrompt(inputText: string, instruction: string): string {
  const safeInstruction = instruction.trim() || "Polish this copy for clarity and natural tone.";
  return [
    "Task: rewrite the given text according to the instruction.",
    "Style constraints:",
    "- Never use em dash punctuation.",
    "- Use plain hyphen when needed.",
    "- Avoid AI-generated sounding phrases.",
    "- Keep tone natural and human.",
    "- Preserve factual meaning unless instruction says otherwise.",
    "Return plain text only.",
    "Instruction:",
    safeInstruction,
    "Input text:",
    inputText,
  ].join("\n");
}

export async function reviewTextWithGenAi(
  inputText: string,
  instruction: string
): Promise<GenAiTextReview> {
  const stored = readStoredConfig();
  if (!stored.enabled) {
    throw new Error("GenAI is disabled. Enable it in Settings > GenAI Providers.");
  }
  if (!stored.apiKey) {
    throw new Error("No API key configured for GenAI provider.");
  }
  if (!stored.baseUrl || !stored.model) {
    throw new Error("GenAI provider configuration is incomplete.");
  }

  const trimmedInput = trimTo(inputText, INPUT_TEXT_MAX_LEN);
  if (!trimmedInput) {
    throw new Error("Input text is required.");
  }

  const safeInstruction = trimTo(instruction, INSTRUCTION_MAX_LEN);
  const prompt = buildReviewPrompt(trimmedInput, safeInstruction);
  const rawOutput =
    stored.provider === "anthropic"
      ? await runAnthropicMessages(stored, prompt)
      : await runChatCompletionsText(stored, prompt);

  const outputText = rawOutput.trim().replace(/^```[a-zA-Z]*\s*/, "").replace(/```$/, "").trim();

  return {
    provider: stored.provider,
    model: stored.model,
    instruction: safeInstruction,
    inputText: trimmedInput,
    outputText,
    rawOutput,
  };
}
