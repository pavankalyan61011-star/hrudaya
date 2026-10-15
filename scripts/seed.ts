/**
 * Seed script — synthetic data only.
 *
 *   npm run seed        (= node --env-file=.env.local scripts/seed.ts)
 *
 * Inserts 20 synthetic cases:
 *   PCI-2026-001        docs/cases/PCI-2026-001.md, mapped as in docs/week1-spec.md §4
 *   PCI-2026-002 … 017  docs/cases/synthetic-cases-002-020.md
 *   CAG-2026-018 … 020  same file (diagnostic-only)
 *
 * Conventions (owner, 2026-10-15):
 *   "residual <10%" → 5 · "mild irregularities" → 10 · "normal" → 0
 *   discharge "same day" → 6 h · follow-up date = procedure date + stated interval
 *   is_dapt only on the aspirin and P2Y12 rows of an aspirin + P2Y12 regimen
 *   procedure dates spread across Sept–Oct 2026
 * Where the source is silent on a required value, the choice is marked ASSUMPTION.
 *
 * Idempotent: a case whose case_code already exists is skipped. Patients are matched by MRN
 * and operators by name, and reused. If a case fails part-way, the half-written procedure is
 * removed (by its own id) so the next run can retry it.
 *
 * Uses the service-role key, so it must only ever run on a developer machine.
 * Logs case codes and counts only — never patient details.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../lib/database.types";

type Enums = Database["public"]["Enums"];
type Db = SupabaseClient<Database>;

// ─── Case shape ────────────────────────────────────────────────────────────────

type SeedVessel = {
  vessel: Enums["vessel"];
  segment: Enums["vessel_segment"] | null;
  stenosis_pct: number;
  timi_flow: number;
  is_culprit?: boolean;
  lesion_notes?: string;
};

type SeedDevice = {
  phase: Enums["device_phase"];
  category: Enums["device_category"];
  product_name: string;
  manufacturer?: string;
  diameter_mm: number;
  length_mm: number;
  inflation_atm?: number;
  lot_number?: string; // required for stents — fictional, SYN- prefix
  quantity?: number;
};

type SeedIntervention = {
  /** Index into `vessels` of the lesion treated. */
  vessel_index: number;
  intervention_type: Enums["intervention_type"];
  guidewire: string;
  residual_stenosis_pct: number;
  timi_flow_post: number;
  success: boolean;
  dissection?: boolean;
  perforation?: boolean;
  notes?: string;
  devices: SeedDevice[];
};

type SeedMedication = {
  drug_name: string;
  dose: number | null; // null only for PRN
  dose_unit: Enums["dose_unit"] | null; // null exactly when dose is null
  frequency: Enums["dose_frequency"];
  route?: Enums["medication_route"];
  duration?: string;
  purpose?: string;
  is_dapt?: boolean;
};

type SeedCase = {
  case_code: string;
  patient: {
    mrn: string;
    full_name: string;
    sex: Enums["sex"];
    date_of_birth: string; // chosen so the stated age holds on the procedure date
    mobile?: string;
  };
  risk_factors: { factor: Enums["risk_factor"]; detail?: string }[];
  operator: { full_name: string; role: Enums["operator_role"] };
  procedure: {
    procedure_date: string;
    procedure_type: Enums["procedure_type"];
    indication: Enums["indication"];
    presentation_notes: string;
    ecg_findings?: string;
    troponin_elevated?: boolean;
    access_site: Enums["access_site"];
    sheath_size_fr: number;
    diagnostic_catheters: string[];
    guiding_catheter?: string;
    contrast_volume_ml: number;
    /** From the case file; used to derive ended_at (duration is not stored since 0006). */
    procedure_duration_min: number;
    fluoroscopy_time_min: number;
    /** Case-file LVEF; stored with lvef_status = recorded (three-state rule). */
    lvef_pct?: number;
    haemostasis_method: Enums["haemostasis_method"];
    outcome_summary: string;
  };
  vessels: SeedVessel[];
  interventions: SeedIntervention[]; // empty for diagnostic-only
  complications: {
    complication: Enums["complication_type"];
    severity: Enums["complication_severity"];
    management: string;
    onset?: Enums["complication_onset"];
    /** Hours after ended_at, when the onset time is known. */
    onset_after_end_hours?: number;
    outcome?: string;
  }[];
  immediate_care_notes?: string;
  communication_notes?: string;
  /** null = patient remains admitted; no discharge row. */
  discharge: {
    /** The stay stated in the case file; discharged_at is 10:00 IST on the day it lands (see dischargeTime). */
    length_of_stay_hours: number;
    clinical_status: string;
    /** Days after the PROCEDURE date. */
    follow_up_after_days: number;
    follow_up_clinic: string;
    advice: string[];
    red_flags: string[];
    medications: SeedMedication[];
  } | null;
};

// ─── Builders (keep the case table readable) ───────────────────────────────────

const ARJUN = { full_name: "Dr Arjun Reddy", role: "interventional_cardiologist" } as const;
const MEERA = { full_name: "Dr Meera Shah", role: "interventional_cardiologist" } as const;

/** ASSUMPTION: guidewire is required but not stated for cases 002–020. */
const WIRE_NOT_RECORDED = "Not recorded";
/** ASSUMPTION: clinical status at discharge is required but not stated for cases 002–019. */
const STATUS_NOT_RECORDED = "Not recorded";
const OPD = "Cardiology OPD";

const v = (
  vessel: Enums["vessel"],
  segment: Enums["vessel_segment"] | null,
  stenosis_pct: number,
  timi_flow: number,
  extra: Partial<SeedVessel> = {},
): SeedVessel => ({ vessel, segment, stenosis_pct, timi_flow, ...extra });

/** Pre-dilation balloon. ASSUMPTION: unspecified "pre-dil" balloons are semi-compliant, as in PCI-2026-001. */
const preDil = (d: number, l: number, atm: number): SeedDevice => ({
  phase: "pre_dilation", category: "balloon_sc", product_name: "Semi-compliant balloon", diameter_mm: d, length_mm: l, inflation_atm: atm,
});
const stent = (product_name: string, d: number, l: number, atm: number, lot_number: string): SeedDevice => ({
  phase: "deployment", category: "stent", product_name, diameter_mm: d, length_mm: l, inflation_atm: atm, lot_number,
});
const ncPost = (d: number, l: number, atm: number): SeedDevice => ({
  phase: "post_dilation", category: "balloon_nc", product_name: "Non-compliant balloon", diameter_mm: d, length_mm: l, inflation_atm: atm,
});

/** The standard DES sequence in cases 002–017: pre-dil → DES → NC post-dil, residual <10%, TIMI III. */
const desPci = (
  vessel_index: number,
  pre: [number, number, number],
  des: [string, number, number, number, string],
  post: [number, number, number],
): SeedIntervention => ({
  vessel_index,
  intervention_type: "pci_des",
  guidewire: WIRE_NOT_RECORDED,
  residual_stenosis_pct: 5,
  timi_flow_post: 3,
  success: true,
  devices: [preDil(...pre), stent(...des), ncPost(...post)],
});

const mg = (drug_name: string, dose: number, frequency: Enums["dose_frequency"], extra: Partial<SeedMedication> = {}): SeedMedication => ({
  drug_name, dose, dose_unit: "mg", frequency, ...extra,
});

/** Aspirin + P2Y12. The planned DAPT duration goes on the P2Y12 row (aspirin usually continues beyond it). */
const dapt = (p2y12: "Ticagrelor" | "Clopidogrel", duration: string): SeedMedication[] => [
  mg("Aspirin", 75, "od", { is_dapt: true }),
  p2y12 === "Ticagrelor"
    ? mg("Ticagrelor", 90, "bd", { is_dapt: true, duration })
    : mg("Clopidogrel", 75, "od", { is_dapt: true, duration }),
];

/** Owner correction 2026-10-15: GTN stored as sublingual PRN with no dose. */
const gtnPrn = (): SeedMedication => ({
  drug_name: "GTN", dose: null, dose_unit: null, frequency: "prn", route: "sublingual", purpose: "angina relief",
});

const NORMAL_LM = v("lmca", null, 0, 3);

// ─── The 20 cases ──────────────────────────────────────────────────────────────

const CASES: SeedCase[] = [
  // PCI-2026-001 — reference case, spec §4.
  {
    case_code: "PCI-2026-001",
    patient: { mrn: "SYN-MRN-0001", full_name: "Synthetic Patient 001", sex: "male", date_of_birth: "1968-02-11" },
    risk_factors: [
      { factor: "hypertension", detail: "10 years" },
      { factor: "diabetes_t2", detail: "8 years" },
      { factor: "dyslipidaemia" },
      { factor: "smoking", detail: "20 pack-years" },
    ],
    operator: ARJUN,
    procedure: {
      procedure_date: "2026-09-01",
      procedure_type: "angiography_and_pci",
      indication: "nstemi",
      presentation_notes:
        "Central chest pain radiating to the left arm for 2 days, worsening over the preceding 6 hours, associated with sweating and breathlessness.",
      ecg_findings: "ST depression V4–V6",
      troponin_elevated: true,
      access_site: "right_radial",
      sheath_size_fr: 6,
      diagnostic_catheters: ["5F TIG"],
      guiding_catheter: "6F EBU 3.5",
      contrast_volume_ml: 110,
      procedure_duration_min: 55,
      fluoroscopy_time_min: 12.5,
      haemostasis_method: "radial_compression_band",
      outcome_summary:
        "Successful transradial PCI to proximal LAD with a single drug-eluting stent (3.5 × 28 mm). Final TIMI III flow with 0% residual stenosis. No procedural complications.",
    },
    vessels: [NORMAL_LM, v("lad", "proximal", 90, 2, { is_culprit: true }), v("lcx", "mid", 40, 3), v("rca", "proximal", 30, 3)],
    interventions: [
      {
        vessel_index: 1,
        intervention_type: "pci_des",
        guidewire: "BMW Universal II 0.014",
        residual_stenosis_pct: 0,
        timi_flow_post: 3,
        success: true,
        devices: [
          preDil(2.5, 15, 12),
          stent("Xience Skypoint DES", 3.5, 28, 14, "SYN-XSP-260184"),
          ncPost(3.75, 12, 18),
        ],
      },
    ],
    complications: [],
    discharge: {
      length_of_stay_hours: 48,
      clinical_status: "Clinically stable",
      follow_up_after_days: 14,
      follow_up_clinic: OPD,
      advice: ["Strict DAPT adherence", "Smoking cessation", "Cardiac rehabilitation", "Heart-healthy diet", "Gradual return to physical activity"],
      red_flags: ["Recurrent chest pain", "Severe breathlessness", "Significant bleeding"],
      medications: [
        mg("Aspirin", 75, "od", { is_dapt: true }),
        mg("Ticagrelor", 90, "bd", { is_dapt: true }),
        mg("Atorvastatin", 80, "od"),
        mg("Metoprolol tartrate", 25, "bd"), // tablet BD is tartrate (owner, 0005)
        mg("Pantoprazole", 40, "od"),
      ],
    },
  },

  // PCI-2026-002 — NSTEMI
  {
    case_code: "PCI-2026-002",
    patient: { mrn: "SYN-MRN-0002", full_name: "Synthetic Patient 002", sex: "female", date_of_birth: "1962-03-12" },
    risk_factors: [{ factor: "hypertension" }, { factor: "diabetes_t2" }],
    operator: ARJUN,
    procedure: {
      procedure_date: "2026-09-03", procedure_type: "angiography_and_pci", indication: "nstemi",
      presentation_notes: "NSTEMI; chest pain 12 h, elevated troponin. History: hypertension, type 2 diabetes; no previous PCI.",
      troponin_elevated: true, access_site: "right_radial", sheath_size_fr: 6, diagnostic_catheters: [],
      contrast_volume_ml: 105, procedure_duration_min: 46, fluoroscopy_time_min: 9.8,
      haemostasis_method: "radial_compression_band",
      outcome_summary: "PCI to mid LAD with an everolimus DES (3.0 × 24 mm). Final LAD residual <10%, TIMI III. No complications.",
    },
    vessels: [NORMAL_LM, v("lad", "mid", 95, 2, { is_culprit: true }), v("lcx", "mid", 30, 3), v("rca", "proximal", 40, 3)],
    interventions: [desPci(1, [2.5, 15, 12], ["Everolimus DES", 3.0, 24, 14, "SYN-DES-260002"], [3.25, 12, 16])],
    complications: [],
    discharge: {
      length_of_stay_hours: 48, clinical_status: STATUS_NOT_RECORDED, follow_up_after_days: 14, follow_up_clinic: OPD,
      advice: ["Rehabilitation referral", "Access-site care", "DAPT adherence"],
      red_flags: [],
      medications: [...dapt("Ticagrelor", "12 months"), mg("Atorvastatin", 80, "od"), mg("Ramipril", 2.5, "od")],
    },
  },

  // PCI-2026-003 — NSTEMI, LAD deferred
  {
    case_code: "PCI-2026-003",
    patient: { mrn: "SYN-MRN-0003", full_name: "Synthetic Patient 003", sex: "male", date_of_birth: "1955-04-13" },
    risk_factors: [{ factor: "hypertension" }, { factor: "dyslipidaemia" }, { factor: "ex_smoker" }],
    operator: MEERA,
    procedure: {
      procedure_date: "2026-09-06", procedure_type: "angiography_and_pci", indication: "nstemi",
      presentation_notes: "NSTEMI; rest pain 6 h, elevated troponin. History: hypertension, dyslipidaemia, former smoker.",
      troponin_elevated: true, access_site: "right_radial", sheath_size_fr: 6, diagnostic_catheters: [],
      contrast_volume_ml: 125, procedure_duration_min: 52, fluoroscopy_time_min: 12.0,
      haemostasis_method: "radial_compression_band",
      outcome_summary:
        "PCI to proximal LCX with a zotarolimus DES (3.0 × 22 mm). Final LCX residual <10%, TIMI III. No complications. LAD deferred for staged assessment/revascularisation planning.",
    },
    vessels: [NORMAL_LM, v("lad", "proximal", 75, 3), v("lcx", "proximal", 90, 3, { is_culprit: true }), v("rca", "mid", 30, 3)],
    interventions: [desPci(2, [2.5, 15, 12], ["Zotarolimus DES", 3.0, 22, 14, "SYN-DES-260003"], [3.25, 12, 16])],
    complications: [],
    discharge: {
      length_of_stay_hours: 48, clinical_status: STATUS_NOT_RECORDED, follow_up_after_days: 7, follow_up_clinic: OPD,
      advice: ["Follow-up for LAD plan", "Rehabilitation referral"],
      red_flags: ["Recurrent chest pain"],
      medications: [...dapt("Ticagrelor", "12 months"), mg("Atorvastatin", 80, "od"), mg("Amlodipine", 5, "od")],
    },
  },

  // PCI-2026-004 — NSTEMI, two stents
  {
    case_code: "PCI-2026-004",
    patient: { mrn: "SYN-MRN-0004", full_name: "Synthetic Patient 004", sex: "male", date_of_birth: "1967-05-14" },
    // ASSUMPTION: "diabetes" without a type is recorded as diabetes_t2 (also 006, 008, 009, 010, 015, 019, 020).
    risk_factors: [{ factor: "diabetes_t2" }, { factor: "hypertension" }, { factor: "smoking" }],
    operator: ARJUN,
    procedure: {
      procedure_date: "2026-09-08", procedure_type: "angiography_and_pci", indication: "nstemi",
      presentation_notes: "NSTEMI; recurrent pain 24 h, elevated troponin. History: diabetes, hypertension, current smoker.",
      troponin_elevated: true, access_site: "right_radial", sheath_size_fr: 6, diagnostic_catheters: [],
      contrast_volume_ml: 165, procedure_duration_min: 74, fluoroscopy_time_min: 17.4,
      haemostasis_method: "radial_compression_band",
      outcome_summary:
        "PCI to proximal RCA (everolimus DES 3.5 × 24 mm) and mid LAD (everolimus DES 3.0 × 20 mm). Both treated lesions residual <10%, TIMI III. No complications.",
    },
    vessels: [NORMAL_LM, v("lad", "mid", 85, 3), v("lcx", null, 10, 3), v("rca", "proximal", 95, 2, { is_culprit: true })],
    interventions: [
      desPci(3, [2.5, 15, 12], ["Everolimus DES", 3.5, 24, 14, "SYN-DES-260004A"], [3.75, 12, 16]),
      desPci(1, [2.0, 15, 12], ["Everolimus DES", 3.0, 20, 14, "SYN-DES-260004B"], [3.25, 12, 16]),
    ],
    complications: [],
    discharge: {
      length_of_stay_hours: 72, clinical_status: STATUS_NOT_RECORDED, follow_up_after_days: 14, follow_up_clinic: OPD,
      advice: ["Smoking cessation", "Rehabilitation", "DAPT adherence"],
      red_flags: [],
      medications: [...dapt("Ticagrelor", "12 months"), mg("Atorvastatin", 80, "od"), mg("Ramipril", 2.5, "od")],
    },
  },

  // PCI-2026-005 — NSTEMI, femoral, access-site haematoma
  {
    case_code: "PCI-2026-005",
    patient: { mrn: "SYN-MRN-0005", full_name: "Synthetic Patient 005", sex: "female", date_of_birth: "1958-06-15" },
    risk_factors: [{ factor: "hypertension" }, { factor: "dyslipidaemia" }],
    operator: MEERA,
    procedure: {
      procedure_date: "2026-09-10", procedure_type: "angiography_and_pci", indication: "nstemi",
      presentation_notes:
        "NSTEMI; chest pain 10 h, elevated troponin. Radial access unsuitable on ultrasound. History: hypertension, dyslipidaemia; no anticoagulant use.",
      troponin_elevated: true, access_site: "right_femoral", sheath_size_fr: 6, diagnostic_catheters: [],
      contrast_volume_ml: 115, procedure_duration_min: 49, fluoroscopy_time_min: 10.6,
      // ASSUMPTION: haemostasis method not stated for this femoral case; recorded as "other".
      haemostasis_method: "other",
      outcome_summary:
        "PCI to mid RCA with a zotarolimus DES (3.0 × 26 mm) via right femoral access. Final RCA residual <10%, TIMI III. Groin haematoma after sheath removal, managed with compression and observation.",
    },
    vessels: [NORMAL_LM, v("lad", "mid", 40, 3), v("lcx", null, 0, 3), v("rca", "mid", 90, 2, { is_culprit: true })],
    interventions: [desPci(3, [2.5, 15, 10], ["Zotarolimus DES", 3.0, 26, 14, "SYN-DES-260005"], [3.25, 12, 16])],
    complications: [
      {
        complication: "access_site_haematoma",
        severity: "minor", // ASSUMPTION: severity not stated (Hb stable, managed conservatively).
        management:
          "3-cm groin haematoma after sheath removal; compression and observation; haemoglobin stable, ultrasound excluded pseudoaneurysm.",
        onset: "inpatient",
        onset_after_end_hours: 3,
        outcome: "Resolved with compression; no intervention",
      },
    ],
    discharge: {
      // Source gives two follow-ups: access-site review 1 week, cardiology 2 weeks. The cardiology one is the follow-up date.
      length_of_stay_hours: 72, clinical_status: STATUS_NOT_RECORDED, follow_up_after_days: 14, follow_up_clinic: OPD,
      advice: ["Access-site review at 1 week"],
      red_flags: ["Swelling", "Bleeding", "Recurrent chest pain"],
      medications: [...dapt("Ticagrelor", "12 months with bleeding review"), mg("Atorvastatin", 80, "od"), mg("Amlodipine", 5, "od")],
    },
  },

  // PCI-2026-006 — NSTEMI
  {
    case_code: "PCI-2026-006",
    patient: { mrn: "SYN-MRN-0006", full_name: "Synthetic Patient 006", sex: "male", date_of_birth: "1974-07-16" },
    risk_factors: [{ factor: "diabetes_t2" }, { factor: "dyslipidaemia" }, { factor: "family_history", detail: "premature coronary disease" }],
    operator: ARJUN,
    procedure: {
      procedure_date: "2026-09-12", procedure_type: "angiography_and_pci", indication: "nstemi",
      presentation_notes:
        "NSTEMI; chest pain 8 h, elevated troponin. History: diabetes, dyslipidaemia; family history of premature coronary disease.",
      troponin_elevated: true, access_site: "left_radial", sheath_size_fr: 6, diagnostic_catheters: [],
      contrast_volume_ml: 95, procedure_duration_min: 41, fluoroscopy_time_min: 8.7,
      haemostasis_method: "radial_compression_band",
      outcome_summary: "PCI to mid LCX with an everolimus DES (2.75 × 24 mm). Final LCX residual <10%, TIMI III. No complications.",
    },
    vessels: [NORMAL_LM, v("lad", null, 10, 3), v("rca", "proximal", 20, 3), v("lcx", "mid", 95, 2, { is_culprit: true })],
    interventions: [desPci(3, [2.0, 15, 12], ["Everolimus DES", 2.75, 24, 14, "SYN-DES-260006"], [3.0, 12, 16])],
    complications: [],
    discharge: {
      length_of_stay_hours: 48, clinical_status: STATUS_NOT_RECORDED, follow_up_after_days: 14, follow_up_clinic: OPD,
      advice: ["Diabetes review", "Rehabilitation referral", "DAPT adherence"],
      red_flags: [],
      medications: [...dapt("Ticagrelor", "12 months"), mg("Atorvastatin", 80, "od")],
    },
  },

  // PCI-2026-007 — NSTEMI
  {
    case_code: "PCI-2026-007",
    patient: { mrn: "SYN-MRN-0007", full_name: "Synthetic Patient 007", sex: "male", date_of_birth: "1950-08-17" },
    risk_factors: [{ factor: "hypertension" }, { factor: "ex_smoker" }],
    operator: MEERA,
    procedure: {
      procedure_date: "2026-09-15", procedure_type: "angiography_and_pci", indication: "nstemi",
      presentation_notes:
        "NSTEMI; intermittent pain 18 h, elevated troponin. History: hypertension, former smoker; independent baseline function.",
      troponin_elevated: true, access_site: "right_radial", sheath_size_fr: 6, diagnostic_catheters: [],
      contrast_volume_ml: 90, procedure_duration_min: 43, fluoroscopy_time_min: 9.1,
      haemostasis_method: "radial_compression_band",
      outcome_summary: "PCI to distal RCA with a zotarolimus DES (2.75 × 22 mm). Final RCA residual <10%, TIMI III. No complications.",
    },
    vessels: [NORMAL_LM, v("lad", "proximal", 30, 3), v("lcx", "mid", 40, 3), v("rca", "distal", 90, 2, { is_culprit: true })],
    interventions: [desPci(3, [2.0, 12, 10], ["Zotarolimus DES", 2.75, 22, 14, "SYN-DES-260007"], [3.0, 12, 16])],
    complications: [],
    discharge: {
      length_of_stay_hours: 48, clinical_status: STATUS_NOT_RECORDED, follow_up_after_days: 14, follow_up_clinic: OPD,
      advice: ["Rehabilitation referral", "Bleeding precautions", "Access-site care"],
      red_flags: [],
      medications: [...dapt("Ticagrelor", "12 months with bleeding reassessment"), mg("Atorvastatin", 80, "od"), mg("Amlodipine", 5, "od")],
    },
  },

  // PCI-2026-008 — inferior STEMI, primary PCI
  {
    case_code: "PCI-2026-008",
    patient: { mrn: "SYN-MRN-0008", full_name: "Synthetic Patient 008", sex: "male", date_of_birth: "1964-01-18" },
    risk_factors: [{ factor: "smoking" }, { factor: "dyslipidaemia" }],
    operator: ARJUN,
    procedure: {
      procedure_date: "2026-09-17", procedure_type: "angiography_and_pci", indication: "stemi",
      presentation_notes: "Inferior STEMI; symptom onset 2 h. History: current smoker, dyslipidaemia; haemodynamically stable.",
      access_site: "right_radial", sheath_size_fr: 6, diagnostic_catheters: [],
      contrast_volume_ml: 120, procedure_duration_min: 44, fluoroscopy_time_min: 9.5, lvef_pct: 50,
      haemostasis_method: "radial_compression_band",
      outcome_summary:
        "Primary PCI to mid RCA with a zotarolimus DES (3.5 × 26 mm) after wire crossing of a thrombotic occlusion. Final RCA residual <10%, TIMI III. No complications.",
    },
    vessels: [
      NORMAL_LM, v("lad", "mid", 30, 3), v("lcx", null, 0, 3),
      v("rca", "mid", 100, 0, { is_culprit: true, lesion_notes: "Thrombotic occlusion" }),
    ],
    interventions: [desPci(3, [2.0, 15, 10], ["Zotarolimus DES", 3.5, 26, 14, "SYN-DES-260008"], [3.75, 12, 16])],
    complications: [],
    discharge: {
      length_of_stay_hours: 72, clinical_status: STATUS_NOT_RECORDED, follow_up_after_days: 14, follow_up_clinic: OPD,
      advice: ["Smoking cessation", "Rehabilitation"],
      red_flags: ["Recurrent chest pain — seek urgent care"],
      medications: [...dapt("Ticagrelor", "12 months"), mg("Atorvastatin", 80, "od")],
    },
  },

  // PCI-2026-009 — anterior STEMI, primary PCI
  {
    case_code: "PCI-2026-009",
    patient: { mrn: "SYN-MRN-0009", full_name: "Synthetic Patient 009", sex: "female", date_of_birth: "1971-02-19" },
    risk_factors: [{ factor: "diabetes_t2" }, { factor: "hypertension" }],
    operator: MEERA,
    procedure: {
      procedure_date: "2026-09-19", procedure_type: "angiography_and_pci", indication: "stemi",
      presentation_notes: "Anterior STEMI; symptom onset 3 h. History: diabetes, hypertension.",
      access_site: "right_radial", sheath_size_fr: 6, diagnostic_catheters: [],
      contrast_volume_ml: 130, procedure_duration_min: 51, fluoroscopy_time_min: 11.3, lvef_pct: 45,
      haemostasis_method: "radial_compression_band",
      outcome_summary:
        "Primary PCI to proximal LAD with an everolimus DES (3.5 × 28 mm). Final LAD residual <10%, TIMI III. No complications; no clinical heart failure.",
    },
    vessels: [
      NORMAL_LM, v("lad", "proximal", 100, 0, { is_culprit: true, lesion_notes: "Thrombotic occlusion" }),
      v("lcx", "mid", 30, 3), v("rca", "mid", 40, 3),
    ],
    interventions: [desPci(1, [2.5, 15, 12], ["Everolimus DES", 3.5, 28, 14, "SYN-DES-260009"], [3.75, 12, 16])],
    complications: [],
    discharge: {
      length_of_stay_hours: 96, clinical_status: STATUS_NOT_RECORDED, follow_up_after_days: 14, follow_up_clinic: OPD,
      advice: ["Rehabilitation referral", "Medication review", "Repeat echocardiogram at 8–12 weeks"],
      red_flags: [],
      medications: [
        ...dapt("Ticagrelor", "12 months"), mg("Atorvastatin", 80, "od"), mg("Ramipril", 2.5, "od"), mg("Bisoprolol", 2.5, "od"),
      ],
    },
  },

  // PCI-2026-010 — inferior STEMI, primary PCI with no-reflow
  {
    case_code: "PCI-2026-010",
    patient: { mrn: "SYN-MRN-0010", full_name: "Synthetic Patient 010", sex: "male", date_of_birth: "1959-03-20" },
    risk_factors: [{ factor: "diabetes_t2" }, { factor: "smoking" }],
    operator: ARJUN,
    procedure: {
      procedure_date: "2026-09-21", procedure_type: "angiography_and_pci", indication: "stemi",
      presentation_notes: "Inferior STEMI; symptom onset 5 h. History: diabetes, current smoker.",
      access_site: "right_radial", sheath_size_fr: 6, diagnostic_catheters: [],
      contrast_volume_ml: 150, procedure_duration_min: 65, fluoroscopy_time_min: 15.2, lvef_pct: 45,
      haemostasis_method: "radial_compression_band",
      outcome_summary:
        "Primary PCI to proximal RCA with an everolimus DES (3.5 × 28 mm). Transient no-reflow treated with intracoronary vasodilator; TIMI III restored. Final residual <10%.",
    },
    vessels: [
      // Culprit set by owner correction 2026-10-15 (source line did not mark it).
      NORMAL_LM, v("lad", "mid", 40, 3), v("lcx", "mid", 30, 3),
      v("rca", "proximal", 100, 0, { is_culprit: true, lesion_notes: "Thrombotic occlusion" }),
    ],
    interventions: [desPci(3, [2.0, 15, 10], ["Everolimus DES", 3.5, 28, 14, "SYN-DES-260010"], [3.75, 12, 16])],
    complications: [
      {
        complication: "no_reflow",
        severity: "minor", // ASSUMPTION: severity not stated (transient, resolved with treatment).
        management: "Transient no-reflow, TIMI I; dissection excluded; intracoronary vasodilator treatment restored TIMI III.",
        onset: "intraprocedural",
        outcome: "Resolved, TIMI III restored",
      },
    ],
    discharge: {
      length_of_stay_hours: 96, clinical_status: STATUS_NOT_RECORDED, follow_up_after_days: 7, follow_up_clinic: OPD,
      advice: ["Rehabilitation referral", "Smoking cessation"],
      red_flags: ["Recurrent chest pain"],
      medications: [
        ...dapt("Ticagrelor", "12 months"), mg("Atorvastatin", 80, "od"), mg("Ramipril", 2.5, "od"), mg("Bisoprolol", 2.5, "od"),
      ],
    },
  },

  // PCI-2026-011 — lateral STEMI, primary PCI
  {
    case_code: "PCI-2026-011",
    patient: { mrn: "SYN-MRN-0011", full_name: "Synthetic Patient 011", sex: "male", date_of_birth: "1978-04-21" },
    risk_factors: [{ factor: "smoking" }, { factor: "family_history", detail: "premature coronary disease" }],
    operator: MEERA,
    procedure: {
      procedure_date: "2026-09-24", procedure_type: "angiography_and_pci", indication: "stemi",
      presentation_notes:
        "Lateral STEMI; symptom onset 90 min. History: current smoker; family history of premature coronary disease.",
      access_site: "right_radial", sheath_size_fr: 6, diagnostic_catheters: [],
      contrast_volume_ml: 105, procedure_duration_min: 39, fluoroscopy_time_min: 8.2, lvef_pct: 55,
      haemostasis_method: "radial_compression_band",
      outcome_summary:
        "Primary PCI to proximal LCX with a zotarolimus DES (3.0 × 22 mm). Final LCX residual <10%, TIMI III. No complications.",
    },
    vessels: [NORMAL_LM, v("lad", null, 0, 3), v("rca", null, 10, 3), v("lcx", "proximal", 100, 0, { is_culprit: true })],
    interventions: [desPci(3, [2.0, 12, 10], ["Zotarolimus DES", 3.0, 22, 14, "SYN-DES-260011"], [3.25, 12, 16])],
    complications: [],
    discharge: {
      length_of_stay_hours: 72, clinical_status: STATUS_NOT_RECORDED, follow_up_after_days: 14, follow_up_clinic: OPD,
      advice: ["Rehabilitation", "Smoking cessation", "DAPT adherence"],
      red_flags: [],
      medications: [...dapt("Ticagrelor", "12 months"), mg("Atorvastatin", 80, "od")],
    },
  },

  // PCI-2026-012 — anterior STEMI, femoral
  {
    case_code: "PCI-2026-012",
    patient: { mrn: "SYN-MRN-0012", full_name: "Synthetic Patient 012", sex: "female", date_of_birth: "1953-05-22" },
    risk_factors: [{ factor: "hypertension" }, { factor: "dyslipidaemia" }],
    operator: ARJUN,
    procedure: {
      procedure_date: "2026-09-26", procedure_type: "angiography_and_pci", indication: "stemi",
      presentation_notes:
        "Anterior STEMI; symptom onset 4 h. Radial access unsuitable on ultrasound. History: hypertension, dyslipidaemia.",
      access_site: "right_femoral", sheath_size_fr: 6, diagnostic_catheters: [],
      contrast_volume_ml: 135, procedure_duration_min: 54, fluoroscopy_time_min: 12.1, lvef_pct: 45,
      haemostasis_method: "manual_compression",
      outcome_summary:
        "Primary PCI to mid LAD with an everolimus DES (3.0 × 28 mm). Final LAD residual <10%, TIMI III. No complications. Staged LCX assessment planned.",
    },
    vessels: [NORMAL_LM, v("lad", "mid", 100, 0, { is_culprit: true }), v("lcx", "proximal", 75, 3), v("rca", "mid", 30, 3)],
    interventions: [desPci(1, [2.0, 15, 10], ["Everolimus DES", 3.0, 28, 14, "SYN-DES-260012"], [3.25, 12, 16])],
    complications: [],
    discharge: {
      length_of_stay_hours: 96, clinical_status: STATUS_NOT_RECORDED, follow_up_after_days: 7, follow_up_clinic: OPD,
      advice: ["Follow-up to arrange LCX management", "Groin care", "Rehabilitation", "DAPT adherence"],
      red_flags: [],
      medications: [
        ...dapt("Ticagrelor", "12 months"), mg("Atorvastatin", 80, "od"), mg("Ramipril", 2.5, "od"), mg("Bisoprolol", 2.5, "od"),
      ],
    },
  },

  // PCI-2026-013 — stable angina
  {
    case_code: "PCI-2026-013",
    patient: { mrn: "SYN-MRN-0013", full_name: "Synthetic Patient 013", sex: "male", date_of_birth: "1965-06-23" },
    risk_factors: [{ factor: "hypertension" }, { factor: "dyslipidaemia" }],
    operator: MEERA,
    procedure: {
      procedure_date: "2026-09-28", procedure_type: "angiography_and_pci", indication: "stable_angina",
      presentation_notes:
        "Stable exertional angina despite medical therapy; anterior ischaemia on stress imaging. History: hypertension, dyslipidaemia.",
      access_site: "right_radial", sheath_size_fr: 6, diagnostic_catheters: [],
      contrast_volume_ml: 85, procedure_duration_min: 38, fluoroscopy_time_min: 7.6,
      haemostasis_method: "radial_compression_band",
      outcome_summary: "PCI to proximal LAD with an everolimus DES (3.5 × 20 mm). Final LAD residual <10%, TIMI III. No complications.",
    },
    vessels: [NORMAL_LM, v("lad", "proximal", 85, 3), v("lcx", "mid", 20, 3), v("rca", null, 0, 3)],
    interventions: [desPci(1, [2.5, 15, 12], ["Everolimus DES", 3.5, 20, 14, "SYN-DES-260013"], [3.75, 12, 16])],
    complications: [],
    discharge: {
      length_of_stay_hours: 24, clinical_status: STATUS_NOT_RECORDED, follow_up_after_days: 28, follow_up_clinic: OPD,
      advice: ["Exercise guidance", "DAPT adherence"],
      red_flags: ["Recurrent chest pain"],
      medications: [...dapt("Clopidogrel", "6 months"), mg("Atorvastatin", 40, "od"), mg("Amlodipine", 5, "od"), gtnPrn()],
    },
  },

  // PCI-2026-014 — stable angina, two stents
  {
    case_code: "PCI-2026-014",
    patient: { mrn: "SYN-MRN-0014", full_name: "Synthetic Patient 014", sex: "female", date_of_birth: "1960-07-24" },
    risk_factors: [{ factor: "hypertension" }, { factor: "dyslipidaemia" }],
    operator: ARJUN,
    procedure: {
      procedure_date: "2026-09-30", procedure_type: "angiography_and_pci", indication: "stable_angina",
      presentation_notes:
        "Stable angina despite medical therapy; inferior and lateral ischaemia. History: hypertension, dyslipidaemia; preserved LV function.",
      access_site: "right_radial", sheath_size_fr: 6, diagnostic_catheters: [],
      contrast_volume_ml: 155, procedure_duration_min: 69, fluoroscopy_time_min: 16.1,
      haemostasis_method: "radial_compression_band",
      outcome_summary:
        "PCI to mid LCX (zotarolimus DES 2.75 × 22 mm) and mid RCA (zotarolimus DES 3.5 × 26 mm). Both residual <10%, TIMI III. No complications.",
    },
    vessels: [NORMAL_LM, v("lad", "mid", 30, 3), v("lcx", "mid", 85, 3), v("rca", "mid", 90, 3)],
    interventions: [
      desPci(2, [2.0, 15, 12], ["Zotarolimus DES", 2.75, 22, 14, "SYN-DES-260014A"], [3.0, 12, 16]),
      desPci(3, [2.5, 15, 12], ["Zotarolimus DES", 3.5, 26, 14, "SYN-DES-260014B"], [3.75, 12, 16]),
    ],
    complications: [],
    discharge: {
      length_of_stay_hours: 24, clinical_status: STATUS_NOT_RECORDED, follow_up_after_days: 28, follow_up_clinic: OPD,
      advice: ["DAPT adherence", "Access-site care", "Activity advice"],
      red_flags: [],
      medications: [...dapt("Clopidogrel", "6 months"), mg("Atorvastatin", 40, "od"), mg("Amlodipine", 5, "od"), gtnPrn()],
    },
  },

  // PCI-2026-015 — stable angina, in-stent restenosis, drug-coated balloon
  {
    case_code: "PCI-2026-015",
    patient: { mrn: "SYN-MRN-0015", full_name: "Synthetic Patient 015", sex: "male", date_of_birth: "1963-08-10" },
    risk_factors: [{ factor: "diabetes_t2" }, { factor: "hypertension" }, { factor: "prior_pci", detail: "RCA DES 3 years ago" }],
    operator: MEERA,
    procedure: {
      procedure_date: "2026-10-03", procedure_type: "angiography_and_pci", indication: "stable_angina",
      presentation_notes:
        "Recurrent stable angina; prior RCA DES 3 years ago; inferior ischaemia. History: diabetes, hypertension; symptoms despite medical therapy.",
      access_site: "right_radial", sheath_size_fr: 6, diagnostic_catheters: [],
      contrast_volume_ml: 100, procedure_duration_min: 48, fluoroscopy_time_min: 11.0,
      haemostasis_method: "radial_compression_band",
      outcome_summary:
        "Drug-coated balloon angioplasty to mid RCA in-stent restenosis after IVUS-guided scoring balloon preparation; no new stent. Final residual 20%, TIMI III. No complications.",
    },
    vessels: [NORMAL_LM, v("lad", "mid", 30, 3), v("lcx", null, 0, 3), v("rca", "mid", 80, 3, { lesion_notes: "Focal in-stent restenosis" })],
    interventions: [
      {
        vessel_index: 3,
        intervention_type: "drug_coated_balloon",
        guidewire: WIRE_NOT_RECORDED,
        residual_stenosis_pct: 20,
        timi_flow_post: 3,
        success: true,
        notes:
          "IVUS: neointimal restenosis without significant underexpansion. Scoring balloon: residual 20%, no dissection. Paclitaxel-coated balloon inflated for 60 s; no new stent.",
        devices: [
          { phase: "pre_dilation", category: "balloon_scoring", product_name: "Scoring balloon", diameter_mm: 3.0, length_mm: 15, inflation_atm: 14 },
          {
            phase: "deployment", category: "balloon_dcb", product_name: "Paclitaxel-coated balloon",
            diameter_mm: 3.0, length_mm: 20, inflation_atm: 8, lot_number: "SYN-DCB-260015",
          },
        ],
      },
    ],
    complications: [],
    discharge: {
      length_of_stay_hours: 24, clinical_status: STATUS_NOT_RECORDED, follow_up_after_days: 28, follow_up_clinic: OPD,
      advice: ["Follow-up before antiplatelet change", "Diabetes review"],
      red_flags: ["Recurrent chest pain"],
      medications: [
        ...dapt("Clopidogrel", "1 month — operator-documented plan pending review"), mg("Atorvastatin", 40, "od"), mg("Amlodipine", 5, "od"),
      ],
    },
  },

  // PCI-2026-016 — stable angina
  {
    case_code: "PCI-2026-016",
    patient: { mrn: "SYN-MRN-0016", full_name: "Synthetic Patient 016", sex: "female", date_of_birth: "1969-01-11" },
    risk_factors: [{ factor: "dyslipidaemia" }],
    operator: ARJUN,
    procedure: {
      procedure_date: "2026-10-05", procedure_type: "angiography_and_pci", indication: "stable_angina",
      presentation_notes:
        "Stable exertional angina despite medical therapy; inferior ischaemia. History: dyslipidaemia; no previous PCI.",
      access_site: "left_radial", sheath_size_fr: 6, diagnostic_catheters: [],
      contrast_volume_ml: 80, procedure_duration_min: 35, fluoroscopy_time_min: 7.2,
      haemostasis_method: "radial_compression_band",
      outcome_summary: "PCI to proximal RCA with an everolimus DES (3.0 × 20 mm). Final RCA residual <10%, TIMI III. No complications.",
    },
    vessels: [NORMAL_LM, v("lad", null, 0, 3), v("lcx", null, 10, 3), v("rca", "proximal", 85, 3)],
    interventions: [desPci(3, [2.5, 15, 12], ["Everolimus DES", 3.0, 20, 14, "SYN-DES-260016"], [3.25, 12, 16])],
    complications: [],
    discharge: {
      length_of_stay_hours: 24, clinical_status: STATUS_NOT_RECORDED, follow_up_after_days: 28, follow_up_clinic: OPD,
      advice: ["Activity advice", "Access-site care", "DAPT adherence"],
      red_flags: [],
      medications: [...dapt("Clopidogrel", "6 months"), mg("Atorvastatin", 40, "od"), mg("Amlodipine", 5, "od"), gtnPrn()],
    },
  },

  // PCI-2026-017 — unstable angina
  {
    case_code: "PCI-2026-017",
    patient: { mrn: "SYN-MRN-0017", full_name: "Synthetic Patient 017", sex: "male", date_of_birth: "1966-02-12" },
    risk_factors: [{ factor: "hypertension" }, { factor: "dyslipidaemia" }, { factor: "ex_smoker" }],
    operator: MEERA,
    procedure: {
      procedure_date: "2026-10-07", procedure_type: "angiography_and_pci", indication: "unstable_angina",
      presentation_notes:
        "Crescendo angina with rest pain and transient ST depression; serial troponins negative. History: hypertension, dyslipidaemia, former smoker.",
      ecg_findings: "Transient ST depression",
      troponin_elevated: false,
      access_site: "right_radial", sheath_size_fr: 6, diagnostic_catheters: [],
      contrast_volume_ml: 95, procedure_duration_min: 42, fluoroscopy_time_min: 8.9,
      haemostasis_method: "radial_compression_band",
      outcome_summary: "PCI to proximal LAD with a zotarolimus DES (3.5 × 22 mm). Final LAD residual <10%, TIMI III. No complications.",
    },
    // Culprit set by owner correction 2026-10-15: the only lesion treated.
    vessels: [NORMAL_LM, v("lad", "proximal", 90, 3, { is_culprit: true }), v("lcx", "mid", 30, 3), v("rca", "mid", 40, 3)],
    interventions: [desPci(1, [2.5, 15, 12], ["Zotarolimus DES", 3.5, 22, 14, "SYN-DES-260017"], [3.75, 12, 16])],
    complications: [],
    discharge: {
      length_of_stay_hours: 48, clinical_status: STATUS_NOT_RECORDED, follow_up_after_days: 14, follow_up_clinic: OPD,
      advice: ["Rehabilitation referral", "DAPT adherence"],
      red_flags: ["Recurrent chest pain"],
      medications: [...dapt("Ticagrelor", "12 months"), mg("Atorvastatin", 80, "od"), mg("Amlodipine", 5, "od")],
    },
  },

  // CAG-2026-018 — diagnostic-only, normal coronaries
  {
    case_code: "CAG-2026-018",
    patient: { mrn: "SYN-MRN-0018", full_name: "Synthetic Patient 018", sex: "female", date_of_birth: "1980-03-13" },
    risk_factors: [{ factor: "hypertension" }],
    operator: ARJUN,
    procedure: {
      procedure_date: "2026-10-09", procedure_type: "diagnostic_angiography",
      indication: "positive_stress_test", // ASSUMPTION: "abnormal stress test" read as positive_stress_test.
      presentation_notes:
        "Persistent exertional chest discomfort; abnormal stress test. History: hypertension; no diabetes or smoking history.",
      access_site: "right_radial", sheath_size_fr: 5, diagnostic_catheters: [],
      contrast_volume_ml: 45, procedure_duration_min: 22, fluoroscopy_time_min: 3.5,
      haemostasis_method: "radial_compression_band",
      outcome_summary:
        "Diagnostic coronary angiography only: no angiographic stenosis in LM, LAD, LCX or RCA; TIMI III throughout. No balloon or stent. No antiplatelet initiated solely for angiography.",
    },
    vessels: [NORMAL_LM, v("lad", null, 0, 3), v("lcx", null, 0, 3), v("rca", null, 0, 3)],
    interventions: [],
    complications: [],
    discharge: {
      length_of_stay_hours: 6, clinical_status: STATUS_NOT_RECORDED, follow_up_after_days: 28, follow_up_clinic: OPD,
      advice: ["Assess persistent symptoms for microvascular/vasospastic or non-cardiac causes", "Access-site care"],
      red_flags: [],
      medications: [mg("Amlodipine", 5, "od", { duration: "Continue" })],
    },
  },

  // CAG-2026-019 — diagnostic-only, non-obstructive disease
  {
    case_code: "CAG-2026-019",
    patient: { mrn: "SYN-MRN-0019", full_name: "Synthetic Patient 019", sex: "male", date_of_birth: "1968-04-14" },
    risk_factors: [{ factor: "diabetes_t2" }, { factor: "dyslipidaemia" }, { factor: "ex_smoker" }],
    operator: MEERA,
    procedure: {
      procedure_date: "2026-10-12", procedure_type: "diagnostic_angiography",
      indication: "stable_angina", // ASSUMPTION: equivocal (not positive) stress imaging, so stable_angina.
      presentation_notes: "Exertional chest discomfort; equivocal stress imaging. History: diabetes, dyslipidaemia, former smoker.",
      access_site: "right_radial", sheath_size_fr: 5, diagnostic_catheters: [],
      contrast_volume_ml: 55, procedure_duration_min: 25, fluoroscopy_time_min: 4.2,
      haemostasis_method: "radial_compression_band",
      outcome_summary:
        "Diagnostic coronary angiography only; non-obstructive disease, no flow-limiting epicardial lesion identified; no balloon or stent. Aspirin after bleeding-risk review; no DAPT.",
    },
    vessels: [NORMAL_LM, v("lad", "proximal", 30, 3), v("lcx", "mid", 20, 3), v("rca", "mid", 40, 3)],
    interventions: [],
    complications: [],
    discharge: {
      length_of_stay_hours: 6, clinical_status: STATUS_NOT_RECORDED, follow_up_after_days: 28, follow_up_clinic: OPD,
      advice: ["Risk-factor optimisation", "Symptom reassessment", "Access-site care", "Continue established diabetes therapy"],
      red_flags: [],
      // Aspirin alone is not DAPT, so is_dapt stays false (source: "no DAPT").
      medications: [mg("Aspirin", 75, "od"), mg("Atorvastatin", 40, "od")],
    },
  },

  // CAG-2026-020 — diagnostic-only, left-main + three-vessel disease, referred for CABG, still admitted
  {
    case_code: "CAG-2026-020",
    patient: { mrn: "SYN-MRN-0020", full_name: "Synthetic Patient 020", sex: "male", date_of_birth: "1957-05-15" },
    risk_factors: [{ factor: "diabetes_t2" }, { factor: "hypertension" }, { factor: "dyslipidaemia" }],
    operator: ARJUN,
    procedure: {
      procedure_date: "2026-10-14", procedure_type: "diagnostic_angiography", indication: "stable_angina",
      presentation_notes:
        "Stable limiting angina despite medical therapy; extensive inducible ischaemia. History: diabetes, hypertension, dyslipidaemia.",
      access_site: "right_radial", sheath_size_fr: 5, diagnostic_catheters: [],
      contrast_volume_ml: 70, procedure_duration_min: 31, fluoroscopy_time_min: 6.0, lvef_pct: 50,
      haemostasis_method: "radial_compression_band",
      outcome_summary:
        "Left-main and three-vessel disease; complex anatomy discussed with Heart Team; CABG recommended — referred for CABG. No balloon or stent. Remains admitted for surgical evaluation; cardiac surgical review next day; patient counselled about findings.",
    },
    vessels: [v("lmca", "distal", 60, 3), v("lad", "proximal", 90, 3), v("lcx", "proximal", 80, 3), v("rca", "mid", 85, 3)],
    interventions: [],
    complications: [],
    immediate_care_notes: "Awaiting cardiac surgical review",
    communication_notes: "Heart Team discussion; CABG recommended; patient and family counselled",
    // Remains admitted: no discharge row. NOT STORED: inpatient medications (aspirin 75 OD, atorvastatin
    // 80 OD, bisoprolol 2.5 OD, isosorbide mononitrate 30 OD) — the schema only holds discharge medications.
    discharge: null,
  },
];

// ─── Derived and authored fields (0005–0007) ──────────────────────────────────
//
// Two kinds of value are added below to every case:
//  * DERIVED by the owner's rules (2026-10-15): urgency, admission time, discharge time, review,
//    consent/time-out, access technique, procedure medications, immediate outcome, communication,
//    DAPT plan, balloon lot numbers, LVEF/LVEDP status.
//  * AUTHORED synthetic values that are not in the case files at all: labs, haemodynamics,
//    radiation, coronary dominance, LVEDP values, start times. These are deliberately invented
//    for a synthetic demo and are marked ASSUMPTION.

const IST_OFFSET_MIN = 330;
const at = (date: string, hh: number, mm = 0) =>
  new Date(`${date}T${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:00+05:30`);
const plusMin = (d: Date, min: number) => new Date(d.getTime() + min * 60_000);
const istDate = (d: Date) => new Date(d.getTime() + IST_OFFSET_MIN * 60_000).toISOString().slice(0, 10);

const caseNo = (c: SeedCase) => Number(c.case_code.slice(-3));
type Acuity = "stemi" | "urgent" | "elective";
const acuity = (c: SeedCase): Acuity =>
  c.procedure.indication === "stemi" ? "stemi"
  : c.procedure.indication === "nstemi" || c.procedure.indication === "unstable_angina" ? "urgent"
  : "elective";
const isPci = (c: SeedCase) => c.procedure.procedure_type !== "diagnostic_angiography";
const isFemoral = (c: SeedCase) => c.procedure.access_site.endsWith("femoral");

function ageOn(dob: string, on: string) {
  const [by, bm, bd] = dob.split("-").map(Number);
  const [y, m, d] = on.split("-").map(Number);
  return y - by - (m < bm || (m === bm && d < bd) ? 1 : 0);
}

function timeline(c: SeedCase) {
  const D = c.procedure.procedure_date;
  const a = acuity(c);
  // Owner rule: 08:00 IST on the procedure date, minus 4 h (STEMI) or 1 day (NSTEMI/unstable).
  const admitted = a === "stemi" ? at(D, 4) : a === "urgent" ? at(addDays(D, -1), 8) : at(D, 8);
  // ASSUMPTION: start times are not in the case files — STEMI 75 min after arrival, others 10:00 IST.
  const started = a === "stemi" ? plusMin(admitted, 75) : at(D, 10);
  const ended = plusMin(started, c.procedure.procedure_duration_min);
  return { admitted, started, ended };
}

/**
 * Owner (2026-10-15): wards discharge at 10:00 IST on the day the stated stay lands — never at
 * 04:00. If 10:00 that day is earlier than the stated time (same-day cases: 14:00, after the
 * procedure), the stated time stands, since 10:00 would be before the procedure ended.
 */
function dischargeTime(c: SeedCase, t: ReturnType<typeof timeline>) {
  if (!c.discharge) return null;
  const lands = plusMin(t.admitted, c.discharge.length_of_stay_hours * 60);
  const tenAm = at(istDate(lands), 10);
  return tenAm > lands ? tenAm : lands;
}

/** ASSUMPTION: authored synthetic baseline, haemodynamics and radiation — plausible, not from the case files. */
function authored(c: SeedCase) {
  const n = caseNo(c);
  const j = (n * 37) % 11; // deterministic per-case variation, 0–10
  const male = c.patient.sex === "male";
  const diabetic = c.risk_factors.some((r) => r.factor === "diabetes_t2" || r.factor === "diabetes_t1");
  const age = ageOn(c.patient.date_of_birth, c.procedure.procedure_date);
  const a = acuity(c);
  const [sys, dia, hr] =
    a === "stemi" ? [116 + j, 72 + (j % 5), 86 + (j % 8)] : a === "urgent" ? [136 + j, 82 + (j % 6), 76 + (j % 7)] : [130 + j, 78 + (j % 6), 68 + (j % 8)];
  const LVEDP: Record<number, number> = { 8: 18, 9: 24, 10: 22, 11: 16, 12: 26 };
  return {
    allergies: "None known",
    creatinine_umol_l: (male ? 82 : 64) + j * 2 + (diabetic ? 12 : 0),
    egfr: Math.round((diabetic ? 70 : 88) - Math.max(0, age - 60) * 0.5 - j * 0.6), // diabetics slightly lower
    haemoglobin_g_dl: Math.round(((male ? 13.6 : 12.1) + j * 0.12) * 10) / 10,
    platelets_x10e9_l: 190 + j * 12,
    baseline_bp_systolic: sys,
    baseline_bp_diastolic: dia,
    baseline_heart_rate: hr,
    aortic_pressure_systolic: sys - 6,
    aortic_pressure_diastolic: dia - 4,
    lvedp_mmhg: a === "stemi" ? LVEDP[n] : null,
    // Owner: right 17, left 2, co-dominant 1. ASSUMPTION: which cases — the two LCX-culprit cases are left.
    dominance: (n === 6 || n === 11 ? "left" : n === 7 ? "co_dominant" : "right") as Enums["coronary_dominance"],
    contrast_agent: "Iohexol 350",
    // Scaled to fluoroscopy time.
    air_kerma_mgy: Math.round(c.procedure.fluoroscopy_time_min * 85),
    dap_gy_cm2: Math.round(c.procedure.fluoroscopy_time_min * 65) / 10,
  };
}

const VESSEL_UP: Record<Enums["vessel"], string> = {
  lmca: "LMCA", lad: "LAD", d1: "D1", d2: "D2", lcx: "LCX", om1: "OM1", om2: "OM2", ramus: "Ramus",
  rca: "RCA", pda: "PDA", plv: "PLV", graft: "graft", other: "other vessel",
};

/** Owner (0007 item 4): state untreated non-obstructive disease and that it is for medical management. */
function finalImpression(c: SeedCase) {
  if (!isPci(c)) return c.procedure.outcome_summary;
  const treated = new Set(c.interventions.map((i) => i.vessel_index));
  const mild = c.vessels.filter((v, i) => !treated.has(i) && v.stenosis_pct > 0 && v.stenosis_pct < 50);
  if (mild.length === 0) return c.procedure.outcome_summary;
  const items = mild.map(
    (v) => `${v.segment ? `${v.segment} ` : ""}${VESSEL_UP[v.vessel]} (${v.stenosis_pct === 10 ? "mild irregularities" : `${v.stenosis_pct}%`})`,
  );
  const list = items.length === 1 ? items[0] : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
  return `${c.procedure.outcome_summary} Non-obstructive disease in ${list} — for medical management.`;
}

/** Owner (0007 item 4 of the device round): fictional SYN- lot numbers on every balloon too. */
function withLots(c: SeedCase): SeedIntervention[] {
  const PREFIX: Partial<Record<Enums["device_category"], string>> = {
    balloon_sc: "SCB", balloon_nc: "NCB", balloon_scoring: "SCO", balloon_dcb: "DCB", guidewire: "GW", other: "DEV",
  };
  let k = 0;
  const nnn = c.case_code.slice(-3);
  return c.interventions.map((iv) => ({
    ...iv,
    devices: iv.devices.map((d) =>
      d.lot_number ? d : { ...d, lot_number: `SYN-${PREFIX[d.category] ?? "DEV"}-26${nnn}${String.fromCharCode(97 + k++)}` },
    ),
  }));
}

type ProcMed = {
  drug_name: string; dose: number | null; dose_unit: Enums["dose_unit"] | null; route: Enums["medication_route"];
  timing: Enums["medication_timing"]; act_seconds: number | null; notes: string | null;
  administered_at: string | null; act_measured_at: string | null;
};

function procedureMeds(c: SeedCase, t: ReturnType<typeof timeline>): ProcMed[] {
  const n = caseNo(c);
  const med = (m: Partial<ProcMed> & Pick<ProcMed, "drug_name" | "route" | "timing">): ProcMed => ({
    dose: null, dose_unit: null, act_seconds: null, notes: null, administered_at: null, act_measured_at: null, ...m,
  });
  const out: ProcMed[] = [];
  if (isPci(c)) {
    const loadAt = plusMin(t.admitted, 30).toISOString();
    const p2y12 = c.discharge?.medications.find((m) => /ticagrelor|clopidogrel|prasugrel/i.test(m.drug_name))?.drug_name;
    const LOAD: Record<string, number> = { Ticagrelor: 180, Clopidogrel: 600, Prasugrel: 60 };
    if (p2y12) {
      out.push(med({ drug_name: p2y12, dose: LOAD[p2y12], dose_unit: "mg", route: "oral", timing: "pre_procedure", notes: "Loading dose", administered_at: loadAt }));
    }
    // ASSUMPTION (owner 3a): aspirin load for every PCI case except 015, taken as already on aspirin (prior RCA DES).
    if (n !== 15) {
      out.push(med({ drug_name: "Aspirin", dose: 300, dose_unit: "mg", route: "oral", timing: "pre_procedure", notes: "Loading dose", administered_at: loadAt }));
    }
    // Weight-based dose stored as units/kg (owner 2a) — no total is invented without a weight.
    out.push(med({
      drug_name: "Unfractionated heparin", dose: 70, dose_unit: "units_per_kg", route: "iv", timing: "intra_procedure",
      act_seconds: 250 + ((n * 13) % 51), // owner: 250–300, varied per case
      administered_at: plusMin(t.started, 10).toISOString(), act_measured_at: plusMin(t.started, 15).toISOString(),
    }));
    if (n === 10) {
      out.push(med({ drug_name: "Intracoronary adenosine", route: "intra_arterial", timing: "intra_procedure", notes: "for no-reflow" }));
    }
  }
  // Every case, at the start of the procedure.
  out.push(med({ drug_name: "Midazolam", dose: 1, dose_unit: "mg", route: "iv", timing: "intra_procedure", notes: "Sedation", administered_at: t.started.toISOString() }));
  out.push(med({ drug_name: "Lidocaine 2%", dose: 5, dose_unit: "ml", route: "sc", timing: "intra_procedure", notes: "Local anaesthetic", administered_at: t.started.toISOString() }));
  return out;
}

function destination(c: SeedCase): Enums["post_procedure_destination"] {
  if (c.case_code === "CAG-2026-020") return "ward";
  const a = acuity(c);
  return a === "stemi" ? "ccu" : a === "urgent" ? "ward" : "day_case_recovery";
}

/** Measurement status per the three-state rule (owner, 0007). */
function lvefFields(c: SeedCase) {
  if (c.procedure.lvef_pct !== undefined) {
    // STEMI cases (owner rule) and — ASSUMPTION — CAG-2026-020, whose case file states LVEF 50%:
    // a stated value cannot be 'not performed', so it is kept as recorded by echo the next day.
    return { lvef_status: "recorded" as const, lvef_pct: c.procedure.lvef_pct, lvef_source: "echo" as const, lvef_measured_on: addDays(c.procedure.procedure_date, 1) };
  }
  return { lvef_status: (isPci(c) ? "not_recorded" : "not_performed") as Enums["measurement_status"], lvef_pct: null, lvef_source: null, lvef_measured_on: null };
}

// ─── Runner ────────────────────────────────────────────────────────────────────

function addDays(isoDate: string, days: number) {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Error text without row data: Postgres `details` can echo the failing row, so it is never printed. */
class SeedError extends Error {
  constructor(step: string, error: { code?: string; message?: string }) {
    super(`${step}: ${error.code ?? "?"} ${error.message ?? ""}`.trim());
  }
}

function must<T>(step: string, res: { data: T; error: { code?: string; message?: string } | null }): NonNullable<T> {
  if (res.error) throw new SeedError(step, res.error);
  if (res.data === null || res.data === undefined) throw new SeedError(step, { message: "no data returned" });
  return res.data;
}

/** Checks the case table against the conventions before anything is written. */
function validate(cases: SeedCase[]): string[] {
  const problems: string[] = [];
  const codes = cases.map((c) => c.case_code);
  codes.forEach((code, i) => codes.indexOf(code) !== i && problems.push(`duplicate case code ${code}`));
  for (const c of cases) {
    const t = timeline(c);
    for (const iv of withLots(c)) {
      if (!c.vessels[iv.vessel_index]) problems.push(`${c.case_code}: vessel_index ${iv.vessel_index} out of range`);
      for (const d of iv.devices) {
        if (!d.lot_number?.startsWith("SYN-")) problems.push(`${c.case_code}: ${d.category} without a SYN- lot number`);
      }
    }
    if (!isPci(c) && c.interventions.length > 0) problems.push(`${c.case_code}: diagnostic-only case has interventions`);
    if (!c.procedure.procedure_date.match(/^2026-(09|10)-/)) problems.push(`${c.case_code}: date outside Sept–Oct 2026`);
    // Owner: never imply LVEF came from the angiogram. LVEF lives in its own fields with its source.
    if (/LVEF/i.test(c.procedure.outcome_summary)) problems.push(`${c.case_code}: final impression mentions LVEF`);
    if (istDate(t.started) !== c.procedure.procedure_date) problems.push(`${c.case_code}: start is not on the procedure date (IST)`);
    const dis = dischargeTime(c, t);
    if (dis && dis <= t.ended) problems.push(`${c.case_code}: discharged before the procedure ended`);
    const meds = c.discharge?.medications ?? [];
    const hasP2y12 = meds.some((m) => /ticagrelor|clopidogrel|prasugrel/i.test(m.drug_name));
    for (const m of meds) {
      const shouldBeDapt = hasP2y12 && /aspirin|ticagrelor|clopidogrel|prasugrel/i.test(m.drug_name);
      if (Boolean(m.is_dapt) !== shouldBeDapt) problems.push(`${c.case_code}: is_dapt wrong on ${m.drug_name}`);
    }
    if (isPci(c) && !procedureMeds(c, t).some((m) => m.notes === "Loading dose" && /ticagrelor|clopidogrel|prasugrel/i.test(m.drug_name))) {
      problems.push(`${c.case_code}: PCI without a P2Y12 loading dose`);
    }
  }
  return problems;
}

async function getOrCreateOperator(db: Db, op: SeedCase["operator"]) {
  const found = must(
    "find operator",
    await db.from("operators").select("id").eq("full_name", op.full_name).eq("role", op.role).limit(1),
  );
  if (found.length > 0) return found[0].id;
  return must("insert operator", await db.from("operators").insert(op).select("id").single()).id;
}

async function getFacility(db: Db) {
  // Created by migration 0006.
  return must(
    "find facility",
    await db.from("facilities").select("id").eq("name", "Synthetic District Hospital").eq("cath_lab_name", "Cath Lab 1").single(),
  ).id;
}

async function getOrCreatePatient(db: Db, c: SeedCase) {
  must(
    "upsert patient",
    await db.from("patients").upsert({ ...c.patient, is_synthetic: true }, { onConflict: "mrn", ignoreDuplicates: true }).select("id"),
  );
  const patientId = must("find patient", await db.from("patients").select("id").eq("mrn", c.patient.mrn).single()).id;

  // Add only the risk factors not already recorded, so re-runs never duplicate them.
  const existing = must("read risk factors", await db.from("patient_risk_factors").select("factor").eq("patient_id", patientId));
  const have = new Set(existing.map((r) => r.factor));
  const missing = c.risk_factors.filter((rf) => !have.has(rf.factor));
  if (missing.length > 0) {
    must(
      "insert risk factors",
      await db
        .from("patient_risk_factors")
        .insert(missing.map((rf) => ({ patient_id: patientId, factor: rf.factor, detail: rf.detail ?? null })))
        .select("id"),
    );
  }
  return patientId;
}

async function insertCaseBody(db: Db, c: SeedCase, procedureId: string, operatorId: string, t: ReturnType<typeof timeline>) {
  // One insert per vessel, so each id is known to belong to its row (bulk RETURNING order
  // is not guaranteed by Postgres).
  const vesselIds: string[] = [];
  for (const v of c.vessels) {
    const row = must(
      "insert vessel finding",
      await db
        .from("vessel_findings")
        .insert({
          procedure_id: procedureId,
          vessel: v.vessel,
          segment: v.segment,
          stenosis_pct: v.stenosis_pct,
          timi_flow: v.timi_flow,
          is_culprit: v.is_culprit ?? false,
          lesion_notes: v.lesion_notes ?? null,
          // Owner: thrombus from the case text (the thrombotic occlusions); nothing else is stated.
          thrombus: /thromb/i.test(v.lesion_notes ?? ""),
        })
        .select("id")
        .single(),
    );
    vesselIds.push(row.id);
  }

  for (const iv of withLots(c)) {
    const intervention = must(
      "insert intervention",
      await db
        .from("interventions")
        .insert({
          procedure_id: procedureId,
          vessel_finding_id: vesselIds[iv.vessel_index],
          intervention_type: iv.intervention_type,
          guidewire: iv.guidewire,
          residual_stenosis_pct: iv.residual_stenosis_pct,
          timi_flow_post: iv.timi_flow_post,
          success: iv.success,
          dissection: iv.dissection ?? false,
          perforation: iv.perforation ?? false,
          notes: iv.notes ?? null,
        })
        .select("id")
        .single(),
    );
    if (iv.devices.length > 0) {
      must(
        "insert devices",
        await db
          .from("devices_used")
          .insert(
            iv.devices.map((d) => ({
              intervention_id: intervention.id,
              phase: d.phase,
              category: d.category,
              product_name: d.product_name,
              manufacturer: d.manufacturer ?? null,
              diameter_mm: d.diameter_mm,
              length_mm: d.length_mm,
              inflation_atm: d.inflation_atm ?? null,
              lot_number: d.lot_number ?? null,
              quantity: d.quantity ?? 1,
            })),
          )
          .select("id"),
      );
    }
  }

  must(
    "insert procedure medications",
    await db.from("procedure_medications").insert(procedureMeds(c, t).map((m) => ({ ...m, procedure_id: procedureId }))).select("id"),
  );

  if (c.complications.length > 0) {
    must(
      "insert complications",
      await db
        .from("complications")
        .insert(
          c.complications.map(({ onset_after_end_hours, ...x }) => ({
            procedure_id: procedureId,
            complication: x.complication,
            severity: x.severity,
            management: x.management,
            onset: x.onset ?? null,
            onset_at: onset_after_end_hours === undefined ? null : plusMin(t.ended, onset_after_end_hours * 60).toISOString(),
            outcome: x.outcome ?? null,
          })),
        )
        .select("id"),
    );
  }

  if (c.discharge) {
    const dis = c.discharge;
    const dischargedAt = dischargeTime(c, t) as Date;
    const dischargeDate = istDate(dischargedAt);
    const p2y12 = dis.medications.find((m) => m.is_dapt && !/aspirin/i.test(m.drug_name));
    const months = p2y12?.duration ? Number(/^(\d+)\s*month/.exec(p2y12.duration)?.[1]) || null : null;
    const discharge = must(
      "insert discharge",
      await db
        .from("discharges")
        .insert({
          procedure_id: procedureId,
          discharged_at: dischargedAt.toISOString(),
          discharge_date: dischargeDate,
          clinical_status: dis.clinical_status,
          follow_up_date: addDays(c.procedure.procedure_date, dis.follow_up_after_days),
          follow_up_clinic: dis.follow_up_clinic,
          advice: dis.advice,
          red_flags: dis.red_flags,
          // Owner: "planned N months" → N; PCI-2026-015's 1-month plan is reviewed 28 days after discharge.
          dapt_planned_months: months,
          dapt_review_date: c.case_code === "PCI-2026-015" ? addDays(dischargeDate, 28) : null,
        })
        .select("id")
        .single(),
    );

    if (dis.medications.length > 0) {
      must(
        "insert medications",
        await db
          .from("discharge_medications")
          .insert(
            dis.medications.map((m) => ({
              discharge_id: discharge.id,
              drug_name: m.drug_name,
              dose: m.dose,
              dose_unit: m.dose_unit,
              frequency: m.frequency,
              route: m.route ?? "oral",
              duration: m.duration ?? null,
              purpose: m.purpose ?? null,
              is_dapt: m.is_dapt ?? false,
            })),
          )
          .select("id"),
      );
    }
  }

  // The completion trigger checks the record is whole.
  must("complete procedure", await db.from("procedures").update({ status: "completed" }).eq("id", procedureId).select("id").single());

  // Owner: every seeded case reviewed by its primary operator the day after (ASSUMPTION: 09:00 IST).
  // reviewed_by stays null — there is no signed-in user behind the seed.
  must(
    "mark reviewed",
    await db
      .from("procedures")
      .update({ status: "reviewed", reviewing_clinician_id: operatorId, reviewed_at: at(addDays(c.procedure.procedure_date, 1), 9).toISOString() })
      .eq("id", procedureId)
      .select("id")
      .single(),
  );
}

async function seedCase(db: Db, c: SeedCase, facilityId: string): Promise<"inserted" | "skipped"> {
  const existing = must("check case", await db.from("procedures").select("id").eq("case_code", c.case_code).limit(1));
  if (existing.length > 0) return "skipped";

  const operatorId = await getOrCreateOperator(db, c.operator);
  const patientId = await getOrCreatePatient(db, c);
  const t = timeline(c);
  const { procedure_duration_min: _duration, lvef_pct: _lvef, outcome_summary: _summary, ...fields } = c.procedure;
  const a = authored(c);
  const n = caseNo(c);

  const procedure = must(
    "insert procedure",
    await db
      .from("procedures")
      .insert({
        ...fields,
        ...a,
        ...lvefFields(c),
        lvedp_status: a.lvedp_mmhg === null ? "not_performed" : "recorded",
        outcome_summary: finalImpression(c),
        case_code: c.case_code,
        patient_id: patientId,
        primary_operator_id: operatorId,
        facility_id: facilityId,
        referring_clinician: null,
        urgency: acuity(c) === "stemi" ? "emergency" : acuity(c) === "urgent" ? "urgent" : "elective",
        admitted_at: t.admitted.toISOString(),
        started_at: t.started.toISOString(),
        ended_at: t.ended.toISOString(),
        // Owner: consent 30–60 min before start, time-out 5 min before, both by the primary operator.
        consent_obtained_at: plusMin(t.started, -(30 + ((n * 7) % 31))).toISOString(),
        consent_by_operator_id: operatorId,
        timeout_completed_at: plusMin(t.started, -5).toISOString(),
        timeout_by_operator_id: operatorId,
        // Owner: ultrasound for the two femoral cases; 2 attempts for 005; femoral sheath out 4 h after.
        access_ultrasound_guided: isFemoral(c),
        access_attempts: n === 5 ? 2 : 1,
        sheath_removed_at: (isFemoral(c) ? plusMin(t.ended, 240) : t.ended).toISOString(),
        post_procedure_condition: "stable",
        post_procedure_destination: destination(c),
        immediate_care_notes: c.immediate_care_notes ?? null,
        findings_communicated_to_patient_at: plusMin(t.ended, 60).toISOString(),
        findings_communicated_to_team: true,
        communication_notes: c.communication_notes ?? null,
        status: "draft",
      })
      .select("id")
      .single(),
  );

  try {
    await insertCaseBody(db, c, procedure.id, operatorId, t);
  } catch (err) {
    // Remove only the procedure this run just created; its children cascade.
    await db.from("procedures").delete().eq("id", procedure.id);
    throw err;
  }
  return "inserted";
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. Run with: npm run seed");
    process.exit(1);
  }

  const problems = validate(CASES);
  if (problems.length > 0) {
    console.error(`Seed data failed validation (${problems.length}):\n  ${problems.join("\n  ")}`);
    process.exit(1);
  }

  const db = createClient<Database>(url, serviceKey, { auth: { persistSession: false } });
  const facilityId = await getFacility(db);

  let inserted = 0;
  let skipped = 0;
  let failed = 0;
  for (const c of CASES) {
    try {
      const result = await seedCase(db, c, facilityId);
      if (result === "inserted") inserted++;
      else skipped++;
      console.log(`${result.padEnd(8)} ${c.case_code}`);
    } catch (err) {
      failed++;
      console.error(`failed   ${c.case_code} — ${(err as Error).message}`);
    }
  }

  console.log(`\n${CASES.length} cases in seed: ${inserted} inserted, ${skipped} already present, ${failed} failed.`);
  if (failed > 0) process.exit(1);
}

main();
