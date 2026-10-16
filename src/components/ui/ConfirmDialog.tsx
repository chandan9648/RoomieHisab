"use client";

/**
 * Replaces `window.confirm` for destructive actions: it is styled, accessible,
 * and can show what is about to be deleted rather than a bare browser prompt.
 */

import { Button } from "./primitives";
import { Modal } from "./Modal";

export type Confirmation = {
  title: string;
  /** Rendered as the dialog body; name the thing being deleted here. */
  body: string;
  confirmLabel: string;
  onConfirm: () => void | Promise<void>;
};

export function ConfirmDialog({
  request,
  busy,
  onCancel,
}: {
  request: Confirmation | null;
  busy?: boolean;
  onCancel: () => void;
}) {
  return (
    <Modal
      open={Boolean(request)}
      title={request?.title ?? ""}
      onClose={busy ? () => {} : onCancel}
      footer={
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
          <Button variant="danger" loading={busy} onClick={() => void request?.onConfirm()}>
            {request?.confirmLabel ?? "Confirm"}
          </Button>
        </div>
      }
    >
      <p className="text-sm text-slate-600">{request?.body}</p>
    </Modal>
  );
}
