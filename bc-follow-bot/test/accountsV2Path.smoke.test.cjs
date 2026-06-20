const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { loadAppSettings } = require("../dist/shared/config.js");
const { loadAppInputs } = require("../dist/input/loadAppInputs.js");

function tempWorkspace() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "bc-follow-bot-accounts-v2-"));
}

function writeFile(baseDir, relativePath, content) {
  const fullPath = path.join(baseDir, relativePath);
  fs.writeFileSync(fullPath, content, "utf8");
  return fullPath;
}

function cleanup(baseDir) {
  fs.rmSync(baseDir, { recursive: true, force: true });
}

const tempDir = tempWorkspace();

try {
  const accountsV2Path = writeFile(
    tempDir,
    "accounts-v2.csv",
    [
      "email,password,first_name,last_name,company_name,country,city,created_at,language",
      "user1@example.com,pass-1,Jan,Kowalski,Example Corp,PL,Warsaw,2025-01-01,pl",
      "user2@example.com,pass-2,Ala,Nowak,Example Corp,PL,Krakow,2025-01-02,en"
    ].join("\n")
  );

  const configPath = writeFile(
    tempDir,
    "appsettings.smoke.json",
    JSON.stringify({
      headless: true,
      timeoutMs: 30000,
      slowMo: 0,
      debugScreenshots: false,
      baseUrl: "https://example.internal.portal",
      screenshotOnError: true,
      takeHtmlSnapshotOnError: true,
      delayBetweenTargetsMs: 0,
      accountsV2Path,
      maxFollowsPerRun: 3,
      preflightOperationWarningThreshold: 100
    })
  );
  const targetsPath = writeFile(
    tempDir,
    "targets.csv",
    [
      "target_id,target_type,target_value,enabled,note",
      "target-001,profile_url,https://example.internal.portal/profile/123,true,example profile URL target"
    ].join("\n")
  );

  const loadedSettings = loadAppSettings(configPath);
  assert.equal(loadedSettings.accountsV2Path, accountsV2Path);
  assert.equal(loadedSettings.maxFollowsPerRun, 3);
  assert.equal(loadedSettings.preflightOperationWarningThreshold, 100);

  const result = loadAppInputs({
    configPath,
    accountsPath: path.resolve(process.cwd(), "data", "accounts.csv"),
    targetsPath
  });

  assert.equal(result.fileErrors.length, 0);
  assert.ok(result.config);
  assert.equal(result.config.accountsV2Path, accountsV2Path);
  assert.equal(result.config.maxFollowsPerRun, 3);
  assert.equal(result.config.preflightOperationWarningThreshold, 100);
  assert.ok(result.accountsValid.length > 0);
  assert.equal(result.accountsValid.length, 2);
  assert.deepEqual(result.accountsValid, [
    {
      account_id: "acc_001",
      email: "user1@example.com",
      password: "pass-1",
      enabled: true,
      language: "pl",
      note: ""
    },
    {
      account_id: "acc_002",
      email: "user2@example.com",
      password: "pass-2",
      enabled: true,
      language: "en",
      note: ""
    }
  ]);
  assert.ok(result.targetsValid.length > 0);
  assert.equal(result.targetsValid[0].target_id, "target-001");
  assert.equal(result.targetsValid[0].target_type, "profile_url");
  assert.equal(
    result.targetsValid[0].target_value,
    "https://example.internal.portal/profile/123"
  );

  console.log("accountsV2Path smoke test passed");
} finally {
  cleanup(tempDir);
}
