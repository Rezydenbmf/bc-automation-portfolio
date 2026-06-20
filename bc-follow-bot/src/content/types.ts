export type ContentActionType = "comment" | "post";
export type ContentTargetType = "profile_url" | "post_url" | "manual";

export interface RawContentActionRecord {
  content_action_id?: string;
  account_id?: string;
  target_type?: string;
  target_value?: string;
  content_type?: string;
  language?: string;
  enabled?: string;
  note?: string;
  [key: string]: string | undefined;
}

export interface ContentActionRecord {
  content_action_id: string;
  account_id: string;
  target_type: ContentTargetType;
  target_value: string;
  content_type: ContentActionType;
  language: string;
  enabled: true;
  note: string;
}

export interface ContentActionValidationIssue {
  field: string;
  code: string;
  message: string;
}

export interface RejectedContentActionRecord {
  rowNumber: number;
  raw: RawContentActionRecord;
  issues: ContentActionValidationIssue[];
}

export interface DisabledContentActionRecord {
  rowNumber: number;
  raw: RawContentActionRecord;
}

export interface LoadedContentActions {
  valid: ContentActionRecord[];
  disabled: DisabledContentActionRecord[];
  rejected: RejectedContentActionRecord[];
}

export interface RawContentDraftSourceRecord {
  content_action_id?: string;
  account_id?: string;
  target_type?: string;
  target_value?: string;
  content_type?: string;
  language?: string;
  profile_name?: string;
  country?: string;
  industry?: string;
  bio?: string;
  post_goal?: string;
  topic_hint?: string;
  tone?: string;
  enabled?: string;
  note?: string;
  [key: string]: string | undefined;
}

export interface ContentDraftSourceRecord {
  content_action_id: string;
  account_id: string;
  target_type: ContentTargetType;
  target_value: string;
  content_type: ContentActionType;
  language: string;
  profile_name: string;
  country: string;
  industry: string;
  bio: string;
  post_goal: string;
  topic_hint: string;
  tone: string;
  enabled: true;
  note: string;
}

export interface RejectedContentDraftSourceRecord {
  rowNumber: number;
  raw: RawContentDraftSourceRecord;
  issues: ContentActionValidationIssue[];
}

export interface DisabledContentDraftSourceRecord {
  rowNumber: number;
  raw: RawContentDraftSourceRecord;
}

export interface LoadedContentDraftSources {
  valid: ContentDraftSourceRecord[];
  disabled: DisabledContentDraftSourceRecord[];
  rejected: RejectedContentDraftSourceRecord[];
}

export type ContentAiDraftGenerationStatus =
  | "content_ai_draft_generated"
  | "content_ai_draft_skipped_disabled"
  | "content_ai_draft_skipped_unknown_language"
  | "content_ai_draft_skipped_unsupported_content_type"
  | "content_ai_draft_skipped_limit_reached"
  | "content_ai_draft_invalid_source"
  | "content_ai_draft_failed";

export interface ContentAiDraftRow {
  content_action_id: string;
  account_id: string;
  target_type: string;
  target_value: string;
  content_type: string;
  source_language: string;
  draft_language: string;
  profile_name: string;
  country: string;
  industry: string;
  post_goal: string;
  topic_hint: string;
  draft_title: string;
  draft_text: string;
  draft_topic: string;
  draft_reason: string;
  generation_status: ContentAiDraftGenerationStatus;
  generation_reason: string;
}

export interface ContentAiDraftGenerationSummary {
  loadedCount: number;
  generatedCount: number;
  skippedCount: number;
  failedCount: number;
  approvalRowsCount: number;
  providerCallsCount: number;
}

export interface ContentAiDraftGenerationResult {
  rows: ContentAiDraftRow[];
  approvalRows: ContentApprovalRow[];
  summary: ContentAiDraftGenerationSummary;
}

export type ContentDryRunStatus =
  | "content_dry_run_ready"
  | "content_waiting_for_approval"
  | "content_skipped_disabled"
  | "content_skipped_language_unknown"
  | "content_skipped_language_mismatch"
  | "content_skipped_limit_reached"
  | "content_invalid_account"
  | "content_invalid_action";

export interface ContentDryRunRow {
  content_action_id: string;
  account_id: string;
  target_type: string;
  target_value: string;
  content_type: string;
  account_language: string;
  action_language: string;
  status: ContentDryRunStatus;
  approval_status: string;
  note: string;
  error_message: string;
}

export interface ContentApprovalRow {
  content_action_id: string;
  account_id: string;
  target_type: string;
  target_value: string;
  content_type: string;
  account_language: string;
  action_language: string;
  approval_status: string;
  approved_text: string;
  approved_title: string;
  reviewer_note: string;
}

export type ContentApprovalStatus =
  | "approved"
  | "rejected"
  | "needs_changes"
  | "pending";

export type ContentApprovalReviewStatus =
  | "content_approved_ready"
  | "content_rejected"
  | "content_needs_changes"
  | "content_pending_approval"
  | "content_invalid_approval";

export interface ContentApprovalReviewRow {
  content_action_id: string;
  account_id: string;
  target_type: string;
  target_value: string;
  content_type: string;
  approval_status: string;
  review_status: ContentApprovalReviewStatus;
  approved_text: string;
  approved_title: string;
  reviewer_note: string;
  validation_message: string;
}

export interface ContentApprovalReviewSummary {
  readCount: number;
  approvedReadyCount: number;
  rejectedCount: number;
  needsChangesCount: number;
  pendingCount: number;
  invalidCount: number;
}

export interface ContentApprovalReviewResult {
  rows: ContentApprovalReviewRow[];
  summary: ContentApprovalReviewSummary;
}

export type ContentPublishPlanStatus =
  | "content_publish_planned"
  | "content_publish_skipped_not_approved"
  | "content_publish_skipped_limit_reached"
  | "content_publish_invalid_record";

export interface ContentPublishPlanRow {
  content_action_id: string;
  account_id: string;
  target_type: string;
  target_value: string;
  content_type: string;
  approved_text: string;
  approved_title: string;
  publish_plan_status: ContentPublishPlanStatus;
  reason: string;
}

export interface ContentPublishPlanSummary {
  readCount: number;
  approvedReadyCount: number;
  plannedCount: number;
  skippedNotApprovedCount: number;
  skippedLimitReachedCount: number;
  invalidCount: number;
}

export interface ContentPublishPlanResult {
  rows: ContentPublishPlanRow[];
  summary: ContentPublishPlanSummary;
}

export interface ContentDryRunSummary {
  loadedCount: number;
  dryRunReadyCount: number;
  waitingForApprovalCount: number;
  skippedByStatus: Record<string, number>;
  executedActionsCount: 0;
}

export interface ContentDryRunResult {
  rows: ContentDryRunRow[];
  approvalRows: ContentApprovalRow[];
  summary: ContentDryRunSummary;
}

export type ContentRunAuditStatus =
  | "content_audit_valid"
  | "content_audit_sample_row_detected"
  | "content_audit_invalid_record"
  | "content_audit_missing_manual_portal_verification"
  | "content_audit_language_not_checked"
  | "content_audit_language_mismatch"
  | "content_audit_publish_failed"
  | "content_audit_unknown_result"
  | "content_audit_stop_condition_hit"
  | "content_audit_scale_not_ready"
  | "content_audit_scale_review_candidate";

export type ContentRunAuditRiskLevel = "none" | "warning" | "high";

export type ContentRunAuditRecommendation =
  | "keep_manual_limit_1"
  | "investigate_before_scaling"
  | "scale_review_candidate";

export interface ContentRunAuditReviewRow {
  run_id: string;
  audit_status: ContentRunAuditStatus;
  risk_level: ContentRunAuditRiskLevel;
  reason: string;
  recommendation: ContentRunAuditRecommendation;
}

export interface ContentRunAuditReviewSummary {
  runCount: number;
  sampleRowsDetected: number;
  totalSuccesses: number;
  totalFailures: number;
  totalUnknownResults: number;
  runsWithManualPortalVerification: number;
  runsWithCorrectLanguage: number;
  runsWithProblems: number;
  recommendation: ContentRunAuditRecommendation;
}

export interface ContentRunAuditReviewResult {
  rows: ContentRunAuditReviewRow[];
  summary: ContentRunAuditReviewSummary;
}
