"use client";

import { ArrowDownLeft, ArrowRight, ArrowUpRight, CheckCircle2, Handshake, Info } from "lucide-react";

import { formatMonthKey, type MonthFilter } from "@/lib/dates";
import { formatPaise } from "@/lib/money";
import { transfersForUser, type Settlement, type Transfer } from "@/lib/settlements";
import { Alert, Card, CardHeader, EmptyState, cx } from "./ui/primitives";

function TransferRow({
  transfer,
  currentUid,
}: {
  transfer: Transfer;
  currentUid: string;
}) {
  const isSender = transfer.fromUid === currentUid;
  const isReceiver = transfer.toUid === currentUid;

  return (
    <li
      className={cx(
        "flex items-center gap-3 rounded-xl border p-3",
        isSender
          ? "border-amber-200 bg-amber-50/60"
          : isReceiver
            ? "border-emerald-200 bg-emerald-50/60"
            : "border-slate-200 bg-slate-50",
      )}
    >
      <span
        className={cx(
          "grid h-9 w-9 shrink-0 place-items-center rounded-xl",
          isSender
            ? "bg-amber-100 text-amber-700"
            : isReceiver
              ? "bg-emerald-100 text-emerald-700"
              : "bg-white text-slate-500",
        )}
      >
        {isReceiver ? (
          <ArrowDownLeft size={17} aria-hidden />
        ) : (
          <ArrowUpRight size={17} aria-hidden />
        )}
      </span>

      <div className="min-w-0 flex-1">
        {/* Spelled out as a sentence so there is no ambiguity about direction. */}
        <p className="flex flex-wrap items-center gap-1.5 text-sm font-semibold text-slate-900">
          <span className="truncate">{isSender ? "You" : transfer.fromName}</span>
          <ArrowRight size={14} className="shrink-0 text-slate-400" aria-label="sends to" />
          <span className="truncate">{isReceiver ? "you" : transfer.toName}</span>
        </p>
        <p className="mt-0.5 text-xs text-slate-500">
          {isSender
            ? "You need to send this"
            : isReceiver
              ? `${transfer.fromName} will send you this`
              : "Between roommates"}
        </p>
      </div>

      <p className="tnum shrink-0 whitespace-nowrap font-bold text-slate-900">
        {formatPaise(transfer.amountPaise)}
      </p>
    </li>
  );
}

export function SettlementPanel({
  settlement,
  month,
  currentUid,
}: {
  settlement: Settlement;
  month: MonthFilter;
  currentUid: string;
}) {
  const { toSend, toReceive } = transfersForUser(settlement.transfers, currentUid);
  const sendTotal = toSend.reduce((sum, t) => sum + t.amountPaise, 0);
  const receiveTotal = toReceive.reduce((sum, t) => sum + t.amountPaise, 0);

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader
          title={`Settlement for ${formatMonthKey(month)}`}
          subtitle={
            settlement.memberCount > 0
              ? `${formatPaise(settlement.totalPaise)} split ${settlement.memberCount} ways = ${formatPaise(settlement.evenSharePaise)} each`
              : "Waiting for members"
          }
          icon={<Handshake size={18} aria-hidden />}
        />

        <div className="space-y-4 p-4 sm:p-5">
          {settlement.ignored.count > 0 ? (
            <Alert tone="info">
              {settlement.ignored.count} expense{settlement.ignored.count === 1 ? "" : "s"} worth{" "}
              {formatPaise(settlement.ignored.totalPaise)} {settlement.ignored.count === 1 ? "was" : "were"}{" "}
              paid by someone who has left this household, so {settlement.ignored.count === 1 ? "it is" : "they are"}{" "}
              left out of the split.
            </Alert>
          ) : null}

          {/*
            The two blocks the logged-in user actually has to act on. Grid items
            default to a min-content floor, and the rows below hold
            non-wrapping names and amounts, so each column is told explicitly
            that it may shrink.
          */}
          {toSend.length > 0 || toReceive.length > 0 ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="min-w-0">
                <h3 className="flex min-w-0 items-center gap-2 text-sm font-semibold text-amber-800">
                  <ArrowUpRight size={15} className="shrink-0" aria-hidden />
                  <span className="truncate">You need to send</span>
                  <span className="tnum ml-auto shrink-0">{formatPaise(sendTotal)}</span>
                </h3>
                <ul className="mt-2 space-y-2">
                  {toSend.length > 0 ? (
                    toSend.map((t) => (
                      <TransferRow key={`${t.fromUid}-${t.toUid}`} transfer={t} currentUid={currentUid} />
                    ))
                  ) : (
                    <li className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-500">
                      Nothing to send.
                    </li>
                  )}
                </ul>
              </div>

              <div className="min-w-0">
                <h3 className="flex min-w-0 items-center gap-2 text-sm font-semibold text-emerald-800">
                  <ArrowDownLeft size={15} className="shrink-0" aria-hidden />
                  <span className="truncate">You will receive</span>
                  <span className="tnum ml-auto shrink-0">{formatPaise(receiveTotal)}</span>
                </h3>
                <ul className="mt-2 space-y-2">
                  {toReceive.length > 0 ? (
                    toReceive.map((t) => (
                      <TransferRow key={`${t.fromUid}-${t.toUid}`} transfer={t} currentUid={currentUid} />
                    ))
                  ) : (
                    <li className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-500">
                      Nothing to receive.
                    </li>
                  )}
                </ul>
              </div>
            </div>
          ) : null}

          <div>
            <h3 className="text-sm font-semibold text-slate-900">
              All transfers ({settlement.transfers.length})
            </h3>
            {settlement.transfers.length === 0 ? (
              <div className="mt-2 flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                <CheckCircle2 size={18} className="mt-0.5 shrink-0 text-emerald-600" aria-hidden />
                <div>
                  <p className="text-sm font-semibold text-emerald-900">Everyone is square</p>
                  <p className="mt-0.5 text-sm text-emerald-800">
                    {settlement.totalPaise === 0
                      ? "No expenses were logged for this period."
                      : "Every roommate has paid their fair share."}
                  </p>
                </div>
              </div>
            ) : (
              <ul className="mt-2 space-y-2">
                {settlement.transfers.map((t) => (
                  <TransferRow
                    key={`all-${t.fromUid}-${t.toUid}`}
                    transfer={t}
                    currentUid={currentUid}
                  />
                ))}
              </ul>
            )}
          </div>

          {settlement.residualPaise > 0 ? (
            <p className="flex items-start gap-2 text-xs leading-relaxed text-slate-500">
              <Info size={14} className="mt-0.5 shrink-0" aria-hidden />
              <span>
                {formatPaise(settlement.totalPaise)} does not divide evenly by{" "}
                {settlement.memberCount}. The leftover{" "}
                {settlement.residualPaise === 1
                  ? "1 paisa is"
                  : `${settlement.residualPaise} paise are`}{" "}
                added to the earliest {settlement.residualPaise === 1 ? "member's" : "members'"} share,
                so the transfers below balance to the exact rupee.
              </span>
            </p>
          ) : null}
        </div>
      </Card>

      <Card>
        <CardHeader title="Per-roommate breakdown" subtitle="Paid, fair share and net position" />
        {settlement.balances.length === 0 ? (
          <EmptyState
            icon={<Handshake size={22} aria-hidden />}
            title="Nothing to settle"
            description="Once roommates join and expenses are added, the split appears here."
          />
        ) : (
          <div className="grid gap-3 p-4 sm:grid-cols-2 sm:p-5">
            {settlement.balances.map((balance) => (
              <div key={balance.uid} className="min-w-0 rounded-xl border border-slate-200 p-4">
                <p className="truncate font-semibold text-slate-900">
                  {balance.name}
                  {balance.uid === currentUid ? " (you)" : ""}
                </p>
                <dl className="tnum mt-2 space-y-1 text-sm">
                  <div className="flex justify-between gap-2">
                    <dt className="text-slate-500">Paid</dt>
                    <dd className="font-medium">{formatPaise(balance.paidPaise)}</dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-slate-500">Fair share</dt>
                    <dd className="font-medium">{formatPaise(balance.sharePaise)}</dd>
                  </div>
                </dl>
                <p
                  className={cx(
                    "tnum mt-3 text-lg font-bold",
                    balance.status === "owed" && "text-emerald-700",
                    balance.status === "owes" && "text-amber-700",
                    balance.status === "settled" && "text-slate-500",
                  )}
                >
                  {formatPaise(Math.abs(balance.netPaise))}
                </p>
                <p className="text-xs text-slate-500">
                  {balance.status === "owed"
                    ? "gets back"
                    : balance.status === "owes"
                      ? "owes"
                      : "no payment needed"}
                </p>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
