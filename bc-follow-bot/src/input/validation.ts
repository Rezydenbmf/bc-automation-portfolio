import { AccountRow, TargetRow, ValidationResult } from "../shared/types";

function isNonEmpty(value: string): boolean {
  return value.trim().length > 0;
}

function isValidLanguage(value: string | undefined): boolean {
  const normalized = value?.trim() ?? "";
  return normalized.length === 0 || normalized === "unknown" || /^[a-z]{2,3}$/i.test(normalized);
}

export function validateAccountRow(account: AccountRow): ValidationResult {
  if (!isNonEmpty(account.account_id)) {
    return { valid: false, reason: "missing_account_id" };
  }

  if (!isNonEmpty(account.email)) {
    return { valid: false, reason: "missing_email" };
  }

  if (!isNonEmpty(account.password)) {
    return { valid: false, reason: "missing_password" };
  }

  if (!isValidLanguage(account.language)) {
    return { valid: false, reason: "invalid_language" };
  }

  return { valid: true };
}

export function validateTargetRow(target: TargetRow): ValidationResult {
  if (!isNonEmpty(target.target_id)) {
    return { valid: false, reason: "missing_target_id" };
  }

  if (!isNonEmpty(target.target_type)) {
    return { valid: false, reason: "missing_target_type" };
  }

  if (!isNonEmpty(target.target_value)) {
    return { valid: false, reason: "missing_target_value" };
  }

  const allowedTypes = new Set(["profile_url", "email", "full_name"]);
  if (!allowedTypes.has(target.target_type)) {
    return { valid: false, reason: "invalid_target_type" };
  }

  return { valid: true };
}
