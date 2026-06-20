const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
  exportContentApprovalReview,
  findLatestContentApprovalFile,
  reviewContentApprovalFile
} = require("../dist/content/contentApprovalReview.js");

function tempWorkspace() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "bc-follow-bot-content-approval-review-"));
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

function csv(rows, { includeApprovedTitle = false } = {}) {
  const headers = [
    "content_action_id",
    "account_id",
    "target_type",
    "target_value",
    "content_type",
    "account_language",
    "action_language",
    "approval_status",
    "approved_text"
  ];

  if (includeApprovedTitle) {
    headers.push("approved_title");
  }

  headers.push("reviewer_note");

  return [
    headers.map((value) => `"${value}"`).join(","),
    ...rows
  ].join("\n");
}

function row({
  id = "content-001",
  accountId = "acc-001",
  targetType = "profile_url",
  targetValue = "https://example.internal.portal/profile/123",
  contentType = "comment",
  approvalStatus = "pending",
  approvedText = "",
  approvedTitle = "",
  includeApprovedTitle = false,
  reviewerNote = ""
} = {}) {
  const values = [
    id,
    accountId,
    targetType,
    targetValue,
    contentType,
    "pl",
    "pl",
    approvalStatus,
    approvedText
  ];

  if (includeApprovedTitle) {
    values.push(approvedTitle);
  }

  values.push(reviewerNote);

  return values.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(",");
}

function reviewSingle(overrides) {
  const dir = tempWorkspace();
  try {
    const filePath = writeFile(dir, "approval.csv", csv([row(overrides)]));
    return reviewContentApprovalFile(filePath);
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

runCase("approved with approved_text is ready", () => {
  const result = reviewSingle({
    approvalStatus: "approved",
    approvedText: "Manual approved comment."
  });

  assert.equal(result.rows[0].review_status, "content_approved_ready");
  assert.equal(result.summary.approvedReadyCount, 1);
  assert.equal(result.summary.invalidCount, 0);
});

runCase("older CSV without approved_title is accepted", () => {
  const result = reviewSingle({
    approvalStatus: "approved",
    approvedText: "Manual approved comment."
  });

  assert.equal(result.rows[0].review_status, "content_approved_ready");
  assert.equal(result.rows[0].approved_title, "");
});

runCase("empty approved_title is accepted when column exists", () => {
  const dir = tempWorkspace();
  try {
    const filePath = writeFile(
      dir,
      "approval.csv",
      csv([
        row({
          approvalStatus: "approved",
          approvedText: "Manual approved comment.",
          approvedTitle: "",
          includeApprovedTitle: true
        })
      ], { includeApprovedTitle: true })
    );
    const result = reviewContentApprovalFile(filePath);

    assert.equal(result.rows[0].review_status, "content_approved_ready");
    assert.equal(result.rows[0].approved_title, "");
  } finally {
    cleanup(dir);
  }
});

runCase("multiline approved_text with blank line and URL is one approved row", () => {
  const dir = tempWorkspace();
  try {
    const approvedText = [
      "Pierwsza linia z przecinkiem, bez rozbijania.",
      "",
      "Link: https://example.invalid/profile/123?topic=csv,approval",
      "Cytat: \"bezpieczny test\""
    ].join("\n");
    const filePath = writeFile(
      dir,
      "approval.csv",
      csv([
        row({
          approvalStatus: "approved",
          approvedText,
          approvedTitle: "Synthetic title",
          includeApprovedTitle: true
        })
      ], { includeApprovedTitle: true })
    );
    const result = reviewContentApprovalFile(filePath);

    assert.equal(result.summary.readCount, 1);
    assert.equal(result.summary.invalidCount, 0);
    assert.equal(result.rows[0].review_status, "content_approved_ready");
    assert.equal(result.rows[0].approved_text, approvedText);
    assert.equal(result.rows[0].approved_title, "Synthetic title");
  } finally {
    cleanup(dir);
  }
});

runCase("approved without approved_text is invalid", () => {
  const result = reviewSingle({
    approvalStatus: "approved",
    approvedText: ""
  });

  assert.equal(result.rows[0].review_status, "content_invalid_approval");
  assert.match(result.rows[0].validation_message, /approved_text is required/);
});

runCase("rejected is not ready", () => {
  const result = reviewSingle({ approvalStatus: "rejected" });

  assert.equal(result.rows[0].review_status, "content_rejected");
  assert.equal(result.summary.rejectedCount, 1);
  assert.equal(result.summary.approvedReadyCount, 0);
});

runCase("needs_changes is not ready", () => {
  const result = reviewSingle({ approvalStatus: "needs_changes" });

  assert.equal(result.rows[0].review_status, "content_needs_changes");
  assert.equal(result.summary.needsChangesCount, 1);
  assert.equal(result.summary.approvedReadyCount, 0);
});

runCase("pending is not ready", () => {
  const result = reviewSingle({ approvalStatus: "pending" });

  assert.equal(result.rows[0].review_status, "content_pending_approval");
  assert.equal(result.summary.pendingCount, 1);
  assert.equal(result.summary.approvedReadyCount, 0);
});

runCase("unknown approval_status is invalid", () => {
  const result = reviewSingle({ approvalStatus: "maybe" });

  assert.equal(result.rows[0].review_status, "content_invalid_approval");
  assert.match(result.rows[0].validation_message, /approval_status must be/);
});

runCase("too long approved_text is invalid", () => {
  const result = reviewSingle({
    approvalStatus: "approved",
    approvedText: "x".repeat(3001)
  });

  assert.equal(result.rows[0].review_status, "content_invalid_approval");
  assert.match(result.rows[0].validation_message, /approved_text must be up to 3000/);
});

runCase("too long approved_title is invalid", () => {
  const dir = tempWorkspace();
  try {
    const filePath = writeFile(
      dir,
      "approval.csv",
      csv([
        row({
          approvalStatus: "approved",
          approvedText: "Manual approved comment.",
          approvedTitle: "x".repeat(121),
          includeApprovedTitle: true
        })
      ], { includeApprovedTitle: true })
    );
    const result = reviewContentApprovalFile(filePath);

    assert.equal(result.rows[0].review_status, "content_invalid_approval");
    assert.match(result.rows[0].validation_message, /approved_title must be up to 120/);
  } finally {
    cleanup(dir);
  }
});

runCase("review export file is generated", () => {
  const dir = tempWorkspace();
  try {
    const inputPath = writeFile(
      dir,
      "approval.csv",
      csv([row({ approvalStatus: "approved", approvedText: "Ready text." })])
    );
    const result = reviewContentApprovalFile(inputPath);
    const outputPath = exportContentApprovalReview(
      result.rows,
      new Date("2026-05-27T12:13:14"),
      path.join(dir, "review")
    );
    const outputText = fs.readFileSync(outputPath, "utf8");

    assert.equal(path.basename(outputPath), "content-approval-review-20260527-121314.csv");
    assert.equal(fs.existsSync(outputPath), true);
    assert.match(outputText, /"review_status"/);
    assert.match(outputText, /"content_approved_ready"/);
  } finally {
    cleanup(dir);
  }
});

runCase("latest approval file can be selected", () => {
  const dir = tempWorkspace();
  try {
    const older = writeFile(
      dir,
      "content-approval-20260527-111111.csv",
      csv([row({ id: "older", approvalStatus: "pending" })])
    );
    const newer = writeFile(
      dir,
      "content-approval-20260527-121212.csv",
      csv([row({ id: "newer", approvalStatus: "pending" })])
    );
    const aiDraft = writeFile(
      dir,
      "content-approval-ai-draft-20260527-131313.csv",
      csv([row({ id: "ai-draft", approvalStatus: "pending" })])
    );
    const olderDate = new Date("2026-05-27T11:11:11").getTime() / 1000;
    const newerDate = new Date("2026-05-27T12:12:12").getTime() / 1000;
    const aiDraftDate = new Date("2026-05-27T13:13:13").getTime() / 1000;

    fs.utimesSync(older, olderDate, olderDate);
    fs.utimesSync(newer, newerDate, newerDate);
    fs.utimesSync(aiDraft, aiDraftDate, aiDraftDate);

    assert.equal(findLatestContentApprovalFile(dir), aiDraft);
  } finally {
    cleanup(dir);
  }
});

runCase("review does not publish and does not use browser automation", () => {
  const result = reviewSingle({
    approvalStatus: "approved",
    approvedText: "Manual approved comment."
  });
  const source = fs.readFileSync(
    path.join(__dirname, "..", "src", "content", "contentApprovalReview.ts"),
    "utf8"
  );

  assert.equal(result.summary.approvedReadyCount, 1);
  assert.doesNotMatch(source, /playwright|browser|page\.|click\(|postButton|submit/i);
});

console.log("content approval review tests passed");
