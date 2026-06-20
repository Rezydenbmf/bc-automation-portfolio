import { existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { Browser, BrowserContext, chromium, Page } from "playwright";
import { loginAccount as loginAccountDefault, LoginActionResult } from "../auth/authService";
import { readCsvRowsFromFile } from "../shared/csv";
import type { AccountRow, AppSettings } from "../shared/types";
import type { ContentActionType, ContentTargetType } from "./types";
import { escapeContentCsvValue, formatContentRunId } from "./contentDryRunExport";

const CONTENT_PUBLISH_PLAN_DIR = path.resolve(process.cwd(), "logs", "content-publish-plan");
const CONTENT_BROWSER_DRY_RUN_DIR = path.resolve(process.cwd(), "logs", "content-browser-dry-run");
const PUBLISH_PLAN_FILE_PATTERN = /^content-publish-plan-\d{8}-\d{6}\.csv$/;
const ALLOWED_BROWSER_CHANNELS = new Set(["msedge", "chrome"]);

const REQUIRED_PLAN_HEADERS = [
  "content_action_id",
  "account_id",
  "target_type",
  "target_value",
  "content_type",
  "publish_plan_status"
] as const;

const BROWSER_DRY_RUN_HEADERS = [
  "content_action_id",
  "account_id",
  "target_type",
  "target_value",
  "content_type",
  "browser_dry_run_status",
  "reason",
  "editor_found",
  "publish_button_seen",
  "dry_run_only"
] as const;

const ALLOWED_TARGET_TYPES = new Set<ContentTargetType>(["profile_url", "post_url", "manual"]);
const OPENABLE_TARGET_TYPES = new Set<ContentTargetType>(["profile_url", "post_url"]);
const ALLOWED_CONTENT_TYPES = new Set<ContentActionType>(["comment", "post"]);

const EDITOR_SELECTORS = [
  "textarea",
  '[contenteditable="true"]',
  '[role="textbox"]'
] as const;

const COMPOSER_OPENER_WAIT_TIMEOUT_MS = 3000;
const COMPOSER_OPENER_WAIT_POLL_MS = 150;

const COMPOSER_OPENER_CANDIDATES = [
  { selector: 'button:has-text("Write something...")', note: "write_something_button" },
  { selector: 'button:has-text("Write something")', note: "write_something_button" },
  { selector: 'button:has-text("Create post")', note: "create_post_button" },
  { selector: 'button:has-text("Start a post")', note: "start_a_post_button" },
  { selector: "button:has-text(\"What's on your mind\")", note: "whats_on_your_mind_button" },
  { selector: '[role="button"]:has-text("Write something...")', note: "write_something_role_button" },
  { selector: '[role="button"]:has-text("Write something")', note: "write_something_role_button" },
  { selector: '[role="button"]:has-text("Create post")', note: "create_post_role_button" },
  { selector: '[role="button"]:has-text("Start a post")', note: "start_a_post_role_button" },
  { selector: "[role=\"button\"]:has-text(\"What's on your mind\")", note: "whats_on_your_mind_role_button" },
  { selector: 'a:has-text("Write something...")', note: "write_something_link" },
  { selector: 'a:has-text("Write something")', note: "write_something_link" },
  { selector: 'a:has-text("Create post")', note: "create_post_link" },
  { selector: 'a:has-text("Start a post")', note: "start_a_post_link" },
  { selector: "a:has-text(\"What's on your mind\")", note: "whats_on_your_mind_link" }
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
  '[role="button"]:has-text("Skomentuj")'
] as const;

const LOGIN_EMAIL_SELECTOR = 'input[type="email"][placeholder="Email Address"]';
const LOGIN_PASSWORD_SELECTOR = 'input[type="password"], input[placeholder="Password"]';
const LOGIN_SUBMIT_SELECTOR = 'button[type="submit"]';
const LOGIN_RESULT_TOAST_NOT_DETECTED = "Login result toast not detected";
const CONTENT_BROWSER_DRY_RUN_LOGIN_TIMEOUT_MS = 8000;

const LOGGED_IN_UI_SELECTORS = [
  'a[href*="/logout"]',
  'button:has-text("Logout")',
  'button:has-text("Wyloguj")',
  '[role="button"]:has-text("Logout")',
  '[role="button"]:has-text("Wyloguj")',
  'a[href*="/home"]',
  'a[href*="/profile"]',
  'a[href*="/account"]',
  '[aria-label*="profile" i]',
  '[aria-label*="profil" i]',
  '[data-testid*="profile" i]',
  '[data-testid*="user" i]'
] as const;

const LOGIN_STATE_CHECK_FAILURE_HINTS = [
  "Email field interaction failed",
  "Email field is not editable",
  "Email locator did not resolve",
  "Password field interaction failed",
  "Password field is not editable",
  "Login submit button not ready"
] as const;

export type ContentBrowserDryRunStatus =
  | "content_browser_dry_run_ready"
  | "content_browser_dry_run_skipped_not_planned"
  | "content_browser_dry_run_login_failed"
  | "content_browser_dry_run_target_opened"
  | "content_browser_dry_run_target_failed"
  | "content_browser_dry_run_editor_found"
  | "content_browser_dry_run_editor_not_found"
  | "content_browser_dry_run_invalid_record"
  | "content_browser_dry_run_blocked_by_user_confirmation"
  | "content_browser_dry_run_skipped_limit_reached";

export interface ContentBrowserDryRunRow {
  content_action_id: string;
  account_id: string;
  target_type: string;
  target_value: string;
  content_type: string;
  browser_dry_run_status: ContentBrowserDryRunStatus;
  reason: string;
  editor_found: boolean;
  publish_button_seen: boolean;
  dry_run_only: true;
}

export interface ContentBrowserDryRunSummary {
  readCount: number;
  plannedCount: number;
  skippedNotPlannedCount: number;
  skippedLimitReachedCount: number;
  invalidCount: number;
  blockedByConfirmationCount: number;
  loginFailedCount: number;
  targetFailedCount: number;
  editorFoundCount: number;
  editorNotFoundCount: number;
  loginRecoveredAfterStateCheckCount: number;
  browserStarted: boolean;
  dryRunOnly: true;
}

export interface ContentBrowserDryRunResult {
  rows: ContentBrowserDryRunRow[];
  summary: ContentBrowserDryRunSummary;
}

export type PublishPlanCsvRow = Record<string, string>;

export interface ContentSurfaceInspection {
  editorFound: boolean;
  publishButtonSeen: boolean;
  note?: string;
}

interface EligibleDryRunRecord {
  planRow: PublishPlanCsvRow;
  account: AccountRow;
}

interface LoginStateCheckResult {
  canContinue: boolean;
  note: string;
}

interface ComposerOpenerClickResult {
  clicked: boolean;
  note: string;
}

export interface RunContentBrowserDryRunOptions {
  planRows: PublishPlanCsvRow[];
  accounts: AccountRow[];
  config: Pick<
    AppSettings,
    | "headless"
    | "slowMo"
    | "timeoutMs"
    | "maxContentBrowserDryRunPerRun"
    | "maxContentBrowserDryRunPerAccount"
  >;
  userConfirmation: string;
  dependencies?: Partial<ContentBrowserDryRunDependencies>;
}

export interface ContentBrowserDryRunDependencies {
  launchBrowser: (options: Parameters<typeof chromium.launch>[0]) => Promise<Browser>;
  loginAccount: typeof loginAccountDefault;
  inspectContentSurface: (page: Page, contentType: ContentActionType) => Promise<ContentSurfaceInspection>;
}

const defaultDependencies: ContentBrowserDryRunDependencies = {
  launchBrowser: (options) => chromium.launch(options),
  loginAccount: loginAccountDefault,
  inspectContentSurface: inspectContentSurfaceReadOnly
};

function readPlanRows(filePath: string): PublishPlanCsvRow[] {
  return readCsvRowsFromFile(filePath, {
    requiredHeaders: REQUIRED_PLAN_HEADERS,
    emptyMessage: "content publish plan CSV is empty.",
    noDataMessage: "content publish plan CSV has no data rows.",
    missingHeadersMessage: (missingHeaders) =>
      `content publish plan CSV is missing headers: ${missingHeaders.join(", ")}.`
  });
}

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

function buildRow(
  row: PublishPlanCsvRow,
  status: ContentBrowserDryRunStatus,
  reason: string,
  editorFound = false,
  publishButtonSeen = false
): ContentBrowserDryRunRow {
  return {
    content_action_id: row.content_action_id?.trim() ?? "",
    account_id: row.account_id?.trim() ?? "",
    target_type: row.target_type?.trim() ?? "",
    target_value: row.target_value?.trim() ?? "",
    content_type: row.content_type?.trim() ?? "",
    browser_dry_run_status: status,
    reason,
    editor_found: editorFound,
    publish_button_seen: publishButtonSeen,
    dry_run_only: true
  };
}

function validatePlannedRow(row: PublishPlanCsvRow, accountById: Map<string, AccountRow>): string[] {
  const issues: string[] = [];
  const contentActionId = row.content_action_id?.trim() ?? "";
  const accountId = row.account_id?.trim() ?? "";
  const targetType = row.target_type?.trim() ?? "";
  const targetValue = row.target_value?.trim() ?? "";
  const contentType = row.content_type?.trim() ?? "";

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
    issues.push("target_type manual is not supported by browser dry-run");
  }

  if (!targetValue) {
    issues.push("target_value is required");
  } else if (!isAbsoluteHttpUrl(targetValue)) {
    issues.push("target_value must be an absolute http or https URL");
  }

  if (!contentType || !ALLOWED_CONTENT_TYPES.has(contentType as ContentActionType)) {
    issues.push("content_type must be comment or post");
  }

  return issues;
}

function countByStatus(rows: ContentBrowserDryRunRow[], status: ContentBrowserDryRunStatus): number {
  return rows.filter((row) => row.browser_dry_run_status === status).length;
}

function summarize(
  readCount: number,
  rows: ContentBrowserDryRunRow[],
  browserStarted: boolean
): ContentBrowserDryRunSummary {
  return {
    readCount,
    plannedCount: rows.filter((row) =>
      [
        "content_browser_dry_run_blocked_by_user_confirmation",
        "content_browser_dry_run_login_failed",
        "content_browser_dry_run_target_failed",
        "content_browser_dry_run_editor_found",
        "content_browser_dry_run_editor_not_found",
        "content_browser_dry_run_target_opened"
      ].includes(row.browser_dry_run_status)
    ).length,
    skippedNotPlannedCount: countByStatus(rows, "content_browser_dry_run_skipped_not_planned"),
    skippedLimitReachedCount: countByStatus(rows, "content_browser_dry_run_skipped_limit_reached"),
    invalidCount: countByStatus(rows, "content_browser_dry_run_invalid_record"),
    blockedByConfirmationCount: countByStatus(rows, "content_browser_dry_run_blocked_by_user_confirmation"),
    loginFailedCount: countByStatus(rows, "content_browser_dry_run_login_failed"),
    targetFailedCount: countByStatus(rows, "content_browser_dry_run_target_failed"),
    editorFoundCount: countByStatus(rows, "content_browser_dry_run_editor_found"),
    editorNotFoundCount: countByStatus(rows, "content_browser_dry_run_editor_not_found"),
    loginRecoveredAfterStateCheckCount: rows.filter((row) =>
      row.reason.includes("login_assumed_success_after_state_check")
    ).length,
    browserStarted,
    dryRunOnly: true
  };
}

function selectEligibleRows(
  planRows: PublishPlanCsvRow[],
  accounts: AccountRow[],
  config: RunContentBrowserDryRunOptions["config"]
): { rows: ContentBrowserDryRunRow[]; eligible: EligibleDryRunRecord[] } {
  const accountById = new Map(accounts.map((account) => [account.account_id, account]));
  const rows: ContentBrowserDryRunRow[] = [];
  const eligible: EligibleDryRunRecord[] = [];
  const acceptedPerAccount = new Map<string, number>();
  let acceptedForRun = 0;

  for (const planRow of planRows) {
    const publishPlanStatus = planRow.publish_plan_status?.trim() ?? "";

    if (publishPlanStatus !== "content_publish_planned") {
      rows.push(buildRow(
        planRow,
        "content_browser_dry_run_skipped_not_planned",
        "publish_plan_status is not content_publish_planned"
      ));
      continue;
    }

    const issues = validatePlannedRow(planRow, accountById);
    if (issues.length > 0) {
      rows.push(buildRow(planRow, "content_browser_dry_run_invalid_record", issues.join("; ")));
      continue;
    }

    const accountId = planRow.account_id.trim();
    const accountAcceptedCount = acceptedPerAccount.get(accountId) ?? 0;

    if (
      acceptedForRun >= config.maxContentBrowserDryRunPerRun ||
      accountAcceptedCount >= config.maxContentBrowserDryRunPerAccount
    ) {
      rows.push(buildRow(
        planRow,
        "content_browser_dry_run_skipped_limit_reached",
        "content browser dry-run limit reached"
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

async function isAnySelectorVisible(page: Page, selectors: readonly string[]): Promise<boolean> {
  for (const selector of selectors) {
    try {
      const locator = page.locator(selector).first();
      const count = await locator.count().catch(() => 0);
      if (count > 0 && await locator.isVisible().catch(() => false)) {
        return true;
      }
    } catch {
      continue;
    }
  }

  return false;
}

async function waitForAnySelectorVisible(
  page: Page,
  selectors: readonly string[],
  timeoutMs: number,
  pollMs: number
): Promise<boolean> {
  const start = Date.now();

  do {
    if (await isAnySelectorVisible(page, selectors)) {
      return true;
    }

    await page.waitForTimeout(pollMs).catch(() => {});
  } while (Date.now() - start < timeoutMs);

  return await isAnySelectorVisible(page, selectors);
}

async function clickFirstVisibleEnabledComposerOpener(page: Page): Promise<ComposerOpenerClickResult> {
  for (const candidate of COMPOSER_OPENER_CANDIDATES) {
    try {
      const locator = page.locator(candidate.selector).first();
      const count = await locator.count().catch(() => 0);
      if (count === 0 || !await locator.isVisible().catch(() => false)) {
        continue;
      }

      if (!await locator.isEnabled().catch(() => false)) {
        return {
          clicked: false,
          note: `composer_opener_found=${candidate.note}; composer_opener_disabled=${candidate.note}`
        };
      }

      await locator.scrollIntoViewIfNeeded().catch(() => {});
      await locator.click();
      return {
        clicked: true,
        note: `composer_opener_found=${candidate.note}; composer_opener_clicked=${candidate.note}`
      };
    } catch (error) {
      return {
        clicked: false,
        note: `composer_opener_found=${candidate.note}; composer_opener_click_failed=${candidate.note}; error=${toMessage(error)}`
      };
    }
  }

  return {
    clicked: false,
    note: "composer_opener_not_found"
  };
}

function isLoginToastDetectionFailure(loginResult: LoginActionResult): boolean {
  return loginResult.result === "login_failed" &&
    (loginResult.details ?? "").includes(LOGIN_RESULT_TOAST_NOT_DETECTED);
}

function shouldCheckLoginState(loginResult: LoginActionResult): boolean {
  if (loginResult.result !== "login_failed") {
    return false;
  }

  if (isLoginToastDetectionFailure(loginResult)) {
    return true;
  }

  const details = loginResult.details ?? "";
  return LOGIN_STATE_CHECK_FAILURE_HINTS.some((hint) => details.includes(hint));
}

function isLoginPageUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.pathname.toLowerCase().includes("/login");
  } catch {
    return url.toLowerCase().includes("/login");
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

async function checkLoginStateAfterUnclearLogin(
  page: Page,
  loginResult: LoginActionResult
): Promise<LoginStateCheckResult> {
  if (!shouldCheckLoginState(loginResult)) {
    return { canContinue: false, note: "" };
  }

  const notePrefix = [
    isLoginToastDetectionFailure(loginResult)
      ? "login_toast_missing_or_delayed"
      : "login_session_check_after_login_form_missing",
    "login_state_checked"
  ];
  const currentUrl = typeof page.url === "function" ? page.url() : "";
  const loginUrlHint = safeLoginUrlHint(currentUrl);
  const loggedInUiVisible = await isAnySelectorVisible(page, LOGGED_IN_UI_SELECTORS);
  const emailVisible = await isAnySelectorVisible(page, [LOGIN_EMAIL_SELECTOR]);
  const passwordVisible = await isAnySelectorVisible(page, [LOGIN_PASSWORD_SELECTOR]);
  const submitVisible = await isAnySelectorVisible(page, [LOGIN_SUBMIT_SELECTOR]);
  const loginFormVisible = emailVisible || passwordVisible || submitVisible;

  if (loggedInUiVisible && !loginFormVisible) {
    return {
      canContinue: true,
      note: [
        ...notePrefix,
        loginUrlHint,
        "logged_in_ui_visible=true",
        `login_form_visible=${loginFormVisible}`,
        "login_assumed_success_after_state_check"
      ].join("; ")
    };
  }

  if (currentUrl && !isLoginPageUrl(currentUrl) && !loginFormVisible) {
    return {
      canContinue: true,
      note: [
        ...notePrefix,
        loginUrlHint,
        "logged_in_ui_visible=false",
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
      `logged_in_ui_visible=${loggedInUiVisible}`,
      `login_email_visible=${emailVisible}`,
      `login_password_visible=${passwordVisible}`,
      `login_submit_visible=${submitVisible}`,
      "login_still_required"
    ].join("; ")
  };
}

export async function inspectContentSurfaceReadOnly(
  page: Page,
  _contentType: ContentActionType
): Promise<ContentSurfaceInspection> {
  const initialEditorFound = await isAnySelectorVisible(page, EDITOR_SELECTORS);
  if (initialEditorFound) {
    return {
      editorFound: true,
      publishButtonSeen: await isAnySelectorVisible(page, PUBLISH_BUTTON_SELECTORS),
      note: "visible_editor_candidate_found_without_clicking"
    };
  }

  const opener = await clickFirstVisibleEnabledComposerOpener(page);
  if (!opener.clicked) {
    return {
      editorFound: false,
      publishButtonSeen: await isAnySelectorVisible(page, PUBLISH_BUTTON_SELECTORS),
      note: `${opener.note}; visible_editor_candidate_not_found`
    };
  }

  const editorFoundAfterClick = await waitForAnySelectorVisible(
    page,
    EDITOR_SELECTORS,
    COMPOSER_OPENER_WAIT_TIMEOUT_MS,
    COMPOSER_OPENER_WAIT_POLL_MS
  );
  const publishButtonSeen = await isAnySelectorVisible(page, PUBLISH_BUTTON_SELECTORS);

  return {
    editorFound: editorFoundAfterClick,
    publishButtonSeen,
    note: editorFoundAfterClick
      ? `${opener.note}; editor_found_after_composer_click`
      : `${opener.note}; composer_opener_clicked_but_editor_not_found`
  };
}

function buildLaunchOptions(
  config: RunContentBrowserDryRunOptions["config"]
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

function getBrowserDryRunLoginTimeoutMs(configTimeoutMs: number): number {
  return Math.min(configTimeoutMs, CONTENT_BROWSER_DRY_RUN_LOGIN_TIMEOUT_MS);
}

async function closePageAndContext(page: Page | undefined, context: BrowserContext | undefined): Promise<void> {
  await page?.close().catch(() => {});
  await context?.close().catch(() => {});
}

async function processEligibleRowsForAccount(
  browser: Browser,
  deps: ContentBrowserDryRunDependencies,
  config: RunContentBrowserDryRunOptions["config"],
  account: AccountRow,
  records: EligibleDryRunRecord[]
): Promise<ContentBrowserDryRunRow[]> {
  let context: BrowserContext | undefined;
  let page: Page | undefined;

  try {
    context = await browser.newContext();
    page = await context.newPage();
    page.setDefaultTimeout(config.timeoutMs);

    let loginResult: LoginActionResult;
    try {
      page.setDefaultTimeout(getBrowserDryRunLoginTimeoutMs(config.timeoutMs));
      try {
        loginResult = await deps.loginAccount({ context, page }, account);
      } finally {
        page.setDefaultTimeout(config.timeoutMs);
      }
    } catch (error) {
      const reason = `login threw error: ${toMessage(error)}`;
      return records.map((record) =>
        buildRow(record.planRow, "content_browser_dry_run_login_failed", reason)
      );
    }

    let loginStateNote = "";
    if (loginResult.result !== "login_success") {
      const loginStateCheck = await checkLoginStateAfterUnclearLogin(page, loginResult);
      loginStateNote = loginStateCheck.note;
      if (loginStateCheck.canContinue) {
        loginResult = {
          result: "login_success",
          details: "login treated as success after state check because page no longer looks like login screen"
        };
      }
    }

    if (loginResult.result !== "login_success") {
      const reason = loginStateNote || loginResult.details || `login result: ${loginResult.result}`;
      return records.map((record) =>
        buildRow(record.planRow, "content_browser_dry_run_login_failed", reason)
      );
    }

    const outputRows: ContentBrowserDryRunRow[] = [];

    for (const record of records) {
      try {
        await page.goto(record.planRow.target_value.trim(), { waitUntil: "domcontentloaded" });
        await page.waitForLoadState("networkidle").catch(() => {});
      } catch (error) {
        outputRows.push(buildRow(
          record.planRow,
          "content_browser_dry_run_target_failed",
          [
            loginStateNote,
            `target open failed: ${toMessage(error)}`
          ].filter(Boolean).join("; ")
        ));
        continue;
      }

      const inspection = await deps.inspectContentSurface(
        page,
        record.planRow.content_type.trim() as ContentActionType
      );
      const status: ContentBrowserDryRunStatus = inspection.editorFound
        ? "content_browser_dry_run_editor_found"
        : "content_browser_dry_run_editor_not_found";
      const reason = inspection.note
        ? `target opened; ${inspection.note}; no typing or publishing`
        : inspection.editorFound
          ? "target opened; visible editor candidate found without typing or publishing"
          : "target opened; visible editor candidate not found";
      const reasonWithLoginState = [
        loginStateNote,
        reason
      ].filter(Boolean).join("; ");

      outputRows.push(buildRow(
        record.planRow,
        status,
        reasonWithLoginState,
        inspection.editorFound,
        inspection.publishButtonSeen
      ));
    }

    return outputRows;
  } finally {
    await closePageAndContext(page, context);
  }
}

export async function runContentBrowserDryRun(
  options: RunContentBrowserDryRunOptions
): Promise<ContentBrowserDryRunResult> {
  const deps: ContentBrowserDryRunDependencies = {
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

  if (options.userConfirmation !== "YES") {
    const blockedRows = eligible.map((record) =>
      buildRow(
        record.planRow,
        "content_browser_dry_run_blocked_by_user_confirmation",
        "user did not type exactly YES; browser was not started"
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
        "content_browser_dry_run_target_failed",
        `browser launch failed: ${toMessage(error)}`
      )
    );
    const allRows = [...rows, ...failedRows];

    return {
      rows: allRows,
      summary: summarize(options.planRows.length, allRows, false)
    };
  }

  try {
    const recordsByAccount = new Map<string, EligibleDryRunRecord[]>();
    for (const record of eligible) {
      const list = recordsByAccount.get(record.account.account_id) ?? [];
      list.push(record);
      recordsByAccount.set(record.account.account_id, list);
    }

    const browserRows: ContentBrowserDryRunRow[] = [];
    for (const records of recordsByAccount.values()) {
      browserRows.push(...await processEligibleRowsForAccount(
        browser,
        deps,
        options.config,
        records[0].account,
        records
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

function writeBrowserDryRunCsv(filePath: string, rows: ContentBrowserDryRunRow[]): void {
  const lines = [
    BROWSER_DRY_RUN_HEADERS.map(escapeContentCsvValue).join(","),
    ...rows.map((row) =>
      BROWSER_DRY_RUN_HEADERS.map((header) =>
        escapeContentCsvValue(String(row[header] ?? ""))
      ).join(",")
    )
  ];

  writeFileSync(filePath, `${lines.join("\n")}\n`, "utf-8");
}

export function findLatestContentPublishPlanFile(
  publishPlanDir = CONTENT_PUBLISH_PLAN_DIR
): string {
  if (!existsSync(publishPlanDir)) {
    throw new Error(`content publish plan directory does not exist: ${publishPlanDir}`);
  }

  const files = readdirSync(publishPlanDir)
    .filter((fileName) => PUBLISH_PLAN_FILE_PATTERN.test(fileName))
    .map((fileName) => ({
      fileName,
      filePath: path.join(publishPlanDir, fileName),
      mtimeMs: statSync(path.join(publishPlanDir, fileName)).mtimeMs
    }))
    .sort((left, right) => right.mtimeMs - left.mtimeMs || right.fileName.localeCompare(left.fileName));

  if (files.length === 0) {
    throw new Error(`no content publish plan CSV files found in: ${publishPlanDir}`);
  }

  return files[0].filePath;
}

export function readContentPublishPlanFile(filePath: string): PublishPlanCsvRow[] {
  return readPlanRows(filePath);
}

export function exportContentBrowserDryRun(
  rows: ContentBrowserDryRunRow[],
  date = new Date(),
  outputDir = CONTENT_BROWSER_DRY_RUN_DIR
): string {
  ensureDir(outputDir);

  const runId = formatContentRunId(date);
  const filePath = path.join(outputDir, `content-browser-dry-run-${runId}.csv`);
  writeBrowserDryRunCsv(filePath, rows);

  return filePath;
}
