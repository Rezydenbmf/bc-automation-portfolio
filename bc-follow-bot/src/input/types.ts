import type { AppSettings, TargetType } from "../shared/types";

export interface RawAppSettingsRecord {
  headless?: unknown;
  timeoutMs?: unknown;
  slowMo?: unknown;
  debugScreenshots?: unknown;
  baseUrl?: unknown;
  screenshotOnError?: unknown;
  takeHtmlSnapshotOnError?: unknown;
  delayBetweenTargetsMs?: unknown;
  accountsV2Path?: unknown;
  maxFollowsPerRun?: unknown;
  preflightOperationWarningThreshold?: unknown;
  requireManualConfirmForLargeRun?: unknown;
  maxContentActionsPerRun?: unknown;
  maxContentActionsPerAccount?: unknown;
  maxContentPublishesPerRun?: unknown;
  maxContentPublishesPerAccount?: unknown;
  maxContentBrowserDryRunPerRun?: unknown;
  maxContentBrowserDryRunPerAccount?: unknown;
  maxContentManualPublishesPerRun?: unknown;
  maxContentManualPublishesPerAccount?: unknown;
  maxContentTitleLength?: unknown;
  aiDraftsEnabled?: unknown;
  aiDraftProvider?: unknown;
  aiDraftModel?: unknown;
  maxContentAiDraftsPerRun?: unknown;
  maxContentDraftTextLength?: unknown;
  maxContentDraftTitleLength?: unknown;
  requireFinalManualConfirmBeforePublish?: unknown;
  requireManualApprovalForContent?: unknown;
  contentDryRunDefault?: unknown;
  [key: string]: unknown;
}

export interface RawAccountRecord {
  account_id?: string;
  email?: string;
  password?: string;
  enabled?: string;
  language?: string;
  note?: string;
  [key: string]: string | undefined;
}

export interface RawTargetRecord {
  target_id?: string;
  target_type?: string;
  target_value?: string;
  enabled?: string;
  note?: string;
  [key: string]: string | undefined;
}

export interface ValidAccountRecord {
  account_id: string;
  email: string;
  password: string;
  enabled: true;
  language: string;
  note: string;
}

export interface ValidTargetRecord {
  target_id: string;
  target_type: TargetType;
  target_value: string;
  enabled: true;
  note: string;
}

export interface ValidationIssue {
  field: string;
  code: string;
  message: string;
}

export interface RejectedAccountRecord {
  rowNumber: number;
  raw: RawAccountRecord;
  issues: ValidationIssue[];
}

export interface RejectedTargetRecord {
  rowNumber: number;
  raw: RawTargetRecord;
  issues: ValidationIssue[];
  mappedResult: "invalid_target";
}

export interface InputFileError {
  file: string;
  message: string;
}

export interface LoadedInputData {
  config: AppSettings | null;
  accountsValid: ValidAccountRecord[];
  targetsValid: ValidTargetRecord[];
  accountsRejected: RejectedAccountRecord[];
  targetsRejected: RejectedTargetRecord[];
  fileErrors: InputFileError[];
}

export interface InputPaths {
  configPath: string;
  accountsPath: string;
  targetsPath: string;
}
