/**
 * Expense reporting. Pure, so the "who spent what" breakdown the dashboard
 * shows and the rows an export writes are built by exactly the same code — a
 * downloaded sheet can never disagree with what was on screen.
 *
 * Money stays in integer paise right up to the formatter, and dates stay as
 * plain "YYYY-MM-DD" local calendar days, which compare correctly as strings.
 */

import { formatDateISO, isValidDateISO } from "./dates";
import type { Expense, Member } from "./types";

/** The dropdown's "everyone" option. Not a uid, so it can never collide. */
export const ALL_PAYERS = "all" as const;
export type PayerFilter = string | typeof ALL_PAYERS;

export type PayerSpend = {
  uid: string;
  name: string;
  /** False for someone who has left the flat but still owns history. */
  active: boolean;
  paidPaise: number;
  count: number;
  /** Share of the period's total, 0–100. */
  percent: number;
};

/** Inclusive on both ends, which is how a person reads "1 Oct to 31 Oct". */
export function inDateRange(dateISO: string, startISO: string, endISO: string): boolean {
  return dateISO >= startISO && dateISO <= endISO;
}

export function matchesPayer(expense: Expense, payer: PayerFilter): boolean {
  return payer === ALL_PAYERS || expense.paidBy === payer;
}

export function totalPaise(expenses: Expense[]): number {
  return expenses.reduce((sum, e) => sum + (Number.isFinite(e.amountPaise) ? e.amountPaise : 0), 0);
}

/**
 * Every current member plus anyone who paid for something and has since left,
 * ordered by spend so the dropdown opens with the biggest spender on top.
 * Members with nothing logged are kept, because "₹0" is the answer to "how much
 * did Rahul spend this month" and dropping the row would hide it.
 */
export function spendByPayer(expenses: Expense[], members: Member[]): PayerSpend[] {
  const tally = new Map<string, { name: string; active: boolean; paidPaise: number; count: number }>();

  for (const member of members) {
    tally.set(member.uid, { name: member.displayName, active: true, paidPaise: 0, count: 0 });
  }

  for (const expense of expenses) {
    let row = tally.get(expense.paidBy);
    if (!row) {
      // The name is read off the expense itself, so history still reads
      // correctly once the member row is gone.
      row = { name: expense.payerName || "Former roommate", active: false, paidPaise: 0, count: 0 };
      tally.set(expense.paidBy, row);
    }

    row.paidPaise += Number.isFinite(expense.amountPaise) ? expense.amountPaise : 0;
    row.count += 1;
  }

  const total = totalPaise(expenses);

  return [...tally.entries()]
    .map(([uid, row]) => ({
      uid,
      name: row.name,
      active: row.active,
      paidPaise: row.paidPaise,
      count: row.count,
      percent: total > 0 ? (row.paidPaise / total) * 100 : 0,
    }))
    .sort((a, b) => b.paidPaise - a.paidPaise || a.name.localeCompare(b.name));
}

export type ReportRange = { startISO: string; endISO: string };

export type ReportRequest = ReportRange & {
  payer: PayerFilter;
};

export type ReportRow = {
  dateISO: string;
  description: string;
  payerName: string;
  notes: string;
  amountPaise: number;
};

export type Report = {
  range: ReportRange;
  /** The label for the scope that was exported, e.g. "All roommates". */
  scope: string;
  rows: ReportRow[];
  /** Per-payer totals for the rows above. */
  breakdown: PayerSpend[];
  totalPaise: number;
  count: number;
};

export function describeRange({ startISO, endISO }: ReportRange): string {
  return `${formatDateISO(startISO)} – ${formatDateISO(endISO)}`;
}

export function isValidRange({ startISO, endISO }: ReportRange): boolean {
  return isValidDateISO(startISO) && isValidDateISO(endISO) && startISO <= endISO;
}

/**
 * Builds a report straight from the household's expense list. Oldest first,
 * because a downloaded statement reads top-to-bottom as the month happened.
 */
export function buildReport(
  expenses: Expense[],
  members: Member[],
  { startISO, endISO, payer }: ReportRequest,
): Report {
  const inPeriod = expenses.filter((e) => inDateRange(e.date, startISO, endISO));
  const selected = inPeriod.filter((e) => matchesPayer(e, payer));

  const rows = [...selected]
    .sort((a, b) => a.date.localeCompare(b.date) || a.createdAt - b.createdAt)
    .map((e) => ({
      dateISO: e.date,
      description: e.description,
      payerName: members.find((m) => m.uid === e.paidBy)?.displayName ?? e.payerName,
      notes: e.notes,
      amountPaise: e.amountPaise,
    }));

  return {
    range: { startISO, endISO },
    scope: payerLabel(payer, members, expenses),
    rows,
    // The breakdown always covers the whole period so an export of one person's
    // spending still shows what it was a share of.
    breakdown: spendByPayer(inPeriod, members),
    totalPaise: totalPaise(selected),
    count: rows.length,
  };
}

/** "All roommates", or the chosen payer's display name. */
export function payerLabel(payer: PayerFilter, members: Member[], expenses: Expense[] = []): string {
  if (payer === ALL_PAYERS) return "All roommates";
  const member = members.find((m) => m.uid === payer);
  if (member) return member.displayName;
  return expenses.find((e) => e.paidBy === payer)?.payerName || "Former roommate";
}

/** A filesystem-safe name: "roomie-hisab-expenses-2026-10-01-to-2026-10-31.pdf" */
export function reportFilename(report: Report, extension: "pdf" | "xlsx"): string {
  // A name written in a non-Latin script leaves nothing behind, so the generic
  // word stands in rather than a filename with a hole in the middle.
  const scope =
    report.scope
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "expenses";
  return `roomie-hisab-${scope}-${report.range.startISO}-to-${report.range.endISO}.${extension}`;
}
