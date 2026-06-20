const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { loadAppInputs } = require("../dist/input/loadAppInputs.js");

function tempWorkspace() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "bc-follow-bot-"));
}

function writeFile(baseDir, relativePath, content) {
  const fullPath = path.join(baseDir, relativePath);
  fs.writeFileSync(fullPath, content, "utf8");
  return fullPath;
}

function cleanup(baseDir) {
  fs.rmSync(baseDir, { recursive: true, force: true });
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

function runCase(name, fn) {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`fail - ${name}`);
    throw error;
  }
}

runCase("quoted csv fields with commas are parsed", () => {
  const dir = tempWorkspace();
  try {
    const configPath = writeFile(
      dir,
      "config.json",
      Buffer.from(configJson())
    );

    const accountsPath = writeFile(
      dir,
      "accounts.csv",
      [
        "account_id,email,password,enabled,note",
        'acc-001,operator1@example.com,change-me,true,"primary, account"'
      ].join("\n")
    );

    const targetsPath = writeFile(
      dir,
      "targets.csv",
      [
        "target_id,target_type,target_value,enabled,note",
        'target-001,profile_url,"https://example.internal.portal/profile/123?x=1,2",true,"target, main"'
      ].join("\n")
    );

    const result = loadAppInputs({ configPath, accountsPath, targetsPath });
    assert.equal(result.fileErrors.length, 0);
    assert.equal(result.accountsValid[0].note, "primary, account");
    assert.equal(result.accountsValid[0].language, "unknown");
    assert.equal(result.targetsValid[0].target_value, "https://example.internal.portal/profile/123?x=1,2");
    assert.equal(result.targetsValid[0].note, "target, main");
  } finally {
    cleanup(dir);
  }
});

runCase("account language is accepted and normalized", () => {
  const dir = tempWorkspace();
  try {
    const configPath = writeFile(
      dir,
      "config.json",
      configJson()
    );
    const accountsPath = writeFile(
      dir,
      "accounts.csv",
      [
        "account_id,email,password,enabled,language,note",
        "acc-001,operator1@example.com,change-me,true,PL,polish account"
      ].join("\n")
    );
    const targetsPath = writeFile(
      dir,
      "targets.csv",
      [
        "target_id,target_type,target_value,enabled,note",
        "target-001,profile_url,https://example.internal.portal/profile/123,true,ok"
      ].join("\n")
    );

    const result = loadAppInputs({ configPath, accountsPath, targetsPath });
    assert.equal(result.fileErrors.length, 0);
    assert.equal(result.accountsRejected.length, 0);
    assert.equal(result.accountsValid.length, 1);
    assert.equal(result.accountsValid[0].language, "pl");
  } finally {
    cleanup(dir);
  }
});

runCase("missing account language defaults to unknown", () => {
  const dir = tempWorkspace();
  try {
    const configPath = writeFile(
      dir,
      "config.json",
      configJson()
    );
    const accountsPath = writeFile(
      dir,
      "accounts.csv",
      [
        "account_id,email,password,enabled,note",
        "acc-001,operator1@example.com,change-me,true,old format"
      ].join("\n")
    );
    const targetsPath = writeFile(
      dir,
      "targets.csv",
      [
        "target_id,target_type,target_value,enabled,note",
        "target-001,profile_url,https://example.internal.portal/profile/123,true,ok"
      ].join("\n")
    );

    const result = loadAppInputs({ configPath, accountsPath, targetsPath });
    assert.equal(result.fileErrors.length, 0);
    assert.equal(result.accountsRejected.length, 0);
    assert.equal(result.accountsValid.length, 1);
    assert.equal(result.accountsValid[0].language, "unknown");
  } finally {
    cleanup(dir);
  }
});

runCase("invalid account language is rejected", () => {
  const dir = tempWorkspace();
  try {
    const configPath = writeFile(
      dir,
      "config.json",
      configJson()
    );
    const accountsPath = writeFile(
      dir,
      "accounts.csv",
      [
        "account_id,email,password,enabled,language,note",
        "acc-001,operator1@example.com,change-me,true,polish-language-text,invalid language"
      ].join("\n")
    );
    const targetsPath = writeFile(
      dir,
      "targets.csv",
      [
        "target_id,target_type,target_value,enabled,note",
        "target-001,profile_url,https://example.internal.portal/profile/123,true,ok"
      ].join("\n")
    );

    const result = loadAppInputs({ configPath, accountsPath, targetsPath });
    assert.equal(result.fileErrors.length, 0);
    assert.equal(result.accountsValid.length, 0);
    assert.equal(result.accountsRejected.length, 1);
    assert.equal(result.accountsRejected[0].issues[0].field, "language");
    assert.equal(result.accountsRejected[0].issues[0].code, "invalid_language");
    assert.match(result.accountsRejected[0].issues[0].message, /language/);
  } finally {
    cleanup(dir);
  }
});

runCase("missing file is reported", () => {
  const dir = tempWorkspace();
  try {
    const configPath = writeFile(
      dir,
      "config.json",
      configJson()
    );
    const targetsPath = writeFile(
      dir,
      "targets.csv",
      [
        "target_id,target_type,target_value,enabled,note",
        "target-001,profile_url,https://example.internal.portal/profile/123,true,ok"
      ].join("\n")
    );

    const result = loadAppInputs({
      configPath,
      accountsPath: path.join(dir, "missing.csv"),
      targetsPath
    });

    assert.equal(result.fileErrors.length, 1);
    assert.match(result.fileErrors[0].message, /no such file|ENOENT/i);
  } finally {
    cleanup(dir);
  }
});

runCase("empty csv is reported", () => {
  const dir = tempWorkspace();
  try {
    const configPath = writeFile(
      dir,
      "config.json",
      configJson()
    );
    const accountsPath = writeFile(dir, "accounts.csv", "account_id,email,password,enabled,note\n");
    const targetsPath = writeFile(
      dir,
      "targets.csv",
      [
        "target_id,target_type,target_value,enabled,note",
        "target-001,profile_url,https://example.internal.portal/profile/123,true,ok"
      ].join("\n")
    );

    const result = loadAppInputs({ configPath, accountsPath, targetsPath });
    assert.equal(result.fileErrors.length, 1);
    assert.match(result.fileErrors[0].message, /nie zawiera danych|empty/i);
  } finally {
    cleanup(dir);
  }
});

runCase("missing required headers are reported", () => {
  const dir = tempWorkspace();
  try {
    const configPath = writeFile(
      dir,
      "config.json",
      configJson()
    );
    const accountsPath = writeFile(
      dir,
      "accounts.csv",
      ["account_id,email,password", "acc-001,operator1@example.com,change-me"].join("\n")
    );
    const targetsPath = writeFile(
      dir,
      "targets.csv",
      [
        "target_id,target_type,target_value,enabled,note",
        "target-001,profile_url,https://example.internal.portal/profile/123,true,ok"
      ].join("\n")
    );

    const result = loadAppInputs({ configPath, accountsPath, targetsPath });
    assert.equal(result.fileErrors.length, 1);
    assert.match(result.fileErrors[0].message, /brakuje nagłówków|missing/i);
  } finally {
    cleanup(dir);
  }
});

runCase("missing required field in row is rejected", () => {
  const dir = tempWorkspace();
  try {
    const configPath = writeFile(
      dir,
      "config.json",
      configJson()
    );
    const accountsPath = writeFile(
      dir,
      "accounts.csv",
      [
        "account_id,email,password,enabled,note",
        "acc-001,operator1@example.com,,true,missing password"
      ].join("\n")
    );
    const targetsPath = writeFile(
      dir,
      "targets.csv",
      [
        "target_id,target_type,target_value,enabled,note",
        "target-001,profile_url,https://example.internal.portal/profile/123,true,ok"
      ].join("\n")
    );

    const result = loadAppInputs({ configPath, accountsPath, targetsPath });
    assert.equal(result.accountsValid.length, 0);
    assert.equal(result.accountsRejected.length, 1);
    assert.equal(result.accountsRejected[0].issues[0].code, "missing_required_field");
  } finally {
    cleanup(dir);
  }
});

runCase("invalid email is rejected", () => {
  const dir = tempWorkspace();
  try {
    const configPath = writeFile(
      dir,
      "config.json",
      configJson()
    );
    const accountsPath = writeFile(
      dir,
      "accounts.csv",
      [
        "account_id,email,password,enabled,note",
        "acc-001,not-an-email,change-me,true,invalid email"
      ].join("\n")
    );
    const targetsPath = writeFile(
      dir,
      "targets.csv",
      [
        "target_id,target_type,target_value,enabled,note",
        "target-001,profile_url,https://example.internal.portal/profile/123,true,ok"
      ].join("\n")
    );

    const result = loadAppInputs({ configPath, accountsPath, targetsPath });
    assert.equal(result.accountsValid.length, 0);
    assert.equal(result.accountsRejected.length, 1);
    assert.equal(result.accountsRejected[0].issues[0].code, "invalid_email");
  } finally {
    cleanup(dir);
  }
});

runCase("enabled false records are skipped", () => {
  const dir = tempWorkspace();
  try {
    const configPath = writeFile(
      dir,
      "config.json",
      configJson()
    );
    const accountsPath = writeFile(
      dir,
      "accounts.csv",
      [
        "account_id,email,password,enabled,note",
        "acc-001,operator1@example.com,change-me,false,disabled"
      ].join("\n")
    );
    const targetsPath = writeFile(
      dir,
      "targets.csv",
      [
        "target_id,target_type,target_value,enabled,note",
        "target-001,profile_url,https://example.internal.portal/profile/123,true,ok"
      ].join("\n")
    );

    const result = loadAppInputs({ configPath, accountsPath, targetsPath });
    assert.equal(result.accountsValid.length, 0);
    assert.equal(result.accountsRejected.length, 0);
    assert.equal(result.fileErrors.length, 0);
  } finally {
    cleanup(dir);
  }
});

runCase("invalid json is reported", () => {
  const dir = tempWorkspace();
  try {
    const configPath = writeFile(dir, "config.json", "{ not valid json");
    const accountsPath = writeFile(
      dir,
      "accounts.csv",
      [
        "account_id,email,password,enabled,note",
        "acc-001,operator1@example.com,change-me,true,ok"
      ].join("\n")
    );
    const targetsPath = writeFile(
      dir,
      "targets.csv",
      [
        "target_id,target_type,target_value,enabled,note",
        "target-001,profile_url,https://example.internal.portal/profile/123,true,ok"
      ].join("\n")
    );

    const result = loadAppInputs({ configPath, accountsPath, targetsPath });
    assert.equal(result.config, null);
    assert.equal(result.fileErrors.length, 1);
  } finally {
    cleanup(dir);
  }
});

runCase("bom is ignored", () => {
  const dir = tempWorkspace();
  try {
    const configPath = writeFile(
      dir,
      "config.json",
      "\ufeff" +
        configJson()
    );
    const accountsPath = writeFile(
      dir,
      "accounts.csv",
      "\ufeff" +
        [
          "account_id,email,password,enabled,note",
          "acc-001,operator1@example.com,change-me,true,ok"
        ].join("\n")
    );
    const targetsPath = writeFile(
      dir,
      "targets.csv",
      [
        "target_id,target_type,target_value,enabled,note",
        "target-001,profile_url,https://example.internal.portal/profile/123,true,ok"
      ].join("\n")
    );

    const result = loadAppInputs({ configPath, accountsPath, targetsPath });
    assert.equal(result.fileErrors.length, 0);
    assert.equal(result.accountsValid.length, 1);
    assert.equal(result.config.baseUrl, "https://example.internal.portal");
  } finally {
    cleanup(dir);
  }
});

runCase("target types are preserved for search stage", () => {
  const dir = tempWorkspace();
  try {
    const configPath = writeFile(
      dir,
      "config.json",
      configJson()
    );
    const accountsPath = writeFile(
      dir,
      "accounts.csv",
      [
        "account_id,email,password,enabled,note",
        "acc-001,operator1@example.com,change-me,true,ok"
      ].join("\n")
    );
    const targetsPath = writeFile(
      dir,
      "targets.csv",
      [
        "target_id,target_type,target_value,enabled,note",
        "target-001,profile_url,https://example.internal.portal/profile/123,true,url target",
        "target-002,email,person@example.com,true,email target",
        "target-003,full_name,Jan Kowalski,true,name target"
      ].join("\n")
    );

    const result = loadAppInputs({ configPath, accountsPath, targetsPath });
    assert.equal(result.fileErrors.length, 0);
    assert.equal(result.targetsValid.length, 3);
    assert.equal(result.targetsValid[0].target_type, "profile_url");
    assert.equal(result.targetsValid[1].target_type, "email");
    assert.equal(result.targetsValid[2].target_type, "full_name");
  } finally {
    cleanup(dir);
  }
});

runCase("v2 accounts csv is loaded when config points to alternate file", () => {
  const dir = tempWorkspace();
  try {
    const configPath = writeFile(
      dir,
      "config.json",
      configJson({ accountsV2Path: "accounts_export.csv" })
    );

    const accountsPath = writeFile(
      dir,
      "accounts.csv",
      [
        "account_id,email,password,enabled,note",
        "acc-legacy,legacy@example.com,legacy-pass,true,legacy"
      ].join("\n")
    );

    const accountsV2Path = writeFile(
      dir,
      "accounts_export.csv",
      [
        "email,password,first_name,last_name,company_name,country,city,created_at,language",
        "user1@example.com,pass-1,,,,,,,pl",
        "user2@example.com,pass-2,Name,Surname,Example Corp,PL,,,en"
      ].join("\n")
    );

    const targetsPath = writeFile(
      dir,
      "targets.csv",
      [
        "target_id,target_type,target_value,enabled,note",
        "target-001,profile_url,https://example.internal.portal/profile/123,true,ok"
      ].join("\n")
    );

    const result = loadAppInputs({ configPath, accountsPath, targetsPath });
    assert.equal(result.fileErrors.length, 0);
    assert.equal(result.accountsRejected.length, 0);
    assert.equal(result.accountsValid.length, 2);
    assert.equal(result.accountsValid[0].account_id, "acc_001");
    assert.equal(result.accountsValid[1].account_id, "acc_002");
    assert.equal(result.accountsValid[0].enabled, true);
    assert.equal(result.accountsValid[0].language, "pl");
    assert.equal(result.accountsValid[1].language, "en");
    assert.equal(result.accountsValid[0].note, "");
    assert.equal(result.config.accountsV2Path, "accounts_export.csv");
    assert.equal(accountsV2Path.endsWith("accounts_export.csv"), true);
  } finally {
    cleanup(dir);
  }
});

runCase("v2 missing language defaults to unknown", () => {
  const dir = tempWorkspace();
  try {
    const configPath = writeFile(
      dir,
      "config.json",
      configJson({ accountsV2Path: "accounts_export.csv" })
    );

    const targetsPath = writeFile(
      dir,
      "targets.csv",
      [
        "target_id,target_type,target_value,enabled,note",
        "target-001,profile_url,https://example.internal.portal/profile/123,true,ok"
      ].join("\n")
    );

    writeFile(
      dir,
      "accounts_export.csv",
      [
        "email,password,first_name,last_name,company_name,country,city,created_at",
        "user1@example.com,pass-1,,,,,,"
      ].join("\n")
    );

    const result = loadAppInputs({
      configPath,
      accountsPath: path.join(dir, "unused-accounts.csv"),
      targetsPath
    });

    assert.equal(result.fileErrors.length, 0);
    assert.equal(result.accountsRejected.length, 0);
    assert.equal(result.accountsValid.length, 1);
    assert.equal(result.accountsValid[0].language, "unknown");
  } finally {
    cleanup(dir);
  }
});

runCase("v2 invalid language is rejected", () => {
  const dir = tempWorkspace();
  try {
    const configPath = writeFile(
      dir,
      "config.json",
      configJson({ accountsV2Path: "accounts_export.csv" })
    );

    const targetsPath = writeFile(
      dir,
      "targets.csv",
      [
        "target_id,target_type,target_value,enabled,note",
        "target-001,profile_url,https://example.internal.portal/profile/123,true,ok"
      ].join("\n")
    );

    writeFile(
      dir,
      "accounts_export.csv",
      [
        "email,password,first_name,last_name,company_name,country,city,created_at,language",
        "user1@example.com,pass-1,,,,,,,too-long-language"
      ].join("\n")
    );

    const result = loadAppInputs({
      configPath,
      accountsPath: path.join(dir, "unused-accounts.csv"),
      targetsPath
    });

    assert.equal(result.fileErrors.length, 0);
    assert.equal(result.accountsValid.length, 0);
    assert.equal(result.accountsRejected.length, 1);
    assert.equal(result.accountsRejected[0].issues[0].field, "language");
    assert.equal(result.accountsRejected[0].issues[0].code, "invalid_language");
  } finally {
    cleanup(dir);
  }
});

runCase("maxFollowsPerRun is optional and accepted as non-negative integer", () => {
  const dir = tempWorkspace();
  try {
    const configPath = writeFile(
      dir,
      "config.json",
      configJson({ maxFollowsPerRun: 0 })
    );
    const accountsPath = writeFile(
      dir,
      "accounts.csv",
      [
        "account_id,email,password,enabled,note",
        "acc-001,operator1@example.com,change-me,true,ok"
      ].join("\n")
    );
    const targetsPath = writeFile(
      dir,
      "targets.csv",
      [
        "target_id,target_type,target_value,enabled,note",
        "target-001,profile_url,https://example.internal.portal/profile/123,true,ok"
      ].join("\n")
    );

    const result = loadAppInputs({ configPath, accountsPath, targetsPath });
    assert.equal(result.fileErrors.length, 0);
    assert.equal(result.config.maxFollowsPerRun, 0);
  } finally {
    cleanup(dir);
  }
});

runCase("maxFollowsPerRun rejects negative and non numeric values", () => {
  for (const value of [-1, "2"]) {
    const dir = tempWorkspace();
    try {
      const configPath = writeFile(
        dir,
        "config.json",
        configJson({ maxFollowsPerRun: value })
      );
      const accountsPath = writeFile(
        dir,
        "accounts.csv",
        [
          "account_id,email,password,enabled,note",
          "acc-001,operator1@example.com,change-me,true,ok"
        ].join("\n")
      );
      const targetsPath = writeFile(
        dir,
        "targets.csv",
        [
          "target_id,target_type,target_value,enabled,note",
          "target-001,profile_url,https://example.internal.portal/profile/123,true,ok"
        ].join("\n")
      );

      const result = loadAppInputs({ configPath, accountsPath, targetsPath });
      assert.equal(result.config, null);
      assert.equal(result.fileErrors.length, 1);
      assert.match(result.fileErrors[0].message, /maxFollowsPerRun/);
    } finally {
      cleanup(dir);
    }
  }
});

runCase("preflightOperationWarningThreshold is optional and accepted as non-negative integer", () => {
  const dir = tempWorkspace();
  try {
    const configPath = writeFile(
      dir,
      "config.json",
      configJson({ preflightOperationWarningThreshold: 100 })
    );
    const accountsPath = writeFile(
      dir,
      "accounts.csv",
      [
        "account_id,email,password,enabled,note",
        "acc-001,operator1@example.com,change-me,true,ok"
      ].join("\n")
    );
    const targetsPath = writeFile(
      dir,
      "targets.csv",
      [
        "target_id,target_type,target_value,enabled,note",
        "target-001,profile_url,https://example.internal.portal/profile/123,true,ok"
      ].join("\n")
    );

    const result = loadAppInputs({ configPath, accountsPath, targetsPath });
    assert.equal(result.fileErrors.length, 0);
    assert.equal(result.config.preflightOperationWarningThreshold, 100);
  } finally {
    cleanup(dir);
  }
});

runCase("preflightOperationWarningThreshold rejects negative and non numeric values", () => {
  for (const value of [-1, "100"]) {
    const dir = tempWorkspace();
    try {
      const configPath = writeFile(
        dir,
        "config.json",
        configJson({ preflightOperationWarningThreshold: value })
      );
      const accountsPath = writeFile(
        dir,
        "accounts.csv",
        [
          "account_id,email,password,enabled,note",
          "acc-001,operator1@example.com,change-me,true,ok"
        ].join("\n")
      );
      const targetsPath = writeFile(
        dir,
        "targets.csv",
        [
          "target_id,target_type,target_value,enabled,note",
          "target-001,profile_url,https://example.internal.portal/profile/123,true,ok"
        ].join("\n")
      );

      const result = loadAppInputs({ configPath, accountsPath, targetsPath });
      assert.equal(result.config, null);
      assert.equal(result.fileErrors.length, 1);
      assert.match(result.fileErrors[0].message, /preflightOperationWarningThreshold/);
    } finally {
      cleanup(dir);
    }
  }
});

runCase("requireManualConfirmForLargeRun defaults to true and accepts boolean", () => {
  const dir = tempWorkspace();
  try {
    const configPath = writeFile(
      dir,
      "config.json",
      configJson({ requireManualConfirmForLargeRun: false })
    );
    const accountsPath = writeFile(
      dir,
      "accounts.csv",
      [
        "account_id,email,password,enabled,note",
        "acc-001,operator1@example.com,change-me,true,ok"
      ].join("\n")
    );
    const targetsPath = writeFile(
      dir,
      "targets.csv",
      [
        "target_id,target_type,target_value,enabled,note",
        "target-001,profile_url,https://example.internal.portal/profile/123,true,ok"
      ].join("\n")
    );

    const result = loadAppInputs({ configPath, accountsPath, targetsPath });
    assert.equal(result.fileErrors.length, 0);
    assert.equal(result.config.requireManualConfirmForLargeRun, false);
  } finally {
    cleanup(dir);
  }

  const defaultDir = tempWorkspace();
  try {
    const configPath = writeFile(defaultDir, "config.json", configJson());
    const accountsPath = writeFile(
      defaultDir,
      "accounts.csv",
      [
        "account_id,email,password,enabled,note",
        "acc-001,operator1@example.com,change-me,true,ok"
      ].join("\n")
    );
    const targetsPath = writeFile(
      defaultDir,
      "targets.csv",
      [
        "target_id,target_type,target_value,enabled,note",
        "target-001,profile_url,https://example.internal.portal/profile/123,true,ok"
      ].join("\n")
    );

    const result = loadAppInputs({ configPath, accountsPath, targetsPath });
    assert.equal(result.fileErrors.length, 0);
    assert.equal(result.config.requireManualConfirmForLargeRun, true);
  } finally {
    cleanup(defaultDir);
  }
});

runCase("requireManualConfirmForLargeRun rejects non boolean values", () => {
  const dir = tempWorkspace();
  try {
    const configPath = writeFile(
      dir,
      "config.json",
      configJson({ requireManualConfirmForLargeRun: "false" })
    );
    const accountsPath = writeFile(
      dir,
      "accounts.csv",
      [
        "account_id,email,password,enabled,note",
        "acc-001,operator1@example.com,change-me,true,ok"
      ].join("\n")
    );
    const targetsPath = writeFile(
      dir,
      "targets.csv",
      [
        "target_id,target_type,target_value,enabled,note",
        "target-001,profile_url,https://example.internal.portal/profile/123,true,ok"
      ].join("\n")
    );

    const result = loadAppInputs({ configPath, accountsPath, targetsPath });
    assert.equal(result.config, null);
    assert.equal(result.fileErrors.length, 1);
    assert.match(result.fileErrors[0].message, /requireManualConfirmForLargeRun/);
  } finally {
    cleanup(dir);
  }
});

runCase("content publish limits default safely", () => {
  const dir = tempWorkspace();
  try {
    const configPath = writeFile(
      dir,
      "config.json",
      configJson()
    );
    const accountsPath = writeFile(
      dir,
      "accounts.csv",
      [
        "account_id,email,password,enabled,note",
        "acc-001,operator1@example.com,change-me,true,ok"
      ].join("\n")
    );
    const targetsPath = writeFile(
      dir,
      "targets.csv",
      [
        "target_id,target_type,target_value,enabled,note",
        "target-001,profile_url,https://example.internal.portal/profile/123,true,ok"
      ].join("\n")
    );

    const result = loadAppInputs({ configPath, accountsPath, targetsPath });
    assert.equal(result.fileErrors.length, 0);
    assert.equal(result.config.maxContentPublishesPerRun, 3);
    assert.equal(result.config.maxContentPublishesPerAccount, 1);
  } finally {
    cleanup(dir);
  }
});

runCase("content browser dry-run limits default safely", () => {
  const dir = tempWorkspace();
  try {
    const configPath = writeFile(
      dir,
      "config.json",
      configJson()
    );
    const accountsPath = writeFile(
      dir,
      "accounts.csv",
      [
        "account_id,email,password,enabled,note",
        "acc-001,operator1@example.com,change-me,true,ok"
      ].join("\n")
    );
    const targetsPath = writeFile(
      dir,
      "targets.csv",
      [
        "target_id,target_type,target_value,enabled,note",
        "target-001,profile_url,https://example.internal.portal/profile/123,true,ok"
      ].join("\n")
    );

    const result = loadAppInputs({ configPath, accountsPath, targetsPath });
    assert.equal(result.fileErrors.length, 0);
    assert.equal(result.config.maxContentBrowserDryRunPerRun, 3);
    assert.equal(result.config.maxContentBrowserDryRunPerAccount, 1);
  } finally {
    cleanup(dir);
  }
});

runCase("content manual publish settings default safely", () => {
  const dir = tempWorkspace();
  try {
    const configPath = writeFile(
      dir,
      "config.json",
      configJson()
    );
    const accountsPath = writeFile(
      dir,
      "accounts.csv",
      [
        "account_id,email,password,enabled,note",
        "acc-001,operator1@example.com,change-me,true,ok"
      ].join("\n")
    );
    const targetsPath = writeFile(
      dir,
      "targets.csv",
      [
        "target_id,target_type,target_value,enabled,note",
        "target-001,profile_url,https://example.internal.portal/profile/123,true,ok"
      ].join("\n")
    );

    const result = loadAppInputs({ configPath, accountsPath, targetsPath });
    assert.equal(result.fileErrors.length, 0);
    assert.equal(result.config.maxContentManualPublishesPerRun, 1);
    assert.equal(result.config.maxContentManualPublishesPerAccount, 1);
    assert.equal(result.config.maxContentTitleLength, 120);
    assert.equal(result.config.requireFinalManualConfirmBeforePublish, true);
  } finally {
    cleanup(dir);
  }
});

runCase("AI draft settings default safely", () => {
  const dir = tempWorkspace();
  try {
    const configPath = writeFile(
      dir,
      "config.json",
      configJson()
    );
    const accountsPath = writeFile(
      dir,
      "accounts.csv",
      [
        "account_id,email,password,enabled,note",
        "acc-001,operator1@example.com,change-me,true,ok"
      ].join("\n")
    );
    const targetsPath = writeFile(
      dir,
      "targets.csv",
      [
        "target_id,target_type,target_value,enabled,note",
        "target-001,profile_url,https://example.internal.portal/profile/123,true,ok"
      ].join("\n")
    );

    const result = loadAppInputs({ configPath, accountsPath, targetsPath });
    assert.equal(result.fileErrors.length, 0);
    assert.equal(result.config.aiDraftsEnabled, false);
    assert.equal(result.config.aiDraftProvider, "openai-compatible");
    assert.equal(result.config.aiDraftModel, "gpt-4.1-mini");
    assert.equal(result.config.maxContentAiDraftsPerRun, 5);
    assert.equal(result.config.maxContentDraftTextLength, 1200);
    assert.equal(result.config.maxContentDraftTitleLength, 120);
  } finally {
    cleanup(dir);
  }
});

runCase("AI draft settings accept valid values", () => {
  const dir = tempWorkspace();
  try {
    const configPath = writeFile(
      dir,
      "config.json",
      configJson({
        aiDraftsEnabled: true,
        aiDraftProvider: "openai-compatible",
        aiDraftModel: "mock-model",
        maxContentAiDraftsPerRun: 2,
        maxContentDraftTextLength: 800,
        maxContentDraftTitleLength: 80
      })
    );
    const accountsPath = writeFile(
      dir,
      "accounts.csv",
      [
        "account_id,email,password,enabled,note",
        "acc-001,operator1@example.com,change-me,true,ok"
      ].join("\n")
    );
    const targetsPath = writeFile(
      dir,
      "targets.csv",
      [
        "target_id,target_type,target_value,enabled,note",
        "target-001,profile_url,https://example.internal.portal/profile/123,true,ok"
      ].join("\n")
    );

    const result = loadAppInputs({ configPath, accountsPath, targetsPath });
    assert.equal(result.fileErrors.length, 0);
    assert.equal(result.config.aiDraftsEnabled, true);
    assert.equal(result.config.aiDraftProvider, "openai-compatible");
    assert.equal(result.config.aiDraftModel, "mock-model");
    assert.equal(result.config.maxContentAiDraftsPerRun, 2);
    assert.equal(result.config.maxContentDraftTextLength, 800);
    assert.equal(result.config.maxContentDraftTitleLength, 80);
  } finally {
    cleanup(dir);
  }
});

runCase("AI draft settings reject invalid values", () => {
  for (const extra of [
    { aiDraftsEnabled: "true" },
    { aiDraftProvider: "other-provider" },
    { aiDraftModel: "" },
    { maxContentAiDraftsPerRun: -1 },
    { maxContentAiDraftsPerRun: "5" },
    { maxContentDraftTextLength: -1 },
    { maxContentDraftTextLength: "1200" },
    { maxContentDraftTitleLength: -1 },
    { maxContentDraftTitleLength: "120" }
  ]) {
    const dir = tempWorkspace();
    try {
      const configPath = writeFile(
        dir,
        "config.json",
        configJson(extra)
      );
      const accountsPath = writeFile(
        dir,
        "accounts.csv",
        [
          "account_id,email,password,enabled,note",
          "acc-001,operator1@example.com,change-me,true,ok"
        ].join("\n")
      );
      const targetsPath = writeFile(
        dir,
        "targets.csv",
        [
          "target_id,target_type,target_value,enabled,note",
          "target-001,profile_url,https://example.internal.portal/profile/123,true,ok"
        ].join("\n")
      );

      const result = loadAppInputs({ configPath, accountsPath, targetsPath });
      assert.equal(result.config, null);
      assert.equal(result.fileErrors.length, 1);
      assert.match(
        result.fileErrors[0].message,
        /aiDraftsEnabled|aiDraftProvider|aiDraftModel|maxContentAiDraftsPerRun|maxContentDraftTextLength|maxContentDraftTitleLength/
      );
    } finally {
      cleanup(dir);
    }
  }
});

runCase("content publish limits accept non-negative integers", () => {
  const dir = tempWorkspace();
  try {
    const configPath = writeFile(
      dir,
      "config.json",
      configJson({
        maxContentPublishesPerRun: 4,
        maxContentPublishesPerAccount: 2
      })
    );
    const accountsPath = writeFile(
      dir,
      "accounts.csv",
      [
        "account_id,email,password,enabled,note",
        "acc-001,operator1@example.com,change-me,true,ok"
      ].join("\n")
    );
    const targetsPath = writeFile(
      dir,
      "targets.csv",
      [
        "target_id,target_type,target_value,enabled,note",
        "target-001,profile_url,https://example.internal.portal/profile/123,true,ok"
      ].join("\n")
    );

    const result = loadAppInputs({ configPath, accountsPath, targetsPath });
    assert.equal(result.fileErrors.length, 0);
    assert.equal(result.config.maxContentPublishesPerRun, 4);
    assert.equal(result.config.maxContentPublishesPerAccount, 2);
  } finally {
    cleanup(dir);
  }
});

runCase("content manual publish settings accept valid values", () => {
  const dir = tempWorkspace();
  try {
    const configPath = writeFile(
      dir,
      "config.json",
      configJson({
        maxContentManualPublishesPerRun: 2,
        maxContentManualPublishesPerAccount: 1,
        maxContentTitleLength: 120,
        requireFinalManualConfirmBeforePublish: true
      })
    );
    const accountsPath = writeFile(
      dir,
      "accounts.csv",
      [
        "account_id,email,password,enabled,note",
        "acc-001,operator1@example.com,change-me,true,ok"
      ].join("\n")
    );
    const targetsPath = writeFile(
      dir,
      "targets.csv",
      [
        "target_id,target_type,target_value,enabled,note",
        "target-001,profile_url,https://example.internal.portal/profile/123,true,ok"
      ].join("\n")
    );

    const result = loadAppInputs({ configPath, accountsPath, targetsPath });
    assert.equal(result.fileErrors.length, 0);
    assert.equal(result.config.maxContentManualPublishesPerRun, 2);
    assert.equal(result.config.maxContentManualPublishesPerAccount, 1);
    assert.equal(result.config.maxContentTitleLength, 120);
    assert.equal(result.config.requireFinalManualConfirmBeforePublish, true);
  } finally {
    cleanup(dir);
  }
});

runCase("content browser dry-run limits accept non-negative integers", () => {
  const dir = tempWorkspace();
  try {
    const configPath = writeFile(
      dir,
      "config.json",
      configJson({
        maxContentBrowserDryRunPerRun: 4,
        maxContentBrowserDryRunPerAccount: 2
      })
    );
    const accountsPath = writeFile(
      dir,
      "accounts.csv",
      [
        "account_id,email,password,enabled,note",
        "acc-001,operator1@example.com,change-me,true,ok"
      ].join("\n")
    );
    const targetsPath = writeFile(
      dir,
      "targets.csv",
      [
        "target_id,target_type,target_value,enabled,note",
        "target-001,profile_url,https://example.internal.portal/profile/123,true,ok"
      ].join("\n")
    );

    const result = loadAppInputs({ configPath, accountsPath, targetsPath });
    assert.equal(result.fileErrors.length, 0);
    assert.equal(result.config.maxContentBrowserDryRunPerRun, 4);
    assert.equal(result.config.maxContentBrowserDryRunPerAccount, 2);
  } finally {
    cleanup(dir);
  }
});

runCase("content publish limits reject invalid values", () => {
  for (const extra of [
    { maxContentPublishesPerRun: -1 },
    { maxContentPublishesPerRun: "3" },
    { maxContentPublishesPerAccount: -1 },
    { maxContentPublishesPerAccount: "1" }
  ]) {
    const dir = tempWorkspace();
    try {
      const configPath = writeFile(
        dir,
        "config.json",
        configJson(extra)
      );
      const accountsPath = writeFile(
        dir,
        "accounts.csv",
        [
          "account_id,email,password,enabled,note",
          "acc-001,operator1@example.com,change-me,true,ok"
        ].join("\n")
      );
      const targetsPath = writeFile(
        dir,
        "targets.csv",
        [
          "target_id,target_type,target_value,enabled,note",
          "target-001,profile_url,https://example.internal.portal/profile/123,true,ok"
        ].join("\n")
      );

      const result = loadAppInputs({ configPath, accountsPath, targetsPath });
      assert.equal(result.config, null);
      assert.equal(result.fileErrors.length, 1);
      assert.match(
        result.fileErrors[0].message,
        /maxContentPublishesPerRun|maxContentPublishesPerAccount/
      );
    } finally {
      cleanup(dir);
    }
  }
});

runCase("content manual publish settings reject invalid values", () => {
  for (const extra of [
    { maxContentManualPublishesPerRun: -1 },
    { maxContentManualPublishesPerRun: "1" },
    { maxContentManualPublishesPerAccount: -1 },
    { maxContentManualPublishesPerAccount: "1" },
    { maxContentTitleLength: -1 },
    { maxContentTitleLength: "120" },
    { requireFinalManualConfirmBeforePublish: "true" }
  ]) {
    const dir = tempWorkspace();
    try {
      const configPath = writeFile(
        dir,
        "config.json",
        configJson(extra)
      );
      const accountsPath = writeFile(
        dir,
        "accounts.csv",
        [
          "account_id,email,password,enabled,note",
          "acc-001,operator1@example.com,change-me,true,ok"
        ].join("\n")
      );
      const targetsPath = writeFile(
        dir,
        "targets.csv",
        [
          "target_id,target_type,target_value,enabled,note",
          "target-001,profile_url,https://example.internal.portal/profile/123,true,ok"
        ].join("\n")
      );

      const result = loadAppInputs({ configPath, accountsPath, targetsPath });
      assert.equal(result.config, null);
      assert.equal(result.fileErrors.length, 1);
      assert.match(
        result.fileErrors[0].message,
        /maxContentManualPublishesPerRun|maxContentManualPublishesPerAccount|maxContentTitleLength|requireFinalManualConfirmBeforePublish/
      );
    } finally {
      cleanup(dir);
    }
  }
});

runCase("content browser dry-run limits reject invalid values", () => {
  for (const extra of [
    { maxContentBrowserDryRunPerRun: -1 },
    { maxContentBrowserDryRunPerRun: "3" },
    { maxContentBrowserDryRunPerAccount: -1 },
    { maxContentBrowserDryRunPerAccount: "1" }
  ]) {
    const dir = tempWorkspace();
    try {
      const configPath = writeFile(
        dir,
        "config.json",
        configJson(extra)
      );
      const accountsPath = writeFile(
        dir,
        "accounts.csv",
        [
          "account_id,email,password,enabled,note",
          "acc-001,operator1@example.com,change-me,true,ok"
        ].join("\n")
      );
      const targetsPath = writeFile(
        dir,
        "targets.csv",
        [
          "target_id,target_type,target_value,enabled,note",
          "target-001,profile_url,https://example.internal.portal/profile/123,true,ok"
        ].join("\n")
      );

      const result = loadAppInputs({ configPath, accountsPath, targetsPath });
      assert.equal(result.config, null);
      assert.equal(result.fileErrors.length, 1);
      assert.match(
        result.fileErrors[0].message,
        /maxContentBrowserDryRunPerRun|maxContentBrowserDryRunPerAccount/
      );
    } finally {
      cleanup(dir);
    }
  }
});

runCase("v2 invalid email is rejected with readable issue", () => {
  const dir = tempWorkspace();
  try {
    const configPath = writeFile(
      dir,
      "config.json",
      configJson({ accountsV2Path: "accounts_export.csv" })
    );

    const targetsPath = writeFile(
      dir,
      "targets.csv",
      [
        "target_id,target_type,target_value,enabled,note",
        "target-001,profile_url,https://example.internal.portal/profile/123,true,ok"
      ].join("\n")
    );

    writeFile(
      dir,
      "accounts_export.csv",
      [
        "email,password,first_name,last_name,company_name,country,city,created_at",
        "invalid-email,pass-1,,,,,,"
      ].join("\n")
    );

    const result = loadAppInputs({
      configPath,
      accountsPath: path.join(dir, "unused-accounts.csv"),
      targetsPath
    });

    assert.equal(result.fileErrors.length, 0);
    assert.equal(result.accountsValid.length, 0);
    assert.equal(result.accountsRejected.length, 1);
    assert.equal(result.accountsRejected[0].raw.account_id, "acc_001");
    assert.equal(result.accountsRejected[0].issues[0].code, "invalid_email");
    assert.match(result.accountsRejected[0].issues[0].message, /email/i);
  } finally {
    cleanup(dir);
  }
});

runCase("v2 empty password is rejected without requiring account_id or enabled", () => {
  const dir = tempWorkspace();
  try {
    const configPath = writeFile(
      dir,
      "config.json",
      configJson({ accountsV2Path: "accounts_export.csv" })
    );

    const targetsPath = writeFile(
      dir,
      "targets.csv",
      [
        "target_id,target_type,target_value,enabled,note",
        "target-001,profile_url,https://example.internal.portal/profile/123,true,ok"
      ].join("\n")
    );

    writeFile(
      dir,
      "accounts_export.csv",
      [
        "email,password,first_name,last_name,company_name,country,city,created_at",
        "user@example.com,,,,,,,"
      ].join("\n")
    );

    const result = loadAppInputs({
      configPath,
      accountsPath: path.join(dir, "unused-accounts.csv"),
      targetsPath
    });

    assert.equal(result.fileErrors.length, 0);
    assert.equal(result.accountsValid.length, 0);
    assert.equal(result.accountsRejected.length, 1);
    assert.equal(result.accountsRejected[0].raw.account_id, "acc_001");
    assert.equal(result.accountsRejected[0].issues[0].field, "password");
    assert.equal(result.accountsRejected[0].issues[0].code, "missing_required_field");
  } finally {
    cleanup(dir);
  }
});

console.log("loadAppInputs tests passed");
