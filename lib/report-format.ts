/**
 * Display wording for the read-only report (clinical review, 2026-10-15).
 * Display only: stored enum values and the form's dropdown labels are unchanged.
 * Self-contained (type imports only) so it can be checked outside Next.
 */
import type { Database } from "@/lib/database.types";

type Enums = Database["public"]["Enums"];

export const NOT_RECORDED = "Not recorded";

/** Any null/empty value in the report. */
export const orNotRecorded = (v: string | number | null | undefined) =>
  v === null || v === undefined || v === "" ? NOT_RECORDED : String(v);

const VESSEL: Record<Enums["vessel"], string> = {
  lmca: "LMCA", lad: "LAD", d1: "D1", d2: "D2", lcx: "LCX", om1: "OM1", om2: "OM2", ramus: "Ramus",
  rca: "RCA", pda: "PDA", plv: "PLV", graft: "Graft", other: "Other vessel",
};
const SEGMENT: Record<Enums["vessel_segment"], string> = { ostial: "Ostial", proximal: "Proximal", mid: "Mid", distal: "Distal" };

/** "Proximal LAD" — segment before vessel; "LMCA" when no segment. */
export function lesionName(vessel: Enums["vessel"], segment: Enums["vessel_segment"] | null) {
  return segment ? `${SEGMENT[segment]} ${VESSEL[vessel]}` : VESSEL[vessel];
}

/** "BMW Universal II 0.014" → "BMW Universal II, 0.014-inch"; anything else as stored. */
export function guidewireText(stored: string) {
  const m = /^(.*?)[\s,]*0\.014$/.exec(stored.trim());
  return m && m[1] ? `${m[1]}, 0.014-inch` : stored;
}

export const FREQUENCY_TEXT: Record<Enums["dose_frequency"], string> = {
  od: "once daily", bd: "twice daily", tds: "three times daily", qds: "four times daily", prn: "as needed", weekly: "weekly",
};

const ROUTE_TEXT: Record<Enums["medication_route"], string> = {
  oral: "oral", sc: "subcutaneous", iv: "intravenous", topical: "topical", sublingual: "sublingual",
  intra_arterial: "intra-arterial",
};

const UNIT_TEXT: Record<Enums["dose_unit"], string> = {
  mg: "mg", mcg: "mcg", g: "g", ml: "mL", iu: "IU", units: "units", units_per_kg: "units/kg",
};

type Med = {
  drug_name: string;
  dose: number | null;
  dose_unit: Enums["dose_unit"] | null;
  frequency: Enums["dose_frequency"];
  route: Enums["medication_route"];
};

/**
 * Oral:      "Aspirin 75 mg once daily"
 * Non-oral:  "GTN sublingual, as needed" / "Enoxaparin 40 mg subcutaneous, twice daily"
 */
export function medicationLine(m: Med) {
  const dose = m.dose !== null && m.dose_unit ? ` ${m.dose} ${UNIT_TEXT[m.dose_unit]}` : "";
  const freq = FREQUENCY_TEXT[m.frequency];
  return m.route === "oral" ? `${m.drug_name}${dose} ${freq}` : `${m.drug_name}${dose} ${ROUTE_TEXT[m.route]}, ${freq}`;
}

/** Phase heading for a device row. A drug-coated balloon in the deployment phase is not a stent. */
export function phaseHeading(phase: Enums["device_phase"], category: Enums["device_category"]) {
  switch (phase) {
    case "pre_dilation":
      return "Pre-dilation";
    case "post_dilation":
      return "Post-dilation";
    case "deployment":
      return category === "stent" ? "Stent deployment" : "Deployment";
    default:
      return "Other";
  }
}

// ─── 0005–0007 ────────────────────────────────────────────────────────────────

const IST = "Asia/Kolkata";

/** 2026-09-01T04:30:00Z → "1 Sep 2026, 10:00" (IST). */
export function formatDateTime(iso: string | null | undefined) {
  if (!iso) return NOT_RECORDED;
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: IST,
  }).format(new Date(iso));
}

/** Time only, IST: "10:10". */
export function formatTime(iso: string | null | undefined) {
  if (!iso) return NOT_RECORDED;
  return new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: IST }).format(new Date(iso));
}

/** Whole minutes between two instants, or null if either is missing. */
export function minutesBetween(from: string | null | undefined, to: string | null | undefined) {
  if (!from || !to) return null;
  return Math.round((new Date(to).getTime() - new Date(from).getTime()) / 60_000);
}

/** Length of stay: hours under 72 h, otherwise days + hours (owner, 0005). */
export function lengthOfStay(admittedAt: string | null | undefined, dischargedAt: string | null | undefined) {
  const min = minutesBetween(admittedAt, dischargedAt);
  if (min === null) return NOT_RECORDED;
  const hours = Math.floor(min / 60);
  if (hours < 72) return `${hours} h`;
  const days = Math.floor(hours / 24);
  const rest = hours % 24;
  return rest === 0 ? `${days} days` : `${days} days ${rest} h`;
}

const TIMING_TEXT: Record<Enums["medication_timing"], string> = {
  pre_procedure: "Before procedure", intra_procedure: "During procedure", post_procedure: "After procedure",
};
export const timingHeading = (t: Enums["medication_timing"]) => TIMING_TEXT[t];

/** "Unfractionated heparin 70 units/kg intravenous" — no frequency for a single procedural dose. */
export function procedureMedicationLine(m: { drug_name: string; dose: number | null; dose_unit: Enums["dose_unit"] | null; route: Enums["medication_route"] }) {
  const dose = m.dose !== null && m.dose_unit ? ` ${m.dose} ${UNIT_TEXT[m.dose_unit]}` : "";
  return `${m.drug_name}${dose} ${ROUTE_TEXT[m.route]}`;
}

const LVEF_SOURCE_TEXT: Record<Enums["lvef_source"], string> = {
  echo: "echocardiogram", ventriculography: "left ventriculography", mri: "cardiac MRI", other: "other source",
};

/** Three-state rule: "Not recorded" / "Not performed" / the value. */
export function measurement(status: Enums["measurement_status"], value: string) {
  return status === "recorded" ? value : status === "not_performed" ? "Not performed" : NOT_RECORDED;
}

/** "45% (echocardiogram, 2 Sep 2026)" — the source is always stated, never implied from the angiogram. */
export function lvefText(p: { lvef_status: Enums["measurement_status"]; lvef_pct: number | null; lvef_source: Enums["lvef_source"] | null; lvef_measured_on: string | null }) {
  if (p.lvef_status !== "recorded" || p.lvef_pct === null) return measurement(p.lvef_status, "");
  const parts = [p.lvef_source ? LVEF_SOURCE_TEXT[p.lvef_source] : "source not recorded"];
  if (p.lvef_measured_on) {
    parts.push(new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${p.lvef_measured_on}T00:00:00Z`)));
  }
  return `${p.lvef_pct}% (${parts.join(", ")})`;
}
