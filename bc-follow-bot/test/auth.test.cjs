const assert = require("node:assert/strict");

const { classifyLoginOutcomeFromText } = require("../dist/auth/authService.js");

function runCase(name, fn) {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`fail - ${name}`);
    throw error;
  }
}

runCase("login success toast is recognized", () => {
  const result = classifyLoginOutcomeFromText("Logowanie... Zalogowano pomyślnie");
  assert.equal(result?.result, "login_success");
});

runCase("login failure toast is recognized", () => {
  const result = classifyLoginOutcomeFromText("Logowanie... Nie udało się zalogować");
  assert.equal(result?.result, "login_failed");
});

runCase("unrelated text is ignored", () => {
  const result = classifyLoginOutcomeFromText("Logowanie...");
  assert.equal(result, null);
});

console.log("auth tests passed");
