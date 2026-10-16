/**
 * Expense writes and the one place a form draft is turned into a Firestore
 * document. Validation here is mirrored by `firestore.rules`, so a write that
 * bypasses the UI is rejected by the server too.
 */

import { addDoc, deleteDoc, setDoc } from "firebase/firestore";

import { requireFirebase } from "./firebase";
import { expenseRef, expensesRef } from "./households";
import { parseAmountToPaise } from "./money";
import { todayISO } from "./dates";
import { validateDescription, validateExpenseDate, validateNotes } from "./validation";
import type { ExpenseData, Member } from "./types";

/** The raw strings an expense form holds. */
export type ExpenseDraft = {
  description: string;
  /** Rupees as typed, e.g. "149.50". */
  amount: string;
  date: string;
  paidBy: string;
  notes: string;
};

export function emptyDraft(paidBy: string): ExpenseDraft {
  return { description: "", amount: "", date: todayISO(), paidBy, notes: "" };
}

export function draftFromExpense(expense: ExpenseData): ExpenseDraft {
  return {
    description: expense.description,
    amount: (expense.amountPaise / 100).toFixed(2),
    date: expense.date,
    paidBy: expense.paidBy,
    notes: expense.notes,
  };
}

export type DraftErrors = Partial<Record<keyof ExpenseDraft, string>>;
export type BuiltExpense =
  | { ok: true; value: ExpenseData }
  | { ok: false; errors: DraftErrors };

/**
 * Validates a draft field by field so the form can show every problem at once
 * instead of only the first one.
 */
export function buildExpense(
  draft: ExpenseDraft,
  members: Member[],
  createdAt: number = Date.now(),
): BuiltExpense {
  const errors: DraftErrors = {};

  const description = validateDescription(draft.description);
  if (!description.ok) errors.description = description.error;

  const amount = parseAmountToPaise(draft.amount);
  if (!amount.ok) errors.amount = amount.error;

  const date = validateExpenseDate(draft.date);
  if (!date.ok) errors.date = date.error;

  const notes = validateNotes(draft.notes);
  if (!notes.ok) errors.notes = notes.error;

  const payer = members.find((m) => m.uid === draft.paidBy);
  if (!payer) errors.paidBy = "Choose who paid for this.";

  if (Object.keys(errors).length > 0) return { ok: false, errors };

  return {
    ok: true,
    value: {
      description: (description as { ok: true; value: string }).value,
      amountPaise: (amount as { ok: true; paise: number }).paise,
      date: (date as { ok: true; value: string }).value,
      paidBy: payer!.uid,
      payerName: payer!.displayName,
      notes: (notes as { ok: true; value: string }).value,
      createdAt,
    },
  };
}

export async function createExpense(householdId: string, data: ExpenseData): Promise<void> {
  const { db } = requireFirebase();
  await addDoc(expensesRef(db, householdId), data);
}

/**
 * Overwrites an expense. `createdAt` is carried over from the original so
 * editing an old entry does not jump it to the top of the list.
 */
export async function saveExpense(
  householdId: string,
  expenseId: string,
  data: ExpenseData,
): Promise<void> {
  const { db } = requireFirebase();
  await setDoc(expenseRef(db, householdId, expenseId), data);
}

export async function removeExpense(householdId: string, expenseId: string): Promise<void> {
  const { db } = requireFirebase();
  await deleteDoc(expenseRef(db, householdId, expenseId));
}

/** The payer or a household admin may edit and delete; nobody else. */
export function canModifyExpense(
  expense: { paidBy: string },
  uid: string,
  role: Member["role"] | undefined,
): boolean {
  return expense.paidBy === uid || role === "admin";
}
