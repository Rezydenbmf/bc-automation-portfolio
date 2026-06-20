import { existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { readCsvRowsFromFile } from "../shared/csv";
import type { AppSettings } from "../shared/types";
import type {
  ContentActionType,
  ContentPublishPlanResult,
  ContentPublishPlanRow,
  ContentPublishPlanStatus,
  ContentTargetType
} from "./types";
import { escapeContentCsvValue, formatContentRunId } from "./contentDryRunExport";

const CONTENT_APPROVAL_REVIEW_DIR = path.resolve(process.cwd(), "logs", "content-approval-review");
const CONTENT_PUBLISH_PLAN_DIR = path.resolve(process.cwd(), "logs", "content-publish-plan");
const APPROVAL_REVIEW_FILE_PATTERN = /^content-approval-review-\d{8}-\d{6}\.csv$/;

const REQUIRED_REVIEW_HEADERS = [
  "content_action_id",
  "account_id",
  "target_type",
  "target_value",
  "content_type",
  "review_status",
  "approved_text"
] as const;

const PUBLISH_PLAN_HEADERS = [
  "content_action_id",
  "account_id",
  "target_type",
  "target_value",
  "content_type",
  "approved_text",
  "approved_title",
  "publish_plan_status",
  "reason"
] as const;

const ALLOWED_TARGET_TYPES = new Set<ContentTargetType>(["profile_url", "post_url", "manual"]);
const ALLOWED_CONTENT_TYPES = new Set<ContentActionType>(["comment", "post"]);

type ReviewCsvRow = Record<string, string>;

interface RunContentPublishPlanOptions {
  reviewRows: ReviewCsvRow[];
  config: Pick<
    AppSettings,
    "maxContentPublishesPerRun" | "maxContentPublishesPerAccount" | "maxContentTitleLength"
  >;
}

function readReviewRows(filePath: string): ReviewCsvRow[] {
  return readCsvRowsFromFile(filePath, {
    requiredHeaders: REQUIRED_REVIEW_HEADERS,
    emptyMessage: "content approval review CSV is empty.",
    noDataMessage: "content approval review CSV has no data rows.",
    missingHeadersMessage: (missingHeaders) =>
      `content approval review CSV is missing headers: ${missingHeaders.join(", ")}.`
  });
}

function ensureDir(outputDir: string): void {
  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true });
  }
}

function validateReviewRow(
  row: ReviewCsvRow,
  config: RunContentPublishPlanOptions["config"]
): string[] {
  const issues: string[] = [];
  const contentActionId = row.content_action_id?.trim() ?? "";
  const accountId = row.account_id?.trim() ?? "";
  const targetType = row.target_type?.trim() ?? "";
  const targetValue = row.target_value?.trim() ?? "";
  const contentType = row.content_type?.trim() ?? "";
  const reviewStatus = row.review_status?.trim() ?? "";
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
  } else if (targetType === "manual") {
    issues.push("target_type manual is draft-only; use profile_url with a full profile URL for publish flow");
  }

  if (!targetValue) {
    issues.push("target_value is required");
  }

  if (!contentType || !ALLOWED_CONTENT_TYPES.has(contentType as ContentActionType)) {
    issues.push("content_type must be comment or post");
  } else if (contentType === "post" && targetType === "post_url") {
    issues.push("content_type post requires target_type=profile_url for publish flow");
  }

  if (!reviewStatus) {
    issues.push("review_status is required");
  }

  if (reviewStatus === "content_approved_ready" && !approvedText) {
    issues.push("approved_text is required when review_status is content_approved_ready");
  }

  if (approvedTitle.length > config.maxContentTitleLength) {
    issues.push(`approved_title must be up to ${config.maxContentTitleLength} characters`);
  }

  return issues;
}

function buildPublishPlanRow(
  row: ReviewCsvRow,
  publishPlanStatus: ContentPublishPlanStatus,
  reason: string
): ContentPublishPlanRow {
  return {
    content_action_id: row.content_action_id?.trim() ?? "",
    account_id: row.account_id?.trim() ?? "",
    target_type: row.target_type?.trim() ?? "",
    target_value: row.target_value?.trim() ?? "",
    content_type: row.content_type?.trim() ?? "",
    approved_text: row.approved_text?.trim() ?? "",
    approved_title: row.approved_title?.trim() ?? "",
    publish_plan_status: publishPlanStatus,
    reason
  };
}

function countByStatus(
  rows: ContentPublishPlanRow[],
  status: ContentPublishPlanStatus
): number {
  return rows.filter((row) => row.publish_plan_status === status).length;
}

export function countApprovedReadyReviewRows(reviewRows: ReviewCsvRow[]): number {
  return reviewRows.filter((row) => {
    const targetType = row.target_type?.trim() ?? "";
    const contentType = row.content_type?.trim() ?? "";

    return row.review_status?.trim() === "content_approved_ready" &&
      targetType !== "manual" &&
      !(contentType === "post" && targetType === "post_url");
  }).length;
}

export function runContentPublishPlan(
  options: RunContentPublishPlanOptions
): ContentPublishPlanResult {
  const rows: ContentPublishPlanRow[] = [];
  const plannedPerAccount = new Map<string, number>();
  let plannedForRun = 0;

  for (const reviewRow of options.reviewRows) {
    const issues = validateReviewRow(reviewRow, options.config);
    if (issues.length > 0) {
      rows.push(buildPublishPlanRow(
        reviewRow,
        "content_publish_invalid_record",
        issues.join("; ")
      ));
      continue;
    }

    if (reviewRow.review_status.trim() !== "content_approved_ready") {
      rows.push(buildPublishPlanRow(
        reviewRow,
        "content_publish_skipped_not_approved",
        "review_status is not content_approved_ready"
      ));
      continue;
    }

    const accountId = reviewRow.account_id.trim();
    const accountPlannedCount = plannedPerAccount.get(accountId) ?? 0;

    if (
      plannedForRun >= options.config.maxContentPublishesPerRun ||
      accountPlannedCount >= options.config.maxContentPublishesPerAccount
    ) {
      rows.push(buildPublishPlanRow(
        reviewRow,
        "content_publish_skipped_limit_reached",
        "content publish limit reached"
      ));
      continue;
    }

    plannedForRun += 1;
    plannedPerAccount.set(accountId, accountPlannedCount + 1);
    rows.push(buildPublishPlanRow(
      reviewRow,
      "content_publish_planned",
      "approved content added to publish plan"
    ));
  }

  return {
    rows,
    summary: {
      readCount: options.reviewRows.length,
      approvedReadyCount: countApprovedReadyReviewRows(options.reviewRows),
      plannedCount: countByStatus(rows, "content_publish_planned"),
      skippedNotApprovedCount: countByStatus(rows, "content_publish_skipped_not_approved"),
      skippedLimitReachedCount: countByStatus(rows, "content_publish_skipped_limit_reached"),
      invalidCount: countByStatus(rows, "content_publish_invalid_record")
    }
  };
}

function writePublishPlanCsv(filePath: string, rows: ContentPublishPlanRow[]): void {
  const lines = [
    PUBLISH_PLAN_HEADERS.map(escapeContentCsvValue).join(","),
    ...rows.map((row) =>
      PUBLISH_PLAN_HEADERS.map((header) => escapeContentCsvValue(String(row[header] ?? ""))).join(",")
    )
  ];

  writeFileSync(filePath, `${lines.join("\n")}\n`, "utf-8");
}

export function findLatestContentApprovalReviewFile(
  approvalReviewDir = CONTENT_APPROVAL_REVIEW_DIR
): string {
  if (!existsSync(approvalReviewDir)) {
    throw new Error(`content approval review directory does not exist: ${approvalReviewDir}`);
  }

  const files = readdirSync(approvalReviewDir)
    .filter((fileName) => APPROVAL_REVIEW_FILE_PATTERN.test(fileName))
    .map((fileName) => ({
      fileName,
      filePath: path.join(approvalReviewDir, fileName),
      mtimeMs: statSync(path.join(approvalReviewDir, fileName)).mtimeMs
    }))
    .sort((left, right) => right.mtimeMs - left.mtimeMs || right.fileName.localeCompare(left.fileName));

  if (files.length === 0) {
    throw new Error(`no content approval review CSV files found in: ${approvalReviewDir}`);
  }

  return files[0].filePath;
}

export function readContentApprovalReviewFile(filePath: string): ReviewCsvRow[] {
  return readReviewRows(filePath);
}

export function planContentPublishFile(
  filePath: string,
  config: RunContentPublishPlanOptions["config"]
): ContentPublishPlanResult {
  return runContentPublishPlan({
    reviewRows: readReviewRows(filePath),
    config
  });
}

export function exportContentPublishPlan(
  rows: ContentPublishPlanRow[],
  date = new Date(),
  outputDir = CONTENT_PUBLISH_PLAN_DIR
): string {
  ensureDir(outputDir);

  const runId = formatContentRunId(date);
  const filePath = path.join(outputDir, `content-publish-plan-${runId}.csv`);
  writePublishPlanCsv(filePath, rows);

  return filePath;
}
