"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";

/**
 * The one side sheet every Week 7 editor uses (spec §3: "a sheet, not a step").
 *
 * - From 640 px up: a 420 px panel sliding in from the right over the report, which stays visible
 *   behind a light backdrop. Below 640 px: a full-screen page.
 * - Open state lives in the URL (`?sheet=…&row=…`), so a header deep link can open it and the
 *   phone's Back button closes it. Close returns to `closeHref`: by going back when the sheet was
 *   opened from the page (one history entry), otherwise by replacing the URL.
 * - role="dialog" with focus moved into it, Tab kept inside, Escape closes, page scroll locked;
 *   focus returns to the element with id `returnFocusId` (the opener) after closing.
 * - Rendered into document.body (a portal), so the page's own layout (e.g. space-y margins) can't
 *   shift a fixed panel.
 */

const OPENED_FROM_PAGE = "hrudaya.sheetOpenedFrom";

/** Call from the opener's onClick so Close can go back instead of adding a history entry. */
export function markSheetOpened(href: string) {
  try {
    sessionStorage.setItem(OPENED_FROM_PAGE, href);
  } catch {
    /* storage blocked: Close falls back to replacing the URL */
  }
}

/** Close: when the sheet has unsaved changes, asks first ("Discard changes?"); otherwise just closes. */
export function useCloseSheet(closeHref: string, returnFocusId?: string, dirty = false) {
  const router = useRouter();
  return () => {
    if (dirty && !window.confirm("Discard changes?")) return;
    let fromPage = false;
    try {
      fromPage = sessionStorage.getItem(OPENED_FROM_PAGE) === window.location.pathname + window.location.search;
      sessionStorage.removeItem(OPENED_FROM_PAGE);
    } catch {
      /* ignore */
    }
    if (fromPage) router.back();
    else router.replace(closeHref, { scroll: false });
    if (returnFocusId) {
      // After the URL changes the page re-renders; give it a frame, then put focus back on the opener.
      window.setTimeout(() => document.getElementById(returnFocusId)?.focus(), 150);
    }
  };
}

type Props = {
  title: string;
  /** One line under the title, e.g. the lesion being edited. */
  subtitle?: string;
  closeHref: string;
  returnFocusId?: string;
  /** Sticky at the bottom: the sheet's actions. */
  footer?: React.ReactNode;
  /** When set, body and footer are one form, so the footer's submit button sees its pending state. */
  formAction?: (formData: FormData) => void;
  /** Unsaved changes: Close, Escape and the backdrop ask before discarding them. */
  dirty?: boolean;
  children: React.ReactNode;
};

export function Sheet({ title, subtitle, closeHref, returnFocusId, footer, formAction, dirty = false, children }: Props) {
  const panel = useRef<HTMLDivElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const close = useCloseSheet(closeHref, returnFocusId, dirty);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);
  useEffect(() => {
    if (!mounted) return;
    heading.current?.focus();
    const root = document.documentElement;
    const previous = root.style.overflow;
    root.style.overflow = "hidden";
    return () => {
      root.style.overflow = previous;
    };
  }, [mounted]);

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      e.preventDefault();
      close();
      return;
    }
    if (e.key !== "Tab" || !panel.current) return;
    const items = [
      ...panel.current.querySelectorAll<HTMLElement>("button, input, select, textarea, summary, [href], [tabindex]:not([tabindex='-1'])"),
    ].filter((el) => !el.hasAttribute("disabled") && el.offsetParent !== null);
    if (!items.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  if (!mounted) return null;
  return createPortal(
    <>
      <div className="fixed inset-0 z-30 hidden bg-slate-900/30 sm:block" aria-hidden onClick={close} />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby="sheet-title"
        onKeyDown={onKeyDown}
        className="fixed inset-0 z-40 flex flex-col bg-white sm:inset-y-0 sm:left-auto sm:right-0 sm:w-[420px] sm:border-l sm:border-slate-200 sm:shadow-2xl motion-safe:sm:animate-[sheet-side-in_200ms_ease-out]"
      >
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-4 py-3">
          <div className="min-w-0">
            <h2 id="sheet-title" ref={heading} tabIndex={-1} className="text-base font-bold text-slate-900 focus:outline-none">
              {title}
            </h2>
            {subtitle && <p className="truncate text-sm text-slate-600">{subtitle}</p>}
          </div>
          <button type="button" className="btn-secondary min-h-11 shrink-0 px-4" onClick={close}>
            Close
          </button>
        </div>
        {formAction ? (
          <form action={formAction} className="flex min-h-0 flex-1 flex-col">
            <Body footer={footer}>{children}</Body>
          </form>
        ) : (
          <Body footer={footer}>{children}</Body>
        )}
      </div>
    </>,
    document.body,
  );
}

function Body({ footer, children }: { footer?: React.ReactNode; children: React.ReactNode }) {
  return (
    <>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4">{children}</div>
      {footer && <div className="border-t border-slate-200 bg-white px-4 py-3">{footer}</div>}
    </>
  );
}
