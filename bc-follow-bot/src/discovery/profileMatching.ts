import type { ValidDiscoveryInputRecord } from "./types";

export interface DiscoveryProfileCandidate {
  url: string;
  text: string;
}

export interface DiscoveryProfileMatchScore {
  candidate: DiscoveryProfileCandidate;
  score: number;
  matched: {
    firstName: boolean;
    lastName: boolean;
    company: boolean;
    city: boolean;
    country: boolean;
  };
}

export interface DiscoveryProfileMatchResult {
  selected: DiscoveryProfileMatchScore | null;
  scores: DiscoveryProfileMatchScore[];
  reason: string;
}

function normalizeValue(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

function isProfileUrl(value: string): boolean {
  try {
    return new URL(value).pathname.toLowerCase().includes("/profile/");
  } catch {
    return false;
  }
}

function isCompanyUrl(value: string): boolean {
  try {
    const pathName = new URL(value).pathname.toLowerCase();
    return pathName.includes("/company/") || pathName.includes("/company-profile/");
  } catch {
    return false;
  }
}

function hasNeedle(haystack: string, needle: string): boolean {
  const normalizedNeedle = normalizeValue(needle);
  return normalizedNeedle.length > 0 && haystack.includes(normalizedNeedle);
}

function scoreCandidate(
  record: ValidDiscoveryInputRecord,
  candidate: DiscoveryProfileCandidate
): DiscoveryProfileMatchScore {
  const searchable = normalizeValue(`${candidate.text} ${candidate.url}`);
  const matched = {
    firstName: hasNeedle(searchable, record.first_name),
    lastName: hasNeedle(searchable, record.last_name),
    company: hasNeedle(searchable, record.company),
    city: hasNeedle(searchable, record.city),
    country: hasNeedle(searchable, record.country)
  };

  return {
    candidate,
    score:
      (matched.firstName ? 2 : 0) +
      (matched.lastName ? 3 : 0) +
      (matched.company ? 2 : 0) +
      (matched.city ? 1 : 0) +
      (matched.country ? 1 : 0),
    matched
  };
}

export function selectBestDiscoveryProfileCandidate(
  record: ValidDiscoveryInputRecord,
  candidates: DiscoveryProfileCandidate[]
): DiscoveryProfileMatchResult {
  const profileCandidates = candidates.filter((candidate) =>
    isProfileUrl(candidate.url) && !isCompanyUrl(candidate.url)
  );
  const scores = profileCandidates
    .map((candidate) => scoreCandidate(record, candidate))
    .sort((left, right) => right.score - left.score);

  const best = scores[0] ?? null;
  const second = scores[1] ?? null;
  const hasLastName = normalizeValue(record.last_name).length > 0;

  if (!best) {
    return {
      selected: null,
      scores,
      reason: "no profile candidates to match"
    };
  }

  if (!hasLastName && profileCandidates.length > 1) {
    return {
      selected: null,
      scores,
      reason: "last name is missing; multiple profile candidates require manual review"
    };
  }

  if (hasLastName && !best.matched.lastName) {
    return {
      selected: null,
      scores,
      reason: "best profile candidate does not match input last name"
    };
  }

  if (best.score < 5) {
    return {
      selected: null,
      scores,
      reason: `best profile candidate score is below threshold: ${best.score}`
    };
  }

  const margin = best.score - (second?.score ?? 0);
  if (margin < 2) {
    return {
      selected: null,
      scores,
      reason: `best profile candidate margin is below threshold: ${margin}`
    };
  }

  return {
    selected: best,
    scores,
    reason: `best profile candidate matched safely: score=${best.score}; margin=${margin}`
  };
}
