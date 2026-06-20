const assert = require("node:assert/strict");

const {
  classifySearchOutcomeFromSnapshot,
  mapSearchOutcomeToFinalStatus
} = require("../dist/search/searchService.js");

function runCase(name, fn) {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`fail - ${name}`);
    throw error;
  }
}

runCase("person profile is recognized by default", () => {
  const result = classifySearchOutcomeFromSnapshot({
    url: "https://example.internal.portal/profile/123",
    title: "Profile",
    bodyText: "Basic profile page with member details."
  });

  assert.equal(result, "person");
  assert.equal(mapSearchOutcomeToFinalStatus(result), "invalid_target");
});

runCase("company profile is recognized by keywords", () => {
  const result = classifySearchOutcomeFromSnapshot({
    url: "https://example.internal.portal/company-profile/456",
    title: "Company profile",
    bodyText: "Company overview and organization details."
  });

  assert.equal(result, "company");
  assert.equal(mapSearchOutcomeToFinalStatus(result), "invalid_target");
});

runCase("not found page is recognized", () => {
  const result = classifySearchOutcomeFromSnapshot({
    url: "https://example.internal.portal/profile/999",
    title: "404",
    bodyText: "Page not found"
  });

  assert.equal(result, "not_found");
  assert.equal(mapSearchOutcomeToFinalStatus(result), "not_found");
});

runCase("profile redirect to home is recognized as not found", () => {
  const result = classifySearchOutcomeFromSnapshot({
    requestedUrl: "https://example.internal.portal/profile/missing-person",
    url: "https://example.internal.portal/home",
    title: "Home",
    bodyText: "Company updates and organization feed."
  });

  assert.equal(result, "not_found");
  assert.equal(mapSearchOutcomeToFinalStatus(result), "not_found");
});

runCase("empty person profile shell is recognized as not found", () => {
  const result = classifySearchOutcomeFromSnapshot({
    requestedUrl: "https://example.internal.portal/pl/profile/00000000-0000-0000-0000-000000000000",
    url: "https://example.internal.portal/pl/profile/00000000-0000-0000-0000-000000000000",
    title: "Profile",
    bodyText: "No followers No following Added Companies Post Board"
  });

  assert.equal(result, "not_found");
  assert.equal(mapSearchOutcomeToFinalStatus(result), "not_found");
});

runCase("person profile with added companies section stays person", () => {
  const result = classifySearchOutcomeFromSnapshot({
    requestedUrl: "https://example.internal.portal/de/profile/74433f6f-08b6-4fce-bea1-ac58d80f1828",
    url: "https://example.internal.portal/de/profile/74433f6f-08b6-4fce-bea1-ac58d80f1828",
    title: "Jordan Example",
    bodyText: "Jordan Example Location Joined About me + Follow Added Companies Company profile cards"
  });

  assert.equal(result, "person");
  assert.equal(mapSearchOutcomeToFinalStatus(result), "invalid_target");
});

console.log("search tests passed");
