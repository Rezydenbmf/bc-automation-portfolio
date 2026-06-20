import { existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { readCsvRowsFromFile } from "../shared/csv";
import type { AppSettings } from "../shared/types";
import type {
  ContentActionType,
  ContentApprovalReviewResult,
  ContentApprovalReviewRow,
  ContentApprovalStatus,
  ContentTargetType
} from "./types";
import { escapeContentCsvValue, formatContentRunId } from "./contentDryRunExport";

const CONTENT_APPROVALS_DIR = path.resolve(process.cwd(), "logs", "content-approvals");
const CONTENT_APPROVAL_REVIEW_DIR = path.resolve(process.cwd(), "logs", "content-approval-review");
const APPROVAL_FILE_PATTERN = /^content-approval(?:-ai-draft)?-\d{8}-\d{6}\.csv$/;
const MAX_APPROVED_TEXT_LENGTH = 3000;
const DEFAULT_MAX_CONTENT_TITLE_LENGTH = 120;

const REQUIRED_APPROVAL_HEADERS = [
  "content_action_id",
  "account_id",
  "target_type",
  "target_value",
  "content_type",
  "approval_status",
  "approved_text",
  "reviewer_note"
] as const;

const REVIEW_HEADERS = [
  "content_action_id",
  "account_id",
  "target_type",
  "target_value",
  "content_type",
  "approval_status",
  "review_status",
  "approved_text",
  "approved_title",
  "reviewer_note",
  "validation_message"
] as const;

const ALLOWED_TARGET_TYPES = new Set<ContentTargetType>(["profile_url", "post_url", "manual"]);
const ALLOWED_CONTENT_TYPES = new Set<ContentActionType>(["comment", "post"]);
const ALLOWED_APPROVAL_STATUSES = new Set<ContentApprovalStatus>([
  "approved",
  "rejected",
  "needs_changes",
  "pending"
]);

type ApprovalCsvRow = Record<string, string>;
type ContentApprovalReviewConfig = Pick<AppSettings, "maxContentTitleLength">;

function readApprovalRows(filePath: string): ApprovalCsvRow[] {
  return readCsvRowsFromFile(filePath, {
    requiredHeaders: REQUIRED_APPROVAL_HEADERS,
    emptyMessage: "approval CSV is empty.",
    noDataMessage: "approval CSV has no data rows.",
    missingHeadersMessage: (missingHeaders) =>
      `approval CSV is missing headers: ${missingHeaders.join(", ")}.`
  });
}

function hasControlCharacters(value: string): boolean {
  return /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(value);
}

function validateRow(
  row: ApprovalCsvRow,
  config: ContentApprovalReviewConfig
): { status: ContentApprovalReviewRow["review_status"]; message: string } {
  const issues: string[] = [];
  const contentActionId = row.content_action_id?.trim() ?? "";
  const accountId = row.account_id?.trim() ?? "";
  const targetType = row.target_type?.trim() ?? "";
  const targetValue = row.target_value?.trim() ?? "";
  const contentType = row.content_type?.trim() ?? "";
  const approvalStatus = row.approval_status?.trim() ?? "";
  const approvedText = row.approved_text?.trim() ?? "";
  const approvedTitle = row.approved_title?.trim() ?? "";

  if (!contentActionId) {
    issues.push("content_action_id is required");
  }

  if (!accountId) {
    issues.push("account_id is required");
  }

  if (!targetType || !ALLOWED_TARGET_TYPES.has(targetType as ContentTargetType)) {
    issues.push("target_type must be profile_url, post_url, or manual");
  }

  if (!targetValue) {
    issues.push("target_value is required");
  }

  if (!contentType || !ALLOWED_CONTENT_TYPES.has(contentType as ContentActionType)) {
    issues.push("content_type must be comment or post");
  }

  if (!approvalStatus || !ALLOWED_APPROVAL_STATUSES.has(approvalStatus as ContentApprovalStatus)) {
    issues.push("approval_status must be approved, rejected, needs_changes, or pending");
  }

  if (approvedText.length > MAX_APPROVED_TEXT_LENGTH) {
    issues.push(`approved_text must be up to ${MAX_APPROVED_TEXT_LENGTH} characters`);
  }

  if (hasControlCharacters(approvedText)) {
    issues.push("approved_text contains control characters");
  }

  if (approvedTitle.length > config.maxContentTitleLength) {
    issues.push(`approved_title must be up to ${config.maxContentTitleLength} characters`);
  }

  if (hasControlCharacters(approvedTitle)) {
    issues.push("approved_title contains control characters");
  }

  if (approvalStatus === "approved" && !approvedText) {
    issues.push("approved_text is required when approval_status is approved");
  }

  if (issues.length > 0) {
    return {
      status: "content_invalid_approval",
      message: issues.join("; ")
    };
  }

  if (approvalStatus === "approved") {
    return {
      status: "content_approved_ready",
      message: "approved content is valid and ready for a future publishing step"
    };
  }

  if (approvalStatus === "rejected") {
    return {
      status: "content_rejected",
      message: "rejected content is not ready for publishing"
    };
  }

  if (approvalStatus === "needs_changes") {
    return {
      status: "content_needs_changes",
      message: "content needs changes and is not ready for publishing"
    };
  }

  return {
    status: "content_pending_approval",
    message: "content is pending approval and is not ready for publishing"
  };
}

function buildReviewRow(
  row: ApprovalCsvRow,
  config: ContentApprovalReviewConfig
): ContentApprovalReviewRow {
  const validation = validateRow(row, config);

  return {
    content_action_id: row.content_action_id?.trim() ?? "",
    account_id: row.account_id?.trim() ?? "",
    target_type: row.target_type?.trim() ?? "",
    target_value: row.target_value?.trim() ?? "",
    content_type: row.content_type?.trim() ?? "",
    approval_status: row.approval_status?.trim() ?? "",
    review_status: validation.status,
    approved_text: row.approved_text?.trim() ?? "",
    approved_title: row.approved_title?.trim() ?? "",
    reviewer_note: row.reviewer_note?.trim() ?? "",
    validation_message: validation.message
  };
}

function ensureDir(outputDir: string): void {
  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true });
  }
}

function writeReviewCsv(filePath: string, rows: ContentApprovalReviewRow[]): void {
  const lines = [
    REVIEW_HEADERS.map(escapeContentCsvValue).join(","),
    ...rows.map((row) =>
      REVIEW_HEADERS.map((header) => escapeContentCsvValue(String(row[header] ?? ""))).join(",")
    )
  ];

  writeFileSync(filePath, `${lines.join("\n")}\n`, "utf-8");
}

export function findLatestContentApprovalFile(approvalDir = CONTENT_APPROVALS_DIR): string {
  if (!existsSync(approvalDir)) {
    throw new Error(`approval directory does not exist: ${approvalDir}`);
  }

  const files = readdirSync(approvalDir)
    .filter((fileName) => APPROVAL_FILE_PATTERN.test(fileName))
    .map((fileName) => ({
      fileName,
      filePath: path.join(approvalDir, fileName),
      mtimeMs: statSync(path.join(approvalDir, fileName)).mtimeMs
    }))
    .sort((left, right) => right.mtimeMs - left.mtimeMs || right.fileName.localeCompare(left.fileName));

  if (files.length === 0) {
    throw new Error(`no content approval CSV files found in: ${approvalDir}`);
  }

  return files[0].filePath;
}

export function reviewContentApprovalFile(
  filePath: string,
  config: ContentApprovalReviewConfig = { maxContentTitleLength: DEFAULT_MAX_CONTENT_TITLE_LENGTH }
): ContentApprovalReviewResult {
  const rows = readApprovalRows(filePath).map((row) => buildReviewRow(row, config));

  return {
    rows,
    summary: {
      readCount: rows.length,
      approvedReadyCount: rows.filter((row) => row.review_status === "content_approved_ready").length,
      rejectedCount: rows.filter((row) => row.review_status === "content_rejected").length,
      needsChangesCount: rows.filter((row) => row.review_status === "content_needs_changes").length,
      pendingCount: rows.filter((row) => row.review_status === "content_pending_approval").length,
      invalidCount: rows.filter((row) => row.review_status === "content_invalid_approval").length
    }
  };
}

export function exportContentApprovalReview(
  rows: ContentApprovalReviewRow[],
  date = new Date(),
  outputDir = CONTENT_APPROVAL_REVIEW_DIR
): string {
  ensureDir(outputDir);

  const runId = formatContentRunId(date);
  const filePath = path.join(outputDir, `content-approval-review-${runId}.csv`);
  writeReviewCsv(filePath, rows);

  return filePath;
}
