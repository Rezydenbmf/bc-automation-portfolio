import { readFileSync } from "node:fs";
import path from "node:path";
import { AiDraftProviderName, AppSettings, TargetType } from "../shared/types";
import {
  InputFileError,
  InputPaths,
  LoadedInputData,
  RawAccountRecord,
  RawAppSettingsRecord,
  RawTargetRecord,
  RejectedAccountRecord,
  RejectedTargetRecord,
  ValidAccountRecord,
  ValidTargetRecord,
  ValidationIssue
} from "./types";

// Input contract: simple line-based CSV for current app files.
// Supported: quoted fields with commas. Not supported: multiline fields,
// escaped quotes inside quoted fields, or full RFC CSV edge cases.
const DEFAULT_INPUT_PATHS: InputPaths = {
  configPath: path.resolve(process.cwd(), "config", "appsettings.json"),
  accountsPath: path.resolve(process.cwd(), "data", "accounts.csv"),
  targetsPath: path.resolve(process.cwd(), "data", "targets.csv")
};

const REQUIRED_ACCOUNT_HEADERS = ["account_id", "email", "password", "enabled"];
const REQUIRED_ACCOUNT_V2_HEADERS = [
  "email",
  "password",
  "first_name",
  "last_name",
  "company_name",
  "country",
  "city",
  "created_at"
];
const REQUIRED_TARGET_HEADERS = ["target_id", "target_type", "target_value", "enabled"];
const DEFAULT_ACCOUNT_LANGUAGE = "unknown";
const DEFAULT_MAX_CONTENT_ACTIONS_PER_RUN = 5;
const DEFAULT_MAX_CONTENT_ACTIONS_PER_ACCOUNT = 2;
const DEFAULT_MAX_CONTENT_PUBLISHES_PER_RUN = 3;
const DEFAULT_MAX_CONTENT_PUBLISHES_PER_ACCOUNT = 1;
const DEFAULT_MAX_CONTENT_BROWSER_DRY_RUN_PER_RUN = 3;
const DEFAULT_MAX_CONTENT_BROWSER_DRY_RUN_PER_ACCOUNT = 1;
const DEFAULT_MAX_CONTENT_MANUAL_PUBLISHES_PER_RUN = 1;
const DEFAULT_MAX_CONTENT_MANUAL_PUBLISHES_PER_ACCOUNT = 1;
const DEFAULT_MAX_CONTENT_TITLE_LENGTH = 120;
const DEFAULT_AI_DRAFT_PROVIDER = "openai-compatible";
const DEFAULT_AI_DRAFT_MODEL = "gpt-4.1-mini";
const DEFAULT_MAX_CONTENT_AI_DRAFTS_PER_RUN = 5;
const DEFAULT_MAX_CONTENT_DRAFT_TEXT_LENGTH = 1200;
const DEFAULT_MAX_CONTENT_DRAFT_TITLE_LENGTH = 120;

function emptyResult(): LoadedInputData {
  return {
    config: null,
    accountsValid: [],
    targetsValid: [],
    accountsRejected: [],
    targetsRejected: [],
    fileErrors: []
  };
}

function resolveInputPaths(paths?: Partial<InputPaths>): InputPaths {
  return {
    configPath: paths?.configPath ?? DEFAULT_INPUT_PATHS.configPath,
    accountsPath: paths?.accountsPath ?? DEFAULT_INPUT_PATHS.accountsPath,
    targetsPath: paths?.targetsPath ?? DEFAULT_INPUT_PATHS.targetsPath
  };
}

function toFileError(file: string, message: string): InputFileError {
  return { file, message };
}

function isNonEmptyText(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isEmailLike(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function isAbsoluteUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

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

function parseStrictBoolean(value: string | undefined, field: string): {
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
      field,
      code: "invalid_boolean",
      message: `${field} musi mieć wartość true albo false.`
    }
  };
}

function parseRequiredNumber(value: unknown, field: string): {
  ok: true;
  value: number;
} | {
  ok: false;
  issue: ValidationIssue;
} {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return {
      ok: false,
      issue: {
        field,
        code: "invalid_number",
        message: `${field} musi być liczbą.`
      }
    };
  }

  return { ok: true, value };
}

function parseOptionalNonNegativeInteger(value: unknown, field: string): {
  ok: true;
  value: number | undefined;
} | {
  ok: false;
  issue: ValidationIssue;
} {
  if (value === undefined) {
    return { ok: true, value: undefined };
  }

  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < 0
  ) {
    return {
      ok: false,
      issue: {
        field,
        code: "invalid_non_negative_integer",
        message: `${field} musi byÄ‡ liczbÄ… caĹ‚kowitÄ… wiÄ™kszÄ… albo rĂłwnÄ… 0.`
      }
    };
  }

  return { ok: true, value };
}

function parseRequiredBoolean(value: unknown, field: string): {
  ok: true;
  value: boolean;
} | {
  ok: false;
  issue: ValidationIssue;
} {
  if (typeof value === "boolean") {
    return { ok: true, value };
  }

  return {
    ok: false,
    issue: {
      field,
      code: "invalid_boolean",
      message: `${field} musi być true albo false.`
    }
  };
}

function parseOptionalBoolean(value: unknown, field: string): {
  ok: true;
  value: boolean | undefined;
} | {
  ok: false;
  issue: ValidationIssue;
} {
  if (value === undefined) {
    return { ok: true, value: undefined };
  }

  if (typeof value === "boolean") {
    return { ok: true, value };
  }

  return {
    ok: false,
    issue: {
      field,
      code: "invalid_boolean",
      message: `${field} musi byc true albo false.`
    }
  };
}

function parseOptionalString(value: unknown, field: string): {
  ok: true;
  value: string | undefined;
} | {
  ok: false;
  issue: ValidationIssue;
} {
  if (value === undefined) {
    return { ok: true, value: undefined };
  }

  if (typeof value === "string") {
    return { ok: true, value: value.trim() };
  }

  return {
    ok: false,
    issue: {
      field,
      code: "invalid_string",
      message: `${field} musi byc tekstem.`
    }
  };
}

function parseConfig(raw: RawAppSettingsRecord): {
  config: AppSettings | null;
  issues: ValidationIssue[];
} {
  const issues: ValidationIssue[] = [];

  let headlessValue = false;
  const headless = parseRequiredBoolean(raw.headless, "headless");
  if (!headless.ok) {
    issues.push(headless.issue);
  } else {
    headlessValue = headless.value;
  }

  let timeoutMsValue = 0;
  const timeoutMs = parseRequiredNumber(raw.timeoutMs, "timeoutMs");
  if (!timeoutMs.ok) {
    issues.push(timeoutMs.issue);
  } else {
    timeoutMsValue = timeoutMs.value;
  }

  let slowMoValue = 0;
  const slowMo = parseRequiredNumber(raw.slowMo, "slowMo");
  if (!slowMo.ok) {
    issues.push(slowMo.issue);
  } else {
    slowMoValue = slowMo.value;
  }

  let debugScreenshotsValue = false;
  const debugScreenshots = parseRequiredBoolean(raw.debugScreenshots, "debugScreenshots");
  if (!debugScreenshots.ok) {
    issues.push(debugScreenshots.issue);
  } else {
    debugScreenshotsValue = debugScreenshots.value;
  }

  let baseUrlValue = "";
  if (isNonEmptyText(raw.baseUrl) && isAbsoluteUrl(raw.baseUrl)) {
    baseUrlValue = raw.baseUrl.trim();
  } else {
    issues.push({
      field: "baseUrl",
      code: "invalid_url",
      message: "baseUrl musi być poprawnym adresem http albo https."
    });
  }

  let screenshotOnErrorValue = false;
  const screenshotOnError = parseRequiredBoolean(raw.screenshotOnError, "screenshotOnError");
  if (!screenshotOnError.ok) {
    issues.push(screenshotOnError.issue);
  } else {
    screenshotOnErrorValue = screenshotOnError.value;
  }

  let takeHtmlSnapshotOnErrorValue = false;
  const takeHtmlSnapshotOnError = parseRequiredBoolean(raw.takeHtmlSnapshotOnError, "takeHtmlSnapshotOnError");
  if (!takeHtmlSnapshotOnError.ok) {
    issues.push(takeHtmlSnapshotOnError.issue);
  } else {
    takeHtmlSnapshotOnErrorValue = takeHtmlSnapshotOnError.value;
  }

  let delayBetweenTargetsMsValue = 0;
  const delayBetweenTargetsMs = parseRequiredNumber(raw.delayBetweenTargetsMs, "delayBetweenTargetsMs");
  if (!delayBetweenTargetsMs.ok) {
    issues.push(delayBetweenTargetsMs.issue);
  } else {
    delayBetweenTargetsMsValue = delayBetweenTargetsMs.value;
  }

  let accountsV2PathValue: string | undefined;
  if (raw.accountsV2Path !== undefined) {
    if (typeof raw.accountsV2Path !== "string") {
      issues.push({
        field: "accountsV2Path",
        code: "invalid_string",
        message: "accountsV2Path musi byÄ‡ tekstem albo pustÄ… wartoĹ›ciÄ…."
      });
    } else {
      const trimmed = raw.accountsV2Path.trim();
      if (trimmed.length > 0) {
        accountsV2PathValue = trimmed;
      }
    }
  }

  let maxFollowsPerRunValue: number | undefined;
  const maxFollowsPerRun = parseOptionalNonNegativeInteger(raw.maxFollowsPerRun, "maxFollowsPerRun");
  if (!maxFollowsPerRun.ok) {
    issues.push(maxFollowsPerRun.issue);
  } else {
    maxFollowsPerRunValue = maxFollowsPerRun.value;
  }

  let preflightOperationWarningThresholdValue: number | undefined;
  const preflightOperationWarningThreshold = parseOptionalNonNegativeInteger(
    raw.preflightOperationWarningThreshold,
    "preflightOperationWarningThreshold",
  );
  if (!preflightOperationWarningThreshold.ok) {
    issues.push(preflightOperationWarningThreshold.issue);
  } else {
    preflightOperationWarningThresholdValue = preflightOperationWarningThreshold.value;
  }

  let requireManualConfirmForLargeRunValue = true;
  const requireManualConfirmForLargeRun = parseOptionalBoolean(
    raw.requireManualConfirmForLargeRun,
    "requireManualConfirmForLargeRun",
  );
  if (!requireManualConfirmForLargeRun.ok) {
    issues.push(requireManualConfirmForLargeRun.issue);
  } else {
    requireManualConfirmForLargeRunValue =
      requireManualConfirmForLargeRun.value ?? true;
  }

  let maxContentActionsPerRunValue = DEFAULT_MAX_CONTENT_ACTIONS_PER_RUN;
  const maxContentActionsPerRun = parseOptionalNonNegativeInteger(
    raw.maxContentActionsPerRun,
    "maxContentActionsPerRun",
  );
  if (!maxContentActionsPerRun.ok) {
    issues.push(maxContentActionsPerRun.issue);
  } else {
    maxContentActionsPerRunValue =
      maxContentActionsPerRun.value ?? DEFAULT_MAX_CONTENT_ACTIONS_PER_RUN;
  }

  let maxContentActionsPerAccountValue = DEFAULT_MAX_CONTENT_ACTIONS_PER_ACCOUNT;
  const maxContentActionsPerAccount = parseOptionalNonNegativeInteger(
    raw.maxContentActionsPerAccount,
    "maxContentActionsPerAccount",
  );
  if (!maxContentActionsPerAccount.ok) {
    issues.push(maxContentActionsPerAccount.issue);
  } else {
    maxContentActionsPerAccountValue =
      maxContentActionsPerAccount.value ?? DEFAULT_MAX_CONTENT_ACTIONS_PER_ACCOUNT;
  }

  let maxContentPublishesPerRunValue = DEFAULT_MAX_CONTENT_PUBLISHES_PER_RUN;
  const maxContentPublishesPerRun = parseOptionalNonNegativeInteger(
    raw.maxContentPublishesPerRun,
    "maxContentPublishesPerRun",
  );
  if (!maxContentPublishesPerRun.ok) {
    issues.push(maxContentPublishesPerRun.issue);
  } else {
    maxContentPublishesPerRunValue =
      maxContentPublishesPerRun.value ?? DEFAULT_MAX_CONTENT_PUBLISHES_PER_RUN;
  }

  let maxContentPublishesPerAccountValue = DEFAULT_MAX_CONTENT_PUBLISHES_PER_ACCOUNT;
  const maxContentPublishesPerAccount = parseOptionalNonNegativeInteger(
    raw.maxContentPublishesPerAccount,
    "maxContentPublishesPerAccount",
  );
  if (!maxContentPublishesPerAccount.ok) {
    issues.push(maxContentPublishesPerAccount.issue);
  } else {
    maxContentPublishesPerAccountValue =
      maxContentPublishesPerAccount.value ?? DEFAULT_MAX_CONTENT_PUBLISHES_PER_ACCOUNT;
  }

  let maxContentBrowserDryRunPerRunValue = DEFAULT_MAX_CONTENT_BROWSER_DRY_RUN_PER_RUN;
  const maxContentBrowserDryRunPerRun = parseOptionalNonNegativeInteger(
    raw.maxContentBrowserDryRunPerRun,
    "maxContentBrowserDryRunPerRun",
  );
  if (!maxContentBrowserDryRunPerRun.ok) {
    issues.push(maxContentBrowserDryRunPerRun.issue);
  } else {
    maxContentBrowserDryRunPerRunValue =
      maxContentBrowserDryRunPerRun.value ?? DEFAULT_MAX_CONTENT_BROWSER_DRY_RUN_PER_RUN;
  }

  let maxContentBrowserDryRunPerAccountValue = DEFAULT_MAX_CONTENT_BROWSER_DRY_RUN_PER_ACCOUNT;
  const maxContentBrowserDryRunPerAccount = parseOptionalNonNegativeInteger(
    raw.maxContentBrowserDryRunPerAccount,
    "maxContentBrowserDryRunPerAccount",
  );
  if (!maxContentBrowserDryRunPerAccount.ok) {
    issues.push(maxContentBrowserDryRunPerAccount.issue);
  } else {
    maxContentBrowserDryRunPerAccountValue =
      maxContentBrowserDryRunPerAccount.value ?? DEFAULT_MAX_CONTENT_BROWSER_DRY_RUN_PER_ACCOUNT;
  }

  let maxContentManualPublishesPerRunValue = DEFAULT_MAX_CONTENT_MANUAL_PUBLISHES_PER_RUN;
  const maxContentManualPublishesPerRun = parseOptionalNonNegativeInteger(
    raw.maxContentManualPublishesPerRun,
    "maxContentManualPublishesPerRun",
  );
  if (!maxContentManualPublishesPerRun.ok) {
    issues.push(maxContentManualPublishesPerRun.issue);
  } else {
    maxContentManualPublishesPerRunValue =
      maxContentManualPublishesPerRun.value ?? DEFAULT_MAX_CONTENT_MANUAL_PUBLISHES_PER_RUN;
  }

  let maxContentManualPublishesPerAccountValue = DEFAULT_MAX_CONTENT_MANUAL_PUBLISHES_PER_ACCOUNT;
  const maxContentManualPublishesPerAccount = parseOptionalNonNegativeInteger(
    raw.maxContentManualPublishesPerAccount,
    "maxContentManualPublishesPerAccount",
  );
  if (!maxContentManualPublishesPerAccount.ok) {
    issues.push(maxContentManualPublishesPerAccount.issue);
  } else {
    maxContentManualPublishesPerAccountValue =
      maxContentManualPublishesPerAccount.value ?? DEFAULT_MAX_CONTENT_MANUAL_PUBLISHES_PER_ACCOUNT;
  }

  let maxContentTitleLengthValue = DEFAULT_MAX_CONTENT_TITLE_LENGTH;
  const maxContentTitleLength = parseOptionalNonNegativeInteger(
    raw.maxContentTitleLength,
    "maxContentTitleLength",
  );
  if (!maxContentTitleLength.ok) {
    issues.push(maxContentTitleLength.issue);
  } else {
    maxContentTitleLengthValue =
      maxContentTitleLength.value ?? DEFAULT_MAX_CONTENT_TITLE_LENGTH;
  }

  let aiDraftsEnabledValue = false;
  const aiDraftsEnabled = parseOptionalBoolean(
    raw.aiDraftsEnabled,
    "aiDraftsEnabled",
  );
  if (!aiDraftsEnabled.ok) {
    issues.push(aiDraftsEnabled.issue);
  } else {
    aiDraftsEnabledValue = aiDraftsEnabled.value ?? false;
  }

  let aiDraftProviderValue: AiDraftProviderName = DEFAULT_AI_DRAFT_PROVIDER;
  const aiDraftProvider = parseOptionalString(raw.aiDraftProvider, "aiDraftProvider");
  if (!aiDraftProvider.ok) {
    issues.push(aiDraftProvider.issue);
  } else if (
    aiDraftProvider.value !== undefined &&
    aiDraftProvider.value !== DEFAULT_AI_DRAFT_PROVIDER
  ) {
    issues.push({
      field: "aiDraftProvider",
      code: "invalid_ai_draft_provider",
      message: "aiDraftProvider musi miec wartosc openai-compatible."
    });
  } else {
    aiDraftProviderValue = aiDraftProvider.value ?? DEFAULT_AI_DRAFT_PROVIDER;
  }

  let aiDraftModelValue = DEFAULT_AI_DRAFT_MODEL;
  const aiDraftModel = parseOptionalString(raw.aiDraftModel, "aiDraftModel");
  if (!aiDraftModel.ok) {
    issues.push(aiDraftModel.issue);
  } else if (aiDraftModel.value !== undefined && aiDraftModel.value.length === 0) {
    issues.push({
      field: "aiDraftModel",
      code: "invalid_ai_draft_model",
      message: "aiDraftModel nie moze byc pusty."
    });
  } else {
    aiDraftModelValue = aiDraftModel.value ?? DEFAULT_AI_DRAFT_MODEL;
  }

  let maxContentAiDraftsPerRunValue = DEFAULT_MAX_CONTENT_AI_DRAFTS_PER_RUN;
  const maxContentAiDraftsPerRun = parseOptionalNonNegativeInteger(
    raw.maxContentAiDraftsPerRun,
    "maxContentAiDraftsPerRun",
  );
  if (!maxContentAiDraftsPerRun.ok) {
    issues.push(maxContentAiDraftsPerRun.issue);
  } else {
    maxContentAiDraftsPerRunValue =
      maxContentAiDraftsPerRun.value ?? DEFAULT_MAX_CONTENT_AI_DRAFTS_PER_RUN;
  }

  let maxContentDraftTextLengthValue = DEFAULT_MAX_CONTENT_DRAFT_TEXT_LENGTH;
  const maxContentDraftTextLength = parseOptionalNonNegativeInteger(
    raw.maxContentDraftTextLength,
    "maxContentDraftTextLength",
  );
  if (!maxContentDraftTextLength.ok) {
    issues.push(maxContentDraftTextLength.issue);
  } else {
    maxContentDraftTextLengthValue =
      maxContentDraftTextLength.value ?? DEFAULT_MAX_CONTENT_DRAFT_TEXT_LENGTH;
  }

  let maxContentDraftTitleLengthValue = DEFAULT_MAX_CONTENT_DRAFT_TITLE_LENGTH;
  const maxContentDraftTitleLength = parseOptionalNonNegativeInteger(
    raw.maxContentDraftTitleLength,
    "maxContentDraftTitleLength",
  );
  if (!maxContentDraftTitleLength.ok) {
    issues.push(maxContentDraftTitleLength.issue);
  } else {
    maxContentDraftTitleLengthValue =
      maxContentDraftTitleLength.value ?? DEFAULT_MAX_CONTENT_DRAFT_TITLE_LENGTH;
  }

  let requireFinalManualConfirmBeforePublishValue = true;
  const requireFinalManualConfirmBeforePublish = parseOptionalBoolean(
    raw.requireFinalManualConfirmBeforePublish,
    "requireFinalManualConfirmBeforePublish",
  );
  if (!requireFinalManualConfirmBeforePublish.ok) {
    issues.push(requireFinalManualConfirmBeforePublish.issue);
  } else {
    requireFinalManualConfirmBeforePublishValue =
      requireFinalManualConfirmBeforePublish.value ?? true;
  }

  let requireManualApprovalForContentValue = true;
  const requireManualApprovalForContent = parseOptionalBoolean(
    raw.requireManualApprovalForContent,
    "requireManualApprovalForContent",
  );
  if (!requireManualApprovalForContent.ok) {
    issues.push(requireManualApprovalForContent.issue);
  } else {
    requireManualApprovalForContentValue =
      requireManualApprovalForContent.value ?? true;
  }

  let contentDryRunDefaultValue = true;
  const contentDryRunDefault = parseOptionalBoolean(
    raw.contentDryRunDefault,
    "contentDryRunDefault",
  );
  if (!contentDryRunDefault.ok) {
    issues.push(contentDryRunDefault.issue);
  } else {
    contentDryRunDefaultValue = contentDryRunDefault.value ?? true;
  }

  if (issues.length > 0) {
    return { config: null, issues };
  }

  return {
    config: {
      headless: headlessValue,
      timeoutMs: timeoutMsValue,
      slowMo: slowMoValue,
      debugScreenshots: debugScreenshotsValue,
      baseUrl: baseUrlValue,
      screenshotOnError: screenshotOnErrorValue,
      takeHtmlSnapshotOnError: takeHtmlSnapshotOnErrorValue,
      delayBetweenTargetsMs: delayBetweenTargetsMsValue,
      ...(accountsV2PathValue ? { accountsV2Path: accountsV2PathValue } : {}),
      ...(maxFollowsPerRunValue !== undefined
        ? { maxFollowsPerRun: maxFollowsPerRunValue }
        : {}),
      ...(preflightOperationWarningThresholdValue !== undefined
        ? { preflightOperationWarningThreshold: preflightOperationWarningThresholdValue }
        : {}),
      requireManualConfirmForLargeRun: requireManualConfirmForLargeRunValue,
      maxContentActionsPerRun: maxContentActionsPerRunValue,
      maxContentActionsPerAccount: maxContentActionsPerAccountValue,
      maxContentPublishesPerRun: maxContentPublishesPerRunValue,
      maxContentPublishesPerAccount: maxContentPublishesPerAccountValue,
      maxContentBrowserDryRunPerRun: maxContentBrowserDryRunPerRunValue,
      maxContentBrowserDryRunPerAccount: maxContentBrowserDryRunPerAccountValue,
      maxContentManualPublishesPerRun: maxContentManualPublishesPerRunValue,
      maxContentManualPublishesPerAccount: maxContentManualPublishesPerAccountValue,
      maxContentTitleLength: maxContentTitleLengthValue,
      aiDraftsEnabled: aiDraftsEnabledValue,
      aiDraftProvider: aiDraftProviderValue,
      aiDraftModel: aiDraftModelValue,
      maxContentAiDraftsPerRun: maxContentAiDraftsPerRunValue,
      maxContentDraftTextLength: maxContentDraftTextLengthValue,
      maxContentDraftTitleLength: maxContentDraftTitleLengthValue,
      requireFinalManualConfirmBeforePublish: requireFinalManualConfirmBeforePublishValue,
      requireManualApprovalForContent: requireManualApprovalForContentValue,
      contentDryRunDefault: contentDryRunDefaultValue
    },
    issues: []
  };
}

function readTextFile(filePath: string): { ok: true; text: string } | { ok: false; error: InputFileError } {
  try {
    return {
      ok: true,
      text: readFileSync(filePath, "utf-8").replace(/^\uFEFF/, "")
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      error: toFileError(filePath, message)
    };
  }
}

function readJsonFile(filePath: string): { ok: true; value: RawAppSettingsRecord } | { ok: false; error: InputFileError } {
  const textResult = readTextFile(filePath);
  if (!textResult.ok) {
    return textResult;
  }

  try {
    const parsed = JSON.parse(textResult.text);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {
        ok: false,
        error: toFileError(filePath, "Plik musi zawierać obiekt JSON.")
      };
    }

    return { ok: true, value: parsed as RawAppSettingsRecord };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      error: toFileError(filePath, message)
    };
  }
}

function parseCsvRows(filePath: string, requiredHeaders: readonly string[]): {
  ok: true;
  headers: string[];
  rows: Array<{ rowNumber: number; row: Record<string, string> }>;
} | {
  ok: false;
  error: InputFileError;
} {
  const textResult = readTextFile(filePath);
  if (!textResult.ok) {
    return textResult;
  }

  const lines = textResult.text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (lines.length === 0) {
    return {
      ok: false,
      error: toFileError(filePath, "Plik CSV jest pusty.")
    };
  }

  if (lines.length < 2) {
    return {
      ok: false,
      error: toFileError(filePath, "Plik CSV nie zawiera danych.")
    };
  }

  const headers = parseCsvLine(lines[0]);
  const missingHeaders = requiredHeaders.filter((header) => !headers.includes(header));

  if (missingHeaders.length > 0) {
    return {
      ok: false,
      error: toFileError(filePath, `Brakuje nagłówków CSV: ${missingHeaders.join(", ")}.`)
    };
  }

  const rows = lines.slice(1).map((line, index) => {
    const values = parseCsvLine(line);
    const row: Record<string, string> = {};

    headers.forEach((header, headerIndex) => {
      row[header] = values[headerIndex] ?? "";
    });

    return {
      rowNumber: index + 2,
      row
    };
  });

  return { ok: true, headers, rows };
}

function requiredTextIssue(field: string): ValidationIssue {
  return {
    field,
    code: "missing_required_field",
    message: `${field} jest wymagane.`
  };
}

function parseAccountLanguage(value: string | undefined): {
  ok: true;
  value: string;
} | {
  ok: false;
  issue: ValidationIssue;
} {
  const trimmed = value?.trim() ?? "";

  if (trimmed.length === 0) {
    return { ok: true, value: DEFAULT_ACCOUNT_LANGUAGE };
  }

  if (trimmed === DEFAULT_ACCOUNT_LANGUAGE) {
    return { ok: true, value: DEFAULT_ACCOUNT_LANGUAGE };
  }

  if (/^[a-z]{2,3}$/i.test(trimmed)) {
    return { ok: true, value: trimmed.toLowerCase() };
  }

  return {
    ok: false,
    issue: {
      field: "language",
      code: "invalid_language",
      message: "language musi byc krotkim kodem jezyka, np. pl, en, fr, de, es albo it."
    }
  };
}

function buildValidAccount(row: RawAccountRecord): {
  valid: true;
  account: ValidAccountRecord;
} | {
  valid: false;
  issues: ValidationIssue[];
} {
  const issues: ValidationIssue[] = [];

  if (!isNonEmptyText(row.account_id)) {
    issues.push(requiredTextIssue("account_id"));
  }

  if (!isNonEmptyText(row.email)) {
    issues.push(requiredTextIssue("email"));
  } else if (!isEmailLike(row.email.trim())) {
    issues.push({
      field: "email",
      code: "invalid_email",
      message: "email musi wyglądać jak adres e-mail."
    });
  }

  if (!isNonEmptyText(row.password)) {
    issues.push(requiredTextIssue("password"));
  }

  let languageValue = DEFAULT_ACCOUNT_LANGUAGE;
  const language = parseAccountLanguage(row.language);
  if (!language.ok) {
    issues.push(language.issue);
  } else {
    languageValue = language.value;
  }

  if (issues.length > 0) {
    return { valid: false, issues };
  }

  return {
    valid: true,
    account: {
      account_id: row.account_id!.trim(),
      email: row.email!.trim(),
      password: row.password!.trim(),
      enabled: true,
      language: languageValue,
      note: row.note?.trim() ?? ""
    }
  };
}

function buildValidTarget(row: RawTargetRecord): {
  valid: true;
  target: ValidTargetRecord;
} | {
  valid: false;
  issues: ValidationIssue[];
} {
  const issues: ValidationIssue[] = [];
  const allowedTargetTypes = new Set<TargetType>(["profile_url", "email", "full_name"]);

  if (!isNonEmptyText(row.target_id)) {
    issues.push(requiredTextIssue("target_id"));
  }

  if (!isNonEmptyText(row.target_type)) {
    issues.push(requiredTextIssue("target_type"));
  } else if (!allowedTargetTypes.has(row.target_type.trim() as TargetType)) {
    issues.push({
      field: "target_type",
      code: "invalid_target_type",
      message: "target_type musi mieć wartość profile_url, email albo full_name."
    });
  }

  if (!isNonEmptyText(row.target_value)) {
    issues.push(requiredTextIssue("target_value"));
  }

  if (issues.length > 0) {
    return { valid: false, issues };
  }

  return {
    valid: true,
    target: {
      target_id: row.target_id!.trim(),
      target_type: row.target_type!.trim() as TargetType,
      target_value: row.target_value!.trim(),
      enabled: true,
      note: row.note?.trim() ?? ""
    }
  };
}

function mapAccountRows(rows: Array<{ rowNumber: number; row: Record<string, string> }>): {
  valid: ValidAccountRecord[];
  rejected: RejectedAccountRecord[];
} {
  const valid: ValidAccountRecord[] = [];
  const rejected: RejectedAccountRecord[] = [];

  for (const { rowNumber, row } of rows) {
    const enabled = parseStrictBoolean(row.enabled, "enabled");
    if (!enabled.ok) {
      rejected.push({
        rowNumber,
        raw: row as RawAccountRecord,
        issues: [enabled.issue]
      });
      continue;
    }

    if (!enabled.value) {
      continue;
    }

    const built = buildValidAccount(row as RawAccountRecord);
    if (built.valid) {
      valid.push(built.account);
      continue;
    }

    rejected.push({
      rowNumber,
      raw: row as RawAccountRecord,
      issues: built.issues
    });
  }

  return { valid, rejected };
}

function formatGeneratedAccountId(rowNumber: number): string {
  return `acc_${String(Math.max(rowNumber - 1, 1)).padStart(3, "0")}`;
}

function mapAccountRowsV2(rows: Array<{ rowNumber: number; row: Record<string, string> }>): {
  valid: ValidAccountRecord[];
  rejected: RejectedAccountRecord[];
} {
  const valid: ValidAccountRecord[] = [];
  const rejected: RejectedAccountRecord[] = [];

  for (const { rowNumber, row } of rows) {
    const adaptedRow: RawAccountRecord = {
      account_id: formatGeneratedAccountId(rowNumber),
      email: row.email ?? "",
      password: row.password ?? "",
      enabled: "true",
      language: row.language ?? "",
      note: ""
    };

    const built = buildValidAccount(adaptedRow);
    if (built.valid) {
      valid.push(built.account);
      continue;
    }

    rejected.push({
      rowNumber,
      raw: adaptedRow,
      issues: built.issues
    });
  }

  return { valid, rejected };
}

function resolveConfiguredPath(configPath: string, configuredPath: string): string {
  if (path.isAbsolute(configuredPath)) {
    return configuredPath;
  }

  return path.resolve(path.dirname(configPath), configuredPath);
}

function loadAccountsFromSource(filePath: string): {
  valid: ValidAccountRecord[];
  rejected: RejectedAccountRecord[];
} | {
  error: InputFileError;
} {
  const v1Result = parseCsvRows(filePath, REQUIRED_ACCOUNT_HEADERS);
  if (v1Result.ok) {
    return mapAccountRows(v1Result.rows);
  }

  const v2Result = parseCsvRows(filePath, REQUIRED_ACCOUNT_V2_HEADERS);
  if (v2Result.ok) {
    return mapAccountRowsV2(v2Result.rows);
  }

  return { error: v1Result.error };
}

function mapTargetRows(rows: Array<{ rowNumber: number; row: Record<string, string> }>): {
  valid: ValidTargetRecord[];
  rejected: RejectedTargetRecord[];
} {
  const valid: ValidTargetRecord[] = [];
  const rejected: RejectedTargetRecord[] = [];

  for (const { rowNumber, row } of rows) {
    const enabled = parseStrictBoolean(row.enabled, "enabled");
    if (!enabled.ok) {
      rejected.push({
        rowNumber,
        raw: row as RawTargetRecord,
        issues: [enabled.issue],
        mappedResult: "invalid_target"
      });
      continue;
    }

    if (!enabled.value) {
      continue;
    }

    const built = buildValidTarget(row as RawTargetRecord);
    if (built.valid) {
      valid.push(built.target);
      continue;
    }

    rejected.push({
      rowNumber,
      raw: row as RawTargetRecord,
      issues: built.issues,
      mappedResult: "invalid_target"
    });
  }

  return { valid, rejected };
}

export function loadAppInputs(paths?: Partial<InputPaths>): LoadedInputData {
  const resolvedPaths = resolveInputPaths(paths);
  const result = emptyResult();
  let accountsSourcePath = resolvedPaths.accountsPath;

  const configResult = readJsonFile(resolvedPaths.configPath);
  if (!configResult.ok) {
    result.fileErrors.push(configResult.error);
  } else {
    const parsedConfig = parseConfig(configResult.value);
    if (parsedConfig.config) {
      result.config = parsedConfig.config;
    } else {
      result.fileErrors.push(
        toFileError(
          resolvedPaths.configPath,
          parsedConfig.issues.map((issue) => issue.message).join(" ")
        )
      );
    }

    if (parsedConfig.config?.accountsV2Path) {
      accountsSourcePath = resolveConfiguredPath(
        resolvedPaths.configPath,
        parsedConfig.config.accountsV2Path
      );
    }
  }

  const accountsResult = loadAccountsFromSource(accountsSourcePath);
  if ("error" in accountsResult) {
    result.fileErrors.push(accountsResult.error);
  } else {
    result.accountsValid.push(...accountsResult.valid);
    result.accountsRejected.push(...accountsResult.rejected);
  }

  const targetsResult = parseCsvRows(resolvedPaths.targetsPath, REQUIRED_TARGET_HEADERS);
  if (!targetsResult.ok) {
    result.fileErrors.push(targetsResult.error);
  } else {
    const mappedTargets = mapTargetRows(targetsResult.rows);
    result.targetsValid.push(...mappedTargets.valid);
    result.targetsRejected.push(...mappedTargets.rejected);
  }

  return result;
}
