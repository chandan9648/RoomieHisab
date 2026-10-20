"use client";

/**
 * The expenses tab's "who spent what" control. The amounts live in the option
 * labels themselves, so one tap on a phone answers the question without the
 * list having to be filtered first — and picking someone then narrows the list
 * below to just their purchases.
 */

import { Download, UserRound } from "lucide-react";

import { formatPaise } from "@/lib/money";
import { ALL_PAYERS, type PayerFilter, type PayerSpend } from "@/lib/reports";
import { Button } from "./ui/primitives";

export function SpendFilter({
  value,
  onChange,
  breakdown,
  totalPaise,
  entryCount,
  onExport,
  periodLabel,
}: {
  value: PayerFilter;
  onChange: (next: PayerFilter) => void;
  /** Per-person totals for the period on screen, biggest spender first. */
  breakdown: PayerSpend[];
  totalPaise: number;
  entryCount: number;
  onExport: () => void;
  periodLabel: string;
}) {
  const selected = value === ALL_PAYERS ? null : breakdown.find((p) => p.uid === value) ?? null;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <UserRound
            size={16}
            aria-hidden
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
          />
          <label htmlFor="payer-filter" className="sr-only">
            Show spending by
          </label>
          <select
            id="payer-filter"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="min-h-11 w-full appearance-none rounded-xl border border-slate-300 bg-white pl-9 pr-9 text-sm font-semibold text-slate-800 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
          >
            <option value={ALL_PAYERS}>
              All roommates · {formatPaise(totalPaise)}
            </option>
            {breakdown.map((person) => (
              <option key={person.uid} value={person.uid}>
                {person.name}
                {person.active ? "" : " (left)"} · {formatPaise(person.paidPaise)}
              </option>
            ))}
          </select>
          <ChevronDown />
        </div>

        <Button
          variant="secondary"
          onClick={onExport}
          icon={<Download size={16} aria-hidden />}
          className="shrink-0 px-3 sm:px-4"
        >
          Export
        </Button>
      </div>

      <p className="text-xs text-slate-500">
        {selected ? (
          <>
            <span className="font-semibold text-slate-700">{selected.name}</span> paid{" "}
            <span className="tnum font-semibold text-slate-700">
              {formatPaise(selected.paidPaise)}
            </span>{" "}
            across {selected.count} {selected.count === 1 ? "entry" : "entries"} ·{" "}
            {selected.percent.toFixed(0)}% of {periodLabel}
          </>
        ) : (
          <>
            {entryCount} {entryCount === 1 ? "entry" : "entries"} ·{" "}
            <span className="tnum font-semibold text-slate-700">{formatPaise(totalPaise)}</span>{" "}
            across {breakdown.length} {breakdown.length === 1 ? "person" : "people"}
          </>
        )}
      </p>

      {/* A compact bar per person: the same numbers, readable without opening the menu. */}
      {value === ALL_PAYERS && breakdown.length > 1 && totalPaise > 0 ? (
        <ul className="space-y-1.5 pt-1">
          {breakdown
            .filter((person) => person.paidPaise > 0)
            .map((person) => (
              <li key={person.uid} className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate text-xs font-medium text-slate-600">
                  {person.name}
                </span>
                <span className="h-1.5 w-20 overflow-hidden rounded-full bg-slate-100 sm:w-32">
                  <span
                    className="block h-full rounded-full bg-indigo-500"
                    style={{ width: `${Math.min(100, person.percent)}%` }}
                  />
                </span>
                <span className="tnum w-24 shrink-0 text-right text-xs font-semibold text-slate-700">
                  {formatPaise(person.paidPaise)}
                </span>
              </li>
            ))}
        </ul>
      ) : null}
    </div>
  );
}

/** The select's own arrow is hidden by `appearance-none`, so one is drawn. */
function ChevronDown() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 20 20"
      className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 fill-none stroke-slate-400"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M5 7.5 10 12.5 15 7.5" />
    </svg>
  );
}
