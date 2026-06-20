import { appendFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { DiscoveryResultRow } from "./types";

export interface DiscoveryResultsExport {
  runId: string;
  filePath: string;
}

export interface DiscoveryTargetsExport {
  runId: string;
  filePath: string;
  writtenCount: number;
}

const DISCOVERY_RESULTS_DIR = path.resolve(process.cwd(), "logs", "discovery-results");
const DISCOVERY_TARGETS_DIR = path.resolve(process.cwd(), "logs", "discovery-targets");
const DISCOVERY_RESULTS_HEADERS = [
  "target_id",
  "input_email",
  "input_first_name",
  "input_last_name",
  "input_company",
  "input_country",
  "input_city",
  "discovery_status",
  "profile_url",
  "confidence",
  "reason",
  "checked_at",
  "note"
] as const;
const DISCOVERY_TARGETS_HEADERS = [
  "target_id",
  "target_type",
  "target_value",
  "enabled",
  "note"
] as const;

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
    pad(date.getSeconds())
  ].join("");
}

function ensureDiscoveryResultsDir(outputDir: string): void {
  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true });
  }
}

export function escapeDiscoveryCsvValue(value: string): string {
  return `"${value.replace(/"/g, "\"\"")}"`;
}

export function createDiscoveryResultsExport(
  date = new Date(),
  outputDir = DISCOVERY_RESULTS_DIR
): DiscoveryResultsExport {
  ensureDiscoveryResultsDir(outputDir);

  const runId = formatRunId(date);
  const filePath = path.join(outputDir, `discovery-results-${runId}.csv`);

  writeFileSync(
    filePath,
    `${DISCOVERY_RESULTS_HEADERS.map(escapeDiscoveryCsvValue).join(",")}\n`,
    "utf-8"
  );

  return { runId, filePath };
}

export function appendDiscoveryResult(filePath: string, row: DiscoveryResultRow): void {
  const line = DISCOVERY_RESULTS_HEADERS.map((header) =>
    escapeDiscoveryCsvValue(String(row[header] ?? ""))
  ).join(",");

  appendFileSync(filePath, `${line}\n`, "utf-8");
}

export function appendDiscoveryResults(filePath: string, rows: DiscoveryResultRow[]): void {
  for (const row of rows) {
    appendDiscoveryResult(filePath, row);
  }
}

function sanitizeTargetsCsvValue(value: string): string {
  return value.replace(/[\r\n,]/g, " ").trim();
}

function toDiscoveryTargetId(row: DiscoveryResultRow, index: number): string {
  const sourceId = sanitizeTargetsCsvValue(row.target_id).replace(/\s+/g, "-");
  return sourceId.length > 0
    ? `discovery-${sourceId}`
    : `discovery-target-${String(index + 1).padStart(3, "0")}`;
}

export function createDiscoveryTargetsExport(
  rows: DiscoveryResultRow[],
  date = new Date(),
  outputDir = DISCOVERY_TARGETS_DIR
): DiscoveryTargetsExport {
  ensureDiscoveryResultsDir(outputDir);

  const runId = formatRunId(date);
  const filePath = path.join(outputDir, `discovery-targets-${runId}.csv`);
  const foundRows = rows.filter((row) =>
    row.discovery_status === "profile_found" && row.profile_url.trim().length > 0
  );
  const lines = [
    DISCOVERY_TARGETS_HEADERS.join(","),
    ...foundRows.map((row, index) => [
      toDiscoveryTargetId(row, index),
      "profile_url",
      sanitizeTargetsCsvValue(row.profile_url),
      "true",
      "target from discovery"
    ].join(","))
  ];

  writeFileSync(filePath, `${lines.join("\n")}\n`, "utf-8");

  return {
    runId,
    filePath,
    writtenCount: foundRows.length
  };
}
