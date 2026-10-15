import type { SummaryInput } from "@/lib/summary/input";
import type { SectionKey } from "@/lib/summary/sections";
import { SECTION_LABEL } from "./summary-editor";

/**
 * The record, as the model saw it (Week 5 spec §5): `buildSummaryInput(loaded)`, formatted for
 * reading and grouped to match the leaflet's sections. Read-only. Missing values are never blank:
 *   a field the input omitted       → "Not recorded"
 *   a three-state measurement       → its state ("Not recorded" / "Not performed")
 *   an empty list                   → "None recorded"
 */
export type RecordContext = {
  input: SummaryInput;
  /** The procedure's LVEF state (the input carries only a recorded value). */
  lvefStatus: "recorded" | "not_recorded" | "not_performed";
  /** Complications in the record that were NOT sent to the model because they have no outcome. */
  complicationsWithoutOutcome: number;
};

const NR = "Not recorded";
const NONE = "None recorded";
const STATE: Record<RecordContext["lvefStatus"], string> = { recorded: "Recorded", not_recorded: "Not recorded", not_performed: "Not performed" };

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  const empty = value === undefined || value === null || value === "";
  return (
    <div className="flex flex-wrap justify-between gap-x-3 border-b border-slate-100 py-1 last:border-0">
      <dt className="text-slate-600">{label}</dt>
      <dd className={`min-w-0 break-words text-right font-medium ${empty ? "text-slate-500" : "text-slate-900"}`}>{empty ? NR : value}</dd>
    </div>
  );
}

function Items({ items, empty = NONE }: { items: React.ReactNode[]; empty?: string }) {
  if (!items.length) return <p className="py-1 text-slate-500">{empty}</p>;
  return <ul className="list-disc space-y-1 pl-5">{items.map((it, i) => <li key={i} className="break-words">{it}</li>)}</ul>;
}

function Sub({ children }: { children: React.ReactNode }) {
  return <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-slate-500">{children}</p>;
}

export function RecordGroup({ group, ctx }: { group: SectionKey; ctx: RecordContext }) {
  const { input, lvefStatus, complicationsWithoutOutcome } = ctx;
  const d = input.discharge;
  switch (group) {
    case "why":
      return (
        <dl>
          <Field label="Indication" value={input.episode.indication} />
          <Field label="Urgency" value={input.episode.urgency} />
          <Field label="Admitted" value={input.episode.admitted_at} />
        </dl>
      );
    case "done":
      return (
        <div>
          <dl>
            <Field label="Access site" value={input.access?.site} />
            <Field label="Side" value={input.access?.side} />
            <Field label="Sheath" value={input.access?.sheath_size_fr !== undefined ? `${input.access.sheath_size_fr} Fr` : undefined} />
          </dl>
          <Sub>Interventions</Sub>
          <Items items={input.interventions.map((iv) => `${iv.vessel}: ${iv.type}, residual ${iv.residual_stenosis_pct}%, final TIMI ${iv.final_timi}`)} />
          <Sub>Devices</Sub>
          <Items items={input.devices.map((dv) => `${dv.category}: ${dv.name}, ${dv.size}`)} />
          <Sub>Complications</Sub>
          <Items items={input.complications.map((c) => `${c.name}${c.onset ? ` (${c.onset})` : ""} — outcome: ${c.outcome}`)} />
          {complicationsWithoutOutcome > 0 && (
            <p className="mt-2 rounded border border-amber-300 bg-amber-50 px-2 py-1 text-amber-950">
              The record also has {complicationsWithoutOutcome} complication{complicationsWithoutOutcome === 1 ? "" : "s"} with no outcome text,
              not sent to the model. Check the report.
            </p>
          )}
        </div>
      );
    case "found":
      return <Items items={input.findings.map((f) => `${f.vessel}: ${f.stenosis_pct}% narrowing, TIMI ${f.timi_flow}`)} />;
    case "pump":
      return (
        <dl>
          <Field label="LVEF" value={input.measurements.lvef_pct !== undefined ? `${input.measurements.lvef_pct}%` : STATE[lvefStatus === "recorded" ? "not_recorded" : lvefStatus]} />
        </dl>
      );
    case "medicines":
      return (
        <Items
          items={input.medications.map((m) => (
            <span key={m.drug_name}>
              <span className="font-medium">{m.drug_name}</span>
              {m.is_dapt && <span className="ml-1 rounded bg-sky-100 px-1 text-xs font-semibold text-sky-900">DAPT</span>}
              {" — "}
              {m.dose !== undefined ? `${m.dose} ${m.unit ?? ""}`.trim() : `dose: ${NR}`}, {m.frequency}, {m.route.replace(/_/g, " ")}
              {m.duration ? `, ${m.duration}` : ""}
            </span>
          ))}
        />
      );
    case "care":
      return <Items items={d?.advice ?? []} />;
    case "urgent": {
      const flags = d?.red_flags ?? [];
      if (!flags.length) return <p className="py-1 text-slate-500">{NONE}</p>;
      const groups: { heading: string | null; items: string[] }[] = [];
      for (const f of flags) {
        if (f.trim().endsWith(":")) groups.push({ heading: f, items: [] });
        else if (groups.length) groups[groups.length - 1].items.push(f);
        else groups.push({ heading: null, items: [f] });
      }
      return (
        <div className="space-y-2">
          {groups.map((g, i) => (
            <div key={i}>
              {g.heading && <p className="font-semibold text-slate-800">{g.heading}</p>}
              <Items items={g.items} />
            </div>
          ))}
        </div>
      );
    }
    case "followup":
      return (
        <dl>
          <Field label="Follow-up date" value={d?.follow_up_date} />
          <Field label="Clinic" value={d?.follow_up_clinic} />
          <Field label="DAPT planned" value={d?.dapt_planned_months !== undefined ? `${d.dapt_planned_months} months` : undefined} />
          <Field label="DAPT review by" value={d?.dapt_review_date} />
        </dl>
      );
    case "team":
      return (
        <dl>
          <Field label="Operator" value={input.operator ? `${input.operator.name} (${input.operator.role})` : undefined} />
          <Field label="Facility" value={input.episode.facility_name} />
          <Field label="Cath lab" value={input.episode.cath_lab_name} />
        </dl>
      );
  }
}

/** One record group as a titled block (used beside each section, and in the phone sheet). */
export function RecordBlock({ group, ctx }: { group: SectionKey; ctx: RecordContext }) {
  return (
    <div className="rounded-lg border border-sky-200 bg-sky-50/60 p-3 text-sm">
      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-sky-900">Record · {SECTION_LABEL[group]}</p>
      <RecordGroup group={group} ctx={ctx} />
    </div>
  );
}

export function RecordChanged() {
  return (
    <p role="status" className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-950">
      Record changed since this draft — regenerate
    </p>
  );
}
