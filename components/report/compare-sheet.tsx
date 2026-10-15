"use client";

import { useEffect, useRef, useState } from "react";
import { SECTION_KEYS, type SectionKey } from "@/lib/summary/sections";
import { SECTION_LABEL } from "./summary-editor";
import { RecordChanged, RecordGroup, type RecordContext } from "./record-panel";

const STORE = "hrudaya.compareOpen";
const readOpen = () => {
  try {
    return sessionStorage.getItem(STORE) === "1";
  } catch {
    return false;
  }
};
const writeOpen = (open: boolean) => {
  try {
    sessionStorage.setItem(STORE, open ? "1" : "0");
  } catch {
    /* private mode or blocked storage: the toggle simply is not remembered */
  }
};

/**
 * Phones and tablets (< 1024 px): a fixed "Compare with record" button opening a bottom sheet
 * (Week 5 spec §5). The sheet shows the record group for the section last focused, with the other
 * groups collapsible below. Focus is trapped while open; Escape or Close returns focus to the button.
 * The open/closed state is remembered for this browser session only.
 */
export function CompareSheet({ ctx, focused, changed }: { ctx: RecordContext; focused: SectionKey; changed: boolean }) {
  const [open, setOpen] = useState(false);
  const sheet = useRef<HTMLDivElement>(null);
  const opener = useRef<HTMLButtonElement>(null);
  const closer = useRef<HTMLButtonElement>(null);

  useEffect(() => setOpen(readOpen()), []);
  useEffect(() => {
    writeOpen(open);
    if (open) closer.current?.focus();
  }, [open]);

  function close() {
    setOpen(false);
    opener.current?.focus();
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      e.preventDefault();
      close();
      return;
    }
    if (e.key !== "Tab" || !sheet.current) return;
    const items = [...sheet.current.querySelectorAll<HTMLElement>("button, summary, [href], [tabindex]:not([tabindex='-1'])")].filter((el) => !el.hasAttribute("disabled"));
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

  const others = SECTION_KEYS.filter((k) => k !== focused);
  return (
    <div className="lg:hidden">
      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-slate-200 bg-white/95 px-4 py-2 backdrop-blur">
        <button ref={opener} type="button" className="btn-secondary min-h-11 w-full" aria-expanded={open} aria-controls="compare-sheet" onClick={() => setOpen((o) => !o)}>
          {open ? "Hide record" : "Compare with record"}
        </button>
      </div>
      {open && (
        <>
          <div className="fixed inset-0 z-30 bg-slate-900/30" aria-hidden onClick={close} />
          <div
            ref={sheet}
            id="compare-sheet"
            role="dialog"
            aria-modal="true"
            aria-labelledby="compare-title"
            onKeyDown={onKeyDown}
            className="fixed inset-x-0 bottom-0 z-40 flex h-[70vh] flex-col rounded-t-2xl bg-white shadow-2xl motion-safe:animate-[sheet-in_200ms_ease-out]"
          >
            <div className="flex items-center justify-between gap-2 border-b border-slate-200 px-4 py-2">
              <h3 id="compare-title" className="text-sm font-bold uppercase tracking-wide text-slate-700">Record · what the model saw</h3>
              <button ref={closer} type="button" className="btn-secondary min-h-11 px-4" onClick={close}>Close</button>
            </div>
            <div className="flex-1 space-y-3 overflow-y-auto overscroll-contain px-4 py-3 text-sm">
              {changed && <RecordChanged />}
              <section aria-labelledby="sheet-focused">
                <p id="sheet-focused" className="mb-1 text-xs font-semibold uppercase tracking-wide text-sky-900">{SECTION_LABEL[focused]}</p>
                <RecordGroup group={focused} ctx={ctx} />
              </section>
              {others.map((k) => (
                <details key={k} className="group rounded-lg border border-slate-200">
                  <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 px-3 font-medium">
                    <span aria-hidden className="inline-block text-slate-500 motion-safe:transition-transform motion-safe:duration-150 group-open:rotate-90">›</span>
                    {SECTION_LABEL[k]}
                  </summary>
                  <div className="border-t border-slate-200 px-3 py-2">
                    <RecordGroup group={k} ctx={ctx} />
                  </div>
                </details>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
