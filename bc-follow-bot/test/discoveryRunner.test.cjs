const assert = require("node:assert/strict");
const { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
  buildDiscoverySearchQuery,
  buildDiscoveryRunnerRows,
  runDiscovery,
  searchDiscoveryProfile
} = require("../dist/discovery/discoveryRunner.js");
const {
  validateDiscoveryInputCsvText
} = require("../dist/discovery/discoveryInputValidation.js");

async function runCase(name, fn) {
  try {
    await fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`fail - ${name}`);
    throw error;
  }
}

function tempWorkspace() {
  return mkdtempSync(path.join(os.tmpdir(), "bc-follow-bot-discovery-runner-"));
}

const checkedAt = "2026-04-29T10:00:00.000Z";

function makeConfig() {
  return {
    headless: true,
    timeoutMs: 30000,
    slowMo: 0,
    debugScreenshots: false,
    baseUrl: "https://example.internal.portal",
    screenshotOnError: true,
    takeHtmlSnapshotOnError: false,
    delayBetweenTargetsMs: 0
  };
}

function makeAccount() {
  return {
    account_id: "acc-001",
    email: "operator@example.com",
    password: "change-me",
    enabled: true,
    note: ""
  };
}

function makeDeps(searchDiscoveryProfile) {
  let followCalled = false;
  const page = {
    setDefaultTimeout() {},
    close: async () => {}
  };
  const context = {
    newPage: async () => page,
    close: async () => {}
  };
  const browser = {
    newContext: async () => context,
    close: async () => {}
  };

  return {
    get followCalled() {
      return followCalled;
    },
    markFollowCalled() {
      followCalled = true;
    },
    deps: {
      launchBrowser: async () => browser,
      loginAccount: async () => ({ result: "login_success" }),
      searchDiscoveryProfile
    }
  };
}

async function main() {
await runCase("discovery search query uses email or first and last name only", async () => {
  assert.equal(
    buildDiscoverySearchQuery({
      target_id: "smoke-001",
      email: "",
      first_name: "Jordan",
      last_name: "Example",
      company: "",
      country: "",
      city: "",
      enabled: true,
      note: ""
    }),
    "Jordan Example"
  );

  assert.equal(
    buildDiscoverySearchQuery({
      target_id: "disc-001",
      email: "person@example.com",
      first_name: "Person",
      last_name: "One",
      company: "Example Company",
      country: "PL",
      city: "Warsaw",
      enabled: true,
      note: ""
    }),
    "person@example.com"
  );
});

await runCase("enabled discovery row can get profile_found with profile_url", async () => {
  const csv = [
    "target_id,email,first_name,last_name,company,country,city,enabled,note",
    "disc-001,person@example.com,Person,One,Example Company,PL,Warsaw,true,enabled"
  ].join("\n");

  const validation = validateDiscoveryInputCsvText(csv, checkedAt);
  const rows = await buildDiscoveryRunnerRows(validation, checkedAt, async () => ({
    status: "profile_found",
    profileUrl: "https://example.internal.portal/profile/123",
    confidence: "high",
    reason: "single person profile found"
  }));

  assert.equal(rows.length, 1);
  assert.equal(rows[0].target_id, "disc-001");
  assert.equal(rows[0].discovery_status, "profile_found");
  assert.equal(rows[0].profile_url, "https://example.internal.portal/profile/123");
  assert.equal(rows[0].confidence, "high");
  assert.equal(rows[0].checked_at, checkedAt);
});

await runCase("enabled discovery row can get not_found", async () => {
  const csv = [
    "target_id,email,first_name,last_name,company,country,city,enabled,note",
    "disc-001,person@example.com,Person,One,Example Company,PL,Warsaw,true,enabled"
  ].join("\n");

  const validation = validateDiscoveryInputCsvText(csv, checkedAt);
  const rows = await buildDiscoveryRunnerRows(validation, checkedAt, async () => ({
    status: "not_found",
    confidence: "none",
    reason: "no profile candidates found"
  }));

  assert.equal(rows.length, 1);
  assert.equal(rows[0].discovery_status, "not_found");
  assert.equal(rows[0].profile_url, "");
});

await runCase("enabled discovery row can get portal_error", async () => {
  const csv = [
    "target_id,email,first_name,last_name,company,country,city,enabled,note",
    "disc-001,person@example.com,Person,One,Example Company,PL,Warsaw,true,enabled"
  ].join("\n");

  const validation = validateDiscoveryInputCsvText(csv, checkedAt);
  const rows = await buildDiscoveryRunnerRows(validation, checkedAt, async () => ({
    status: "portal_error",
    confidence: "none",
    reason: "search timeout"
  }));

  assert.equal(rows.length, 1);
  assert.equal(rows[0].discovery_status, "portal_error");
  assert.equal(rows[0].reason, "search timeout");
});

await runCase("enabled discovery row can get ambiguous_result", async () => {
  const csv = [
    "target_id,email,first_name,last_name,company,country,city,enabled,note",
    "disc-001,person@example.com,Person,One,Example Company,PL,Warsaw,true,enabled"
  ].join("\n");

  const validation = validateDiscoveryInputCsvText(csv, checkedAt);
  const rows = await buildDiscoveryRunnerRows(validation, checkedAt, async () => ({
    status: "ambiguous_result",
    confidence: "low",
    reason: "multiple profile candidates: 2"
  }));

  assert.equal(rows.length, 1);
  assert.equal(rows[0].discovery_status, "ambiguous_result");
  assert.equal(rows[0].profile_url, "");
});

await runCase("discovery continues when home navigation is aborted", async () => {
  const filledQueries = [];
  const inputLocator = {
    first() {
      return this;
    },
    count: async () => 1,
    isVisible: async () => true,
    isEditable: async () => true,
    fill: async (value) => {
      filledQueries.push(value);
    },
    press: async () => {}
  };
  const emptyLocator = {
    first() {
      return this;
    },
    count: async () => 0,
    isVisible: async () => false,
    isEditable: async () => false,
    evaluateAll: async () => [],
    innerText: async () => ""
  };
  const page = {
    goto: async () => {
      throw new Error("page.goto: net::ERR_ABORTED at https://example.internal.portal/home");
    },
    waitForLoadState: async () => {},
    waitForTimeout: async () => {},
    url: () => "https://example.internal.portal/home",
    title: async () => "Home",
    locator: (selector) => {
      if (selector === 'input[type="search"]') {
        return inputLocator;
      }

      return emptyLocator;
    }
  };

  const result = await searchDiscoveryProfile(
    page,
    {
      target_id: "disc-001",
      email: "person@example.com",
      first_name: "Person",
      last_name: "One",
      company: "",
      country: "",
      city: "",
      enabled: true,
      note: ""
    },
    makeConfig()
  );

  assert.equal(result.status, "not_found");
  assert.deepEqual(filledQueries, ["", "person@example.com"]);
});

function makeNotFoundSearchPage(waitTimes, bannerTexts = [], bringToFrontCalls = []) {
  const inputLocator = {
    first() {
      return this;
    },
    count: async () => 1,
    isVisible: async () => true,
    isEditable: async () => true,
    fill: async () => {},
    press: async () => {}
  };
  const emptyLocator = {
    first() {
      return this;
    },
    count: async () => 0,
    isVisible: async () => false,
    isEditable: async () => false,
    evaluateAll: async () => [],
    innerText: async () => ""
  };

  return {
    goto: async () => {},
    bringToFront: async () => {
      bringToFrontCalls.push(true);
    },
    evaluate: async (_callback, bannerText) => {
      bannerTexts.push(bannerText);
    },
    waitForLoadState: async () => {},
    waitForTimeout: async (ms) => {
      waitTimes.push(ms);
    },
    url: () => "https://example.internal.portal/home",
    title: async () => "Home",
    locator: (selector) => {
      if (selector === 'input[type="search"]') {
        return inputLocator;
      }

      return emptyLocator;
    }
  };
}

await runCase("discovery does not pause debug flow by default", async () => {
  const previousPause = process.env.DISCOVERY_DEBUG_PAUSE_MS;
  delete process.env.DISCOVERY_DEBUG_PAUSE_MS;
  const waitTimes = [];

  try {
    const result = await searchDiscoveryProfile(
      makeNotFoundSearchPage(waitTimes),
      {
        target_id: "disc-001",
        email: "person@example.com",
        first_name: "Person",
        last_name: "One",
        company: "",
        country: "",
        city: "",
        enabled: true,
        note: ""
      },
      makeConfig()
    );

    assert.equal(result.status, "not_found");
    assert.equal(waitTimes.includes(1234), false);
  } finally {
    if (previousPause === undefined) {
      delete process.env.DISCOVERY_DEBUG_PAUSE_MS;
    } else {
      process.env.DISCOVERY_DEBUG_PAUSE_MS = previousPause;
    }
  }
});

await runCase("discovery does not use visual debug banner by default", async () => {
  const previousVisual = process.env.DISCOVERY_DEBUG_VISUAL;
  delete process.env.DISCOVERY_DEBUG_VISUAL;
  const waitTimes = [];
  const bannerTexts = [];
  const bringToFrontCalls = [];

  try {
    const result = await searchDiscoveryProfile(
      makeNotFoundSearchPage(waitTimes, bannerTexts, bringToFrontCalls),
      {
        target_id: "disc-001",
        email: "person@example.com",
        first_name: "Person",
        last_name: "One",
        company: "",
        country: "",
        city: "",
        enabled: true,
        note: ""
      },
      makeConfig()
    );

    assert.equal(result.status, "not_found");
    assert.equal(bannerTexts.length, 0);
    assert.equal(bringToFrontCalls.length, 0);
  } finally {
    if (previousVisual === undefined) {
      delete process.env.DISCOVERY_DEBUG_VISUAL;
    } else {
      process.env.DISCOVERY_DEBUG_VISUAL = previousVisual;
    }
  }
});

await runCase("discovery does not use visual debug banner when env is zero", async () => {
  const previousVisual = process.env.DISCOVERY_DEBUG_VISUAL;
  process.env.DISCOVERY_DEBUG_VISUAL = "0";
  const waitTimes = [];
  const bannerTexts = [];
  const bringToFrontCalls = [];

  try {
    const result = await searchDiscoveryProfile(
      makeNotFoundSearchPage(waitTimes, bannerTexts, bringToFrontCalls),
      {
        target_id: "disc-001",
        email: "person@example.com",
        first_name: "Person",
        last_name: "One",
        company: "",
        country: "",
        city: "",
        enabled: true,
        note: ""
      },
      makeConfig()
    );

    assert.equal(result.status, "not_found");
    assert.equal(bannerTexts.length, 0);
    assert.equal(bringToFrontCalls.length, 0);
  } finally {
    if (previousVisual === undefined) {
      delete process.env.DISCOVERY_DEBUG_VISUAL;
    } else {
      process.env.DISCOVERY_DEBUG_VISUAL = previousVisual;
    }
  }
});

await runCase("discovery uses visual debug banner when env is set", async () => {
  const previousVisual = process.env.DISCOVERY_DEBUG_VISUAL;
  process.env.DISCOVERY_DEBUG_VISUAL = "1";
  const waitTimes = [];
  const bannerTexts = [];
  const bringToFrontCalls = [];

  try {
    const result = await searchDiscoveryProfile(
      makeNotFoundSearchPage(waitTimes, bannerTexts, bringToFrontCalls),
      {
        target_id: "disc-001",
        email: "person@example.com",
        first_name: "Person",
        last_name: "One",
        company: "",
        country: "",
        city: "",
        enabled: true,
        note: ""
      },
      makeConfig(),
      { rowNumber: 2, totalRows: 10 }
    );

    assert.equal(result.status, "not_found");
    assert.equal(bringToFrontCalls.length, bannerTexts.length);
    assert.ok(bannerTexts.some((text) => text.includes("row 2/10")));
    assert.ok(bannerTexts.some((text) => text.includes("step: before_record")));
    assert.ok(bannerTexts.some((text) => text.includes("step: after_query_fill")));
    assert.ok(bannerTexts.some((text) => text.includes("step: after_search_submit")));
    assert.ok(bannerTexts.some((text) => text.includes("step: record_done")));
    assert.ok(bannerTexts.some((text) => text.includes("status: not_found")));
    assert.ok(bannerTexts.some((text) => /query_hash: [a-f0-9]{8}/.test(text)));
    assert.equal(bannerTexts.some((text) => text.includes("person@example.com")), false);
    assert.equal(bannerTexts.some((text) => text.includes("Person")), false);
  } finally {
    if (previousVisual === undefined) {
      delete process.env.DISCOVERY_DEBUG_VISUAL;
    } else {
      process.env.DISCOVERY_DEBUG_VISUAL = previousVisual;
    }
  }
});

await runCase("discovery pauses debug flow when env is set", async () => {
  const previousPause = process.env.DISCOVERY_DEBUG_PAUSE_MS;
  process.env.DISCOVERY_DEBUG_PAUSE_MS = "1234";
  const waitTimes = [];

  try {
    const result = await searchDiscoveryProfile(
      makeNotFoundSearchPage(waitTimes),
      {
        target_id: "disc-001",
        email: "person@example.com",
        first_name: "Person",
        last_name: "One",
        company: "",
        country: "",
        city: "",
        enabled: true,
        note: ""
      },
      makeConfig()
    );

    assert.equal(result.status, "not_found");
    assert.equal(waitTimes.filter((ms) => ms === 1234).length, 3);
  } finally {
    if (previousPause === undefined) {
      delete process.env.DISCOVERY_DEBUG_PAUSE_MS;
    } else {
      process.env.DISCOVERY_DEBUG_PAUSE_MS = previousPause;
    }
  }
});

function makeProfileNavigationPage(profileNavigationError) {
  let gotoCount = 0;
  const inputLocator = {
    first() {
      return this;
    },
    count: async () => 1,
    isVisible: async () => true,
    isEditable: async () => true,
    fill: async () => {},
    press: async () => {}
  };
  const anchor = {
    textContent: "Profile result",
    parentElement: null,
    getAttribute(name) {
      if (name === "href") {
        return "/profile/123";
      }

      return "";
    }
  };
  const linkLocator = {
    first() {
      return this;
    },
    count: async () => 0,
    isVisible: async () => false,
    isEditable: async () => false,
    evaluateAll: async (callback) => callback([anchor])
  };
  const bodyLocator = {
    first() {
      return this;
    },
    count: async () => 0,
    isVisible: async () => false,
    isEditable: async () => false,
    evaluateAll: async () => [],
    innerText: async () => "Profile page content"
  };
  const emptyLocator = {
    first() {
      return this;
    },
    count: async () => 0,
    isVisible: async () => false,
    isEditable: async () => false,
    evaluateAll: async () => [],
    innerText: async () => ""
  };

  return {
    goto: async () => {
      gotoCount += 1;
      if (gotoCount === 2) {
        throw profileNavigationError;
      }
    },
    waitForLoadState: async () => {},
    waitForTimeout: async () => {},
    url: () => gotoCount >= 2
      ? "https://example.internal.portal/profile/123"
      : "https://example.internal.portal/home",
    title: async () => gotoCount >= 2 ? "Profile" : "Home",
    locator: (selector) => {
      if (selector === 'input[type="search"]') {
        return inputLocator;
      }

      if (selector === "a[href]") {
        return linkLocator;
      }

      if (selector === "body") {
        return bodyLocator;
      }

      return emptyLocator;
    }
  };
}

await runCase("discovery continues when profile navigation is aborted", async () => {
  const page = {
    ...makeProfileNavigationPage(
      new Error("page.goto: net::ERR_ABORTED at https://example.internal.portal/profile/123")
    )
  };

  const result = await searchDiscoveryProfile(
    page,
    {
      target_id: "disc-001",
      email: "person@example.com",
      first_name: "Person",
      last_name: "One",
      company: "",
      country: "",
      city: "",
      enabled: true,
      note: ""
    },
    makeConfig()
  );

  assert.equal(result.status, "profile_found");
  assert.equal(result.profileUrl, "https://example.internal.portal/profile/123");
});

await runCase("discovery continues when profile navigation is interrupted", async () => {
  const page = {
    ...makeProfileNavigationPage(
      new Error(
        'page.goto: Navigation to "https://example.internal.portal/profile/123" is interrupted by another navigation to "https://example.internal.portal/profile/123"'
      )
    )
  };

  const result = await searchDiscoveryProfile(
    page,
    {
      target_id: "disc-001",
      email: "person@example.com",
      first_name: "Person",
      last_name: "One",
      company: "",
      country: "",
      city: "",
      enabled: true,
      note: ""
    },
    makeConfig()
  );

  assert.equal(result.status, "profile_found");
  assert.equal(result.profileUrl, "https://example.internal.portal/profile/123");
});

await runCase("disabled discovery row gets skipped_disabled result", async () => {
  const csv = [
    "target_id,email,first_name,last_name,company,country,city,enabled,note",
    "disc-002,person@example.com,Person,Two,Example Company,PL,Krakow,false,disabled"
  ].join("\n");

  const validation = validateDiscoveryInputCsvText(csv, checkedAt);
  const rows = await buildDiscoveryRunnerRows(validation, checkedAt, async () => {
    throw new Error("disabled row should not call search");
  });

  assert.equal(rows.length, 1);
  assert.equal(rows[0].target_id, "disc-002");
  assert.equal(rows[0].discovery_status, "skipped_disabled");
  assert.equal(rows[0].reason, "record disabled");
});

await runCase("discovery runner handles valid rows sequentially", async () => {
  const csv = [
    "target_id,email,first_name,last_name,company,country,city,enabled,note",
    "disc-001,person1@example.com,Person,One,Example Company,PL,Warsaw,true,enabled",
    "disc-002,person2@example.com,Person,Two,Example Company,PL,Krakow,true,enabled",
    "disc-003,person3@example.com,Person,Three,Example Company,PL,Gdansk,true,enabled"
  ].join("\n");

  const validation = validateDiscoveryInputCsvText(csv, checkedAt);
  const calls = [];
  let inFlight = 0;
  let overlapped = false;

  const rows = await buildDiscoveryRunnerRows(validation, checkedAt, async (record, debugContext) => {
    if (inFlight > 0) {
      overlapped = true;
    }

    inFlight += 1;
    calls.push(`${debugContext.rowNumber}/${debugContext.totalRows}:${record.target_id}:start`);
    await new Promise((resolve) => setTimeout(resolve, 0));
    calls.push(`${debugContext.rowNumber}/${debugContext.totalRows}:${record.target_id}:end`);
    inFlight -= 1;

    return {
      status: "not_found",
      confidence: "none",
      reason: "no profile candidates found"
    };
  });

  assert.equal(overlapped, false);
  assert.deepEqual(calls, [
    "1/3:disc-001:start",
    "1/3:disc-001:end",
    "2/3:disc-002:start",
    "2/3:disc-002:end",
    "3/3:disc-003:start",
    "3/3:disc-003:end"
  ]);
  assert.equal(rows.length, 3);
  assert.deepEqual(rows.map((row) => row.target_id), ["disc-001", "disc-002", "disc-003"]);
});

await runCase("discovery runner validates input, searches and exports result CSV", async () => {
  const dir = tempWorkspace();

  try {
    const inputPath = path.join(dir, "discovery-input.csv");
    const outputDir = path.join(dir, "discovery-results");
    const targetsOutputDir = path.join(dir, "discovery-targets");
    writeFileSync(
      inputPath,
      [
        "target_id,email,first_name,last_name,company,country,city,enabled,note",
        "disc-001,person@example.com,Person,One,Example Company,PL,Warsaw,true,enabled",
        "disc-002,person2@example.com,Person,Two,Example Company,PL,Krakow,false,disabled"
      ].join("\n"),
      "utf-8"
    );
    const state = makeDeps(async (_page, record) => ({
      status: "profile_found",
      profileUrl: `https://example.internal.portal/profile/${record.target_id}`,
      confidence: "high",
      reason: "single person profile found"
    }));

    const result = await runDiscovery({
      inputPath,
      outputDir,
      targetsOutputDir,
      now: new Date(2026, 0, 2, 3, 4, 5),
      checkedAt,
      config: makeConfig(),
      account: makeAccount(),
      dependencies: state.deps
    });

    assert.equal(result.runId, "20260102-030405");
    assert.equal(result.validCount, 1);
    assert.equal(result.skippedDisabledCount, 1);
    assert.equal(result.rejectedCount, 0);
    assert.equal(result.writtenCount, 2);
    assert.equal(result.targetsWrittenCount, 1);
    assert.equal(existsSync(result.outputFilePath), true);
    assert.equal(
      result.targetsOutputFilePath,
      path.join(targetsOutputDir, "discovery-targets-20260102-030405.csv")
    );
    assert.equal(existsSync(result.targetsOutputFilePath), true);
    assert.equal(state.followCalled, false);

    const content = readFileSync(result.outputFilePath, "utf-8");
    assert.match(content, /"profile_found"/);
    assert.match(content, /"https:\/\/example.internal.portal\/profile\/disc-001"/);
    assert.match(content, /"skipped_disabled"/);

    const targetsContent = readFileSync(result.targetsOutputFilePath, "utf-8");
    assert.equal(
      targetsContent,
      [
        "target_id,target_type,target_value,enabled,note",
        "discovery-disc-001,profile_url,https://example.internal.portal/profile/disc-001,true,target from discovery",
        ""
      ].join("\n")
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

await runCase("invalid discovery CSV still returns validation errors", async () => {
  const csv = [
    "target_id,email,enabled",
    "disc-001,person@example.com,true"
  ].join("\n");

  const validation = validateDiscoveryInputCsvText(csv, checkedAt);
  const rows = await buildDiscoveryRunnerRows(validation, checkedAt);

  assert.equal(validation.fileErrors.length, 1);
  assert.equal(rows.length, 0);
});

console.log("discovery runner tests passed");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
