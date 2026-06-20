import type { ValidAccountRecord } from "../input/types";
import type { AppSettings } from "../shared/types";
import type {
  ContentActionRecord,
  ContentApprovalRow,
  ContentDryRunResult,
  ContentDryRunRow,
  ContentDryRunStatus,
  LoadedContentActions
} from "./types";

interface RunContentDryRunOptions {
  loadedActions: LoadedContentActions;
  accounts: ValidAccountRecord[];
  config: Pick<
    AppSettings,
    | "maxContentActionsPerRun"
    | "maxContentActionsPerAccount"
    | "requireManualApprovalForContent"
    | "contentDryRunDefault"
  >;
}

function increment(counts: Record<string, number>, key: string): void {
  counts[key] = (counts[key] ?? 0) + 1;
}

function toApprovalStatus(status: ContentDryRunStatus): string {
  return status === "content_waiting_for_approval" ? "pending" : "";
}

function buildDryRunRow(
  action: ContentActionRecord,
  accountLanguage: string,
  status: ContentDryRunStatus,
  errorMessage = ""
): ContentDryRunRow {
  return {
    content_action_id: action.content_action_id,
    account_id: action.account_id,
    target_type: action.target_type,
    target_value: action.target_value,
    content_type: action.content_type,
    account_language: accountLanguage,
    action_language: action.language,
    status,
    approval_status: toApprovalStatus(status),
    note: action.note,
    error_message: errorMessage
  };
}

function buildApprovalRow(row: ContentDryRunRow): ContentApprovalRow {
  return {
    content_action_id: row.content_action_id,
    account_id: row.account_id,
    target_type: row.target_type,
    target_value: row.target_value,
    content_type: row.content_type,
    account_language: row.account_language,
    action_language: row.action_language,
    approval_status: row.approval_status,
    approved_text: "",
    approved_title: "",
    reviewer_note: ""
  };
}

function decideReadyStatus(config: RunContentDryRunOptions["config"]): ContentDryRunStatus {
  if (config.requireManualApprovalForContent) {
    return "content_waiting_for_approval";
  }

  return "content_dry_run_ready";
}

export function runContentDryRun(options: RunContentDryRunOptions): ContentDryRunResult {
  const rows: ContentDryRunRow[] = [];
  const approvalRows: ContentApprovalRow[] = [];
  const skippedByStatus: Record<string, number> = {};
  const accountById = new Map(options.accounts.map((account) => [account.account_id, account]));
  const acceptedPerAccount = new Map<string, number>();
  let acceptedForRun = 0;
  let dryRunReadyCount = 0;
  let waitingForApprovalCount = 0;

  for (const disabled of options.loadedActions.disabled) {
    const row: ContentDryRunRow = {
      content_action_id: disabled.raw.content_action_id?.trim() ?? "",
      account_id: disabled.raw.account_id?.trim() ?? "",
      target_type: disabled.raw.target_type?.trim() ?? "",
      target_value: disabled.raw.target_value?.trim() ?? "",
      content_type: disabled.raw.content_type?.trim() ?? "",
      account_language: "",
      action_language: disabled.raw.language?.trim().toLowerCase() ?? "",
      status: "content_skipped_disabled",
      approval_status: "",
      note: disabled.raw.note?.trim() ?? "",
      error_message: "content action is disabled"
    };
    rows.push(row);
    increment(skippedByStatus, row.status);
  }

  for (const rejected of options.loadedActions.rejected) {
    const row: ContentDryRunRow = {
      content_action_id: rejected.raw.content_action_id?.trim() ?? "",
      account_id: rejected.raw.account_id?.trim() ?? "",
      target_type: rejected.raw.target_type?.trim() ?? "",
      target_value: rejected.raw.target_value?.trim() ?? "",
      content_type: rejected.raw.content_type?.trim() ?? "",
      account_language: "",
      action_language: rejected.raw.language?.trim().toLowerCase() ?? "",
      status: "content_invalid_action",
      approval_status: "",
      note: rejected.raw.note?.trim() ?? "",
      error_message: rejected.issues.map((issue) => `${issue.field}: ${issue.code}`).join("; ")
    };
    rows.push(row);
    increment(skippedByStatus, row.status);
  }

  for (const action of options.loadedActions.valid) {
    const account = accountById.get(action.account_id);
    if (!account) {
      const row = buildDryRunRow(
        action,
        "",
        "content_invalid_account",
        "account_id does not exist in loaded accounts"
      );
      rows.push(row);
      increment(skippedByStatus, row.status);
      continue;
    }

    if (account.language === "unknown") {
      const row = buildDryRunRow(
        action,
        account.language,
        "content_skipped_language_unknown",
        "account language is unknown"
      );
      rows.push(row);
      increment(skippedByStatus, row.status);
      continue;
    }

    if (action.language !== account.language) {
      const row = buildDryRunRow(
        action,
        account.language,
        "content_skipped_language_mismatch",
        "content action language differs from account language"
      );
      rows.push(row);
      increment(skippedByStatus, row.status);
      continue;
    }

    const accountAcceptedCount = acceptedPerAccount.get(account.account_id) ?? 0;
    if (
      acceptedForRun >= options.config.maxContentActionsPerRun ||
      accountAcceptedCount >= options.config.maxContentActionsPerAccount
    ) {
      const row = buildDryRunRow(
        action,
        account.language,
        "content_skipped_limit_reached",
        "content action limit reached"
      );
      rows.push(row);
      increment(skippedByStatus, row.status);
      continue;
    }

    acceptedForRun += 1;
    acceptedPerAccount.set(account.account_id, accountAcceptedCount + 1);

    const row = buildDryRunRow(action, account.language, decideReadyStatus(options.config));
    rows.push(row);

    if (row.status === "content_waiting_for_approval") {
      waitingForApprovalCount += 1;
      approvalRows.push(buildApprovalRow(row));
    } else {
      dryRunReadyCount += 1;
    }
  }

  return {
    rows,
    approvalRows,
    summary: {
      loadedCount:
        options.loadedActions.valid.length +
        options.loadedActions.disabled.length +
        options.loadedActions.rejected.length,
      dryRunReadyCount,
      waitingForApprovalCount,
      skippedByStatus,
      executedActionsCount: 0
    }
  };
}
