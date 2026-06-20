import { readFileSync } from "node:fs";
import path from "node:path";
import type { ValidationIssue } from "../input/types";
import type {
  DiscoveryInputValidationResult,
  DiscoveryResultRow,
  RawDiscoveryInputRecord,
  RejectedDiscoveryInputRecord,
  ValidDiscoveryInputRecord
} from "./types";

const REQUIRED_DISCOVERY_HEADERS = [
  "target_id",
  "email",
  "first_name",
  "last_name",
  "company",
  "country",
  "city",
  "enabled",
  "note"
] as const;

function emptyResult(): DiscoveryInputValidationResult {
  return {
    valid: [],
    rejected: [],
    skippedDisabled: [],
    fileErrors: []
  };
}

function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;
  let fieldWasQuoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];

    if (character === '"') {
      if (inQuotes && line[index + 1] === '"') {
        current += '"';
        index += 1;
        continue;
      }

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

function isNonEmptyText(value: string | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isEmailLike(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function requiredTextIssue(field: string): ValidationIssue {
  return {
    field,
    code: "missing_required_field",
    message: `${field} is required.`
  };
}

function invalidInputResult(
  raw: RawDiscoveryInputRecord,
  reason: string,
  checkedAt: string
): DiscoveryResultRow {
  return {
    target_id: raw.target_id?.trim() ?? "",
    input_email: raw.email?.trim() ?? "",
    input_first_name: raw.first_name?.trim() ?? "",
    input_last_name: raw.last_name?.trim() ?? "",
    input_company: raw.company?.trim() ?? "",
    input_country: raw.country?.trim() ?? "",
    input_city: raw.city?.trim() ?? "",
    discovery_status: "invalid_input",
    profile_url: "",
    confidence: "none",
    reason,
    checked_at: checkedAt,
    note: raw.note?.trim() ?? ""
  };
}

function skippedDisabledResult(raw: RawDiscoveryInputRecord, checkedAt: string): DiscoveryResultRow {
  return {
    target_id: raw.target_id?.trim() ?? "",
    input_email: raw.email?.trim() ?? "",
    input_first_name: raw.first_name?.trim() ?? "",
    input_last_name: raw.last_name?.trim() ?? "",
    input_company: raw.company?.trim() ?? "",
    input_country: raw.country?.trim() ?? "",
    input_city: raw.city?.trim() ?? "",
    discovery_status: "skipped_disabled",
    profile_url: "",
    confidence: "none",
    reason: "record disabled",
    checked_at: checkedAt,
    note: raw.note?.trim() ?? ""
  };
}

function parseStrictBoolean(value: string | undefined): {
  ok: true;
  value: boolean;
} | {
  ok: false;
  issue: ValidationIssue;
} {
  const normalized = value?.trim();

  if (normalized === "true") {
    return { ok: true, value: true };
  }

  if (normalized === "false") {
    return { ok: true, value: false };
  }

  return {
    ok: false,
    issue: {
      field: "enabled",
      code: "invalid_boolean",
      message: "enabled must be true or false."
    }
  };
}

function validateRow(row: RawDiscoveryInputRecord): {
  ok: true;
  value: ValidDiscoveryInputRecord;
} | {
  ok: false;
  issues: ValidationIssue[];
} {
  const issues: ValidationIssue[] = [];
  const email = row.email?.trim() ?? "";
  const firstName = row.first_name?.trim() ?? "";
  const lastName = row.last_name?.trim() ?? "";

  if (!isNonEmptyText(row.target_id)) {
    issues.push(requiredTextIssue("target_id"));
  }

  if (email.length > 0 && !isEmailLike(email)) {
    issues.push({
      field: "email",
      code: "invalid_email",
      message: "email must look like an email address."
    });
  }

  if (email.length === 0 && (firstName.length === 0 || lastName.length === 0)) {
    issues.push({
      field: "email",
      code: "missing_search_identity",
      message: "email or first_name plus last_name is required."
    });
  }

  if (issues.length > 0) {
    return { ok: false, issues };
  }

  return {
    ok: true,
    value: {
      target_id: row.target_id!.trim(),
      email,
      first_name: firstName,
      last_name: lastName,
      company: row.company?.trim() ?? "",
      country: row.country?.trim() ?? "",
      city: row.city?.trim() ?? "",
      enabled: true,
      note: row.note?.trim() ?? ""
    }
  };
}

function parseRows(csvText: string): {
  ok: true;
  rows: Array<{ rowNumber: number; row: RawDiscoveryInputRecord }>;
} | {
  ok: false;
  message: string;
} {
  const lines = csvText
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (lines.length === 0) {
    return { ok: false, message: "CSV file is empty." };
  }

  if (lines.length < 2) {
    return { ok: false, message: "CSV file has headers but no data rows." };
  }

  const headers = parseCsvLine(lines[0]);
  const missingHeaders = REQUIRED_DISCOVERY_HEADERS.filter((header) => !headers.includes(header));

  if (missingHeaders.length > 0) {
    return { ok: false, message: `Missing CSV headers: ${missingHeaders.join(", ")}.` };
  }

  const rows = lines.slice(1).map((line, index) => {
    const values = parseCsvLine(line);
    const row: RawDiscoveryInputRecord = {};

    headers.forEach((header, headerIndex) => {
      row[header] = values[headerIndex] ?? "";
    });

    return {
      rowNumber: index + 2,
      row
    };
  });

  return { ok: true, rows };
}

function toRejected(
  rowNumber: number,
  raw: RawDiscoveryInputRecord,
  issues: ValidationIssue[],
  checkedAt: string
): RejectedDiscoveryInputRecord {
  return {
    rowNumber,
    raw,
    issues,
    result: invalidInputResult(
      raw,
      issues.map((issue) => issue.code).join("; "),
      checkedAt
    )
  };
}

export function validateDiscoveryInputCsvText(
  csvText: string,
  checkedAt = new Date().toISOString()
): DiscoveryInputValidationResult {
  const result = emptyResult();
  const parsed = parseRows(csvText);

  if (!parsed.ok) {
    result.fileErrors.push({ file: "<csv-text>", message: parsed.message });
    return result;
  }

  for (const { rowNumber, row } of parsed.rows) {
    const enabled = parseStrictBoolean(row.enabled);
    if (!enabled.ok) {
      result.rejected.push(toRejected(rowNumber, row, [enabled.issue], checkedAt));
      continue;
    }

    if (!enabled.value) {
      result.skippedDisabled.push(skippedDisabledResult(row, checkedAt));
      continue;
    }

    const validated = validateRow(row);
    if (validated.ok) {
      result.valid.push(validated.value);
      continue;
    }

    result.rejected.push(toRejected(rowNumber, row, validated.issues, checkedAt));
  }

  return result;
}

export function validateDiscoveryInputCsvFile(
  filePath = path.resolve(process.cwd(), "data", "discovery-input.csv"),
  checkedAt = new Date().toISOString()
): DiscoveryInputValidationResult {
  try {
    return validateDiscoveryInputCsvText(readFileSync(filePath, "utf-8"), checkedAt);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const result = emptyResult();
    result.fileErrors.push({ file: filePath, message });
    return result;
  }
}
