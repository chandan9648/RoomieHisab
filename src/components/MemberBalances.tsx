"use client";

import { Users } from "lucide-react";

import { formatPaise } from "@/lib/money";
import type { Balance } from "@/lib/settlements";
import type { Member } from "@/lib/types";
import { Avatar, Badge, Card, CardHeader, EmptyState, cx } from "./ui/primitives";

/** "gets back ₹120.00" reads better than a bare signed number. */
function statusLabel(balance: Balance): { text: string; tone: "positive" | "warning" | "neutral" } {
  if (balance.status === "owed") return { text: "gets back", tone: "positive" };
  if (balance.status === "owes") return { text: "owes", tone: "warning" };
  return { text: "settled", tone: "neutral" };
}

export function MemberBalances({
  balances,
  members,
  totalPaise,
  currentUid,
}: {
  balances: Balance[];
  members: Member[];
  totalPaise: number;
  currentUid: string;
}) {
  const byUid = new Map(members.map((m) => [m.uid, m]));

  return (
    <Card>
      <CardHeader
        title="Roommates"
        subtitle="Paid, fair share and balance"
        icon={<Users size={18} aria-hidden />}
      />

      {balances.length === 0 ? (
        <EmptyState
          icon={<Users size={22} aria-hidden />}
          title="No members yet"
          description="Share your invite code so roommates can join this flat."
        />
      ) : (
        <ul className="divide-y divide-slate-100">
          {balances.map((balance) => {
            const member = byUid.get(balance.uid);
            const status = statusLabel(balance);
            const isMe = balance.uid === currentUid;
            // Progress is a share of what the flat spent, so it stays meaningful
            // whether two or ten people live here.
            const percent = totalPaise > 0 ? Math.min(100, (balance.paidPaise / totalPaise) * 100) : 0;

            return (
              <li key={balance.uid} className="p-4">
                <div className="flex items-center gap-3">
                  <Avatar name={balance.name} photoURL={member?.photoURL} />

                  <div className="min-w-0 flex-1">
                    {/*
                      `truncate` belongs on the name alone: on this flex row it
                      would only leak `white-space: nowrap` into the badges.
                      The name keeps a floor and the badges wrap underneath it
                      when the row runs out of room — a truncating name has a
                      min-content width of zero, so without the floor it is the
                      name that disappears and the badges that survive.
                    */}
                    <p className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 font-semibold text-slate-900">
                      <span className="min-w-24 flex-1 truncate">{balance.name}</span>
                      {isMe ? <Badge tone="accent">You</Badge> : null}
                      {member?.role === "admin" ? <Badge>Admin</Badge> : null}
                    </p>
                    <p className="tnum mt-0.5 text-xs text-slate-500">
                      Paid {formatPaise(balance.paidPaise)} · Share {formatPaise(balance.sharePaise)}
                    </p>
                  </div>

                  <div className="shrink-0 whitespace-nowrap text-right">
                    <p
                      className={cx(
                        "tnum font-bold",
                        status.tone === "positive" && "text-emerald-700",
                        status.tone === "warning" && "text-amber-700",
                        status.tone === "neutral" && "text-slate-500",
                      )}
                    >
                      {formatPaise(Math.abs(balance.netPaise))}
                    </p>
                    <p className="text-xs text-slate-500">{status.text}</p>
                  </div>
                </div>

                <div
                  className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-100"
                  role="img"
                  aria-label={`${balance.name} paid ${percent.toFixed(0)}% of the total`}
                >
                  <div
                    className="h-full rounded-full bg-indigo-500 transition-[width]"
                    style={{ width: `${percent}%` }}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
