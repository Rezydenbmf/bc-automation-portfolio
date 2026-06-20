import crypto from "node:crypto";
import path from "node:path";
import { Browser, BrowserContext, Page, chromium } from "playwright";
import {
  loginAccount as loginAccountDefault,
  LoginActionResult
} from "../auth/authService";
import { classifySearchOutcomeFromSnapshot } from "../search/searchService";
import type { AccountRow, AppSettings } from "../shared/types";
import {
  appendDiscoveryResults,
  createDiscoveryTargetsExport,
  createDiscoveryResultsExport
} from "./discoveryResultsExport";
import { validateDiscoveryInputCsvFile } from "./discoveryInputValidation";
import {
  DiscoveryProfileCandidate,
  selectBestDiscoveryProfileCandidate
} from "./profileMatching";
import type {
  DiscoveryInputValidationResult,
  DiscoveryResultRow,
  ValidDiscoveryInputRecord
} from "./types";

const DEFAULT_DISCOVERY_INPUT_PATH = path.resolve(process.cwd(), "data", "discovery-input.csv");
const DEFAULT_DISCOVERY_OUTPUT_DIR = path.resolve(process.cwd(), "logs", "discovery-results");
const DEFAULT_DISCOVERY_TARGETS_OUTPUT_DIR = path.resolve(process.cwd(), "logs", "discovery-targets");

export interface DiscoveryRunnerOptions {
  inputPath?: string;
  outputDir?: string;
  targetsOutputDir?: string;
  now?: Date;
  checkedAt?: string;
  config?: AppSettings;
  account?: AccountRow;
  dependencies?: Partial<DiscoveryRunnerDependencies>;
}

export interface DiscoveryRunnerResult {
  inputPath: string;
  outputFilePath: string;
  targetsOutputFilePath: string;
  runId: string;
  validCount: number;
  rejectedCount: number;
  skippedDisabledCount: number;
  writtenCount: number;
  targetsWrittenCount: number;
  fileErrors: DiscoveryInputValidationResult["fileErrors"];
}

export interface DiscoverySearchAttempt {
  status: "profile_found" | "not_found" | "ambiguous_result" | "portal_error";
  profileUrl?: string;
  confidence?: "high" | "medium" | "low" | "none";
  reason: string;
}

interface DiscoveryDebugContext {
  rowNumber: number;
  totalRows: number;
}

export interface DiscoveryRunnerDependencies {
  launchBrowser: (
    options: Parameters<typeof chromium.launch>[0],
  ) => Promise<Browser>;
  loginAccount: typeof loginAccountDefault;
  searchDiscoveryProfile: (
    page: Page,
    record: ValidDiscoveryInputRecord,
    config: AppSettings,
    debugContext?: DiscoveryDebugContext,
  ) => Promise<DiscoverySearchAttempt>;
}

const SEARCH_INPUT_SELECTORS = [
  'input[type="search"]',
  'input[placeholder*="Search" i]',
  'input[placeholder*="Szukaj" i]',
  'input[aria-label*="Search" i]',
  'input[aria-label*="Szukaj" i]',
  '[role="searchbox"]',
  'input[name*="search" i]',
  'input[name*="query" i]'
];

const defaultRunnerDependencies: DiscoveryRunnerDependencies = {
  launchBrowser: (options) => chromium.launch(options),
  loginAccount: loginAccountDefault,
  searchDiscoveryProfile
};

function toDiscoveryResultRow(
  record: ValidDiscoveryInputRecord,
  checkedAt: string
): (attempt: DiscoverySearchAttempt) => DiscoveryResultRow {
  return (attempt) => ({
    target_id: record.target_id,
    input_email: record.email,
    input_first_name: record.first_name,
    input_last_name: record.last_name,
    input_company: record.company,
    input_country: record.country,
    input_city: record.city,
    discovery_status: attempt.status,
    profile_url: attempt.status === "profile_found" ? attempt.profileUrl ?? "" : "",
    confidence: attempt.confidence ?? (attempt.status === "profile_found" ? "high" : "none"),
    reason: attempt.reason,
    checked_at: checkedAt,
    note: record.note
  });
}

function portalErrorResult(
  record: ValidDiscoveryInputRecord,
  checkedAt: string,
  reason: string
): DiscoveryResultRow {
  return toDiscoveryResultRow(record, checkedAt)({
    status: "portal_error",
    confidence: "none",
    reason
  });
}

export function buildDiscoverySearchQuery(record: ValidDiscoveryInputRecord): string {
  if (record.email.length > 0) {
    return record.email;
  }

  return [record.first_name, record.last_name, record.company, record.city, record.country]
    .filter((part) => part.trim().length > 0)
    .join(" ");
}

function uniqueValues(values: string[]): string[] {
  return Array.from(new Set(values));
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

function getDiscoveryDebugPauseMs(): number {
  const raw = process.env.DISCOVERY_DEBUG_PAUSE_MS?.trim();
  if (!raw) {
    return 0;
  }

  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function isDiscoveryVisualDebugEnabled(): boolean {
  return process.env.DISCOVERY_DEBUG_VISUAL === "1";
}

function createDiscoveryQueryHash(query: string): string {
  return crypto.createHash("sha256").update(query).digest("hex").slice(0, 8);
}

async function waitForDiscoveryDebugPause(page: Page): Promise<void> {
  const pauseMs = getDiscoveryDebugPauseMs();
  if (pauseMs > 0) {
    await page.waitForTimeout(pauseMs);
  }
}

async function showDiscoveryDebugBanner(
  page: Page,
  debugContext: DiscoveryDebugContext,
  step: string,
  details: { queryHash?: string; status?: string } = {}
): Promise<void> {
  if (!isDiscoveryVisualDebugEnabled()) {
    return;
  }

  const parts = [
    "DISCOVERY DEBUG",
    `row ${debugContext.rowNumber}/${debugContext.totalRows}`,
    `step: ${step}`,
    ...(details.queryHash ? [`query_hash: ${details.queryHash}`] : []),
    ...(details.status ? [`status: ${details.status}`] : [])
  ];
  const text = parts.join(" | ");

  await page.bringToFront().catch(() => {});
  await page.evaluate((bannerText) => {
    const bannerId = "bc-follow-bot-discovery-debug-banner";
    let banner = document.getElementById(bannerId);
    if (!banner) {
      banner = document.createElement("div");
      banner.id = bannerId;
      document.documentElement.appendChild(banner);
    }

    banner.textContent = bannerText;
    banner.setAttribute("style", [
      "position: fixed",
      "top: 0",
      "left: 0",
      "right: 0",
      "z-index: 2147483647",
      "background: #111827",
      "color: #f9fafb",
      "font: 700 16px/1.4 Arial, sans-serif",
      "padding: 10px 14px",
      "box-shadow: 0 2px 12px rgba(0,0,0,0.35)",
      "letter-spacing: 0"
    ].join(";"));
  }, text).catch(() => {});
}

async function readPageSnapshot(page: Page, requestedUrl?: string) {
  return {
    url: page.url(),
    requestedUrl,
    title: await page.title().catch(() => ""),
    bodyText: await page.locator("body").innerText().catch(() => "")
  };
}

async function findSearchInput(page: Page) {
  for (const selector of SEARCH_INPUT_SELECTORS) {
    const locator = page.locator(selector).first();
    const count = await locator.count().catch(() => 0);
    if (count === 0) {
      continue;
    }

    const visible = await locator.isVisible().catch(() => false);
    const editable = await locator.isEditable().catch(() => false);
    if (visible && editable) {
      return locator;
    }
  }

  return null;
}

function isAbortedNavigationError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes("net::ERR_ABORTED");
}

function isInterruptedNavigationError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes("is interrupted by another navigation");
}

async function gotoDiscoveryHome(page: Page, baseUrl: string): Promise<void> {
  try {
    await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
  } catch (error) {
    if (!isAbortedNavigationError(error)) {
      throw error;
    }

    await page.waitForLoadState("domcontentloaded").catch(() => {});
  }
}

async function gotoDiscoveryProfile(page: Page, profileUrl: string): Promise<void> {
  try {
    await page.goto(profileUrl, { waitUntil: "domcontentloaded" });
  } catch (error) {
    if (!isAbortedNavigationError(error) && !isInterruptedNavigationError(error)) {
      throw error;
    }

    await page.waitForLoadState("domcontentloaded").catch(() => {});
    await page.waitForTimeout(500).catch(() => {});

    if (!isProfileUrl(page.url())) {
      throw error;
    }
  }
}

async function collectResultLinks(page: Page, baseUrl: string): Promise<{
  profileCandidates: DiscoveryProfileCandidate[];
  companyUrls: string[];
}> {
  const links = await page.locator("a[href]").evaluateAll((anchors) =>
    anchors.map((anchor) => {
      const href = anchor.getAttribute("href") ?? "";
      let containerText = "";
      let element: Element | null = anchor;

      for (let depth = 0; element && depth < 4; depth += 1) {
        const text = (element.textContent ?? "").trim().replace(/\s+/g, " ");
        if (text.length > containerText.length && text.length <= 500) {
          containerText = text;
        }

        element = element.parentElement;
      }

      return {
        href,
        text: [anchor.textContent ?? "", anchor.getAttribute("aria-label") ?? "", containerText]
          .join(" ")
          .trim()
          .replace(/\s+/g, " ")
      };
    }).filter((link) => link.href.trim().length > 0)
  ).catch(() => []);
  const absoluteLinks = links
    .map((link) => {
      try {
        return {
          url: new URL(link.href, baseUrl).toString(),
          text: link.text
        };
      } catch {
        return null;
      }
    })
    .filter((link): link is DiscoveryProfileCandidate => link !== null);

  const uniqueProfileCandidates = new Map<string, DiscoveryProfileCandidate>();
  for (const candidate of absoluteLinks.filter((link) => isProfileUrl(link.url) && !isCompanyUrl(link.url))) {
    if (!uniqueProfileCandidates.has(candidate.url)) {
      uniqueProfileCandidates.set(candidate.url, candidate);
    }
  }

  return {
    profileCandidates: Array.from(uniqueProfileCandidates.values()),
    companyUrls: uniqueValues(absoluteLinks.map((link) => link.url).filter(isCompanyUrl))
  };
}

async function waitForResultLinks(page: Page, baseUrl: string): Promise<{
  profileCandidates: DiscoveryProfileCandidate[];
  companyUrls: string[];
}> {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const links = await collectResultLinks(page, baseUrl);
    if (links.profileCandidates.length > 0 || links.companyUrls.length > 0) {
      return links;
    }

    await page.waitForTimeout(300);
  }

  return await collectResultLinks(page, baseUrl);
}

async function inspectSingleProfile(
  page: Page,
  profileUrl: string,
  debugContext: DiscoveryDebugContext | undefined,
  queryHash: string
): Promise<DiscoverySearchAttempt> {
  if (debugContext) {
    await showDiscoveryDebugBanner(page, debugContext, "before_profile_open", { queryHash });
  }

  await gotoDiscoveryProfile(page, profileUrl);
  await page.waitForLoadState("networkidle").catch(() => {});
  if (debugContext) {
    await showDiscoveryDebugBanner(page, debugContext, "after_profile_open", { queryHash });
  }
  await waitForDiscoveryDebugPause(page);

  const snapshot = await readPageSnapshot(page, profileUrl);
  const outcome = classifySearchOutcomeFromSnapshot(snapshot);

  if (outcome === "person") {
    return {
      status: "profile_found",
      profileUrl: page.url(),
      confidence: "high",
      reason: "single person profile found"
    };
  }

  if (outcome === "not_found") {
    return {
      status: "not_found",
      confidence: "none",
      reason: "profile candidate resolved to not_found"
    };
  }

  return {
    status: "ambiguous_result",
    confidence: "low",
    reason: "profile candidate is not a person profile"
  };
}

async function mapCandidateLinksToDiscoveryAttempt(
  page: Page,
  record: ValidDiscoveryInputRecord,
  links: { profileCandidates: DiscoveryProfileCandidate[]; companyUrls: string[] },
  reasonPrefix: string,
  debugContext: DiscoveryDebugContext | undefined,
  queryHash: string
): Promise<DiscoverySearchAttempt | null> {
  if (links.profileCandidates.length === 1) {
    const result = await inspectSingleProfile(page, links.profileCandidates[0].url, debugContext, queryHash);
    return {
      ...result,
      reason: `${result.reason}; ${reasonPrefix}; profile_candidates=1; company_candidates=${links.companyUrls.length}`
    };
  }

  if (links.profileCandidates.length > 1) {
    const match = selectBestDiscoveryProfileCandidate(record, links.profileCandidates);
    if (match.selected) {
      const result = await inspectSingleProfile(page, match.selected.candidate.url, debugContext, queryHash);
      return {
        ...result,
        confidence: result.status === "profile_found" ? "medium" : result.confidence,
        reason: `${result.reason}; ${reasonPrefix}; ${match.reason}; profile_candidates=${links.profileCandidates.length}; company_candidates=${links.companyUrls.length}`
      };
    }

    return {
      status: "ambiguous_result",
      confidence: "low",
      reason: `${reasonPrefix}; multiple profile candidates: ${links.profileCandidates.length}; company_candidates=${links.companyUrls.length}; ${match.reason}`
    };
  }

  if (links.companyUrls.length > 0) {
    return {
      status: "ambiguous_result",
      confidence: "low",
      reason: `${reasonPrefix}; only company result candidates found: ${links.companyUrls.length}`
    };
  }

  return null;
}

export async function searchDiscoveryProfile(
  page: Page,
  record: ValidDiscoveryInputRecord,
  config: AppSettings,
  debugContext: DiscoveryDebugContext = { rowNumber: 1, totalRows: 1 }
): Promise<DiscoverySearchAttempt> {
  const query = buildDiscoverySearchQuery(record);
  const queryHash = createDiscoveryQueryHash(query);
  let finalStatus: DiscoverySearchAttempt["status"] | "unknown" = "unknown";
  const finish = (attempt: DiscoverySearchAttempt): DiscoverySearchAttempt => {
    finalStatus = attempt.status;
    return attempt;
  };

  try {
    await showDiscoveryDebugBanner(page, debugContext, "before_record", { queryHash });
    await gotoDiscoveryHome(page, config.baseUrl);
    await page.waitForLoadState("networkidle").catch(() => {});

    const input = await findSearchInput(page);
    if (!input) {
      return finish({
        status: "portal_error",
        confidence: "none",
        reason: "search input not found"
      });
    }

    await input.fill("");
    await input.fill(query);
    await page.waitForTimeout(800);
    await showDiscoveryDebugBanner(page, debugContext, "after_query_fill", { queryHash });
    await waitForDiscoveryDebugPause(page);

    const suggestionLinks = await waitForResultLinks(page, config.baseUrl);
    const suggestionResult = await mapCandidateLinksToDiscoveryAttempt(
      page,
      record,
      suggestionLinks,
      `search query="${query}"; before_enter`,
      debugContext,
      queryHash
    );
    if (suggestionResult) {
      return finish(suggestionResult);
    }

    await input.press("Enter");
    await page.waitForLoadState("networkidle").catch(() => {});
    await page.waitForTimeout(800);
    await showDiscoveryDebugBanner(page, debugContext, "after_search_submit", { queryHash });
    await waitForDiscoveryDebugPause(page);

    const currentSnapshot = await readPageSnapshot(page);
    const currentOutcome = classifySearchOutcomeFromSnapshot(currentSnapshot);
    if (currentOutcome === "person" && isProfileUrl(currentSnapshot.url) && !isCompanyUrl(currentSnapshot.url)) {
      return finish({
        status: "profile_found",
        profileUrl: currentSnapshot.url,
        confidence: "high",
        reason: `search opened a person profile; search query="${query}"`
      });
    }

    const links = await waitForResultLinks(page, config.baseUrl);
    const resultFromLinks = await mapCandidateLinksToDiscoveryAttempt(
      page,
      record,
      links,
      `search query="${query}"; after_enter`,
      debugContext,
      queryHash
    );
    if (resultFromLinks) {
      return finish(resultFromLinks);
    }

    if (currentOutcome === "company") {
      return finish({
        status: "ambiguous_result",
        confidence: "low",
        reason: `search opened a company result; search query="${query}"; profile_candidates=0`
      });
    }

    return finish({
      status: "not_found",
      confidence: "none",
      reason: `no profile candidates found; search query="${query}"`
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return finish({
      status: "portal_error",
      confidence: "none",
      reason: `search failed: ${message}`
    });
  }

  finally {
    await showDiscoveryDebugBanner(page, debugContext, "record_done", { status: finalStatus }).catch(() => {});
    await waitForDiscoveryDebugPause(page).catch(() => {});
  }
}

export async function buildDiscoveryRunnerRows(
  validation: DiscoveryInputValidationResult,
  checkedAt: string,
  searchRecord?: (
    record: ValidDiscoveryInputRecord,
    debugContext: DiscoveryDebugContext,
  ) => Promise<DiscoverySearchAttempt>
): Promise<DiscoveryResultRow[]> {
  const validRows: DiscoveryResultRow[] = [];
  if (searchRecord) {
    for (const [index, record] of validation.valid.entries()) {
      const attempt = await searchRecord(record, {
        rowNumber: index + 1,
        totalRows: validation.valid.length
      });
      validRows.push(toDiscoveryResultRow(record, checkedAt)(attempt));
    }
  } else {
    validRows.push(
      ...validation.valid.map((record) =>
        portalErrorResult(record, checkedAt, "discovery search is not configured")
      )
    );
  }
  const rejectedRows = validation.rejected.map((record) => record.result);

  return [
    ...validRows,
    ...validation.skippedDisabled,
    ...rejectedRows
  ];
}

async function withDiscoverySession(
  options: DiscoveryRunnerOptions,
  deps: DiscoveryRunnerDependencies,
  validation: DiscoveryInputValidationResult,
  checkedAt: string
): Promise<DiscoveryResultRow[]> {
  if (validation.valid.length === 0) {
    return await buildDiscoveryRunnerRows(validation, checkedAt);
  }

  if (!options.config || !options.account) {
    return await buildDiscoveryRunnerRows(
      validation,
      checkedAt,
      async (record) => ({
        status: "portal_error",
        confidence: "none",
        reason: "discovery search requires config and enabled account"
      })
    );
  }

  let browser: Browser | undefined;
  let context: BrowserContext | undefined;
  let page: Page | undefined;

  try {
    const browserChannelSetting = process.env.PLAYWRIGHT_BROWSER_CHANNEL?.trim();
    const browserExecutablePathSetting = process.env.PLAYWRIGHT_EXECUTABLE_PATH?.trim();

    browser = await deps.launchBrowser({
      headless: options.config.headless,
      slowMo: options.config.slowMo,
      ...(browserExecutablePathSetting
        ? { executablePath: browserExecutablePathSetting }
        : {}),
      ...(browserChannelSetting ? { channel: browserChannelSetting } : {})
    });
    context = await browser.newContext();
    page = await context.newPage();
    page.setDefaultTimeout(options.config.timeoutMs);

    const loginResult: LoginActionResult = await deps.loginAccount(
      { context, page },
      options.account
    );

    if (loginResult.result !== "login_success") {
      return await buildDiscoveryRunnerRows(
        validation,
        checkedAt,
        async () => ({
          status: "portal_error",
          confidence: "none",
          reason: `login failed: ${loginResult.details ?? loginResult.result}`
        })
      );
    }

    return await buildDiscoveryRunnerRows(
      validation,
      checkedAt,
      async (record, debugContext) => deps.searchDiscoveryProfile(page!, record, options.config!, debugContext)
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return await buildDiscoveryRunnerRows(
      validation,
      checkedAt,
      async () => ({
        status: "portal_error",
        confidence: "none",
        reason: `portal session failed: ${message}`
      })
    );
  } finally {
    await page?.close().catch(() => {});
    await context?.close().catch(() => {});
    await browser?.close().catch(() => {});
  }
}

export async function runDiscovery(options: DiscoveryRunnerOptions = {}): Promise<DiscoveryRunnerResult> {
  const inputPath = options.inputPath ?? DEFAULT_DISCOVERY_INPUT_PATH;
  const outputDir = options.outputDir ?? DEFAULT_DISCOVERY_OUTPUT_DIR;
  const targetsOutputDir = options.targetsOutputDir ?? DEFAULT_DISCOVERY_TARGETS_OUTPUT_DIR;
  const now = options.now ?? new Date();
  const checkedAt = options.checkedAt ?? now.toISOString();
  const deps: DiscoveryRunnerDependencies = {
    ...defaultRunnerDependencies,
    ...options.dependencies
  };

  const validation = validateDiscoveryInputCsvFile(inputPath, checkedAt);
  const rows = await withDiscoverySession(options, deps, validation, checkedAt);
  const runExport = createDiscoveryResultsExport(now, outputDir);
  const targetsExport = createDiscoveryTargetsExport(rows, now, targetsOutputDir);

  appendDiscoveryResults(runExport.filePath, rows);

  return {
    inputPath,
    outputFilePath: runExport.filePath,
    targetsOutputFilePath: targetsExport.filePath,
    runId: runExport.runId,
    validCount: validation.valid.length,
    rejectedCount: validation.rejected.length,
    skippedDisabledCount: validation.skippedDisabled.length,
    writtenCount: rows.length,
    targetsWrittenCount: targetsExport.writtenCount,
    fileErrors: validation.fileErrors
  };
}
