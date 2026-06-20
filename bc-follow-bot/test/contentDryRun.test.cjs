const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { loadContentActions } = require("../dist/content/contentActionsLoader.js");
const { runContentDryRun } = require("../dist/content/contentDryRun.js");
const { exportContentDryRunFiles } = require("../dist/content/contentDryRunExport.js");

function tempWorkspace() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "bc-follow-bot-content-dry-run-"));
}

function cleanup(baseDir) {
  fs.rmSync(baseDir, { recursive: true, force: true });
}

function writeFile(baseDir, relativePath, content) {
  const fullPath = path.join(baseDir, relativePath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, content, "utf8");
  return fullPath;
}

function contentCsv(rows) {
  return [
    "content_action_id,account_id,target_type,target_value,content_type,language,enabled,note",
    ...rows
  ].join("\n");
}

function defaultConfig(extra = {}) {
  return {
    maxContentActionsPerRun: 5,
    maxContentActionsPerAccount: 2,
    requireManualApprovalForContent: true,
    contentDryRunDefault: true,
    ...extra
  };
}

function account(account_id, language) {
  return {
    account_id,
    email: `${account_id}@example.com`,
    password: "secret",
    enabled: true,
    language,
    note: ""
  };
}

function loadAndRun(rows, accounts, config = defaultConfig()) {
  const dir = tempWorkspace();
  try {
    const filePath = writeFile(dir, "content-actions.csv", contentCsv(rows));
    const loadedActions = loadContentActions(filePath);
    return runContentDryRun({ loadedActions, accounts, config });
  } finally {
    cleanup(dir);
  }
}

function runCase(name, fn) {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`fail - ${name}`);
    throw error;
  }
}

runCase("dry-run does not publish and does not use browser automation", () => {
  const result = loadAndRun(
    [
      "content-001,acc-001,profile_url,https://example.internal.portal/profile/123,comment,pl,true,ok"
    ],
    [account("acc-001", "pl")]
  );

  const source = fs.readFileSync(
    path.join(__dirname, "..", "src", "content", "contentDryRun.ts"),
    "utf8"
  );

  assert.equal(result.summary.executedActionsCount, 0);
  assert.doesNotMatch(source, /playwright|browser|page\./i);
});

runCase("enabled=false is skipped", () => {
  const result = loadAndRun(
    [
      "content-001,acc-001,profile_url,https://example.internal.portal/profile/123,comment,pl,false,disabled"
    ],
    [account("acc-001", "pl")]
  );

  assert.equal(result.rows.length, 1);
  assert.equal(result.rows[0].status, "content_skipped_disabled");
});

runCase("unknown account language returns safe status", () => {
  const result = loadAndRun(
    [
      "content-001,acc-001,profile_url,https://example.internal.portal/profile/123,comment,pl,true,ok"
    ],
    [account("acc-001", "unknown")]
  );

  assert.equal(result.rows[0].status, "content_skipped_language_unknown");
  assert.equal(result.approvalRows.length, 0);
});

runCase("language mismatch returns safe status", () => {
  const result = loadAndRun(
    [
      "content-001,acc-001,profile_url,https://example.internal.portal/profile/123,comment,en,true,ok"
    ],
    [account("acc-001", "pl")]
  );

  assert.equal(result.rows[0].status, "content_skipped_language_mismatch");
  assert.equal(result.approvalRows.length, 0);
});

runCase("per-run limit works", () => {
  const result = loadAndRun(
    [
      "content-001,acc-001,profile_url,https://example.internal.portal/profile/1,comment,pl,true,ok",
      "content-002,acc-002,profile_url,https://example.internal.portal/profile/2,comment,pl,true,ok"
    ],
    [account("acc-001", "pl"), account("acc-002", "pl")],
    defaultConfig({ maxContentActionsPerRun: 1, maxContentActionsPerAccount: 5 })
  );

  assert.equal(result.rows[0].status, "content_waiting_for_approval");
  assert.equal(result.rows[1].status, "content_skipped_limit_reached");
});

runCase("per-account limit works", () => {
  const result = loadAndRun(
    [
      "content-001,acc-001,profile_url,https://example.internal.portal/profile/1,comment,pl,true,ok",
      "content-002,acc-001,profile_url,https://example.internal.portal/profile/2,comment,pl,true,ok"
    ],
    [account("acc-001", "pl")],
    defaultConfig({ maxContentActionsPerRun: 5, maxContentActionsPerAccount: 1 })
  );

  assert.equal(result.rows[0].status, "content_waiting_for_approval");
  assert.equal(result.rows[1].status, "content_skipped_limit_reached");
});

runCase("dry-run export file is generated", () => {
  const dir = tempWorkspace();
  try {
    const result = loadAndRun(
      [
        "content-001,acc-001,profile_url,https://example.internal.portal/profile/123,comment,pl,true,ok"
      ],
      [account("acc-001", "pl")]
    );
    const exported = exportContentDryRunFiles(
      result.rows,
      result.approvalRows,
      new Date("2026-05-27T12:13:14"),
      path.join(dir, "dry-run"),
      path.join(dir, "approval")
    );

    assert.equal(path.basename(exported.dryRunFilePath), "content-dry-run-20260527-121314.csv");
    assert.equal(fs.existsSync(exported.dryRunFilePath), true);
    assert.match(fs.readFileSync(exported.dryRunFilePath, "utf8"), /"status"/);
  } finally {
    cleanup(dir);
  }
});

runCase("approval export file is generated", () => {
  const dir = tempWorkspace();
  try {
    const result = loadAndRun(
      [
        "content-001,acc-001,profile_url,https://example.internal.portal/profile/123,comment,pl,true,ok"
      ],
      [account("acc-001", "pl")]
    );
    const exported = exportContentDryRunFiles(
      result.rows,
      result.approvalRows,
      new Date("2026-05-27T12:13:14"),
      path.join(dir, "dry-run"),
      path.join(dir, "approval")
    );
    const approvalText = fs.readFileSync(exported.approvalFilePath, "utf8");

    assert.equal(path.basename(exported.approvalFilePath), "content-approval-20260527-121314.csv");
    assert.match(approvalText, /"approved_text","approved_title","reviewer_note"/);
    assert.match(approvalText, /"pending","","",""/);
  } finally {
    cleanup(dir);
  }
});

runCase("approval rows include empty approved_title by default", () => {
  const result = loadAndRun(
    [
      "content-001,acc-001,profile_url,https://example.internal.portal/profile/123,post,pl,true,ok"
    ],
    [account("acc-001", "pl")]
  );

  assert.equal(result.approvalRows.length, 1);
  assert.equal(result.approvalRows[0].approved_title, "");
});

runCase("requireManualApprovalForContent=true gives waiting_for_approval", () => {
  const result = loadAndRun(
    [
      "content-001,acc-001,profile_url,https://example.internal.portal/profile/123,comment,pl,true,ok"
    ],
    [account("acc-001", "pl")],
    defaultConfig({ requireManualApprovalForContent: true })
  );

  assert.equal(result.rows[0].status, "content_waiting_for_approval");
  assert.equal(result.summary.waitingForApprovalCount, 1);
});

runCase("contentDryRunDefault=true does not execute actions", () => {
  const result = loadAndRun(
    [
      "content-001,acc-001,profile_url,https://example.internal.portal/profile/123,comment,pl,true,ok"
    ],
    [account("acc-001", "pl")],
    defaultConfig({ contentDryRunDefault: true, requireManualApprovalForContent: false })
  );

  assert.equal(result.rows[0].status, "content_dry_run_ready");
  assert.equal(result.summary.executedActionsCount, 0);
});

runCase("missing account returns invalid account status", () => {
  const result = loadAndRun(
    [
      "content-001,missing,profile_url,https://example.internal.portal/profile/123,comment,pl,true,ok"
    ],
    [account("acc-001", "pl")]
  );

  assert.equal(result.rows[0].status, "content_invalid_account");
});

console.log("content dry-run tests passed");
