import { Constants, type Database } from "./database.types.ts";

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
  // Week 7 (0011): lesion class / dissection grade (shared letters), physiology, imaging, grafts
  a: "A", b: "B", b1: "B1", b2: "B2", c: "C", d: "D", e: "E", f: "F",
  ffr: "FFR", ifr: "iFR", rfr: "RFR", dfr: "DFR", pd_pa_rest: "Pd/Pa (rest)",
  adenosine_iv: "Adenosine IV", adenosine_ic: "Adenosine IC",
  ivus: "IVUS", oct: "OCT", nirs_ivus: "NIRS-IVUS", vendor_auto: "Vendor automatic",
  lima: "LIMA", rima: "RIMA", svg: "SVG", not_visualised: "Not visualised",
  qca_manual_edge: "QCA (manual edge)", qca_auto_edge: "QCA (automatic edge)",
  measured_viewer: "Measured in viewer", hemo_system: "Haemodynamic system", xray_dose: "X-ray dose report",
  // techniques and bifurcation strategy
  pot: "POT", re_pot: "Re-POT", direct_stent: "Direct stenting", bailout_stent: "Bail-out stent",
  intravascular_lithotripsy: "IVL (lithotripsy)",
  cto_antegrade: "CTO antegrade", cto_retrograde: "CTO retrograde",
  t_tap: "T-TAP", dk_crush: "DK-crush", mini_crush: "Mini-crush", simultaneous_kissing_stents: "SKS (simultaneous kissing stents)",
  ellis_1: "Ellis I", ellis_2: "Ellis II", ellis_3: "Ellis III", ellis_3_cavity: "Ellis III (cavity spilling)",
  // events, treatments, outcomes
  gp_iib_iiia: "GP IIb/IIIa inhibitor", iabp: "IABP", impella_or_ecmo: "Impella / ECMO",
  new_cardiogenic_shock: "New cardiogenic shock", unplanned_repeat_pci: "Unplanned repeat PCI",
  av_fistula: "AV fistula", ccu: "CCU", icu: "ICU", left_against_advice: "Left against medical advice",
  // indication detail
  tmt: "TMT (treadmill)", spect: "SPECT", pet: "PET", cmr: "Cardiac MRI", ct_ffr: "CT-FFR", af: "AF",
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
