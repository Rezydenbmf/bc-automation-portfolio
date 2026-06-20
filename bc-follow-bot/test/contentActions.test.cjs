const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { loadContentActions } = require("../dist/content/contentActionsLoader.js");
const { loadAppSettings } = require("../dist/shared/config.js");
const { loadAppInputs } = require("../dist/input/loadAppInputs.js");

function tempWorkspace() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "bc-follow-bot-content-"));
}

function writeFile(baseDir, relativePath, content) {
  const fullPath = path.join(baseDir, relativePath);
  fs.writeFileSync(fullPath, content, "utf8");
  return fullPath;
}

function cleanup(baseDir) {
  fs.rmSync(baseDir, { recursive: true, force: true });
}

function contentCsv(rows) {
  return [
    "content_action_id,account_id,target_type,target_value,content_type,language,enabled,note",
    ...rows
  ].join("\n");
}

function configJson(extra = {}) {
  return JSON.stringify({
    headless: true,
    timeoutMs: 30000,
    slowMo: 0,
    debugScreenshots: false,
    baseUrl: "https://example.internal.portal",
    screenshotOnError: true,
    takeHtmlSnapshotOnError: false,
    delayBetweenTargetsMs: 100,
    ...extra
  });
}

function minimalAccountsCsv() {
  return [
    "account_id,email,password,enabled,language,note",
    "acc-001,operator1@example.com,change-me,true,pl,ok"
  ].join("\n");
}

function minimalTargetsCsv() {
  return [
    "target_id,target_type,target_value,enabled,note",
    "target-001,profile_url,https://example.internal.portal/profile/123,true,ok"
  ].join("\n");
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

runCase("valid content actions file is accepted", () => {
  const dir = tempWorkspace();
  try {
    const filePath = writeFile(
      dir,
      "content-actions.csv",
      contentCsv([
        "content-001,acc-001,profile_url,https://example.internal.portal/profile/123,comment,pl,true,profile comment",
        "content-002,acc-001,post_url,https://example.internal.portal/posts/456,post,en,true,post action",
        "content-003,acc-002,manual,manual-review-needed,post,unknown,true,manual action"
      ])
    );

    const result = loadContentActions(filePath);
    assert.equal(result.valid.length, 3);
    assert.equal(result.disabled.length, 0);
    assert.equal(result.rejected.length, 0);
    assert.equal(result.valid[0].account_id, "acc-001");
    assert.equal(result.valid[0].content_type, "comment");
    assert.equal(result.valid[1].target_type, "post_url");
    assert.equal(result.valid[2].language, "unknown");
  } finally {
    cleanup(dir);
  }
});

runCase("disabled content action record is skipped without rejection", () => {
  const dir = tempWorkspace();
  try {
    const filePath = writeFile(
      dir,
      "content-actions.csv",
      contentCsv([
        "content-001,acc-001,profile_url,https://example.internal.portal/profile/123,comment,pl,false,disabled"
      ])
    );

    const result = loadContentActions(filePath);
    assert.equal(result.valid.length, 0);
    assert.equal(result.disabled.length, 1);
    assert.equal(result.rejected.length, 0);
    assert.equal(result.disabled[0].rowNumber, 2);
  } finally {
    cleanup(dir);
  }
});

runCase("invalid content_type is rejected", () => {
  const dir = tempWorkspace();
  try {
    const filePath = writeFile(
      dir,
      "content-actions.csv",
      contentCsv([
        "content-001,acc-001,profile_url,https://example.internal.portal/profile/123,message,pl,true,bad type"
      ])
    );

    const result = loadContentActions(filePath);
    assert.equal(result.valid.length, 0);
    assert.equal(result.rejected.length, 1);
    assert.equal(result.rejected[0].issues[0].field, "content_type");
    assert.equal(result.rejected[0].issues[0].code, "invalid_content_type");
  } finally {
    cleanup(dir);
  }
});

runCase("invalid target_type is rejected", () => {
  const dir = tempWorkspace();
  try {
    const filePath = writeFile(
      dir,
      "content-actions.csv",
      contentCsv([
        "content-001,acc-001,email,person@example.com,comment,pl,true,bad target"
      ])
    );

    const result = loadContentActions(filePath);
    assert.equal(result.valid.length, 0);
    assert.equal(result.rejected.length, 1);
    assert.equal(result.rejected[0].issues[0].field, "target_type");
    assert.equal(result.rejected[0].issues[0].code, "invalid_target_type");
  } finally {
    cleanup(dir);
  }
});

runCase("invalid language is rejected", () => {
  const dir = tempWorkspace();
  try {
    const filePath = writeFile(
      dir,
      "content-actions.csv",
      contentCsv([
        "content-001,acc-001,profile_url,https://example.internal.portal/profile/123,comment,polish-language,true,bad language"
      ])
    );

    const result = loadContentActions(filePath);
    assert.equal(result.valid.length, 0);
    assert.equal(result.rejected.length, 1);
    assert.equal(result.rejected[0].issues[0].field, "language");
    assert.equal(result.rejected[0].issues[0].code, "invalid_language");
  } finally {
    cleanup(dir);
  }
});

runCase("missing required fields are rejected with readable errors", () => {
  const dir = tempWorkspace();
  try {
    const filePath = writeFile(
      dir,
      "content-actions.csv",
      contentCsv([
        ",acc-001,profile_url,,comment,,true,missing fields"
      ])
    );

    const result = loadContentActions(filePath);
    assert.equal(result.valid.length, 0);
    assert.equal(result.rejected.length, 1);
    assert.deepEqual(
      result.rejected[0].issues.map((issue) => issue.field),
      ["content_action_id", "target_value", "language"]
    );
    assert.match(result.rejected[0].issues[0].message, /required/i);
  } finally {
    cleanup(dir);
  }
});

runCase("content config has safe defaults in both config loaders", () => {
  const dir = tempWorkspace();
  try {
    const configPath = writeFile(dir, "config.json", configJson());
    const accountsPath = writeFile(dir, "accounts.csv", minimalAccountsCsv());
    const targetsPath = writeFile(dir, "targets.csv", minimalTargetsCsv());

    const settings = loadAppSettings(configPath);
    assert.equal(settings.maxContentActionsPerRun, 5);
    assert.equal(settings.maxContentActionsPerAccount, 2);
    assert.equal(settings.maxContentBrowserDryRunPerRun, 3);
    assert.equal(settings.maxContentBrowserDryRunPerAccount, 1);
    assert.equal(settings.maxContentManualPublishesPerRun, 1);
    assert.equal(settings.maxContentManualPublishesPerAccount, 1);
    assert.equal(settings.maxContentTitleLength, 120);
    assert.equal(settings.aiDraftsEnabled, false);
    assert.equal(settings.aiDraftProvider, "openai-compatible");
    assert.equal(settings.aiDraftModel, "gpt-4.1-mini");
    assert.equal(settings.maxContentAiDraftsPerRun, 5);
    assert.equal(settings.maxContentDraftTextLength, 1200);
    assert.equal(settings.maxContentDraftTitleLength, 120);
    assert.equal(settings.requireFinalManualConfirmBeforePublish, true);
    assert.equal(settings.requireManualApprovalForContent, true);
    assert.equal(settings.contentDryRunDefault, true);

    const result = loadAppInputs({ configPath, accountsPath, targetsPath });
    assert.equal(result.fileErrors.length, 0);
    assert.equal(result.config.maxContentActionsPerRun, 5);
    assert.equal(result.config.maxContentActionsPerAccount, 2);
    assert.equal(result.config.maxContentBrowserDryRunPerRun, 3);
    assert.equal(result.config.maxContentBrowserDryRunPerAccount, 1);
    assert.equal(result.config.maxContentManualPublishesPerRun, 1);
    assert.equal(result.config.maxContentManualPublishesPerAccount, 1);
    assert.equal(result.config.maxContentTitleLength, 120);
    assert.equal(result.config.aiDraftsEnabled, false);
    assert.equal(result.config.aiDraftProvider, "openai-compatible");
    assert.equal(result.config.aiDraftModel, "gpt-4.1-mini");
    assert.equal(result.config.maxContentAiDraftsPerRun, 5);
    assert.equal(result.config.maxContentDraftTextLength, 1200);
    assert.equal(result.config.maxContentDraftTitleLength, 120);
    assert.equal(result.config.requireFinalManualConfirmBeforePublish, true);
    assert.equal(result.config.requireManualApprovalForContent, true);
    assert.equal(result.config.contentDryRunDefault, true);
  } finally {
    cleanup(dir);
  }
});

runCase("content config accepts explicit safe limits", () => {
  const dir = tempWorkspace();
  try {
    const configPath = writeFile(
      dir,
      "config.json",
      configJson({
        maxContentActionsPerRun: 3,
        maxContentActionsPerAccount: 1,
        maxContentBrowserDryRunPerRun: 2,
        maxContentBrowserDryRunPerAccount: 1,
        maxContentManualPublishesPerRun: 1,
        maxContentManualPublishesPerAccount: 1,
        maxContentTitleLength: 120,
        aiDraftsEnabled: true,
        aiDraftProvider: "openai-compatible",
        aiDraftModel: "mock-model",
        maxContentAiDraftsPerRun: 4,
        maxContentDraftTextLength: 900,
        maxContentDraftTitleLength: 90,
        requireFinalManualConfirmBeforePublish: true,
        requireManualApprovalForContent: true,
        contentDryRunDefault: true
      })
    );

    const settings = loadAppSettings(configPath);
    assert.equal(settings.maxContentActionsPerRun, 3);
    assert.equal(settings.maxContentActionsPerAccount, 1);
    assert.equal(settings.maxContentBrowserDryRunPerRun, 2);
    assert.equal(settings.maxContentBrowserDryRunPerAccount, 1);
    assert.equal(settings.maxContentManualPublishesPerRun, 1);
    assert.equal(settings.maxContentManualPublishesPerAccount, 1);
    assert.equal(settings.maxContentTitleLength, 120);
    assert.equal(settings.aiDraftsEnabled, true);
    assert.equal(settings.aiDraftProvider, "openai-compatible");
    assert.equal(settings.aiDraftModel, "mock-model");
    assert.equal(settings.maxContentAiDraftsPerRun, 4);
    assert.equal(settings.maxContentDraftTextLength, 900);
    assert.equal(settings.maxContentDraftTitleLength, 90);
    assert.equal(settings.requireFinalManualConfirmBeforePublish, true);
    assert.equal(settings.requireManualApprovalForContent, true);
    assert.equal(settings.contentDryRunDefault, true);
  } finally {
    cleanup(dir);
  }
});

console.log("content actions tests passed");
