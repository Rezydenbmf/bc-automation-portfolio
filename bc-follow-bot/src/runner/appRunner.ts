import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { Browser, BrowserContext, Page, chromium } from "playwright";
import {
  loginAccount as loginAccountDefault,
  LoginActionResult,
} from "../auth/authService";
import {
  followProfile as followProfileDefault,
} from "../follow/followService";
import { validateAccountRow, validateTargetRow } from "../input/validation";
import { logResult as logResultDefault } from "../logs/logger";
import { searchTarget as searchTargetDefault } from "../search/searchService";
import {
  AccountRow,
  AppSettings,
  FollowActionResult,
  LogEntry,
  SearchOutcome,
  SearchResult,
  TargetRow,
} from "../shared/types";
import {
  appendProfileActionHistoryEntry as appendProfileActionHistoryEntryDefault,
  AppendProfileActionHistoryInput,
  hasSafelyProcessedProfile as hasSafelyProcessedProfileDefault,
} from "../state/profileActionHistory";
import {
  FinalTargetStatus,
  mapFollowResultToFinalTargetStatus,
  mapLoginResultToFinalTargetStatus,
  mapSearchResultToFinalTargetStatus,
} from "./targetOutcome";
import {
  createRunSummary,
  formatRunSummary,
  recordAccountProcessed,
  recordCleanupIssue,
  recordTargetOutcome,
  RunSummary,
} from "./runSummary";
import {
  logRunnerTechnicalEntry,
  RunnerTechnicalLogEntry,
  RunnerTechnicalStep,
} from "./technicalLog";
import {
  appendRunResult,
  createRunResultsExport,
  RunResultFinalStatus,
  RunResultsExport,
} from "./runResultsExport";
import {
  createRunPreflightScale,
  formatLargeRunConfirmationPrompt,
  formatRunPreflightScale,
} from "./runPreflight";

const ALLOWED_BROWSER_CHANNELS = new Set(["msedge", "chrome"]);

export interface RunAppInputs {
  config: AppSettings;
  accounts: AccountRow[];
  targets: TargetRow[];
}

export function shouldAttemptFollow(searchOutcome: SearchOutcome | undefined): boolean {
  return searchOutcome === "person";
}

interface RunnerDependencies {
  launchBrowser: (
    options: Parameters<typeof chromium.launch>[0],
  ) => Promise<Browser>;
  loginAccount: typeof loginAccountDefault;
  searchTarget: typeof searchTargetDefault;
  followProfile: typeof followProfileDefault;
  logResult: (entry: LogEntry) => void;
  logTechnicalEntry: (entry: RunnerTechnicalLogEntry) => void;
  appendProfileActionHistoryEntry?: (
    entry: AppendProfileActionHistoryInput,
  ) => void;
  hasSafelyProcessedProfile?: (
    accountEmail: string,
    profileUrl: string | null | undefined,
  ) => boolean;
  askManualConfirmation: (prompt: string) => Promise<string>;
}

const defaultRunnerDependencies: RunnerDependencies = {
  launchBrowser: (options) => chromium.launch(options),
  loginAccount: loginAccountDefault,
  searchTarget: searchTargetDefault,
  followProfile: followProfileDefault,
  logResult: logResultDefault,
  logTechnicalEntry: logRunnerTechnicalEntry,
  appendProfileActionHistoryEntry: appendProfileActionHistoryEntryDefault,
  hasSafelyProcessedProfile: hasSafelyProcessedProfileDefault,
  askManualConfirmation: async (prompt) => {
    const readline = createInterface({ input, output });
    try {
      return await readline.question(prompt);
    } finally {
      readline.close();
    }
  },
};

interface ProcessTargetResult {
  stopAccount: boolean;
  stopReason?: "search_failed" | "follow_failed";
  stopTarget?: string;
}

interface FollowLimitState {
  maxFollowsPerRun?: number;
  followedCount: number;
}

function toTimestamp(): string {
  return new Date().toISOString();
}

function logTechnical(
  deps: RunnerDependencies,
  step: RunnerTechnicalStep,
  account: string,
  target: string,
  details: string,
  errorMessage = "",
): void {
  deps.logTechnicalEntry({
    timestamp: toTimestamp(),
    step,
    account,
    target,
    details,
    error_message: errorMessage,
  });
}

function logFinalTargetResult(
  deps: RunnerDependencies,
  summary: RunSummary,
  runResultsExport: RunResultsExport,
  account: string,
  target: TargetRow,
  result: FinalTargetStatus,
  errorMessage = "",
  searchResult = "",
  followResult = "",
  profileUrl: string | null = null,
): void {
  const timestamp = toTimestamp();
  deps.logResult({
    timestamp,
    account,
    target: target.target_value,
    action: "target",
    result,
    error_message: errorMessage,
  });
  try {
    deps.appendProfileActionHistoryEntry?.({
      timestamp,
      accountEmail: account,
      targetId: target.target_id,
      targetType: target.target_type,
      targetValue: target.target_value,
      profileUrl,
      searchOutcome: searchResult,
      followOutcome: followResult,
      finalResult: result,
      error: errorMessage,
    });
  } catch (error) {
    const historyError = error instanceof Error ? error.message : String(error);
    logTechnical(
      deps,
      "error",
      account,
      target.target_value,
      "profile_action_history_write_failed",
      historyError,
    );
  }
  appendRunResult(runResultsExport.filePath, {
    run_id: runResultsExport.runId,
    finished_at: timestamp,
    account_email: account,
    target_id: target.target_id,
    target_type: target.target_type,
    target_value: target.target_value,
    search_result: searchResult,
    follow_result: followResult,
    final_status: mapRunResultFinalStatus(result, searchResult, followResult),
    error_message: errorMessage,
  });
  recordTargetOutcome(summary, result);
}

function mapRunResultFinalStatus(
  result: FinalTargetStatus,
  searchResult: string,
  followResult: string,
): RunResultFinalStatus {
  if (result === "followed" || result === "already_following") {
    return result;
  }

  if (result === "login_failed") {
    return "login_failed";
  }

  if (result === "follow_failed" || followResult === "follow_failed") {
    return "follow_failed";
  }

  if (result === "already_processed") {
    return "already_processed";
  }

  if (result === "follow_limit_reached") {
    return "follow_limit_reached";
  }

  if (searchResult === "company") {
    return "skipped_company";
  }

  if (searchResult === "not_found" || result === "not_found") {
    return "skipped_not_found";
  }

  if (searchResult === "search_failed" || result === "portal_unavailable") {
    return "search_failed";
  }

  return "error";
}

async function processTarget(
  deps: RunnerDependencies,
  summary: RunSummary,
  runResultsExport: RunResultsExport,
  account: AccountRow,
  page: Page,
  target: TargetRow,
  followLimit: FollowLimitState,
): Promise<ProcessTargetResult> {
  logTechnical(
    deps,
    "target_started",
    account.email,
    target.target_value,
    "target_started",
  );

  const targetValidation = validateTargetRow(target);
  if (!targetValidation.valid) {
    logFinalTargetResult(
      deps,
      summary,
      runResultsExport,
      account.email,
      target,
      "invalid_target",
      targetValidation.reason ?? "invalid_target",
    );
    logTechnical(
      deps,
      "error",
      account.email,
      target.target_value,
      targetValidation.reason ?? "invalid_target",
    );
    logTechnical(
      deps,
      "target_finished",
      account.email,
      target.target_value,
      "result=invalid_target",
      targetValidation.reason ?? "invalid_target",
    );
    return { stopAccount: false };
  }

  logTechnical(
    deps,
    "search_started",
    account.email,
    target.target_value,
    "search_started",
  );
  let searchResult: SearchResult;

  try {
    searchResult = await deps.searchTarget(page, target);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logTechnical(
      deps,
      "error",
      account.email,
      target.target_value,
      "search_failed",
      message,
    );
    logFinalTargetResult(
      deps,
      summary,
      runResultsExport,
      account.email,
      target,
      "portal_unavailable",
      message,
      "search_failed",
    );
    logTechnical(
      deps,
      "target_finished",
      account.email,
      target.target_value,
      "result=portal_unavailable",
      message,
    );
    return {
      stopAccount: true,
      stopReason: "search_failed",
      stopTarget: target.target_value,
    };
  }

  let targetResult = mapSearchResultToFinalTargetStatus(searchResult);
  let targetErrorMessage = searchResult.details ?? "";
  const searchResultForExport = searchResult.searchOutcome ?? searchResult.status;
  let followResultForExport = "";

  if (searchResult.searchOutcome) {
    const searchDetails = shouldAttemptFollow(searchResult.searchOutcome)
      ? "search_outcome=person;next_action=follow"
      : `search_outcome=${searchResult.searchOutcome};final_status=${searchResult.status}`;

    logTechnical(
      deps,
      "search_finished",
      account.email,
      target.target_value,
      searchDetails,
      searchResult.details ?? "",
    );
  } else if (searchResult.status === "invalid_target") {
    logTechnical(
      deps,
      "search_finished",
      account.email,
      target.target_value,
      "invalid_target",
      searchResult.details ?? "",
    );
  } else {
    logTechnical(
      deps,
      "search_finished",
      account.email,
      target.target_value,
      "portal_unavailable",
      searchResult.details ?? "",
    );
  }

  if (shouldAttemptFollow(searchResult.searchOutcome)) {
    if (
      deps.hasSafelyProcessedProfile?.(
        account.email,
        searchResult.resolvedProfileUrl ?? null,
      )
    ) {
      targetResult = "already_processed";
      targetErrorMessage = "profile_already_processed";
      followResultForExport = "follow_skipped_already_processed";
      logTechnical(
        deps,
        "follow_finished",
        account.email,
        target.target_value,
        "follow_skipped_already_processed",
        "profile_already_processed",
      );
    } else if (
      followLimit.maxFollowsPerRun !== undefined &&
      followLimit.followedCount >= followLimit.maxFollowsPerRun
    ) {
      targetResult = "follow_limit_reached";
      targetErrorMessage = "max_follows_per_run_reached";
      followResultForExport = "follow_limit_reached";
      logTechnical(
        deps,
        "follow_finished",
        account.email,
        target.target_value,
        "follow_limit_reached",
        "max_follows_per_run_reached",
      );
    } else {
      logTechnical(
        deps,
        "follow_started",
        account.email,
        target.target_value,
        `search_outcome=${searchResult.searchOutcome}`,
      );

      let followResult: FollowActionResult;

      try {
        followResult = await deps.followProfile(page);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logTechnical(
          deps,
          "error",
          account.email,
          target.target_value,
          "follow_failed",
          message,
        );
        logFinalTargetResult(
          deps,
          summary,
          runResultsExport,
          account.email,
          target,
          "follow_failed",
          message,
          searchResultForExport,
          "follow_failed",
          searchResult.resolvedProfileUrl ?? null,
        );
        logTechnical(
          deps,
          "target_finished",
          account.email,
          target.target_value,
          "result=follow_failed",
          message,
        );
        return {
          stopAccount: true,
          stopReason: "follow_failed",
          stopTarget: target.target_value,
        };
      }

      targetResult = mapFollowResultToFinalTargetStatus(followResult);
      targetErrorMessage = followResult.details ?? "";
      followResultForExport = followResult.result;
      if (targetResult === "followed") {
        followLimit.followedCount += 1;
      }

      logTechnical(
        deps,
        "follow_finished",
        account.email,
        target.target_value,
        `result=${followResult.result}`,
        followResult.details ?? "",
      );
    }
  }

  logFinalTargetResult(
    deps,
    summary,
    runResultsExport,
    account.email,
    target,
    targetResult,
    targetErrorMessage,
    searchResultForExport,
    followResultForExport,
    searchResult.resolvedProfileUrl ?? null,
  );
  logTechnical(
    deps,
    "target_finished",
    account.email,
    target.target_value,
    `result=${targetResult}`,
    targetErrorMessage,
  );

  return { stopAccount: false };
}

async function closeAccountResources(
  deps: RunnerDependencies,
  summary: RunSummary,
  account: string,
  page: Page | undefined,
  context: BrowserContext | undefined,
): Promise<string> {
  const cleanupDetails: string[] = [];
  const cleanupErrors: string[] = [];

  if (page) {
    try {
      await page.close();
      cleanupDetails.push("page_closed=true");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      cleanupDetails.push("page_closed=false");
      cleanupErrors.push("page_close_failed");
      recordCleanupIssue(summary);
      logTechnical(deps, "error", account, "", "page_close_failed", message);
    }
  } else {
    cleanupDetails.push("page_closed=not_created");
  }

  if (context) {
    try {
      await context.close();
      cleanupDetails.push("context_closed=true");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      cleanupDetails.push("context_closed=false");
      cleanupErrors.push("context_close_failed");
      recordCleanupIssue(summary);
      logTechnical(deps, "error", account, "", "context_close_failed", message);
    }
  } else {
    cleanupDetails.push("context_closed=not_created");
  }

  cleanupDetails.push(
    `cleanup_errors=${cleanupErrors.length > 0 ? cleanupErrors.join("|") : "none"}`,
  );

  return cleanupDetails.join(";");
}

async function closeBrowser(
  deps: RunnerDependencies,
  browser: Browser,
  summary: RunSummary,
): Promise<void> {
  try {
    await browser.close();
    logTechnical(
      deps,
      "run_finished",
      "",
      "",
      `browser_closed;${formatRunSummary(summary)}`,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    recordCleanupIssue(summary);
    logTechnical(deps, "error", "", "", "browser_close_failed", message);
    logTechnical(
      deps,
      "run_finished",
      "",
      "",
      `browser_close_failed;${formatRunSummary(summary)}`,
      message,
    );
  }
}

async function sleep(ms: number): Promise<void> {
  if (ms <= 0) {
    return;
  }

  await new Promise((resolve) => setTimeout(resolve, ms));
}

export async function runApp(inputs: RunAppInputs): Promise<void> {
  await runAppWithDependencies(inputs, defaultRunnerDependencies);
}

export async function runAppWithDependencies(
  inputs: RunAppInputs,
  deps: RunnerDependencies,
): Promise<void> {
  const settings = inputs.config;
  const accounts = inputs.accounts;
  const targets = inputs.targets.filter((target) => target.enabled);
  const summary = createRunSummary(accounts.length, targets.length);
  const runResultsExport = createRunResultsExport();
  const followLimit: FollowLimitState = {
    maxFollowsPerRun: settings.maxFollowsPerRun,
    followedCount: 0,
  };
  const browserChannelSetting = process.env.PLAYWRIGHT_BROWSER_CHANNEL?.trim();
  const browserExecutablePathSetting =
    process.env.PLAYWRIGHT_EXECUTABLE_PATH?.trim();
  const requireManualConfirmForLargeRun =
    settings.requireManualConfirmForLargeRun !== false;

  logTechnical(
    deps,
    "run_started",
    "",
    "",
    `enabled_accounts=${accounts.length};enabled_targets=${targets.length}`,
  );

  const preflightScale = createRunPreflightScale(
    accounts.length,
    targets.length,
    settings,
  );
  const preflightDetails = formatRunPreflightScale(preflightScale);

  logTechnical(deps, "preflight", "", "", preflightDetails);

  if (preflightScale.warning) {
    logTechnical(
      deps,
      "preflight_warning",
      "",
      "",
      `planned_operations_exceed_threshold;${preflightDetails}`,
      requireManualConfirmForLargeRun
        ? "manual_confirmation_required"
        : "manual_confirmation_disabled",
    );

    if (requireManualConfirmForLargeRun) {
      const answer = await deps.askManualConfirmation(
        formatLargeRunConfirmationPrompt(preflightScale),
      );

      if (answer !== "YES") {
        const message =
          "manual_confirmation_rejected;browser_not_started;login_not_started;follow_not_started";
        console.log(
          "Run przerwany: nie wpisano dokladnie YES. Browser, login i follow nie zostaly uruchomione.",
        );
        logTechnical(deps, "error", "", "", "manual_confirmation_rejected", message);
        logTechnical(deps, "run_finished", "", "", message);
        return;
      }

      logTechnical(
        deps,
        "preflight_warning",
        "",
        "",
        `manual_confirmation_accepted;${preflightDetails}`,
        "user_typed_yes",
      );
    } else {
      console.log(
        `UWAGA: planowany run przekracza prog. ${preflightDetails}. requireManualConfirmForLargeRun=false, run idzie dalej bez pytania.`,
      );
    }
  }

  if (
    browserChannelSetting &&
    !ALLOWED_BROWSER_CHANNELS.has(browserChannelSetting)
  ) {
    const message = `Unsupported PLAYWRIGHT_BROWSER_CHANNEL "${browserChannelSetting}". Allowed values: msedge, chrome.`;
    logTechnical(
      deps,
      "error",
      "",
      "",
      "invalid_browser_channel",
      message,
    );
    logTechnical(deps, "run_finished", "", "", "browser_not_started", message);
    throw new Error(message);
  }

  let browser: Browser;

  try {
    browser = await deps.launchBrowser({
      headless: settings.headless,
      slowMo: settings.slowMo,
      ...(browserExecutablePathSetting
        ? { executablePath: browserExecutablePathSetting }
        : {}),
      ...(browserChannelSetting ? { channel: browserChannelSetting } : {}),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    if (browserExecutablePathSetting) {
      const wrappedMessage = `Requested Playwright executablePath "${browserExecutablePathSetting}" is not available on this machine. ${message}`;
      logTechnical(
        deps,
        "error",
        "",
        "",
        "browser_executable_path_unavailable",
        wrappedMessage,
      );
      logTechnical(
        deps,
        "run_finished",
        "",
        "",
        "browser_not_started",
        wrappedMessage,
      );
      throw new Error(wrappedMessage);
    }

    if (browserChannelSetting) {
      const wrappedMessage = `Requested Playwright browser channel "${browserChannelSetting}" is not available on this machine. ${message}`;
      logTechnical(
        deps,
        "error",
        "",
        "",
        "browser_channel_unavailable",
        wrappedMessage,
      );
      logTechnical(
        deps,
        "run_finished",
        "",
        "",
        "browser_not_started",
        wrappedMessage,
      );
      throw new Error(wrappedMessage);
    }

    logTechnical(
      deps,
      "error",
      "",
      "",
      "default_browser_launch_failed",
      message,
    );
    logTechnical(deps, "run_finished", "", "", "browser_not_started", message);
    throw error;
  }

  try {
    for (const account of accounts) {
      recordAccountProcessed(summary);
      const accountName = account.email || account.account_id;
      let context: BrowserContext | undefined;
      let page: Page | undefined;
      let accountFinishedDetails = "account_finished";
      logTechnical(deps, "account_started", accountName, "", "account_started");

      try {
        const accountValidation = validateAccountRow(account);
        if (!accountValidation.valid) {
          deps.logResult({
            timestamp: toTimestamp(),
            account: accountName,
            target: "",
            action: "account_validation",
            result: "login_failed",
            error_message: accountValidation.reason ?? "invalid_account",
          });
          logTechnical(
            deps,
            "error",
            accountName,
            "",
            accountValidation.reason ?? "invalid_account",
          );
          accountFinishedDetails = "account_finished;account_validation_failed";
          continue;
        }

        context = await browser.newContext();
        logTechnical(
          deps,
          "context_created",
          account.email,
          "",
          "browser_context_created",
        );

        page = await context.newPage();
        logTechnical(deps, "page_created", account.email, "", "page_created");
        page.setDefaultTimeout(settings.timeoutMs);

        try {
          logTechnical(deps, "login_started", account.email, "", "login_started");
          const loginResult: LoginActionResult = await deps.loginAccount(
            { context, page },
            account,
          );

          deps.logResult({
            timestamp: toTimestamp(),
            account: account.email,
            target: "",
            action: "login",
            result: loginResult.result,
            error_message: loginResult.details ?? "",
          });

          logTechnical(
            deps,
            "login_finished",
            account.email,
            "",
            `result=${loginResult.result}`,
            loginResult.details ?? "",
          );

          if (loginResult.result !== "login_success") {
            for (const target of targets) {
              logFinalTargetResult(
                deps,
                summary,
                runResultsExport,
                account.email,
                target,
                mapLoginResultToFinalTargetStatus(loginResult.result),
                loginResult.details ?? "",
              );
            }
            accountFinishedDetails = `account_finished;login_result=${loginResult.result}`;
            await page.waitForTimeout(15000);
            continue;
          }
        } catch (error) {
          const message =
            error instanceof Error ? error.message : "Unknown login error";

          deps.logResult({
            timestamp: toTimestamp(),
            account: account.email,
            target: "",
            action: "login",
            result: "login_failed",
            error_message: message,
          });

          logTechnical(
            deps,
            "error",
            account.email,
            "",
            "login_failed",
            message,
          );
          for (const target of targets) {
            logFinalTargetResult(
              deps,
              summary,
              runResultsExport,
              account.email,
              target,
              "login_failed",
              message,
            );
          }
          accountFinishedDetails = "account_finished;login_exception";
          await page.waitForTimeout(15000);
          continue;
        }

        if (targets.length === 0) {
          logTechnical(
            deps,
            "error",
            account.email,
            "",
            "no_targets_available",
          );
          accountFinishedDetails = "account_finished;no_targets_available";
          await page.waitForTimeout(15000);
          continue;
        }

        for (const target of targets) {
          const targetResult = await processTarget(
            deps,
            summary,
            runResultsExport,
            account,
            page,
            target,
            followLimit,
          );
          if (targetResult.stopAccount) {
            accountFinishedDetails = `account_stopped_after_target_error;target=${targetResult.stopTarget ?? target.target_value};reason=${targetResult.stopReason ?? "unknown"}`;
            break;
          }

          await page.waitForTimeout(settings.delayBetweenTargetsMs);
        }

        await page.waitForTimeout(15000);
      } finally {
        const cleanupDetails = await closeAccountResources(
          deps,
          summary,
          accountName,
          page,
          context,
        );
        logTechnical(
          deps,
          "account_finished",
          accountName,
          "",
          `${accountFinishedDetails};${cleanupDetails}`,
        );
      }
    }
  } finally {
    await closeBrowser(deps, browser, summary);
  }
}
