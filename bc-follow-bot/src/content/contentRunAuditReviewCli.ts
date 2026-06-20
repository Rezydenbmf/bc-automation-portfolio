import {
  exportContentRunAuditReview,
  resolveContentRunAuditInputPath,
  reviewContentRunAuditFile
} from "./contentRunAuditReview";

function printSummary(inputPath: string, outputPath: string, review: ReturnType<typeof reviewContentRunAuditFile>): void {
  console.log(`Content run audit CSV read: ${inputPath}`);
  console.log(`Audit runs read: ${review.summary.runCount}`);
  console.log(`Sample/demo/example rows detected: ${review.summary.sampleRowsDetected}`);
  console.log(`Total successes: ${review.summary.totalSuccesses}`);
  console.log(`Total failures: ${review.summary.totalFailures}`);
  console.log(`Total unknown results: ${review.summary.totalUnknownResults}`);
  console.log(`Runs with manual portal verification: ${review.summary.runsWithManualPortalVerification}`);
  console.log(`Runs with correct language: ${review.summary.runsWithCorrectLanguage}`);
  console.log(`Runs with problems: ${review.summary.runsWithProblems}`);
  console.log(`Recommendation: ${review.summary.recommendation}`);
  console.log(`Content run audit review file: ${outputPath}`);
}

function main(): void {
  const resolution = resolveContentRunAuditInputPath(process.argv[2]);

  if (resolution.status === "missing_default") {
    console.log(resolution.message);
    return;
  }

  const review = reviewContentRunAuditFile(resolution.filePath);
  const outputPath = exportContentRunAuditReview(review.rows);

  printSummary(resolution.filePath, outputPath, review);
}

try {
  main();
} catch (error) {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
}
