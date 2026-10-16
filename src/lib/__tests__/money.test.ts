import { describe, expect, it } from "vitest";

import { MAX_AMOUNT_PAISE, formatPaise, paiseToInput, parseAmountToPaise } from "../money";

/** The ₹ formatter emits non-breaking spaces; compare on the digits instead. */
const digits = (formatted: string) => formatted.replace(/[^\d.,]/g, "");

describe("parseAmountToPaise", () => {
  it("reads whole rupees", () => {
    expect(parseAmountToPaise("10")).toEqual({ ok: true, paise: 1000 });
  });

  it("pads a single decimal place", () => {
    expect(parseAmountToPaise("10.5")).toEqual({ ok: true, paise: 1050 });
  });

  it("keeps small fractions exact where a float would not", () => {
    // 0.07 * 100 is 7.000000000000001 in binary floating point.
    expect(parseAmountToPaise("0.07")).toEqual({ ok: true, paise: 7 });
    expect(parseAmountToPaise("1.15")).toEqual({ ok: true, paise: 115 });
    expect(parseAmountToPaise("8.29")).toEqual({ ok: true, paise: 829 });
  });

  it("tolerates a rupee sign, commas and padding", () => {
    expect(parseAmountToPaise("  ₹1,234.50 ")).toEqual({ ok: true, paise: 123450 });
  });

  it("accepts the maximum amount and rejects anything above it", () => {
    expect(parseAmountToPaise(String(MAX_AMOUNT_PAISE / 100))).toEqual({
      ok: true,
      paise: MAX_AMOUNT_PAISE,
    });
    expect(parseAmountToPaise(String(MAX_AMOUNT_PAISE / 100 + 1)).ok).toBe(false);
  });

  it.each(["", "   ", "abc", "10.123", "1.2.3", "-5", "0", "0.00", "1e5"])(
    "rejects %o",
    (input) => {
      const result = parseAmountToPaise(input);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toBeTruthy();
    },
  );
});

describe("formatPaise", () => {
  it("always shows exactly two decimals", () => {
    expect(digits(formatPaise(1050))).toBe("10.50");
    expect(digits(formatPaise(1000))).toBe("10.00");
    expect(digits(formatPaise(7))).toBe("0.07");
  });

  it("groups in the Indian lakh/crore style", () => {
    // ₹1,00,000.00 rather than ₹100,000.00
    expect(digits(formatPaise(10_000_000))).toBe("1,00,000.00");
  });

  it("falls back to zero for a non-finite amount", () => {
    expect(digits(formatPaise(Number.NaN))).toBe("0.00");
  });
});

describe("paiseToInput", () => {
  it("round-trips through the form field", () => {
    for (const paise of [7, 100, 1050, 123450]) {
      const text = paiseToInput(paise);
      expect(parseAmountToPaise(text)).toEqual({ ok: true, paise });
    }
  });
});
