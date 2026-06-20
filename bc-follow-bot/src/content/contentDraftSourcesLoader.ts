import { readFileSync } from "node:fs";
import path from "node:path";
import {
  ContentActionType,
  ContentActionValidationIssue,
  ContentDraftSourceRecord,
  ContentTargetType,
  LoadedContentDraftSources,
  RawContentDraftSourceRecord
} from "./types";

const REQUIRED_CONTENT_DRAFT_SOURCE_HEADERS = [
  "content_action_id",
  "account_id",
  "target_type",
  "target_value",
  "content_type",
  "language",
  "profile_name",
  "country",
  "industry",
  "bio",
  "post_goal",
  "topic_hint",
  "tone",
  "enabled",
  "note"
] as const;

const ALLOWED_CONTENT_TYPES = new Set<ContentActionType>(["comment", "post"]);
const ALLOWED_TARGET_TYPES = new Set<ContentTargetType>(["profile_url", "post_url", "manual"]);
const MAX_ID_LENGTH = 100;
const MAX_TARGET_VALUE_LENGTH = 500;
const MAX_SHORT_TEXT_LENGTH = 120;
const MAX_NOTE_LENGTH = 300;
const MAX_BIO_LENGTH = 1500;
const MAX_GOAL_LENGTH = 500;
const MAX_TOPIC_HINT_LENGTH = 300;

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

function readCsvRows(filePath: string): Array<{
  rowNumber: number;
  row: RawContentDraftSourceRecord;
}> {
  const absolutePath = path.resolve(process.cwd(), filePath);
  const raw = readFileSync(absolutePath, "utf-8").replace(/^\uFEFF/, "");
  const lines = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (lines.length === 0) {
    throw new Error("content draft sources CSV is empty.");
  }

  if (lines.length < 2) {
    throw new Error("content draft sources CSV has no data rows.");
  }

  const headers = parseCsvLine(lines[0]);
  const missingHeaders = REQUIRED_CONTENT_DRAFT_SOURCE_HEADERS.filter(
    (header) => !headers.includes(header)
  );

  if (missingHeaders.length > 0) {
    throw new Error(`content draft sources CSV is missing headers: ${missingHeaders.join(", ")}.`);
  }

  return lines.slice(1).map((line, index) => {
    const values = parseCsvLine(line);
    const row: RawContentDraftSourceRecord = {};

    headers.forEach((header, headerIndex) => {
      row[header] = values[headerIndex] ?? "";
    });

    return {
      rowNumber: index + 2,
      row
    };
  });
}

function hasControlCharacters(value: string): boolean {
  return /[\u0000-\u001F\u007F]/.test(value);
}

function requiredTextIssue(field: string): ContentActionValidationIssue {
  return {
    field,
    code: "missing_required_field",
    message: `${field} is required.`
  };
}

function validateRequiredText(
  row: RawContentDraftSourceRecord,
  field: keyof RawContentDraftSourceRecord,
  maxLength: number
): ContentActionValidationIssue | null {
  const value = row[field]?.trim() ?? "";

  if (!value) {
    return requiredTextIssue(String(field));
  }

  if (value.length > maxLength || hasControlCharacters(value)) {
    return {
      field: String(field),
      code: "invalid_text",
      message: `${String(field)} must be clean text up to ${maxLength} characters.`
    };
  }

  return null;
}

function validateOptionalText(
  row: RawContentDraftSourceRecord,
  field: keyof RawContentDraftSourceRecord,
  maxLength: number
): ContentActionValidationIssue | null {
  const value = row[field]?.trim() ?? "";

  if (value.length > maxLength || hasControlCharacters(value)) {
    return {
      field: String(field),
      code: "invalid_text",
      message: `${String(field)} must be clean text up to ${maxLength} characters.`
    };
  }

  return null;
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
      message: "language must be a short language code such as pl, en, gb, us, fr, de, es, it, or unknown."
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

function validateTargetValue(
  targetType: ContentTargetType,
  value: string
): ContentActionValidationIssue | null {
  const trimmed = value.trim();

  if (!trimmed) {
    return requiredTextIssue("target_value");
  }

  if (trimmed.length > MAX_TARGET_VALUE_LENGTH || hasControlCharacters(trimmed)) {
    return {
      field: "target_value",
      code: "invalid_text",
      message: `target_value must be clean text up to ${MAX_TARGET_VALUE_LENGTH} characters.`
    };
  }

  if ((targetType === "profile_url" || targetType === "post_url") && !isAbsoluteHttpUrl(trimmed)) {
    return {
      field: "target_value",
      code: "invalid_url",
      message: "target_value must be an absolute http or https URL for profile_url and post_url targets."
    };
  }

  return null;
}

function buildValidDraftSource(row: RawContentDraftSourceRecord): {
  valid: true;
  source: ContentDraftSourceRecord;
} | {
  valid: false;
  issues: ContentActionValidationIssue[];
} {
  const issues: ContentActionValidationIssue[] = [];

  for (const field of ["content_action_id", "account_id"] as const) {
    const issue = validateRequiredText(row, field, MAX_ID_LENGTH);
    if (issue) {
      issues.push(issue);
    }
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
    issues.push(targetValueIssue);
  }

  let contentTypeValue: ContentActionType = "post";
  const contentType = row.content_type?.trim() as ContentActionType | undefined;
  if (!contentType) {
    issues.push(requiredTextIssue("content_type"));
  } else if (!ALLOWED_CONTENT_TYPES.has(contentType)) {
    issues.push({
      field: "content_type",
      code: "invalid_content_type",
      message: "content_type must be post or comment."
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

  for (const field of ["profile_name", "country", "industry"] as const) {
    const issue = validateRequiredText(row, field, MAX_SHORT_TEXT_LENGTH);
    if (issue) {
      issues.push(issue);
    }
  }

  const bioIssue = validateRequiredText(row, "bio", MAX_BIO_LENGTH);
  if (bioIssue) {
    issues.push(bioIssue);
  }

  const postGoalIssue = validateRequiredText(row, "post_goal", MAX_GOAL_LENGTH);
  if (postGoalIssue) {
    issues.push(postGoalIssue);
  }

  for (const [field, maxLength] of [
    ["topic_hint", MAX_TOPIC_HINT_LENGTH],
    ["tone", MAX_SHORT_TEXT_LENGTH],
    ["note", MAX_NOTE_LENGTH]
  ] as const) {
    const issue = validateOptionalText(row, field, maxLength);
    if (issue) {
      issues.push(issue);
    }
  }

  if (issues.length > 0) {
    return { valid: false, issues };
  }

  return {
    valid: true,
    source: {
      content_action_id: row.content_action_id!.trim(),
      account_id: row.account_id!.trim(),
      target_type: targetTypeValue,
      target_value: row.target_value!.trim(),
      content_type: contentTypeValue,
      language: languageValue,
      profile_name: row.profile_name!.trim(),
      country: row.country!.trim(),
      industry: row.industry!.trim(),
      bio: row.bio!.trim(),
      post_goal: row.post_goal!.trim(),
      topic_hint: row.topic_hint?.trim() ?? "",
      tone: row.tone?.trim() ?? "",
      enabled: true,
      note: row.note?.trim() ?? ""
    }
  };
}

export function loadContentDraftSources(
  filePath = "data/content-draft-sources.csv"
): LoadedContentDraftSources {
  const rows = readCsvRows(filePath);
  const result: LoadedContentDraftSources = {
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

    const built = buildValidDraftSource(row);
    if (built.valid) {
      result.valid.push(built.source);
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
