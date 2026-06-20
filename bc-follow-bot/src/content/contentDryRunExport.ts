import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { escapeCsvValue } from "../shared/csv";
import type { ContentApprovalRow, ContentDryRunRow } from "./types";

export interface ContentDryRunExportResult {
  runId: string;
  dryRunFilePath: string;
  approvalFilePath: string;
}

const CONTENT_DRY_RUN_DIR = path.resolve(process.cwd(), "logs", "content-dry-run");
const CONTENT_APPROVALS_DIR = path.resolve(process.cwd(), "logs", "content-approvals");

const DRY_RUN_HEADERS = [
  "content_action_id",
  "account_id",
  "target_type",
  "target_value",
  "content_type",
  "account_language",
  "action_language",
  "status",
  "approval_status",
  "note",
  "error_message"
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

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

export function formatContentRunId(date: Date): string {
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
    "-",
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds())
  ].join("");
}

function ensureDir(outputDir: string): void {
  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true });
  }
}

export function escapeContentCsvValue(value: string): string {
  return escapeCsvValue(value);
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

export function exportContentDryRunFiles(
  rows: ContentDryRunRow[],
  approvalRows: ContentApprovalRow[],
  date = new Date(),
  dryRunDir = CONTENT_DRY_RUN_DIR,
  approvalDir = CONTENT_APPROVALS_DIR
): ContentDryRunExportResult {
  ensureDir(dryRunDir);
  ensureDir(approvalDir);

  const runId = formatContentRunId(date);
  const dryRunFilePath = path.join(dryRunDir, `content-dry-run-${runId}.csv`);
  const approvalFilePath = path.join(approvalDir, `content-approval-${runId}.csv`);

  writeCsv(dryRunFilePath, DRY_RUN_HEADERS, rows);
  writeCsv(approvalFilePath, APPROVAL_HEADERS, approvalRows);

  return {
    runId,
    dryRunFilePath,
    approvalFilePath
  };
}
