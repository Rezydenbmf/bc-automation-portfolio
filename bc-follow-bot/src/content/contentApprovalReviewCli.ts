import path from "node:path";
import {
  exportContentApprovalReview,
  findLatestContentApprovalFile,
  reviewContentApprovalFile
} from "./contentApprovalReview";
import { loadAppSettings } from "../shared/config";

function resolveFromCwd(filePath: string): string {
  return path.isAbsolute(filePath) ? filePath : path.resolve(process.cwd(), filePath);
}

function main(): void {
  const config = loadAppSettings();
  const inputPath = process.argv[2]
    ? resolveFromCwd(process.argv[2])
    : findLatestContentApprovalFile();
  const review = reviewContentApprovalFile(inputPath, {
    maxContentTitleLength: config.maxContentTitleLength
  });
  const outputPath = exportContentApprovalReview(review.rows);

  console.log(`Approval CSV read: ${inputPath}`);
  console.log(`Approval records read: ${review.summary.readCount}`);
  console.log(`Approved and valid: ${review.summary.approvedReadyCount}`);
  console.log(`Rejected: ${review.summary.rejectedCount}`);
  console.log(`Needs changes: ${review.summary.needsChangesCount}`);
  console.log(`Pending: ${review.summary.pendingCount}`);
  console.log(`Invalid: ${review.summary.invalidCount}`);
  console.log(`Approval review file: ${outputPath}`);
}

try {
  main();
} catch (error) {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
}
