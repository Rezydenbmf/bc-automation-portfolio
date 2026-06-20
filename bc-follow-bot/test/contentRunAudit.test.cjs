const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
  exportContentRunAuditReview,
  resolveContentRunAuditInputPath,
  reviewContentRunAuditFile,
  reviewContentRunAuditRows
} = require("../dist/content/contentRunAuditReview.js");

function tempWorkspace() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "bc-follow-bot-content-run-audit-"));
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

function auditRow(overrides = {}) {
  return {
    run_id: "audit-001",
    run_date: "2026-06-01",
    command: "npm run content:publish:manual-confirm -- logs/content-publish-plan/sample-plan.csv",
    operator_note: "synthetic audit row",
    source_publish_plan_file: "logs/content-publish-plan/sample-plan.csv",
    records_planned: "1",
    records_attempted: "1",
    publish_success: "1",
    publish_failed: "0",
    publish_unknown_result: "0",
    account_id: "sample-account-pl",
    account_language: "pl",
    target_country: "Poland",
    expected_language: "pl",
    language_checked: "true",
    language_match: "true",
    title_checked: "true",
    title_present: "false",
    portal_verified_manually: "true",
    post_visible_after_publish: "true",
    post_removed_after_test: "false",
    stop_condition_hit: "false",
    stop_condition_reason: "",
    result_file: "logs/content-publish-results/sample-results.csv",
    safe_to_consider_scale: "false",
    reviewer_note: "synthetic only",
    ...overrides
  };
}

function quoted(value) {
  return `"${String(value).replace(/"/g, '""')}"`;
}

function auditCsv(rows, extraHeaders = []) {
  const headers = [
    "run_id",
    "run_date",
    "command",
    "operator_note",
    "source_publish_plan_file",
    "records_planned",
    "records_attempted",
    "publish_success",
    "publish_failed",
    "publish_unknown_result",
    "account_id",
    "account_language",
    "target_country",
    "expected_language",
    "language_checked",
    "language_match",
    "title_checked",
    "title_present",
    "portal_verified_manually",
    "post_visible_after_publish",
    "post_removed_after_test",
    "stop_condition_hit",
    "stop_condition_reason",
    "result_file",
    "safe_to_consider_scale",
    "reviewer_note",
    ...extraHeaders
  ];

  return [
    headers.map(quoted).join(","),
    ...rows.map((row) => headers.map((header) => quoted(row[header] ?? "")).join(","))
  ].join("\n");
}

function reviewSingle(overrides = {}) {
  return reviewContentRunAuditRows([auditRow(overrides)]);
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

runCase("missing default audit CSV gives a clear message", () => {
  const dir = tempWorkspace();
  try {
    const defaultPath = path.join(dir, "data", "content-run-audit.csv");
    const resolution = resolveContentRunAuditInputPath(undefined, defaultPath);

    assert.equal(resolution.status, "missing_default");
    assert.match(resolution.message, /Local content run audit file not found/);
    assert.match(resolution.message, /Create it from data\/content-run-audit\.example\.csv/);
  } finally {
    cleanup(dir);
  }
});

runCase("valid audit CSV passes review", () => {
  const dir = tempWorkspace();
  try {
    const inputPath = writeFile(dir, "content-run-audit.csv", auditCsv([auditRow()]));
    const result = reviewContentRunAuditFile(inputPath);

    assert.equal(result.rows[0].audit_status, "content_audit_valid");
    assert.equal(result.summary.runCount, 1);
    assert.equal(result.summary.sampleRowsDetected, 0);
    assert.equal(result.summary.totalSuccesses, 1);
    assert.equal(result.summary.totalFailures, 0);
    assert.equal(result.summary.runsWithProblems, 0);
    assert.equal(result.summary.recommendation, "keep_manual_limit_1");
  } finally {
    cleanup(dir);
  }
});

runCase("sample row is detected by run_id", () => {
  const result = reviewSingle({
    run_id: "sample-001",
    operator_note: "real note"
  });

  assert.equal(result.rows[0].audit_status, "content_audit_sample_row_detected");
  assert.equal(result.rows[0].risk_level, "high");
  assert.equal(result.rows[0].recommendation, "investigate_before_scaling");
  assert.match(result.rows[0].reason, /sample_or_demo_row_must_be_removed/);
});

runCase("audit-sample row is detected by run_id", () => {
  const result = reviewSingle({
    run_id: "audit-sample-001",
    operator_note: "real note"
  });

  assert.equal(result.rows[0].audit_status, "content_audit_sample_row_detected");
  assert.match(result.rows[0].reason, /run_id starts with audit-sample/);
});

runCase("demo row is detected by run_id", () => {
  const result = reviewSingle({
    run_id: "demo-001",
    operator_note: "real note"
  });

  assert.equal(result.rows[0].audit_status, "content_audit_sample_row_detected");
  assert.match(result.rows[0].reason, /run_id starts with demo/);
});

runCase("example row is detected by run_id", () => {
  const result = reviewSingle({
    run_id: "example-001",
    operator_note: "real note"
  });

  assert.equal(result.rows[0].audit_status, "content_audit_sample_row_detected");
  assert.match(result.rows[0].reason, /run_id starts with example/);
});

runCase("sample demo and example markers are detected in notes", () => {
  const result = reviewContentRunAuditRows([
    auditRow({
      run_id: "audit-operator-sample",
      operator_note: "SAMPLE row copied by mistake",
      reviewer_note: "real note"
    }),
    auditRow({
      run_id: "audit-reviewer-demo",
      operator_note: "real note",
      reviewer_note: "demo marker"
    }),
    auditRow({
      run_id: "audit-operator-example",
      operator_note: "example marker",
      reviewer_note: "real note"
    })
  ]);

  assert.equal(result.summary.runCount, 0);
  assert.equal(result.summary.sampleRowsDetected, 3);
  assert.equal(result.summary.runsWithProblems, 3);
  assert.equal(result.summary.recommendation, "investigate_before_scaling");
  assert.equal(result.rows[0].audit_status, "content_audit_sample_row_detected");
  assert.equal(result.rows[1].audit_status, "content_audit_sample_row_detected");
  assert.equal(result.rows[2].audit_status, "content_audit_sample_row_detected");
});

runCase("sample row does not count as a real success failure or unknown result", () => {
  const result = reviewSingle({
    run_id: "sample-001",
    operator_note: "real note",
    publish_success: "5",
    publish_failed: "4",
    publish_unknown_result: "3"
  });

  assert.equal(result.summary.runCount, 0);
  assert.equal(result.summary.sampleRowsDetected, 1);
  assert.equal(result.summary.totalSuccesses, 0);
  assert.equal(result.summary.totalFailures, 0);
  assert.equal(result.summary.totalUnknownResults, 0);
  assert.equal(result.summary.runsWithManualPortalVerification, 0);
  assert.equal(result.summary.runsWithCorrectLanguage, 0);
});

runCase("sample row blocks scale review candidate", () => {
  const result = reviewContentRunAuditRows([
    auditRow({
      run_id: "audit-001",
      safe_to_consider_scale: "true"
    }),
    auditRow({
      run_id: "sample-001",
      operator_note: "real note",
      safe_to_consider_scale: "true"
    })
  ]);

  assert.equal(result.rows[0].audit_status, "content_audit_scale_review_candidate");
  assert.equal(result.rows[1].audit_status, "content_audit_sample_row_detected");
  assert.equal(result.summary.runCount, 1);
  assert.equal(result.summary.sampleRowsDetected, 1);
  assert.equal(result.summary.recommendation, "investigate_before_scaling");
});

runCase("sample row produces clear removal reason", () => {
  const result = reviewSingle({
    run_id: "sample-001",
    operator_note: "real note"
  });

  assert.match(result.rows[0].reason, /real_audit_log_must_contain_only_real_runs/);
  assert.match(result.rows[0].reason, /remove_sample_rows_from_real_audit_log/);
});

runCase("clean audit with two real successful runs keeps manual limit one", () => {
  const result = reviewContentRunAuditRows([
    auditRow({ run_id: "audit-001" }),
    auditRow({ run_id: "audit-002" })
  ]);

  assert.equal(result.summary.runCount, 2);
  assert.equal(result.summary.sampleRowsDetected, 0);
  assert.equal(result.summary.totalSuccesses, 2);
  assert.equal(result.summary.totalFailures, 0);
  assert.equal(result.summary.totalUnknownResults, 0);
  assert.equal(result.summary.runsWithProblems, 0);
  assert.equal(result.summary.recommendation, "keep_manual_limit_1");
});

runCase("scale review candidate does not increase scale automatically", () => {
  const result = reviewSingle({ safe_to_consider_scale: "true" });

  assert.equal(result.rows[0].audit_status, "content_audit_scale_review_candidate");
  assert.equal(result.rows[0].recommendation, "scale_review_candidate");
  assert.equal(result.summary.recommendation, "scale_review_candidate");
});

runCase("missing portal verification creates risk", () => {
  const result = reviewSingle({ portal_verified_manually: "false" });

  assert.equal(result.rows[0].audit_status, "content_audit_missing_manual_portal_verification");
  assert.equal(result.rows[0].risk_level, "high");
  assert.equal(result.summary.runsWithProblems, 1);
});

runCase("language_checked=false creates risk", () => {
  const result = reviewSingle({ language_checked: "false" });

  assert.equal(result.rows[0].audit_status, "content_audit_language_not_checked");
  assert.equal(result.rows[0].risk_level, "high");
});

runCase("language_match=false creates risk", () => {
  const result = reviewSingle({ language_match: "false" });

  assert.equal(result.rows[0].audit_status, "content_audit_language_mismatch");
  assert.equal(result.rows[0].risk_level, "high");
});

runCase("publish_failed greater than zero creates risk", () => {
  const result = reviewSingle({ publish_success: "0", publish_failed: "1" });

  assert.equal(result.rows[0].audit_status, "content_audit_publish_failed");
  assert.equal(result.summary.totalFailures, 1);
  assert.equal(result.summary.recommendation, "investigate_before_scaling");
});

runCase("publish_unknown_result greater than zero creates risk", () => {
  const result = reviewSingle({ publish_success: "0", publish_unknown_result: "1" });

  assert.equal(result.rows[0].audit_status, "content_audit_unknown_result");
  assert.equal(result.summary.totalUnknownResults, 1);
});

runCase("stop_condition_hit=true without reason is invalid", () => {
  const result = reviewSingle({ stop_condition_hit: "true", stop_condition_reason: "" });

  assert.equal(result.rows[0].audit_status, "content_audit_invalid_record");
  assert.match(result.rows[0].reason, /stop_condition_reason is required/);
});

runCase("records_attempted greater than one creates scale risk at current stage", () => {
  const result = reviewSingle({
    records_planned: "2",
    records_attempted: "2",
    publish_success: "2"
  });

  assert.equal(result.rows[0].audit_status, "content_audit_scale_not_ready");
  assert.equal(result.rows[0].risk_level, "warning");
  assert.match(result.rows[0].reason, /records_attempted is greater than 1/);
});

runCase("safe_to_consider_scale=true despite risk is detected", () => {
  const result = reviewSingle({
    publish_success: "0",
    publish_failed: "1",
    safe_to_consider_scale: "true"
  });

  assert.equal(result.rows[0].audit_status, "content_audit_publish_failed");
  assert.match(result.rows[0].reason, /safe_to_consider_scale is true despite errors or risks/);
});

runCase("invalid numeric and boolean fields are rejected", () => {
  const result = reviewSingle({
    records_attempted: "one",
    portal_verified_manually: "yes"
  });

  assert.equal(result.rows[0].audit_status, "content_audit_invalid_record");
  assert.match(result.rows[0].reason, /records_attempted must be a non-negative integer/);
  assert.match(result.rows[0].reason, /portal_verified_manually must be true or false/);
});

runCase("review result does not contain approved_text or approved_title", () => {
  const dir = tempWorkspace();
  try {
    const inputPath = writeFile(
      dir,
      "content-run-audit.csv",
      auditCsv([
        auditRow({
          approved_text: "SECRET APPROVED TEXT",
          approved_title: "SECRET APPROVED TITLE"
        })
      ], ["approved_text", "approved_title"])
    );
    const result = reviewContentRunAuditFile(inputPath);
    const outputPath = exportContentRunAuditReview(
      result.rows,
      new Date("2026-06-01T12:13:14"),
      path.join(dir, "review")
    );
    const outputText = fs.readFileSync(outputPath, "utf8");

    assert.equal(path.basename(outputPath), "content-run-audit-review-20260601-121314.csv");
    assert.match(outputText, /"audit_status"/);
    assert.doesNotMatch(outputText, /approved_text|approved_title/);
    assert.doesNotMatch(outputText, /SECRET APPROVED TEXT|SECRET APPROVED TITLE/);
  } finally {
    cleanup(dir);
  }
});

runCase("audit review does not publish and does not use browser automation", () => {
  const result = reviewSingle();
  const source = fs.readFileSync(
    path.join(__dirname, "..", "src", "content", "contentRunAuditReview.ts"),
    "utf8"
  );

  assert.equal(result.summary.runCount, 1);
  assert.doesNotMatch(source, /playwright|browser|page\.|click\(|postButton|submit|fetch\(/i);
});

console.log("content run audit tests passed");
