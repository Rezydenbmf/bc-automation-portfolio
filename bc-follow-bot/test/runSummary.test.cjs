const assert = require("node:assert/strict");

const {
  createRunSummary,
  formatRunSummary,
  recordAccountProcessed,
  recordCleanupIssue,
  recordTargetOutcome
} = require("../dist/runner/runSummary.js");

function runCase(name, fn) {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`fail - ${name}`);
    throw error;
  }
}

runCase("run summary records mixed target outcomes", () => {
  const summary = createRunSummary(2, 4);

  recordAccountProcessed(summary);
  recordAccountProcessed(summary);
  recordTargetOutcome(summary, "followed");
  recordTargetOutcome(summary, "already_following");
  recordTargetOutcome(summary, "not_found");
  recordTargetOutcome(summary, "login_failed");
  recordTargetOutcome(summary, "follow_failed");
  recordTargetOutcome(summary, "already_processed");
  recordTargetOutcome(summary, "follow_limit_reached");
  recordTargetOutcome(summary, "invalid_target");
  recordTargetOutcome(summary, "portal_unavailable");
  recordCleanupIssue(summary);

  assert.deepEqual(summary, {
    accounts_total: 2,
    accounts_processed: 2,
    targets_total_enabled: 4,
    targets_processed: 9,
    followed: 1,
    already_following: 1,
    not_found: 1,
    login_failed: 1,
    follow_failed: 1,
    already_processed: 1,
    followLimitReached: 1,
    invalid_target: 1,
    portal_unavailable: 1,
    cleanup_issues: 1
  });
});

runCase("run summary formatting is stable", () => {
  const summary = createRunSummary(1, 2);
  recordAccountProcessed(summary);
  recordTargetOutcome(summary, "followed");
  recordTargetOutcome(summary, "login_failed");

  assert.equal(
    formatRunSummary(summary),
    "accounts_total=1;accounts_processed=1;targets_total_enabled=2;targets_processed=2;followed=1;already_following=0;not_found=0;login_failed=1;follow_failed=0;already_processed=0;followLimitReached=0;invalid_target=0;portal_unavailable=0;cleanup_issues=0"
  );
});

console.log("run summary tests passed");
