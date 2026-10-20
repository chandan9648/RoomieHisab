"use client";

import { useMemo, useState } from "react";
import type { User } from "firebase/auth";
import { Plus } from "lucide-react";

import {
  ALL_TIME,
  currentMonthKey,
  formatMonthKey,
  matchesMonth,
  monthRange,
  monthsWithData,
  todayISO,
  type MonthFilter,
} from "@/lib/dates";
import { removeExpense } from "@/lib/expenses";
import { calculateSettlement } from "@/lib/settlements";
import { formatPaise } from "@/lib/money";
import {
  ALL_PAYERS,
  matchesPayer,
  spendByPayer,
  totalPaise as sumPaise,
  type PayerFilter,
} from "@/lib/reports";
import type { Expense } from "@/lib/types";
import type { HouseholdState } from "@/hooks/useHousehold";

import { AppHeader } from "./AppHeader";
import { ExpenseFormModal } from "./ExpenseFormModal";
import { ExpenseList } from "./ExpenseList";
import { ExportModal } from "./ExportModal";
import { HouseholdPanel } from "./HouseholdPanel";
import { MemberBalances } from "./MemberBalances";
import { MonthPicker } from "./MonthPicker";
import { SettlementPanel } from "./SettlementPanel";
import { SpendFilter } from "./SpendFilter";
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
  const [payer, setPayer] = useState<PayerFilter>(ALL_PAYERS);
  const [exportOpen, setExportOpen] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Expense | null>(null);
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
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

  // "Who spent what" for the selected month, which both the dropdown and its
  // bars read from.
  const breakdown = useMemo(() => spendByPayer(visible, members), [visible, members]);

  // A former roommate can be chosen in one month and have no history in the
  // next, which would leave the dropdown pointing at an option that is no
  // longer there — fall back to everyone rather than show a blank control.
  const selectedPayer =
    payer !== ALL_PAYERS && !breakdown.some((p) => p.uid === payer) ? ALL_PAYERS : payer;

  const listed = useMemo(
    () => visible.filter((e) => matchesPayer(e, selectedPayer)),
    [visible, selectedPayer],
  );

  /** What the export dialog opens on: the month on screen, or all history. */
  const exportRange = useMemo(() => {
    if (month !== ALL_TIME) return monthRange(month);
    const dates = expenses.map((e) => e.date).filter(Boolean).sort();
    const today = todayISO();
    const latest = dates[dates.length - 1];
    return {
      startISO: dates[0] ?? monthRange(currentMonthKey()).startISO,
      // A purchase dated ahead of today still belongs in the range.
      endISO: latest && latest > today ? latest : today,
    };
  }, [month, expenses]);

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
        setError("");
        await removeExpense(household.id, expense.id);
        setNotice("Expense deleted.");
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
          <div id="panel-expenses" role="tabpanel" className="space-y-4">
            <Card className="p-4">
              <SpendFilter
                value={selectedPayer}
                onChange={setPayer}
                breakdown={breakdown}
                totalPaise={sumPaise(visible)}
                entryCount={visible.length}
                periodLabel={month === ALL_TIME ? "all spending" : `${monthLabel} spending`}
                onExport={() => setExportOpen(true)}
              />
            </Card>

            <ExpenseList
              title={`Expenses · ${monthLabel}`}
              subtitle={`${listed.length} ${listed.length === 1 ? "entry" : "entries"} · ${formatPaise(
                sumPaise(listed),
              )}`}
              expenses={listed}
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
                selectedPayer !== ALL_PAYERS
                  ? `Nothing was logged by this roommate in ${monthLabel}.`
                  : month === ALL_TIME
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

      <ExportModal
        open={exportOpen}
        onClose={() => setExportOpen(false)}
        expenses={expenses}
        members={members}
        householdName={household.name}
        defaultRange={exportRange}
        defaultPayer={selectedPayer}
        onDownloaded={setNotice}
      />

      <ConfirmDialog request={confirmation} onClose={() => setConfirmation(null)} />
    </div>
  );
}
