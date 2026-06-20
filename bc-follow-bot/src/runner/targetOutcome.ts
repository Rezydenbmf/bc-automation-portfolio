import { LoginResult } from "../auth/authService";
import { FollowActionResult, FollowResult, SearchResult } from "../shared/types";

export type FinalTargetStatus = FollowResult;

export function mapLoginResultToFinalTargetStatus(
  result: LoginResult,
): FinalTargetStatus {
  return result === "portal_unavailable" ? "portal_unavailable" : "login_failed";
}

export function mapSearchResultToFinalTargetStatus(
  searchResult: SearchResult,
): FinalTargetStatus {
  return searchResult.status;
}

export function mapFollowResultToFinalTargetStatus(
  followResult: FollowActionResult,
): FinalTargetStatus {
  return followResult.result;
}
