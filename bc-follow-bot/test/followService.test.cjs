const assert = require("node:assert/strict");

const {
  classifyFollowControlLabel,
  mapFollowStateAfterClick
} = require("../dist/follow/followService.js");

function runCase(name, fn) {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`fail - ${name}`);
    throw error;
  }
}

runCase("follow button means not following", () => {
  assert.equal(classifyFollowControlLabel("+ Follow"), "not_following");
  assert.equal(classifyFollowControlLabel("Follow"), "not_following");
});

runCase("following control means already following", () => {
  assert.equal(classifyFollowControlLabel("Following"), "following");
  assert.equal(classifyFollowControlLabel("+ Unfollow"), "following");
  assert.equal(classifyFollowControlLabel("Unfollow"), "following");
  assert.equal(classifyFollowControlLabel("Obserwujesz"), "following");
});

runCase("following counter text does not mean already following", () => {
  assert.equal(classifyFollowControlLabel("Following 14"), "unknown");
  assert.equal(classifyFollowControlLabel("Following section"), "unknown");
});

runCase("reread unfollow control after click maps to followed", () => {
  const rereadState = classifyFollowControlLabel("+ Unfollow");
  assert.deepEqual(mapFollowStateAfterClick(rereadState), {
    result: "followed",
    details: "follow_state=following"
  });
});

console.log("follow service tests passed");
