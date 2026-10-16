import type { Change } from "@/lib/amendments/diff";
import { formatChangeValue } from "@/lib/amendments/format";

const KIND: Record<Change["kind"], string> = { changed: "Changed", added: "Added", removed: "Removed" };

/**
 * A list of changes: what, before, after. Below 640 px each row stacks with labelled cells (the
 * summary-table style from Week 5), so nothing runs off a phone screen.
 */
export function ChangesTable({ changes, caption }: { changes: Change[]; caption?: string }) {
  if (!changes.length) return <p className="text-sm text-slate-600">No changes — the record is the same as when the amendment was opened.</p>;
  return (
    <table className="summary-table w-full text-left text-sm">
      {caption && <caption className="mb-1 text-left text-sm font-semibold text-slate-700">{caption}</caption>}
      <thead className="text-slate-600">
        <tr>
          <th scope="col" className="border-b border-slate-300 py-1.5 pr-2 font-semibold">What</th>
          <th scope="col" className="border-b border-slate-300 py-1.5 pr-2 font-semibold">Before</th>
          <th scope="col" className="border-b border-slate-300 py-1.5 pr-2 font-semibold">After</th>
        </tr>
      </thead>
      <tbody>
        {changes.map((c, i) => (
          <tr key={`${c.path}-${i}`} className="border-b border-slate-100 align-top">
            <td data-label="What" className="break-words py-1.5 pr-2">
              <span className="font-medium">{c.label}</span>
              {c.kind !== "changed" && <span className="ml-1 rounded bg-slate-100 px-1 text-xs font-semibold text-slate-700">{KIND[c.kind]}</span>}
            </td>
            <td data-label="Before" className="break-words py-1.5 pr-2 text-slate-700">{c.kind === "added" ? "—" : formatChangeValue(c.before)}</td>
            <td data-label="After" className="break-words py-1.5 pr-2 font-medium">{c.kind === "removed" ? "—" : formatChangeValue(c.after)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
