"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

const MIN = 10;

/**
 * "Amend" on a reviewed report (Week 6 spec §4): a reason first, kept permanently with the record.
 * A native modal <dialog> — focus stays inside, Escape closes, focus returns to the button.
 */
export function AmendButton({ procedureId }: { procedureId: string }) {
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const short = reason.trim().length < MIN;

  async function open() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/procedures/${procedureId}/amendments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body.error ?? "Could not open the amendment. Please try again.");
        return;
      }
      dialog.current?.close();
      router.refresh();
    } catch {
      setError("No connection. Nothing was saved — try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button type="button" className="btn-secondary min-h-11 px-4" onClick={() => { setError(null); dialog.current?.showModal(); }}>
        Amend
      </button>
      <dialog
        ref={dialog}
        aria-labelledby="amend-title"
        className="w-[min(32rem,calc(100vw-2rem))] rounded-xl border border-slate-200 p-0 shadow-2xl backdrop:bg-slate-900/40"
      >
        <form method="dialog" className="space-y-3 p-4" onSubmit={(e) => { e.preventDefault(); if (!short && !busy) open(); }}>
          <h2 id="amend-title" className="text-lg font-bold">Why is this record being amended?</h2>
          <div>
            <label htmlFor="amend-reason" className="sr-only">Reason for the amendment</label>
            <textarea
              id="amend-reason"
              className="input min-h-32 text-base"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              aria-describedby="amend-hint"
              required
              minLength={MIN}
              disabled={busy}
            />
            <p id="amend-hint" className="mt-1 text-sm text-slate-600">
              This reason is kept permanently with the record.
              {short && <span> At least {MIN} characters ({reason.trim().length} so far).</span>}
            </p>
          </div>
          {error && <p role="alert" className="rounded-lg border border-red-300 bg-red-50 p-2 text-sm font-medium text-red-950">{error}</p>}
          <div className="flex flex-wrap justify-end gap-3">
            <button type="button" className="btn-secondary min-h-11 w-full sm:w-auto" onClick={() => dialog.current?.close()} disabled={busy}>
              Cancel
            </button>
            <button type="submit" className="btn-primary min-h-11 w-full sm:w-auto" disabled={short || busy}>
              {busy ? "Opening…" : "Open amendment"}
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}
