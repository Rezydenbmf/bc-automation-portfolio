export type FollowResult =
  | "followed"
  | "already_following"
  | "not_found"
  | "login_failed"
  | "follow_failed"
  | "already_processed"
  | "follow_limit_reached"
  | "invalid_target"
  | "portal_unavailable";

export type AppResult = FollowResult | "login_success";

export type TargetType = "profile_url" | "email" | "full_name";
export type SearchOutcome = "person" | "company" | "not_found";
export type AiDraftProviderName = "openai-compatible";

export interface AppSettings {
  headless: boolean;
  timeoutMs: number;
  slowMo: number;
  debugScreenshots: boolean;
  baseUrl: string;
  screenshotOnError: boolean;
  takeHtmlSnapshotOnError: boolean;
  delayBetweenTargetsMs: number;
  accountsV2Path?: string;
  maxFollowsPerRun?: number;
  preflightOperationWarningThreshold?: number;
  requireManualConfirmForLargeRun: boolean;
  discoveryInputPath?: string;
  discoveryOutputDir?: string;
  maxContentActionsPerRun: number;
  maxContentActionsPerAccount: number;
  maxContentPublishesPerRun: number;
  maxContentPublishesPerAccount: number;
  maxContentBrowserDryRunPerRun: number;
  maxContentBrowserDryRunPerAccount: number;
  maxContentManualPublishesPerRun: number;
  maxContentManualPublishesPerAccount: number;
  maxContentTitleLength: number;
  aiDraftsEnabled: boolean;
  aiDraftProvider: AiDraftProviderName;
  aiDraftModel: string;
  maxContentAiDraftsPerRun: number;
  maxContentDraftTextLength: number;
  maxContentDraftTitleLength: number;
  requireFinalManualConfirmBeforePublish: boolean;
  requireManualApprovalForContent: boolean;
  contentDryRunDefault: boolean;
}

export interface AccountRow {
  account_id: string;
  email: string;
  password: string;
  enabled: boolean;
  language: string;
  note: string;
}

export interface TargetRow {
  target_id: string;
  target_type: TargetType;
  target_value: string;
  enabled: boolean;
  note: string;
}

export interface LogEntry {
  timestamp: string;
  account: string;
  target: string;
  action: string;
  result: AppResult;
  error_message: string;
}

export interface SearchResult {
  status: FollowResult;
  searchOutcome?: SearchOutcome;
  resolvedProfileUrl?: string;
  details?: string;
}

export interface FollowActionResult {
  result: FollowResult;
  details?: string;
}

export type ProfileKind = "person" | "company" | "unknown";

export interface ProfileInspectionResult {
  kind: ProfileKind;
  details?: string;
}

export interface AccountContext {
  account: AccountRow;
  page: import("playwright").Page;
}

export interface ValidationResult {
  valid: boolean;
  reason?: string;
}
