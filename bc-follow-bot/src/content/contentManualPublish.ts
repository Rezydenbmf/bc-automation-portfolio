import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { Browser, BrowserContext, chromium, Page } from "playwright";
import { loginAccount as loginAccountDefault, LoginActionResult } from "../auth/authService";
import type { AccountRow, AppSettings } from "../shared/types";
import type { ContentActionType, ContentTargetType } from "./types";
import {
  findLatestContentPublishPlanFile,
  readContentPublishPlanFile,
  type PublishPlanCsvRow
} from "./contentBrowserDryRun";
import { escapeContentCsvValue, formatContentRunId } from "./contentDryRunExport";

const CONTENT_PUBLISH_RESULTS_DIR = path.resolve(process.cwd(), "logs", "content-publish-results");
const ALLOWED_BROWSER_CHANNELS = new Set(["msedge", "chrome"]);

const CONTENT_PUBLISH_RESULT_HEADERS = [
  "content_action_id",
  "account_id",
  "target_type",
  "target_value",
  "content_type",
  "publish_result_status",
  "result_note",
  "publish_status",
  "reason",
  "title_present",
  "title_length",
  "title_filled",
  "title_field_seen",
  "title_reason",
  "published_at",
  "dry_run_only",
  "manual_confirmed",
  "final_confirmed"
] as const;

const ALLOWED_TARGET_TYPES = new Set<ContentTargetType>(["profile_url", "post_url", "manual"]);
const OPENABLE_TARGET_TYPES = new Set<ContentTargetType>(["profile_url", "post_url"]);
const ALLOWED_CONTENT_TYPES = new Set<ContentActionType>(["comment", "post"]);

const EDITOR_CANDIDATES = [
  { selector: "textarea", note: "textarea" },
  { selector: "input", note: "input" },
  { selector: '[contenteditable="true"]', note: "contenteditable" },
  { selector: 'div[contenteditable="true"]', note: "div_contenteditable" },
  { selector: '[contenteditable="true"][role="textbox"]', note: "contenteditable_textbox" },
  { selector: '[role="textbox"]', note: "role_textbox" }
] as const;

const POST_PROFILE_WRITE_SOMETHING_TRIGGER_CANDIDATES = [
  {
    selector: 'button:has-text("Write something...")',
    note: "profile_write_something_button"
  },
  {
    selector: 'section:has-text("New Post") textarea[placeholder="Write something..."]',
    note: "new_post_write_something_textarea_trigger"
  },
  {
    selector: 'section:has-text("New Post") input[placeholder="Write something..."]',
    note: "new_post_write_something_input_trigger"
  },
  {
    selector: 'section:has-text("New Post") textarea[placeholder*="Write something"]',
    note: "new_post_write_something_textarea_contains_trigger"
  },
  {
    selector: 'section:has-text("New Post") input[placeholder*="Write something"]',
    note: "new_post_write_something_input_contains_trigger"
  },
  {
    selector: 'section:has-text("New Post") [contenteditable="true"][data-placeholder="Write something..."]',
    note: "new_post_write_something_contenteditable_data_placeholder_trigger"
  },
  {
    selector: 'section:has-text("New Post") [contenteditable="true"][aria-label="Write something..."]',
    note: "new_post_write_something_contenteditable_aria_trigger"
  },
  {
    selector: 'section:has-text("New Post") [role="textbox"][aria-label="Write something..."]',
    note: "new_post_write_something_role_textbox_aria_trigger"
  },
  {
    selector: 'div:has-text("New Post") textarea[placeholder="Write something..."]',
    note: "new_post_container_write_something_textarea_trigger"
  },
  {
    selector: 'div:has-text("New Post") input[placeholder="Write something..."]',
    note: "new_post_container_write_something_input_trigger"
  },
  {
    selector: 'div:has-text("New Post") [contenteditable="true"][data-placeholder="Write something..."]',
    note: "new_post_container_write_something_contenteditable_data_placeholder_trigger"
  },
  {
    selector: 'textarea[placeholder="Write something..."]',
    note: "write_something_textarea_trigger"
  },
  {
    selector: 'input[placeholder="Write something..."]',
    note: "write_something_input_trigger"
  },
  {
    selector: 'textarea[placeholder*="Write something"]',
    note: "write_something_textarea_contains_trigger"
  },
  {
    selector: 'input[placeholder*="Write something"]',
    note: "write_something_input_contains_trigger"
  },
  {
    selector: '[contenteditable="true"][data-placeholder="Write something..."]',
    note: "write_something_contenteditable_data_placeholder_trigger"
  },
  {
    selector: '[contenteditable="true"][aria-label="Write something..."]',
    note: "write_something_contenteditable_aria_trigger"
  },
  {
    selector: '[role="textbox"][aria-label="Write something..."]',
    note: "write_something_role_textbox_aria_trigger"
  }
] as const;

const ADD_NEW_POST_MODAL_SELECTORS = [
  '[role="dialog"]:has-text("Add new post")',
  'dialog:has-text("Add new post")',
  'div:has-text("Add new post")'
] as const;

const POST_MODAL_BODY_EDITOR_CANDIDATES = [
  {
    selector: '[role="dialog"]:has-text("Add new post") textarea[placeholder="Write something"]',
    note: "modal_write_something_textarea"
  },
  {
    selector: 'dialog:has-text("Add new post") textarea[placeholder="Write something"]',
    note: "dialog_write_something_textarea"
  },
  {
    selector: '[role="dialog"]:has-text("Add new post") textarea[placeholder*="Write something"]',
    note: "modal_write_something_textarea_contains"
  },
  {
    selector: 'dialog:has-text("Add new post") textarea[placeholder*="Write something"]',
    note: "dialog_write_something_textarea_contains"
  },
  {
    selector: '[role="dialog"]:has-text("Add new post") [contenteditable="true"][data-placeholder="Write something"]',
    note: "modal_write_something_contenteditable_data_placeholder"
  },
  {
    selector: '[role="dialog"]:has-text("Add new post") [contenteditable="true"][aria-label="Write something"]',
    note: "modal_write_something_contenteditable_aria"
  },
  {
    selector: '[role="dialog"]:has-text("Add new post") [role="textbox"][aria-label="Write something"]',
    note: "modal_write_something_role_textbox_aria"
  },
  {
    selector: 'div:has-text("Add new post") textarea[placeholder="Write something"]',
    note: "modal_container_write_something_textarea"
  },
  {
    selector: 'div:has-text("Add new post") [contenteditable="true"][data-placeholder="Write something"]',
    note: "modal_container_write_something_contenteditable_data_placeholder"
  }
] as const;

const POST_MODAL_TITLE_FIELD_SELECTORS = [
  '[role="dialog"]:has-text("Add new post") input[placeholder="Title"]',
  'dialog:has-text("Add new post") input[placeholder="Title"]',
  'div:has-text("Add new post") input[placeholder="Title"]'
] as const;

const POST_MODAL_ADD_POST_BUTTON_SELECTORS = [
  '[role="dialog"]:has-text("Add new post") button:has-text("Add post")',
  'dialog:has-text("Add new post") button:has-text("Add post")',
  'div:has-text("Add new post") button:has-text("Add post")',
  '[role="dialog"]:has-text("Add new post") [role="button"]:has-text("Add post")',
  'dialog:has-text("Add new post") [role="button"]:has-text("Add post")',
  'div:has-text("Add new post") [role="button"]:has-text("Add post")'
] as const;

const PUBLISH_SUCCESS_SIGNAL_SELECTORS = [
  '[role="alert"]:has-text("Success")',
  '[role="alert"]:has-text("success")',
  '[role="alert"]:has-text("Published")',
  '[role="alert"]:has-text("published")',
  '[role="status"]:has-text("Success")',
  '[role="status"]:has-text("success")',
  '[role="status"]:has-text("Published")',
  '[role="status"]:has-text("published")',
  'text=/post\\s+(published|added|created)/i',
  'text=/content\\s+(published|added|created)/i'
] as const;

const SEARCH_FIELD_CANDIDATES = [
  { selector: 'input[type="search"]', note: "type_search" },
  { selector: 'input[placeholder*="Search"]', note: "placeholder_search" },
  { selector: 'input[placeholder*="search"]', note: "placeholder_search_lower" },
  { selector: '[role="searchbox"]', note: "role_searchbox" },
  { selector: 'header input', note: "header_input" },
  { selector: 'header [role="textbox"]', note: "header_textbox" },
  { selector: '[aria-label*="Search"]', note: "aria_search" },
  { selector: '[aria-label*="search"]', note: "aria_search_lower" }
] as const;

const POST_COMPOSER_TRIGGER_CANDIDATES = [
  { selector: 'button:has-text("Create post")', note: "create_post_button" },
  { selector: 'button:has-text("Start a post")', note: "start_a_post_button" },
  { selector: 'button:has-text("Write a post")', note: "write_a_post_button" },
  { selector: 'button:has-text("Write post")', note: "write_post_button" },
  { selector: 'button:has-text("Add post")', note: "add_post_button" },
  { selector: 'button:has-text("New post")', note: "new_post_button" },
  { selector: 'button:has-text("Share an update")', note: "share_update_button" },
  { selector: 'button:has-text("What are you thinking")', note: "what_are_you_thinking_button" },
  { selector: 'button:has-text("Utworz post")', note: "utworz_post_button" },
  { selector: 'button:has-text("Napisz post")', note: "napisz_post_button" },
  { selector: 'button:has-text("O czym myslisz")', note: "o_czym_myslisz_button" },
  { selector: '[role="button"]:has-text("Create post")', note: "create_post_role_button" },
  { selector: '[role="button"]:has-text("Start a post")', note: "start_a_post_role_button" },
  { selector: '[role="button"]:has-text("Write a post")', note: "write_a_post_role_button" },
  { selector: '[role="button"]:has-text("Write post")', note: "write_post_role_button" },
  { selector: '[role="button"]:has-text("Add post")', note: "add_post_role_button" },
  { selector: '[role="button"]:has-text("New post")', note: "new_post_role_button" },
  { selector: '[role="button"]:has-text("Share an update")', note: "share_update_role_button" },
  { selector: '[role="button"]:has-text("What are you thinking")', note: "what_are_you_thinking_role_button" },
  { selector: '[role="button"]:has-text("Utworz post")', note: "utworz_post_role_button" },
  { selector: '[role="button"]:has-text("Napisz post")', note: "napisz_post_role_button" },
  { selector: '[role="button"]:has-text("O czym myslisz")', note: "o_czym_myslisz_role_button" },
  { selector: 'a:has-text("Napisz post")', note: "napisz_post_link" },
  { selector: '[aria-label="Napisz post"]', note: "napisz_post_aria_label" },
  { selector: '[aria-label*="Napisz post"]', note: "napisz_post_aria_label_contains" },
  { selector: '[tabindex]:has-text("Napisz post")', note: "napisz_post_focusable_text" }
] as const;

const PUBLISH_BUTTON_SELECTORS = [
  'button:has-text("Publish")',
  'button:has-text("Post")',
  'button:has-text("Send")',
  'button:has-text("Comment")',
  'button:has-text("Opublikuj")',
  'button:has-text("Wyślij")',
  'button:has-text("Skomentuj")',
  'button:has-text("Dodaj komentarz")',
  '[role="button"]:has-text("Publish")',
  '[role="button"]:has-text("Post")',
  '[role="button"]:has-text("Send")',
  '[role="button"]:has-text("Comment")',
  '[role="button"]:has-text("Opublikuj")',
  '[role="button"]:has-text("Wyślij")',
  '[role="button"]:has-text("Skomentuj")',
  '[role="button"]:has-text("Dodaj komentarz")'
] as const;

const LOGIN_EMAIL_SELECTOR = 'input[type="email"][placeholder="Email Address"]';
const LOGIN_PASSWORD_SELECTOR = 'input[type="password"], input[placeholder="Password"]';
const LOGIN_RESULT_TOAST_NOT_DETECTED = "Login result toast not detected";
const CONTENT_MANUAL_PUBLISH_LOGIN_TIMEOUT_MS = 8000;
const CONTENT_TARGET_NETWORK_IDLE_TIMEOUT_MS = 3000;

export type ContentManualPublishStatus =
  | "content_publish_success"
  | "content_publish_failed"
  | "content_publish_skipped_not_planned"
  | "content_publish_skipped_limit_reached"
  | "content_publish_invalid_record"
  | "content_publish_login_failed"
  | "content_publish_target_failed"
  | "content_publish_editor_not_found"
  | "content_publish_blocked_by_initial_confirmation"
  | "content_publish_blocked_by_final_confirmation"
  | "content_publish_unknown_result";

export interface ContentManualPublishRow {
  content_action_id: string;
  account_id: string;
  target_type: string;
  target_value: string;
  content_type: string;
  publish_result_status: ContentManualPublishStatus;
  result_note: string;
  publish_status: ContentManualPublishStatus;
  reason: string;
  title_present: boolean;
  title_length: number;
  title_filled: boolean;
  title_field_seen: boolean;
  title_reason: string;
  published_at: string;
  dry_run_only: boolean;
  manual_confirmed: boolean;
  final_confirmed: boolean;
}

export interface ContentManualPublishSummary {
  readCount: number;
  plannedCount: number;
  skippedNotPlannedCount: number;
  skippedLimitReachedCount: number;
  invalidCount: number;
  blockedByInitialConfirmationCount: number;
  blockedByFinalConfirmationCount: number;
  loginFailedCount: number;
  targetFailedCount: number;
  editorNotFoundCount: number;
  publishFailedCount: number;
  publishSuccessCount: number;
  unknownResultCount: number;
  browserStarted: boolean;
}

export interface ContentManualPublishResult {
  rows: ContentManualPublishRow[];
  summary: ContentManualPublishSummary;
}

export interface ContentManualPublishPreviewItem {
  content_action_id: string;
  account_id: string;
  target_type: string;
  target_value: string;
  content_type: string;
  approved_text_length: number;
  title_present: boolean;
  title_length: number;
}

export interface ContentManualPublishPreview {
  publishCount: number;
  accounts: string[];
  items: ContentManualPublishPreviewItem[];
}

export interface ContentPublishPreparation {
  editorFound: boolean;
  publishButtonSeen: boolean;
  titlePresent: boolean;
  titleLength: number;
  titleFilled: boolean;
  titleFieldSeen: boolean;
  titleReason: string;
  note?: string;
}

interface ContentTitleResult {
  titlePresent: boolean;
  titleLength: number;
  titleFilled: boolean;
  titleFieldSeen: boolean;
  titleReason: string;
}

interface ContentPublishSubmitResult {
  status: Extract<ContentManualPublishStatus, "content_publish_success" | "content_publish_unknown_result">;
  note: string;
}

interface EligibleManualPublishRecord {
  planRow: PublishPlanCsvRow;
  account: AccountRow;
}

interface TargetNavigationResult {
  ok: boolean;
  note: string;
}

interface ClickCandidate {
  selector: string;
  note: string;
}

interface EditorCandidate {
  selector: string;
  note: string;
}

interface LoginStateCheckResult {
  canContinue: boolean;
  note: string;
}

export interface RunContentManualPublishOptions {
  planRows: PublishPlanCsvRow[];
  accounts: AccountRow[];
  config: Pick<
    AppSettings,
    | "headless"
    | "slowMo"
    | "timeoutMs"
    | "maxContentManualPublishesPerRun"
    | "maxContentManualPublishesPerAccount"
    | "maxContentTitleLength"
    | "requireFinalManualConfirmBeforePublish"
  >;
  initialConfirmation: string;
  finalConfirmation: (record: PublishPlanCsvRow, preparation: ContentPublishPreparation) => Promise<string>;
  dependencies?: Partial<ContentManualPublishDependencies>;
}

export interface ContentManualPublishDependencies {
  launchBrowser: (options: Parameters<typeof chromium.launch>[0]) => Promise<Browser>;
  loginAccount: typeof loginAccountDefault;
  prepareContentForPublish: (
    page: Page,
    contentType: ContentActionType,
    approvedText: string,
    approvedTitle: string
  ) => Promise<ContentPublishPreparation>;
  clickPublishSubmit: (page: Page, contentType: ContentActionType) => Promise<ContentPublishSubmitResult>;
  now: () => Date;
}

const defaultDependencies: ContentManualPublishDependencies = {
  launchBrowser: (options) => chromium.launch(options),
  loginAccount: loginAccountDefault,
  prepareContentForPublish,
  clickPublishSubmit,
  now: () => new Date()
};

function ensureDir(outputDir: string): void {
  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true });
  }
}

function isAbsoluteHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function toMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function safeCurrentUrlHint(currentUrl: string, targetUrl: string): string {
  if (!currentUrl) {
    return "current_url_hint=unknown";
  }

  try {
    const current = new URL(currentUrl);
    const target = new URL(targetUrl);
    const currentPath = current.pathname.toLowerCase();

    if (current.origin === target.origin && current.pathname === target.pathname) {
      return "current_url_hint=target_value";
    }

    if (currentPath.includes("/login")) {
      return "current_url_hint=login";
    }

    if (currentPath.includes("/home")) {
      return "current_url_hint=home";
    }

    return "current_url_hint=other";
  } catch {
    return "current_url_hint=unparseable";
  }
}

function safeLoginUrlHint(currentUrl: string): string {
  if (!currentUrl) {
    return "login_url_hint=unknown";
  }

  try {
    const current = new URL(currentUrl);
    const currentPath = current.pathname.toLowerCase();

    if (currentPath.includes("/login")) {
      return "login_url_hint=login";
    }

    if (currentPath.includes("/home")) {
      return "login_url_hint=home";
    }

    return "login_url_hint=other";
  } catch {
    return "login_url_hint=unparseable";
  }
}

function sanitizeErrorMessage(message: string): string {
  return message.replace(/https?:\/\/\S+/g, "[url]");
}

function sanitizeContentErrorMessage(
  message: string,
  approvedText: string,
  approvedTitle: string
): string {
  let sanitized = sanitizeErrorMessage(message);

  for (const sensitiveValue of [approvedText.trim(), approvedTitle.trim()]) {
    if (sensitiveValue.length > 0) {
      sanitized = sanitized.split(sensitiveValue).join("[approved_content]");
    }
  }

  return sanitized;
}

function buildPreparationNote(parts: string[]): string {
  return parts.join("; ");
}

function appendPreparationNote(baseNote: string, preparation: ContentPublishPreparation): string {
  return preparation.note ? `${baseNote}; ${preparation.note}` : baseNote;
}

function buildTitleResult(row: PublishPlanCsvRow, preparation?: Partial<ContentTitleResult>): ContentTitleResult {
  const approvedTitle = row.approved_title?.trim() ?? "";

  return {
    titlePresent: approvedTitle.length > 0,
    titleLength: approvedTitle.length,
    titleFilled: preparation?.titleFilled ?? false,
    titleFieldSeen: preparation?.titleFieldSeen ?? false,
    titleReason: preparation?.titleReason ?? (approvedTitle ? "title_not_processed" : "approved_title_empty")
  };
}

function emptyTitlePreparation(approvedTitle: string, contentType: ContentActionType): ContentTitleResult {
  const trimmedTitle = approvedTitle.trim();

  if (trimmedTitle.length === 0) {
    return {
      titlePresent: false,
      titleLength: 0,
      titleFilled: false,
      titleFieldSeen: false,
      titleReason: "approved_title_empty"
    };
  }

  return {
    titlePresent: true,
    titleLength: trimmedTitle.length,
    titleFilled: false,
    titleFieldSeen: false,
    titleReason: contentType === "post"
      ? "title_available_but_not_processed"
      : "title_not_used_for_comment"
  };
}

function buildPreparation(
  editorFound: boolean,
  publishButtonSeen: boolean,
  noteParts: string[],
  title: ContentTitleResult
): ContentPublishPreparation {
  return {
    editorFound,
    publishButtonSeen,
    titlePresent: title.titlePresent,
    titleLength: title.titleLength,
    titleFilled: title.titleFilled,
    titleFieldSeen: title.titleFieldSeen,
    titleReason: title.titleReason,
    note: buildPreparationNote(noteParts)
  };
}

function normalizePublishSubmitResult(result: ContentPublishSubmitResult | undefined): ContentPublishSubmitResult {
  if (result) {
    return result;
  }

  return {
    status: "content_publish_unknown_result",
    note: "publish_submit_clicked_but_no_result_check_returned"
  };
}

function getManualPublishLoginTimeoutMs(configTimeoutMs: number): number {
  if (configTimeoutMs > 0) {
    return Math.min(configTimeoutMs, CONTENT_MANUAL_PUBLISH_LOGIN_TIMEOUT_MS);
  }

  return CONTENT_MANUAL_PUBLISH_LOGIN_TIMEOUT_MS;
}

function buildRow(
  row: PublishPlanCsvRow,
  status: ContentManualPublishStatus,
  reason: string,
  flags: {
    publishedAt?: string;
    dryRunOnly?: boolean;
    manualConfirmed?: boolean;
    finalConfirmed?: boolean;
    title?: Partial<ContentTitleResult>;
  } = {}
): ContentManualPublishRow {
  const title = buildTitleResult(row, flags.title);

  return {
    content_action_id: row.content_action_id?.trim() ?? "",
    account_id: row.account_id?.trim() ?? "",
    target_type: row.target_type?.trim() ?? "",
    target_value: row.target_value?.trim() ?? "",
    content_type: row.content_type?.trim() ?? "",
    publish_result_status: status,
    result_note: reason,
    publish_status: status,
    reason,
    title_present: title.titlePresent,
    title_length: title.titleLength,
    title_filled: title.titleFilled,
    title_field_seen: title.titleFieldSeen,
    title_reason: title.titleReason,
    published_at: flags.publishedAt ?? "",
    dry_run_only: flags.dryRunOnly ?? true,
    manual_confirmed: flags.manualConfirmed ?? false,
    final_confirmed: flags.finalConfirmed ?? false
  };
}

function validatePlannedRow(
  row: PublishPlanCsvRow,
  accountById: Map<string, AccountRow>,
  config: RunContentManualPublishOptions["config"]
): string[] {
  const issues: string[] = [];
  const contentActionId = row.content_action_id?.trim() ?? "";
  const accountId = row.account_id?.trim() ?? "";
  const targetType = row.target_type?.trim() ?? "";
  const targetValue = row.target_value?.trim() ?? "";
  const contentType = row.content_type?.trim() ?? "";
  const approvedText = row.approved_text?.trim() ?? "";
  const approvedTitle = row.approved_title?.trim() ?? "";

  if (!contentActionId) {
    issues.push("content_action_id is required");
  }

  if (!accountId) {
    issues.push("account_id is required");
  } else if (!accountById.has(accountId)) {
    issues.push("account_id does not exist in loaded accounts");
  }

  if (!targetType || !ALLOWED_TARGET_TYPES.has(targetType as ContentTargetType)) {
    issues.push("target_type must be profile_url, post_url, or manual");
  } else if (!OPENABLE_TARGET_TYPES.has(targetType as ContentTargetType)) {
    issues.push("target_type manual is not supported by manual browser publish");
  }

  if (!targetValue) {
    issues.push("target_value is required");
  } else if (!isAbsoluteHttpUrl(targetValue)) {
    issues.push("target_value must be an absolute http or https URL");
  }

  if (!contentType || !ALLOWED_CONTENT_TYPES.has(contentType as ContentActionType)) {
    issues.push("content_type must be comment or post");
  }

  if (!approvedText) {
    issues.push("approved_text is required for manual publish");
  }

  if (approvedTitle.length > config.maxContentTitleLength) {
    issues.push(`approved_title must be up to ${config.maxContentTitleLength} characters`);
  }

  return issues;
}

function countByStatus(rows: ContentManualPublishRow[], status: ContentManualPublishStatus): number {
  return rows.filter((row) => row.publish_status === status).length;
}

function summarize(
  readCount: number,
  rows: ContentManualPublishRow[],
  browserStarted: boolean
): ContentManualPublishSummary {
  return {
    readCount,
    plannedCount: rows.filter((row) =>
      [
        "content_publish_blocked_by_initial_confirmation",
        "content_publish_blocked_by_final_confirmation",
        "content_publish_login_failed",
        "content_publish_target_failed",
        "content_publish_editor_not_found",
        "content_publish_failed",
        "content_publish_success",
        "content_publish_unknown_result"
      ].includes(row.publish_status)
    ).length,
    skippedNotPlannedCount: countByStatus(rows, "content_publish_skipped_not_planned"),
    skippedLimitReachedCount: countByStatus(rows, "content_publish_skipped_limit_reached"),
    invalidCount: countByStatus(rows, "content_publish_invalid_record"),
    blockedByInitialConfirmationCount: countByStatus(rows, "content_publish_blocked_by_initial_confirmation"),
    blockedByFinalConfirmationCount: countByStatus(rows, "content_publish_blocked_by_final_confirmation"),
    loginFailedCount: countByStatus(rows, "content_publish_login_failed"),
    targetFailedCount: countByStatus(rows, "content_publish_target_failed"),
    editorNotFoundCount: countByStatus(rows, "content_publish_editor_not_found"),
    publishFailedCount: countByStatus(rows, "content_publish_failed"),
    publishSuccessCount: countByStatus(rows, "content_publish_success"),
    unknownResultCount: countByStatus(rows, "content_publish_unknown_result"),
    browserStarted
  };
}

function selectEligibleRows(
  planRows: PublishPlanCsvRow[],
  accounts: AccountRow[],
  config: RunContentManualPublishOptions["config"]
): { rows: ContentManualPublishRow[]; eligible: EligibleManualPublishRecord[] } {
  const accountById = new Map(accounts.map((account) => [account.account_id, account]));
  const rows: ContentManualPublishRow[] = [];
  const eligible: EligibleManualPublishRecord[] = [];
  const acceptedPerAccount = new Map<string, number>();
  let acceptedForRun = 0;

  for (const planRow of planRows) {
    const publishPlanStatus = planRow.publish_plan_status?.trim() ?? "";

    if (publishPlanStatus !== "content_publish_planned") {
      rows.push(buildRow(
        planRow,
        "content_publish_skipped_not_planned",
        "publish_plan_status is not content_publish_planned"
      ));
      continue;
    }

    const issues = validatePlannedRow(planRow, accountById, config);
    if (issues.length > 0) {
      rows.push(buildRow(planRow, "content_publish_invalid_record", issues.join("; ")));
      continue;
    }

    const accountId = planRow.account_id.trim();
    const accountAcceptedCount = acceptedPerAccount.get(accountId) ?? 0;

    if (
      acceptedForRun >= config.maxContentManualPublishesPerRun ||
      accountAcceptedCount >= config.maxContentManualPublishesPerAccount
    ) {
      rows.push(buildRow(
        planRow,
        "content_publish_skipped_limit_reached",
        "content manual publish limit reached"
      ));
      continue;
    }

    acceptedForRun += 1;
    acceptedPerAccount.set(accountId, accountAcceptedCount + 1);
    eligible.push({
      planRow,
      account: accountById.get(accountId) as AccountRow
    });
  }

  return { rows, eligible };
}

async function findVisibleEnabledEditorCandidate(
  page: Page,
  candidates: readonly EditorCandidate[]
): Promise<EditorCandidate | null> {
  for (const candidate of candidates) {
    const locator = page.locator(candidate.selector).first();
    const count = await locator.count().catch(() => 0);
    if (count === 0 || !await locator.isVisible().catch(() => false)) {
      continue;
    }

    if (!await locator.isEnabled().catch(() => false)) {
      continue;
    }

    return candidate;
  }

  return null;
}

async function findVisibleSearchFieldNote(page: Page): Promise<string | null> {
  for (const candidate of SEARCH_FIELD_CANDIDATES) {
    const locator = page.locator(candidate.selector).first();
    const count = await locator.count().catch(() => 0);
    if (count > 0 && await locator.isVisible().catch(() => false)) {
      return candidate.note;
    }
  }

  return null;
}

async function findVisibleSelector(page: Page, selectors: readonly string[]): Promise<string | null> {
  for (const selector of selectors) {
    const locator = page.locator(selector).first();
    const count = await locator.count().catch(() => 0);
    if (count > 0 && await locator.isVisible().catch(() => false)) {
      return selector;
    }
  }

  return null;
}

async function isVisibleSelectorPresent(page: Page, selectors: readonly string[]): Promise<boolean> {
  return await findVisibleSelector(page, selectors) !== null;
}

async function clickFirstVisibleEnabledCandidate(
  page: Page,
  candidates: readonly ClickCandidate[]
): Promise<string | null> {
  for (const candidate of candidates) {
    const locator = page.locator(candidate.selector).first();
    const count = await locator.count().catch(() => 0);
    if (count === 0 || !await locator.isVisible().catch(() => false)) {
      continue;
    }

    if (!await locator.isEnabled().catch(() => false)) {
      continue;
    }

    await locator.scrollIntoViewIfNeeded().catch(() => {});
    await locator.click();
    return candidate.note;
  }

  return null;
}

function isLoginToastDetectionFailure(loginResult: LoginActionResult): boolean {
  return loginResult.result === "login_failed" &&
    (loginResult.details ?? "").includes(LOGIN_RESULT_TOAST_NOT_DETECTED);
}

function isLoginPageUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.pathname.toLowerCase().includes("/login");
  } catch {
    return url.toLowerCase().includes("/login");
  }
}

async function isLoginFieldVisible(page: Page, selector: string): Promise<boolean> {
  try {
    const locator = page.locator(selector).first();
    const count = await locator.count().catch(() => 0);
    return count > 0 && await locator.isVisible().catch(() => false);
  } catch {
    return false;
  }
}

async function checkLoginStateAfterToastTimeout(
  page: Page,
  loginResult: LoginActionResult
): Promise<LoginStateCheckResult> {
  if (!isLoginToastDetectionFailure(loginResult)) {
    return { canContinue: false, note: "" };
  }

  const notePrefix = ["login_toast_timeout", "login_state_checked"];
  const currentUrl = typeof page.url === "function" ? page.url() : "";
  const loginUrlHint = safeLoginUrlHint(currentUrl);

  if (currentUrl && !isLoginPageUrl(currentUrl)) {
    return {
      canContinue: true,
      note: [
        ...notePrefix,
        loginUrlHint,
        "login_assumed_success_after_state_check"
      ].join("; ")
    };
  }

  const emailVisible = await isLoginFieldVisible(page, LOGIN_EMAIL_SELECTOR);
  const passwordVisible = await isLoginFieldVisible(page, LOGIN_PASSWORD_SELECTOR);

  if (!emailVisible && !passwordVisible) {
    return {
      canContinue: true,
      note: [
        ...notePrefix,
        loginUrlHint,
        "login_form_visible=false",
        "login_assumed_success_after_state_check"
      ].join("; ")
    };
  }

  return {
    canContinue: false,
    note: [
      ...notePrefix,
      loginUrlHint,
      `login_email_visible=${emailVisible}`,
      `login_password_visible=${passwordVisible}`,
      "login_still_required"
    ].join("; ")
  };
}

async function preparePostContentForPublish(
  page: Page,
  approvedText: string,
  approvedTitle: string
): Promise<ContentPublishPreparation> {
  const noteParts = ["editor_lookup_started", "post_modal_flow_started"];
  const title = emptyTitlePreparation(approvedTitle, "post");

  const searchFieldNote = await findVisibleSearchFieldNote(page);
  if (searchFieldNote) {
    noteParts.push(`search_field_skipped=${searchFieldNote}`);
  }

  const profileWriteSomethingTrigger = await clickFirstVisibleEnabledCandidate(
    page,
    POST_PROFILE_WRITE_SOMETHING_TRIGGER_CANDIDATES
  );
  if (profileWriteSomethingTrigger) {
    if (profileWriteSomethingTrigger === "profile_write_something_button") {
      noteParts.push("profile_write_something_button_found");
    } else {
      noteParts.push(`profile_write_something_trigger_found=${profileWriteSomethingTrigger}`);
    }
    noteParts.push("profile_write_something_trigger_clicked");
  } else {
    noteParts.push("profile_write_something_trigger_not_found");
    const clickedComposerTrigger = await clickFirstVisibleEnabledCandidate(
      page,
      POST_COMPOSER_TRIGGER_CANDIDATES
    );
    if (clickedComposerTrigger) {
      noteParts.push(`post_composer_trigger_found=${clickedComposerTrigger}`);
      noteParts.push(`post_composer_trigger_clicked=${clickedComposerTrigger}`);
    } else {
      noteParts.push("post_composer_trigger_not_found");
      noteParts.push("add_new_post_modal_not_opened");
      noteParts.push("editable_editor_not_found");
      return buildPreparation(false, false, noteParts, title);
    }
  }

  await page.waitForTimeout(500);
  const addNewPostModalOpened = await isVisibleSelectorPresent(page, ADD_NEW_POST_MODAL_SELECTORS);
  if (!addNewPostModalOpened) {
    noteParts.push("add_new_post_modal_not_opened");
    noteParts.push("editable_editor_not_found");
    return buildPreparation(false, false, noteParts, title);
  }

  noteParts.push("add_new_post_modal_opened");

  if (title.titlePresent) {
    const titleFieldSelector = await findVisibleSelector(page, POST_MODAL_TITLE_FIELD_SELECTORS);
    if (!titleFieldSelector) {
      title.titleFieldSeen = false;
      title.titleFilled = false;
      title.titleReason = "title_available_but_title_field_not_found";
      noteParts.push("title_available_but_title_field_not_found");
    } else {
      title.titleFieldSeen = true;
      noteParts.push("title_field_seen");
      const titleField = page.locator(titleFieldSelector).first();
      const titleFieldEnabled = await titleField.isEnabled().catch(() => false);
      const titleFieldEditable = await titleField.isEditable().catch(() => false);

      if (!titleFieldEnabled || !titleFieldEditable) {
        title.titleFilled = false;
        title.titleReason = titleFieldEnabled
          ? "title_field_not_editable"
          : "title_field_not_enabled";
        noteParts.push(title.titleReason);
      } else {
        try {
          await titleField.scrollIntoViewIfNeeded().catch(() => {});
          await titleField.click();
          await titleField.fill(approvedTitle.trim());
          await page.waitForTimeout(150);
          title.titleFilled = true;
          title.titleReason = "title_filled";
          noteParts.push("title_filled");
        } catch (error) {
          title.titleFilled = false;
          title.titleReason = "title_fill_failed";
          noteParts.push("title_fill_failed");
        }
      }
    }
  } else {
    noteParts.push("approved_title_empty");
  }

  const modalBodyEditor = await findVisibleEnabledEditorCandidate(page, POST_MODAL_BODY_EDITOR_CANDIDATES);
  if (!modalBodyEditor) {
    noteParts.push("modal_body_editor_not_found");
    return buildPreparation(false, false, noteParts, title);
  }

  noteParts.push(`modal_body_editor_found=${modalBodyEditor.note}`);
  const editor = page.locator(modalBodyEditor.selector).first();
  const editable = await editor.isEditable().catch(() => false);
  if (!editable) {
    noteParts.push("modal_body_editor_not_editable");
    return buildPreparation(false, false, noteParts, title);
  }

  await editor.scrollIntoViewIfNeeded().catch(() => {});
  await editor.click();
  await editor.fill(approvedText);
  await page.waitForTimeout(150);
  noteParts.push("modal_body_filled");
  noteParts.push(`selected_editor_candidate=${modalBodyEditor.note}`);

  const addPostButtonSelector = await findVisibleSelector(page, POST_MODAL_ADD_POST_BUTTON_SELECTORS);
  if (!addPostButtonSelector) {
    noteParts.push("add_post_button_not_found");
    return buildPreparation(true, false, noteParts, title);
  }

  noteParts.push("add_post_button_found");
  const addPostButton = page.locator(addPostButtonSelector).first();
  const addPostButtonEnabled = await addPostButton.isEnabled().catch(() => false);
  if (!addPostButtonEnabled) {
    noteParts.push("add_post_button_disabled");
    if (await isVisibleSelectorPresent(page, POST_MODAL_TITLE_FIELD_SELECTORS)) {
      noteParts.push("title_required_but_missing");
    }

    return buildPreparation(true, false, noteParts, title);
  }

  noteParts.push("add_post_button_enabled");
  return buildPreparation(true, true, noteParts, title);
}

async function prepareContentForPublish(
  page: Page,
  contentType: ContentActionType,
  approvedText: string,
  approvedTitle: string
): Promise<ContentPublishPreparation> {
  if (contentType === "post") {
    return preparePostContentForPublish(page, approvedText, approvedTitle);
  }

  const noteParts = ["editor_lookup_started"];
  const title = emptyTitlePreparation(approvedTitle, contentType);
  const editorCandidate = await findVisibleEnabledEditorCandidate(page, EDITOR_CANDIDATES);

  if (!editorCandidate) {
    noteParts.push("editable_editor_not_found");
    return buildPreparation(false, false, noteParts, title);
  }

  noteParts.push("editable_editor_found");
  noteParts.push(`selected_editor_candidate=${editorCandidate.note}`);
  const editor = page.locator(editorCandidate.selector).first();
  const editable = await editor.isEditable().catch(() => false);
  if (!editable) {
    noteParts.push("editor_not_editable");
    return buildPreparation(false, false, noteParts, title);
  }

  await editor.scrollIntoViewIfNeeded().catch(() => {});
  await editor.click();
  await editor.fill(approvedText);
  await page.waitForTimeout(150);

  const publishButtonSelector = await findVisibleSelector(page, PUBLISH_BUTTON_SELECTORS);
  if (!publishButtonSelector) {
    noteParts.push("publish_button_not_found");
    return buildPreparation(true, false, noteParts, title);
  }

  const publishButton = page.locator(publishButtonSelector).first();
  const enabled = await publishButton.isEnabled().catch(() => false);
  noteParts.push(enabled ? "publish_button_enabled" : "publish_button_disabled");

  return buildPreparation(true, enabled, noteParts, title);
}

async function detectPublishResultAfterSubmit(
  page: Page,
  contentType: ContentActionType
): Promise<ContentPublishSubmitResult> {
  const successSignalSelector = await findVisibleSelector(page, PUBLISH_SUCCESS_SIGNAL_SELECTORS);
  if (successSignalSelector) {
    return {
      status: "content_publish_success",
      note: "safe_success_signal_detected"
    };
  }

  if (contentType === "post") {
    const modalStillVisible = await isVisibleSelectorPresent(page, ADD_NEW_POST_MODAL_SELECTORS);
    if (!modalStillVisible) {
      return {
        status: "content_publish_success",
        note: "post_modal_closed_after_submit"
      };
    }
  }

  return {
    status: "content_publish_unknown_result",
    note: "publish_submit_clicked_but_no_safe_success_signal_detected"
  };
}

async function clickPublishSubmit(
  page: Page,
  contentType: ContentActionType
): Promise<ContentPublishSubmitResult> {
  const publishButtonSelector = await findVisibleSelector(
    page,
    contentType === "post" ? POST_MODAL_ADD_POST_BUTTON_SELECTORS : PUBLISH_BUTTON_SELECTORS
  );
  if (!publishButtonSelector) {
    throw new Error("publish button not visible before submit click");
  }

  const publishButton = page.locator(publishButtonSelector).first();
  if (!await publishButton.isEnabled().catch(() => false)) {
    throw new Error("publish button is not enabled before submit click");
  }

  await publishButton.scrollIntoViewIfNeeded().catch(() => {});
  await publishButton.click();
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.waitForTimeout(1000).catch(() => {});

  return await detectPublishResultAfterSubmit(page, contentType);
}

async function navigateToTargetForPublish(page: Page, targetUrl: string): Promise<TargetNavigationResult> {
  const startedNote = "target_navigation_started";

  try {
    await page.goto(targetUrl, { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle", {
      timeout: CONTENT_TARGET_NETWORK_IDLE_TIMEOUT_MS
    }).catch(() => {});

    return {
      ok: true,
      note: [
        startedNote,
        "target_navigation_finished",
        safeCurrentUrlHint(typeof page.url === "function" ? page.url() : "", targetUrl)
      ].join("; ")
    };
  } catch (error) {
    return {
      ok: false,
      note: [
        startedNote,
        "target_navigation_failed",
        safeCurrentUrlHint(typeof page.url === "function" ? page.url() : "", targetUrl),
        `error=${sanitizeErrorMessage(toMessage(error))}`
      ].join("; ")
    };
  }
}

function buildLaunchOptions(
  config: RunContentManualPublishOptions["config"]
): Parameters<typeof chromium.launch>[0] {
  const browserChannelSetting = process.env.PLAYWRIGHT_BROWSER_CHANNEL?.trim();
  const browserExecutablePathSetting = process.env.PLAYWRIGHT_EXECUTABLE_PATH?.trim();

  if (browserChannelSetting && !ALLOWED_BROWSER_CHANNELS.has(browserChannelSetting)) {
    throw new Error(`Unsupported PLAYWRIGHT_BROWSER_CHANNEL "${browserChannelSetting}". Allowed values: msedge, chrome.`);
  }

  return {
    headless: config.headless,
    slowMo: config.slowMo,
    ...(browserExecutablePathSetting ? { executablePath: browserExecutablePathSetting } : {}),
    ...(browserChannelSetting ? { channel: browserChannelSetting } : {})
  };
}

async function closePageAndContext(page: Page | undefined, context: BrowserContext | undefined): Promise<void> {
  await page?.close().catch(() => {});
  await context?.close().catch(() => {});
}

async function processEligibleRowsForAccount(
  browser: Browser,
  deps: ContentManualPublishDependencies,
  config: RunContentManualPublishOptions["config"],
  account: AccountRow,
  records: EligibleManualPublishRecord[],
  finalConfirmation: RunContentManualPublishOptions["finalConfirmation"]
): Promise<ContentManualPublishRow[]> {
  let context: BrowserContext | undefined;
  let page: Page | undefined;

  try {
    context = await browser.newContext();
    page = await context.newPage();
    page.setDefaultTimeout(config.timeoutMs);

    let loginResult: LoginActionResult;
    try {
      page.setDefaultTimeout(getManualPublishLoginTimeoutMs(config.timeoutMs));
      try {
        loginResult = await deps.loginAccount({ context, page }, account);
      } finally {
        page.setDefaultTimeout(config.timeoutMs);
      }
    } catch (error) {
      const reason = `login threw error: ${toMessage(error)}`;
      return records.map((record) =>
        buildRow(record.planRow, "content_publish_login_failed", reason, {
          manualConfirmed: true
        })
      );
    }

    let loginStateNote = "";
    if (loginResult.result !== "login_success") {
      const loginStateCheck = await checkLoginStateAfterToastTimeout(page, loginResult);
      loginStateNote = loginStateCheck.note;
      if (loginStateCheck.canContinue) {
        loginResult = {
          result: "login_success",
          details: "login treated as success after toast timeout because page no longer looks like login screen"
        };
      }
    }

    if (loginResult.result !== "login_success") {
      const reason = loginStateNote || loginResult.details || `login result: ${loginResult.result}`;
      return records.map((record) =>
        buildRow(record.planRow, "content_publish_login_failed", reason, {
          manualConfirmed: true
        })
      );
    }

    const outputRows: ContentManualPublishRow[] = [];

    for (const record of records) {
      const targetNavigation = await navigateToTargetForPublish(page, record.planRow.target_value.trim());
      const baseTargetNote = loginStateNote
        ? `${loginStateNote}; ${targetNavigation.note}`
        : targetNavigation.note;
      if (!targetNavigation.ok) {
        outputRows.push(buildRow(
          record.planRow,
          "content_publish_target_failed",
          baseTargetNote,
          { manualConfirmed: true }
        ));
        continue;
      }

      let preparation: ContentPublishPreparation;
      try {
        preparation = await deps.prepareContentForPublish(
          page,
          record.planRow.content_type.trim() as ContentActionType,
          record.planRow.approved_text.trim(),
          record.planRow.approved_title?.trim() ?? ""
        );
      } catch (error) {
        outputRows.push(buildRow(
          record.planRow,
          "content_publish_editor_not_found",
          [
            baseTargetNote,
            "editor_interaction_failed",
            `error=${sanitizeContentErrorMessage(
              toMessage(error),
              record.planRow.approved_text?.trim() ?? "",
              record.planRow.approved_title?.trim() ?? ""
            )}`
          ].join("; "),
          { manualConfirmed: true }
        ));
        continue;
      }

      if (!preparation.editorFound) {
        outputRows.push(buildRow(
          record.planRow,
          "content_publish_editor_not_found",
          appendPreparationNote(
            `${baseTargetNote}; target opened but editable content editor was not found`,
            preparation
          ),
          {
            manualConfirmed: true,
            title: preparation
          }
        ));
        continue;
      }

      if (!preparation.publishButtonSeen) {
        outputRows.push(buildRow(
          record.planRow,
          "content_publish_failed",
          appendPreparationNote(
            `${baseTargetNote}; content text was entered but publish button was not visible or enabled`,
            preparation
          ),
          {
            manualConfirmed: true,
            title: preparation
          }
        ));
        continue;
      }

      if (config.requireFinalManualConfirmBeforePublish !== true) {
        outputRows.push(buildRow(
          record.planRow,
          "content_publish_blocked_by_final_confirmation",
          appendPreparationNote(
            `${baseTargetNote}; requireFinalManualConfirmBeforePublish is not true; publish click blocked`,
            preparation
          ),
          {
            manualConfirmed: true,
            title: preparation
          }
        ));
        continue;
      }

      const finalAnswer = (await finalConfirmation(record.planRow, preparation)).trim();
      if (finalAnswer !== "FINAL_PUBLISH_YES") {
        outputRows.push(buildRow(
          record.planRow,
          "content_publish_blocked_by_final_confirmation",
          appendPreparationNote(
            `${baseTargetNote}; user did not type exactly FINAL_PUBLISH_YES; publish click was not executed`,
            preparation
          ),
          {
            manualConfirmed: true,
            title: preparation
          }
        ));
        continue;
      }

      let publishResult: ContentPublishSubmitResult;
      try {
        publishResult = normalizePublishSubmitResult(await deps.clickPublishSubmit(
          page,
          record.planRow.content_type.trim() as ContentActionType
        ));
      } catch (error) {
        outputRows.push(buildRow(
          record.planRow,
          "content_publish_failed",
          appendPreparationNote(
            [
              baseTargetNote,
              `publish click failed: ${sanitizeContentErrorMessage(
                toMessage(error),
                record.planRow.approved_text?.trim() ?? "",
                record.planRow.approved_title?.trim() ?? ""
              )}`
            ].join("; "),
            preparation
          ),
          {
            manualConfirmed: true,
            finalConfirmed: true,
            title: preparation
          }
        ));
        continue;
      }

      outputRows.push(buildRow(
        record.planRow,
        publishResult.status,
        appendPreparationNote(
          `${baseTargetNote}; publish submit was clicked after both manual confirmations; ${publishResult.note}`,
          preparation
        ),
        {
          publishedAt: publishResult.status === "content_publish_success"
            ? deps.now().toISOString()
            : "",
          dryRunOnly: false,
          manualConfirmed: true,
          finalConfirmed: true,
          title: preparation
        }
      ));
    }

    return outputRows;
  } finally {
    await closePageAndContext(page, context);
  }
}

export function buildContentManualPublishPreview(
  planRows: PublishPlanCsvRow[],
  accounts: AccountRow[],
  config: RunContentManualPublishOptions["config"]
): ContentManualPublishPreview {
  const { eligible } = selectEligibleRows(planRows, accounts, config);
  const items = eligible.map((record) => ({
    content_action_id: record.planRow.content_action_id.trim(),
    account_id: record.planRow.account_id.trim(),
    target_type: record.planRow.target_type.trim(),
    target_value: record.planRow.target_value.trim(),
    content_type: record.planRow.content_type.trim(),
    approved_text_length: record.planRow.approved_text.trim().length,
    title_present: (record.planRow.approved_title?.trim() ?? "").length > 0,
    title_length: (record.planRow.approved_title?.trim() ?? "").length
  }));

  return {
    publishCount: items.length,
    accounts: [...new Set(items.map((item) => item.account_id))],
    items
  };
}

export async function runContentManualPublish(
  options: RunContentManualPublishOptions
): Promise<ContentManualPublishResult> {
  const deps: ContentManualPublishDependencies = {
    ...defaultDependencies,
    ...options.dependencies
  };
  const { rows, eligible } = selectEligibleRows(options.planRows, options.accounts, options.config);

  if (eligible.length === 0) {
    return {
      rows,
      summary: summarize(options.planRows.length, rows, false)
    };
  }

  if (options.initialConfirmation !== "PUBLISH_CONTENT_YES") {
    const blockedRows = eligible.map((record) =>
      buildRow(
        record.planRow,
        "content_publish_blocked_by_initial_confirmation",
        "user did not type exactly PUBLISH_CONTENT_YES; browser was not started"
      )
    );
    const allRows = [...rows, ...blockedRows];

    return {
      rows: allRows,
      summary: summarize(options.planRows.length, allRows, false)
    };
  }

  let browser: Browser | undefined;

  try {
    browser = await deps.launchBrowser(buildLaunchOptions(options.config));
  } catch (error) {
    const failedRows = eligible.map((record) =>
      buildRow(
        record.planRow,
        "content_publish_target_failed",
        `browser launch failed: ${toMessage(error)}`,
        { manualConfirmed: true }
      )
    );
    const allRows = [...rows, ...failedRows];

    return {
      rows: allRows,
      summary: summarize(options.planRows.length, allRows, false)
    };
  }

  try {
    const recordsByAccount = new Map<string, EligibleManualPublishRecord[]>();
    for (const record of eligible) {
      const list = recordsByAccount.get(record.account.account_id) ?? [];
      list.push(record);
      recordsByAccount.set(record.account.account_id, list);
    }

    const browserRows: ContentManualPublishRow[] = [];
    for (const records of recordsByAccount.values()) {
      browserRows.push(...await processEligibleRowsForAccount(
        browser,
        deps,
        options.config,
        records[0].account,
        records,
        options.finalConfirmation
      ));
    }

    const allRows = [...rows, ...browserRows];
    return {
      rows: allRows,
      summary: summarize(options.planRows.length, allRows, true)
    };
  } finally {
    await browser.close().catch(() => {});
  }
}

function writeManualPublishCsv(filePath: string, rows: ContentManualPublishRow[]): void {
  const lines = [
    CONTENT_PUBLISH_RESULT_HEADERS.map(escapeContentCsvValue).join(","),
    ...rows.map((row) =>
      CONTENT_PUBLISH_RESULT_HEADERS.map((header) =>
        escapeContentCsvValue(String(row[header] ?? ""))
      ).join(",")
    )
  ];

  writeFileSync(filePath, `${lines.join("\n")}\n`, "utf-8");
}

export function exportContentManualPublishResults(
  rows: ContentManualPublishRow[],
  date = new Date(),
  outputDir = CONTENT_PUBLISH_RESULTS_DIR
): string {
  ensureDir(outputDir);

  const runId = formatContentRunId(date);
  const filePath = path.join(outputDir, `content-publish-results-${runId}.csv`);
  writeManualPublishCsv(filePath, rows);

  return filePath;
}

export {
  findLatestContentPublishPlanFile,
  readContentPublishPlanFile
};
export type { PublishPlanCsvRow };
