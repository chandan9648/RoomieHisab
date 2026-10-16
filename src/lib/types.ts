/** Shared domain types. Money is always stored and computed as integer paise. */

export type MemberRole = "admin" | "member";

export type Household = {
  id: string;
  name: string;
  createdBy: string;
  inviteCode: string;
  createdAt: number;
};

export type Member = {
  uid: string;
  displayName: string;
  email: string;
  photoURL: string | null;
  joinedAt: number;
  role: MemberRole;
  /** The invite code this member redeemed, "" for the household creator. */
  joinedVia: string;
};

export type Expense = {
  id: string;
  description: string;
  /** Integer paise. 1050 === ₹10.50 */
  amountPaise: number;
  /** ISO calendar day, "YYYY-MM-DD", in the user's local time. */
  date: string;
  paidBy: string;
  payerName: string;
  notes: string;
  createdAt: number;
};

/** An expense as it is written to Firestore — the id comes from the document. */
export type ExpenseData = Omit<Expense, "id">;

export type UserProfile = {
  uid: string;
  displayName: string;
  email: string;
  photoURL: string | null;
  /** The household the dashboard is currently showing. */
  householdId: string | null;
  /** Every household this user belongs to, for explicit switching. */
  householdIds: string[];
};

/**
 * A top-level `invites/{CODE}` document. This exists so that a prospective
 * member can resolve a code to a household *without* being able to read, query
 * or enumerate the `households` collection. Rules permit `get` on an exact code
 * and never `list`.
 */
export type Invite = {
  code: string;
  householdId: string;
  householdName: string;
  createdBy: string;
  createdAt: number;
};
