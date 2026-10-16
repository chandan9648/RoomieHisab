"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Plus, Save } from "lucide-react";

import {
  buildExpense,
  createExpense,
  draftFromExpense,
  emptyDraft,
  saveExpense,
  type DraftErrors,
  type ExpenseDraft,
} from "@/lib/expenses";
import { describeError } from "@/lib/errors";
import { todayISO } from "@/lib/dates";
import { LIMITS } from "@/lib/validation";
import type { Expense, Member } from "@/lib/types";

import { Alert, Button, Field } from "./ui/primitives";
import { Modal } from "./ui/Modal";

export function ExpenseFormModal({
  open,
  householdId,
  expense,
  members,
  currentUid,
  currentRole,
  onClose,
  onSaved,
}: {
  open: boolean;
  householdId: string;
  /** The expense being edited, or null when adding a new one. */
  expense: Expense | null;
  members: Member[];
  currentUid: string;
  currentRole: Member["role"] | undefined;
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const [draft, setDraft] = useState<ExpenseDraft>(() => emptyDraft(currentUid));
  const [errors, setErrors] = useState<DraftErrors>({});
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);

  // Reload the draft every time the dialog opens so a cancelled edit never
  // leaks into the next one.
  useEffect(() => {
    if (!open) return;
    setDraft(expense ? draftFromExpense(expense) : emptyDraft(currentUid));
    setErrors({});
    setFormError("");
  }, [open, expense, currentUid]);

  const isEdit = Boolean(expense);
  // Rules forbid reassigning an existing expense to another payer, and only an
  // admin may log one on someone else's behalf.
  const canChoosePayer = !isEdit && currentRole === "admin" && members.length > 1;

  function set<K extends keyof ExpenseDraft>(key: K, value: ExpenseDraft[K]) {
    setDraft((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => ({ ...prev, [key]: undefined }));
    setFormError("");
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const built = buildExpense(draft, members, expense?.createdAt ?? Date.now());
    if (!built.ok) {
      setErrors(built.errors);
      return;
    }

    setSaving(true);
    setFormError("");
    try {
      if (expense) {
        await saveExpense(householdId, expense.id, built.value);
        onSaved("Expense updated.");
      } else {
        await createExpense(householdId, built.value);
        onSaved("Expense added. Everyone's totals just updated.");
      }
      onClose();
    } catch (caught) {
      setFormError(describeError(caught));
    } finally {
      setSaving(false);
    }
  }

  const payerName =
    members.find((m) => m.uid === draft.paidBy)?.displayName ?? expense?.payerName ?? "You";

  return (
    <Modal
      open={open}
      title={isEdit ? "Edit expense" : "Add an expense"}
      description={
        isEdit ? "Changes update everyone's balances live." : "For example: detergent, ₹10."
      }
      onClose={onClose}
      footer={
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button
            type="submit"
            form="expense-form"
            loading={saving}
            icon={isEdit ? <Save size={16} aria-hidden /> : <Plus size={16} aria-hidden />}
          >
            {isEdit ? "Save changes" : "Add expense"}
          </Button>
        </div>
      }
    >
      <form id="expense-form" onSubmit={handleSubmit} noValidate className="space-y-4">
        {formError ? <Alert tone="error">{formError}</Alert> : null}

        <Field id="expense-description" label="Item" error={errors.description}>
          {(props) => (
            <input
              {...props}
              value={draft.description}
              onChange={(e) => set("description", e.target.value)}
              placeholder="Detergent"
              maxLength={LIMITS.description}
              autoComplete="off"
              enterKeyHint="next"
            />
          )}
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="expense-amount" label="Amount (₹)" error={errors.amount} hint="Up to 2 decimals">
            {(props) => (
              <input
                {...props}
                // Deliberately a text field: `parseAmountToPaise` does the
                // parsing so "10.5" and "₹10.50" behave identically, and the
                // numeric keypad still opens on a phone.
                type="text"
                inputMode="decimal"
                value={draft.amount}
                onChange={(e) => set("amount", e.target.value)}
                placeholder="10.00"
                autoComplete="off"
                className={`${props.className} tnum`}
              />
            )}
          </Field>

          <Field id="expense-date" label="Date" error={errors.date}>
            {(props) => (
              <input
                {...props}
                type="date"
                value={draft.date}
                max={todayISO()}
                onChange={(e) => set("date", e.target.value)}
              />
            )}
          </Field>
        </div>

        <Field
          id="expense-payer"
          label="Paid by"
          error={errors.paidBy}
          hint={
            canChoosePayer
              ? "As an admin you can log a purchase for a roommate."
              : isEdit
                ? "The payer of an existing expense cannot be changed."
                : undefined
          }
        >
          {(props) =>
            canChoosePayer ? (
              <select
                {...props}
                value={draft.paidBy}
                onChange={(e) => set("paidBy", e.target.value)}
                className={`${props.className} appearance-none`}
              >
                {members.map((member) => (
                  <option key={member.uid} value={member.uid}>
                    {member.displayName}
                    {member.uid === currentUid ? " (you)" : ""}
                  </option>
                ))}
              </select>
            ) : (
              <input
                {...props}
                value={payerName}
                readOnly
                className={`${props.className} bg-slate-50 text-slate-500`}
              />
            )
          }
        </Field>

        <Field id="expense-notes" label="Notes (optional)" error={errors.notes}>
          {(props) => (
            <textarea
              {...props}
              value={draft.notes}
              onChange={(e) => set("notes", e.target.value)}
              placeholder="Brand, shop, or anything worth remembering"
              rows={3}
              maxLength={LIMITS.notes}
              className={`${props.className} resize-y`}
            />
          )}
        </Field>
      </form>
    </Modal>
  );
}
