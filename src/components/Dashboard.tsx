"use client";

import { useMemo, useState } from "react";
import type { User } from "firebase/auth";
import { Plus } from "lucide-react";

import { ALL_TIME, currentMonthKey, formatMonthKey, matchesMonth, monthsWithData, type MonthFilter } from "@/lib/dates";
import { describeError } from "@/lib/errors";
import { removeExpense } from "@/lib/expenses";
import { calculateSettlement } from "@/lib/settlements";
import { formatPaise } from "@/lib/money";
import type { Expense } from "@/lib/types";
import type { HouseholdState } from "@/hooks/useHousehold";

import { AppHeader } from "./AppHeader";
import { ExpenseFormModal } from "./ExpenseFormModal";
import { ExpenseList } from "./ExpenseList";
import { HouseholdPanel } from "./HouseholdPanel";
import { MemberBalances } from "./MemberBalances";
import { MonthPicker } from "./MonthPicker";
import { SettlementPanel } from "./SettlementPanel";
import { SummaryCards } from "./SummaryCards";
import { BottomNav, TabBar, type TabId } from "./navigation";
import { ConfirmDialog, type Confirmation } from "./ui/ConfirmDialog";
import { Alert, Button, Card, CardHeader, EmptyState } from "./ui/primitives";

const RECENT_COUNT = 5;

export function Dashboard({
  user,
  state,
  onSignOut,
}: {
  user: User;
  /** Non-null household is guaranteed by the caller. */
  state: HouseholdState & { household: NonNullable<HouseholdState["household"]> };
  onSignOut: () => void;
}) {
  const { household, members, expenses, me, expensesLoading } = state;

  const [tab, setTab] = useState<TabId>("overview");
  const [month, setMonth] = useState<MonthFilter>(() => currentMonthKey());
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Expense | null>(null);
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const [confirmBusy, setConfirmBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const months = useMemo(() => monthsWithData(expenses.map((e) => e.date)), [expenses]);

  const visible = useMemo(
    () => expenses.filter((e) => matchesMonth(e.date, month)),
    [expenses, month],
  );

  // The settlement is derived purely from the selected month, which is what
  // makes month-end accounting work without ever deleting history.
  const settlement = useMemo(
    () =>
      calculateSettlement(
        members.map((m) => ({ uid: m.uid, name: m.displayName })),
        visible.map((e) => ({ paidBy: e.paidBy, amountPaise: e.amountPaise })),
      ),
    [members, visible],
  );

  const mine = settlement.balances.find((b) => b.uid === user.uid) ?? null;

  function openAdd() {
    setEditing(null);
    setFormOpen(true);
  }

  function openEdit(expense: Expense) {
    setEditing(expense);
    setFormOpen(true);
  }

  function confirmDelete(expense: Expense) {
    setConfirmation({
      title: "Delete this expense?",
      body: `"${expense.description}" for ${formatPaise(expense.amountPaise)} will be removed for everyone. This cannot be undone.`,
      confirmLabel: "Delete expense",
      onConfirm: async () => {
        setConfirmBusy(true);
        setError("");
        try {
          await removeExpense(household.id, expense.id);
          setNotice("Expense deleted.");
          setConfirmation(null);
        } catch (caught) {
          setError(describeError(caught));
          setConfirmation(null);
        } finally {
          setConfirmBusy(false);
        }
      },
    });
  }

  const monthLabel = formatMonthKey(month);
  const periodSubtitle =
    month === ALL_TIME ? "Every expense ever logged" : `${monthLabel} only`;

  return (
    <div className="min-h-screen pb-24 sm:pb-10">
      <AppHeader household={household} user={user} onSignOut={onSignOut} onCopied={setNotice} />

      <main className="mx-auto max-w-5xl px-4 py-5">
        <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">
              Hey {(user.displayName ?? "roomie").split(" ")[0]}
            </h1>
            <p className="mt-0.5 text-sm text-slate-500">
              {members.length} {members.length === 1 ? "roommate" : "roommates"} · updates live for
              everyone
            </p>
          </div>
          <Button
            onClick={openAdd}
            icon={<Plus size={17} aria-hidden />}
            className="hidden sm:inline-flex"
          >
            Add expense
          </Button>
        </div>

        <div className="mb-5 space-y-3">
          <MonthPicker value={month} months={months} onChange={setMonth} />
          <TabBar active={tab} onChange={setTab} />
        </div>

        {error ? (
          <div className="mb-4">
            <Alert tone="error" onDismiss={() => setError("")}>
              {error}
            </Alert>
          </div>
        ) : null}
        {state.error && !error ? (
          <div className="mb-4">
            <Alert tone="error">{state.error}</Alert>
          </div>
        ) : null}
        {notice ? (
          <div className="mb-4">
            <Alert tone="success" onDismiss={() => setNotice("")}>
              {notice}
            </Alert>
          </div>
        ) : null}

        {tab === "overview" ? (
          <div id="panel-overview" role="tabpanel" className="space-y-5">
            <SummaryCards
              totalPaise={settlement.totalPaise}
              memberCount={settlement.memberCount}
              month={month}
              mine={mine}
            />

            <div className="grid gap-5 lg:grid-cols-2">
              <MemberBalances
                balances={settlement.balances}
                members={members}
                totalPaise={settlement.totalPaise}
                currentUid={user.uid}
              />

              <ExpenseList
                title="Recent expenses"
                subtitle={periodSubtitle}
                expenses={visible.slice(0, RECENT_COUNT)}
                members={members}
                currentUid={user.uid}
                currentRole={me?.role}
                loading={expensesLoading}
                onEdit={openEdit}
                onDelete={confirmDelete}
                action={
                  visible.length > RECENT_COUNT ? (
                    <button
                      type="button"
                      onClick={() => setTab("expenses")}
                      className="rounded-lg px-2 py-1 text-sm font-semibold text-indigo-600 hover:bg-indigo-50"
                    >
                      View all
                    </button>
                  ) : null
                }
              />
            </div>
          </div>
        ) : null}

        {tab === "expenses" ? (
          <div id="panel-expenses" role="tabpanel">
            <ExpenseList
              title={`Expenses · ${monthLabel}`}
              subtitle={`${visible.length} ${visible.length === 1 ? "entry" : "entries"} · ${formatPaise(
                settlement.totalPaise + settlement.ignored.totalPaise,
              )}`}
              expenses={visible}
              members={members}
              currentUid={user.uid}
              currentRole={me?.role}
              loading={expensesLoading}
              onEdit={openEdit}
              onDelete={confirmDelete}
              action={
                <Button onClick={openAdd} icon={<Plus size={16} aria-hidden />} className="px-3">
                  Add
                </Button>
              }
              emptyDescription={
                month === ALL_TIME
                  ? "No expenses have been logged in this household yet."
                  : `Nothing was logged in ${monthLabel}. Pick another month or add a purchase.`
              }
            />
          </div>
        ) : null}

        {tab === "settle" ? (
          <div id="panel-settle" role="tabpanel">
            {members.length === 0 ? (
              <Card>
                <CardHeader title="Settlement" />
                <EmptyState
                  icon={<Plus size={22} aria-hidden />}
                  title="No members yet"
                  description="Share your invite code so roommates can join and split expenses."
                />
              </Card>
            ) : (
              <SettlementPanel settlement={settlement} month={month} currentUid={user.uid} />
            )}
          </div>
        ) : null}

        {tab === "flat" ? (
          <div id="panel-flat" role="tabpanel">
            <HouseholdPanel
              household={household}
              members={members}
              me={me}
              profile={state.profile}
              onNotice={setNotice}
              onConfirm={setConfirmation}
            />
          </div>
        ) : null}
      </main>

      {/* Floating add button, kept clear of the bottom navigation. */}
      <button
        type="button"
        onClick={openAdd}
        aria-label="Add expense"
        className="fixed bottom-20 right-4 z-30 grid h-14 w-14 place-items-center rounded-full bg-indigo-600 text-white shadow-lg shadow-indigo-600/30 transition-transform active:scale-95 sm:hidden"
      >
        <Plus size={24} aria-hidden />
      </button>

      <BottomNav active={tab} onChange={setTab} />

      <ExpenseFormModal
        open={formOpen}
        householdId={household.id}
        expense={editing}
        members={members}
        currentUid={user.uid}
        currentRole={me?.role}
        onClose={() => setFormOpen(false)}
        onSaved={setNotice}
      />

      <ConfirmDialog
        request={confirmation}
        busy={confirmBusy}
        onCancel={() => setConfirmation(null)}
      />
    </div>
  );
}
