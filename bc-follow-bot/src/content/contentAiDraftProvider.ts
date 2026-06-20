import type { AppSettings } from "../shared/types";
import type { ContentDraftSourceRecord } from "./types";

export interface ContentAiDraftPrompt {
  system: string;
  user: string;
}

export interface ContentAiDraftProviderRequest {
  source: ContentDraftSourceRecord;
  draftLanguage: string;
  prompt: ContentAiDraftPrompt;
  config: Pick<
    AppSettings,
    "aiDraftModel" | "maxContentDraftTextLength" | "maxContentDraftTitleLength"
  >;
}

export interface GeneratedContentAiDraft {
  draft_title: string;
  draft_text: string;
  draft_topic: string;
  draft_reason: string;
}

export interface ContentAiDraftProvider {
  generateDraft(request: ContentAiDraftProviderRequest): Promise<GeneratedContentAiDraft>;
}

interface OpenAiCompatibleProviderOptions {
  apiKey: string;
  baseUrl: string;
  model: string;
}

type Environment = Record<string, string | undefined>;

const DEFAULT_OPENAI_COMPATIBLE_BASE_URL = "https://api.openai.com/v1";
const API_KEY_ENV_NAMES = ["CONTENT_AI_DRAFT_API_KEY", "OPENAI_API_KEY"] as const;
const BASE_URL_ENV_NAMES = ["CONTENT_AI_DRAFT_BASE_URL", "OPENAI_BASE_URL"] as const;

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.trim().replace(/\/+$/, "");
}

function resolveFirstEnvValue(env: Environment, names: readonly string[]): string {
  for (const name of names) {
    const value = env[name]?.trim();
    if (value) {
      return value;
    }
  }

  return "";
}

function parseDraftJson(content: string): GeneratedContentAiDraft {
  const trimmed = content.trim()
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/, "")
    .trim();
  const parsed = JSON.parse(trimmed) as Partial<GeneratedContentAiDraft>;

  for (const field of ["draft_title", "draft_text", "draft_topic", "draft_reason"] as const) {
    if (typeof parsed[field] !== "string") {
      throw new Error(`AI draft response is missing string field '${field}'.`);
    }
  }

  return {
    draft_title: parsed.draft_title as string,
    draft_text: parsed.draft_text as string,
    draft_topic: parsed.draft_topic as string,
    draft_reason: parsed.draft_reason as string
  };
}

function languageName(language: string): string {
  const names: Record<string, string> = {
    pl: "Polish",
    en: "English",
    fr: "French",
    de: "German",
    es: "Spanish",
    it: "Italian"
  };

  return names[language] ?? language;
}

function optionalValue(value: string): string {
  return value.trim().length > 0 ? value.trim() : "not provided";
}

export function buildContentAiDraftPrompt(
  source: ContentDraftSourceRecord,
  draftLanguage: string,
  config: Pick<AppSettings, "maxContentDraftTextLength" | "maxContentDraftTitleLength">
): ContentAiDraftPrompt {
  return {
    system: [
      "You write safe, concise draft posts for a professional business/social portal.",
      "Write as the profile/person/company, not as a bot or assistant.",
      "Use only the provided bio, industry, post goal, country and topic hint.",
      "Do not invent hard facts about the person or company.",
      "Do not claim personal experience unless it is present in the source data.",
      "Avoid first-person claims such as I/we unless the source data clearly supports that speaker.",
      "Avoid spammy tone, unrealistic promises and unnecessary hashtags.",
      "Do not provide financial, medical or legal advice.",
      "Keep the content suitable for a professional portal.",
      "Keep the draft title practical, specific and not clickbait; prefer a concise title over a long SEO phrase.",
      "The output language must exactly match the required language.",
      "Return JSON only with keys: draft_title, draft_text, draft_topic, draft_reason."
    ].join("\n"),
    user: [
      `Required language: ${languageName(draftLanguage)} (${draftLanguage})`,
      `Source language code: ${source.language}`,
      `Profile name: ${source.profile_name}`,
      `Country: ${source.country}`,
      `Industry: ${source.industry}`,
      `Bio: ${source.bio}`,
      `Post goal: ${source.post_goal}`,
      `Topic hint: ${optionalValue(source.topic_hint)}`,
      `Tone: ${optionalValue(source.tone)}`,
      `Target type: ${source.target_type}`,
      `Target value: ${source.target_value}`,
      `Max title length: ${config.maxContentDraftTitleLength} characters`,
      `Max post text length: ${config.maxContentDraftTextLength} characters`,
      "Write a natural post in one or two short paragraphs and optionally end with one thoughtful discussion question."
    ].join("\n")
  };
}

export class OpenAiCompatibleDraftProvider implements ContentAiDraftProvider {
  private readonly apiKey: string;

  private readonly baseUrl: string;

  private readonly model: string;

  constructor(options: OpenAiCompatibleProviderOptions) {
    this.apiKey = options.apiKey;
    this.baseUrl = normalizeBaseUrl(options.baseUrl);
    this.model = options.model;
  }

  async generateDraft(request: ContentAiDraftProviderRequest): Promise<GeneratedContentAiDraft> {
    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${this.apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: this.model,
        messages: [
          { role: "system", content: request.prompt.system },
          { role: "user", content: request.prompt.user }
        ],
        temperature: 0.7,
        response_format: { type: "json_object" }
      })
    });

    const responseText = await response.text();
    if (!response.ok) {
      throw new Error(
        `AI draft API request failed with HTTP ${response.status}: ${responseText.slice(0, 300)}`
      );
    }

    const parsed = JSON.parse(responseText) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = parsed.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error("AI draft API response did not include message content.");
    }

    return parseDraftJson(content);
  }
}

export function createOpenAiCompatibleDraftProvider(
  config: Pick<AppSettings, "aiDraftModel" | "aiDraftProvider">,
  env: Environment = process.env
): OpenAiCompatibleDraftProvider {
  if (config.aiDraftProvider !== "openai-compatible") {
    throw new Error(`Unsupported AI draft provider: ${config.aiDraftProvider}`);
  }

  const apiKey = resolveFirstEnvValue(env, API_KEY_ENV_NAMES);
  if (!apiKey) {
    throw new Error(
      "Missing AI draft API key. Set CONTENT_AI_DRAFT_API_KEY or OPENAI_API_KEY in local .env or environment."
    );
  }

  const baseUrl =
    resolveFirstEnvValue(env, BASE_URL_ENV_NAMES) || DEFAULT_OPENAI_COMPATIBLE_BASE_URL;

  return new OpenAiCompatibleDraftProvider({
    apiKey,
    baseUrl,
    model: config.aiDraftModel
  });
}
