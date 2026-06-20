import path from "node:path";
import { loadAppInputs } from "../input/loadAppInputs";
import { loadAppSettings } from "../shared/config";
import { loadContentActions } from "./contentActionsLoader";
import { runContentDryRun } from "./contentDryRun";
import { exportContentDryRunFiles } from "./contentDryRunExport";

function countSkipped(summary: Record<string, number>): number {
  return Object.values(summary).reduce((total, value) => total + value, 0);
}

function formatSkipped(summary: Record<string, number>): string {
  const entries = Object.entries(summary);
  if (entries.length === 0) {
    return "none";
  }

  return entries.map(([status, count]) => `${status}=${count}`).join(", ");
}

function resolveFromCwd(filePath: string): string {
  return path.isAbsolute(filePath) ? filePath : path.resolve(process.cwd(), filePath);
}

function main(): void {
  const config = loadAppSettings();
  const inputs = loadAppInputs();

  if (inputs.fileErrors.length > 0) {
    for (const error of inputs.fileErrors) {
      console.error(`Input file error: ${error.file}: ${error.message}`);
    }
    process.exitCode = 1;
    return;
  }

  if (!inputs.config) {
    console.error("Input file error: config could not be loaded.");
    process.exitCode = 1;
    return;
  }

  const loadedActions = loadContentActions(resolveFromCwd("data/content-actions.csv"));
  const dryRun = runContentDryRun({
    loadedActions,
    accounts: inputs.accountsValid,
    config
  });
  const exported = exportContentDryRunFiles(dryRun.rows, dryRun.approvalRows);

  console.log(`Content actions loaded: ${dryRun.summary.loadedCount}`);
  console.log(`Content dry-run ready: ${dryRun.summary.dryRunReadyCount}`);
  console.log(`Content waiting for approval: ${dryRun.summary.waitingForApprovalCount}`);
  console.log(`Content skipped: ${countSkipped(dryRun.summary.skippedByStatus)}`);
  console.log(`Content skipped details: ${formatSkipped(dryRun.summary.skippedByStatus)}`);
  console.log(`Content executed actions: ${dryRun.summary.executedActionsCount}`);
  console.log(`Content dry-run file: ${exported.dryRunFilePath}`);
  console.log(`Content approval file: ${exported.approvalFilePath}`);
}

try {
  main();
} catch (error) {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
}
