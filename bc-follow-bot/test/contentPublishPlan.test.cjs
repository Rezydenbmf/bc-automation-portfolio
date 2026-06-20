const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
  exportContentPublishPlan,
  findLatestContentApprovalReviewFile,
  planContentPublishFile,
  runContentPublishPlan
} = require("../dist/content/contentPublishPlan.js");

function tempWorkspace() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "bc-follow-bot-content-publish-plan-"));
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

function config(extra = {}) {
  return {
    maxContentPublishesPerRun: 3,
    maxContentPublishesPerAccount: 1,
    maxContentTitleLength: 120,
    ...extra
  };
}

function reviewRow({
  id = "content-001",
  accountId = "acc-001",
  targetType = "profile_url",
  targetValue = "https://example.internal.portal/profile/123",
  contentType = "comment",
  approvalStatus = "approved",
  reviewStatus = "content_approved_ready",
  approvedText = "Manual approved text.",
  approvedTitle = "",
  reviewerNote = "",
  validationMessage = "approved"
} = {}) {
  return {
    content_action_id: id,
    account_id: accountId,
    target_type: targetType,
    target_value: targetValue,
    content_type: contentType,
    approval_status: approvalStatus,
    review_status: reviewStatus,
    approved_text: approvedText,
    approved_title: approvedTitle,
    reviewer_note: reviewerNote,
    validation_message: validationMessage
  };
}

function quoted(value) {
  return `"${String(value).replace(/"/g, '""')}"`;
}

function reviewCsv(rows) {
  const headers = [
    "content_action_id",
    "account_id",
    "target_type",
    "target_value",
    "content_type",
    "approval_status",
    "review_status",
    "approved_text",
    "approved_title",
    "reviewer_note",
    "validation_message"
  ];

  return [
    headers.map(quoted).join(","),
    ...rows.map((row) => headers.map((header) => quoted(row[header] ?? "")).join(","))
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

runCase("only content_approved_ready records are planned", () => {
  const result = runContentPublishPlan({
    reviewRows: [
      reviewRow({ id: "ready" }),
      reviewRow({ id: "pending", reviewStatus: "content_pending_approval", approvedText: "" })
    ],
    config: config({ maxContentPublishesPerRun: 5, maxContentPublishesPerAccount: 5 })
  });

  assert.equal(result.rows[0].publish_plan_status, "content_publish_planned");
  assert.equal(result.rows[1].publish_plan_status, "content_publish_skipped_not_approved");
  assert.equal(result.summary.plannedCount, 1);
});

runCase("publish plan carries approved_title", () => {
  const result = runContentPublishPlan({
    reviewRows: [
      reviewRow({ id: "ready", contentType: "post", approvedTitle: "Safe SEO title" })
    ],
    config: config({ maxContentPublishesPerRun: 5, maxContentPublishesPerAccount: 5 })
  });

  assert.equal(result.rows[0].publish_plan_status, "content_publish_planned");
  assert.equal(result.rows[0].approved_title, "Safe SEO title");
});

runCase("other review statuses are skipped as not approved", () => {
  const result = runContentPublishPlan({
    reviewRows: [
      reviewRow({ id: "rejected", reviewStatus: "content_rejected", approvedText: "" }),
      reviewRow({ id: "needs", reviewStatus: "content_needs_changes", approvedText: "" }),
      reviewRow({ id: "pending", reviewStatus: "content_pending_approval", approvedText: "" })
    ],
    config: config({ maxContentPublishesPerRun: 5, maxContentPublishesPerAccount: 5 })
  });

  assert.deepEqual(
    result.rows.map((row) => row.publish_plan_status),
    [
      "content_publish_skipped_not_approved",
      "content_publish_skipped_not_approved",
      "content_publish_skipped_not_approved"
    ]
  );
  assert.equal(result.summary.skippedNotApprovedCount, 3);
});

runCase("global maxContentPublishesPerRun limit is applied", () => {
  const result = runContentPublishPlan({
    reviewRows: [
      reviewRow({ id: "content-001", accountId: "acc-001" }),
      reviewRow({ id: "content-002", accountId: "acc-002" })
    ],
    config: config({ maxContentPublishesPerRun: 1, maxContentPublishesPerAccount: 5 })
  });

  assert.equal(result.rows[0].publish_plan_status, "content_publish_planned");
  assert.equal(result.rows[1].publish_plan_status, "content_publish_skipped_limit_reached");
  assert.equal(result.summary.skippedLimitReachedCount, 1);
});

runCase("maxContentPublishesPerAccount limit is applied", () => {
  const result = runContentPublishPlan({
    reviewRows: [
      reviewRow({ id: "content-001", accountId: "acc-001" }),
      reviewRow({ id: "content-002", accountId: "acc-001" })
    ],
    config: config({ maxContentPublishesPerRun: 5, maxContentPublishesPerAccount: 1 })
  });

  assert.equal(result.rows[0].publish_plan_status, "content_publish_planned");
  assert.equal(result.rows[1].publish_plan_status, "content_publish_skipped_limit_reached");
  assert.equal(result.summary.skippedLimitReachedCount, 1);
});

runCase("invalid record is marked invalid", () => {
  const result = runContentPublishPlan({
    reviewRows: [
      reviewRow({
        id: "",
        targetType: "company",
        reviewStatus: "content_approved_ready",
        approvedText: ""
      })
    ],
    config: config()
  });

  assert.equal(result.rows[0].publish_plan_status, "content_publish_invalid_record");
  assert.match(result.rows[0].reason, /content_action_id is required/);
  assert.match(result.rows[0].reason, /target_type must be/);
  assert.match(result.rows[0].reason, /approved_text is required/);
});

runCase("manual target type is rejected before publish plan", () => {
  const result = runContentPublishPlan({
    reviewRows: [
      reviewRow({
        id: "manual-draft",
        targetType: "manual",
        targetValue: "own-profile-wall",
        contentType: "post"
      })
    ],
    config: config()
  });

  assert.equal(result.rows[0].publish_plan_status, "content_publish_invalid_record");
  assert.match(result.rows[0].reason, /manual is draft-only/);
  assert.equal(result.summary.approvedReadyCount, 0);
  assert.equal(result.summary.plannedCount, 0);
});

runCase("post publish flow requires profile_url target type", () => {
  const result = runContentPublishPlan({
    reviewRows: [
      reviewRow({
        id: "post-url-post",
        targetType: "post_url",
        targetValue: "https://example.invalid/post/123",
        contentType: "post"
      })
    ],
    config: config()
  });

  assert.equal(result.rows[0].publish_plan_status, "content_publish_invalid_record");
  assert.match(result.rows[0].reason, /post requires target_type=profile_url/);
  assert.equal(result.summary.approvedReadyCount, 0);
  assert.equal(result.summary.plannedCount, 0);
});

runCase("too long approved_title is not planned", () => {
  const result = runContentPublishPlan({
    reviewRows: [
      reviewRow({
        id: "content-title-too-long",
        contentType: "post",
        approvedTitle: "x".repeat(121)
      })
    ],
    config: config()
  });

  assert.equal(result.rows[0].publish_plan_status, "content_publish_invalid_record");
  assert.match(result.rows[0].reason, /approved_title must be up to 120/);
});

runCase("publish plan CSV is generated", () => {
  const dir = tempWorkspace();
  try {
    const result = runContentPublishPlan({
      reviewRows: [reviewRow({ approvedText: 'Text with "quote".' })],
      config: config()
    });
    const outputPath = exportContentPublishPlan(
      result.rows,
      new Date("2026-05-27T12:13:14"),
      path.join(dir, "plan")
    );
    const outputText = fs.readFileSync(outputPath, "utf8");

    assert.equal(path.basename(outputPath), "content-publish-plan-20260527-121314.csv");
    assert.match(outputText, /"publish_plan_status"/);
    assert.match(outputText, /"content_publish_planned"/);
    assert.match(outputText, /"Text with ""quote""\."/);
  } finally {
    cleanup(dir);
  }
});

runCase("latest approval review file can be selected", () => {
  const dir = tempWorkspace();
  try {
    const older = writeFile(
      dir,
      "content-approval-review-20260527-111111.csv",
      reviewCsv([reviewRow({ id: "older" })])
    );
    const newer = writeFile(
      dir,
      "content-approval-review-20260527-121212.csv",
      reviewCsv([reviewRow({ id: "newer" })])
    );
    const olderDate = new Date("2026-05-27T11:11:11").getTime() / 1000;
    const newerDate = new Date("2026-05-27T12:12:12").getTime() / 1000;

    fs.utimesSync(older, olderDate, olderDate);
    fs.utimesSync(newer, newerDate, newerDate);

    assert.equal(findLatestContentApprovalReviewFile(dir), newer);
  } finally {
    cleanup(dir);
  }
});

runCase("plan can read review CSV from file", () => {
  const dir = tempWorkspace();
  try {
    const inputPath = writeFile(dir, "review.csv", reviewCsv([
      reviewRow({ id: "ready" }),
      reviewRow({ id: "rejected", reviewStatus: "content_rejected", approvedText: "" })
    ]));
    const result = planContentPublishFile(
      inputPath,
      config({ maxContentPublishesPerRun: 5, maxContentPublishesPerAccount: 5 })
    );

    assert.equal(result.summary.readCount, 2);
    assert.equal(result.summary.plannedCount, 1);
    assert.equal(result.summary.skippedNotApprovedCount, 1);
  } finally {
    cleanup(dir);
  }
});

runCase("plan reads multiline approved_text without extra invalid row and preserves title", () => {
  const dir = tempWorkspace();
  try {
    const approvedText = [
      "Pierwsza linia z przecinkiem, bez rozbijania.",
      "",
      "Link: https://example.invalid/profile/123?topic=csv,plan",
      "Cytat: \"bezpieczny test\""
    ].join("\n");
    const inputPath = writeFile(dir, "review.csv", reviewCsv([
      reviewRow({
        id: "multiline-ready",
        contentType: "post",
        approvedText,
        approvedTitle: "Synthetic title"
      })
    ]));
    const result = planContentPublishFile(
      inputPath,
      config({ maxContentPublishesPerRun: 5, maxContentPublishesPerAccount: 5 })
    );

    assert.equal(result.summary.readCount, 1);
    assert.equal(result.summary.plannedCount, 1);
    assert.equal(result.summary.invalidCount, 0);
    assert.equal(result.rows.length, 1);
    assert.equal(result.rows[0].approved_text, approvedText);
    assert.equal(result.rows[0].approved_title, "Synthetic title");
  } finally {
    cleanup(dir);
  }
});

runCase("publish plan does not publish and does not use browser automation", () => {
  const result = runContentPublishPlan({
    reviewRows: [reviewRow()],
    config: config()
  });
  const source = fs.readFileSync(
    path.join(__dirname, "..", "src", "content", "contentPublishPlan.ts"),
    "utf8"
  );

  assert.equal(result.summary.plannedCount, 1);
  assert.doesNotMatch(source, /playwright|browser|page\.|click\(|postButton|submit|fetch\(/i);
});

console.log("content publish plan tests passed");
