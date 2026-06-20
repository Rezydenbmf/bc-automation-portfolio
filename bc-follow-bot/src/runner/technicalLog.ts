import { logRuntimeEntry } from "../logs/logger";

export type RunnerTechnicalStep =
  | "run_started"
  | "preflight"
  | "preflight_warning"
  | "account_started"
  | "context_created"
  | "page_created"
  | "login_started"
  | "login_finished"
  | "target_started"
  | "search_started"
  | "search_finished"
  | "follow_started"
  | "follow_finished"
  | "target_finished"
  | "account_finished"
  | "run_finished"
  | "error";

export interface RunnerTechnicalLogEntry {
  timestamp: string;
  step: RunnerTechnicalStep;
  account: string;
  target: string;
  details: string;
  error_message: string;
}

export function logRunnerTechnicalEntry(entry: RunnerTechnicalLogEntry): void {
  logRuntimeEntry(entry);
}
