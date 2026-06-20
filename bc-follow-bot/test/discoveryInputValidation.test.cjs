const assert = require("node:assert/strict");

const {
  validateDiscoveryInputCsvText
} = require("../dist/discovery/discoveryInputValidation.js");

function runCase(name, fn) {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`fail - ${name}`);
    throw error;
  }
}

const checkedAt = "2026-04-29T10:00:00.000Z";

runCase("valid discovery rows are accepted", () => {
  const csv = [
    "target_id,email,first_name,last_name,company,country,city,enabled,note",
    'disc-001,person@example.com,Person,One,"Example, Company",PL,Warsaw,true,"note, with comma"',
    "disc-002,,Person,Two,Example Company,PL,Krakow,true,name only"
  ].join("\n");

  const result = validateDiscoveryInputCsvText(csv, checkedAt);

  assert.equal(result.fileErrors.length, 0);
  assert.equal(result.valid.length, 2);
  assert.equal(result.valid[0].company, "Example, Company");
  assert.equal(result.valid[0].note, "note, with comma");
  assert.equal(result.valid[1].email, "");
  assert.equal(result.rejected.length, 0);
});

runCase("disabled discovery rows are returned as skipped results", () => {
  const csv = [
    "target_id,email,first_name,last_name,company,country,city,enabled,note",
    "disc-001,person@example.com,Person,One,Example Company,PL,Warsaw,false,disabled"
  ].join("\n");

  const result = validateDiscoveryInputCsvText(csv, checkedAt);

  assert.equal(result.fileErrors.length, 0);
  assert.equal(result.valid.length, 0);
  assert.equal(result.rejected.length, 0);
  assert.equal(result.skippedDisabled.length, 1);
  assert.equal(result.skippedDisabled[0].discovery_status, "skipped_disabled");
  assert.equal(result.skippedDisabled[0].confidence, "none");
  assert.equal(result.skippedDisabled[0].checked_at, checkedAt);
});

runCase("invalid rows are reported per record", () => {
  const csv = [
    "target_id,email,first_name,last_name,company,country,city,enabled,note",
    "disc-001,not-an-email,Person,One,Example Company,PL,Warsaw,true,bad email",
    "disc-002,,,,Example Company,PL,Warsaw,true,no identity",
    "disc-003,person@example.com,Person,Three,Example Company,PL,Warsaw,yes,bad enabled"
  ].join("\n");

  const result = validateDiscoveryInputCsvText(csv, checkedAt);

  assert.equal(result.fileErrors.length, 0);
  assert.equal(result.valid.length, 0);
  assert.equal(result.rejected.length, 3);
  assert.equal(result.rejected[0].issues[0].code, "invalid_email");
  assert.equal(result.rejected[1].issues[0].code, "missing_search_identity");
  assert.equal(result.rejected[2].issues[0].code, "invalid_boolean");
  assert.equal(result.rejected[0].result.discovery_status, "invalid_input");
  assert.equal(result.rejected[0].result.confidence, "none");
});

runCase("missing headers are reported as file error", () => {
  const csv = [
    "target_id,email,enabled",
    "disc-001,person@example.com,true"
  ].join("\n");

  const result = validateDiscoveryInputCsvText(csv, checkedAt);

  assert.equal(result.valid.length, 0);
  assert.equal(result.rejected.length, 0);
  assert.equal(result.fileErrors.length, 1);
  assert.match(result.fileErrors[0].message, /Missing CSV headers/);
});

console.log("discovery input validation tests passed");
