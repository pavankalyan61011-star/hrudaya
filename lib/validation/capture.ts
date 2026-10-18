/**
 * Server-side validation for each capture step (Zod). The client sends each step as JSON;
 * numbers arrive as strings from mobile inputs.
 *
 * Blank numeric fields are "missing", never 0 — z.coerce.number() would turn "" into 0 and
 * silently record, say, 0 mL of contrast.
 */
import { z } from "zod";
import { ENUMS } from "@/lib/labels";
import { gradeAllowed } from "@/lib/events";

const blankToUndefined = (v: unknown) => {
  if (v === "" || v === null || v === undefined) return undefined;
  if (typeof v === "string") return Number(v.trim());
  return v;
};

const int = (min: number, max = 2_147_483_647) =>
  z.preprocess(
    blankToUndefined,
    z.number({ error: "Required" }).int("Whole number").min(min, `At least ${min}`).max(max, `At most ${max}`),
  );

const optionalInt = (min: number, max = 2_147_483_647) =>
  z
    .preprocess(blankToUndefined, z.number({ error: "Enter a number" }).int("Whole number").min(min, `At least ${min}`).max(max, `At most ${max}`).optional())
    .transform((v) => v ?? null);

const decimal = (min: number, max: number, minExclusive = false) =>
  z.preprocess(
    blankToUndefined,
    minExclusive
      ? z.number({ error: "Required" }).gt(min, `Must be more than ${min}`).max(max, `At most ${max}`)
      : z.number({ error: "Required" }).min(min, `At least ${min}`).max(max, `At most ${max}`),
  );

const optionalDecimal = (min: number, max: number) =>
  z
    .preprocess(blankToUndefined, z.number({ error: "Enter a number" }).min(min, `At least ${min}`).max(max, `At most ${max}`).optional())
    .transform((v) => v ?? null);

const text = z.string({ error: "Required" }).trim().min(1, "Required");
const optionalText = z
  .string()
  .trim()
  .optional()
  .nullable()
  .transform((v) => (v ? v : null));
const isoDate = z.string({ error: "Required" }).regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a date");

const optionalEnum = <T extends readonly [string, ...string[]]>(values: T) =>
  z
    .union([z.enum(values), z.literal(""), z.null(), z.undefined()])
    .transform((v) => (v ? (v as T[number]) : null));

const optionalUuid = z
  .union([z.uuid(), z.literal(""), z.null(), z.undefined()])
  .transform((v) => (v ? v : null));

const optionalDate = z
  .union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a date"), z.literal(""), z.null(), z.undefined()])
  .transform((v) => (v ? v : null));

/** <input type="datetime-local"> value, entered as India time → ISO instant with +05:30. */
const LOCAL_DT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;
const optionalDateTime = z
  .union([z.string().regex(LOCAL_DT, "Choose a date and time"), z.literal(""), z.null(), z.undefined()])
  .transform((v) => (v ? `${v}:00+05:30` : null));
const dateTime = z
  .string({ error: "Required" })
  .regex(LOCAL_DT, "Choose a date and time")
  .transform((v) => `${v}:00+05:30`);

const yesNoUnknown = z.enum(["yes", "no", "unknown"]).transform((v) => (v === "unknown" ? null : v === "yes"));

/** Issue path → first message, e.g. { "vessels.2.stenosis_pct": "At most 100" }. */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".");
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}

// ─── Step 1: patient ───────────────────────────────────────────────────────────

export const RiskFactorSchema = z.object({ factor: z.enum(ENUMS.risk_factor), detail: optionalText });

export const PatientStepSchema = z
  .object({
    mode: z.enum(["existing", "new"]),
    patient_id: z.string().optional(),
    new_patient: z
      .object({
        mrn: text,
        full_name: text,
        sex: z.enum(ENUMS.sex, { error: "Required" }),
        date_of_birth: isoDate,
        mobile: optionalText,
      })
      .optional(),
    risk_factors: z.array(RiskFactorSchema),
  })
  .superRefine((v, ctx) => {
    if (v.mode === "existing" && !z.uuid().safeParse(v.patient_id).success) {
      ctx.addIssue({ code: "custom", path: ["patient_id"], message: "Choose a patient" });
    }
    if (v.mode === "new" && !v.new_patient) {
      ctx.addIssue({ code: "custom", path: ["new_patient"], message: "Enter the patient's details" });
    }
    const factors = v.risk_factors.map((r) => r.factor);
    if (new Set(factors).size !== factors.length) {
      ctx.addIssue({ code: "custom", path: ["risk_factors"], message: "Each risk factor once" });
    }
  });

// ─── Step 2: indication & access ───────────────────────────────────────────────

export const IndicationStepSchema = z.object({
  case_code: text.max(40, "At most 40 characters"),
  procedure_date: isoDate,
  procedure_type: z.enum(ENUMS.procedure_type, { error: "Required" }),
  indication: z.enum(ENUMS.indication, { error: "Required" }),
  presentation_notes: text,
  ecg_findings: optionalText,
  troponin: yesNoUnknown,
  facility_id: z.uuid({ error: "Required" }),
  urgency: z.enum(ENUMS.urgency, { error: "Required" }),
  referring_clinician: optionalText,
  admitted_at: optionalDateTime,
  allergies: optionalText,
  creatinine_umol_l: optionalDecimal(0.01, 1_000_000),
  egfr: optionalDecimal(0.01, 1_000_000),
  haemoglobin_g_dl: optionalDecimal(0.01, 1_000_000),
  platelets_x10e9_l: optionalInt(1),
  baseline_bp_systolic: optionalInt(1),
  baseline_bp_diastolic: optionalInt(1),
  baseline_heart_rate: optionalInt(1),
  access_site: z.enum(ENUMS.access_site, { error: "Required" }),
  access_ultrasound: yesNoUnknown,
  access_attempts: optionalInt(1),
  sheath_size_fr: z.preprocess(blankToUndefined, z.union([z.literal(5), z.literal(6), z.literal(7), z.literal(8)], { error: "Required" })),
  diagnostic_catheters: z.array(z.string().trim().min(1)).max(10),
  guiding_catheter: optionalText,
  primary_operator_id: z.uuid({ error: "Required" }),
});

// ─── Step 3: angiography ───────────────────────────────────────────────────────

export const VesselSchema = z.object({
  id: z.uuid().optional(),
  vessel: z.enum(ENUMS.vessel, { error: "Required" }),
  segment: optionalEnum(ENUMS.vessel_segment),
  stenosis_pct: int(0, 100),
  timi_flow: int(0, 3),
  is_culprit: z.boolean(),
  lesion_notes: optionalText,
  lesion_length_mm: optionalDecimal(0.1, 1_000_000),
  calcification: optionalEnum(ENUMS.calcification_grade),
  thrombus: z.boolean(),
  bifurcation: z.boolean(),
});

/**
 * Three-state rule (spec §3): the value is required when, and only when, the status is "recorded";
 * any value typed before switching away from "recorded" is dropped.
 */
function threeState<V>(status: "not_recorded" | "not_performed" | "recorded", value: V | null, ctx: z.RefinementCtx, path: string) {
  if (status === "recorded" && value === null) ctx.addIssue({ code: "custom", path: [path], message: "Required when recorded" });
}

/** Week 7: aortic pressure and LVEDP are saved by the Haemodynamics & LV sheet, which keeps the old columns in step. */
export const AngiographyStepSchema = z.object({
  vessels: z.array(VesselSchema).min(1, "Add at least one vessel"),
  dominance: optionalEnum(ENUMS.coronary_dominance),
});

// ─── Step 4: intervention & devices ────────────────────────────────────────────

export const DeviceSchema = z
  .object({
    id: z.uuid().optional(),
    phase: z.enum(ENUMS.device_phase),
    category: z.enum(ENUMS.device_category, { error: "Required" }),
    product_name: text,
    manufacturer: optionalText,
    diameter_mm: decimal(0, 99.99, true),
    length_mm: decimal(0, 9999.9, true),
    inflation_atm: optionalInt(1),
    lot_number: optionalText,
    expiry_date: optionalDate,
    udi: optionalText,
    quantity: int(1),
  })
  .superRefine((d, ctx) => {
    if (d.category === "stent" && !d.lot_number) {
      ctx.addIssue({ code: "custom", path: ["lot_number"], message: "Lot number is required for a stent" });
    }
  });

export const InterventionSchema = z.object({
  id: z.uuid().optional(),
  vessel_finding_id: z.uuid({ error: "Choose the lesion treated" }),
  intervention_type: z.enum(ENUMS.intervention_type, { error: "Required" }),
  guidewire: text,
  residual_stenosis_pct: int(0, 100),
  timi_flow_post: int(0, 3),
  success: z.boolean({ error: "Choose Successful or Not successful" }), // never defaulted
  dissection: z.boolean(),
  perforation: z.boolean(),
  notes: optionalText,
  devices: z.array(DeviceSchema),
});

export const InterventionStepSchema = z.object({
  interventions: z.array(InterventionSchema),
});

// ─── Step 5: procedure details & complications ─────────────────────────────────

export const ComplicationSchema = z.object({
  id: z.uuid().optional(),
  complication: z.enum(ENUMS.complication_type, { error: "Required" }),
  severity: z.enum(ENUMS.complication_severity, { error: "Required" }),
  management: text,
  onset: optionalEnum(ENUMS.complication_onset),
  onset_at: optionalDateTime,
  outcome: optionalText,
});

/** A unit is kept only alongside a dose; a dose needs a unit. */
export const ProcedureMedicationSchema = z
  .object({
    drug_name: text,
    dose: z
      .preprocess(blankToUndefined, z.number({ error: "Enter a number" }).gt(0, "Must be more than 0").optional())
      .transform((v) => v ?? null),
    dose_unit: optionalEnum(ENUMS.dose_unit),
    route: z.enum(ENUMS.medication_route, { error: "Required" }),
    timing: z.enum(ENUMS.medication_timing, { error: "Required" }),
    administered_at: optionalDateTime,
    act_seconds: optionalInt(1),
    act_measured_at: optionalDateTime,
    notes: optionalText,
  })
  .superRefine((m, ctx) => {
    if (m.dose !== null && !m.dose_unit) ctx.addIssue({ code: "custom", path: ["dose_unit"], message: "Required with a dose" });
  })
  .transform((m) => ({ ...m, dose_unit: m.dose === null ? null : m.dose_unit }));

export const DetailsStepSchema = z
  .object({
    started_at: dateTime,
    ended_at: dateTime,
    consent_obtained_at: optionalDateTime,
    consent_by_operator_id: optionalUuid,
    timeout_completed_at: optionalDateTime,
    timeout_by_operator_id: optionalUuid,
    sheath_removed_at: optionalDateTime,
    contrast_agent: optionalText,
    contrast_volume_ml: int(0),
    fluoroscopy_time_min: decimal(0, 9999.9),
    air_kerma_mgy: optionalDecimal(0, 100_000_000),
    dap_gy_cm2: optionalDecimal(0, 100_000_000),
    haemostasis_method: z.enum(ENUMS.haemostasis_method, { error: "Required" }),
    outcome_summary: text,
    procedure_medications: z.array(ProcedureMedicationSchema),
    // Explicit choices — the form never defaults these (phone test, 2026-10-15).
    complications_choice: z.enum(["none", "yes"], { error: "Choose None or Yes" }),
    complications: z.array(ComplicationSchema),
    post_procedure_condition: z.enum(ENUMS.post_procedure_condition, { error: "Required" }),
    post_procedure_destination: z.enum(ENUMS.post_procedure_destination, { error: "Required" }),
    immediate_care_notes: optionalText,
    lvef_status: z.enum(ENUMS.measurement_status),
    lvef_pct: optionalInt(0, 100),
    lvef_source: optionalEnum(ENUMS.lvef_source),
    lvef_measured_on: optionalDate,
    findings_communicated_to_patient_at: optionalDateTime,
    findings_communicated_to_team: z.boolean(),
    communication_notes: optionalText,
  })
  .superRefine((v, ctx) => {
    if (new Date(v.ended_at) <= new Date(v.started_at)) {
      ctx.addIssue({ code: "custom", path: ["ended_at"], message: "Must be after the start" });
    }
    threeState(v.lvef_status, v.lvef_pct, ctx, "lvef_pct");
    if (v.complications_choice === "yes" && v.complications.length === 0) {
      ctx.addIssue({ code: "custom", path: ["complications_choice"], message: "Add the complication, or choose None" });
    }
  })
  .transform((v) => {
    const recorded = v.lvef_status === "recorded";
    const { complications_choice: _choice, ...rest } = v;
    return {
      ...rest,
      complications: v.complications_choice === "none" ? [] : v.complications,
      lvef_pct: recorded ? v.lvef_pct : null,
      lvef_source: recorded ? v.lvef_source : null,
      lvef_measured_on: recorded ? v.lvef_measured_on : null,
    };
  });

// ─── Step 6: discharge ─────────────────────────────────────────────────────────

/** Dose may be blank only for a PRN medicine; a unit is kept only alongside a dose. */
export const MedicationSchema = z
  .object({
    drug_name: text,
    dose: z
      .preprocess(blankToUndefined, z.number({ error: "Enter a number" }).gt(0, "Must be more than 0").optional())
      .transform((v) => v ?? null),
    dose_unit: optionalEnum(ENUMS.dose_unit),
    frequency: z.enum(ENUMS.dose_frequency, { error: "Required" }),
    route: z.enum(ENUMS.medication_route),
    duration: optionalText,
    purpose: optionalText,
    is_dapt: z.boolean(),
  })
  .superRefine((m, ctx) => {
    if (m.dose === null && m.frequency !== "prn") {
      ctx.addIssue({ code: "custom", path: ["dose"], message: "Required (may be blank only for PRN)" });
    }
    if (m.dose !== null && !m.dose_unit) {
      ctx.addIssue({ code: "custom", path: ["dose_unit"], message: "Required" });
    }
  })
  .transform((m) => ({ ...m, dose_unit: m.dose === null ? null : m.dose_unit }));

export const DischargeSchema = z
  .object({
    discharged_at: dateTime,
    clinical_status: text,
    follow_up_date: isoDate,
    follow_up_clinic: text,
    advice: z.array(z.string().trim().min(1)),
    red_flags: z.array(z.string().trim().min(1)),
    medications: z.array(MedicationSchema),
    dapt_planned_months: optionalInt(1),
    dapt_review_date: optionalDate,
  })
  // discharge_date is always the India date of discharged_at.
  .transform((d) => ({ ...d, discharge_date: new Date(new Date(d.discharged_at).getTime() + 330 * 60_000).toISOString().slice(0, 10) }))
  .superRefine((d, ctx) => {
    if (d.follow_up_date < d.discharge_date) {
      ctx.addIssue({ code: "custom", path: ["follow_up_date"], message: "Follow-up must be on or after discharge" });
    }
  });

export const DischargeStepSchema = z.discriminatedUnion("admitted", [
  z.object({ admitted: z.literal(true) }),
  z.object({ admitted: z.literal(false), discharge: DischargeSchema }),
]);

// ─── Week 7 sheets (spec §3) ───────────────────────────────────────────────────

/**
 * §3.1 Lesion sheet. Mirrors migration 0011's "present only when" rules: a dependent value is
 * dropped when its parent is switched off (Medina without bifurcation, CTO months without CTO, ISR
 * pattern without ISR, a graft without vessel = graft), so a toggle switched off never leaves a
 * stale value behind.
 */
export const LesionSheetSchema = z
  .object({
    vessel: z.enum(ENUMS.vessel, { error: "Required" }),
    segment: optionalEnum(ENUMS.vessel_segment),
    graft_id: optionalUuid,
    stenosis_pct: int(0, 100),
    stenosis_source: z.enum(ENUMS.value_source),
    timi_flow: int(0, 3),
    is_culprit: z.boolean(),
    lesion_length_mm: optionalDecimal(0.1, 1_000_000),
    lesion_class: optionalEnum(ENUMS.lesion_class),
    calcification: optionalEnum(ENUMS.calcification_grade),
    thrombus: z.boolean(),
    ostial: z.boolean(),
    bifurcation: z.boolean(),
    bifurcation_medina: z
      .union([z.string().regex(/^[01],[01],[01]$/, "Medina is three 0/1 values"), z.literal(""), z.null(), z.undefined()])
      .transform((v) => (v ? v : null)),
    tortuosity: optionalEnum(ENUMS.tortuosity_grade),
    cto: z.boolean(),
    cto_duration_months: optionalInt(0, 600),
    in_stent_restenosis: z.boolean(),
    isr_pattern: optionalEnum(ENUMS.isr_pattern),
    collaterals_rentrop: optionalInt(0, 3),
    timi_frame_count: optionalInt(0, 1000),
    lesion_notes: optionalText,
  })
  .superRefine((v, ctx) => {
    if (v.vessel === "graft" && !v.graft_id) ctx.addIssue({ code: "custom", path: ["graft_id"], message: "Choose the graft this lesion is in" });
  })
  .transform((v) => ({
    ...v,
    graft_id: v.vessel === "graft" ? v.graft_id : null,
    bifurcation_medina: v.bifurcation ? v.bifurcation_medina : null,
    cto_duration_months: v.cto ? v.cto_duration_months : null,
    isr_pattern: v.in_stent_restenosis ? v.isr_pattern : null,
  }));

export type LesionSheetInput = z.infer<typeof LesionSheetSchema>;

const triState = z.enum(ENUMS.tri_state);
/** Yes / No / unknown (null) — for nullable booleans such as prior PCI. */
const optionalBool = z.union([z.boolean(), z.null(), z.undefined()]).transform((v) => (v === undefined ? null : v));

/** §3.2 Physiology row. Resting indices take no hyperaemic agent; a dose needs an agent. */
export const PhysiologyRowSchema = z
  .object({
    id: optionalUuid,
    phase: z.enum(ENUMS.measurement_phase, { error: "Required" }),
    index: z.enum(ENUMS.physiology_index, { error: "Required" }),
    value: decimal(0, 1),
    hyperaemic_agent: optionalEnum(ENUMS.hyperaemic_agent),
    agent_dose: optionalText,
    decision: optionalEnum(ENUMS.physiology_decision),
    method: optionalEnum(ENUMS.physiology_method),
    notes: optionalText,
  })
  .superRefine((v, ctx) => {
    const resting = v.index !== "ffr";
    if (resting && v.hyperaemic_agent && v.hyperaemic_agent !== "none") {
      ctx.addIssue({ code: "custom", path: ["hyperaemic_agent"], message: "A resting index is measured without a hyperaemic agent" });
    }
  })
  .transform((v) => ({
    ...v,
    value: Math.round(v.value * 100) / 100,
    agent_dose: v.hyperaemic_agent && v.hyperaemic_agent !== "none" ? v.agent_dose : null,
  }));

/** §3.2 Imaging row: OCT-only, NIRS-only and post-only values are dropped when they don't apply. */
export const ImagingRowSchema = z
  .object({
    id: optionalUuid,
    modality: z.enum(ENUMS.imaging_modality, { error: "Required" }),
    phase: z.enum(ENUMS.measurement_phase, { error: "Required" }),
    mla_mm2: optionalDecimal(0, 999.99),
    eem_area_mm2: optionalDecimal(0.01, 999.99),
    plaque_burden_pct: optionalInt(0, 100),
    calcium_arc_deg: optionalInt(0, 360),
    calcium_thickness_mm: optionalDecimal(0, 99.99),
    lipid_arc_deg: optionalInt(0, 360),
    max_lcbi_4mm: optionalInt(0, 1000),
    msa_mm2: optionalDecimal(0.01, 999.99),
    stent_expansion_pct: optionalInt(0, 150),
    malapposition: optionalBool,
    edge_dissection: optionalBool,
    pullback_length_mm: optionalInt(1, 10_000),
    method: optionalEnum(ENUMS.imaging_method),
    notes: optionalText,
  })
  .transform((v) => ({
    ...v,
    calcium_thickness_mm: v.modality === "oct" ? v.calcium_thickness_mm : null,
    lipid_arc_deg: v.modality === "oct" ? v.lipid_arc_deg : null,
    max_lcbi_4mm: v.modality === "nirs_ivus" ? v.max_lcbi_4mm : null,
    msa_mm2: v.phase === "post" ? v.msa_mm2 : null,
    stent_expansion_pct: v.phase === "post" ? v.stent_expansion_pct : null,
    malapposition: v.phase === "post" ? v.malapposition : null,
    edge_dissection: v.phase === "post" ? v.edge_dissection : null,
  }));

/**
 * §3.3 Haemodynamics (left heart) and LV. Three-state rule for the left block and LVEF: values are
 * required for "recorded" and dropped otherwise. Heart rate and rhythm stand outside the block.
 */
export const HaemodynamicsSheetSchema = z
  .object({
    left_status: z.enum(ENUMS.measurement_status),
    ao_systolic: optionalInt(1, 400),
    ao_diastolic: optionalInt(1, 300),
    ao_mean: optionalInt(1, 300),
    lv_systolic: optionalInt(1, 400),
    lv_edp: optionalInt(0, 100),
    heart_rate_at_measurement: optionalInt(1, 300),
    rhythm: optionalEnum(ENUMS.heart_rhythm),
    lvef_status: z.enum(ENUMS.measurement_status),
    lvef_pct: optionalInt(0, 100),
    lvef_source: optionalEnum(ENUMS.lvef_source),
    lvef_measured_on: optionalDate,
    mitral_regurgitation_grade: optionalInt(0, 4),
    lv_gram_performed: optionalBool,
    wall_motion: z.array(z.object({ segment: z.number().int().min(1).max(17), motion: z.enum(ENUMS.wall_motion) })).max(17),
  })
  .superRefine((v, ctx) => {
    if (v.left_status === "recorded" && [v.ao_systolic, v.ao_diastolic, v.ao_mean, v.lv_systolic, v.lv_edp].every((x) => x === null)) {
      ctx.addIssue({ code: "custom", path: ["ao_systolic"], message: "Enter at least one pressure, or choose another status" });
    }
    threeState(v.lvef_status, v.lvef_pct, ctx, "lvef_pct");
    if (new Set(v.wall_motion.map((w) => w.segment)).size !== v.wall_motion.length) {
      ctx.addIssue({ code: "custom", path: ["wall_motion"], message: "Each segment once" });
    }
  })
  .transform((v) => {
    const left = v.left_status === "recorded";
    const lvef = v.lvef_status === "recorded";
    return {
      ...v,
      ao_systolic: left ? v.ao_systolic : null,
      ao_diastolic: left ? v.ao_diastolic : null,
      ao_mean: left ? v.ao_mean : null,
      lv_systolic: left ? v.lv_systolic : null,
      lv_edp: left ? v.lv_edp : null,
      lvef_pct: lvef ? v.lvef_pct : null,
      lvef_source: lvef ? v.lvef_source : null,
      lvef_measured_on: lvef ? v.lvef_measured_on : null,
    };
  });

/** §3.4 Graft. Stenosis % only for a stenosed graft; lesion location only for a diseased one. */
export const GraftSchema = z
  .object({
    id: optionalUuid,
    graft_type: z.enum(ENUMS.graft_type, { error: "Required" }),
    target_vessel: z.enum(ENUMS.vessel, { error: "Required" }),
    sequential: z.boolean(),
    patency: z.enum(ENUMS.graft_patency, { error: "Required" }),
    stenosis_pct: optionalInt(0, 100),
    lesion_location: optionalEnum(ENUMS.graft_lesion_location),
    cabg_year: optionalInt(1950, 2100),
    notes: optionalText,
    /** "Add as lesion": also create the graft lesion, with its pre-intervention TIMI flow. */
    add_lesion: z.boolean().optional(),
    add_lesion_timi: optionalInt(0, 3),
  })
  .superRefine((v, ctx) => {
    if (v.add_lesion && v.add_lesion_timi === null) ctx.addIssue({ code: "custom", path: ["add_lesion_timi"], message: "Choose the TIMI flow to add the lesion" });
    if (v.add_lesion && v.patency === "stenosed" && v.stenosis_pct === null) ctx.addIssue({ code: "custom", path: ["stenosis_pct"], message: "Enter the stenosis to add the lesion" });
  })
  .transform((v) => ({
    ...v,
    stenosis_pct: v.patency === "stenosed" ? v.stenosis_pct : null,
    lesion_location: v.patency === "stenosed" || v.patency === "occluded" ? v.lesion_location : null,
  }));

/** §3.5 Intervention detail. "Other" needs its description; grades only with their finding. */
export const InterventionSheetSchema = z
  .object({
    techniques: z.array(z.enum(ENUMS.technique)),
    technique_other: optionalText,
    bifurcation_strategy: optionalEnum(ENUMS.bifurcation_strategy),
    bifurcation_strategy_other: optionalText,
    guiding_catheter: optionalText,
    wires: z.array(z.string()).transform((ws) => ws.map((w) => w.trim()).filter(Boolean)),
    residual_stenosis_pct: int(0, 100),
    timi_flow_post: int(0, 3),
    success: z.boolean(),
    failure_reason: optionalEnum(ENUMS.pci_failure_reason),
    dissection: z.boolean(),
    dissection_grade: optionalEnum(ENUMS.dissection_grade),
    perforation: z.boolean(),
    perforation_class: optionalEnum(ENUMS.perforation_class),
    no_reflow: z.boolean(),
    stent_overlap: z.boolean(),
    total_stent_length_mm: optionalDecimal(0.1, 9999.9),
  })
  .superRefine((v, ctx) => {
    if (v.techniques.includes("other") && !v.technique_other) ctx.addIssue({ code: "custom", path: ["technique_other"], message: "Describe the other technique" });
    if (v.bifurcation_strategy === "other" && !v.bifurcation_strategy_other) {
      ctx.addIssue({ code: "custom", path: ["bifurcation_strategy_other"], message: "Describe the strategy" });
    }
  })
  .transform((v) => ({
    ...v,
    techniques: [...new Set(v.techniques)],
    technique_other: v.techniques.includes("other") ? v.technique_other : null,
    bifurcation_strategy_other: v.bifurcation_strategy === "other" ? v.bifurcation_strategy_other : null,
    failure_reason: v.success ? null : v.failure_reason,
    dissection_grade: v.dissection ? v.dissection_grade : null,
    perforation_class: v.perforation ? v.perforation_class : null,
  }));

/** §3.5 Procedural event. Grade validated per event type (lib/events.ts); "none" stands alone. */
export const EventSchema = z
  .object({
    id: optionalUuid,
    complication: z.enum(ENUMS.complication_type, { error: "Required" }),
    severity: z.enum(ENUMS.complication_severity, { error: "Required" }),
    management: text,
    onset: optionalEnum(ENUMS.complication_onset),
    onset_at: optionalDateTime,
    grade: z
      .union([z.string(), z.null(), z.undefined()])
      .transform((g) => (g ? g : null)),
    treatments: z.array(z.enum(ENUMS.event_treatment)),
    treatment_other: optionalText,
    resolution: optionalEnum(ENUMS.event_resolution),
    outcome: optionalText,
  })
  .superRefine((v, ctx) => {
    if (!gradeAllowed(v.complication, v.grade)) ctx.addIssue({ code: "custom", path: ["grade"], message: "Not a grade for this event" });
    if (v.treatments.includes("none") && v.treatments.length > 1) ctx.addIssue({ code: "custom", path: ["treatments"], message: "“None” cannot go with a treatment" });
    if (v.treatments.includes("other") && !v.treatment_other) ctx.addIssue({ code: "custom", path: ["treatment_other"], message: "Describe the other treatment" });
  })
  .transform((v) => ({ ...v, treatments: [...new Set(v.treatments)], treatment_other: v.treatments.includes("other") ? v.treatment_other : null }));

/** §2.9 One inflation; its sequence number is the next free one for the device. */
export const InflationSchema = z.object({
  device_id: z.uuid(),
  pressure_atm: int(1, 40),
  duration_s: optionalInt(0, 3600),
});

/** §3.6 Indication tab. Device time may not precede door time (no negative door-to-device). */
export const IndicationSheetSchema = z
  .object({
    ccs_class: optionalInt(1, 4),
    nyha_class: optionalInt(1, 4),
    stress_test_type: optionalEnum(ENUMS.stress_test_type),
    stress_test_result: optionalEnum(ENUMS.stress_test_result),
    cardiogenic_shock: z.boolean(),
    cardiac_arrest_pre_procedure: z.boolean(),
    thrombolysis_given: z.boolean(),
    prior_pci: optionalBool,
    prior_cabg: optionalBool,
    symptom_onset_at: optionalDateTime,
    first_medical_contact_at: optionalDateTime,
    door_at: optionalDateTime,
    device_time_at: optionalDateTime,
  })
  .superRefine((v, ctx) => {
    if (v.door_at && v.device_time_at && v.device_time_at < v.door_at) {
      ctx.addIssue({ code: "custom", path: ["device_time_at"], message: "Device time is before door time" });
    }
  })
  .transform((v) => ({
    ...v,
    stress_test_result: v.stress_test_type && v.stress_test_type !== "none" ? v.stress_test_result : null,
  }));

/**
 * §3.6 Outcome tab: every outcome yes / no / not recorded (never defaulted to "no"). A death sets
 * the disposition to deceased; dependent values are dropped when their outcome isn't "yes".
 */
export const OutcomeSheetSchema = z
  .object({
    mi: triState,
    stroke: triState,
    death: triState,
    death_cause: optionalText,
    bleeding: triState,
    bleeding_barc: optionalInt(0, 5),
    bleeding_barc_sub: z.union([z.enum(["a", "b", "c"]), z.literal(""), z.null(), z.undefined()]).transform((v) => (v ? v : null)),
    transfusion: triState,
    vascular_status: triState,
    vascular_complications: z.array(z.enum(ENUMS.vascular_complication)),
    aki: triState,
    creatinine_post_umol_l: optionalDecimal(1, 100_000),
    new_dialysis: triState,
    emergency_cabg: triState,
    cardiac_tamponade: triState,
    unplanned_repeat_pci: triState,
    disposition: optionalEnum(ENUMS.disposition),
  })
  .superRefine((v, ctx) => {
    if (v.vascular_status === "yes" && v.vascular_complications.length === 0) {
      ctx.addIssue({ code: "custom", path: ["vascular_complications"], message: "Choose at least one, or record “No”" });
    }
    if (v.death !== "yes" && v.disposition === "deceased") {
      ctx.addIssue({ code: "custom", path: ["disposition"], message: "“Deceased” goes with Death = Yes" });
    }
  })
  .transform((v) => ({
    ...v,
    death_cause: v.death === "yes" ? v.death_cause : null,
    disposition: v.death === "yes" ? ("deceased" as const) : v.disposition,
    bleeding_barc: v.bleeding === "yes" ? v.bleeding_barc : null,
    bleeding_barc_sub: v.bleeding === "yes" && v.bleeding_barc === 3 ? v.bleeding_barc_sub : null,
    vascular_complications: v.vascular_status === "yes" ? [...new Set(v.vascular_complications)] : [],
  }));
