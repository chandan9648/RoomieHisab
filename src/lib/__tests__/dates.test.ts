import { describe, expect, it } from "vitest";

import {
  ALL_TIME,
  currentMonthKey,
  isValidDateISO,
  matchesMonth,
  monthKeyOf,
  monthsWithData,
  shiftMonth,
  todayISO,
} from "../dates";

// A fixed local date so these never depend on when the suite runs.
const NOW = new Date(2026, 9, 16); // 16 October 2026

describe("local calendar days", () => {
  it("uses local time, not UTC, so a late-night expense keeps its date", () => {
    // 23:30 local on the 16th is already the 17th in UTC; we must still say 16.
    expect(todayISO(new Date(2026, 9, 16, 23, 30))).toBe("2026-10-16");
  });

  it("derives the current month key", () => {
    expect(currentMonthKey(NOW)).toBe("2026-10");
  });

  it("pads single-digit months and days", () => {
    expect(todayISO(new Date(2026, 0, 5))).toBe("2026-01-05");
  });
});

describe("isValidDateISO", () => {
  it.each(["2026-10-16", "2024-02-29", "2026-01-01"])("accepts %s", (value) => {
    expect(isValidDateISO(value)).toBe(true);
  });

  it.each(["2026-02-30", "2026-13-01", "2026-00-10", "2026-10-32", "16-10-2026", "2026-10", ""])(
    "rejects %o",
    (value) => {
      expect(isValidDateISO(value)).toBe(false);
    },
  );
});

describe("month filtering", () => {
  it("maps a day to its month", () => {
    expect(monthKeyOf("2026-10-16")).toBe("2026-10");
  });

  it("matches only the selected month", () => {
    expect(matchesMonth("2026-10-16", "2026-10")).toBe(true);
    expect(matchesMonth("2026-09-30", "2026-10")).toBe(false);
  });

  it("matches everything under the all-time filter", () => {
    expect(matchesMonth("2019-01-01", ALL_TIME)).toBe(true);
  });
});

describe("shiftMonth", () => {
  it("crosses a year boundary backwards", () => {
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
  });

  it("crosses a year boundary forwards", () => {
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
  });

  it("is reversible", () => {
    expect(shiftMonth(shiftMonth("2026-07", -6), 6)).toBe("2026-07");
  });
});

describe("monthsWithData", () => {
  it("lists months newest first and always offers the current one", () => {
    expect(monthsWithData(["2026-09-15", "2026-10-02", "2026-09-01"], NOW)).toEqual([
      "2026-10",
      "2026-09",
    ]);
  });

  it("includes the current month for a brand new household", () => {
    expect(monthsWithData([], NOW)).toEqual(["2026-10"]);
  });

  it("keeps historical months so old expenses stay reachable", () => {
    // Nothing is deleted at month end, so last year must remain selectable.
    expect(monthsWithData(["2025-12-31"], NOW)).toEqual(["2026-10", "2025-12"]);
  });
});
