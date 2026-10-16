/**
 * Money helpers. Every amount in this app is an integer number of paise so that
 * sums and splits are exact; we only convert to rupees at the moment of display.
 */

export const MAX_AMOUNT_PAISE = 10_000_000_00; // ₹1,00,00,000 — a sane upper bound for a flat purchase.

const inr = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const inrWhole = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

/** "₹1,234.50" — always two decimals, never more. */
export function formatPaise(paise: number): string {
  const safe = Number.isFinite(paise) ? Math.round(paise) : 0;
  return inr.format(safe / 100);
}

/** "₹1,235" for headline figures; drops decimals only when they are zero. */
export function formatPaiseCompact(paise: number): string {
  const safe = Number.isFinite(paise) ? Math.round(paise) : 0;
  return safe % 100 === 0 ? inrWhole.format(safe / 100) : inr.format(safe / 100);
}

export type ParsedAmount = { ok: true; paise: number } | { ok: false; error: string };

/**
 * Parses a user-typed rupee amount into paise without going through binary
 * floating point for the fractional part, so "0.07" can never become 6 paise.
 */
export function parseAmountToPaise(raw: string): ParsedAmount {
  const value = raw.trim().replace(/[₹,\s]/g, "");
  if (!value) return { ok: false, error: "Enter an amount." };
  if (!/^\d*(\.\d{0,2})?$/.test(value)) {
    return { ok: false, error: "Use digits with up to 2 decimal places, e.g. 149.50" };
  }

  const [rupees = "0", decimals = ""] = value.split(".");
  const paise = Number(rupees) * 100 + Number(decimals.padEnd(2, "0") || "0");

  if (!Number.isFinite(paise) || paise <= 0) return { ok: false, error: "Amount must be more than ₹0." };
  if (paise > MAX_AMOUNT_PAISE) return { ok: false, error: "That amount looks too large." };
  return { ok: true, paise: Math.round(paise) };
}

/** Paise back to an editable "10.50" string for form fields. */
export function paiseToInput(paise: number): string {
  return (Math.round(paise) / 100).toFixed(2);
}
