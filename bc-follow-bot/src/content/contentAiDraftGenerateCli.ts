import path from "node:path";
import { loadAppSettings } from "../shared/config";
import { createOpenAiCompatibleDraftProvider } from "./contentAiDraftProvider";
import { exportContentAiDraftFiles } from "./contentAiDraftExport";
import { runContentAiDraftGeneration } from "./contentAiDraftGeneration";
import { loadContentDraftSources } from "./contentDraftSourcesLoader";

function resolveFromCwd(filePath: string): string {
  return path.isAbsolute(filePath) ? filePath : path.resolve(process.cwd(), filePath);
}

async function main(): Promise<void> {
  const config = loadAppSettings();

  if (!config.aiDraftsEnabled) {
    console.error("AI draft generation is disabled. Set aiDraftsEnabled=true in local config/appsettings.json.");
    process.exitCode = 1;
    return;
  }

  const inputPath = process.argv[2]
    ? resolveFromCwd(process.argv[2])
    : resolveFromCwd("data/content-draft-sources.csv");
  const loadedSources = loadContentDraftSources(inputPath);
  const provider = createOpenAiCompatibleDraftProvider(config);
  const result = await runContentAiDraftGeneration({
    loadedSources,
    config,
    provider
  });
  const exported = exportContentAiDraftFiles(result.rows, result.approvalRows);

  console.log(`Content draft source file: ${inputPath}`);
  console.log(`Content draft sources loaded: ${result.summary.loadedCount}`);
  console.log(`AI drafts generated: ${result.summary.generatedCount}`);
  console.log(`AI draft rows skipped: ${result.summary.skippedCount}`);
  console.log(`AI draft rows failed: ${result.summary.failedCount}`);
  console.log(`AI provider calls: ${result.summary.providerCallsCount}`);
  console.log(`Approval rows created: ${result.summary.approvalRowsCount}`);
  console.log(`Publishing executed: no`);
  console.log(`Browser started: no`);
  console.log(`Human approval required: yes`);
  console.log(`AI drafts file: ${exported.draftsFilePath}`);
  console.log(`Approval-compatible AI draft file: ${exported.approvalFilePath}`);
}

main().catch((error) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
