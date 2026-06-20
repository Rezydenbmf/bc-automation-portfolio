import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

export interface ProfileActionHistoryEntry {
  schemaVersion: 1;
  timestamp: string;
  accountEmail: string;
  targetId: string;
  targetType: string;
  targetValue: string;
  targetKey: string;
  profileKey: string | null;
  searchOutcome: string;
  followOutcome: string;
  finalResult: string;
  error: string;
}

export interface AppendProfileActionHistoryInput {
  timestamp: string;
  accountEmail: string;
  targetId: string;
  targetType: string;
  targetValue: string;
  profileUrl?: string | null;
  searchOutcome: string;
  followOutcome: string;
  finalResult: string;
  error: string;
}

const PROFILE_ACTION_HISTORY_PATH = path.resolve(
  process.cwd(),
  "data",
  "state",
  "profile-actions.jsonl",
);
const SAFE_FINAL_RESULTS = new Set(["followed", "already_following"]);

function ensureHistoryFile(filePath: string): void {
  const dirPath = path.dirname(filePath);

  if (!existsSync(dirPath)) {
    mkdirSync(dirPath, { recursive: true });
  }

  if (!existsSync(filePath)) {
    writeFileSync(filePath, "", "utf-8");
  }
}

function normalizeBasicValue(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

export function normalizeTargetKey(targetType: string, targetValue: string): string {
  return `${normalizeBasicValue(targetType)}:${normalizeBasicValue(targetValue)}`;
}

export function normalizeProfileKey(profileUrl: string | null | undefined): string | null {
  const trimmed = profileUrl?.trim();

  if (!trimmed) {
    return null;
  }

  try {
    const parsed = new URL(trimmed);
    parsed.hash = "";
    parsed.pathname = parsed.pathname.replace(/\/+$/, "") || "/";

    return parsed.toString().replace(/\/+$/, "");
  } catch {
    return trimmed.replace(/\/+$/, "") || null;
  }
}

export function appendProfileActionHistoryEntry(
  input: AppendProfileActionHistoryInput,
  filePath = PROFILE_ACTION_HISTORY_PATH,
): void {
  ensureHistoryFile(filePath);

  const entry: ProfileActionHistoryEntry = {
    schemaVersion: 1,
    timestamp: input.timestamp,
    accountEmail: input.accountEmail,
    targetId: input.targetId,
    targetType: input.targetType,
    targetValue: input.targetValue,
    targetKey: normalizeTargetKey(input.targetType, input.targetValue),
    profileKey: normalizeProfileKey(input.profileUrl),
    searchOutcome: input.searchOutcome,
    followOutcome: input.followOutcome,
    finalResult: input.finalResult,
    error: input.error,
  };

  appendFileSync(filePath, `${JSON.stringify(entry)}\n`, "utf-8");
}

export function hasProcessedProfile(
  profileUrl: string | null | undefined,
  filePath = PROFILE_ACTION_HISTORY_PATH,
): boolean {
  const profileKey = normalizeProfileKey(profileUrl);

  if (!profileKey || !existsSync(filePath)) {
    return false;
  }

  const content = readFileSync(filePath, "utf-8");
  if (!content.trim()) {
    return false;
  }

  for (const line of content.split(/\r?\n/)) {
    if (!line.trim()) {
      continue;
    }

    try {
      const entry = JSON.parse(line) as { profileKey?: unknown };
      if (entry.profileKey === profileKey) {
        return true;
      }
    } catch {
      continue;
    }
  }

  return false;
}

export function hasSafelyProcessedProfile(
  accountEmail: string,
  profileUrl: string | null | undefined,
  filePath = PROFILE_ACTION_HISTORY_PATH,
): boolean {
  const profileKey = normalizeProfileKey(profileUrl);

  if (!profileKey || !existsSync(filePath)) {
    return false;
  }

  const content = readFileSync(filePath, "utf-8");
  if (!content.trim()) {
    return false;
  }

  for (const line of content.split(/\r?\n/)) {
    if (!line.trim()) {
      continue;
    }

    try {
      const entry = JSON.parse(line) as {
        accountEmail?: unknown;
        profileKey?: unknown;
        finalResult?: unknown;
      };
      if (
        entry.accountEmail === accountEmail &&
        entry.profileKey === profileKey &&
        typeof entry.finalResult === "string" &&
        SAFE_FINAL_RESULTS.has(entry.finalResult)
      ) {
        return true;
      }
    } catch {
      continue;
    }
  }

  return false;
}
