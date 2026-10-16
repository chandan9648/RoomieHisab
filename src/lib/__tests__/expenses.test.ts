import { describe, expect, it } from "vitest";

import { buildExpense, canModifyExpense, draftFromExpense, emptyDraft } from "../expenses";
import { todayISO } from "../dates";
import type { Member } from "../types";

const member = (uid: string, displayName: string, role: Member["role"] = "member"): Member => ({
  uid,
  displayName,
  email: `${uid}@example.com`,
  photoURL: null,
  joinedAt: 0,
  role,
  joinedVia: "",
});

const MEMBERS = [member("chandan", "Chandan", "admin"), member("shyam", "Shyam")];

const draft = (overrides: Partial<ReturnType<typeof emptyDraft>> = {}) => ({
  ...emptyDraft("chandan"),
  description: "Detergent",
  amount: "10",
  ...overrides,
});

describe("buildExpense", () => {
  it("turns a valid draft into an integer-paise document", () => {
    const result = buildExpense(draft(), MEMBERS, 1_700_000_000_000);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toEqual({
      description: "Detergent",
      amountPaise: 1000,
      date: todayISO(),
      paidBy: "chandan",
      payerName: "Chandan",
      notes: "",
      createdAt: 1_700_000_000_000,
    });
  });

  it("takes the payer name from the member list, not from the form", () => {
    const result = buildExpense(draft({ paidBy: "shyam" }), MEMBERS);
    expect(result.ok && result.value.payerName).toBe("Shyam");
  });

  it("collapses whitespace in the description", () => {
    const result = buildExpense(draft({ description: "  Dish   soap  " }), MEMBERS);
    expect(result.ok && result.value.description).toBe("Dish soap");
  });

  it("reports every bad field at once rather than only the first", () => {
    const result = buildExpense(
      draft({ description: "", amount: "-4", date: "nope", notes: "x".repeat(500) }),
      MEMBERS,
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(Object.keys(result.errors).sort()).toEqual(["amount", "date", "description", "notes"]);
  });

  it("rejects a payer who is not a member of the household", () => {
    const result = buildExpense(draft({ paidBy: "stranger" }), MEMBERS);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.paidBy).toBeTruthy();
  });

  it("rejects a future date", () => {
    const result = buildExpense(draft({ date: "2099-01-01" }), MEMBERS);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.date).toBeTruthy();
  });

  it("preserves createdAt when editing, so the feed order does not jump", () => {
    const original = buildExpense(draft(), MEMBERS, 1_000);
    expect(original.ok).toBe(true);
    if (!original.ok) return;

    const edited = buildExpense(
      draftFromExpense(original.value),
      MEMBERS,
      original.value.createdAt,
    );
    expect(edited.ok && edited.value.createdAt).toBe(1_000);
  });
});

describe("draftFromExpense", () => {
  it("round-trips an expense through the form without losing paise", () => {
    const built = buildExpense(draft({ amount: "149.07" }), MEMBERS);
    expect(built.ok).toBe(true);
    if (!built.ok) return;

    const reBuilt = buildExpense(draftFromExpense(built.value), MEMBERS, built.value.createdAt);
    expect(reBuilt.ok && reBuilt.value).toEqual(built.value);
  });
});

describe("canModifyExpense", () => {
  it("lets the payer edit their own expense", () => {
    expect(canModifyExpense({ paidBy: "shyam" }, "shyam", "member")).toBe(true);
  });

  it("lets an admin edit anyone's expense", () => {
    expect(canModifyExpense({ paidBy: "shyam" }, "chandan", "admin")).toBe(true);
  });

  it("stops an ordinary member editing someone else's expense", () => {
    expect(canModifyExpense({ paidBy: "chandan" }, "shyam", "member")).toBe(false);
  });

  it("stops a non-member entirely", () => {
    expect(canModifyExpense({ paidBy: "chandan" }, "stranger", undefined)).toBe(false);
  });
});
