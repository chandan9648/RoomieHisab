"use client";

import { History } from "lucide-react";

import type { AuditLog } from "@/lib/types";
import { formatDateISO } from "@/lib/dates";
import { Card, CardHeader, EmptyState } from "./ui/primitives";

const ACTION_LABELS: Record<AuditLog["action"], string> = {
  expense_created: "Expense added",
  expense_updated: "Expense updated",
  expense_deleted: "Expense deleted",
  settlement_started: "New settlement cycle started",
};

export function ActivityPanel({ logs }: { logs: AuditLog[] }) {
  return (
    <Card>
      <CardHeader
        title="Activity log"
        subtitle="A record of expense and settlement changes in this household"
        icon={<History size={18} aria-hidden />}
      />
      {logs.length === 0 ? (
        <EmptyState
          icon={<History size={22} aria-hidden />}
          title="No activity yet"
          description="Expense additions, edits, deletes and settlement resets will appear here."
        />
      ) : (
        <ol className="divide-y divide-slate-100">
          {logs.map((log) => (
            <li key={log.id} className="flex gap-3 p-4 sm:p-5">
              <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-indigo-500" aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-slate-900">
                  {ACTION_LABELS[log.action]}
                </p>
                <p className="mt-1 text-sm leading-relaxed text-slate-600">{log.summary}</p>
                {log.targetUid ? (
                  <p className="mt-2 text-xs leading-relaxed text-slate-500">
                    <span className="font-semibold text-slate-700">Affected member:</span>{" "}
                    {log.targetName || "Unknown"} · {log.targetEmail || "No email"} · ID:{" "}
                    {log.targetUid}
                  </p>
                ) : null}
                {log.details ? (
                  <p className="mt-1 text-xs leading-relaxed text-slate-500">{log.details}</p>
                ) : null}
                <p className="mt-2 text-xs text-slate-500">
                  <span className="font-semibold text-slate-700">{log.actorName}</span>
                  {log.actorEmail ? ` · ${log.actorEmail}` : ""} ·{" "}
                  {formatDateISO(new Date(log.timestamp).toISOString().slice(0, 10))}{" "}
                  {new Date(log.timestamp).toLocaleTimeString("en-IN", {
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </p>
              </div>
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}
