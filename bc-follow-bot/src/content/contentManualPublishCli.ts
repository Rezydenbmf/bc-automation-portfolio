import path from "node:path";
import { stdin as input, stdout as output } from "node:process";
import { loadAppInputs } from "../input/loadAppInputs";
import { loadAppSettings } from "../shared/config";
import { createPromptSession, type PromptQuestion } from "./contentManualPublishPrompt";
import {
  buildContentManualPublishPreview,
  exportContentManualPublishResults,
  findLatestContentPublishPlanFile,
  readContentPublishPlanFile,
  runContentManualPublish,
  type ContentPublishPreparation,
  type PublishPlanCsvRow
} from "./contentManualPublish";

function resolveFromCwd(filePath: string): string {
  return path.isAbsolute(filePath) ? filePath : path.resolve(process.cwd(), filePath);
}

function printPublishPreview(
  inputPath: string,
  preview: ReturnType<typeof buildContentManualPublishPreview>
): void {
  console.log("Content manual publish - PODSUMOWANIE BEZPIECZENSTWA");
  console.log(`Plan CSV: ${inputPath}`);
  console.log(`Liczba publikacji po filtrach i limitach: ${preview.publishCount}`);
  console.log(`Konta: ${preview.accounts.length > 0 ? preview.accounts.join(", ") : "(brak)"}`);
  console.log("Pelny approved_text nie jest pokazywany w konsoli.");
  console.log("Pelny approved_title nie jest pokazywany w konsoli.");

  for (const item of preview.items) {
    console.log([
      `- content_action_id=${item.content_action_id}`,
      `account=${item.account_id}`,
      `target_type=${item.target_type}`,
      `target=${item.target_value}`,
      `content_type=${item.content_type}`,
      `approved_text_length=${item.approved_text_length}`,
      `title_present=${item.title_present}`,
      `title_length=${item.title_length}`
    ].join(" | "));
  }
}

async function askForInitialConfirmation(prompt: PromptQuestion): Promise<string> {
  console.log("Ta komenda moze wpisac approved_text i pozniej kliknac publish/send/post/comment submit.");
  console.log("Browser ruszy tylko po wpisaniu dokladnie: PUBLISH_CONTENT_YES");
  return await prompt("Initial confirmation: ");
}

async function askForFinalConfirmation(
  prompt: PromptQuestion,
  record: PublishPlanCsvRow,
  _preparation: ContentPublishPreparation
): Promise<string> {
  console.log("approved_text zostal wpisany do edytora.");
  console.log("Przed kliknieciem publish/send/post/comment submit wymagane jest drugie potwierdzenie.");
  const approvedTitle = record.approved_title?.trim() ?? "";
  console.log([
    `content_action_id=${record.content_action_id?.trim() ?? ""}`,
    `account=${record.account_id?.trim() ?? ""}`,
    `target=${record.target_value?.trim() ?? ""}`,
    `content_type=${record.content_type?.trim() ?? ""}`,
    `approved_text_length=${record.approved_text?.trim().length ?? 0}`,
    `title_present=${approvedTitle.length > 0}`,
    `title_length=${approvedTitle.length}`
  ].join(" | "));
  console.log("Klikniecie submit nastapi tylko po wpisaniu dokladnie: FINAL_PUBLISH_YES");
  return await prompt("Final confirmation: ");
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
  const preview = buildContentManualPublishPreview(planRows, inputs.accountsValid, config);

  printPublishPreview(inputPath, preview);
  const promptSession = await createPromptSession(input, output);

  try {
    const initialAnswer = await askForInitialConfirmation(promptSession.question);

    const result = await runContentManualPublish({
      planRows,
      accounts: inputs.accountsValid,
      config,
      initialConfirmation: initialAnswer.trim(),
      finalConfirmation: (record, preparation) =>
        askForFinalConfirmation(promptSession.question, record, preparation)
    });
    const outputPath = exportContentManualPublishResults(result.rows);

    console.log(`Content publish plan CSV read: ${inputPath}`);
    console.log(`Plan records read: ${result.summary.readCount}`);
    console.log(`Browser started: ${result.summary.browserStarted}`);
    console.log(`Planned records considered: ${result.summary.plannedCount}`);
    console.log(`Skipped not planned: ${result.summary.skippedNotPlannedCount}`);
    console.log(`Skipped by limit: ${result.summary.skippedLimitReachedCount}`);
    console.log(`Invalid: ${result.summary.invalidCount}`);
    console.log(`Blocked by initial confirmation: ${result.summary.blockedByInitialConfirmationCount}`);
    console.log(`Blocked by final confirmation: ${result.summary.blockedByFinalConfirmationCount}`);
    console.log(`Login failed: ${result.summary.loginFailedCount}`);
    console.log(`Target failed: ${result.summary.targetFailedCount}`);
    console.log(`Editor not found: ${result.summary.editorNotFoundCount}`);
    console.log(`Publish failed: ${result.summary.publishFailedCount}`);
    console.log(`Publish success: ${result.summary.publishSuccessCount}`);
    console.log(`Unknown result: ${result.summary.unknownResultCount}`);
    console.log(`Content publish results file: ${outputPath}`);
  } finally {
    promptSession.close();
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
