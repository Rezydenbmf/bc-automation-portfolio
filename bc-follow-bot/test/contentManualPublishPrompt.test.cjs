const assert = require("node:assert/strict");
const { Readable, Writable } = require("node:stream");

const { createPromptSession } = require("../dist/content/contentManualPublishPrompt.js");

function pipedInput(text) {
  const input = Readable.from([text]);
  input.isTTY = false;
  return input;
}

function captureOutput() {
  let text = "";
  const output = new Writable({
    write(chunk, _encoding, callback) {
      text += chunk.toString();
      callback();
    }
  });

  return {
    output,
    getText: () => text
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
  await runCase("piped prompt preserves initial and final confirmations", async () => {
    const captured = captureOutput();
    const session = await createPromptSession(
      pipedInput("PUBLISH_CONTENT_YES\nFINAL_PUBLISH_YES\n"),
      captured.output
    );

    try {
      const initial = await session.question("Initial confirmation: ");
      const final = await session.question("Final confirmation: ");

      assert.equal(initial, "PUBLISH_CONTENT_YES");
      assert.equal(final, "FINAL_PUBLISH_YES");
      assert.match(captured.getText(), /Initial confirmation:/);
      assert.match(captured.getText(), /Final confirmation:/);
    } finally {
      session.close();
    }
  });

  await runCase("missing piped answer returns empty string", async () => {
    const captured = captureOutput();
    const session = await createPromptSession(pipedInput("PUBLISH_CONTENT_YES\n"), captured.output);

    try {
      assert.equal(await session.question("Initial confirmation: "), "PUBLISH_CONTENT_YES");
      assert.equal(await session.question("Final confirmation: "), "");
    } finally {
      session.close();
    }
  });

  console.log("content manual publish prompt tests passed");
})();
