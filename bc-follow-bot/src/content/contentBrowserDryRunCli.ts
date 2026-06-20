import path from "node:path";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { loadAppInputs } from "../input/loadAppInputs";
import { loadAppSettings } from "../shared/config";
import {
  exportContentBrowserDryRun,
  findLatestContentPublishPlanFile,
  readContentPublishPlanFile,
  runContentBrowserDryRun
} from "./contentBrowserDryRun";

function resolveFromCwd(filePath: string): string {
  return path.isAbsolute(filePath) ? filePath : path.resolve(process.cwd(), filePath);
}

async function askForHardSafetyConfirmation(): Promise<string> {
  const rl = readline.createInterface({ input, output });
  try {
    console.log("Content browser dry-run uruchamia browser i logowanie, ale nie wpisuje ani nie publikuje tresci.");
    console.log("Wpisz dokladnie YES, aby uruchomic browser dry-run.");
    return await rl.question("Confirmation: ");
  } finally {
    rl.close();
  }
}

async function main(): Promise<void> {
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

  const inputPath = process.argv[2]
    ? resolveFromCwd(process.argv[2])
    : findLatestContentPublishPlanFile();
  const planRows = readContentPublishPlanFile(inputPath);
  const answer = await askForHardSafetyConfirmation();

  const dryRun = await runContentBrowserDryRun({
    planRows,
    accounts: inputs.accountsValid,
    config,
    userConfirmation: answer.trim()
  });
  const outputPath = exportContentBrowserDryRun(dryRun.rows);

  console.log(`Content publish plan CSV read: ${inputPath}`);
  console.log(`Plan records read: ${dryRun.summary.readCount}`);
  console.log(`Browser started: ${dryRun.summary.browserStarted}`);
  console.log(`Dry-run only: ${dryRun.summary.dryRunOnly}`);
  console.log(`Planned records considered: ${dryRun.summary.plannedCount}`);
  console.log(`Skipped not planned: ${dryRun.summary.skippedNotPlannedCount}`);
  console.log(`Skipped by limit: ${dryRun.summary.skippedLimitReachedCount}`);
  console.log(`Invalid: ${dryRun.summary.invalidCount}`);
  console.log(`Blocked by confirmation: ${dryRun.summary.blockedByConfirmationCount}`);
  console.log(`Login failed: ${dryRun.summary.loginFailedCount}`);
  console.log(`Login recovered by page state check: ${dryRun.summary.loginRecoveredAfterStateCheckCount}`);
  console.log(`Target failed: ${dryRun.summary.targetFailedCount}`);
  console.log(`Editor found: ${dryRun.summary.editorFoundCount}`);
  console.log(`Editor not found: ${dryRun.summary.editorNotFoundCount}`);
  console.log(`Content browser dry-run file: ${outputPath}`);
}

main().catch((error) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
