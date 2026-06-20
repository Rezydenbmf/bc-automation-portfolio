import type { AppSettings } from "../shared/types";
import {
  buildContentAiDraftPrompt,
  ContentAiDraftProvider,
  GeneratedContentAiDraft
} from "./contentAiDraftProvider";
import type {
  ContentAiDraftGenerationResult,
  ContentAiDraftGenerationStatus,
  ContentAiDraftRow,
  ContentApprovalRow,
  ContentDraftSourceRecord,
  LoadedContentDraftSources,
  RawContentDraftSourceRecord
} from "./types";

interface RunContentAiDraftGenerationOptions {
  loadedSources: LoadedContentDraftSources;
  config: Pick<
    AppSettings,
    | "maxContentAiDraftsPerRun"
    | "maxContentDraftTextLength"
    | "maxContentDraftTitleLength"
    | "aiDraftModel"
  >;
  provider: ContentAiDraftProvider;
}

const REVIEWER_NOTE = "AI draft - human review required";

function normalizeDraftLanguage(language: string): string {
  const normalized = language.trim().toLowerCase();

  if (normalized === "gb" || normalized === "us" || normalized === "uk") {
    return "en";
  }

  return normalized;
}

function isUnknownLanguage(language: string): boolean {
  const normalized = language.trim().toLowerCase();
  return normalized.length === 0 || normalized === "unknown";
}

function truncateText(value: string, maxLength: number): { value: string; truncated: boolean } {
  const trimmed = value.trim();

  if (trimmed.length <= maxLength) {
    return { value: trimmed, truncated: false };
  }

  return {
    value: trimmed.slice(0, maxLength).trimEnd(),
    truncated: true
  };
}

function buildRawRow(
  raw: RawContentDraftSourceRecord,
  status: ContentAiDraftGenerationStatus,
  reason: string
): ContentAiDraftRow {
  const sourceLanguage = raw.language?.trim().toLowerCase() ?? "";

  return {
    content_action_id: raw.content_action_id?.trim() ?? "",
    account_id: raw.account_id?.trim() ?? "",
    target_type: raw.target_type?.trim() ?? "",
    target_value: raw.target_value?.trim() ?? "",
    content_type: raw.content_type?.trim() ?? "",
    source_language: sourceLanguage,
    draft_language: isUnknownLanguage(sourceLanguage) ? "" : normalizeDraftLanguage(sourceLanguage),
    profile_name: raw.profile_name?.trim() ?? "",
    country: raw.country?.trim() ?? "",
    industry: raw.industry?.trim() ?? "",
    post_goal: raw.post_goal?.trim() ?? "",
    topic_hint: raw.topic_hint?.trim() ?? "",
    draft_title: "",
    draft_text: "",
    draft_topic: "",
    draft_reason: "",
    generation_status: status,
    generation_reason: reason
  };
}

function buildSourceRow(
  source: ContentDraftSourceRecord,
  status: ContentAiDraftGenerationStatus,
  reason: string,
  draft?: GeneratedContentAiDraft
): ContentAiDraftRow {
  const draftLanguage = isUnknownLanguage(source.language) ? "" : normalizeDraftLanguage(source.language);

  return {
    content_action_id: source.content_action_id,
    account_id: source.account_id,
    target_type: source.target_type,
    target_value: source.target_value,
    content_type: source.content_type,
    source_language: source.language,
    draft_language: draftLanguage,
    profile_name: source.profile_name,
    country: source.country,
    industry: source.industry,
    post_goal: source.post_goal,
    topic_hint: source.topic_hint,
    draft_title: draft?.draft_title ?? "",
    draft_text: draft?.draft_text ?? "",
    draft_topic: draft?.draft_topic ?? "",
    draft_reason: draft?.draft_reason ?? "",
    generation_status: status,
    generation_reason: reason
  };
}

function buildApprovalRow(row: ContentAiDraftRow): ContentApprovalRow {
  return {
    content_action_id: row.content_action_id,
    account_id: row.account_id,
    target_type: row.target_type,
    target_value: row.target_value,
    content_type: row.content_type,
    account_language: row.draft_language,
    action_language: row.draft_language,
    approval_status: "pending",
    approved_text: row.draft_text,
    approved_title: row.draft_title,
    reviewer_note: REVIEWER_NOTE
  };
}

function generationReason(base: string, titleTruncated: boolean, textTruncated: boolean): string {
  const notes = [base];

  if (titleTruncated) {
    notes.push("draft title truncated to configured limit");
  }

  if (textTruncated) {
    notes.push("draft text truncated to configured limit");
  }

  return notes.join("; ");
}

function countRowsByStatus(
  rows: ContentAiDraftRow[],
  statuses: ContentAiDraftGenerationStatus[]
): number {
  return rows.filter((row) => statuses.includes(row.generation_status)).length;
}

export function getContentAiDraftReviewerNote(): string {
  return REVIEWER_NOTE;
}

export async function runContentAiDraftGeneration(
  options: RunContentAiDraftGenerationOptions
): Promise<ContentAiDraftGenerationResult> {
  const rows: ContentAiDraftRow[] = [];
  const approvalRows: ContentApprovalRow[] = [];
  let providerCallsCount = 0;

  for (const disabled of options.loadedSources.disabled) {
    rows.push(buildRawRow(
      disabled.raw,
      "content_ai_draft_skipped_disabled",
      "content draft source is disabled"
    ));
  }

  for (const rejected of options.loadedSources.rejected) {
    rows.push(buildRawRow(
      rejected.raw,
      "content_ai_draft_invalid_source",
      rejected.issues.map((issue) => `${issue.field}: ${issue.code}`).join("; ")
    ));
  }

  for (const source of options.loadedSources.valid) {
    if (source.content_type !== "post") {
      rows.push(buildSourceRow(
        source,
        "content_ai_draft_skipped_unsupported_content_type",
        "MVP AI draft generation supports content_type=post only"
      ));
      continue;
    }

    if (isUnknownLanguage(source.language)) {
      rows.push(buildSourceRow(
        source,
        "content_ai_draft_skipped_unknown_language",
        "source language is unknown"
      ));
      continue;
    }

    if (providerCallsCount >= options.config.maxContentAiDraftsPerRun) {
      rows.push(buildSourceRow(
        source,
        "content_ai_draft_skipped_limit_reached",
        "maxContentAiDraftsPerRun limit reached"
      ));
      continue;
    }

    const draftLanguage = normalizeDraftLanguage(source.language);
    const prompt = buildContentAiDraftPrompt(source, draftLanguage, options.config);
    providerCallsCount += 1;

    try {
      const generated = await options.provider.generateDraft({
        source,
        draftLanguage,
        prompt,
        config: options.config
      });
      const title = truncateText(generated.draft_title, options.config.maxContentDraftTitleLength);
      const text = truncateText(generated.draft_text, options.config.maxContentDraftTextLength);
      const row = buildSourceRow(
        source,
        "content_ai_draft_generated",
        generationReason("AI draft generated and still requires human approval", title.truncated, text.truncated),
        {
          draft_title: title.value,
          draft_text: text.value,
          draft_topic: generated.draft_topic.trim(),
          draft_reason: generated.draft_reason.trim()
        }
      );

      rows.push(row);
      approvalRows.push(buildApprovalRow(row));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      rows.push(buildSourceRow(
        source,
        "content_ai_draft_failed",
        message
      ));
    }
  }

  const generatedCount = countRowsByStatus(rows, ["content_ai_draft_generated"]);
  const failedCount = countRowsByStatus(rows, ["content_ai_draft_failed"]);

  return {
    rows,
    approvalRows,
    summary: {
      loadedCount:
        options.loadedSources.valid.length +
        options.loadedSources.disabled.length +
        options.loadedSources.rejected.length,
      generatedCount,
      skippedCount: rows.length - generatedCount - failedCount,
      failedCount,
      approvalRowsCount: approvalRows.length,
      providerCallsCount
    }
  };
}
