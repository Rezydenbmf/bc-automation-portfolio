import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type {
  ContentRunAuditRecommendation,
  ContentRunAuditReviewResult,
  ContentRunAuditReviewRow,
  ContentRunAuditRiskLevel,
  ContentRunAuditStatus
} from "./types";
import { escapeContentCsvValue, formatContentRunId } from "./contentDryRunExport";

const DEFAULT_CONTENT_RUN_AUDIT_FILE = path.resolve(process.cwd(), "data", "content-run-audit.csv");
const CONTENT_RUN_AUDIT_REVIEW_DIR = path.resolve(process.cwd(), "logs", "content-run-audit-review");

const AUDIT_HEADERS = [
  "run_id",
  "run_date",
  "command",
  "operator_note",
  "source_publish_plan_file",
  "records_planned",
  "records_attempted",
  "publish_success",
  "publish_failed",
  "publish_unknown_result",
  "account_id",
  "account_language",
  "target_country",
  "expected_language",
  "language_checked",
  "language_match",
  "title_checked",
  "title_present",
  "portal_verified_manually",
  "post_visible_after_publish",
  "post_removed_after_test",
  "stop_condition_hit",
  "stop_condition_reason",
  "result_file",
  "safe_to_consider_scale",
  "reviewer_note"
] as const;

const REQUIRED_VALUE_FIELDS = [
  "run_id",
  "run_date",
  "command",
  "source_publish_plan_file",
  "account_id",
  "account_language",
  "target_country",
  "expected_language",
  "result_file"
] as const;

const NUMERIC_FIELDS = [
  "records_planned",
  "records_attempted",
  "publish_success",
  "publish_failed",
  "publish_unknown_result"
] as const;

const BOOLEAN_FIELDS = [
  "language_checked",
  "language_match",
  "title_checked",
  "title_present",
  "portal_verified_manually",
  "post_visible_after_publish",
  "post_removed_after_test",
  "stop_condition_hit",
  "safe_to_consider_scale"
] as const;

const SAMPLE_ROW_RUN_ID_PREFIXES = ["sample", "audit-sample", "demo", "example"] as const;
const SAMPLE_ROW_NOTE_MARKER = /\b(sample|demo|example)\b/i;

const REVIEW_HEADERS = [
  "run_id",
  "audit_status",
  "risk_level",
  "reason",
  "recommendation"
] as const;

type AuditCsvRow = Record<string, string>;
type NumericField = typeof NUMERIC_FIELDS[number];
type BooleanField = typeof BOOLEAN_FIELDS[number];

interface AuditInputResolution {
  status: "found" | "missing_default";
  filePath: string;
  message?: string;
}

interface ParsedAuditValues {
  numbers: Record<NumericField, number>;
  booleans: Record<BooleanField, boolean>;
}

function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;
  let fieldWasQuoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    const nextCharacter = line[index + 1];

    if (character === '"' && inQuotes && nextCharacter === '"') {
      current += '"';
      index += 1;
      continue;
    }

    if (character === '"') {
      inQuotes = !inQuotes;
      fieldWasQuoted = true;
      continue;
    }

    if (character === "," && !inQuotes) {
      fields.push(fieldWasQuoted ? current : current.trim());
      current = "";
      fieldWasQuoted = false;
      continue;
    }

    current += character;
  }

  fields.push(fieldWasQuoted ? current : current.trim());
  return fields;
}

function readAuditRows(filePath: string): AuditCsvRow[] {
  const raw = readFileSync(filePath, "utf-8").replace(/^\uFEFF/, "");
  const lines = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (lines.length === 0) {
    throw new Error("content run audit CSV is empty.");
  }

  if (lines.length < 2) {
    throw new Error("content run audit CSV has no data rows.");
  }

  const headers = parseCsvLine(lines[0]);
  const missingHeaders = AUDIT_HEADERS.filter((header) => !headers.includes(header));
  if (missingHeaders.length > 0) {
    throw new Error(`content run audit CSV is missing headers: ${missingHeaders.join(", ")}.`);
  }

  return lines.slice(1).map((line) => {
    const values = parseCsvLine(line);
    const row: AuditCsvRow = {};

    headers.forEach((header, index) => {
      row[header] = values[index] ?? "";
    });

    return row;
  });
}

function ensureDir(outputDir: string): void {
  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true });
  }
}

function parseNonNegativeInteger(
  row: AuditCsvRow,
  field: NumericField,
  issues: string[]
): number {
  const value = row[field]?.trim() ?? "";

  if (!/^\d+$/.test(value)) {
    issues.push(`${field} must be a non-negative integer`);
    return 0;
  }

  return Number(value);
}

function parseBoolean(row: AuditCsvRow, field: BooleanField, issues: string[]): boolean {
  const value = row[field]?.trim().toLowerCase() ?? "";

  if (value === "true") {
    return true;
  }

  if (value === "false") {
    return false;
  }

  issues.push(`${field} must be true or false`);
  return false;
}

function validateRequiredValues(row: AuditCsvRow, issues: string[]): void {
  for (const field of REQUIRED_VALUE_FIELDS) {
    if (!row[field]?.trim()) {
      issues.push(`${field} is required`);
    }
  }
}

function parseAuditValues(row: AuditCsvRow, issues: string[]): ParsedAuditValues {
  const numbers = {} as Record<NumericField, number>;
  const booleans = {} as Record<BooleanField, boolean>;

  for (const field of NUMERIC_FIELDS) {
    numbers[field] = parseNonNegativeInteger(row, field, issues);
  }

  for (const field of BOOLEAN_FIELDS) {
    booleans[field] = parseBoolean(row, field, issues);
  }

  return { numbers, booleans };
}

function buildInvalidRow(row: AuditCsvRow, issues: string[]): ContentRunAuditReviewRow {
  return {
    run_id: row.run_id?.trim() ?? "",
    audit_status: "content_audit_invalid_record",
    risk_level: "high",
    reason: issues.join("; "),
    recommendation: "investigate_before_scaling"
  };
}

function detectSampleDemoExampleRow(row: AuditCsvRow): string[] {
  const reasons: string[] = [];
  const runId = row.run_id?.trim().toLowerCase() ?? "";

  const matchedPrefix = SAMPLE_ROW_RUN_ID_PREFIXES.find((prefix) => runId.startsWith(prefix));
  if (matchedPrefix) {
    reasons.push(`run_id starts with ${matchedPrefix}`);
  }

  for (const field of ["operator_note", "reviewer_note"] as const) {
    const value = row[field]?.trim() ?? "";
    const matchedMarker = value.match(SAMPLE_ROW_NOTE_MARKER)?.[1]?.toLowerCase();

    if (matchedMarker) {
      reasons.push(`${field} contains ${matchedMarker} marker`);
    }
  }

  return reasons;
}

function buildSampleDemoExampleRow(row: AuditCsvRow, reasons: string[]): ContentRunAuditReviewRow {
  return {
    run_id: row.run_id?.trim() ?? "",
    audit_status: "content_audit_sample_row_detected",
    risk_level: "high",
    reason: [
      "real_audit_log_must_contain_only_real_runs",
      "sample_or_demo_row_must_be_removed",
      "remove_sample_rows_from_real_audit_log",
      ...reasons
    ].join("; "),
    recommendation: "investigate_before_scaling"
  };
}

function pushRisk(
  risks: Array<{ status: ContentRunAuditStatus; riskLevel: ContentRunAuditRiskLevel; reason: string }>,
  status: ContentRunAuditStatus,
  riskLevel: ContentRunAuditRiskLevel,
  reason: string
): void {
  risks.push({ status, riskLevel, reason });
}

function buildRiskRow(
  row: AuditCsvRow,
  risks: Array<{ status: ContentRunAuditStatus; riskLevel: ContentRunAuditRiskLevel; reason: string }>
): ContentRunAuditReviewRow {
  const highRisk = risks.find((risk) => risk.riskLevel === "high");
  const primaryRisk = highRisk ?? risks[0];

  return {
    run_id: row.run_id?.trim() ?? "",
    audit_status: primaryRisk.status,
    risk_level: primaryRisk.riskLevel,
    reason: risks.map((risk) => risk.reason).join("; "),
    recommendation: "investigate_before_scaling"
  };
}

function buildAuditReviewRow(row: AuditCsvRow): ContentRunAuditReviewRow {
  const sampleRowReasons = detectSampleDemoExampleRow(row);
  if (sampleRowReasons.length > 0) {
    return buildSampleDemoExampleRow(row, sampleRowReasons);
  }

  const issues: string[] = [];
  validateRequiredValues(row, issues);
  const parsed = parseAuditValues(row, issues);

  if (parsed.booleans.stop_condition_hit && !row.stop_condition_reason?.trim()) {
    issues.push("stop_condition_reason is required when stop_condition_hit is true");
  }

  if (issues.length > 0) {
    return buildInvalidRow(row, issues);
  }

  const risks: Array<{ status: ContentRunAuditStatus; riskLevel: ContentRunAuditRiskLevel; reason: string }> = [];

  if (!parsed.booleans.portal_verified_manually) {
    pushRisk(
      risks,
      "content_audit_missing_manual_portal_verification",
      "high",
      "portal_verified_manually is false"
    );
  }

  if (!parsed.booleans.language_checked) {
    pushRisk(risks, "content_audit_language_not_checked", "high", "language_checked is false");
  }

  if (!parsed.booleans.language_match) {
    pushRisk(risks, "content_audit_language_mismatch", "high", "language_match is false");
  }

  if (parsed.numbers.publish_failed > 0) {
    pushRisk(risks, "content_audit_publish_failed", "high", "publish_failed is greater than 0");
  }

  if (parsed.numbers.publish_unknown_result > 0) {
    pushRisk(risks, "content_audit_unknown_result", "high", "publish_unknown_result is greater than 0");
  }

  if (parsed.booleans.stop_condition_hit) {
    pushRisk(risks, "content_audit_stop_condition_hit", "high", "stop_condition_hit is true");
  }

  if (parsed.numbers.records_attempted > 1) {
    pushRisk(
      risks,
      "content_audit_scale_not_ready",
      "warning",
      "records_attempted is greater than 1 at the current project stage"
    );
  }

  if (risks.length > 0 && parsed.booleans.safe_to_consider_scale) {
    pushRisk(
      risks,
      "content_audit_scale_not_ready",
      "high",
      "safe_to_consider_scale is true despite errors or risks"
    );
  }

  if (risks.length > 0) {
    return buildRiskRow(row, risks);
  }

  if (parsed.booleans.safe_to_consider_scale) {
    return {
      run_id: row.run_id.trim(),
      audit_status: "content_audit_scale_review_candidate",
      risk_level: "none",
      reason: "audit has no detected risks and was marked safe for a separate scale review",
      recommendation: "scale_review_candidate"
    };
  }

  return {
    run_id: row.run_id.trim(),
    audit_status: "content_audit_valid",
    risk_level: "none",
    reason: "audit has no detected risks; keep current manual limit",
    recommendation: "keep_manual_limit_1"
  };
}

function isProblem(row: ContentRunAuditReviewRow): boolean {
  return row.audit_status !== "content_audit_valid" &&
    row.audit_status !== "content_audit_scale_review_candidate";
}

function isSampleDemoExampleReviewRow(row: ContentRunAuditReviewRow): boolean {
  return row.audit_status === "content_audit_sample_row_detected";
}

function buildSummary(
  auditRows: AuditCsvRow[],
  reviewRows: ContentRunAuditReviewRow[]
): ContentRunAuditReviewResult["summary"] {
  let runCount = 0;
  let sampleRowsDetected = 0;
  let totalSuccesses = 0;
  let totalFailures = 0;
  let totalUnknownResults = 0;
  let runsWithManualPortalVerification = 0;
  let runsWithCorrectLanguage = 0;

  for (const [index, row] of auditRows.entries()) {
    const reviewRow = reviewRows[index];
    if (reviewRow && isSampleDemoExampleReviewRow(reviewRow)) {
      sampleRowsDetected += 1;
      continue;
    }

    runCount += 1;

    const issues: string[] = [];
    const parsed = parseAuditValues(row, issues);

    totalSuccesses += parsed.numbers.publish_success;
    totalFailures += parsed.numbers.publish_failed;
    totalUnknownResults += parsed.numbers.publish_unknown_result;

    if (issues.length === 0 && parsed.booleans.portal_verified_manually) {
      runsWithManualPortalVerification += 1;
    }

    if (
      issues.length === 0 &&
      parsed.booleans.language_checked &&
      parsed.booleans.language_match
    ) {
      runsWithCorrectLanguage += 1;
    }
  }

  const runsWithProblems = reviewRows.filter(isProblem).length;
  const allScaleCandidates = reviewRows.length > 0 &&
    reviewRows.every((row) => row.audit_status === "content_audit_scale_review_candidate");

  let recommendation: ContentRunAuditRecommendation = "keep_manual_limit_1";
  if (runsWithProblems > 0) {
    recommendation = "investigate_before_scaling";
  } else if (allScaleCandidates) {
    recommendation = "scale_review_candidate";
  }

  return {
    runCount,
    sampleRowsDetected,
    totalSuccesses,
    totalFailures,
    totalUnknownResults,
    runsWithManualPortalVerification,
    runsWithCorrectLanguage,
    runsWithProblems,
    recommendation
  };
}

function writeAuditReviewCsv(filePath: string, rows: ContentRunAuditReviewRow[]): void {
  const lines = [
    REVIEW_HEADERS.map(escapeContentCsvValue).join(","),
    ...rows.map((row) =>
      REVIEW_HEADERS.map((header) => escapeContentCsvValue(String(row[header] ?? ""))).join(",")
    )
  ];

  writeFileSync(filePath, `${lines.join("\n")}\n`, "utf-8");
}

export function resolveContentRunAuditInputPath(
  providedPath?: string,
  defaultPath = DEFAULT_CONTENT_RUN_AUDIT_FILE
): AuditInputResolution {
  if (providedPath && providedPath.trim().length > 0) {
    return {
      status: "found",
      filePath: path.isAbsolute(providedPath) ? providedPath : path.resolve(process.cwd(), providedPath)
    };
  }

  if (existsSync(defaultPath)) {
    return {
      status: "found",
      filePath: defaultPath
    };
  }

  return {
    status: "missing_default",
    filePath: defaultPath,
    message: [
      `Local content run audit file not found: ${defaultPath}`,
      "Create it from data/content-run-audit.example.csv and fill it after real manual publish runs.",
      "This is not a project failure; no audit review was generated."
    ].join(" ")
  };
}

export function reviewContentRunAuditRows(auditRows: AuditCsvRow[]): ContentRunAuditReviewResult {
  const rows = auditRows.map(buildAuditReviewRow);

  return {
    rows,
    summary: buildSummary(auditRows, rows)
  };
}

export function reviewContentRunAuditFile(filePath: string): ContentRunAuditReviewResult {
  return reviewContentRunAuditRows(readAuditRows(filePath));
}

export function exportContentRunAuditReview(
  rows: ContentRunAuditReviewRow[],
  date = new Date(),
  outputDir = CONTENT_RUN_AUDIT_REVIEW_DIR
): string {
  ensureDir(outputDir);

  const runId = formatContentRunId(date);
  const filePath = path.join(outputDir, `content-run-audit-review-${runId}.csv`);
  writeAuditReviewCsv(filePath, rows);

  return filePath;
}
