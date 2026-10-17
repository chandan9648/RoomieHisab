"use client";

/**
 * A dialog that is a bottom sheet on phones and a centred panel from `sm` up.
 * Handles the accessibility basics by hand rather than pulling in a dependency:
 * Escape closes, focus moves in on open and back to the trigger on close, Tab
 * is trapped inside the panel, and the page behind it cannot scroll.
 */

import { useCallback, useEffect, useId, useRef, type ReactNode } from "react";
import { X } from "lucide-react";

import { pauseSmoothScroll, resumeSmoothScroll } from "@/lib/smoothScroll";
import { IconButton } from "./primitives";

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function Modal({
  open,
  title,
  description,
  onClose,
  children,
  footer,
}: {
  open: boolean;
  title: string;
  description?: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const restoreTo = useRef<HTMLElement | null>(null);
  const baseId = useId();
  const titleId = `${baseId}-title`;
  const descriptionId = `${baseId}-description`;

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
        return;
      }
      if (event.key !== "Tab") return;

      const nodes = panelRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE);
      if (!nodes || nodes.length === 0) return;

      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      const active = document.activeElement;

      // Wrap at both ends so focus never escapes to the page behind.
      if (event.shiftKey && (active === first || active === panelRef.current)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    },
    [onClose],
  );

  useEffect(() => {
    if (!open) return;

    restoreTo.current = document.activeElement as HTMLElement | null;
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";
    // Smooth scrolling moves the page with `window.scrollTo` on every frame,
    // which `overflow: hidden` cannot hold back — it has to be asked to stop,
    // or the page carries on drifting behind the dialog.
    pauseSmoothScroll();

    const firstField = panelRef.current?.querySelector<HTMLElement>(FOCUSABLE);
    (firstField ?? panelRef.current)?.focus();

    return () => {
      document.body.style.overflow = overflow;
      resumeSmoothScroll();
      restoreTo.current?.focus?.();
    };
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <div
        className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        tabIndex={-1}
        onKeyDown={handleKeyDown}
        className="relative flex max-h-[92vh] w-full flex-col rounded-t-3xl bg-white shadow-xl sm:max-w-lg sm:rounded-3xl"
      >
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 p-4 sm:p-5">
          <div className="min-w-0">
            <h2 id={titleId} className="text-lg font-semibold tracking-tight text-slate-900">
              {title}
            </h2>
            {description ? (
              <p id={descriptionId} className="mt-0.5 text-sm text-slate-500">
                {description}
              </p>
            ) : null}
          </div>
          <IconButton label="Close" icon={<X size={18} />} onClick={onClose} />
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-5">{children}</div>

        {footer ? (
          <div className="border-t border-slate-100 p-4 pb-safe sm:p-5">{footer}</div>
        ) : (
          <div className="pb-safe sm:hidden" />
        )}
      </div>
    </div>
  );
}
