const assert = require("node:assert/strict");
const { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const repoRoot = process.cwd();

const {
  appendProfileActionHistoryEntry,
  hasSafelyProcessedProfile,
  hasProcessedProfile,
  normalizeProfileKey,
  normalizeTargetKey
} = require(path.join(repoRoot, "dist", "state", "profileActionHistory.js"));

function makeTempHistoryPath() {
  const tempRoot = mkdtempSync(path.join(os.tmpdir(), "bc-follow-bot-profile-history-"));
  return path.join(tempRoot, "data", "state", "profile-actions.jsonl");
}

function makeEntry(overrides = {}) {
  return {
    timestamp: "2026-04-27T10:00:00.000Z",
    accountEmail: "operator@example.com",
    targetId: "target-001",
    targetType: "profile_url",
    targetValue: " https://example.test/profile/123/ ",
    profileUrl: "https://example.test/profile/123/",
    searchOutcome: "person",
    followOutcome: "followed",
    finalResult: "followed",
    error: "",
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

runCase("creates history folder and file", () => {
  const historyPath = makeTempHistoryPath();

  appendProfileActionHistoryEntry(makeEntry(), historyPath);

  assert.equal(existsSync(path.dirname(historyPath)), true);
  assert.equal(existsSync(historyPath), true);
});

runCase("appends JSONL history entry", () => {
  const historyPath = makeTempHistoryPath();

  appendProfileActionHistoryEntry(makeEntry(), historyPath);

  const lines = readFileSync(historyPath, "utf-8").trim().split(/\r?\n/);
  assert.equal(lines.length, 1);

  const entry = JSON.parse(lines[0]);
  assert.deepEqual(Object.keys(entry), [
    "schemaVersion",
    "timestamp",
    "accountEmail",
    "targetId",
    "targetType",
    "targetValue",
    "targetKey",
    "profileKey",
    "searchOutcome",
    "followOutcome",
    "finalResult",
    "error"
  ]);
  assert.equal(entry.schemaVersion, 1);
  assert.equal(entry.targetKey, normalizeTargetKey("profile_url", " https://example.test/profile/123/ "));
  assert.equal(entry.profileKey, "https://example.test/profile/123");
});

runCase("normalizeProfileKey handles trailing slash consistently", () => {
  assert.equal(
    normalizeProfileKey("https://example.test/profile/123/"),
    "https://example.test/profile/123"
  );
  assert.equal(
    normalizeProfileKey("https://example.test/profile/123"),
    "https://example.test/profile/123"
  );
});

runCase("hasProcessedProfile returns true for stored profileKey", () => {
  const historyPath = makeTempHistoryPath();
  appendProfileActionHistoryEntry(makeEntry(), historyPath);

  assert.equal(hasProcessedProfile("https://example.test/profile/123", historyPath), true);
});

runCase("hasProcessedProfile returns false for missing profileKey", () => {
  const historyPath = makeTempHistoryPath();
  appendProfileActionHistoryEntry(makeEntry(), historyPath);

  assert.equal(hasProcessedProfile("https://example.test/profile/999", historyPath), false);
});

runCase("hasProcessedProfile does not crash on empty or missing file", () => {
  const missingHistoryPath = makeTempHistoryPath();
  const emptyHistoryPath = makeTempHistoryPath();
  mkdirSync(path.dirname(emptyHistoryPath), { recursive: true });
  writeFileSync(emptyHistoryPath, "", "utf-8");

  assert.equal(hasProcessedProfile("https://example.test/profile/123", missingHistoryPath), false);
  assert.equal(hasProcessedProfile("https://example.test/profile/123", emptyHistoryPath), false);
});

runCase("hasSafelyProcessedProfile returns true only for safe final results on the same account", () => {
  const historyPath = makeTempHistoryPath();
  appendProfileActionHistoryEntry(makeEntry({ finalResult: "followed" }), historyPath);
  appendProfileActionHistoryEntry(
    makeEntry({
      targetId: "target-002",
      profileUrl: "https://example.test/profile/456/",
      finalResult: "already_following"
    }),
    historyPath
  );

  assert.equal(
    hasSafelyProcessedProfile("operator@example.com", "https://example.test/profile/123", historyPath),
    true
  );
  assert.equal(
    hasSafelyProcessedProfile("operator@example.com", "https://example.test/profile/456", historyPath),
    true
  );
  assert.equal(
    hasSafelyProcessedProfile("other@example.com", "https://example.test/profile/123", historyPath),
    false
  );
});

runCase("hasSafelyProcessedProfile ignores unsafe final results", () => {
  const historyPath = makeTempHistoryPath();
  appendProfileActionHistoryEntry(makeEntry({ finalResult: "follow_failed" }), historyPath);

  assert.equal(
    hasSafelyProcessedProfile("operator@example.com", "https://example.test/profile/123", historyPath),
    false
  );
});

runCase("hasSafelyProcessedProfile ignores follow limit reached", () => {
  const historyPath = makeTempHistoryPath();
  appendProfileActionHistoryEntry(makeEntry({ finalResult: "follow_limit_reached" }), historyPath);

  assert.equal(
    hasSafelyProcessedProfile("operator@example.com", "https://example.test/profile/123", historyPath),
    false
  );
});

console.log("profile action history tests passed");
