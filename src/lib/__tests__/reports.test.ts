import { describe, expect, it } from "vitest";

import {
  ALL_PAYERS,
  buildReport,
  inDateRange,
  isValidRange,
  payerLabel,
  reportFilename,
  spendByPayer,
  totalPaise,
} from "../reports";
import type { Expense, Member } from "../types";

function member(uid: string, displayName: string): Member {
  return {
    uid,
    displayName,
    email: `${uid}@flat.test`,
    photoURL: null,
    joinedAt: 1,
    role: "member",
    joinedVia: "CODE",
  };
}

function expense(partial: Partial<Expense> & Pick<Expense, "id" | "amountPaise" | "paidBy">): Expense {
  return {
    description: "Milk",
    date: "2026-10-10",
    payerName: "Someone",
    notes: "",
    createdAt: 1,
    ...partial,
  };
}

const MEMBERS = [member("u1", "Asha"), member("u2", "Bikram")];

const EXPENSES: Expense[] = [
  expense({ id: "a", amountPaise: 10_000, paidBy: "u1", date: "2026-09-30", description: "Gas" }),
  expense({ id: "b", amountPaise: 25_000, paidBy: "u1", date: "2026-10-01", description: "Rent" }),
  expense({ id: "c", amountPaise: 5_000, paidBy: "u2", date: "2026-10-15", description: "Milk" }),
  expense({ id: "d", amountPaise: 7_500, paidBy: "u2", date: "2026-10-31", description: "Wi-Fi" }),
  expense({ id: "e", amountPaise: 1_000, paidBy: "u1", date: "2026-11-01", description: "Eggs" }),
];

describe("inDateRange", () => {
  it("includes both end points, because that is how a person reads a period", () => {
    expect(inDateRange("2026-10-01", "2026-10-01", "2026-10-31")).toBe(true);
    expect(inDateRange("2026-10-31", "2026-10-01", "2026-10-31")).toBe(true);
  });

  it("excludes the day either side", () => {
    expect(inDateRange("2026-09-30", "2026-10-01", "2026-10-31")).toBe(false);
    expect(inDateRange("2026-11-01", "2026-10-01", "2026-10-31")).toBe(false);
  });
});

describe("isValidRange", () => {
  it("accepts a well-formed range, including a single day", () => {
    expect(isValidRange({ startISO: "2026-10-01", endISO: "2026-10-31" })).toBe(true);
    expect(isValidRange({ startISO: "2026-10-05", endISO: "2026-10-05" })).toBe(true);
  });

  it("rejects a backwards range and an impossible date", () => {
    expect(isValidRange({ startISO: "2026-10-31", endISO: "2026-10-01" })).toBe(false);
    expect(isValidRange({ startISO: "2026-02-30", endISO: "2026-03-01" })).toBe(false);
    expect(isValidRange({ startISO: "", endISO: "2026-03-01" })).toBe(false);
  });
});

describe("spendByPayer", () => {
  it("totals what each roommate paid, biggest spender first", () => {
    const spend = spendByPayer(EXPENSES, MEMBERS);
    expect(spend.map((p) => [p.name, p.paidPaise])).toEqual([
      ["Asha", 36_000],
      ["Bikram", 12_500],
    ]);
  });

  it("counts entries and the share of the total", () => {
    const [asha, bikram] = spendByPayer(EXPENSES, MEMBERS);
    expect(asha.count).toBe(3);
    expect(bikram.count).toBe(2);
    expect(asha.percent + bikram.percent).toBeCloseTo(100, 6);
  });

  it("keeps a roommate who has spent nothing, because zero is the answer", () => {
    const spend = spendByPayer([], MEMBERS);
    expect(spend.map((p) => p.paidPaise)).toEqual([0, 0]);
    expect(spend.every((p) => p.percent === 0)).toBe(true);
  });

  it("keeps history paid for by someone who has since left the flat", () => {
    const withFormer = [
      ...EXPENSES,
      expense({ id: "f", amountPaise: 4_000, paidBy: "gone", payerName: "Chetan" }),
    ];
    const chetan = spendByPayer(withFormer, MEMBERS).find((p) => p.uid === "gone");
    expect(chetan).toMatchObject({ name: "Chetan", active: false, paidPaise: 4_000 });
  });
});

describe("buildReport", () => {
  const october = { startISO: "2026-10-01", endISO: "2026-10-31" };

  it("keeps only the expenses inside the range", () => {
    const report = buildReport(EXPENSES, MEMBERS, { ...october, payer: ALL_PAYERS });
    expect(report.rows.map((r) => r.description)).toEqual(["Rent", "Milk", "Wi-Fi"]);
    expect(report.totalPaise).toBe(37_500);
    expect(report.count).toBe(3);
  });

  it("orders rows oldest first, so a statement reads as the month happened", () => {
    const report = buildReport(EXPENSES, MEMBERS, { ...october, payer: ALL_PAYERS });
    expect(report.rows.map((r) => r.dateISO)).toEqual(["2026-10-01", "2026-10-15", "2026-10-31"]);
  });

  it("narrows the rows to one payer but still breaks down the whole period", () => {
    const report = buildReport(EXPENSES, MEMBERS, { ...october, payer: "u2" });
    expect(report.rows.map((r) => r.description)).toEqual(["Milk", "Wi-Fi"]);
    expect(report.totalPaise).toBe(12_500);
    expect(report.scope).toBe("Bikram");
    // The breakdown is what the narrowed total was a share of.
    expect(totalPaise(EXPENSES.filter((e) => inDateRange(e.date, october.startISO, october.endISO))))
      .toBe(37_500);
    expect(report.breakdown.reduce((sum, p) => sum + p.paidPaise, 0)).toBe(37_500);
  });

  it("prefers the live member name over the one frozen on the expense", () => {
    const stale = [expense({ id: "g", amountPaise: 100, paidBy: "u1", payerName: "Old name" })];
    const [row] = buildReport(stale, MEMBERS, { ...october, payer: ALL_PAYERS }).rows;
    expect(row.payerName).toBe("Asha");
  });

  it("returns an empty report rather than throwing when nothing matches", () => {
    const report = buildReport(EXPENSES, MEMBERS, {
      startISO: "2025-01-01",
      endISO: "2025-01-31",
      payer: ALL_PAYERS,
    });
    expect(report.rows).toEqual([]);
    expect(report.totalPaise).toBe(0);
  });
});

describe("payerLabel", () => {
  it("names the scope of an export", () => {
    expect(payerLabel(ALL_PAYERS, MEMBERS)).toBe("All roommates");
    expect(payerLabel("u2", MEMBERS)).toBe("Bikram");
  });

  it("falls back to the name on the expense for someone who has left", () => {
    const gone = [expense({ id: "h", amountPaise: 1, paidBy: "gone", payerName: "Chetan" })];
    expect(payerLabel("gone", MEMBERS, gone)).toBe("Chetan");
  });
});

describe("reportFilename", () => {
  it("is safe on every filesystem and says what it holds", () => {
    const report = buildReport(EXPENSES, MEMBERS, {
      startISO: "2026-10-01",
      endISO: "2026-10-31",
      payer: ALL_PAYERS,
    });
    expect(reportFilename(report, "pdf")).toBe(
      "roomie-hisab-all-roommates-2026-10-01-to-2026-10-31.pdf",
    );
    expect(reportFilename(report, "xlsx")).toMatch(/\.xlsx$/);
  });
});
