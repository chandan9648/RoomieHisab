"use client";

/**
 * Export dialog. Everything that decides what lands in the file is on screen
 * at once — the period, whose spending, and the format — with a live count of
 * what matches, so nobody downloads an empty statement to find out it was
 * empty.
 *
 * The writers are loaded on demand: a roommate who never exports never pays
 * for the PDF and spreadsheet code.
 */

import { useEffect, useMemo, useState } from "react";
import { FileSpreadsheet, FileText } from "lucide-react";

import { formatPaise } from "@/lib/money";
import {
  ALL_PAYERS,
  buildReport,
  isValidRange,
  payerLabel,
  reportFilename,
  spendByPayer,
  type PayerFilter,
} from "@/lib/reports";
import type { ExportFormat } from "@/lib/exportReport";
import type { Expense, Member } from "@/lib/types";
import { Modal } from "./ui/Modal";
import { Alert, Button, Field, cx } from "./ui/primitives";

const FORMATS: Array<{ id: ExportFormat; label: string; hint: string; Icon: typeof FileText }> = [
  { id: "pdf", label: "PDF", hint: "Printable statement", Icon: FileText },
  { id: "xlsx", label: "Excel", hint: "Rows you can total", Icon: FileSpreadsheet },
];

export function ExportModal({
  open,
  onClose,
  expenses,
  members,
  householdName,
  defaultRange,
  defaultPayer,
  onDownloaded,
}: {
  open: boolean;
  onClose: () => void;
  /** Every expense in the household — the dialog does its own date filtering. */
  expenses: Expense[];
  members: Member[];
  householdName: string;
  /** Seeded from the month and person currently on screen. */
  defaultRange: { startISO: string; endISO: string };
  defaultPayer: PayerFilter;
  onDownloaded: (message: string) => void;
}) {
  const [format, setFormat] = useState<ExportFormat>("pdf");
  const [startISO, setStartISO] = useState(defaultRange.startISO);
  const [endISO, setEndISO] = useState(defaultRange.endISO);
  const [payer, setPayer] = useState<PayerFilter>(defaultPayer);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  // Each opening starts from what the dashboard is showing, so the dialog never
  // offers last month's dates to someone who has since moved on.
  useEffect(() => {
    if (!open) return;
    setStartISO(defaultRange.startISO);
    setEndISO(defaultRange.endISO);
    setPayer(defaultPayer);
    setError("");
  }, [open, defaultRange.startISO, defaultRange.endISO, defaultPayer]);

  const rangeValid = isValidRange({ startISO, endISO });

  // Built from all history, not just the current roster, so a filter set to a
  // roommate who has since left still has an option to sit on.
  const people = useMemo(() => spendByPayer(expenses, members), [expenses, members]);

  const preview = useMemo(() => {
    if (!open || !rangeValid) return null;
    return buildReport(expenses, members, { startISO, endISO, payer });
  }, [open, rangeValid, expenses, members, startISO, endISO, payer]);

  async function download() {
    if (!rangeValid) {
      setError("Pick a start date on or before the end date.");
      return;
    }
    if (!preview || preview.count === 0) {
      setError("Nothing was logged in that period, so there is nothing to export.");
      return;
    }

    setBusy(true);
    setError("");
    try {
      const { buildReportFile, saveFile } = await import("@/lib/exportReport");
      const { bytes, mime } = buildReportFile(format, preview, {
        householdName,
        generatedAt: new Date(),
      });
      const filename = reportFilename(preview, format);
      saveFile(bytes, filename, mime);
      onDownloaded(`Downloaded ${filename}`);
      onClose();
    } catch {
      setError("The file could not be built. Try a shorter period.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      title="Export expenses"
      description="Choose a period and a format, then download."
      onClose={onClose}
      footer={
        <div className="flex gap-2">
          <Button variant="secondary" className="flex-1" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button className="flex-1" onClick={download} loading={busy}>
            Download
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <fieldset>
          <legend className="block text-sm font-medium text-slate-700">Format</legend>
          <div className="mt-1.5 grid grid-cols-2 gap-2">
            {FORMATS.map(({ id, label, hint, Icon }) => (
              <button
                key={id}
                type="button"
                aria-pressed={format === id}
                onClick={() => setFormat(id)}
                className={cx(
                  "flex items-center gap-3 rounded-xl border p-3 text-left transition-colors",
                  format === id
                    ? "border-indigo-500 bg-indigo-50 ring-2 ring-indigo-500/20"
                    : "border-slate-300 bg-white hover:bg-slate-50",
                )}
              >
                <span
                  className={cx(
                    "grid h-9 w-9 shrink-0 place-items-center rounded-lg",
                    format === id ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-500",
                  )}
                >
                  <Icon size={17} aria-hidden />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-slate-900">{label}</span>
                  <span className="block truncate text-xs text-slate-500">{hint}</span>
                </span>
              </button>
            ))}
          </div>
        </fieldset>

        <div className="grid grid-cols-2 gap-3">
          <Field id="export-start" label="From">
            {(props) => (
              <input
                {...props}
                type="date"
                value={startISO}
                max={endISO || undefined}
                onChange={(e) => setStartISO(e.target.value)}
              />
            )}
          </Field>
          <Field id="export-end" label="To">
            {(props) => (
              <input
                {...props}
                type="date"
                value={endISO}
                min={startISO || undefined}
                onChange={(e) => setEndISO(e.target.value)}
              />
            )}
          </Field>
        </div>

        <Field id="export-payer" label="Whose spending">
          {(props) => (
            <select {...props} value={payer} onChange={(e) => setPayer(e.target.value)}>
              <option value={ALL_PAYERS}>All roommates</option>
              {people.map((person) => (
                <option key={person.uid} value={person.uid}>
                  {person.name}
                  {person.active ? "" : " (left the flat)"}
                </option>
              ))}
            </select>
          )}
        </Field>

        {!rangeValid ? (
          <Alert tone="warning">Pick a start date on or before the end date.</Alert>
        ) : preview ? (
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm">
            <p className="font-semibold text-slate-900">
              {preview.count} {preview.count === 1 ? "entry" : "entries"} ·{" "}
              <span className="tnum">{formatPaise(preview.totalPaise)}</span>
            </p>
            <p className="mt-0.5 text-xs text-slate-500">
              {payerLabel(payer, members, expenses)} · the file also lists what each roommate paid
              over this period.
            </p>
          </div>
        ) : null}

        {error ? <Alert tone="error">{error}</Alert> : null}
      </div>
    </Modal>
  );
}
