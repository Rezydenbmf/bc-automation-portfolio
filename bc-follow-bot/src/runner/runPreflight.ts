import { AppSettings } from "../shared/types";

export const DEFAULT_PREFLIGHT_OPERATION_WARNING_THRESHOLD = 100;

export interface RunPreflightScale {
  activeAccounts: number;
  activeTargets: number;
  plannedOperations: number;
  operationWarningThreshold: number;
  maxFollowsPerRun?: number;
  warning: boolean;
}

export function createRunPreflightScale(
  activeAccounts: number,
  activeTargets: number,
  settings: Pick<AppSettings, "maxFollowsPerRun" | "preflightOperationWarningThreshold">,
): RunPreflightScale {
  const operationWarningThreshold =
    settings.preflightOperationWarningThreshold ??
    DEFAULT_PREFLIGHT_OPERATION_WARNING_THRESHOLD;
  const plannedOperations = activeAccounts * activeTargets;

  return {
    activeAccounts,
    activeTargets,
    plannedOperations,
    operationWarningThreshold,
    ...(settings.maxFollowsPerRun !== undefined
      ? { maxFollowsPerRun: settings.maxFollowsPerRun }
      : {}),
    warning: plannedOperations > operationWarningThreshold,
  };
}

export function formatRunPreflightScale(scale: RunPreflightScale): string {
  return [
    `active_accounts=${scale.activeAccounts}`,
    `active_targets=${scale.activeTargets}`,
    `planned_operations=${scale.plannedOperations}`,
    `max_follows_per_run=${scale.maxFollowsPerRun ?? "not_set"}`,
    `operation_warning_threshold=${scale.operationWarningThreshold}`,
  ].join(";");
}

export function formatLargeRunConfirmationPrompt(scale: RunPreflightScale): string {
  return [
    "UWAGA: planowany jest duzy follow run.",
    `Aktywne konta: ${scale.activeAccounts}`,
    `Aktywne targety: ${scale.activeTargets}`,
    `Planowane operacje: ${scale.plannedOperations}`,
    `Prog ostrzezenia: ${scale.operationWarningThreshold}`,
    "Run przekracza skonfigurowany prog bezpieczenstwa.",
    "Aby uruchomic browser, login i follow, wpisz dokladnie YES: ",
  ].join("\n");
}
