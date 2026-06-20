const assert = require("node:assert/strict");

const { shouldAttemptFollow } = require("../dist/runner/appRunner.js");

function runCase(name, fn) {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`fail - ${name}`);
    throw error;
  }
}

runCase("follow is allowed for person search outcome", () => {
  assert.equal(shouldAttemptFollow("person"), true);
});

runCase("follow is skipped for company search outcome", () => {
  assert.equal(shouldAttemptFollow("company"), false);
});

runCase("follow is skipped for not_found search outcome", () => {
  assert.equal(shouldAttemptFollow("not_found"), false);
});

runCase("follow is skipped when search outcome is missing", () => {
  assert.equal(shouldAttemptFollow(undefined), false);
});

console.log("follow decision tests passed");
