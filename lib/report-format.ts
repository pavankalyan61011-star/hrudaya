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
};

const UNIT_TEXT: Record<Enums["dose_unit"], string> = { mg: "mg", mcg: "mcg", g: "g", ml: "mL", iu: "IU" };

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
