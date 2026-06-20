const assert = require("node:assert/strict");

const {
  createRunPreflightScale,
  formatRunPreflightScale
} = require("../dist/runner/runPreflight.js");

function runCase(name, fn) {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`fail - ${name}`);
    throw error;
  }
}

runCase("run preflight calculates planned operation scale", () => {
  const scale = createRunPreflightScale(3, 4, {
    maxFollowsPerRun: 10,
    preflightOperationWarningThreshold: 20
  });

  assert.deepEqual(scale, {
    activeAccounts: 3,
    activeTargets: 4,
    plannedOperations: 12,
    operationWarningThreshold: 20,
    maxFollowsPerRun: 10,
    warning: false
  });
});

runCase("run preflight uses default warning threshold", () => {
  const scale = createRunPreflightScale(10, 11, {});

  assert.equal(scale.operationWarningThreshold, 100);
  assert.equal(scale.plannedOperations, 110);
  assert.equal(scale.warning, true);
});

runCase("run preflight formatting includes follow limit state", () => {
  const scale = createRunPreflightScale(2, 5, {
    preflightOperationWarningThreshold: 50
  });

  assert.equal(
    formatRunPreflightScale(scale),
    "active_accounts=2;active_targets=5;planned_operations=10;max_follows_per_run=not_set;operation_warning_threshold=50"
  );
});

console.log("run preflight tests passed");
