const assert = require("node:assert/strict");

const {
  selectBestDiscoveryProfileCandidate
} = require("../dist/discovery/profileMatching.js");

async function runCase(name, fn) {
  try {
    await fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`fail - ${name}`);
    throw error;
  }
}

function makeRecord(overrides = {}) {
  return {
    target_id: "disc-001",
    email: "",
    first_name: "Anna",
    last_name: "Kowalska",
    company: "Example Company",
    country: "Poland",
    city: "Warsaw",
    enabled: true,
    note: "",
    ...overrides
  };
}

async function main() {
await runCase("selects clear first name, last name and company match", async () => {
  const result = selectBestDiscoveryProfileCandidate(makeRecord(), [
    {
      url: "https://example.internal.portal/profile/111",
      text: "Anna Kowalska Senior Manager Example Company Warsaw Poland"
    },
    {
      url: "https://example.internal.portal/profile/222",
      text: "Anna Nowak Other Company Warsaw Poland"
    }
  ]);

  assert.equal(result.selected?.candidate.url, "https://example.internal.portal/profile/111");
  assert.equal(result.selected.score, 9);
});

await runCase("keeps ambiguous result when two candidates have similar score", async () => {
  const result = selectBestDiscoveryProfileCandidate(makeRecord(), [
    {
      url: "https://example.internal.portal/profile/111",
      text: "Anna Kowalska Example Company"
    },
    {
      url: "https://example.internal.portal/profile/222",
      text: "Anna Kowalska Warsaw Poland"
    }
  ]);

  assert.equal(result.selected, null);
  assert.match(result.reason, /margin is below threshold/);
});

await runCase("keeps ambiguous result when input last name does not match", async () => {
  const result = selectBestDiscoveryProfileCandidate(makeRecord(), [
    {
      url: "https://example.internal.portal/profile/111",
      text: "Anna Nowak Example Company Warsaw Poland"
    },
    {
      url: "https://example.internal.portal/profile/222",
      text: "Anna Zielinska Other Company Krakow Poland"
    }
  ]);

  assert.equal(result.selected, null);
  assert.match(result.reason, /does not match input last name/);
});

await runCase("company and company-profile candidates cannot win", async () => {
  const result = selectBestDiscoveryProfileCandidate(makeRecord(), [
    {
      url: "https://example.internal.portal/company/example-company",
      text: "Anna Kowalska Example Company Warsaw Poland"
    },
    {
      url: "https://example.internal.portal/company-profile/example-company",
      text: "Anna Kowalska Example Company Warsaw Poland"
    },
    {
      url: "https://example.internal.portal/profile/222",
      text: "Anna Kowalska Other Company"
    }
  ]);

  assert.equal(result.selected?.candidate.url, "https://example.internal.portal/profile/222");
});

await runCase("missing company, city and country input does not block safe name match", async () => {
  const result = selectBestDiscoveryProfileCandidate(
    makeRecord({ company: "", city: "", country: "" }),
    [
      {
        url: "https://example.internal.portal/profile/111",
        text: "Anna Kowalska"
      },
      {
        url: "https://example.internal.portal/profile/222",
        text: "Anna Nowak Example Company Warsaw Poland"
      }
    ]
  );

  assert.equal(result.selected?.candidate.url, "https://example.internal.portal/profile/111");
  assert.equal(result.selected.score, 5);
});

await runCase("matching ignores case and extra spaces", async () => {
  const result = selectBestDiscoveryProfileCandidate(
    makeRecord({
      first_name: "  ANNA ",
      last_name: " KOWALSKA ",
      company: " Example   Company ",
      city: " WARSAW ",
      country: " POLAND "
    }),
    [
      {
        url: "https://example.internal.portal/profile/111",
        text: "anna   kowalska example company warsaw poland"
      },
      {
        url: "https://example.internal.portal/profile/222",
        text: "Anna Nowak Example Company"
      }
    ]
  );

  assert.equal(result.selected?.candidate.url, "https://example.internal.portal/profile/111");
  assert.equal(result.selected.score, 9);
});

await runCase("does not auto-select from multiple candidates without last name", async () => {
  const result = selectBestDiscoveryProfileCandidate(
    makeRecord({ last_name: "" }),
    [
      {
        url: "https://example.internal.portal/profile/111",
        text: "Anna Example Company Warsaw Poland"
      },
      {
        url: "https://example.internal.portal/profile/222",
        text: "Anna Other Company Krakow Poland"
      }
    ]
  );

  assert.equal(result.selected, null);
  assert.match(result.reason, /last name is missing/);
});

console.log("discovery profile matching tests passed");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
