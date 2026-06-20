const assert = require("node:assert/strict");

const { evaluateStartupInputs } = require("../dist/bootstrap/startup.js");

function makeValidInputs(overrides = {}) {
  return {
    config: {
      headless: true,
      timeoutMs: 30000,
      slowMo: 0,
      debugScreenshots: false,
      baseUrl: "https://example.internal.portal",
      screenshotOnError: true,
      takeHtmlSnapshotOnError: false,
      delayBetweenTargetsMs: 100
    },
    accountsValid: [
      {
        account_id: "acc-001",
        email: "operator1@example.com",
        password: "change-me",
        enabled: true,
        note: ""
      }
    ],
    targetsValid: [
      {
        target_id: "target-001",
        target_type: "person",
        target_value: "https://example.internal.portal/profile/123",
        enabled: true,
        note: ""
      }
    ],
    accountsRejected: [],
    targetsRejected: [],
    fileErrors: [],
    ...overrides
  };
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

runCase("valid startup input continues", () => {
  const result = evaluateStartupInputs(makeValidInputs());
  assert.equal(result.canContinue, true);
  assert.equal(result.stopReasons.length, 0);
});

runCase("zero targets still allow startup to continue", () => {
  const result = evaluateStartupInputs(makeValidInputs({ targetsValid: [] }));
  assert.equal(result.canContinue, true);
  assert.equal(result.stopReasons.length, 0);
});

runCase("missing config stops startup", () => {
  const result = evaluateStartupInputs(makeValidInputs({ config: null }));
  assert.equal(result.canContinue, false);
  assert.match(result.stopReasons[0], /konfiguracji/i);
});

runCase("file errors stop startup", () => {
  const result = evaluateStartupInputs(
    makeValidInputs({
      fileErrors: [{ file: "config/appsettings.json", message: "missing" }]
    })
  );
  assert.equal(result.canContinue, false);
  assert.match(result.stopReasons[0], /błędy plików/i);
});

runCase("empty accounts stop startup", () => {
  const result = evaluateStartupInputs(makeValidInputs({ accountsValid: [] }));
  assert.equal(result.canContinue, false);
  assert.match(result.stopReasons[0], /kont/i);
});

console.log("startup tests passed");
