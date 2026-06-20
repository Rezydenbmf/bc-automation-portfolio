import { appendFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

export type RunResultFinalStatus =
  | "followed"
  | "already_following"
  | "skipped_company"
  | "skipped_not_found"
  | "search_failed"
  | "follow_failed"
  | "already_processed"
  | "follow_limit_reached"
  | "login_failed"
  | "error";

export interface RunResultsExport {
  runId: string;
  filePath: string;
}

export interface RunResultRow {
  run_id: string;
  finished_at: string;
  account_email: string;
  target_id: string;
  target_type: string;
  target_value: string;
  search_result: string;
  follow_result: string;
  final_status: RunResultFinalStatus;
  error_message: string;
}

const RUN_RESULTS_DIR = path.resolve(process.cwd(), "logs", "run-results");
const RUN_RESULTS_HEADERS = [
  "run_id",
  "finished_at",
  "account_email",
  "target_id",
  "target_type",
  "target_value",
  "search_result",
  "follow_result",
  "final_status",
  "error_message",
];

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function formatRunId(date: Date): string {
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
    "-",
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds()),
  ].join("");
}

function ensureRunResultsDir(): void {
  if (!existsSync(RUN_RESULTS_DIR)) {
    mkdirSync(RUN_RESULTS_DIR, { recursive: true });
  }
}

export function escapeCsvValue(value: string): string {
  return `"${value.replace(/"/g, "\"\"")}"`;
}

export function createRunResultsExport(date = new Date()): RunResultsExport {
  ensureRunResultsDir();

  const runId = formatRunId(date);
  const filePath = path.join(RUN_RESULTS_DIR, `run-results-${runId}.csv`);
  writeFileSync(
    filePath,
    `${RUN_RESULTS_HEADERS.map(escapeCsvValue).join(",")}\n`,
    "utf-8",
  );

  return { runId, filePath };
}

export function appendRunResult(filePath: string, row: RunResultRow): void {
  const line = RUN_RESULTS_HEADERS.map((header) =>
    escapeCsvValue(String(row[header as keyof RunResultRow] ?? "")),
  ).join(",");

  appendFileSync(filePath, `${line}\n`, "utf-8");
}
