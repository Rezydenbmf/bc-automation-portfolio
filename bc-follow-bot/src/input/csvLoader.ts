import { readFileSync } from "node:fs";
import path from "node:path";
import { AccountRow, TargetRow, TargetType } from "../shared/types";

function parseCsvLine(line: string): string[] {
  return line.split(",").map((value) => value.trim());
}

function toBoolean(value: string): boolean {
  return value.toLowerCase() === "true";
}

function normalizeLanguage(value: string | undefined): string {
  const trimmed = value?.trim();
  return trimmed ? trimmed.toLowerCase() : "unknown";
}

function readCsvRows(filePath: string): Record<string, string>[] {
  const absolutePath = path.resolve(process.cwd(), filePath);
  const raw = readFileSync(absolutePath, "utf-8").replace(/^\uFEFF/, "");
  const lines = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (lines.length < 2) {
    return [];
  }

  const headers = parseCsvLine(lines[0]);

  return lines.slice(1).map((line) => {
    const values = parseCsvLine(line);
    const row: Record<string, string> = {};

    headers.forEach((header, index) => {
      row[header] = values[index] ?? "";
    });

    return row;
  });
}

export function loadAccounts(filePath = "data/accounts.csv"): AccountRow[] {
  return readCsvRows(filePath).map((row) => ({
    account_id: row.account_id ?? "",
    email: row.email ?? "",
    password: row.password ?? "",
    enabled: toBoolean(row.enabled ?? "false"),
    language: normalizeLanguage(row.language),
    note: row.note ?? ""
  }));
}

export function loadTargets(filePath = "data/targets.csv"): TargetRow[] {
  return readCsvRows(filePath).map((row) => ({
    target_id: row.target_id ?? "",
    target_type: (row.target_type ?? "profile_url") as TargetType,
    target_value: row.target_value ?? "",
    enabled: toBoolean(row.enabled ?? "false"),
    note: row.note ?? ""
  }));
}
