import { Page } from "playwright";
import { SearchOutcome, SearchResult, TargetRow } from "../shared/types";

export interface SearchSnapshot {
  url: string;
  requestedUrl?: string;
  title: string;
  bodyText: string;
}

const NOT_FOUND_PATTERNS = [
  /\b404\b/i,
  /page not found/i,
  /\bnot found\b/i,
  /nie znaleziono/i,
  /nie odnaleziono/i,
  /brak wynik/i
];

const COMPANY_PATTERNS = [
  /\bcompany\b/i,
  /\borganization\b/i,
  /\borganisation\b/i,
  /\bfirm[a-y]?\b/i,
  /\bspolka\b/i,
  /\bprzedsiebiorstw\b/i
];

const EMPTY_PERSON_SHELL_MARKERS = ["no followers", "no following", "added companies", "post board"];

function isAbsoluteUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function normalizeText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function matchesAny(patterns: RegExp[], value: string): boolean {
  return patterns.some((pattern) => pattern.test(value));
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
    const path = new URL(value).pathname.toLowerCase();
    return path.includes("/company/") || path.includes("/company-profile/");
  } catch {
    return false;
  }
}

function isLikelyHomeRedirect(requestedUrl: string | undefined, finalUrl: string): boolean {
  if (!requestedUrl || !isProfileUrl(requestedUrl)) {
    return false;
  }

  try {
    const requested = new URL(requestedUrl);
    const final = new URL(finalUrl);
    const finalPath = final.pathname.toLowerCase().replace(/\/+$/, "");

    return requested.origin === final.origin && ["", "/", "/home", "/feed", "/dashboard"].includes(finalPath);
  } catch {
    return false;
  }
}

function isEmptyPersonShell(url: string, text: string): boolean {
  if (!isProfileUrl(url)) {
    return false;
  }

  const normalizedText = text.toLowerCase();
  return EMPTY_PERSON_SHELL_MARKERS.every((marker) => normalizedText.includes(marker));
}

export function classifySearchOutcomeFromSnapshot(snapshot: SearchSnapshot): SearchOutcome {
  const bodyText = normalizeText(snapshot.bodyText);
  const titleText = normalizeText(snapshot.title);
  const combinedText = `${titleText} ${bodyText}`;
  const urlText = snapshot.url.toLowerCase();

  if (isLikelyHomeRedirect(snapshot.requestedUrl, snapshot.url)) {
    return "not_found";
  }

  if (matchesAny(NOT_FOUND_PATTERNS, combinedText) || urlText.includes("404") || urlText.includes("not-found")) {
    return "not_found";
  }

  if (isCompanyUrl(snapshot.url)) {
    return "company";
  }

  if (isEmptyPersonShell(snapshot.url, combinedText)) {
    return "not_found";
  }

  if (isProfileUrl(snapshot.url)) {
    return "person";
  }

  if (matchesAny(COMPANY_PATTERNS, combinedText)) {
    return "company";
  }

  return "person";
}

export function mapSearchOutcomeToFinalStatus(outcome: SearchOutcome): SearchResult["status"] {
  if (outcome === "not_found") {
    return "not_found";
  }

  return "invalid_target";
}

export async function searchTarget(page: Page, target: TargetRow): Promise<SearchResult> {
  if (target.target_type !== "profile_url") {
    return {
      status: "invalid_target",
      details: `target_type ${target.target_type} is not supported by this stage.`
    };
  }

  if (!isAbsoluteUrl(target.target_value)) {
    return {
      status: "invalid_target",
      details: "profile_url must be an absolute http or https URL."
    };
  }

  try {
    await page.goto(target.target_value, {
      waitUntil: "domcontentloaded"
    });
    await page.waitForLoadState("networkidle").catch(() => {});

    const bodyText = await page.locator("body").innerText().catch(() => "");
    const title = await page.title().catch(() => "");
    const searchOutcome = classifySearchOutcomeFromSnapshot({
      url: page.url(),
      requestedUrl: target.target_value,
      title,
      bodyText
    });

    return {
      status: mapSearchOutcomeToFinalStatus(searchOutcome),
      searchOutcome,
      resolvedProfileUrl: page.url(),
      details: searchOutcome === "not_found" ? "not_found" : `${searchOutcome}_detected`
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      status: "portal_unavailable",
      searchOutcome: "not_found",
      details: `Search navigation failed: ${message}`
    };
  }
}
