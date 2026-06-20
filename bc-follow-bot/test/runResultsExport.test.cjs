const assert = require("node:assert/strict");
const { existsSync, mkdtempSync, readFileSync } = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const repoRoot = process.cwd();
const tempRoot = mkdtempSync(path.join(os.tmpdir(), "bc-follow-bot-run-results-"));
process.chdir(tempRoot);

const {
  appendRunResult,
  createRunResultsExport
} = require(path.join(repoRoot, "dist", "runner", "runResultsExport.js"));

function runCase(name, fn) {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`fail - ${name}`);
    throw error;
  }
}

runCase("run results export creates file with header and escaped row", () => {
  const exportDate = new Date(2026, 0, 2, 3, 4, 5);
  const expectedPath = path.resolve(
    tempRoot,
    "logs",
    "run-results",
    "run-results-20260102-030405.csv"
  );

  const runExport = createRunResultsExport(exportDate);

  assert.equal(runExport.runId, "20260102-030405");
  assert.equal(runExport.filePath, expectedPath);
  assert.equal(existsSync(expectedPath), true);

  appendRunResult(runExport.filePath, {
    run_id: runExport.runId,
    finished_at: "2026-01-02T02:04:06.000Z",
    account_email: "operator@example.com",
    target_id: "target,001",
    target_type: "profile_url",
    target_value: "https://example.test/profile/\"quoted\"",
    search_result: "person",
    follow_result: "followed",
    final_status: "followed",
    error_message: "comma, quote \" and newline\ninside"
  });

  const content = readFileSync(expectedPath, "utf-8");

  assert.match(
    content,
    /^"run_id","finished_at","account_email","target_id","target_type","target_value","search_result","follow_result","final_status","error_message"\n/
  );
  assert.match(content, /"target,001"/);
  assert.match(content, /"https:\/\/example\.test\/profile\/""quoted"""/);
  assert.match(content, /"comma, quote "" and newline\ninside"/);
});

console.log("run results export tests passed");
