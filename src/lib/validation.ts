/**
 * Input validation shared by the forms and mirrored in `firestore.rules`, so a
 * hand-crafted write is rejected by the server even if it never touches the UI.
 */

import { isValidDateISO } from "./dates";

export const LIMITS = {
  description: 80,
  notes: 200,
  householdName: 60,
  memberName: 80,
} as const;

/** Nothing in a household budget predates the app; guards against typo'd years. */
const EARLIEST_DATE = "2020-01-01";

export type Validated<T> = { ok: true; value: T } | { ok: false; error: string };

function collapseWhitespace(raw: string): string {
  return raw.trim().replace(/\s+/g, " ");
}

export function validateDescription(raw: string): Validated<string> {
  const value = collapseWhitespace(raw);
  if (!value) return { ok: false, error: "Enter what was bought." };
  if (value.length > LIMITS.description) {
    return { ok: false, error: `Keep the item under ${LIMITS.description} characters.` };
  }
  return { ok: true, value };
}

export function validateNotes(raw: string): Validated<string> {
  const value = raw.trim();
  if (value.length > LIMITS.notes) {
    return { ok: false, error: `Keep notes under ${LIMITS.notes} characters.` };
  }
  return { ok: true, value };
}

export function validateHouseholdName(raw: string): Validated<string> {
  const value = collapseWhitespace(raw);
  if (!value) return { ok: false, error: "Give your flat a name." };
  if (value.length > LIMITS.householdName) {
    return { ok: false, error: `Keep the name under ${LIMITS.householdName} characters.` };
  }
  return { ok: true, value };
}

/**
 * Accepts a real calendar day that is not in the future. Tomorrow is allowed so
 * a roommate in a different timezone can still log today's purchase.
 */
export function validateExpenseDate(raw: string, now: Date = new Date()): Validated<string> {
  const value = raw.trim();
  if (!isValidDateISO(value)) return { ok: false, error: "Pick a valid date." };
  if (value < EARLIEST_DATE) return { ok: false, error: "That date is too far in the past." };

  const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  const pad = (n: number) => String(n).padStart(2, "0");
  const limit = `${tomorrow.getFullYear()}-${pad(tomorrow.getMonth() + 1)}-${pad(tomorrow.getDate())}`;
  if (value > limit) return { ok: false, error: "You cannot log an expense in the future." };

  return { ok: true, value };
}

/** Trims a Google display name down to something that fits the rules. */
export function safeMemberName(raw: string | null | undefined, fallback = "Roommate"): string {
  const value = collapseWhitespace(raw ?? "");
  if (!value) return fallback;
  return value.slice(0, LIMITS.memberName);
}
