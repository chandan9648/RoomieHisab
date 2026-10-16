"use client";

/**
 * Month-end accounting control. Expenses are never deleted when a month rolls
 * over, so this is purely a filter over history: the settlement panel always
 * reflects whatever is selected here.
 */

import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";

import {
  ALL_TIME,
  currentMonthKey,
  formatMonthKey,
  shiftMonth,
  type MonthFilter,
} from "@/lib/dates";
import { IconButton } from "./ui/primitives";

export function MonthPicker({
  value,
  months,
  onChange,
}: {
  value: MonthFilter;
  /** Every month that has expenses, newest first. */
  months: string[];
  onChange: (next: MonthFilter) => void;
}) {
  const thisMonth = currentMonthKey();
  const isAllTime = value === ALL_TIME;
  // Nothing has been spent in the future, so there is nowhere to go forward to.
  const atLatest = isAllTime || value >= thisMonth;

  // The dropdown must be able to show the selected month even when it holds no
  // expenses — stepping back with the arrows lands on exactly that case.
  const options =
    months.includes(value) || isAllTime
      ? months
      : [value, ...months].sort((a, b) => b.localeCompare(a));

  return (
    <div className="flex items-center gap-2">
      <IconButton
        label="Previous month"
        variant="secondary"
        icon={<ChevronLeft size={18} />}
        disabled={isAllTime}
        onClick={() => onChange(shiftMonth(value === ALL_TIME ? thisMonth : value, -1))}
      />

      <div className="relative min-w-0 flex-1">
        <CalendarDays
          size={16}
          aria-hidden
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
        />
        <label htmlFor="month-filter" className="sr-only">
          Show expenses from
        </label>
        <select
          id="month-filter"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="min-h-11 w-full appearance-none rounded-xl border border-slate-300 bg-white pl-9 pr-9 text-sm font-semibold text-slate-800 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
        >
          {options.map((month) => (
            <option key={month} value={month}>
              {formatMonthKey(month)}
            </option>
          ))}
          <option value={ALL_TIME}>{formatMonthKey(ALL_TIME)}</option>
        </select>
        <ChevronRight
          size={16}
          aria-hidden
          className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 rotate-90 text-slate-400"
        />
      </div>

      <IconButton
        label="Next month"
        variant="secondary"
        icon={<ChevronRight size={18} />}
        disabled={atLatest}
        onClick={() => onChange(shiftMonth(value === ALL_TIME ? thisMonth : value, 1))}
      />
    </div>
  );
}
