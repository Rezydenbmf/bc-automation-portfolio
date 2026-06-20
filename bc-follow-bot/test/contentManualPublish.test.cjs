const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
  buildContentManualPublishPreview,
  exportContentManualPublishResults,
  findLatestContentPublishPlanFile,
  readContentPublishPlanFile,
  runContentManualPublish
} = require("../dist/content/contentManualPublish.js");

function tempWorkspace() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "bc-follow-bot-content-manual-publish-"));
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
    maxContentManualPublishesPerRun: 1,
    maxContentManualPublishesPerAccount: 1,
    maxContentTitleLength: 120,
    requireFinalManualConfirmBeforePublish: true,
    ...extra
  };
}

function planRow({
  id = "content-001",
  accountId = "acc-001",
  targetType = "profile_url",
  targetValue = "https://example.internal.portal/profile/123",
  contentType = "comment",
  approvedText = "Manual approved text.",
  approvedTitle = "",
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
    approved_title: approvedTitle,
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
    "approved_title",
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
  preparation = { editorFound: true, publishButtonSeen: true },
  pageUrl = "https://example.internal.portal/dashboard",
  loginEmailVisible = false,
  loginPasswordVisible = false,
  gotoError = null,
  prepareError = null,
  clickError = null,
  publishResult = { status: "content_publish_success", note: "safe_success_signal_detected" },
  calls = {}
} = {}) {
  calls.launch = 0;
  calls.login = 0;
  calls.setDefaultTimeoutValues = [];
  calls.goto = 0;
  calls.gotoTargetValues = [];
  calls.prepare = 0;
  calls.clickPublish = 0;
  calls.approvedTextValues = [];
  calls.approvedTitleValues = [];

  function locatorFor(selector) {
    const isEmail = selector.includes('input[type="email"]');
    const isPassword = selector.includes('input[type="password"]');

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

        return 0;
      },
      async isVisible() {
        return await this.count() > 0;
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
    async goto(targetValue) {
      calls.goto += 1;
      calls.gotoTargetValues.push(targetValue);
      if (gotoError) {
        throw gotoError;
      }
    },
    async waitForLoadState() {},
    locator(selector) {
      return locatorFor(selector);
    },
    async close() {}
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

  return {
    calls,
    deps: {
      async launchBrowser() {
        calls.launch += 1;
        return browser;
      },
      async loginAccount() {
        calls.login += 1;
        return loginResult;
      },
      async prepareContentForPublish(_page, _contentType, approvedText, approvedTitle) {
        calls.prepare += 1;
        calls.approvedTextValues.push(approvedText);
        calls.approvedTitleValues.push(approvedTitle);
        if (prepareError) {
          throw prepareError;
        }
        return preparation;
      },
      async clickPublishSubmit() {
        calls.clickPublish += 1;
        if (clickError) {
          throw clickError;
        }
        return publishResult;
      },
      now() {
        return new Date("2026-05-29T10:11:12.000Z");
      }
    }
  };
}

function makePostComposerDeps({
  profileTriggerVisible = false,
  profileTriggerSelector = 'section:has-text("New Post") textarea[placeholder="Write something..."]',
  composerTriggerVisible = true,
  composerTriggerSelector = 'button:has-text("Create post")',
  initialModalVisible = false,
  modalBodySelector = '[role="dialog"]:has-text("Add new post") textarea[placeholder="Write something"]',
  titleFieldVisible = false,
  addPostButtonEnabled = true,
  searchFieldVisible = false,
  searchFieldSelector = 'input[placeholder*="Search"]',
  calls = {}
} = {}) {
  calls.launch = 0;
  calls.login = 0;
  calls.setDefaultTimeoutValues = [];
  calls.goto = 0;
  calls.profileTriggerClick = 0;
  calls.profileTriggerSelectors = [];
  calls.composerTriggerClick = 0;
  calls.composerTriggerSelectors = [];
  calls.editorFill = 0;
  calls.editorSelectors = [];
  calls.titleFill = 0;
  calls.clickPublish = 0;
  calls.filledTextValues = [];
  calls.filledTitleValues = [];

  const state = {
    currentUrl: "https://example.internal.portal/dashboard",
    modalVisible: initialModalVisible,
    addPostButtonVisible: initialModalVisible,
    composerTriggerVisible,
    profileTriggerVisible,
    titleFieldVisible,
    addPostButtonEnabled,
    searchFieldVisible
  };

  function selectorKind(selector) {
    if (selector === profileTriggerSelector) {
      return "profileTrigger";
    }

    if (selector === composerTriggerSelector) {
      return "composerTrigger";
    }

    if (selector === searchFieldSelector) {
      return "searchField";
    }

    if (
      selector === '[role="dialog"]:has-text("Add new post")' ||
      selector === 'dialog:has-text("Add new post")' ||
      selector === 'div:has-text("Add new post")'
    ) {
      return "modal";
    }

    if (selector === modalBodySelector) {
      return "modalBodyEditor";
    }

    if (selector.includes('has-text("Add new post")') && selector.includes("Write something")) {
      return "modalBodyEditor";
    }

    if (selector.includes('has-text("Add new post")') && selector.includes('placeholder="Title"')) {
      return "titleField";
    }

    if (selector.includes('has-text("Add new post")') && selector.includes('has-text("Add post")')) {
      return "publishButton";
    }

    return "other";
  }

  function locatorFor(selector) {
    const kind = selectorKind(selector);

    return {
      first() {
        return this;
      },
      async count() {
        if (kind === "profileTrigger") {
          return state.profileTriggerVisible && !state.modalVisible ? 1 : 0;
        }

        if (kind === "composerTrigger") {
          return state.composerTriggerVisible && !state.modalVisible ? 1 : 0;
        }

        if (kind === "modal") {
          return state.modalVisible ? 1 : 0;
        }

        if (kind === "modalBodyEditor") {
          return state.modalVisible ? 1 : 0;
        }

        if (kind === "titleField") {
          return state.modalVisible && state.titleFieldVisible ? 1 : 0;
        }

        if (kind === "searchField") {
          return state.searchFieldVisible ? 1 : 0;
        }

        if (kind === "publishButton") {
          return state.addPostButtonVisible ? 1 : 0;
        }

        return 0;
      },
      async isVisible() {
        return await this.count() > 0;
      },
      async isEnabled() {
        if (kind === "publishButton") {
          return state.addPostButtonEnabled;
        }

        return kind === "profileTrigger" || kind === "composerTrigger" || kind === "modalBodyEditor" ||
          kind === "titleField";
      },
      async isEditable() {
        return (kind === "modalBodyEditor" || kind === "titleField") && state.modalVisible;
      },
      async scrollIntoViewIfNeeded() {},
      async click() {
        if (kind === "profileTrigger") {
          calls.profileTriggerClick += 1;
          calls.profileTriggerSelectors.push(selector);
          state.modalVisible = true;
          state.addPostButtonVisible = true;
          return;
        }

        if (kind === "composerTrigger") {
          calls.composerTriggerClick += 1;
          calls.composerTriggerSelectors.push(selector);
          state.modalVisible = true;
          state.addPostButtonVisible = true;
          return;
        }

        if (kind === "modalBodyEditor" || kind === "titleField") {
          return;
        }

        throw new Error(`unexpected click for ${selector}`);
      },
      async fill(value) {
        if (kind === "titleField") {
          calls.titleFill += 1;
          calls.filledTitleValues.push(value);
          return;
        }

        if (kind !== "modalBodyEditor") {
          throw new Error(`unexpected fill for ${selector}`);
        }

        calls.editorFill += 1;
        calls.editorSelectors.push(selector);
        calls.filledTextValues.push(value);
      }
    };
  }

  const page = {
    setDefaultTimeout(value) {
      calls.setDefaultTimeoutValues.push(value);
    },
    url() {
      return state.currentUrl;
    },
    async goto(targetValue) {
      calls.goto += 1;
      state.currentUrl = targetValue;
    },
    async waitForLoadState() {},
    async waitForTimeout() {},
    locator(selector) {
      return locatorFor(selector);
    },
    async close() {}
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

  return {
    calls,
    deps: {
      async launchBrowser() {
        calls.launch += 1;
        return browser;
      },
      async loginAccount() {
        calls.login += 1;
        return { result: "login_success" };
      },
      async clickPublishSubmit() {
        calls.clickPublish += 1;
        return { status: "content_publish_success", note: "post_modal_closed_after_submit" };
      },
      now() {
        return new Date("2026-05-29T10:11:12.000Z");
      }
    }
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
  await runCase("only content_publish_planned records are sent to manual publish", async () => {
    const { deps, calls } = makeBrowserDeps();
    const result = await runContentManualPublish({
      planRows: [
        planRow({ id: "ready" }),
        planRow({ id: "skipped", publishPlanStatus: "content_publish_skipped_not_approved" })
      ],
      accounts: [account()],
      config: config({ maxContentManualPublishesPerRun: 5, maxContentManualPublishesPerAccount: 5 }),
      initialConfirmation: "PUBLISH_CONTENT_YES",
      finalConfirmation: async () => "FINAL_PUBLISH_YES",
      dependencies: deps
    });

    assert.equal(calls.launch, 1);
    assert.equal(calls.goto, 1);
    assert.deepEqual(calls.gotoTargetValues, ["https://example.internal.portal/profile/123"]);
    assert.equal(calls.prepare, 1);
    assert.equal(calls.clickPublish, 1);
    assert.equal(result.rows[0].publish_status, "content_publish_skipped_not_planned");
    assert.equal(result.rows[1].publish_status, "content_publish_success");
    assert.match(result.rows[1].result_note, /target_navigation_started/);
    assert.match(result.rows[1].result_note, /target_navigation_finished/);
    assert.equal(result.summary.skippedNotPlannedCount, 1);
    assert.equal(result.summary.publishSuccessCount, 1);
  });

  await runCase("manual publish continues after login toast timeout when page is past login screen", async () => {
    const { deps, calls } = makeBrowserDeps({
      loginResult: {
        result: "login_failed",
        details: "Login result toast not detected: timeout"
      },
      pageUrl: "https://example.internal.portal/home"
    });
    const result = await runContentManualPublish({
      planRows: [planRow()],
      accounts: [account()],
      config: config(),
      initialConfirmation: "PUBLISH_CONTENT_YES",
      finalConfirmation: async () => "FINAL_PUBLISH_YES",
      dependencies: deps
    });

    assert.equal(calls.login, 1);
    assert.deepEqual(calls.setDefaultTimeoutValues.slice(0, 3), [30000, 8000, 30000]);
    assert.equal(calls.goto, 1);
    assert.deepEqual(calls.gotoTargetValues, ["https://example.internal.portal/profile/123"]);
    assert.equal(calls.prepare, 1);
    assert.equal(calls.clickPublish, 1);
    assert.equal(result.summary.loginFailedCount, 0);
    assert.equal(result.rows[0].publish_status, "content_publish_success");
    assert.match(result.rows[0].result_note, /login_toast_timeout/);
    assert.match(result.rows[0].result_note, /login_state_checked/);
    assert.match(result.rows[0].result_note, /login_assumed_success_after_state_check/);
    assert.doesNotMatch(result.rows[0].result_note, /https:\/\/example\.internal\.portal\/profile\/123/);
  });

  await runCase("manual publish fails login after toast timeout when credentials are still required", async () => {
    const { deps, calls } = makeBrowserDeps({
      loginResult: {
        result: "login_failed",
        details: "Login result toast not detected: timeout"
      },
      pageUrl: "https://example.internal.portal/login",
      loginEmailVisible: true,
      loginPasswordVisible: true
    });
    const result = await runContentManualPublish({
      planRows: [planRow()],
      accounts: [account()],
      config: config(),
      initialConfirmation: "PUBLISH_CONTENT_YES",
      finalConfirmation: async () => "FINAL_PUBLISH_YES",
      dependencies: deps
    });

    assert.equal(calls.login, 1);
    assert.equal(calls.goto, 0);
    assert.equal(calls.prepare, 0);
    assert.equal(calls.clickPublish, 0);
    assert.equal(result.summary.loginFailedCount, 1);
    assert.equal(result.rows[0].publish_status, "content_publish_login_failed");
    assert.match(result.rows[0].result_note, /login_toast_timeout/);
    assert.match(result.rows[0].result_note, /login_state_checked/);
    assert.match(result.rows[0].result_note, /login_still_required/);
    assert.doesNotMatch(result.rows[0].result_note, /https:\/\/example\.internal\.portal\/profile\/123/);
    assert.doesNotMatch(result.rows[0].result_note, /Manual approved text/);
  });

  await runCase("browser is blocked without exact PUBLISH_CONTENT_YES", async () => {
    const { deps, calls } = makeBrowserDeps();
    const result = await runContentManualPublish({
      planRows: [planRow()],
      accounts: [account()],
      config: config(),
      initialConfirmation: "YES",
      finalConfirmation: async () => "FINAL_PUBLISH_YES",
      dependencies: deps
    });

    assert.equal(calls.launch, 0);
    assert.equal(calls.login, 0);
    assert.equal(calls.prepare, 0);
    assert.equal(calls.clickPublish, 0);
    assert.equal(result.summary.browserStarted, false);
    assert.equal(result.rows[0].publish_status, "content_publish_blocked_by_initial_confirmation");
  });

  await runCase("publish click is blocked without exact FINAL_PUBLISH_YES", async () => {
    const { deps, calls } = makeBrowserDeps();
    const result = await runContentManualPublish({
      planRows: [planRow({ approvedText: "TEXT ENTERED BEFORE FINAL GATE" })],
      accounts: [account()],
      config: config(),
      initialConfirmation: "PUBLISH_CONTENT_YES",
      finalConfirmation: async () => "no",
      dependencies: deps
    });

    assert.equal(calls.launch, 1);
    assert.equal(calls.prepare, 1);
    assert.deepEqual(calls.approvedTextValues, ["TEXT ENTERED BEFORE FINAL GATE"]);
    assert.equal(calls.clickPublish, 0);
    assert.equal(result.rows[0].publish_status, "content_publish_blocked_by_final_confirmation");
    assert.equal(result.rows[0].manual_confirmed, true);
    assert.equal(result.rows[0].final_confirmed, false);
  });

  await runCase("missing final confirmation is blocked in row summary and CSV", async () => {
    const dir = tempWorkspace();
    try {
      const { deps, calls } = makeBrowserDeps();
      const result = await runContentManualPublish({
        planRows: [planRow()],
        accounts: [account()],
        config: config(),
        initialConfirmation: "PUBLISH_CONTENT_YES",
        finalConfirmation: async () => "no",
        dependencies: deps
      });
      const outputPath = exportContentManualPublishResults(
        result.rows,
        new Date("2026-05-29T12:13:15"),
        path.join(dir, "publish-results")
      );
      const outputText = fs.readFileSync(outputPath, "utf8");

      assert.equal(calls.clickPublish, 0);
      assert.equal(result.rows[0].publish_status, "content_publish_blocked_by_final_confirmation");
      assert.equal(result.rows[0].manual_confirmed, true);
      assert.equal(result.rows[0].final_confirmed, false);
      assert.equal(result.summary.blockedByFinalConfirmationCount, 1);
      assert.equal(result.summary.publishSuccessCount, 0);
      assert.equal(result.summary.publishFailedCount, 0);
      assert.match(outputText, /"content_publish_blocked_by_final_confirmation"/);
      assert.doesNotMatch(outputText, /"content_publish_success"/);
      assert.doesNotMatch(outputText, /"content_publish_failed"/);
    } finally {
      cleanup(dir);
    }
  });

  await runCase("final confirmation plus successful publish is success in row summary and CSV", async () => {
    const dir = tempWorkspace();
    try {
      const { deps, calls } = makeBrowserDeps({
        publishResult: { status: "content_publish_success", note: "safe_success_signal_detected" }
      });
      const result = await runContentManualPublish({
        planRows: [planRow()],
        accounts: [account()],
        config: config(),
        initialConfirmation: "PUBLISH_CONTENT_YES",
        finalConfirmation: async () => "FINAL_PUBLISH_YES",
        dependencies: deps
      });
      const outputPath = exportContentManualPublishResults(
        result.rows,
        new Date("2026-05-29T12:13:16"),
        path.join(dir, "publish-results")
      );
      const outputText = fs.readFileSync(outputPath, "utf8");

      assert.equal(calls.clickPublish, 1);
      assert.equal(result.rows[0].publish_status, "content_publish_success");
      assert.equal(result.rows[0].manual_confirmed, true);
      assert.equal(result.rows[0].final_confirmed, true);
      assert.equal(result.rows[0].dry_run_only, false);
      assert.equal(result.rows[0].published_at, "2026-05-29T10:11:12.000Z");
      assert.equal(result.summary.blockedByFinalConfirmationCount, 0);
      assert.equal(result.summary.publishSuccessCount, 1);
      assert.equal(result.summary.publishFailedCount, 0);
      assert.match(outputText, /"content_publish_success"/);
      assert.doesNotMatch(outputText, /"content_publish_blocked_by_final_confirmation"/);
      assert.doesNotMatch(outputText, /"content_publish_failed"/);
    } finally {
      cleanup(dir);
    }
  });

  await runCase("publish failure after final confirmation is failed not blocked", async () => {
    const dir = tempWorkspace();
    try {
      const { deps, calls } = makeBrowserDeps({
        clickError: new Error("submit failed after click request")
      });
      const result = await runContentManualPublish({
        planRows: [planRow()],
        accounts: [account()],
        config: config(),
        initialConfirmation: "PUBLISH_CONTENT_YES",
        finalConfirmation: async () => "FINAL_PUBLISH_YES",
        dependencies: deps
      });
      const outputPath = exportContentManualPublishResults(
        result.rows,
        new Date("2026-05-29T12:13:17"),
        path.join(dir, "publish-results")
      );
      const outputText = fs.readFileSync(outputPath, "utf8");

      assert.equal(calls.clickPublish, 1);
      assert.equal(result.rows[0].publish_status, "content_publish_failed");
      assert.equal(result.rows[0].manual_confirmed, true);
      assert.equal(result.rows[0].final_confirmed, true);
      assert.equal(result.summary.blockedByFinalConfirmationCount, 0);
      assert.equal(result.summary.publishSuccessCount, 0);
      assert.equal(result.summary.publishFailedCount, 1);
      assert.match(result.rows[0].result_note, /publish click failed/);
      assert.match(outputText, /"content_publish_failed"/);
      assert.doesNotMatch(outputText, /"content_publish_blocked_by_final_confirmation"/);
      assert.doesNotMatch(outputText, /"content_publish_success"/);
    } finally {
      cleanup(dir);
    }
  });

  await runCase("post publish opens composer before filling editor", async () => {
    const { deps, calls } = makePostComposerDeps();
    const result = await runContentManualPublish({
      planRows: [planRow({ contentType: "post" })],
      accounts: [account()],
      config: config(),
      initialConfirmation: "PUBLISH_CONTENT_YES",
      finalConfirmation: async () => "FINAL_PUBLISH_YES",
      dependencies: deps
    });

    assert.equal(calls.goto, 1);
    assert.equal(calls.composerTriggerClick, 1);
    assert.equal(calls.editorFill, 1);
    assert.deepEqual(calls.filledTextValues, ["Manual approved text."]);
    assert.equal(calls.clickPublish, 1);
    assert.equal(result.rows[0].publish_status, "content_publish_success");
  });

  await runCase("post publish opens Add new post modal from visible Write something trigger", async () => {
    const profileTriggerSelector = 'section:has-text("New Post") textarea[placeholder="Write something..."]';
    const modalBodySelector = '[role="dialog"]:has-text("Add new post") textarea[placeholder="Write something"]';
    const { deps, calls } = makePostComposerDeps({
      profileTriggerVisible: true,
      profileTriggerSelector,
      modalBodySelector
    });
    const result = await runContentManualPublish({
      planRows: [planRow({ contentType: "post" })],
      accounts: [account()],
      config: config(),
      initialConfirmation: "PUBLISH_CONTENT_YES",
      finalConfirmation: async () => "FINAL_PUBLISH_YES",
      dependencies: deps
    });

    assert.equal(calls.goto, 1);
    assert.equal(calls.profileTriggerClick, 1);
    assert.deepEqual(calls.profileTriggerSelectors, [profileTriggerSelector]);
    assert.equal(calls.composerTriggerClick, 0);
    assert.equal(calls.editorFill, 1);
    assert.equal(calls.titleFill, 0);
    assert.deepEqual(calls.editorSelectors, [modalBodySelector]);
    assert.equal(calls.clickPublish, 1);
    assert.equal(result.rows[0].publish_status, "content_publish_success");
    assert.match(result.rows[0].result_note, /profile_write_something_trigger_clicked/);
    assert.match(result.rows[0].result_note, /add_new_post_modal_opened/);
    assert.match(result.rows[0].result_note, /modal_body_editor_found=modal_write_something_textarea/);
    assert.match(result.rows[0].result_note, /modal_body_filled/);
    assert.match(result.rows[0].result_note, /add_post_button_found/);
    assert.match(result.rows[0].result_note, /selected_editor_candidate=modal_write_something_textarea/);
    assert.doesNotMatch(result.rows[0].result_note, /post_composer_trigger_clicked/);
    assert.doesNotMatch(result.rows[0].result_note, /https:\/\/example\.internal\.portal\/profile\/123/);
    assert.doesNotMatch(result.rows[0].result_note, /Manual approved text/);
  });

  await runCase("post publish supports Write something button as modal trigger", async () => {
    const profileTriggerSelector = 'button:has-text("Write something...")';
    const modalBodySelector = '[role="dialog"]:has-text("Add new post") textarea[placeholder="Write something"]';
    const { deps, calls } = makePostComposerDeps({
      profileTriggerVisible: true,
      profileTriggerSelector,
      modalBodySelector
    });
    const result = await runContentManualPublish({
      planRows: [planRow({ contentType: "post" })],
      accounts: [account()],
      config: config(),
      initialConfirmation: "PUBLISH_CONTENT_YES",
      finalConfirmation: async () => "FINAL_PUBLISH_YES",
      dependencies: deps
    });

    assert.equal(calls.goto, 1);
    assert.equal(calls.profileTriggerClick, 1);
    assert.deepEqual(calls.profileTriggerSelectors, [profileTriggerSelector]);
    assert.equal(calls.editorFill, 1);
    assert.equal(calls.titleFill, 0);
    assert.deepEqual(calls.editorSelectors, [modalBodySelector]);
    assert.equal(calls.clickPublish, 1);
    assert.equal(result.rows[0].publish_status, "content_publish_success");
    assert.match(result.rows[0].result_note, /profile_write_something_button_found/);
    assert.match(result.rows[0].result_note, /profile_write_something_trigger_clicked/);
    assert.match(result.rows[0].result_note, /add_new_post_modal_opened/);
    assert.match(result.rows[0].result_note, /modal_body_filled/);
    assert.doesNotMatch(result.rows[0].result_note, /Manual approved text/);
  });

  await runCase("post publish fills approved_title when Title field exists", async () => {
    const { deps, calls } = makePostComposerDeps({
      profileTriggerVisible: true,
      titleFieldVisible: true
    });
    const result = await runContentManualPublish({
      planRows: [
        planRow({
          contentType: "post",
          approvedTitle: "Safe SEO title"
        })
      ],
      accounts: [account()],
      config: config(),
      initialConfirmation: "PUBLISH_CONTENT_YES",
      finalConfirmation: async () => "FINAL_PUBLISH_YES",
      dependencies: deps
    });

    assert.equal(calls.titleFill, 1);
    assert.deepEqual(calls.filledTitleValues, ["Safe SEO title"]);
    assert.equal(calls.editorFill, 1);
    assert.equal(calls.clickPublish, 1);
    assert.equal(result.rows[0].publish_status, "content_publish_success");
    assert.equal(result.rows[0].title_present, true);
    assert.equal(result.rows[0].title_length, "Safe SEO title".length);
    assert.equal(result.rows[0].title_field_seen, true);
    assert.equal(result.rows[0].title_filled, true);
    assert.equal(result.rows[0].title_reason, "title_filled");
    assert.match(result.rows[0].result_note, /title_filled/);
    assert.doesNotMatch(result.rows[0].result_note, /Safe SEO title/);
  });

  await runCase("post publish does not block when approved_title is empty", async () => {
    const { deps, calls } = makePostComposerDeps({
      profileTriggerVisible: true,
      titleFieldVisible: true
    });
    const result = await runContentManualPublish({
      planRows: [planRow({ contentType: "post", approvedTitle: "" })],
      accounts: [account()],
      config: config(),
      initialConfirmation: "PUBLISH_CONTENT_YES",
      finalConfirmation: async () => "FINAL_PUBLISH_YES",
      dependencies: deps
    });

    assert.equal(calls.titleFill, 0);
    assert.equal(calls.editorFill, 1);
    assert.equal(calls.clickPublish, 1);
    assert.equal(result.rows[0].publish_status, "content_publish_success");
    assert.equal(result.rows[0].title_present, false);
    assert.equal(result.rows[0].title_length, 0);
    assert.equal(result.rows[0].title_filled, false);
    assert.equal(result.rows[0].title_field_seen, false);
    assert.equal(result.rows[0].title_reason, "approved_title_empty");
  });

  await runCase("post publish does not block when approved_title exists but Title field is not found", async () => {
    const { deps, calls } = makePostComposerDeps({
      profileTriggerVisible: true,
      titleFieldVisible: false
    });
    const result = await runContentManualPublish({
      planRows: [
        planRow({
          contentType: "post",
          approvedTitle: "Safe SEO title"
        })
      ],
      accounts: [account()],
      config: config(),
      initialConfirmation: "PUBLISH_CONTENT_YES",
      finalConfirmation: async () => "FINAL_PUBLISH_YES",
      dependencies: deps
    });

    assert.equal(calls.titleFill, 0);
    assert.equal(calls.editorFill, 1);
    assert.equal(calls.clickPublish, 1);
    assert.equal(result.rows[0].publish_status, "content_publish_success");
    assert.equal(result.rows[0].title_present, true);
    assert.equal(result.rows[0].title_field_seen, false);
    assert.equal(result.rows[0].title_filled, false);
    assert.equal(result.rows[0].title_reason, "title_available_but_title_field_not_found");
    assert.match(result.rows[0].result_note, /title_available_but_title_field_not_found/);
    assert.doesNotMatch(result.rows[0].result_note, /Safe SEO title/);
  });

  await runCase("post publish reports missing title when modal Add post button is disabled", async () => {
    const { deps, calls } = makePostComposerDeps({
      profileTriggerVisible: true,
      titleFieldVisible: true,
      addPostButtonEnabled: false
    });
    const result = await runContentManualPublish({
      planRows: [planRow({ contentType: "post" })],
      accounts: [account()],
      config: config(),
      initialConfirmation: "PUBLISH_CONTENT_YES",
      finalConfirmation: async () => "FINAL_PUBLISH_YES",
      dependencies: deps
    });

    assert.equal(calls.profileTriggerClick, 1);
    assert.equal(calls.editorFill, 1);
    assert.equal(calls.titleFill, 0);
    assert.equal(calls.clickPublish, 0);
    assert.equal(result.rows[0].publish_status, "content_publish_failed");
    assert.match(result.rows[0].result_note, /modal_body_filled/);
    assert.match(result.rows[0].result_note, /add_post_button_found/);
    assert.match(result.rows[0].result_note, /add_post_button_disabled/);
    assert.match(result.rows[0].result_note, /title_required_but_missing/);
    assert.doesNotMatch(result.rows[0].result_note, /Manual approved text/);
  });

  await runCase("post publish modal body fill is blocked from submit without final confirmation", async () => {
    const { deps, calls } = makePostComposerDeps({
      profileTriggerVisible: true
    });
    const result = await runContentManualPublish({
      planRows: [planRow({ contentType: "post" })],
      accounts: [account()],
      config: config(),
      initialConfirmation: "PUBLISH_CONTENT_YES",
      finalConfirmation: async () => "no",
      dependencies: deps
    });

    assert.equal(calls.profileTriggerClick, 1);
    assert.equal(calls.editorFill, 1);
    assert.equal(calls.clickPublish, 0);
    assert.equal(result.rows[0].publish_status, "content_publish_blocked_by_final_confirmation");
    assert.match(result.rows[0].result_note, /modal_body_filled/);
    assert.match(result.rows[0].result_note, /user did not type exactly FINAL_PUBLISH_YES/);
    assert.doesNotMatch(result.rows[0].result_note, /Manual approved text/);
  });

  await runCase("post publish skips global search field instead of using broad input fallback", async () => {
    const { deps, calls } = makePostComposerDeps({
      composerTriggerVisible: false,
      searchFieldVisible: true
    });
    const result = await runContentManualPublish({
      planRows: [planRow({ contentType: "post" })],
      accounts: [account()],
      config: config(),
      initialConfirmation: "PUBLISH_CONTENT_YES",
      finalConfirmation: async () => "FINAL_PUBLISH_YES",
      dependencies: deps
    });

    assert.equal(calls.goto, 1);
    assert.equal(calls.composerTriggerClick, 0);
    assert.equal(calls.editorFill, 0);
    assert.equal(calls.clickPublish, 0);
    assert.equal(result.rows[0].publish_status, "content_publish_editor_not_found");
    assert.match(result.rows[0].result_note, /search_field_skipped=placeholder_search/);
    assert.doesNotMatch(result.rows[0].result_note, /editable_editor_candidate_found=input/);
    assert.doesNotMatch(result.rows[0].result_note, /selected_editor_candidate=input/);
    assert.doesNotMatch(result.rows[0].result_note, /https:\/\/example\.internal\.portal\/profile\/123/);
    assert.doesNotMatch(result.rows[0].result_note, /Manual approved text/);
  });

  await runCase("post publish supports Polish Napisz post link trigger", async () => {
    const { deps, calls } = makePostComposerDeps({
      composerTriggerSelector: 'a:has-text("Napisz post")'
    });
    const result = await runContentManualPublish({
      planRows: [planRow({ contentType: "post" })],
      accounts: [account()],
      config: config(),
      initialConfirmation: "PUBLISH_CONTENT_YES",
      finalConfirmation: async () => "FINAL_PUBLISH_YES",
      dependencies: deps
    });

    assert.equal(calls.goto, 1);
    assert.equal(calls.composerTriggerClick, 1);
    assert.deepEqual(calls.composerTriggerSelectors, ['a:has-text("Napisz post")']);
    assert.equal(calls.editorFill, 1);
    assert.equal(calls.clickPublish, 1);
    assert.equal(result.rows[0].publish_status, "content_publish_success");
    assert.match(result.rows[0].result_note, /post_composer_trigger_found=napisz_post_link/);
    assert.match(result.rows[0].result_note, /post_composer_trigger_clicked=napisz_post_link/);
    assert.doesNotMatch(result.rows[0].result_note, /https:\/\/example\.internal\.portal\/profile\/123/);
    assert.doesNotMatch(result.rows[0].result_note, /Manual approved text/);
  });

  await runCase("post editor not found result explains composer lookup safely", async () => {
    const { deps, calls } = makePostComposerDeps({ composerTriggerVisible: false });
    const result = await runContentManualPublish({
      planRows: [planRow({ contentType: "post" })],
      accounts: [account()],
      config: config(),
      initialConfirmation: "PUBLISH_CONTENT_YES",
      finalConfirmation: async () => "FINAL_PUBLISH_YES",
      dependencies: deps
    });

    assert.equal(calls.goto, 1);
    assert.equal(calls.composerTriggerClick, 0);
    assert.equal(calls.editorFill, 0);
    assert.equal(calls.clickPublish, 0);
    assert.equal(result.rows[0].publish_status, "content_publish_editor_not_found");
    assert.match(result.rows[0].result_note, /editor_lookup_started/);
    assert.match(result.rows[0].result_note, /post_composer_trigger_not_found/);
    assert.match(result.rows[0].result_note, /editable_editor_not_found/);
    assert.doesNotMatch(result.rows[0].result_note, /https:\/\/example\.internal\.portal\/profile\/123/);
    assert.doesNotMatch(result.rows[0].result_note, /Manual approved text/);
  });

  await runCase("maxContentManualPublishesPerRun limit is applied", async () => {
    const { deps, calls } = makeBrowserDeps();
    const result = await runContentManualPublish({
      planRows: [
        planRow({ id: "content-001", accountId: "acc-001" }),
        planRow({ id: "content-002", accountId: "acc-002" })
      ],
      accounts: [account("acc-001"), account("acc-002")],
      config: config({ maxContentManualPublishesPerRun: 1, maxContentManualPublishesPerAccount: 5 }),
      initialConfirmation: "PUBLISH_CONTENT_YES",
      finalConfirmation: async () => "FINAL_PUBLISH_YES",
      dependencies: deps
    });

    assert.equal(calls.goto, 1);
    assert.equal(calls.clickPublish, 1);
    assert.equal(result.summary.skippedLimitReachedCount, 1);
    assert.equal(
      result.rows.find((row) => row.content_action_id === "content-002").publish_status,
      "content_publish_skipped_limit_reached"
    );
  });

  await runCase("maxContentManualPublishesPerAccount limit is applied", async () => {
    const { deps, calls } = makeBrowserDeps();
    const result = await runContentManualPublish({
      planRows: [
        planRow({ id: "content-001", accountId: "acc-001" }),
        planRow({ id: "content-002", accountId: "acc-001", targetValue: "https://example.internal.portal/profile/456" })
      ],
      accounts: [account("acc-001")],
      config: config({ maxContentManualPublishesPerRun: 5, maxContentManualPublishesPerAccount: 1 }),
      initialConfirmation: "PUBLISH_CONTENT_YES",
      finalConfirmation: async () => "FINAL_PUBLISH_YES",
      dependencies: deps
    });

    assert.equal(calls.goto, 1);
    assert.equal(calls.clickPublish, 1);
    assert.equal(result.summary.skippedLimitReachedCount, 1);
    assert.equal(
      result.rows.find((row) => row.content_action_id === "content-002").publish_status,
      "content_publish_skipped_limit_reached"
    );
  });

  await runCase("invalid planned record without approved_text is not sent to browser", async () => {
    const { deps, calls } = makeBrowserDeps();
    const result = await runContentManualPublish({
      planRows: [planRow({ approvedText: "" })],
      accounts: [account()],
      config: config(),
      initialConfirmation: "PUBLISH_CONTENT_YES",
      finalConfirmation: async () => "FINAL_PUBLISH_YES",
      dependencies: deps
    });

    assert.equal(calls.launch, 0);
    assert.equal(calls.prepare, 0);
    assert.equal(calls.clickPublish, 0);
    assert.equal(result.rows[0].publish_status, "content_publish_invalid_record");
    assert.match(result.rows[0].reason, /approved_text is required/);
  });

  await runCase("invalid planned record with too long approved_title is not sent to browser", async () => {
    const { deps, calls } = makeBrowserDeps();
    const result = await runContentManualPublish({
      planRows: [planRow({ contentType: "post", approvedTitle: "x".repeat(121) })],
      accounts: [account()],
      config: config(),
      initialConfirmation: "PUBLISH_CONTENT_YES",
      finalConfirmation: async () => "FINAL_PUBLISH_YES",
      dependencies: deps
    });

    assert.equal(calls.launch, 0);
    assert.equal(calls.prepare, 0);
    assert.equal(calls.clickPublish, 0);
    assert.equal(result.rows[0].publish_status, "content_publish_invalid_record");
    assert.match(result.rows[0].reason, /approved_title must be up to 120/);
  });

  await runCase("manual publish result CSV is generated without approved_text or full approved_title", async () => {
    const dir = tempWorkspace();
    try {
      const { deps } = makeBrowserDeps();
      const result = await runContentManualPublish({
        planRows: [
          planRow({
            approvedText: "SECRET APPROVED TEXT",
            approvedTitle: "SECRET APPROVED TITLE"
          })
        ],
        accounts: [account()],
        config: config(),
        initialConfirmation: "PUBLISH_CONTENT_YES",
        finalConfirmation: async () => "FINAL_PUBLISH_YES",
        dependencies: deps
      });
      const outputPath = exportContentManualPublishResults(
        result.rows,
        new Date("2026-05-29T12:13:14"),
        path.join(dir, "publish-results")
      );
      const outputText = fs.readFileSync(outputPath, "utf8");

      assert.equal(path.basename(outputPath), "content-publish-results-20260529-121314.csv");
      assert.match(outputText, /"publish_result_status"/);
      assert.match(outputText, /"result_note"/);
      assert.match(outputText, /"publish_status"/);
      assert.match(outputText, /"manual_confirmed"/);
      assert.match(outputText, /"final_confirmed"/);
      assert.match(outputText, /"title_present"/);
      assert.match(outputText, /"title_length"/);
      assert.doesNotMatch(outputText, /approved_text|SECRET APPROVED TEXT/);
      assert.doesNotMatch(outputText, /approved_title|SECRET APPROVED TITLE/);
    } finally {
      cleanup(dir);
    }
  });

  await runCase("publish submit uses unknown result when no safe success signal is returned", async () => {
    const { deps, calls } = makeBrowserDeps({
      publishResult: {
        status: "content_publish_unknown_result",
        note: "publish_submit_clicked_but_no_safe_success_signal_detected"
      }
    });
    const result = await runContentManualPublish({
      planRows: [planRow()],
      accounts: [account()],
      config: config(),
      initialConfirmation: "PUBLISH_CONTENT_YES",
      finalConfirmation: async () => "FINAL_PUBLISH_YES",
      dependencies: deps
    });

    assert.equal(calls.clickPublish, 1);
    assert.equal(result.rows[0].publish_status, "content_publish_unknown_result");
    assert.equal(result.rows[0].dry_run_only, false);
    assert.equal(result.rows[0].final_confirmed, true);
    assert.equal(result.rows[0].published_at, "");
    assert.match(result.rows[0].result_note, /no_safe_success_signal/);
  });

  await runCase("login target editor and publish errors get safe statuses", async () => {
    const loginDeps = makeBrowserDeps({
      loginResult: { result: "login_failed", details: "bad credentials" }
    });
    const loginResult = await runContentManualPublish({
      planRows: [planRow()],
      accounts: [account()],
      config: config(),
      initialConfirmation: "PUBLISH_CONTENT_YES",
      finalConfirmation: async () => "FINAL_PUBLISH_YES",
      dependencies: loginDeps.deps
    });
    assert.equal(loginResult.rows[0].publish_status, "content_publish_login_failed");

    const targetDeps = makeBrowserDeps({
      gotoError: new Error("navigation failed https://example.internal.portal/profile/123")
    });
    const targetResult = await runContentManualPublish({
      planRows: [planRow()],
      accounts: [account()],
      config: config(),
      initialConfirmation: "PUBLISH_CONTENT_YES",
      finalConfirmation: async () => "FINAL_PUBLISH_YES",
      dependencies: targetDeps.deps
    });
    assert.equal(targetResult.rows[0].publish_status, "content_publish_target_failed");
    assert.match(targetResult.rows[0].result_note, /target_navigation_started/);
    assert.match(targetResult.rows[0].result_note, /target_navigation_failed/);
    assert.doesNotMatch(targetResult.rows[0].result_note, /https:\/\/example\.internal\.portal\/profile\/123/);

    const editorDeps = makeBrowserDeps({ preparation: { editorFound: false, publishButtonSeen: false } });
    const editorResult = await runContentManualPublish({
      planRows: [planRow()],
      accounts: [account()],
      config: config(),
      initialConfirmation: "PUBLISH_CONTENT_YES",
      finalConfirmation: async () => "FINAL_PUBLISH_YES",
      dependencies: editorDeps.deps
    });
    assert.equal(editorResult.rows[0].publish_status, "content_publish_editor_not_found");

    const publishDeps = makeBrowserDeps({ clickError: new Error("button detached") });
    const publishResult = await runContentManualPublish({
      planRows: [planRow()],
      accounts: [account()],
      config: config(),
      initialConfirmation: "PUBLISH_CONTENT_YES",
      finalConfirmation: async () => "FINAL_PUBLISH_YES",
      dependencies: publishDeps.deps
    });
    assert.equal(publishResult.rows[0].publish_status, "content_publish_failed");
    assert.equal(publishResult.rows[0].final_confirmed, true);
  });

  await runCase("latest content publish plan file can be selected and read", async () => {
    const dir = tempWorkspace();
    try {
      const older = writeFile(
        dir,
        "content-publish-plan-20260529-111111.csv",
        planCsv([planRow({ id: "older" })])
      );
      const newer = writeFile(
        dir,
        "content-publish-plan-20260529-121212.csv",
        planCsv([planRow({ id: "newer" })])
      );
      const olderDate = new Date("2026-05-29T11:11:11").getTime() / 1000;
      const newerDate = new Date("2026-05-29T12:12:12").getTime() / 1000;

      fs.utimesSync(older, olderDate, olderDate);
      fs.utimesSync(newer, newerDate, newerDate);

      assert.equal(findLatestContentPublishPlanFile(dir), newer);
      assert.equal(readContentPublishPlanFile(newer)[0].content_action_id, "newer");
    } finally {
      cleanup(dir);
    }
  });

  await runCase("manual publish input reads multiline approved_text as one plan row", async () => {
    const dir = tempWorkspace();
    try {
      const approvedText = [
        "Pierwsza linia z przecinkiem, bez rozbijania.",
        "",
        "Link: https://example.invalid/profile/123?topic=csv,manual",
        "Cytat: \"bezpieczny test\""
      ].join("\n");
      const planPath = writeFile(
        dir,
        "content-publish-plan-20260529-131313.csv",
        planCsv([
          planRow({
            id: "multiline-plan",
            contentType: "post",
            approvedText,
            approvedTitle: "Synthetic title"
          })
        ])
      );
      const rows = readContentPublishPlanFile(planPath);

      assert.equal(rows.length, 1);
      assert.equal(rows[0].content_action_id, "multiline-plan");
      assert.equal(rows[0].approved_text, approvedText);
      assert.equal(rows[0].approved_title, "Synthetic title");
    } finally {
      cleanup(dir);
    }
  });

  await runCase("preview shows metadata and approved_text length only", async () => {
    const preview = buildContentManualPublishPreview(
      [planRow({ approvedText: "SECRET PREVIEW TEXT", approvedTitle: "SECRET PREVIEW TITLE" })],
      [account()],
      config()
    );

    assert.equal(preview.publishCount, 1);
    assert.equal(preview.items[0].approved_text_length, "SECRET PREVIEW TEXT".length);
    assert.equal(preview.items[0].title_present, true);
    assert.equal(preview.items[0].title_length, "SECRET PREVIEW TITLE".length);
    assert.equal(Object.prototype.hasOwnProperty.call(preview.items[0], "approved_text"), false);
    assert.equal(Object.prototype.hasOwnProperty.call(preview.items[0], "approved_title"), false);
  });

  console.log("content manual publish tests passed");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
