"use client";

import { Pencil, ReceiptText, Trash2 } from "lucide-react";
import type { ReactNode } from "react";

import { formatDateISO } from "@/lib/dates";
import { canModifyExpense } from "@/lib/expenses";
import { formatPaise } from "@/lib/money";
import type { Expense, Member } from "@/lib/types";
import { Badge, Card, CardHeader, EmptyState, IconButton, SkeletonRows } from "./ui/primitives";

export function ExpenseList({
  title,
  subtitle,
  expenses,
  members,
  currentUid,
  currentRole,
  loading,
  onEdit,
  onDelete,
  action,
  emptyDescription,
}: {
  title: string;
  subtitle?: string;
  expenses: Expense[];
  members: Member[];
  currentUid: string;
  currentRole: Member["role"] | undefined;
  loading?: boolean;
  onEdit: (expense: Expense) => void;
  onDelete: (expense: Expense) => void;
  action?: ReactNode;
  emptyDescription?: string;
}) {
  const byUid = new Map(members.map((m) => [m.uid, m]));

  return (
    <Card>
      <CardHeader
        title={title}
        subtitle={subtitle}
        icon={<ReceiptText size={18} aria-hidden />}
        action={action}
      />

      {loading ? (
        <SkeletonRows rows={3} />
      ) : expenses.length === 0 ? (
        <EmptyState
          icon={<ReceiptText size={22} aria-hidden />}
          title="No expenses here"
          description={
            emptyDescription ??
            "Nothing was logged for this month. Add a purchase to start the hisaab."
          }
        />
      ) : (
        <ul className="divide-y divide-slate-100">
          {expenses.map((expense) => {
            const payer = byUid.get(expense.paidBy);
            // A name is kept on the expense itself so history still reads
            // correctly after a roommate leaves and their member row is gone.
            const payerName = payer?.displayName ?? expense.payerName;
            const mine = expense.paidBy === currentUid;
            const editable = canModifyExpense(expense, currentUid, currentRole);

            return (
              <li key={expense.id} className="flex items-start gap-3 p-4">
                <span className="mt-0.5 grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-indigo-50 text-indigo-600">
                  <ReceiptText size={17} aria-hidden />
                </span>

                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-slate-900">{expense.description}</p>
                  <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-slate-500">
                    <span>{formatDateISO(expense.date)}</span>
                    <span aria-hidden>·</span>
                    <span className="truncate">{mine ? "You" : payerName}</span>
                    {!payer ? <Badge tone="warning">Former member</Badge> : null}
                  </p>
                  {expense.notes ? (
                    <p className="mt-1 line-clamp-2 text-xs text-slate-500">{expense.notes}</p>
                  ) : null}
                </div>

                <div className="flex shrink-0 flex-col items-end gap-1">
                  <p className="tnum whitespace-nowrap font-bold text-slate-900">
                    {formatPaise(expense.amountPaise)}
                  </p>
                  {editable ? (
                    <div className="-mr-2 flex items-center">
                      <IconButton
                        label={`Edit ${expense.description}`}
                        icon={<Pencil size={15} />}
                        className="h-9 w-9"
                        onClick={() => onEdit(expense)}
                      />
                      <IconButton
                        label={`Delete ${expense.description}`}
                        icon={<Trash2 size={15} />}
                        className="h-9 w-9 text-rose-600 hover:bg-rose-50"
                        onClick={() => onDelete(expense)}
                      />
                    </div>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
