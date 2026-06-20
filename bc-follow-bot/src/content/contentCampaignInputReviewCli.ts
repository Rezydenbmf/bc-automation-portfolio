import path from "node:path";
import { reviewContentCampaignInput } from "./contentCampaignInputReview";

function resolveFromCwd(filePath: string): string {
  return path.isAbsolute(filePath) ? filePath : path.resolve(process.cwd(), filePath);
}

function printList(label: string, values: string[]): void {
  if (values.length === 0) {
    return;
  }

  console.log(`${label}: ${values.join(", ")}`);
}

function main(): void {
  const inputPath = process.argv[2]
    ? resolveFromCwd(process.argv[2])
    : resolveFromCwd("data/content-draft-sources.csv");
  const review = reviewContentCampaignInput(inputPath);
  const { summary } = review;

  console.log(`Content campaign input file: ${inputPath}`);
  console.log(`Rows read: ${summary.totalRows}`);
  console.log(`Enabled valid rows: ${summary.validEnabledCount}`);
  console.log(`Disabled rows: ${summary.disabledCount}`);
  console.log(`Rejected rows: ${summary.rejectedCount}`);
  console.log(`Publish-flow candidates: ${summary.publishFlowCandidateCount}`);
  console.log(`Draft-only manual rows: ${summary.draftOnlyManualCount}`);
  console.log(`Draft possible but not publish-ready rows: ${summary.draftPossibleNotPublishReadyCount}`);
  console.log(`Unknown-language rows: ${summary.unknownLanguageCount}`);
  console.log(`Unsupported content_type rows: ${summary.unsupportedContentTypeCount}`);
  console.log("API calls executed: no");
  console.log("Browser started: no");
  console.log("Publishing executed: no");
  console.log("Human approval still required: yes");
  console.log("Manual publish limit changed: no");

  printList(
    "Publish-flow candidate IDs",
    review.items
      .filter((item) => item.classification === "publish_flow_candidate")
      .map((item) => item.content_action_id)
  );
  printList(
    "Draft-only manual IDs",
    review.items
      .filter((item) => item.classification === "draft_only_manual")
      .map((item) => item.content_action_id)
  );

  if (summary.publishFlowCandidateCount < summary.suggestedCampaignSizeMinimum) {
    console.log(
      `Campaign size note: fewer than ${summary.suggestedCampaignSizeMinimum} publish-flow candidates.`
    );
  } else if (summary.publishFlowCandidateCount > summary.suggestedCampaignSizeMaximum) {
    console.log(
      `Campaign size warning: more than ${summary.suggestedCampaignSizeMaximum} publish-flow candidates. Keep this MVP to 5-10 records.`
    );
  } else {
    console.log("Campaign size: within supervised 5-10 record MVP range.");
  }

  if (summary.draftOnlyManualCount > 0) {
    console.log("Reminder: target_type=manual is draft-only. Use target_type=profile_url for the full publish flow.");
  }

  if (summary.rejectedCount > 0) {
    for (const rejected of review.rejected) {
      console.log(
        `Rejected row ${rejected.rowNumber}: ${rejected.issues
          .map((issue) => `${issue.field}:${issue.code}`)
          .join("; ")}`
      );
    }

    process.exitCode = 1;
  }
}

try {
  main();
} catch (error) {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
}
