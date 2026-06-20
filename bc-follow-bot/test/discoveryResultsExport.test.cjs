const assert = require("node:assert/strict");
const { existsSync, mkdtempSync, readFileSync, rmSync } = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
  appendDiscoveryResult,
  appendDiscoveryResults,
  createDiscoveryTargetsExport,
  createDiscoveryResultsExport
} = require("../dist/discovery/discoveryResultsExport.js");

function runCase(name, fn) {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`fail - ${name}`);
    throw error;
  }
}

function tempWorkspace() {
  return mkdtempSync(path.join(os.tmpdir(), "bc-follow-bot-discovery-results-"));
}

runCase("discovery export creates file with header and escaped rows", () => {
  const dir = tempWorkspace();

  try {
    const exportDate = new Date(2026, 0, 2, 3, 4, 5);
    const runExport = createDiscoveryResultsExport(exportDate, dir);
    const expectedPath = path.join(dir, "discovery-results-20260102-030405.csv");

    assert.equal(runExport.runId, "20260102-030405");
    assert.equal(runExport.filePath, expectedPath);
    assert.equal(existsSync(expectedPath), true);

    appendDiscoveryResult(runExport.filePath, {
      target_id: "disc,001",
      input_email: "person@example.com",
      input_first_name: "Person",
      input_last_name: "One",
      input_company: 'Example "Company"',
      input_country: "PL",
      input_city: "Warsaw",
      discovery_status: "found_single",
      profile_url: "https://example.test/profile/123",
      confidence: "high",
      reason: "single exact match",
      checked_at: "2026-01-02T02:04:06.000Z",
      note: "comma, quote \" and newline\ninside"
    });

    appendDiscoveryResults(runExport.filePath, [
      {
        target_id: "disc-002",
        input_email: "",
        input_first_name: "Person",
        input_last_name: "Two",
        input_company: "Example Company",
        input_country: "PL",
        input_city: "Krakow",
        discovery_status: "not_found",
        profile_url: "",
        confidence: "none",
        reason: "no result",
        checked_at: "2026-01-02T02:04:07.000Z",
        note: ""
      }
    ]);

    const content = readFileSync(expectedPath, "utf-8");

    assert.match(
      content,
      /^"target_id","input_email","input_first_name","input_last_name","input_company","input_country","input_city","discovery_status","profile_url","confidence","reason","checked_at","note"\n/
    );
    assert.match(content, /"disc,001"/);
    assert.match(content, /"Example ""Company"""/);
    assert.match(content, /"comma, quote "" and newline\ninside"/);
    assert.match(content, /"not_found"/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

runCase("discovery targets export writes only profile_found rows in targets format", () => {
  const dir = tempWorkspace();

  try {
    const exportDate = new Date(2026, 0, 2, 3, 4, 5);
    const targetExport = createDiscoveryTargetsExport([
      {
        target_id: "disc-001",
        input_email: "person@example.com",
        input_first_name: "Person",
        input_last_name: "One",
        input_company: "Example Company",
        input_country: "PL",
        input_city: "Warsaw",
        discovery_status: "profile_found",
        profile_url: "https://example.internal.portal/profile/123",
        confidence: "high",
        reason: "single person profile found",
        checked_at: "2026-01-02T02:04:06.000Z",
        note: "enabled"
      },
      {
        target_id: "disc-002",
        input_email: "person2@example.com",
        input_first_name: "Person",
        input_last_name: "Two",
        input_company: "Example Company",
        input_country: "PL",
        input_city: "Krakow",
        discovery_status: "ambiguous_result",
        profile_url: "https://example.internal.portal/profile/ambiguous",
        confidence: "low",
        reason: "multiple profile candidates",
        checked_at: "2026-01-02T02:04:07.000Z",
        note: ""
      },
      {
        target_id: "disc-003",
        input_email: "person3@example.com",
        input_first_name: "Person",
        input_last_name: "Three",
        input_company: "Example Company",
        input_country: "PL",
        input_city: "Gdansk",
        discovery_status: "not_found",
        profile_url: "",
        confidence: "none",
        reason: "no result",
        checked_at: "2026-01-02T02:04:08.000Z",
        note: ""
      },
      {
        target_id: "disc-004",
        input_email: "person4@example.com",
        input_first_name: "Person",
        input_last_name: "Four",
        input_company: "Example Company",
        input_country: "PL",
        input_city: "Poznan",
        discovery_status: "portal_error",
        profile_url: "https://example.internal.portal/profile/error",
        confidence: "none",
        reason: "portal error",
        checked_at: "2026-01-02T02:04:09.000Z",
        note: ""
      }
    ], exportDate, dir);
    const expectedPath = path.join(dir, "discovery-targets-20260102-030405.csv");

    assert.equal(targetExport.runId, "20260102-030405");
    assert.equal(targetExport.filePath, expectedPath);
    assert.equal(targetExport.writtenCount, 1);
    assert.equal(existsSync(expectedPath), true);

    const content = readFileSync(expectedPath, "utf-8");

    assert.equal(
      content,
      [
        "target_id,target_type,target_value,enabled,note",
        "discovery-disc-001,profile_url,https://example.internal.portal/profile/123,true,target from discovery",
        ""
      ].join("\n")
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

console.log("discovery results export tests passed");
