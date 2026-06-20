import { FinalTargetStatus } from "./targetOutcome";

export interface RunSummary {
  accounts_total: number;
  accounts_processed: number;
  targets_total_enabled: number;
  targets_processed: number;
  followed: number;
  already_following: number;
  not_found: number;
  login_failed: number;
  follow_failed: number;
  already_processed: number;
  followLimitReached: number;
  invalid_target: number;
  portal_unavailable: number;
  cleanup_issues: number;
}

export function createRunSummary(
  accountsTotal: number,
  targetsTotalEnabled: number,
): RunSummary {
  return {
    accounts_total: accountsTotal,
    accounts_processed: 0,
    targets_total_enabled: targetsTotalEnabled,
    targets_processed: 0,
    followed: 0,
    already_following: 0,
    not_found: 0,
    login_failed: 0,
    follow_failed: 0,
    already_processed: 0,
    followLimitReached: 0,
    invalid_target: 0,
    portal_unavailable: 0,
    cleanup_issues: 0,
  };
}

export function recordAccountProcessed(summary: RunSummary): void {
  summary.accounts_processed += 1;
}

export function recordTargetOutcome(
  summary: RunSummary,
  result: FinalTargetStatus,
): void {
  summary.targets_processed += 1;
  if (result === "follow_limit_reached") {
    summary.followLimitReached += 1;
    return;
  }

  summary[result] += 1;
}

export function recordCleanupIssue(summary: RunSummary): void {
  summary.cleanup_issues += 1;
}

export function formatRunSummary(summary: RunSummary): string {
  return [
    `accounts_total=${summary.accounts_total}`,
    `accounts_processed=${summary.accounts_processed}`,
    `targets_total_enabled=${summary.targets_total_enabled}`,
    `targets_processed=${summary.targets_processed}`,
    `followed=${summary.followed}`,
    `already_following=${summary.already_following}`,
    `not_found=${summary.not_found}`,
    `login_failed=${summary.login_failed}`,
    `follow_failed=${summary.follow_failed}`,
    `already_processed=${summary.already_processed}`,
    `followLimitReached=${summary.followLimitReached}`,
    `invalid_target=${summary.invalid_target}`,
    `portal_unavailable=${summary.portal_unavailable}`,
    `cleanup_issues=${summary.cleanup_issues}`,
  ].join(";");
}
