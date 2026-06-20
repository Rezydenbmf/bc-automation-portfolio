import { loadAppInputs } from "../input/loadAppInputs";
import {
  InputFileError,
  LoadedInputData,
  RejectedAccountRecord,
  RejectedTargetRecord
} from "../input/types";
import { logRuntimeEntry } from "../logs/logger";
import { runApp, RunAppInputs } from "../runner/appRunner";
import { TargetRow } from "../shared/types";

function toTimestamp(): string {
  return new Date().toISOString();
}

function toIssueText(issues: Array<{ field: string; message: string }>): string {
  return issues.map((issue) => `${issue.field}: ${issue.message}`).join("; ");
}

function formatAccountRejected(record: RejectedAccountRecord): string {
  const identifier = record.raw.account_id?.trim() || record.raw.email?.trim() || `wiersz ${record.rowNumber}`;
  return `Konto odrzucone (${identifier}, wiersz ${record.rowNumber}): ${toIssueText(record.issues)}`;
}

function formatTargetRejected(record: RejectedTargetRecord): string {
  const identifier = record.raw.target_id?.trim() || record.raw.target_value?.trim() || `wiersz ${record.rowNumber}`;
  return `Cel odrzucony (${identifier}, wiersz ${record.rowNumber}): ${toIssueText(record.issues)}`;
}

function formatFileError(error: InputFileError): string {
  return `Błąd pliku ${error.file}: ${error.message}`;
}

function toRunnerTarget(record: LoadedInputData["targetsValid"][number]): TargetRow {
  return {
    target_id: record.target_id,
    target_type: record.target_type,
    target_value: record.target_value,
    enabled: true,
    note: record.note
  };
}

function toRunInputs(inputs: LoadedInputData): RunAppInputs {
  return {
    config: inputs.config as NonNullable<LoadedInputData["config"]>,
    accounts: inputs.accountsValid,
    targets: inputs.targetsValid.map(toRunnerTarget)
  };
}

function logStartup(step: string, details: string): void {
  const timestamp = toTimestamp();
  console.log(details);
  logRuntimeEntry({
    timestamp,
    step,
    account: "",
    target: "",
    details,
    error_message: ""
  });
}

export function evaluateStartupInputs(inputs: LoadedInputData): {
  canContinue: boolean;
  stopReasons: string[];
} {
  const stopReasons: string[] = [];

  if (!inputs.config) {
    stopReasons.push("Brak poprawnej konfiguracji.");
  }

  if (inputs.fileErrors.length > 0) {
    stopReasons.push("Wystąpiły błędy plików.");
  }

  if (inputs.accountsValid.length === 0) {
    stopReasons.push("Brak poprawnych kont do uruchomienia.");
  }

  return {
    canContinue: stopReasons.length === 0,
    stopReasons
  };
}

export async function startApp(): Promise<void> {
  logStartup("startup_begin", "START: wczytuję dane wejściowe.");

  const inputs = loadAppInputs();

  for (const error of inputs.fileErrors) {
    logStartup("startup_file_error", formatFileError(error));
  }

  for (const record of inputs.accountsRejected) {
    logStartup("startup_account_rejected", formatAccountRejected(record));
  }

  for (const record of inputs.targetsRejected) {
    logStartup("startup_target_rejected", formatTargetRejected(record));
  }

  const decision = evaluateStartupInputs(inputs);
  if (!decision.canContinue) {
    for (const reason of decision.stopReasons) {
      logStartup("startup_stop_reason", `STOP: ${reason}`);
    }

    process.exitCode = 1;
    return;
  }

  logStartup(
    "startup_continue",
    `GO: dane poprawne. Konta: ${inputs.accountsValid.length}, cele: ${inputs.targetsValid.length}.`
  );

  await runApp(toRunInputs(inputs));
}
