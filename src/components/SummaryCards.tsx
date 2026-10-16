"use client";

import { ArrowDownLeft, ArrowUpRight, CheckCircle2, PieChart, Users, Wallet } from "lucide-react";
import type { ReactNode } from "react";

import { formatPaise } from "@/lib/money";
import { formatMonthKey, type MonthFilter } from "@/lib/dates";
import type { Balance } from "@/lib/settlements";
import { Card, cx } from "./ui/primitives";

const TONES = {
  indigo: "bg-indigo-50 text-indigo-600",
  slate: "bg-slate-100 text-slate-600",
  emerald: "bg-emerald-50 text-emerald-600",
  amber: "bg-amber-50 text-amber-600",
} as const;

function Metric({
  icon,
  label,
  value,
  caption,
  tone = "indigo",
  emphasis,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  caption?: string;
  tone?: keyof typeof TONES;
  emphasis?: "positive" | "negative";
}) {
  return (
    <Card as="div" className="p-4">
      <span className={cx("grid h-9 w-9 place-items-center rounded-xl", TONES[tone])}>{icon}</span>
      <p className="mt-3 text-sm text-slate-500">{label}</p>
      <p
        className={cx(
          "tnum mt-1 text-xl font-bold tracking-tight sm:text-2xl",
          emphasis === "positive" && "text-emerald-700",
          emphasis === "negative" && "text-amber-700",
          !emphasis && "text-slate-900",
        )}
      >
        {value}
      </p>
      {caption ? <p className="mt-0.5 text-xs text-slate-500">{caption}</p> : null}
    </Card>
  );
}

export function SummaryCards({
  totalPaise,
  memberCount,
  month,
  mine,
}: {
  totalPaise: number;
  memberCount: number;
  month: MonthFilter;
  /** The signed-in user's row, absent only if they are not an active member. */
  mine: Balance | null;
}) {
  const net = mine?.netPaise ?? 0;
  const settled = net === 0;

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <Metric
        icon={<PieChart size={18} aria-hidden />}
        label="Flat total"
        value={formatPaise(totalPaise)}
        caption={formatMonthKey(month)}
      />
      <Metric
        icon={<Wallet size={18} aria-hidden />}
        label="You paid"
        value={formatPaise(mine?.paidPaise ?? 0)}
        tone="slate"
      />
      <Metric
        icon={<Users size={18} aria-hidden />}
        label="Your fair share"
        value={formatPaise(mine?.sharePaise ?? 0)}
        caption={memberCount > 0 ? `Split ${memberCount} ways` : undefined}
        tone="slate"
      />
      <Metric
        icon={
          settled ? (
            <CheckCircle2 size={18} aria-hidden />
          ) : net > 0 ? (
            <ArrowDownLeft size={18} aria-hidden />
          ) : (
            <ArrowUpRight size={18} aria-hidden />
          )
        }
        label={settled ? "You are settled" : net > 0 ? "You will receive" : "You need to send"}
        value={formatPaise(Math.abs(net))}
        tone={settled ? "slate" : net > 0 ? "emerald" : "amber"}
        emphasis={settled ? undefined : net > 0 ? "positive" : "negative"}
      />
    </div>
  );
}
