import { readFileSync } from "node:fs";
import path from "node:path";
import {
  ContentActionRecord,
  ContentActionType,
  ContentActionValidationIssue,
  ContentTargetType,
  LoadedContentActions,
  RawContentActionRecord
} from "./types";

const REQUIRED_CONTENT_ACTION_HEADERS = [
  "content_action_id",
  "account_id",
  "target_type",
  "target_value",
  "content_type",
  "language",
  "enabled",
  "note"
];

const ALLOWED_CONTENT_TYPES = new Set<ContentActionType>(["comment", "post"]);
const ALLOWED_TARGET_TYPES = new Set<ContentTargetType>(["profile_url", "post_url", "manual"]);
const MAX_ID_LENGTH = 100;
const MAX_TARGET_VALUE_LENGTH = 500;
const MAX_NOTE_LENGTH = 300;

function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;
  let fieldWasQuoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];

    if (character === '"') {
      inQuotes = !inQuotes;
      fieldWasQuoted = true;
      continue;
    }

    if (character === "," && !inQuotes) {
      fields.push(fieldWasQuoted ? current : current.trim());
      current = "";
      inQuotes = false;
      fieldWasQuoted = false;
      continue;
    }

    current += character;
  }

  fields.push(fieldWasQuoted ? current : current.trim());
  return fields;
}

function readCsvRows(filePath: string): Array<{ rowNumber: number; row: RawContentActionRecord }> {
  const absolutePath = path.resolve(process.cwd(), filePath);
  const raw = readFileSync(absolutePath, "utf-8").replace(/^\uFEFF/, "");
  const lines = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (lines.length === 0) {
    throw new Error("content actions CSV is empty.");
  }

  if (lines.length < 2) {
    throw new Error("content actions CSV has no data rows.");
  }

  const headers = parseCsvLine(lines[0]);
  const missingHeaders = REQUIRED_CONTENT_ACTION_HEADERS.filter((header) => !headers.includes(header));
  if (missingHeaders.length > 0) {
    throw new Error(`content actions CSV is missing headers: ${missingHeaders.join(", ")}.`);
  }

  return lines.slice(1).map((line, index) => {
    const values = parseCsvLine(line);
    const row: RawContentActionRecord = {};

    headers.forEach((header, headerIndex) => {
      row[header] = values[headerIndex] ?? "";
    });

    return {
      rowNumber: index + 2,
      row
    };
  });
}

function requiredTextIssue(field: string): ContentActionValidationIssue {
  return {
    field,
    code: "missing_required_field",
    message: `${field} is required.`
  };
}

function hasControlCharacters(value: string): boolean {
  return /[\u0000-\u001F\u007F]/.test(value);
}

function isCleanText(value: string, maxLength: number): boolean {
  const trimmed = value.trim();
  return trimmed.length > 0 && trimmed.length <= maxLength && !hasControlCharacters(trimmed);
}

function parseStrictBoolean(value: string | undefined): {
  ok: true;
  value: boolean;
} | {
  ok: false;
  issue: ContentActionValidationIssue;
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

function parseLanguage(value: string | undefined): {
  ok: true;
  value: string;
} | {
  ok: false;
  issue: ContentActionValidationIssue;
} {
  const trimmed = value?.trim().toLowerCase() ?? "";

  if (trimmed === "unknown" || /^[a-z]{2,3}$/.test(trimmed)) {
    return { ok: true, value: trimmed };
  }

  return {
    ok: false,
    issue: {
      field: "language",
      code: "invalid_language",
      message: "language must be a short language code such as pl, en, fr, de, es, it, or unknown."
    }
  };
}

function isAbsoluteHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function validateTargetValue(targetType: ContentTargetType, value: string): ContentActionValidationIssue | null {
  if (!isCleanText(value, MAX_TARGET_VALUE_LENGTH)) {
    return {
      field: "target_value",
      code: "invalid_text",
      message: `target_value must be non-empty clean text up to ${MAX_TARGET_VALUE_LENGTH} characters.`
    };
  }

  if ((targetType === "profile_url" || targetType === "post_url") && !isAbsoluteHttpUrl(value.trim())) {
    return {
      field: "target_value",
      code: "invalid_url",
      message: "target_value must be an absolute http or https URL for profile_url and post_url targets."
    };
  }

  return null;
}

function buildValidContentAction(row: RawContentActionRecord): {
  valid: true;
  action: ContentActionRecord;
} | {
  valid: false;
  issues: ContentActionValidationIssue[];
} {
  const issues: ContentActionValidationIssue[] = [];

  if (!isCleanText(row.content_action_id ?? "", MAX_ID_LENGTH)) {
    issues.push(row.content_action_id?.trim() ? {
      field: "content_action_id",
      code: "invalid_text",
      message: `content_action_id must be clean text up to ${MAX_ID_LENGTH} characters.`
    } : requiredTextIssue("content_action_id"));
  }

  if (!isCleanText(row.account_id ?? "", MAX_ID_LENGTH)) {
    issues.push(row.account_id?.trim() ? {
      field: "account_id",
      code: "invalid_text",
      message: `account_id must be clean text up to ${MAX_ID_LENGTH} characters.`
    } : requiredTextIssue("account_id"));
  }

  let targetTypeValue: ContentTargetType = "manual";
  const targetType = row.target_type?.trim() as ContentTargetType | undefined;
  if (!targetType) {
    issues.push(requiredTextIssue("target_type"));
  } else if (!ALLOWED_TARGET_TYPES.has(targetType)) {
    issues.push({
      field: "target_type",
      code: "invalid_target_type",
      message: "target_type must be profile_url, post_url, or manual."
    });
  } else {
    targetTypeValue = targetType;
  }

  const targetValueIssue = validateTargetValue(targetTypeValue, row.target_value ?? "");
  if (targetValueIssue) {
    issues.push(row.target_value?.trim() ? targetValueIssue : requiredTextIssue("target_value"));
  }

  let contentTypeValue: ContentActionType = "comment";
  const contentType = row.content_type?.trim() as ContentActionType | undefined;
  if (!contentType) {
    issues.push(requiredTextIssue("content_type"));
  } else if (!ALLOWED_CONTENT_TYPES.has(contentType)) {
    issues.push({
      field: "content_type",
      code: "invalid_content_type",
      message: "content_type must be comment or post."
    });
  } else {
    contentTypeValue = contentType;
  }

  let languageValue = "unknown";
  if (!row.language?.trim()) {
    issues.push(requiredTextIssue("language"));
  } else {
    const language = parseLanguage(row.language);
    if (!language.ok) {
      issues.push(language.issue);
    } else {
      languageValue = language.value;
    }
  }

  const noteValue = row.note?.trim() ?? "";
  if (noteValue.length > MAX_NOTE_LENGTH || hasControlCharacters(noteValue)) {
    issues.push({
      field: "note",
      code: "invalid_text",
      message: `note must be clean text up to ${MAX_NOTE_LENGTH} characters.`
    });
  }

  if (issues.length > 0) {
    return { valid: false, issues };
  }

  return {
    valid: true,
    action: {
      content_action_id: row.content_action_id!.trim(),
      account_id: row.account_id!.trim(),
      target_type: targetTypeValue,
      target_value: row.target_value!.trim(),
      content_type: contentTypeValue,
      language: languageValue,
      enabled: true,
      note: noteValue
    }
  };
}

export function loadContentActions(filePath = "data/content-actions.csv"): LoadedContentActions {
  const rows = readCsvRows(filePath);
  const result: LoadedContentActions = {
    valid: [],
    disabled: [],
    rejected: []
  };

  for (const { rowNumber, row } of rows) {
    const enabled = parseStrictBoolean(row.enabled);
    if (!enabled.ok) {
      result.rejected.push({
        rowNumber,
        raw: row,
        issues: [enabled.issue]
      });
      continue;
    }

    if (!enabled.value) {
      result.disabled.push({ rowNumber, raw: row });
      continue;
    }

    const built = buildValidContentAction(row);
    if (built.valid) {
      result.valid.push(built.action);
      continue;
    }

    result.rejected.push({
      rowNumber,
      raw: row,
      issues: built.issues
    });
  }

  return result;
}
