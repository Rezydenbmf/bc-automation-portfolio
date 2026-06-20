import type { ValidationIssue } from "../input/types";

export type DiscoveryStatus =
  | "profile_found"
  | "ambiguous_result"
  | "portal_error"
  | "found_single"
  | "found_multiple"
  | "not_found"
  | "discovery_not_implemented"
  | "invalid_input"
  | "search_failed"
  | "skipped_disabled";

export type DiscoveryConfidence = "high" | "medium" | "low" | "none";

export interface RawDiscoveryInputRecord {
  target_id?: string;
  email?: string;
  first_name?: string;
  last_name?: string;
  company?: string;
  country?: string;
  city?: string;
  enabled?: string;
  note?: string;
  [key: string]: string | undefined;
}

export interface ValidDiscoveryInputRecord {
  target_id: string;
  email: string;
  first_name: string;
  last_name: string;
  company: string;
  country: string;
  city: string;
  enabled: true;
  note: string;
}

export interface DiscoveryResultRow {
  target_id: string;
  input_email: string;
  input_first_name: string;
  input_last_name: string;
  input_company: string;
  input_country: string;
  input_city: string;
  discovery_status: DiscoveryStatus;
  profile_url: string;
  confidence: DiscoveryConfidence;
  reason: string;
  checked_at: string;
  note: string;
}

export interface RejectedDiscoveryInputRecord {
  rowNumber: number;
  raw: RawDiscoveryInputRecord;
  issues: ValidationIssue[];
  result: DiscoveryResultRow;
}

export interface DiscoveryInputValidationResult {
  valid: ValidDiscoveryInputRecord[];
  rejected: RejectedDiscoveryInputRecord[];
  skippedDisabled: DiscoveryResultRow[];
  fileErrors: Array<{ file: string; message: string }>;
}
