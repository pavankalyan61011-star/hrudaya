import { Constants, type Database } from "@/lib/database.types";

export type Enums = Database["public"]["Enums"];

/** Enum value lists straight from the generated schema, so dropdowns never drift from the database. */
export const ENUMS = Constants.public.Enums;

const LABELS: Record<string, string> = {
  // vessels
  lmca: "LMCA", lad: "LAD", d1: "D1", d2: "D2", lcx: "LCX", om1: "OM1", om2: "OM2", ramus: "Ramus",
  rca: "RCA", pda: "PDA", plv: "PLV", graft: "Graft",
  // indications / types
  stemi: "STEMI", nstemi: "NSTEMI", pre_op_assessment: "Pre-op assessment", cardiomyopathy_workup: "Cardiomyopathy work-up",
  diagnostic_angiography: "Diagnostic angiography", pci: "PCI", angiography_and_pci: "Angiography + PCI",
  // interventions / devices
  pci_des: "PCI — drug-eluting stent", pci_bms: "PCI — bare-metal stent", poba: "POBA (plain balloon)",
  balloon_sc: "Semi-compliant balloon", balloon_nc: "Non-compliant balloon", balloon_dcb: "Drug-coated balloon",
  balloon_scoring: "Scoring balloon", pre_dilation: "Pre-dilation", deployment: "Deployment", post_dilation: "Post-dilation",
  // risk factors
  diabetes_t2: "Type 2 diabetes", diabetes_t1: "Type 1 diabetes", smoking: "Current smoker", ex_smoker: "Ex-smoker",
  family_history: "Family history", ckd: "CKD", prior_pci: "Prior PCI", prior_cabg: "Prior CABG", prior_mi: "Prior MI",
  // complications
  no_reflow: "No-reflow", access_site_haematoma: "Access-site haematoma",
  // medications
  od: "OD", bd: "BD", tds: "TDS", qds: "QDS", prn: "PRN", mg: "mg", mcg: "mcg", g: "g", ml: "mL", iu: "IU",
  sc: "SC", iv: "IV",
  // operators
  interventional_cardiologist: "Interventional cardiologist",
};

/** Human label for any enum value: explicit where clinical shorthand matters, otherwise "snake_case" → "Snake case". */
export function label(value: string | null | undefined): string {
  if (value === null || value === undefined || value === "") return "—";
  if (LABELS[value]) return LABELS[value];
  const words = value.replace(/_/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export const TIMI_LABELS = ["0", "I", "II", "III"] as const;
export const timi = (n: number | null | undefined) => (n === null || n === undefined ? "—" : `TIMI ${TIMI_LABELS[n]}`);

export const SHEATH_SIZES = [5, 6, 7, 8] as const;
