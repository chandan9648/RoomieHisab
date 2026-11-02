"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { User } from "firebase/auth";
import { CalendarDays, Plus } from "lucide-react";

import {
  ALL_TIME,
  currentMonthKey,
  formatMonthKey,
  formatDateISO,
  isValidDateISO,
  matchesMonth,
  monthRange,
  monthsWithData,
  todayISO,
  type MonthFilter,
} from "@/lib/dates";
import { startSettlementCycle } from "@/lib/households";
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
import { ActivityPanel } from "./ActivityPanel";
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
import { Modal } from "./ui/Modal";
import { Alert, Button, Card, CardHeader, EmptyState } from "./ui/primitives";

const RECENT_COUNT = 5;

function SettlementDateInput({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: string;
  min?: string;
  max?: string;
  onChange: (value: string) => void;
}) {
  const [draft, setDraft] = useState(formatDateISO(value));
  const datePicker = useRef<HTMLInputElement>(null);

  useEffect(() => setDraft(formatDateISO(value)), [value]);

  function updateDraft(next: string) {
    setDraft(next);
    const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(next);
    if (!match) return;
    const [, day, month, year] = match;
    const iso = `${year}-${month}-${day}`;
    if (isValidDateISO(iso) && (!min || iso >= min) && (!max || iso <= max)) onChange(iso);
  }

  return (
    <label className="text-sm font-semibold text-slate-700">
      {label}
      <span className="mt-1 flex min-h-11 items-center rounded-xl border border-slate-300 pr-2 focus-within:ring-2 focus-within:ring-indigo-500">
        <input
          type="text"
          inputMode="numeric"
          placeholder="DD/MM/YYYY"
          aria-label={label}
          value={draft}
          onChange={(event) => updateDraft(event.target.value)}
          className="min-w-0 flex-1 rounded-xl bg-transparent px-3 py-2 font-normal text-slate-900 outline-none"
        />
        <button
          type="button"
          aria-label={`Choose ${label.toLowerCase()} date`}
          onClick={() => datePicker.current?.showPicker()}
          className="grid h-9 w-9 place-items-center rounded-lg text-slate-700 hover:bg-slate-100"
        >
          <CalendarDays size={17} aria-hidden />
        </button>
        <input
          ref={datePicker}
          type="date"
          value={value}
          min={min}
          max={max}
          tabIndex={-1}
          aria-hidden="true"
          onChange={(event) => onChange(event.target.value)}
          className="pointer-events-none absolute h-px w-px opacity-0"
        />
      </span>
    </label>
  );
}

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
  const { household, members, expenses, auditLogs, settlementRecords, me, expensesLoading } = state;
  const actor = {
    actorUid: user.uid,
    actorName: user.displayName ?? user.email ?? "Roommate",
    actorEmail: user.email ?? "",
  };

  const [tab, setTab] = useState<TabId>("overview");
  const [month, setMonth] = useState<MonthFilter>(() => currentMonthKey());
  const [payer, setPayer] = useState<PayerFilter>(ALL_PAYERS);
  const [exportOpen, setExportOpen] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Expense | null>(null);
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [settlementRangeOpen, setSettlementRangeOpen] = useState(false);
  const [settlementStartDate, setSettlementStartDate] = useState("");
  const [settlementEndDate, setSettlementEndDate] = useState(todayISO());

  const months = useMemo(() => monthsWithData(expenses.map((e) => e.date)), [expenses]);

  const visible = useMemo(
    () => expenses.filter((e) => matchesMonth(e.date, month)),
    [expenses, month],
  );

  // The settlement is derived purely from the selected month, which is what
  // makes month-end accounting work without ever deleting history.
  const settlementExpenses = useMemo(
    () =>
      visible.filter(
        (expense) =>
          household.settlementStartedAt
            ? expense.createdAt >= household.settlementStartedAt
            : !household.settlementStartDate || expense.date >= household.settlementStartDate,
      ),
    [household.settlementStartDate, household.settlementStartedAt, visible],
  );

  const settlement = useMemo(
    () =>
      calculateSettlement(
        members.map((m) => ({ uid: m.uid, name: m.displayName })),
        settlementExpenses.map((e) => ({ paidBy: e.paidBy, amountPaise: e.amountPaise })),
      ),
    [members, settlementExpenses],
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
        const target = members.find((member) => member.uid === expense.paidBy);
        if (!target) throw new Error("The expense payer is no longer a household member.");
        await removeExpense(household.id, expense.id, expense, actor, target);
        setNotice("Expense deleted.");
      },
    });
  }

  function confirmStartSettlementCycle() {
    const dates = expenses.map((expense) => expense.date).sort();
    setSettlementStartDate(dates[0] ?? todayISO());
    setSettlementEndDate(todayISO());
    setSettlementRangeOpen(true);
  }

  async function submitSettlementRange() {
    if (!settlementStartDate || !settlementEndDate || settlementStartDate > settlementEndDate) {
      setError("Choose a valid settlement date range.");
      return;
    }
    const selectedExpenses = expenses.filter(
      (expense) => expense.date >= settlementStartDate && expense.date <= settlementEndDate,
    );
    setSettlementRangeOpen(false);
    setConfirmation({
      title: "Settle and start a new cycle?",
      body: `${selectedExpenses.length} expense${selectedExpenses.length === 1 ? "" : "s"} from ${settlementStartDate} to ${settlementEndDate} will be saved with full details, then permanently removed.`,
      confirmLabel: "Start new cycle",
      onConfirm: async () => {
        setError("");
        await startSettlementCycle(
          household.id,
          settlementStartDate,
          settlementEndDate,
          actor,
          members,
          selectedExpenses,
        );
        setMonth(currentMonthKey());
        setPayer(ALL_PAYERS);
        setNotice("Settled. A new expense cycle has started.");
      },
    });
  }

  function confirmSignOut() {
    setConfirmation({
      title: "Sign out of RoomieHisab?",
      body: "You will need to sign in again to view this household and its expenses.",
      confirmLabel: "Sign out",
      onConfirm: onSignOut,
    });
  }

  const monthLabel = formatMonthKey(month);
  const periodSubtitle =
    month === ALL_TIME ? "Every expense ever logged" : `${monthLabel} only`;

  return (
    <div className="min-h-screen pb-24 sm:pb-10">
      <Modal
        open={settlementRangeOpen}
        title="Choose settlement date range"
        description="Expenses in this range will be saved in settlement history and removed from the current list."
        onClose={() => setSettlementRangeOpen(false)}
        footer={
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="secondary" onClick={() => setSettlementRangeOpen(false)}>
              Cancel
            </Button>
            <Button variant="danger" onClick={() => void submitSettlementRange()}>
              Continue
            </Button>
          </div>
        }
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <SettlementDateInput
            label="From"
            value={settlementStartDate}
            max={settlementEndDate}
            onChange={setSettlementStartDate}
          />
          <SettlementDateInput
            label="To"
            value={settlementEndDate}
            min={settlementStartDate}
            max={todayISO()}
            onChange={setSettlementEndDate}
          />
        </div>
      </Modal>
      <AppHeader
        household={household}
        user={user}
        onSignOut={confirmSignOut}
        onCopied={setNotice}
      />

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
              <SettlementPanel
                settlement={settlement}
                month={month}
                currentUid={user.uid}
                cycleStartDate={household.settlementStartDate}
                settlementRecords={settlementRecords}
                members={members}
                onStartNewCycle={confirmStartSettlementCycle}
                canStartNewCycle={me?.role === "admin" || household.createdBy === user.uid}
              />
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

        {tab === "activity" ? (
          <div id="panel-activity" role="tabpanel">
            <ActivityPanel logs={auditLogs} />
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
        actor={actor}
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
