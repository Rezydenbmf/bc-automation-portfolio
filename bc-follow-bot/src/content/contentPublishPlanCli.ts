import path from "node:path";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import {
  countApprovedReadyReviewRows,
  exportContentPublishPlan,
  findLatestContentApprovalReviewFile,
  readContentApprovalReviewFile,
  runContentPublishPlan
} from "./contentPublishPlan";
import { loadAppSettings } from "../shared/config";

function resolveFromCwd(filePath: string): string {
  return path.isAbsolute(filePath) ? filePath : path.resolve(process.cwd(), filePath);
}

async function requireManualYesIfNeeded(approvedReadyCount: number, maxPublishesPerRun: number): Promise<void> {
  if (approvedReadyCount <= maxPublishesPerRun) {
    return;
  }

  const rl = readline.createInterface({ input, output });
  try {
    console.log(`Approved records ready for planning: ${approvedReadyCount}`);
    console.log(`Safe per-run publish planning limit: ${maxPublishesPerRun}`);
    const answer = await rl.question("Type YES to generate the publish plan CSV: ");
    if (answer.trim() !== "YES") {
      throw new Error("manual YES confirmation was not provided; publish plan was not generated.");
    }
  } finally {
    rl.close();
  }
}

async function main(): Promise<void> {
  const config = loadAppSettings();
  const inputPath = process.argv[2]
    ? resolveFromCwd(process.argv[2])
    : findLatestContentApprovalReviewFile();
  const reviewRows = readContentApprovalReviewFile(inputPath);
  const approvedReadyCount = countApprovedReadyReviewRows(reviewRows);

  await requireManualYesIfNeeded(approvedReadyCount, config.maxContentPublishesPerRun);

  const plan = runContentPublishPlan({
    reviewRows,
    config: {
      maxContentPublishesPerRun: config.maxContentPublishesPerRun,
      maxContentPublishesPerAccount: config.maxContentPublishesPerAccount,
      maxContentTitleLength: config.maxContentTitleLength
    }
  });
  const outputPath = exportContentPublishPlan(plan.rows);

  console.log(`Approval review CSV read: ${inputPath}`);
  console.log(`Review records read: ${plan.summary.readCount}`);
  console.log(`Approved ready records: ${plan.summary.approvedReadyCount}`);
  console.log(`Planned: ${plan.summary.plannedCount}`);
  console.log(`Skipped not approved: ${plan.summary.skippedNotApprovedCount}`);
  console.log(`Skipped by limit: ${plan.summary.skippedLimitReachedCount}`);
  console.log(`Invalid: ${plan.summary.invalidCount}`);
  console.log(`Content publish plan file: ${outputPath}`);
}

main().catch((error) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
