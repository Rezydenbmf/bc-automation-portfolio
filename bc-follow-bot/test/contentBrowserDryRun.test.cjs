const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
  exportContentBrowserDryRun,
  findLatestContentPublishPlanFile,
  readContentPublishPlanFile,
  runContentBrowserDryRun
} = require("../dist/content/contentBrowserDryRun.js");

function tempWorkspace() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "bc-follow-bot-content-browser-dry-run-"));
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

function account(id = "acc-001") {
  return {
    account_id: id,
    email: `${id}@example.com`,
    password: "change-me",
    enabled: true,
    language: "pl",
    note: ""
  };
}

function config(extra = {}) {
  return {
    headless: true,
    slowMo: 0,
    timeoutMs: 30000,
    maxContentBrowserDryRunPerRun: 3,
    maxContentBrowserDryRunPerAccount: 1,
    ...extra
  };
}

function planRow({
  id = "content-001",
  accountId = "acc-001",
  targetType = "profile_url",
  targetValue = "https://example.internal.portal/profile/123",
  contentType = "comment",
  approvedText = "Approved text must never be written or exported.",
  publishPlanStatus = "content_publish_planned",
  reason = "approved content added to publish plan"
} = {}) {
  return {
    content_action_id: id,
    account_id: accountId,
    target_type: targetType,
    target_value: targetValue,
    content_type: contentType,
    approved_text: approvedText,
    publish_plan_status: publishPlanStatus,
    reason
  };
}

function quoted(value) {
  return `"${String(value).replace(/"/g, '""')}"`;
}

function planCsv(rows) {
  const headers = [
    "content_action_id",
    "account_id",
    "target_type",
    "target_value",
    "content_type",
    "approved_text",
    "publish_plan_status",
    "reason"
  ];

  return [
    headers.map(quoted).join(","),
    ...rows.map((row) => headers.map((header) => quoted(row[header] ?? "")).join(","))
  ].join("\n");
}

function makeBrowserDeps({
  loginResult = { result: "login_success" },
  inspection = { editorFound: true, publishButtonSeen: true },
  useDefaultInspection = false,
  pageUrl = "https://example.internal.portal/dashboard",
  loginEmailVisible = false,
  loginPasswordVisible = false,
  loginSubmitVisible = false,
  loggedInUiVisible = false,
  visibleEditorInitially = false,
  composerOpenerVisible = false,
  composerOpenerEnabled = true,
  editorVisibleAfterComposerClick = false,
  publishButtonVisible = false,
  gotoError = null,
  calls = {}
} = {}) {
  calls.launch = 0;
  calls.login = 0;
  calls.setDefaultTimeoutValues = [];
  calls.goto = 0;
  calls.inspect = 0;
  calls.composerOpenerClick = 0;
  calls.publishButtonClick = 0;
  calls.fill = 0;

  const state = {
    composerOpened: false
  };

  function locatorFor(selector) {
    const isEmail = selector.includes('input[type="email"]');
    const isPassword = selector.includes('input[type="password"]');
    const isSubmit = selector.includes('button[type="submit"]');
    const isEditor =
      selector === "textarea" ||
      selector === '[contenteditable="true"]' ||
      selector === '[role="textbox"]';
    const isComposerOpener =
      selector.includes("Write something") ||
      selector.includes("Create post") ||
      selector.includes("Start a post") ||
      selector.includes("What's on your mind");
    const isPublishButton =
      selector.includes('has-text("Publish")') ||
      selector.includes('has-text("Post")') ||
      selector.includes('has-text("Send")') ||
      selector.includes('has-text("Comment")') ||
      selector.includes('has-text("Opublikuj")') ||
      selector.includes('has-text("Wy') ||
      selector.includes('has-text("Skomentuj")');
    const isLoggedInUi =
      selector.includes("/logout") ||
      selector.includes("/home") ||
      selector.includes("/profile") ||
      selector.includes("/account") ||
      selector.includes("profile") ||
      selector.includes("profil") ||
      selector.includes("user");

    return {
      first() {
        return this;
      },
      async count() {
        if (isEmail) {
          return loginEmailVisible ? 1 : 0;
        }

        if (isPassword) {
          return loginPasswordVisible ? 1 : 0;
        }

        if (isSubmit) {
          return loginSubmitVisible ? 1 : 0;
        }

        if (isEditor) {
          return visibleEditorInitially || (state.composerOpened && editorVisibleAfterComposerClick) ? 1 : 0;
        }

        if (isComposerOpener) {
          return composerOpenerVisible && !state.composerOpened ? 1 : 0;
        }

        if (isPublishButton) {
          return publishButtonVisible ? 1 : 0;
        }

        if (isLoggedInUi) {
          return loggedInUiVisible ? 1 : 0;
        }

        return 0;
      },
      async isVisible() {
        return await this.count() > 0;
      },
      async isEnabled() {
        if (isComposerOpener) {
          return composerOpenerEnabled;
        }

        return true;
      },
      async scrollIntoViewIfNeeded() {},
      async click() {
        if (isComposerOpener) {
          calls.composerOpenerClick += 1;
          state.composerOpened = true;
          return;
        }

        if (isPublishButton) {
          calls.publishButtonClick += 1;
          throw new Error("dry-run must not click publish buttons");
        }

        throw new Error(`unexpected click for ${selector}`);
      }
    };
  }

  const page = {
    setDefaultTimeout(value) {
      calls.setDefaultTimeoutValues.push(value);
    },
    url() {
      return pageUrl;
    },
    async goto() {
      calls.goto += 1;
      if (gotoError) {
        throw gotoError;
      }
    },
    async waitForLoadState() {},
    async waitForTimeout() {},
    locator(selector) {
      return locatorFor(selector);
    },
    async close() {},
    async click() {
      calls.publishButtonClick += 1;
      throw new Error("dry-run must not click");
    },
    async fill() {
      calls.fill += 1;
      throw new Error("dry-run must not fill");
    }
  };
  const context = {
    async newPage() {
      return page;
    },
    async close() {}
  };
  const browser = {
    async newContext() {
      return context;
    },
    async close() {}
  };

  const deps = {
    async launchBrowser() {
      calls.launch += 1;
      return browser;
    },
    async loginAccount() {
      calls.login += 1;
      return loginResult;
    }
  };

  if (!useDefaultInspection) {
    deps.inspectContentSurface = async () => {
      calls.inspect += 1;
      return inspection;
    };
  }

  return {
    calls,
    deps
  };
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
  await runCase("only content_publish_planned records are sent to browser dry-run", async () => {
    const { deps, calls } = makeBrowserDeps();
    const result = await runContentBrowserDryRun({
      planRows: [
        planRow({ id: "ready" }),
        planRow({ id: "skipped", publishPlanStatus: "content_publish_skipped_not_approved" })
      ],
      accounts: [account()],
      config: config({ maxContentBrowserDryRunPerRun: 5, maxContentBrowserDryRunPerAccount: 5 }),
      userConfirmation: "YES",
      dependencies: deps
    });

    assert.equal(calls.launch, 1);
    assert.equal(calls.goto, 1);
    assert.equal(result.rows[0].browser_dry_run_status, "content_browser_dry_run_skipped_not_planned");
    assert.equal(result.rows[1].browser_dry_run_status, "content_browser_dry_run_editor_found");
    assert.equal(result.summary.skippedNotPlannedCount, 1);
    assert.equal(result.summary.editorFoundCount, 1);
  });

  await runCase("non planned records are described as skipped", async () => {
    const { deps, calls } = makeBrowserDeps();
    const result = await runContentBrowserDryRun({
      planRows: [
        planRow({ id: "rejected", publishPlanStatus: "content_publish_skipped_not_approved" }),
        planRow({ id: "limited", publishPlanStatus: "content_publish_skipped_limit_reached" })
      ],
      accounts: [account()],
      config: config(),
      userConfirmation: "YES",
      dependencies: deps
    });

    assert.equal(calls.launch, 0);
    assert.deepEqual(
      result.rows.map((row) => row.browser_dry_run_status),
      [
        "content_browser_dry_run_skipped_not_planned",
        "content_browser_dry_run_skipped_not_planned"
      ]
    );
    assert.equal(result.summary.skippedNotPlannedCount, 2);
  });

  await runCase("maxContentBrowserDryRunPerRun limit is applied", async () => {
    const { deps, calls } = makeBrowserDeps();
    const result = await runContentBrowserDryRun({
      planRows: [
        planRow({ id: "content-001", accountId: "acc-001" }),
        planRow({ id: "content-002", accountId: "acc-002" })
      ],
      accounts: [account("acc-001"), account("acc-002")],
      config: config({ maxContentBrowserDryRunPerRun: 1, maxContentBrowserDryRunPerAccount: 5 }),
      userConfirmation: "YES",
      dependencies: deps
    });

    assert.equal(calls.goto, 1);
    assert.equal(result.summary.skippedLimitReachedCount, 1);
    assert.equal(
      result.rows.find((row) => row.content_action_id === "content-002").browser_dry_run_status,
      "content_browser_dry_run_skipped_limit_reached"
    );
  });

  await runCase("maxContentBrowserDryRunPerAccount limit is applied", async () => {
    const { deps, calls } = makeBrowserDeps();
    const result = await runContentBrowserDryRun({
      planRows: [
        planRow({ id: "content-001", accountId: "acc-001" }),
        planRow({ id: "content-002", accountId: "acc-001", targetValue: "https://example.internal.portal/profile/456" })
      ],
      accounts: [account("acc-001")],
      config: config({ maxContentBrowserDryRunPerRun: 5, maxContentBrowserDryRunPerAccount: 1 }),
      userConfirmation: "YES",
      dependencies: deps
    });

    assert.equal(calls.goto, 1);
    assert.equal(result.summary.skippedLimitReachedCount, 1);
    assert.equal(
      result.rows.find((row) => row.content_action_id === "content-002").browser_dry_run_status,
      "content_browser_dry_run_skipped_limit_reached"
    );
  });

  await runCase("browser is blocked without exact YES confirmation", async () => {
    const { deps, calls } = makeBrowserDeps();
    const result = await runContentBrowserDryRun({
      planRows: [planRow()],
      accounts: [account()],
      config: config(),
      userConfirmation: "yes",
      dependencies: deps
    });

    assert.equal(calls.launch, 0);
    assert.equal(calls.login, 0);
    assert.equal(calls.goto, 0);
    assert.equal(result.summary.browserStarted, false);
    assert.equal(result.rows[0].browser_dry_run_status, "content_browser_dry_run_blocked_by_user_confirmation");
  });

  await runCase("toast missing but authenticated page state continues to target", async () => {
    const { deps, calls } = makeBrowserDeps({
      loginResult: {
        result: "login_failed",
        details: "Login result toast not detected: page.waitForFunction: Timeout 30000ms exceeded."
      },
      pageUrl: "https://example.internal.portal/home"
    });
    const result = await runContentBrowserDryRun({
      planRows: [planRow()],
      accounts: [account()],
      config: config(),
      userConfirmation: "YES",
      dependencies: deps
    });

    assert.equal(calls.login, 1);
    assert.deepEqual(calls.setDefaultTimeoutValues.slice(0, 3), [30000, 8000, 30000]);
    assert.equal(calls.goto, 1);
    assert.equal(calls.inspect, 1);
    assert.equal(result.summary.loginFailedCount, 0);
    assert.equal(result.summary.loginRecoveredAfterStateCheckCount, 1);
    assert.equal(result.rows[0].browser_dry_run_status, "content_browser_dry_run_editor_found");
    assert.match(result.rows[0].reason, /login_toast_missing_or_delayed/);
    assert.match(result.rows[0].reason, /login_state_checked/);
    assert.match(result.rows[0].reason, /login_assumed_success_after_state_check/);
  });

  await runCase("real login failure after toast timeout stops before target navigation", async () => {
    const { deps, calls } = makeBrowserDeps({
      loginResult: {
        result: "login_failed",
        details: "Login result toast not detected: page.waitForFunction: Timeout 30000ms exceeded."
      },
      pageUrl: "https://example.internal.portal/login",
      loginEmailVisible: true,
      loginPasswordVisible: true,
      loginSubmitVisible: true
    });
    const result = await runContentBrowserDryRun({
      planRows: [planRow()],
      accounts: [account()],
      config: config(),
      userConfirmation: "YES",
      dependencies: deps
    });

    assert.equal(calls.login, 1);
    assert.equal(calls.goto, 0);
    assert.equal(calls.inspect, 0);
    assert.equal(result.summary.loginFailedCount, 1);
    assert.equal(result.summary.loginRecoveredAfterStateCheckCount, 0);
    assert.equal(result.rows[0].browser_dry_run_status, "content_browser_dry_run_login_failed");
    assert.match(result.rows[0].reason, /login_still_required/);
  });

  await runCase("visible editor found without composer click still passes", async () => {
    const { deps, calls } = makeBrowserDeps({
      useDefaultInspection: true,
      visibleEditorInitially: true,
      composerOpenerVisible: true
    });
    const result = await runContentBrowserDryRun({
      planRows: [planRow()],
      accounts: [account()],
      config: config(),
      userConfirmation: "YES",
      dependencies: deps
    });

    assert.equal(calls.goto, 1);
    assert.equal(calls.composerOpenerClick, 0);
    assert.equal(result.summary.editorFoundCount, 1);
    assert.equal(result.rows[0].browser_dry_run_status, "content_browser_dry_run_editor_found");
    assert.match(result.rows[0].reason, /visible_editor_candidate_found_without_clicking/);
  });

  await runCase("write something opener can open editor in dry-run", async () => {
    const { deps, calls } = makeBrowserDeps({
      useDefaultInspection: true,
      composerOpenerVisible: true,
      editorVisibleAfterComposerClick: true
    });
    const result = await runContentBrowserDryRun({
      planRows: [planRow()],
      accounts: [account()],
      config: config(),
      userConfirmation: "YES",
      dependencies: deps
    });

    assert.equal(calls.goto, 1);
    assert.equal(calls.composerOpenerClick, 1);
    assert.equal(calls.fill, 0);
    assert.equal(calls.publishButtonClick, 0);
    assert.equal(result.summary.editorFoundCount, 1);
    assert.equal(result.rows[0].browser_dry_run_status, "content_browser_dry_run_editor_found");
    assert.match(result.rows[0].reason, /composer_opener_found=write_something_button/);
    assert.match(result.rows[0].reason, /composer_opener_clicked=write_something_button/);
    assert.match(result.rows[0].reason, /editor_found_after_composer_click/);
  });

  await runCase("composer opener click without editor fails safely", async () => {
    const { deps, calls } = makeBrowserDeps({
      useDefaultInspection: true,
      composerOpenerVisible: true,
      editorVisibleAfterComposerClick: false
    });
    const result = await runContentBrowserDryRun({
      planRows: [planRow()],
      accounts: [account()],
      config: config(),
      userConfirmation: "YES",
      dependencies: deps
    });

    assert.equal(calls.goto, 1);
    assert.equal(calls.composerOpenerClick, 1);
    assert.equal(calls.fill, 0);
    assert.equal(calls.publishButtonClick, 0);
    assert.equal(result.summary.editorNotFoundCount, 1);
    assert.equal(result.rows[0].browser_dry_run_status, "content_browser_dry_run_editor_not_found");
    assert.match(result.rows[0].reason, /composer_opener_clicked_but_editor_not_found/);
  });

  await runCase("no editor and no composer opener fails safely", async () => {
    const { deps, calls } = makeBrowserDeps({
      useDefaultInspection: true,
      composerOpenerVisible: false
    });
    const result = await runContentBrowserDryRun({
      planRows: [planRow()],
      accounts: [account()],
      config: config(),
      userConfirmation: "YES",
      dependencies: deps
    });

    assert.equal(calls.goto, 1);
    assert.equal(calls.composerOpenerClick, 0);
    assert.equal(calls.fill, 0);
    assert.equal(calls.publishButtonClick, 0);
    assert.equal(result.summary.editorNotFoundCount, 1);
    assert.equal(result.rows[0].browser_dry_run_status, "content_browser_dry_run_editor_not_found");
    assert.match(result.rows[0].reason, /composer_opener_not_found/);
    assert.match(result.rows[0].reason, /visible_editor_candidate_not_found/);
  });

  await runCase("browser dry-run CSV is generated without approved_text", async () => {
    const dir = tempWorkspace();
    try {
      const { deps } = makeBrowserDeps();
      const result = await runContentBrowserDryRun({
        planRows: [planRow({ approvedText: "SECRET APPROVED TEXT" })],
        accounts: [account()],
        config: config(),
        userConfirmation: "YES",
        dependencies: deps
      });
      const outputPath = exportContentBrowserDryRun(
        result.rows,
        new Date("2026-05-27T12:13:14"),
        path.join(dir, "dry-run")
      );
      const outputText = fs.readFileSync(outputPath, "utf8");

      assert.equal(path.basename(outputPath), "content-browser-dry-run-20260527-121314.csv");
      assert.match(outputText, /"browser_dry_run_status"/);
      assert.match(outputText, /"dry_run_only"/);
      assert.match(outputText, /"true"/);
      assert.doesNotMatch(outputText, /approved_text|SECRET APPROVED TEXT/);
    } finally {
      cleanup(dir);
    }
  });

  await runCase("login and target errors get safe statuses", async () => {
    const loginDeps = makeBrowserDeps({
      loginResult: { result: "login_failed", details: "bad credentials" }
    });
    const loginResult = await runContentBrowserDryRun({
      planRows: [planRow()],
      accounts: [account()],
      config: config(),
      userConfirmation: "YES",
      dependencies: loginDeps.deps
    });

    assert.equal(loginResult.rows[0].browser_dry_run_status, "content_browser_dry_run_login_failed");

    const targetDeps = makeBrowserDeps({ gotoError: new Error("navigation failed") });
    const targetResult = await runContentBrowserDryRun({
      planRows: [planRow()],
      accounts: [account()],
      config: config(),
      userConfirmation: "YES",
      dependencies: targetDeps.deps
    });

    assert.equal(targetResult.rows[0].browser_dry_run_status, "content_browser_dry_run_target_failed");
  });

  await runCase("invalid records are not sent to browser", async () => {
    const { deps, calls } = makeBrowserDeps();
    const result = await runContentBrowserDryRun({
      planRows: [
        planRow({ id: "", targetType: "manual", targetValue: "manual-place" })
      ],
      accounts: [account()],
      config: config(),
      userConfirmation: "YES",
      dependencies: deps
    });

    assert.equal(calls.launch, 0);
    assert.equal(result.rows[0].browser_dry_run_status, "content_browser_dry_run_invalid_record");
    assert.match(result.rows[0].reason, /content_action_id is required/);
    assert.match(result.rows[0].reason, /manual is not supported/);
  });

  await runCase("latest content publish plan file can be selected and read", async () => {
    const dir = tempWorkspace();
    try {
      const older = writeFile(
        dir,
        "content-publish-plan-20260527-111111.csv",
        planCsv([planRow({ id: "older" })])
      );
      const newer = writeFile(
        dir,
        "content-publish-plan-20260527-121212.csv",
        planCsv([planRow({ id: "newer" })])
      );
      const olderDate = new Date("2026-05-27T11:11:11").getTime() / 1000;
      const newerDate = new Date("2026-05-27T12:12:12").getTime() / 1000;

      fs.utimesSync(older, olderDate, olderDate);
      fs.utimesSync(newer, newerDate, newerDate);

      assert.equal(findLatestContentPublishPlanFile(dir), newer);
      assert.equal(readContentPublishPlanFile(newer)[0].content_action_id, "newer");
    } finally {
      cleanup(dir);
    }
  });

  await runCase("dry-run code does not type, paste, click submit, or publish content", async () => {
    const { deps, calls } = makeBrowserDeps();
    const result = await runContentBrowserDryRun({
      planRows: [planRow({ approvedText: "DO NOT TYPE THIS" })],
      accounts: [account()],
      config: config(),
      userConfirmation: "YES",
      dependencies: deps
    });
    const source = fs.readFileSync(
      path.join(__dirname, "..", "src", "content", "contentBrowserDryRun.ts"),
      "utf8"
    );

    assert.equal(result.rows[0].dry_run_only, true);
    assert.equal(calls.fill, 0);
    assert.equal(calls.publishButtonClick, 0);
    assert.doesNotMatch(source, /\.(fill|type|press|pressSequentially)\s*\(/);
    assert.doesNotMatch(source, /approved_text|approved_title|FINAL_PUBLISH_YES|PUBLISH_CONTENT_YES/);
  });

  console.log("content browser dry-run tests passed");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
