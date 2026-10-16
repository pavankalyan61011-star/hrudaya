"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Change } from "@/lib/amendments/diff";
import { ChangesTable } from "./changes-table";

type Props = {
  procedureId: string;
  amendmentNo: number;
  initialChanges: Change[];
  operators: { id: string; full_name: string }[];
  defaultClinicianId: string | null;
};

/**
 * "Changes you are signing" + the second signature (Week 6 spec §4). The list shown is the list
 * posted; the server recomputes it and, if the record changed meanwhile, answers 409 with the fresh
 * list, which replaces this one so the clinician signs what is true.
 */
export function SignAmendment({ procedureId, amendmentNo, initialChanges, operators, defaultClinicianId }: Props) {
  const router = useRouter();
  const [changes, setChanges] = useState<Change[]>(initialChanges);
  const [clinician, setClinician] = useState(defaultClinicianId ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const name = operators.find((o) => o.id === clinician)?.full_name;
  const none = changes.length === 0;

  async function sign() {
    const what = none ? "close this amendment with no changes" : `sign ${changes.length} change${changes.length === 1 ? "" : "s"} and re-review the record`;
    if (!window.confirm(`As ${name ?? "the selected clinician"}, ${what}? The record becomes read-only again.`)) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/procedures/${procedureId}/amendments/close`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reviewing_clinician_id: clinician, changes }),
      });
      const body = await res.json().catch(() => ({}));
      if (res.ok) {
        router.push(`/procedures/${procedureId}`);
        router.refresh();
        return;
      }
      if (res.status === 409 && Array.isArray(body.changes)) setChanges(body.changes as Change[]);
      setError(body.error ?? "Could not save. Please try again.");
    } catch {
      setError("No connection. Nothing was saved — try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <section className="card space-y-3" aria-labelledby="signing-heading">
        <h2 id="signing-heading" className="font-semibold">Changes you are signing — amendment #{amendmentNo}</h2>
        <ChangesTable changes={changes} />
      </section>
      {error && (
        <p role="alert" className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm font-medium text-red-950">{error}</p>
      )}
      <section className="card space-y-3">
        <div>
          <label htmlFor="rereviewer" className="label">Re-reviewing clinician</label>
          <select id="rereviewer" className="input min-h-11 sm:w-72" value={clinician} onChange={(e) => setClinician(e.target.value)} disabled={busy}>
            <option value="">Choose…</option>
            {operators.map((o) => (
              <option key={o.id} value={o.id}>{o.full_name}</option>
            ))}
          </select>
        </div>
        <div className="flex flex-wrap gap-3">
          <button type="button" className="btn-primary min-h-11 w-full sm:w-auto" disabled={busy || !clinician} onClick={sign}>
            {busy ? "Saving…" : none ? "Close amendment (no changes)" : "Complete and re-review"}
          </button>
          <a href={`/procedures/new?id=${procedureId}&step=2`} className="btn-secondary min-h-11 w-full sm:w-auto">Back to editing</a>
        </div>
        {!clinician && <p className="text-sm text-slate-600">Choose the re-reviewing clinician to sign.</p>}
      </section>
    </div>
  );
}
