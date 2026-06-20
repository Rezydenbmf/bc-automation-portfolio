const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
  reviewContentCampaignInput
} = require("../dist/content/contentCampaignInputReview.js");

function tempWorkspace() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "bc-follow-bot-content-campaign-review-"));
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

function csvValue(value) {
  return `"${String(value).replace(/"/g, '""')}"`;
}

function draftSourcesCsv(rows) {
  return [
    [
      "content_action_id",
      "account_id",
      "target_type",
      "target_value",
      "content_type",
      "language",
      "profile_name",
      "country",
      "industry",
      "bio",
      "post_goal",
      "topic_hint",
      "tone",
      "enabled",
      "note"
    ].join(","),
    ...rows
  ].join("\n");
}

function row(overrides = {}) {
  const values = {
    content_action_id: "content-campaign-001",
    account_id: "acc-001",
    target_type: "profile_url",
    target_value: "https://example.invalid/profile/synthetic-001",
    content_type: "post",
    language: "en",
    profile_name: "Example Operator",
    country: "United Kingdom",
    industry: "operations",
    bio: "Shares practical operations notes for small teams.",
    post_goal: "Share a useful workflow note.",
    topic_hint: "Simple weekly planning",
    tone: "practical",
    enabled: "true",
    note: "synthetic"
  };

  return Object.values({ ...values, ...overrides }).map(csvValue).join(",");
}

function reviewRows(rows) {
  const dir = tempWorkspace();
  try {
    const filePath = writeFile(dir, "content-draft-sources.csv", draftSourcesCsv(rows));
    return reviewContentCampaignInput(filePath);
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

runCase("classifies profile_url post rows as publish-flow candidates", () => {
  const result = reviewRows([
    row({ content_action_id: "campaign-001" }),
    row({ content_action_id: "campaign-002", target_value: "https://example.invalid/profile/synthetic-002" })
  ]);

  assert.equal(result.summary.totalRows, 2);
  assert.equal(result.summary.publishFlowCandidateCount, 2);
  assert.equal(result.summary.draftOnlyManualCount, 0);
  assert.deepEqual(
    result.items.map((item) => item.classification),
    ["publish_flow_candidate", "publish_flow_candidate"]
  );
});

runCase("classifies manual rows as draft-only", () => {
  const result = reviewRows([
    row({
      content_action_id: "manual-draft",
      target_type: "manual",
      target_value: "own-profile-wall"
    })
  ]);

  assert.equal(result.summary.publishFlowCandidateCount, 0);
  assert.equal(result.summary.draftOnlyManualCount, 1);
  assert.equal(result.items[0].classification, "draft_only_manual");
  assert.match(result.items[0].reason, /draft-only/);
});

runCase("classifies post_url posts as draft possible but not publish-ready", () => {
  const result = reviewRows([
    row({
      content_action_id: "post-url-post",
      target_type: "post_url",
      target_value: "https://example.invalid/post/synthetic-001"
    })
  ]);

  assert.equal(result.summary.draftPossibleNotPublishReadyCount, 1);
  assert.equal(result.items[0].classification, "draft_possible_not_publish_ready");
  assert.match(result.items[0].reason, /profile_url/);
});

runCase("unknown language and comment rows are not campaign publish candidates", () => {
  const result = reviewRows([
    row({ content_action_id: "unknown-language", language: "unknown" }),
    row({ content_action_id: "comment-row", content_type: "comment" })
  ]);

  assert.equal(result.summary.publishFlowCandidateCount, 0);
  assert.equal(result.summary.unknownLanguageCount, 1);
  assert.equal(result.summary.unsupportedContentTypeCount, 1);
});

runCase("rejected loader rows are surfaced without API or browser work", () => {
  const result = reviewRows([
    row({
      content_action_id: "bad-url",
      target_type: "profile_url",
      target_value: "not-a-url"
    })
  ]);

  assert.equal(result.summary.rejectedCount, 1);
  assert.equal(result.rejected[0].issues[0].field, "target_value");
  assert.equal(result.rejected[0].issues[0].code, "invalid_url");
});

runCase("campaign input review code does not call AI provider browser or publish modules", () => {
  const source = fs.readFileSync(
    path.join(__dirname, "..", "src", "content", "contentCampaignInputReview.ts"),
    "utf8"
  );

  assert.doesNotMatch(
    source,
    /playwright|page\.|click\(|contentManualPublish|contentAiDraftProvider|launchBrowser|fetch\(/i
  );
});

console.log("content campaign input review tests passed");
