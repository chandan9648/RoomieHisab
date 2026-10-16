import { describe, expect, it } from "vitest";

import {
  INVITE_CODE_LENGTH,
  formatInviteCode,
  generateInviteCode,
  isPlausibleInviteCode,
  normaliseInviteCode,
} from "../invite";
import { validateExpenseDate, validateHouseholdName, validateNotes } from "../validation";

describe("generateInviteCode", () => {
  it("produces codes of the documented length from the safe alphabet", () => {
    for (let i = 0; i < 50; i += 1) {
      const code = generateInviteCode();
      expect(code).toHaveLength(INVITE_CODE_LENGTH);
      // No 0/O, 1/I/L or U/V, which people confuse when reading a code aloud.
      expect(code).toMatch(/^[23456789ABCDEFGHJKMNPQRSTWXYZ]+$/);
    }
  });

  it("does not repeat itself across many draws", () => {
    const codes = new Set(Array.from({ length: 500 }, generateInviteCode));
    expect(codes.size).toBe(500);
  });
});

describe("normaliseInviteCode", () => {
  it("accepts the grouped form the UI prints", () => {
    expect(normaliseInviteCode(" abcd-234-xyz ")).toBe("ABCD234XYZ");
  });
});

describe("isPlausibleInviteCode", () => {
  it.each(["ABCD234XYZ", "abcd-234-xyz", "ABC234"])("accepts %o", (code) => {
    expect(isPlausibleInviteCode(code)).toBe(true);
  });

  it.each(["", "ABC", "ABCD234XYZQQ", "ABCD_234"])("rejects %o", (code) => {
    expect(isPlausibleInviteCode(code)).toBe(false);
  });
});

describe("formatInviteCode", () => {
  it("groups in fours for reading out loud", () => {
    expect(formatInviteCode("ABCD234XYZ")).toBe("ABCD-234X-YZ");
  });

  it("round-trips back through normalisation", () => {
    const code = generateInviteCode();
    expect(normaliseInviteCode(formatInviteCode(code))).toBe(code);
  });
});

describe("validation", () => {
  const NOW = new Date(2026, 9, 16);

  it("allows today and tomorrow, for roommates in another timezone", () => {
    expect(validateExpenseDate("2026-10-16", NOW).ok).toBe(true);
    expect(validateExpenseDate("2026-10-17", NOW).ok).toBe(true);
  });

  it("rejects a date further ahead than tomorrow", () => {
    expect(validateExpenseDate("2026-10-18", NOW).ok).toBe(false);
  });

  it("rejects an implausibly old date", () => {
    expect(validateExpenseDate("1999-01-01", NOW).ok).toBe(false);
  });

  it("requires a household name and caps its length", () => {
    expect(validateHouseholdName("   ").ok).toBe(false);
    expect(validateHouseholdName("x".repeat(61)).ok).toBe(false);
    expect(validateHouseholdName("  Gomti   Nagar Flat ")).toEqual({
      ok: true,
      value: "Gomti Nagar Flat",
    });
  });

  it("treats empty notes as valid", () => {
    expect(validateNotes("")).toEqual({ ok: true, value: "" });
  });
});
