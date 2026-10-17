"use client";

/**
 * Replaces `window.confirm` for destructive actions: it is styled, accessible,
 * and can show what is about to be deleted rather than a bare browser prompt.
 *
 * The dialog owns the whole lifecycle of the action it is confirming — running
 * it, showing that it is running, closing on success and staying open on
 * failure. It used to fire `onConfirm` and nothing else, which left every
 * caller to remember to close it; the ones that forgot (remove roommate, issue
 * a new code, leave household) sat open over a job that had already finished.
 */

import { useEffect, useState } from "react";

import { describeError } from "@/lib/errors";
import { Alert, Button } from "./primitives";
import { Modal } from "./Modal";

export type Confirmation = {
  title: string;
  /** Rendered as the dialog body; name the thing being deleted here. */
  body: string;
  confirmLabel: string;
  /**
   * The action itself. Let it reject to report a problem: the dialog stays
   * open and shows the message, rather than closing onto an alert elsewhere
   * on a page the user may have already scrolled away from.
   */
  onConfirm: () => void | Promise<void>;
};

export function ConfirmDialog({
  request,
  onClose,
}: {
  request: Confirmation | null;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // Each confirmation is a fresh object, so this clears the previous attempt's
  // error and spinner whenever a different action is confirmed.
  useEffect(() => {
    setBusy(false);
    setError("");
  }, [request]);

  async function confirm() {
    if (!request || busy) return;
    setBusy(true);
    setError("");
    try {
      await request.onConfirm();
      onClose();
    } catch (caught) {
      setError(describeError(caught));
      setBusy(false);
    }
  }

  // A half-finished write must not be abandoned by closing the dialog over it.
  const close = busy ? () => {} : onClose;

  return (
    <Modal
      open={Boolean(request)}
      title={request?.title ?? ""}
      onClose={close}
      footer={
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={close} disabled={busy}>
            Cancel
          </Button>
          <Button variant="danger" loading={busy} onClick={() => void confirm()}>
            {request?.confirmLabel ?? "Confirm"}
          </Button>
        </div>
      }
    >
      <p className="text-sm text-slate-600">{request?.body}</p>
      {error ? (
        <div className="mt-3">
          <Alert tone="error">{error}</Alert>
        </div>
      ) : null}
    </Modal>
  );
}
