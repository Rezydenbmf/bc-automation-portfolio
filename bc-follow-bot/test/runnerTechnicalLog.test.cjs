const assert = require("node:assert/strict");

const { runAppWithDependencies } = require("../dist/runner/appRunner.js");

function makeInputs(overrides = {}) {
  const config = {
    headless: true,
    timeoutMs: 30000,
    slowMo: 0,
    debugScreenshots: false,
    baseUrl: "https://example.internal.portal",
    screenshotOnError: true,
    takeHtmlSnapshotOnError: false,
    delayBetweenTargetsMs: 100,
    requireManualConfirmForLargeRun: true,
    ...(overrides.config ?? {})
  };
  const target = {
    target_id: "target-001",
    target_type: "profile_url",
    target_value: "https://example.internal.portal/profile/123",
    enabled: true,
    note: "",
    ...(overrides.target ?? {})
  };

  return {
    config,
    accounts: [
      {
        account_id: "acc-001",
        email: "operator1@example.com",
        password: "change-me",
        enabled: true,
        note: ""
      }
    ],
    targets: [
      target
    ],
    ...overrides.inputs
  };
}

function makeDeps(overrides = {}) {
  const {
    pageClose,
    contextClose,
    browserClose,
    newContext,
    newPage,
    ...depOverrides
  } = overrides;
  const technicalLogs = [];
  const resultLogs = [];
  const counters = {
    browserLaunchCount: 0,
    manualConfirmationCount: 0,
    loginCount: 0,
    searchCount: 0,
    followCount: 0,
    pageCloseCount: 0,
    contextCloseCount: 0,
    browserCloseCount: 0
  };
  const page = {
    setDefaultTimeout() {},
    waitForTimeout: async () => {},
    close: async () => {
      counters.pageCloseCount += 1;
      if (pageClose) {
        await pageClose(counters);
      }
    }
  };
  const context = {
    newPage: async () => {
      if (newPage) {
        return await newPage(page, counters);
      }

      return page;
    },
    close: async () => {
      counters.contextCloseCount += 1;
      if (contextClose) {
        await contextClose(counters);
      }
    }
  };
  const browser = {
    newContext: async () => {
      if (newContext) {
        return await newContext(context, counters);
      }

      return context;
    },
    close: async () => {
      counters.browserCloseCount += 1;
      if (browserClose) {
        await browserClose(counters);
      }
    }
  };

  return {
    technicalLogs,
    resultLogs,
    counters,
    deps: {
      launchBrowser: async () => {
        counters.browserLaunchCount += 1;
        return browser;
      },
      loginAccount: async () => {
        counters.loginCount += 1;
        return { result: "login_success" };
      },
      searchTarget: async () => {
        counters.searchCount += 1;
        return {
          status: "invalid_target",
          searchOutcome: "person",
          details: "person_detected"
        };
      },
      followProfile: async () => {
        counters.followCount += 1;
        return { result: "followed" };
      },
      logResult: (entry) => resultLogs.push(entry),
      logTechnicalEntry: (entry) => technicalLogs.push(entry),
      askManualConfirmation: async () => {
        counters.manualConfirmationCount += 1;
        return "YES";
      },
      ...depOverrides
    }
  };
}

function getFinalTargetResults(resultLogs) {
  return resultLogs.filter((entry) => entry.action === "target");
}

function getRunSummary(technicalLogs) {
  const runFinished = technicalLogs.find((entry) => entry.step === "run_finished");
  assert.ok(runFinished);

  return Object.fromEntries(
    runFinished.details.split(";").map((part) => {
      const [key, value] = part.split("=");
      return [key, value];
    })
  );
}

function makeTarget(id, overrides = {}) {
  return {
    target_id: id,
    target_type: "profile_url",
    target_value: `https://example.internal.portal/profile/${id}`,
    enabled: true,
    note: "",
    ...overrides
  };
}

function makeAccount(id, overrides = {}) {
  return {
    account_id: `acc-${id}`,
    email: `operator${id}@example.com`,
    password: "change-me",
    enabled: true,
    note: "",
    ...overrides
  };
}

async function runWithDeps(overrides = {}, inputOverrides = {}) {
  const state = makeDeps(overrides);

  await withCleanBrowserEnv(async () => {
    await runAppWithDependencies(makeInputs(inputOverrides), state.deps);
  });

  return state;
}

async function withCleanBrowserEnv(fn) {
  const oldChannel = process.env.PLAYWRIGHT_BROWSER_CHANNEL;
  const oldExecutable = process.env.PLAYWRIGHT_EXECUTABLE_PATH;
  delete process.env.PLAYWRIGHT_BROWSER_CHANNEL;
  delete process.env.PLAYWRIGHT_EXECUTABLE_PATH;

  try {
    await fn();
  } finally {
    if (oldChannel === undefined) {
      delete process.env.PLAYWRIGHT_BROWSER_CHANNEL;
    } else {
      process.env.PLAYWRIGHT_BROWSER_CHANNEL = oldChannel;
    }

    if (oldExecutable === undefined) {
      delete process.env.PLAYWRIGHT_EXECUTABLE_PATH;
    } else {
      process.env.PLAYWRIGHT_EXECUTABLE_PATH = oldExecutable;
    }
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

async function main() {
  await runCase("runner technical log keeps stable happy path step order", async () => {
    await withCleanBrowserEnv(async () => {
      const { deps, technicalLogs } = makeDeps();

      await runAppWithDependencies(makeInputs(), deps);

      assert.deepEqual(
        technicalLogs.map((entry) => entry.step),
        [
          "run_started",
          "preflight",
          "account_started",
          "context_created",
          "page_created",
          "login_started",
          "login_finished",
          "target_started",
          "search_started",
          "search_finished",
          "follow_started",
          "follow_finished",
          "target_finished",
          "account_finished",
          "run_finished"
        ]
      );
    });
  });

  await runCase("preflight warning is logged above configured threshold", async () => {
    const targets = [makeTarget("001"), makeTarget("002"), makeTarget("003")];
    const accounts = [makeAccount("001"), makeAccount("002")];
    const { technicalLogs, counters } = await runWithDeps({}, {
      config: { preflightOperationWarningThreshold: 5 },
      inputs: { accounts, targets }
    });
    const preflight = technicalLogs.find((entry) => entry.step === "preflight");
    const warning = technicalLogs.find(
      (entry) => entry.step === "preflight_warning"
    );

    assert.ok(preflight);
    assert.match(preflight.details, /active_accounts=2/);
    assert.match(preflight.details, /active_targets=3/);
    assert.match(preflight.details, /planned_operations=6/);
    assert.match(preflight.details, /operation_warning_threshold=5/);
    assert.ok(warning);
    assert.match(warning.details, /planned_operations_exceed_threshold/);
    assert.match(warning.details, /planned_operations=6/);
    assert.equal(warning.error_message, "manual_confirmation_required");
    assert.equal(counters.manualConfirmationCount, 1);
  });

  await runCase("preflight warning is not logged at or below threshold", async () => {
    const targets = [makeTarget("001"), makeTarget("002"), makeTarget("003")];
    const accounts = [makeAccount("001"), makeAccount("002")];
    const { technicalLogs, counters } = await runWithDeps({}, {
      config: { preflightOperationWarningThreshold: 6 },
      inputs: { accounts, targets }
    });
    const warning = technicalLogs.find(
      (entry) => entry.step === "preflight_warning"
    );

    assert.equal(warning, undefined);
    assert.equal(counters.manualConfirmationCount, 0);
    assert.equal(counters.browserLaunchCount, 1);
  });

  await runCase("large run continues after exact YES confirmation", async () => {
    const targets = [makeTarget("001"), makeTarget("002"), makeTarget("003")];
    const accounts = [makeAccount("001"), makeAccount("002")];
    let promptCount = 0;
    const { technicalLogs, counters } = await runWithDeps({
      askManualConfirmation: async (prompt) => {
        promptCount += 1;
        assert.match(prompt, /Planowane operacje: 6/);
        assert.match(prompt, /wpisz dokladnie YES/);
        return "YES";
      }
    }, {
      config: { preflightOperationWarningThreshold: 5 },
      inputs: { accounts, targets }
    });
    const accepted = technicalLogs.find(
      (entry) =>
        entry.step === "preflight_warning" &&
        entry.details.startsWith("manual_confirmation_accepted")
    );

    assert.equal(promptCount, 1);
    assert.equal(counters.browserLaunchCount, 1);
    assert.ok(accepted);
  });

  await runCase("large run stops cleanly without exact YES confirmation", async () => {
    const targets = [makeTarget("001"), makeTarget("002"), makeTarget("003")];
    const accounts = [makeAccount("001"), makeAccount("002")];
    let promptCount = 0;
    const { technicalLogs, counters } = await runWithDeps({
      askManualConfirmation: async () => {
        promptCount += 1;
        return "yes";
      }
    }, {
      config: { preflightOperationWarningThreshold: 5 },
      inputs: { accounts, targets }
    });
    const rejected = technicalLogs.find(
      (entry) => entry.step === "error" && entry.details === "manual_confirmation_rejected"
    );
    const runFinished = technicalLogs.find((entry) => entry.step === "run_finished");

    assert.equal(promptCount, 1);
    assert.equal(counters.browserLaunchCount, 0);
    assert.equal(counters.loginCount, 0);
    assert.equal(counters.searchCount, 0);
    assert.equal(counters.followCount, 0);
    assert.ok(rejected);
    assert.match(runFinished.details, /browser_not_started/);
  });

  await runCase("large run continues without prompt when manual confirmation is disabled", async () => {
    const targets = [makeTarget("001"), makeTarget("002"), makeTarget("003")];
    const accounts = [makeAccount("001"), makeAccount("002")];
    const { technicalLogs, counters } = await runWithDeps({}, {
      config: {
        preflightOperationWarningThreshold: 5,
        requireManualConfirmForLargeRun: false
      },
      inputs: { accounts, targets }
    });
    const warning = technicalLogs.find(
      (entry) => entry.step === "preflight_warning"
    );

    assert.equal(counters.manualConfirmationCount, 0);
    assert.equal(counters.browserLaunchCount, 1);
    assert.equal(warning.error_message, "manual_confirmation_disabled");
  });

  await runCase("runner technical log records contain required fields", async () => {
    await withCleanBrowserEnv(async () => {
      const { deps, technicalLogs } = makeDeps();

      await runAppWithDependencies(makeInputs(), deps);

      for (const entry of technicalLogs) {
        assert.deepEqual(Object.keys(entry), [
          "timestamp",
          "step",
          "account",
          "target",
          "details",
          "error_message"
        ]);
        assert.equal(typeof entry.timestamp, "string");
        assert.equal(typeof entry.step, "string");
        assert.equal(typeof entry.account, "string");
        assert.equal(typeof entry.target, "string");
        assert.equal(typeof entry.details, "string");
        assert.equal(typeof entry.error_message, "string");
      }
    });
  });

  await runCase("runner technical log emits consistent error step on login exception", async () => {
    await withCleanBrowserEnv(async () => {
      const { deps, technicalLogs } = makeDeps({
        loginAccount: async () => {
          throw new Error("login exploded");
        }
      });

      await runAppWithDependencies(makeInputs(), deps);

      const errorEntry = technicalLogs.find((entry) => entry.step === "error");
      assert.ok(errorEntry);
      assert.equal(errorEntry.account, "operator1@example.com");
      assert.equal(errorEntry.target, "");
      assert.equal(errorEntry.details, "login_failed");
      assert.equal(errorEntry.error_message, "login exploded");
    });
  });

  await runCase("final target outcome maps successful follow to followed", async () => {
    const { resultLogs } = await runWithDeps({
      followProfile: async () => ({ result: "followed", details: "follow_done" })
    });
    const finalResults = getFinalTargetResults(resultLogs);

    assert.equal(finalResults.length, 1);
    assert.equal(finalResults[0].result, "followed");
    assert.equal(finalResults[0].error_message, "follow_done");
  });

  await runCase("final target outcome maps already following", async () => {
    const { resultLogs } = await runWithDeps({
      followProfile: async () => ({
        result: "already_following",
        details: "already_following_detected"
      })
    });
    const finalResults = getFinalTargetResults(resultLogs);

    assert.equal(finalResults.length, 1);
    assert.equal(finalResults[0].result, "already_following");
  });

  await runCase("previous followed profile skips follow", async () => {
    let followCount = 0;
    const { resultLogs, technicalLogs } = await runWithDeps({
      searchTarget: async () => ({
        status: "invalid_target",
        searchOutcome: "person",
        resolvedProfileUrl: "https://example.internal.portal/profile/123",
        details: "person_detected"
      }),
      hasSafelyProcessedProfile: () => true,
      followProfile: async () => {
        followCount += 1;
        return { result: "followed" };
      }
    });
    const finalResults = getFinalTargetResults(resultLogs);
    const followSkipped = technicalLogs.find(
      (entry) => entry.details === "follow_skipped_already_processed"
    );

    assert.equal(followCount, 0);
    assert.equal(finalResults.length, 1);
    assert.equal(finalResults[0].result, "already_processed");
    assert.ok(followSkipped);
  });

  await runCase("previous already following profile skips follow", async () => {
    let followCount = 0;
    const { resultLogs } = await runWithDeps({
      searchTarget: async () => ({
        status: "invalid_target",
        searchOutcome: "person",
        resolvedProfileUrl: "https://example.internal.portal/profile/123",
        details: "person_detected"
      }),
      hasSafelyProcessedProfile: () => true,
      followProfile: async () => {
        followCount += 1;
        return { result: "already_following" };
      }
    });
    const finalResults = getFinalTargetResults(resultLogs);

    assert.equal(followCount, 0);
    assert.equal(finalResults[0].result, "already_processed");
  });

  await runCase("previous follow failed profile does not skip follow", async () => {
    let followCount = 0;
    const { resultLogs } = await runWithDeps({
      searchTarget: async () => ({
        status: "invalid_target",
        searchOutcome: "person",
        resolvedProfileUrl: "https://example.internal.portal/profile/123",
        details: "person_detected"
      }),
      hasSafelyProcessedProfile: () => false,
      followProfile: async () => {
        followCount += 1;
        return { result: "followed" };
      }
    });
    const finalResults = getFinalTargetResults(resultLogs);

    assert.equal(followCount, 1);
    assert.equal(finalResults[0].result, "followed");
  });

  await runCase("missing history does not skip follow", async () => {
    let followCount = 0;
    const { resultLogs } = await runWithDeps({
      searchTarget: async () => ({
        status: "invalid_target",
        searchOutcome: "person",
        resolvedProfileUrl: "https://example.internal.portal/profile/123",
        details: "person_detected"
      }),
      hasSafelyProcessedProfile: () => false,
      followProfile: async () => {
        followCount += 1;
        return { result: "followed" };
      }
    });
    const finalResults = getFinalTargetResults(resultLogs);

    assert.equal(followCount, 1);
    assert.equal(finalResults[0].result, "followed");
  });

  await runCase("final target outcome maps not found search result", async () => {
    const { resultLogs } = await runWithDeps({
      searchTarget: async () => ({
        status: "not_found",
        searchOutcome: "not_found",
        details: "not_found"
      })
    });
    const finalResults = getFinalTargetResults(resultLogs);

    assert.equal(finalResults.length, 1);
    assert.equal(finalResults[0].result, "not_found");
  });

  await runCase("final target outcome maps login failure", async () => {
    const { resultLogs } = await runWithDeps({
      loginAccount: async () => ({
        result: "login_failed",
        details: "bad credentials"
      })
    });
    const finalResults = getFinalTargetResults(resultLogs);

    assert.equal(finalResults.length, 1);
    assert.equal(finalResults[0].result, "login_failed");
    assert.equal(finalResults[0].error_message, "bad credentials");
  });

  await runCase("final target outcome maps follow failure", async () => {
    const { resultLogs } = await runWithDeps({
      followProfile: async () => ({
        result: "follow_failed",
        details: "button missing"
      })
    });
    const finalResults = getFinalTargetResults(resultLogs);

    assert.equal(finalResults.length, 1);
    assert.equal(finalResults[0].result, "follow_failed");
  });

  await runCase("final target outcome maps invalid target validation", async () => {
    const { resultLogs } = await runWithDeps({}, {
      target: { target_type: "unsupported" }
    });
    const finalResults = getFinalTargetResults(resultLogs);

    assert.equal(finalResults.length, 1);
    assert.equal(finalResults[0].result, "invalid_target");
  });

  await runCase("final target outcome maps portal unavailable search result", async () => {
    const { resultLogs } = await runWithDeps({
      searchTarget: async () => ({
        status: "portal_unavailable",
        details: "portal timeout"
      })
    });
    const finalResults = getFinalTargetResults(resultLogs);

    assert.equal(finalResults.length, 1);
    assert.equal(finalResults[0].result, "portal_unavailable");
  });

  await runCase("multiple targets are processed in stable input order", async () => {
    const targets = [makeTarget("001"), makeTarget("002"), makeTarget("003")];
    const searchOrder = [];
    const { resultLogs } = await runWithDeps({
      searchTarget: async (_page, target) => {
        searchOrder.push(target.target_value);
        return {
          status: "invalid_target",
          searchOutcome: "person",
          details: "person_detected"
        };
      }
    }, {
      inputs: { targets }
    });
    const finalResults = getFinalTargetResults(resultLogs);

    assert.deepEqual(searchOrder, targets.map((target) => target.target_value));
    assert.deepEqual(
      finalResults.map((entry) => entry.target),
      targets.map((target) => target.target_value)
    );
  });

  await runCase("each target gets exactly one final result entry", async () => {
    const targets = [makeTarget("001"), makeTarget("002"), makeTarget("003")];
    const { resultLogs } = await runWithDeps({}, {
      inputs: { targets }
    });
    const finalResults = getFinalTargetResults(resultLogs);

    assert.equal(finalResults.length, targets.length);
    for (const target of targets) {
      assert.equal(
        finalResults.filter((entry) => entry.target === target.target_value).length,
        1
      );
    }
  });

  await runCase("technical target steps repeat consistently per target", async () => {
    const targets = [makeTarget("001"), makeTarget("002")];
    const { technicalLogs } = await runWithDeps({}, {
      inputs: { targets }
    });

    for (const target of targets) {
      assert.deepEqual(
        technicalLogs
          .filter((entry) => entry.target === target.target_value)
          .map((entry) => entry.step),
        [
          "target_started",
          "search_started",
          "search_finished",
          "follow_started",
          "follow_finished",
          "target_finished"
        ]
      );
    }
  });

  await runCase("account login is not repeated for each target", async () => {
    const targets = [makeTarget("001"), makeTarget("002"), makeTarget("003")];
    let loginCount = 0;

    await runWithDeps({
      loginAccount: async () => {
        loginCount += 1;
        return { result: "login_success" };
      }
    }, {
      inputs: { targets }
    });

    assert.equal(loginCount, 1);
  });

  await runCase("invalid target failure does not duplicate or skip result records", async () => {
    const targets = [
      makeTarget("001"),
      makeTarget("002", { target_type: "unsupported" }),
      makeTarget("003")
    ];
    const { resultLogs } = await runWithDeps({}, {
      inputs: { targets }
    });
    const finalResults = getFinalTargetResults(resultLogs);

    assert.equal(finalResults.length, 3);
    assert.deepEqual(
      finalResults.map((entry) => entry.result),
      ["followed", "invalid_target", "followed"]
    );
    assert.deepEqual(
      finalResults.map((entry) => entry.target),
      targets.map((target) => target.target_value)
    );
  });

  await runCase("normal mapped target statuses continue through later targets", async () => {
    const targets = [makeTarget("001"), makeTarget("002"), makeTarget("003")];
    const { resultLogs } = await runWithDeps({
      searchTarget: async (_page, target) => {
        if (target.target_id === "002") {
          return {
            status: "not_found",
            searchOutcome: "not_found",
            details: "not_found"
          };
        }

        return {
          status: "invalid_target",
          searchOutcome: "person",
          details: "person_detected"
        };
      }
    }, {
      inputs: { targets }
    });
    const finalResults = getFinalTargetResults(resultLogs);

    assert.deepEqual(
      finalResults.map((entry) => entry.result),
      ["followed", "not_found", "followed"]
    );
  });

  await runCase("missing maxFollowsPerRun keeps following all eligible targets", async () => {
    const targets = [makeTarget("001"), makeTarget("002")];
    let followCount = 0;
    const { resultLogs } = await runWithDeps({
      followProfile: async () => {
        followCount += 1;
        return { result: "followed" };
      }
    }, {
      inputs: { targets }
    });
    const finalResults = getFinalTargetResults(resultLogs);

    assert.equal(followCount, 2);
    assert.deepEqual(
      finalResults.map((entry) => entry.result),
      ["followed", "followed"]
    );
  });

  await runCase("followed consumes maxFollowsPerRun and next eligible target is skipped", async () => {
    const targets = [makeTarget("001"), makeTarget("002")];
    let followCount = 0;
    const { resultLogs, technicalLogs } = await runWithDeps({
      followProfile: async () => {
        followCount += 1;
        return { result: "followed" };
      }
    }, {
      config: { maxFollowsPerRun: 1 },
      inputs: { targets }
    });
    const finalResults = getFinalTargetResults(resultLogs);
    const limitLog = technicalLogs.find(
      (entry) => entry.details === "follow_limit_reached"
    );

    assert.equal(followCount, 1);
    assert.deepEqual(
      finalResults.map((entry) => entry.result),
      ["followed", "follow_limit_reached"]
    );
    assert.ok(limitLog);
  });

  await runCase("already following does not consume maxFollowsPerRun", async () => {
    const targets = [makeTarget("001"), makeTarget("002"), makeTarget("003")];
    let followCount = 0;
    const { resultLogs } = await runWithDeps({
      followProfile: async () => {
        followCount += 1;
        return {
          result: followCount === 1 ? "already_following" : "followed"
        };
      }
    }, {
      config: { maxFollowsPerRun: 1 },
      inputs: { targets }
    });
    const finalResults = getFinalTargetResults(resultLogs);

    assert.equal(followCount, 2);
    assert.deepEqual(
      finalResults.map((entry) => entry.result),
      ["already_following", "followed", "follow_limit_reached"]
    );
  });

  await runCase("already processed does not consume maxFollowsPerRun", async () => {
    const targets = [makeTarget("001"), makeTarget("002"), makeTarget("003")];
    let followCount = 0;
    const { resultLogs } = await runWithDeps({
      searchTarget: async (_page, target) => ({
        status: "invalid_target",
        searchOutcome: "person",
        resolvedProfileUrl: target.target_value,
        details: "person_detected"
      }),
      hasSafelyProcessedProfile: (_accountEmail, profileUrl) =>
        profileUrl.endsWith("/001"),
      followProfile: async () => {
        followCount += 1;
        return { result: "followed" };
      }
    }, {
      config: { maxFollowsPerRun: 1 },
      inputs: { targets }
    });
    const finalResults = getFinalTargetResults(resultLogs);

    assert.equal(followCount, 1);
    assert.deepEqual(
      finalResults.map((entry) => entry.result),
      ["already_processed", "followed", "follow_limit_reached"]
    );
  });

  await runCase("unexpected search exception stops only current account intentionally", async () => {
    const targets = [makeTarget("001"), makeTarget("002"), makeTarget("003")];
    const accounts = [makeAccount("001"), makeAccount("002")];
    const searchOrder = [];
    const { resultLogs, technicalLogs } = await runWithDeps({
      searchTarget: async (_page, target) => {
        searchOrder.push(target.target_value);
        if (target.target_id === "002") {
          throw new Error("search exploded");
        }

        return {
          status: "invalid_target",
          searchOutcome: "person",
          details: "person_detected"
        };
      }
    }, {
      inputs: { accounts, targets }
    });
    const firstAccountResults = getFinalTargetResults(resultLogs).filter(
      (entry) => entry.account === "operator001@example.com"
    );
    const secondAccountResults = getFinalTargetResults(resultLogs).filter(
      (entry) => entry.account === "operator002@example.com"
    );
    const stopLog = technicalLogs.find(
      (entry) =>
        entry.step === "account_finished" &&
        entry.account === "operator001@example.com"
    );

    assert.deepEqual(searchOrder, [
      targets[0].target_value,
      targets[1].target_value,
      targets[0].target_value,
      targets[1].target_value
    ]);
    assert.deepEqual(
      firstAccountResults.map((entry) => entry.result),
      ["followed", "portal_unavailable"]
    );
    assert.equal(firstAccountResults.length, 2);
    assert.equal(secondAccountResults.length, 2);
    assert.match(stopLog.details, /account_stopped_after_target_error/);
    assert.match(stopLog.details, /reason=search_failed/);
  });

  await runCase("unexpected follow exception stops current account intentionally", async () => {
    const targets = [makeTarget("001"), makeTarget("002"), makeTarget("003")];
    const { resultLogs, technicalLogs } = await runWithDeps({
      followProfile: async (_page) => {
        throw new Error("follow exploded");
      }
    }, {
      inputs: { targets }
    });
    const finalResults = getFinalTargetResults(resultLogs);
    const stopLog = technicalLogs.find((entry) => entry.step === "account_finished");

    assert.equal(finalResults.length, 1);
    assert.equal(finalResults[0].target, targets[0].target_value);
    assert.equal(finalResults[0].result, "follow_failed");
    assert.match(stopLog.details, /account_stopped_after_target_error/);
    assert.match(stopLog.details, /reason=follow_failed/);
  });

  await runCase("page and context are closed on normal account completion", async () => {
    const { counters, technicalLogs } = await runWithDeps();
    const accountFinished = technicalLogs.find((entry) => entry.step === "account_finished");

    assert.equal(counters.pageCloseCount, 1);
    assert.equal(counters.contextCloseCount, 1);
    assert.match(accountFinished.details, /page_closed=true/);
    assert.match(accountFinished.details, /context_closed=true/);
  });

  await runCase("page and context are closed on login failure", async () => {
    const { counters, technicalLogs } = await runWithDeps({
      loginAccount: async () => ({
        result: "login_failed",
        details: "bad credentials"
      })
    });
    const accountFinished = technicalLogs.find((entry) => entry.step === "account_finished");

    assert.equal(counters.pageCloseCount, 1);
    assert.equal(counters.contextCloseCount, 1);
    assert.match(accountFinished.details, /login_result=login_failed/);
    assert.match(accountFinished.details, /page_closed=true/);
    assert.match(accountFinished.details, /context_closed=true/);
  });

  await runCase("page and context are closed after target error stops account", async () => {
    const targets = [makeTarget("001"), makeTarget("002")];
    const { counters, technicalLogs } = await runWithDeps({
      searchTarget: async () => {
        throw new Error("search exploded");
      }
    }, {
      inputs: { targets }
    });
    const accountFinished = technicalLogs.find((entry) => entry.step === "account_finished");

    assert.equal(counters.pageCloseCount, 1);
    assert.equal(counters.contextCloseCount, 1);
    assert.match(accountFinished.details, /account_stopped_after_target_error/);
    assert.match(accountFinished.details, /page_closed=true/);
    assert.match(accountFinished.details, /context_closed=true/);
  });

  await runCase("browser is closed once after run completion", async () => {
    const { counters } = await runWithDeps();

    assert.equal(counters.browserCloseCount, 1);
  });

  await runCase("browser is closed once if account setup exits early", async () => {
    const technicalLogs = [];
    const resultLogs = [];
    const counters = { browserCloseCount: 0 };
    const deps = {
      launchBrowser: async () => ({
        newContext: async () => {
          throw new Error("context exploded");
        },
        close: async () => {
          counters.browserCloseCount += 1;
        }
      }),
      loginAccount: async () => ({ result: "login_success" }),
      searchTarget: async () => ({
        status: "invalid_target",
        searchOutcome: "person",
        details: "person_detected"
      }),
      followProfile: async () => ({ result: "followed" }),
      logResult: (entry) => resultLogs.push(entry),
      logTechnicalEntry: (entry) => technicalLogs.push(entry)
    };

    await withCleanBrowserEnv(async () => {
      await assert.rejects(
        () => runAppWithDependencies(makeInputs(), deps),
        /context exploded/
      );
    });

    assert.equal(counters.browserCloseCount, 1);
    assert.equal(
      technicalLogs.filter((entry) => entry.step === "run_finished").length,
      1
    );
  });

  await runCase("context close is still attempted when page close fails", async () => {
    const { counters, technicalLogs } = await runWithDeps({
      pageClose: async () => {
        throw new Error("page close exploded");
      }
    });
    const pageCloseError = technicalLogs.find(
      (entry) => entry.step === "error" && entry.details === "page_close_failed"
    );
    const accountFinished = technicalLogs.find((entry) => entry.step === "account_finished");

    assert.equal(counters.pageCloseCount, 1);
    assert.equal(counters.contextCloseCount, 1);
    assert.equal(counters.browserCloseCount, 1);
    assert.equal(pageCloseError.error_message, "page close exploded");
    assert.match(accountFinished.details, /page_closed=false/);
    assert.match(accountFinished.details, /context_closed=true/);
    assert.match(accountFinished.details, /cleanup_errors=page_close_failed/);
  });

  await runCase("context close failure is logged consistently", async () => {
    const { counters, technicalLogs } = await runWithDeps({
      contextClose: async () => {
        throw new Error("context close exploded");
      }
    });
    const contextCloseError = technicalLogs.find(
      (entry) => entry.step === "error" && entry.details === "context_close_failed"
    );
    const accountFinished = technicalLogs.find((entry) => entry.step === "account_finished");

    assert.equal(counters.pageCloseCount, 1);
    assert.equal(counters.contextCloseCount, 1);
    assert.equal(counters.browserCloseCount, 1);
    assert.equal(contextCloseError.error_message, "context close exploded");
    assert.match(accountFinished.details, /page_closed=true/);
    assert.match(accountFinished.details, /context_closed=false/);
    assert.match(accountFinished.details, /cleanup_errors=context_close_failed/);
  });

  await runCase("browser close failure is logged and run finishes consistently", async () => {
    const { counters, technicalLogs } = await runWithDeps({
      browserClose: async () => {
        throw new Error("browser close exploded");
      }
    });
    const browserCloseError = technicalLogs.find(
      (entry) => entry.step === "error" && entry.details === "browser_close_failed"
    );
    const runFinishedLogs = technicalLogs.filter(
      (entry) => entry.step === "run_finished"
    );
    const accountFinished = technicalLogs.find((entry) => entry.step === "account_finished");

    assert.equal(counters.pageCloseCount, 1);
    assert.equal(counters.contextCloseCount, 1);
    assert.equal(counters.browserCloseCount, 1);
    assert.equal(browserCloseError.error_message, "browser close exploded");
    assert.equal(runFinishedLogs.length, 1);
    assert.match(runFinishedLogs[0].details, /^browser_close_failed;/);
    assert.match(runFinishedLogs[0].details, /cleanup_issues=1/);
    assert.equal(runFinishedLogs[0].error_message, "browser close exploded");
    assert.match(accountFinished.details, /page_closed=true/);
    assert.match(accountFinished.details, /context_closed=true/);
  });

  await runCase("run summary counts mixed multi-target outcomes", async () => {
    const targets = [
      makeTarget("001"),
      makeTarget("002"),
      makeTarget("003"),
      makeTarget("004"),
      makeTarget("005", { target_type: "unsupported" })
    ];
    const { technicalLogs } = await runWithDeps({
      searchTarget: async (_page, target) => {
        if (target.target_id === "002") {
          return {
            status: "not_found",
            searchOutcome: "not_found",
            details: "not_found"
          };
        }

        if (target.target_id === "003") {
          return {
            status: "portal_unavailable",
            details: "portal timeout"
          };
        }

        return {
          status: "invalid_target",
          searchOutcome: "person",
          details: "person_detected"
        };
      },
      followProfile: async (_page) => ({ result: "already_following" })
    }, {
      inputs: { targets }
    });
    const summary = getRunSummary(technicalLogs);

    assert.equal(summary.accounts_total, "1");
    assert.equal(summary.accounts_processed, "1");
    assert.equal(summary.targets_total_enabled, "5");
    assert.equal(summary.targets_processed, "5");
    assert.equal(summary.followed, "0");
    assert.equal(summary.already_following, "2");
    assert.equal(summary.not_found, "1");
    assert.equal(summary.login_failed, "0");
    assert.equal(summary.follow_failed, "0");
    assert.equal(summary.invalid_target, "1");
    assert.equal(summary.portal_unavailable, "1");
    assert.equal(summary.followLimitReached, "0");
    assert.equal(summary.cleanup_issues, "0");
  });

  await runCase("run summary counts follow limit reached targets", async () => {
    const targets = [makeTarget("001"), makeTarget("002")];
    const { technicalLogs } = await runWithDeps({}, {
      config: { maxFollowsPerRun: 1 },
      inputs: { targets }
    });
    const summary = getRunSummary(technicalLogs);

    assert.equal(summary.followed, "1");
    assert.equal(summary.followLimitReached, "1");
    assert.equal(summary.targets_processed, "2");
  });

  await runCase("run summary counts login failures for enabled targets", async () => {
    const targets = [makeTarget("001"), makeTarget("002")];
    const { technicalLogs } = await runWithDeps({
      loginAccount: async () => ({
        result: "login_failed",
        details: "bad credentials"
      })
    }, {
      inputs: { targets }
    });
    const summary = getRunSummary(technicalLogs);

    assert.equal(summary.accounts_total, "1");
    assert.equal(summary.accounts_processed, "1");
    assert.equal(summary.targets_total_enabled, "2");
    assert.equal(summary.targets_processed, "2");
    assert.equal(summary.login_failed, "2");
    assert.equal(summary.followed, "0");
  });

  await runCase("run summary is deterministic when account stops after target error", async () => {
    const targets = [makeTarget("001"), makeTarget("002"), makeTarget("003")];
    const accounts = [makeAccount("001"), makeAccount("002")];
    const { technicalLogs } = await runWithDeps({
      searchTarget: async (_page, target) => {
        if (target.target_id === "002") {
          throw new Error("search exploded");
        }

        return {
          status: "invalid_target",
          searchOutcome: "person",
          details: "person_detected"
        };
      }
    }, {
      inputs: { accounts, targets }
    });
    const summary = getRunSummary(technicalLogs);

    assert.equal(summary.accounts_total, "2");
    assert.equal(summary.accounts_processed, "2");
    assert.equal(summary.targets_total_enabled, "3");
    assert.equal(summary.targets_processed, "4");
    assert.equal(summary.followed, "2");
    assert.equal(summary.portal_unavailable, "2");
    assert.equal(summary.not_found, "0");
    assert.equal(summary.cleanup_issues, "0");
  });

  console.log("runner tests passed");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
