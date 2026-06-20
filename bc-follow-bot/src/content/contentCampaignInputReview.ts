import type {
  ContentDraftSourceRecord,
  ContentTargetType,
  LoadedContentDraftSources
} from "./types";
import { loadContentDraftSources } from "./contentDraftSourcesLoader";

export type ContentCampaignInputClassification =
  | "publish_flow_candidate"
  | "draft_only_manual"
  | "draft_possible_not_publish_ready"
  | "draft_blocked_unknown_language"
  | "draft_blocked_unsupported_content_type";

export interface ContentCampaignInputReviewItem {
  content_action_id: string;
  account_id: string;
  target_type: ContentTargetType;
  content_type: string;
  language: string;
  classification: ContentCampaignInputClassification;
  reason: string;
}

export interface ContentCampaignInputReviewSummary {
  totalRows: number;
  validEnabledCount: number;
  disabledCount: number;
  rejectedCount: number;
  publishFlowCandidateCount: number;
  draftOnlyManualCount: number;
  draftPossibleNotPublishReadyCount: number;
  unknownLanguageCount: number;
  unsupportedContentTypeCount: number;
  suggestedCampaignSizeMinimum: number;
  suggestedCampaignSizeMaximum: number;
}

export interface ContentCampaignInputReviewResult {
  items: ContentCampaignInputReviewItem[];
  rejected: LoadedContentDraftSources["rejected"];
  disabled: LoadedContentDraftSources["disabled"];
  summary: ContentCampaignInputReviewSummary;
}

const SUGGESTED_CAMPAIGN_SIZE_MINIMUM = 5;
const SUGGESTED_CAMPAIGN_SIZE_MAXIMUM = 10;

function isUnknownLanguage(language: string): boolean {
  const normalized = language.trim().toLowerCase();
  return normalized.length === 0 || normalized === "unknown";
}

function classifySource(source: ContentDraftSourceRecord): {
  classification: ContentCampaignInputClassification;
  reason: string;
} {
  if (source.content_type !== "post") {
    return {
      classification: "draft_blocked_unsupported_content_type",
      reason: "AI draft campaign MVP supports content_type=post only"
    };
  }

  if (isUnknownLanguage(source.language)) {
    return {
      classification: "draft_blocked_unknown_language",
      reason: "language is unknown; operator must set a specific language before draft generation"
    };
  }

  if (source.target_type === "profile_url") {
    return {
      classification: "publish_flow_candidate",
      reason: "profile_url with a full URL can continue through draft, approval, plan, browser dry-run, and manual publish gates"
    };
  }

  if (source.target_type === "manual") {
    return {
      classification: "draft_only_manual",
      reason: "target_type=manual is draft-only and must not be used for browser dry-run or manual publish"
    };
  }

  return {
    classification: "draft_possible_not_publish_ready",
    reason: "this target can be used for draft preparation, but the supervised post publish flow requires target_type=profile_url"
  };
}

function countItems(
  items: ContentCampaignInputReviewItem[],
  classification: ContentCampaignInputClassification
): number {
  return items.filter((item) => item.classification === classification).length;
}

export function reviewLoadedContentCampaignInput(
  loaded: LoadedContentDraftSources
): ContentCampaignInputReviewResult {
  const items = loaded.valid.map((source) => {
    const classification = classifySource(source);

    return {
      content_action_id: source.content_action_id,
      account_id: source.account_id,
      target_type: source.target_type,
      content_type: source.content_type,
      language: source.language,
      classification: classification.classification,
      reason: classification.reason
    };
  });

  return {
    items,
    rejected: loaded.rejected,
    disabled: loaded.disabled,
    summary: {
      totalRows: loaded.valid.length + loaded.disabled.length + loaded.rejected.length,
      validEnabledCount: loaded.valid.length,
      disabledCount: loaded.disabled.length,
      rejectedCount: loaded.rejected.length,
      publishFlowCandidateCount: countItems(items, "publish_flow_candidate"),
      draftOnlyManualCount: countItems(items, "draft_only_manual"),
      draftPossibleNotPublishReadyCount: countItems(items, "draft_possible_not_publish_ready"),
      unknownLanguageCount: countItems(items, "draft_blocked_unknown_language"),
      unsupportedContentTypeCount: countItems(items, "draft_blocked_unsupported_content_type"),
      suggestedCampaignSizeMinimum: SUGGESTED_CAMPAIGN_SIZE_MINIMUM,
      suggestedCampaignSizeMaximum: SUGGESTED_CAMPAIGN_SIZE_MAXIMUM
    }
  };
}

export function reviewContentCampaignInput(
  filePath = "data/content-draft-sources.csv"
): ContentCampaignInputReviewResult {
  return reviewLoadedContentCampaignInput(loadContentDraftSources(filePath));
}
