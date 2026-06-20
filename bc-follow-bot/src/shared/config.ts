import { readFileSync } from "node:fs";
import path from "node:path";
import dotenv from "dotenv";
import { AppSettings } from "./types";

dotenv.config();

const DEFAULT_CONFIG_PATH = path.resolve(process.cwd(), "config", "appsettings.json");
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

function assertOptionalNonNegativeInteger(
  value: unknown,
  field: string
): asserts value is number | undefined {
  if (
    value !== undefined &&
    (
      typeof value !== "number" ||
      !Number.isInteger(value) ||
      value < 0
    )
  ) {
    throw new Error(`config/appsettings.json: invalid '${field}'`);
  }
}

function assertOptionalBoolean(
  value: unknown,
  field: string
): asserts value is boolean | undefined {
  if (value !== undefined && typeof value !== "boolean") {
    throw new Error(`config/appsettings.json: invalid '${field}'`);
  }
}

function assertOptionalString(
  value: unknown,
  field: string
): asserts value is string | undefined {
  if (value !== undefined && typeof value !== "string") {
    throw new Error(`config/appsettings.json: invalid '${field}'`);
  }
}

export function loadAppSettings(configPath = DEFAULT_CONFIG_PATH): AppSettings {
  const raw = readFileSync(configPath, "utf-8").replace(/^\uFEFF/, "");
  const parsed = JSON.parse(raw) as Partial<AppSettings>;

  if (typeof parsed.headless !== "boolean") {
    throw new Error("config/appsettings.json: missing or invalid 'headless'");
  }

  if (typeof parsed.timeoutMs !== "number") {
    throw new Error("config/appsettings.json: missing or invalid 'timeoutMs'");
  }

  if (typeof parsed.slowMo !== "number") {
    throw new Error("config/appsettings.json: missing or invalid 'slowMo'");
  }

  if (typeof parsed.debugScreenshots !== "boolean") {
    throw new Error("config/appsettings.json: missing or invalid 'debugScreenshots'");
  }

  if (typeof parsed.baseUrl !== "string" || parsed.baseUrl.trim() === "") {
    throw new Error("config/appsettings.json: missing or invalid 'baseUrl'");
  }

  if (typeof parsed.screenshotOnError !== "boolean") {
    throw new Error("config/appsettings.json: missing or invalid 'screenshotOnError'");
  }

  if (typeof parsed.takeHtmlSnapshotOnError !== "boolean") {
    throw new Error("config/appsettings.json: missing or invalid 'takeHtmlSnapshotOnError'");
  }

  if (typeof parsed.delayBetweenTargetsMs !== "number") {
    throw new Error("config/appsettings.json: missing or invalid 'delayBetweenTargetsMs'");
  }

  if (
    parsed.accountsV2Path !== undefined &&
    typeof parsed.accountsV2Path !== "string"
  ) {
    throw new Error("config/appsettings.json: invalid 'accountsV2Path'");
  }

  assertOptionalNonNegativeInteger(parsed.maxFollowsPerRun, "maxFollowsPerRun");

  assertOptionalNonNegativeInteger(
    parsed.preflightOperationWarningThreshold,
    "preflightOperationWarningThreshold"
  );

  assertOptionalBoolean(parsed.requireManualConfirmForLargeRun, "requireManualConfirmForLargeRun");
  assertOptionalNonNegativeInteger(parsed.maxContentActionsPerRun, "maxContentActionsPerRun");
  assertOptionalNonNegativeInteger(parsed.maxContentActionsPerAccount, "maxContentActionsPerAccount");
  assertOptionalNonNegativeInteger(parsed.maxContentPublishesPerRun, "maxContentPublishesPerRun");
  assertOptionalNonNegativeInteger(
    parsed.maxContentPublishesPerAccount,
    "maxContentPublishesPerAccount"
  );
  assertOptionalNonNegativeInteger(
    parsed.maxContentBrowserDryRunPerRun,
    "maxContentBrowserDryRunPerRun"
  );
  assertOptionalNonNegativeInteger(
    parsed.maxContentBrowserDryRunPerAccount,
    "maxContentBrowserDryRunPerAccount"
  );
  assertOptionalNonNegativeInteger(
    parsed.maxContentManualPublishesPerRun,
    "maxContentManualPublishesPerRun"
  );
  assertOptionalNonNegativeInteger(
    parsed.maxContentManualPublishesPerAccount,
    "maxContentManualPublishesPerAccount"
  );
  assertOptionalNonNegativeInteger(parsed.maxContentTitleLength, "maxContentTitleLength");
  assertOptionalBoolean(parsed.aiDraftsEnabled, "aiDraftsEnabled");
  assertOptionalString(parsed.aiDraftProvider, "aiDraftProvider");
  if (
    parsed.aiDraftProvider !== undefined &&
    parsed.aiDraftProvider.trim() !== DEFAULT_AI_DRAFT_PROVIDER
  ) {
    throw new Error("config/appsettings.json: invalid 'aiDraftProvider'");
  }
  assertOptionalString(parsed.aiDraftModel, "aiDraftModel");
  if (parsed.aiDraftModel !== undefined && parsed.aiDraftModel.trim().length === 0) {
    throw new Error("config/appsettings.json: invalid 'aiDraftModel'");
  }
  assertOptionalNonNegativeInteger(parsed.maxContentAiDraftsPerRun, "maxContentAiDraftsPerRun");
  assertOptionalNonNegativeInteger(parsed.maxContentDraftTextLength, "maxContentDraftTextLength");
  assertOptionalNonNegativeInteger(parsed.maxContentDraftTitleLength, "maxContentDraftTitleLength");
  assertOptionalBoolean(
    parsed.requireFinalManualConfirmBeforePublish,
    "requireFinalManualConfirmBeforePublish"
  );
  assertOptionalBoolean(parsed.requireManualApprovalForContent, "requireManualApprovalForContent");
  assertOptionalBoolean(parsed.contentDryRunDefault, "contentDryRunDefault");

  if (
    parsed.discoveryInputPath !== undefined &&
    typeof parsed.discoveryInputPath !== "string"
  ) {
    throw new Error("config/appsettings.json: invalid 'discoveryInputPath'");
  }

  if (
    parsed.discoveryOutputDir !== undefined &&
    typeof parsed.discoveryOutputDir !== "string"
  ) {
    throw new Error("config/appsettings.json: invalid 'discoveryOutputDir'");
  }

  return {
    headless: parsed.headless,
    timeoutMs: parsed.timeoutMs,
    slowMo: parsed.slowMo,
    debugScreenshots: parsed.debugScreenshots,
    baseUrl: parsed.baseUrl,
    screenshotOnError: parsed.screenshotOnError,
    takeHtmlSnapshotOnError: parsed.takeHtmlSnapshotOnError,
    delayBetweenTargetsMs: parsed.delayBetweenTargetsMs,
    ...(parsed.accountsV2Path && parsed.accountsV2Path.trim().length > 0
      ? { accountsV2Path: parsed.accountsV2Path.trim() }
      : {}),
    ...(parsed.maxFollowsPerRun !== undefined
      ? { maxFollowsPerRun: parsed.maxFollowsPerRun }
      : {}),
    ...(parsed.preflightOperationWarningThreshold !== undefined
      ? { preflightOperationWarningThreshold: parsed.preflightOperationWarningThreshold }
      : {}),
    requireManualConfirmForLargeRun:
      parsed.requireManualConfirmForLargeRun ?? true,
    ...(parsed.discoveryInputPath && parsed.discoveryInputPath.trim().length > 0
      ? { discoveryInputPath: parsed.discoveryInputPath.trim() }
      : {}),
    ...(parsed.discoveryOutputDir && parsed.discoveryOutputDir.trim().length > 0
      ? { discoveryOutputDir: parsed.discoveryOutputDir.trim() }
      : {}),
    maxContentActionsPerRun:
      parsed.maxContentActionsPerRun ?? DEFAULT_MAX_CONTENT_ACTIONS_PER_RUN,
    maxContentActionsPerAccount:
      parsed.maxContentActionsPerAccount ?? DEFAULT_MAX_CONTENT_ACTIONS_PER_ACCOUNT,
    maxContentPublishesPerRun:
      parsed.maxContentPublishesPerRun ?? DEFAULT_MAX_CONTENT_PUBLISHES_PER_RUN,
    maxContentPublishesPerAccount:
      parsed.maxContentPublishesPerAccount ?? DEFAULT_MAX_CONTENT_PUBLISHES_PER_ACCOUNT,
    maxContentBrowserDryRunPerRun:
      parsed.maxContentBrowserDryRunPerRun ?? DEFAULT_MAX_CONTENT_BROWSER_DRY_RUN_PER_RUN,
    maxContentBrowserDryRunPerAccount:
      parsed.maxContentBrowserDryRunPerAccount ?? DEFAULT_MAX_CONTENT_BROWSER_DRY_RUN_PER_ACCOUNT,
    maxContentManualPublishesPerRun:
      parsed.maxContentManualPublishesPerRun ?? DEFAULT_MAX_CONTENT_MANUAL_PUBLISHES_PER_RUN,
    maxContentManualPublishesPerAccount:
      parsed.maxContentManualPublishesPerAccount ?? DEFAULT_MAX_CONTENT_MANUAL_PUBLISHES_PER_ACCOUNT,
    maxContentTitleLength:
      parsed.maxContentTitleLength ?? DEFAULT_MAX_CONTENT_TITLE_LENGTH,
    aiDraftsEnabled: parsed.aiDraftsEnabled ?? false,
    aiDraftProvider:
      (parsed.aiDraftProvider?.trim() as typeof DEFAULT_AI_DRAFT_PROVIDER | undefined) ??
      DEFAULT_AI_DRAFT_PROVIDER,
    aiDraftModel: parsed.aiDraftModel?.trim() ?? DEFAULT_AI_DRAFT_MODEL,
    maxContentAiDraftsPerRun:
      parsed.maxContentAiDraftsPerRun ?? DEFAULT_MAX_CONTENT_AI_DRAFTS_PER_RUN,
    maxContentDraftTextLength:
      parsed.maxContentDraftTextLength ?? DEFAULT_MAX_CONTENT_DRAFT_TEXT_LENGTH,
    maxContentDraftTitleLength:
      parsed.maxContentDraftTitleLength ?? DEFAULT_MAX_CONTENT_DRAFT_TITLE_LENGTH,
    requireFinalManualConfirmBeforePublish:
      parsed.requireFinalManualConfirmBeforePublish ?? true,
    requireManualApprovalForContent:
      parsed.requireManualApprovalForContent ?? true,
    contentDryRunDefault: parsed.contentDryRunDefault ?? true
  };
}
