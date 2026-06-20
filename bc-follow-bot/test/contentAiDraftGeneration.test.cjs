const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
  buildContentAiDraftPrompt,
  createOpenAiCompatibleDraftProvider
} = require("../dist/content/contentAiDraftProvider.js");
const { exportContentAiDraftFiles } = require("../dist/content/contentAiDraftExport.js");
const {
  getContentAiDraftReviewerNote,
  runContentAiDraftGeneration
} = require("../dist/content/contentAiDraftGeneration.js");
const { loadContentDraftSources } = require("../dist/content/contentDraftSourcesLoader.js");
const { reviewContentApprovalFile } = require("../dist/content/contentApprovalReview.js");

function tempWorkspace() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "bc-follow-bot-ai-drafts-"));
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
    content_action_id: "content-ai-001",
    account_id: "acc-001",
    target_type: "manual",
    target_value: "own-profile-wall",
    content_type: "post",
    language: "pl",
    profile_name: "Anna Example",
    country: "Poland",
    industry: "B2B software",
    bio: "Helps small teams organize customer communication.",
    post_goal: "Share a useful thought about customer follow-up.",
    topic_hint: "Simple follow-up routines",
    tone: "calm and practical",
    enabled: "true",
    note: "synthetic"
  };

  return Object.values({ ...values, ...overrides }).map(csvValue).join(",");
}

function config(extra = {}) {
  return {
    aiDraftModel: "mock-model",
    maxContentAiDraftsPerRun: 5,
    maxContentDraftTextLength: 1200,
    maxContentDraftTitleLength: 120,
    ...extra
  };
}

function fakeProvider(factory) {
  return {
    calls: [],
    async generateDraft(request) {
      this.calls.push(request);
      if (factory) {
        return factory(request, this.calls.length);
      }

      return {
        draft_title: "Praktyczny follow-up",
        draft_text: "Regularny kontakt z klientem pomaga utrzymac porzadek i zaufanie.",
        draft_topic: "follow-up",
        draft_reason: "Uses the provided bio and post goal."
      };
    }
  };
}

function loadSourcesFromRows(rows) {
  const dir = tempWorkspace();
  try {
    const filePath = writeFile(dir, "content-draft-sources.csv", draftSourcesCsv(rows));
    return loadContentDraftSources(filePath);
  } finally {
    cleanup(dir);
  }
}

async function runCase(name, fn) {
  try {
    await fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`fail - ${name}`);
    throw error;
  }
}

(async () => {
  await runCase("reads draft source CSV and generates draft text and title", async () => {
    const provider = fakeProvider();
    const result = await runContentAiDraftGeneration({
      loadedSources: loadSourcesFromRows([row()]),
      config: config(),
      provider
    });

    assert.equal(result.summary.loadedCount, 1);
    assert.equal(result.summary.generatedCount, 1);
    assert.equal(result.rows[0].generation_status, "content_ai_draft_generated");
    assert.equal(result.rows[0].draft_title, "Praktyczny follow-up");
    assert.match(result.rows[0].draft_text, /Regularny kontakt/);
    assert.equal(provider.calls.length, 1);
  });

  await runCase("skips disabled rows without calling AI provider", async () => {
    const provider = fakeProvider();
    const result = await runContentAiDraftGeneration({
      loadedSources: loadSourcesFromRows([row({ enabled: "false" })]),
      config: config(),
      provider
    });

    assert.equal(result.rows[0].generation_status, "content_ai_draft_skipped_disabled");
    assert.equal(provider.calls.length, 0);
  });

  await runCase("blocks unknown language without guessing", async () => {
    const provider = fakeProvider();
    const result = await runContentAiDraftGeneration({
      loadedSources: loadSourcesFromRows([row({ language: "unknown" })]),
      config: config(),
      provider
    });

    assert.equal(result.rows[0].generation_status, "content_ai_draft_skipped_unknown_language");
    assert.equal(result.rows[0].draft_language, "");
    assert.equal(provider.calls.length, 0);
  });

  await runCase("builds prompt with bio industry and language", async () => {
    const loaded = loadSourcesFromRows([row({ language: "gb" })]);
    const prompt = buildContentAiDraftPrompt(loaded.valid[0], "en", config());

    assert.match(prompt.user, /Required language: English \(en\)/);
    assert.match(prompt.user, /B2B software/);
    assert.match(prompt.user, /Helps small teams/);
    assert.match(prompt.system, /Do not invent hard facts/);
    assert.match(prompt.system, /Avoid first-person claims/);
    assert.match(prompt.system, /concise title/);
    assert.match(prompt.user, /one or two short paragraphs/);
  });

  await runCase("normalizes gb and us language codes to English drafts", async () => {
    const provider = fakeProvider();
    const result = await runContentAiDraftGeneration({
      loadedSources: loadSourcesFromRows([row({ language: "gb" })]),
      config: config(),
      provider
    });

    assert.equal(result.rows[0].source_language, "gb");
    assert.equal(result.rows[0].draft_language, "en");
    assert.equal(provider.calls[0].draftLanguage, "en");
  });

  await runCase("enforces configured draft length limits", async () => {
    const provider = fakeProvider(() => ({
      draft_title: "T".repeat(20),
      draft_text: "X".repeat(50),
      draft_topic: "limits",
      draft_reason: "Long mock response."
    }));
    const result = await runContentAiDraftGeneration({
      loadedSources: loadSourcesFromRows([row()]),
      config: config({
        maxContentDraftTitleLength: 10,
        maxContentDraftTextLength: 25
      }),
      provider
    });

    assert.equal(result.rows[0].draft_title.length, 10);
    assert.equal(result.rows[0].draft_text.length, 25);
    assert.match(result.rows[0].generation_reason, /truncated/);
  });

  await runCase("writes content-ai-drafts CSV and approval-compatible CSV", async () => {
    const dir = tempWorkspace();
    try {
      const provider = fakeProvider();
      const result = await runContentAiDraftGeneration({
        loadedSources: loadSourcesFromRows([row()]),
        config: config(),
        provider
      });
      const exported = exportContentAiDraftFiles(
        result.rows,
        result.approvalRows,
        new Date("2026-06-11T10:11:12"),
        path.join(dir, "drafts"),
        path.join(dir, "approvals")
      );

      assert.equal(path.basename(exported.draftsFilePath), "content-ai-drafts-20260611-101112.csv");
      assert.equal(
        path.basename(exported.approvalFilePath),
        "content-approval-ai-draft-20260611-101112.csv"
      );
      assert.match(fs.readFileSync(exported.draftsFilePath, "utf8"), /"generation_status"/);

      const approvalText = fs.readFileSync(exported.approvalFilePath, "utf8");
      assert.match(approvalText, /"approval_status","approved_text","approved_title","reviewer_note"/);
      assert.match(approvalText, /"pending"/);
      assert.match(approvalText, new RegExp(getContentAiDraftReviewerNote()));

      const review = reviewContentApprovalFile(exported.approvalFilePath);
      assert.equal(review.summary.pendingCount, 1);
      assert.equal(review.summary.approvedReadyCount, 0);
    } finally {
      cleanup(dir);
    }
  });

  await runCase("maxContentAiDraftsPerRun limit works", async () => {
    const provider = fakeProvider((request, callNumber) => ({
      draft_title: `Title ${callNumber}`,
      draft_text: `Text ${callNumber}`,
      draft_topic: "limit",
      draft_reason: "Limit test."
    }));
    const result = await runContentAiDraftGeneration({
      loadedSources: loadSourcesFromRows([
        row({ content_action_id: "content-ai-001" }),
        row({ content_action_id: "content-ai-002" })
      ]),
      config: config({ maxContentAiDraftsPerRun: 1 }),
      provider
    });

    assert.equal(result.summary.generatedCount, 1);
    assert.equal(result.rows[1].generation_status, "content_ai_draft_skipped_limit_reached");
    assert.equal(provider.calls.length, 1);
  });

  await runCase("missing API key gives clear error", async () => {
    assert.throws(
      () => createOpenAiCompatibleDraftProvider({
        aiDraftModel: "mock-model",
        aiDraftProvider: "openai-compatible"
      }, {}),
      /Missing AI draft API key/
    );
  });

  await runCase("tests use mocked AI provider and no browser or publish module", async () => {
    const source = fs.readFileSync(
      path.join(__dirname, "..", "src", "content", "contentAiDraftGeneration.ts"),
      "utf8"
    );

    assert.doesNotMatch(source, /playwright|browser|page\.|click\(|contentManualPublish|FINAL_PUBLISH_YES/i);
  });

  console.log("content AI draft generation tests passed");
})();
