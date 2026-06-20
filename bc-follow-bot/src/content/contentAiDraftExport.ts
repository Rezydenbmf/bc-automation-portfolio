import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { ContentAiDraftRow, ContentApprovalRow } from "./types";
import { escapeContentCsvValue, formatContentRunId } from "./contentDryRunExport";

export interface ContentAiDraftExportResult {
  runId: string;
  draftsFilePath: string;
  approvalFilePath: string;
}

const CONTENT_AI_DRAFTS_DIR = path.resolve(process.cwd(), "logs", "content-ai-drafts");
const CONTENT_APPROVALS_DIR = path.resolve(process.cwd(), "logs", "content-approvals");

const AI_DRAFT_HEADERS = [
  "content_action_id",
  "account_id",
  "target_type",
  "target_value",
  "content_type",
  "source_language",
  "draft_language",
  "profile_name",
  "country",
  "industry",
  "post_goal",
  "topic_hint",
  "draft_title",
  "draft_text",
  "draft_topic",
  "draft_reason",
  "generation_status",
  "generation_reason"
] as const;

const APPROVAL_HEADERS = [
  "content_action_id",
  "account_id",
  "target_type",
  "target_value",
  "content_type",
  "account_language",
  "action_language",
  "approval_status",
  "approved_text",
  "approved_title",
  "reviewer_note"
] as const;

function ensureDir(outputDir: string): void {
  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true });
  }
}

function writeCsv<Row extends object>(
  filePath: string,
  headers: readonly string[],
  rows: Row[]
): void {
  const lines = [
    headers.map(escapeContentCsvValue).join(","),
    ...rows.map((row) =>
      headers.map((header) =>
        escapeContentCsvValue(String((row as Record<string, string>)[header] ?? ""))
      ).join(",")
    )
  ];

  writeFileSync(filePath, `${lines.join("\n")}\n`, "utf-8");
}

export function exportContentAiDraftFiles(
  rows: ContentAiDraftRow[],
  approvalRows: ContentApprovalRow[],
  date = new Date(),
  draftsDir = CONTENT_AI_DRAFTS_DIR,
  approvalDir = CONTENT_APPROVALS_DIR
): ContentAiDraftExportResult {
  ensureDir(draftsDir);
  ensureDir(approvalDir);

  const runId = formatContentRunId(date);
  const draftsFilePath = path.join(draftsDir, `content-ai-drafts-${runId}.csv`);
  const approvalFilePath = path.join(approvalDir, `content-approval-ai-draft-${runId}.csv`);

  writeCsv(draftsFilePath, AI_DRAFT_HEADERS, rows);
  writeCsv(approvalFilePath, APPROVAL_HEADERS, approvalRows);

  return {
    runId,
    draftsFilePath,
    approvalFilePath
  };
}
