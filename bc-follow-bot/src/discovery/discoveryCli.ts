import path from "node:path";
import { loadAppInputs } from "../input/loadAppInputs";
import { loadAppSettings } from "../shared/config";
import { runDiscovery } from "./discoveryRunner";

function resolveFromCwd(value: string | undefined, fallback: string): string {
  const selected = value && value.trim().length > 0 ? value.trim() : fallback;
  return path.isAbsolute(selected) ? selected : path.resolve(process.cwd(), selected);
}

async function main(): Promise<void> {
  const config = loadAppSettings();
  const inputs = loadAppInputs();
  const account = inputs.accountsValid[0];
  const result = await runDiscovery({
    inputPath: resolveFromCwd(config.discoveryInputPath, "data/discovery-input.csv"),
    outputDir: resolveFromCwd(config.discoveryOutputDir, "logs/discovery-results"),
    config,
    account
  });

  for (const error of result.fileErrors) {
    console.error(`Discovery file error: ${error.file}: ${error.message}`);
  }

  console.log(`Discovery input: ${result.inputPath}`);
  console.log(`Discovery output: ${result.outputFilePath}`);
  console.log(`Discovery targets output: ${result.targetsOutputFilePath}`);
  console.log(
    `Discovery rows: valid=${result.validCount}, skipped_disabled=${result.skippedDisabledCount}, rejected=${result.rejectedCount}, written=${result.writtenCount}, targets_written=${result.targetsWrittenCount}`
  );

  if (result.fileErrors.length > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
