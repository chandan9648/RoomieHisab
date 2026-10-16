"use client";

/**
 * One tab definition drives both the mobile bottom bar and the wider segmented
 * control, so the two can never drift apart.
 */

import { Handshake, Home, ReceiptText, Users } from "lucide-react";

import { cx } from "./ui/primitives";

export const TABS = [
  { id: "overview", label: "Home", icon: Home },
  { id: "expenses", label: "Expenses", icon: ReceiptText },
  { id: "settle", label: "Settle", icon: Handshake },
  { id: "flat", label: "Flat", icon: Users },
] as const;

export type TabId = (typeof TABS)[number]["id"];

export function TabBar({
  active,
  onChange,
}: {
  active: TabId;
  onChange: (tab: TabId) => void;
}) {
  return (
    <div
      role="tablist"
      aria-label="Dashboard sections"
      className="hidden gap-1 rounded-xl border border-slate-200 bg-white p-1 shadow-sm sm:flex"
    >
      {TABS.map(({ id, label, icon: Icon }) => (
        <button
          key={id}
          type="button"
          role="tab"
          aria-selected={active === id}
          aria-controls={`panel-${id}`}
          onClick={() => onChange(id)}
          className={cx(
            "flex min-h-10 flex-1 items-center justify-center gap-2 rounded-lg px-3 text-sm font-semibold transition-colors",
            active === id
              ? "bg-indigo-600 text-white"
              : "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
          )}
        >
          <Icon size={16} aria-hidden />
          {label}
        </button>
      ))}
    </div>
  );
}

export function BottomNav({
  active,
  onChange,
}: {
  active: TabId;
  onChange: (tab: TabId) => void;
}) {
  return (
    <nav
      aria-label="Dashboard sections"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 pb-safe backdrop-blur sm:hidden"
    >
      <div className="grid grid-cols-4">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            aria-current={active === id ? "page" : undefined}
            onClick={() => onChange(id)}
            className={cx(
              "flex min-h-14 flex-col items-center justify-center gap-1 text-[11px] font-semibold transition-colors",
              active === id ? "text-indigo-600" : "text-slate-500",
            )}
          >
            <Icon size={19} aria-hidden />
            {label}
          </button>
        ))}
      </div>
    </nav>
  );
}
