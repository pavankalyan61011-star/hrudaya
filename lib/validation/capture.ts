/**
 * Server-side validation for each capture step (Zod). The client sends each step as JSON;
 * numbers arrive as strings from mobile inputs.
 *
 * Blank numeric fields are "missing", never 0 — z.coerce.number() would turn "" into 0 and
 * silently record, say, 0 mL of contrast.
 */
import { z } from "zod";
import { ENUMS } from "@/lib/labels";

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
  troponin: z.enum(["yes", "no", "unknown"]).transform((v) => (v === "unknown" ? null : v === "yes")),
  access_site: z.enum(ENUMS.access_site, { error: "Required" }),
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
});

export const AngiographyStepSchema = z.object({
  vessels: z.array(VesselSchema).min(1, "Add at least one vessel"),
});

// ─── Step 4: intervention & devices ────────────────────────────────────────────

export const DeviceSchema = z
  .object({
    phase: z.enum(ENUMS.device_phase),
    category: z.enum(ENUMS.device_category, { error: "Required" }),
    product_name: text,
    manufacturer: optionalText,
    diameter_mm: decimal(0, 99.99, true),
    length_mm: decimal(0, 9999.9, true),
    inflation_atm: optionalInt(1),
    lot_number: optionalText,
    quantity: int(1),
  })
  .superRefine((d, ctx) => {
    if (d.category === "stent" && !d.lot_number) {
      ctx.addIssue({ code: "custom", path: ["lot_number"], message: "Lot number is required for a stent" });
    }
  });

export const InterventionSchema = z.object({
  vessel_finding_id: z.uuid({ error: "Choose the lesion treated" }),
  intervention_type: z.enum(ENUMS.intervention_type, { error: "Required" }),
  guidewire: text,
  residual_stenosis_pct: int(0, 100),
  timi_flow_post: int(0, 3),
  success: z.boolean(),
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
  complication: z.enum(ENUMS.complication_type, { error: "Required" }),
  severity: z.enum(ENUMS.complication_severity, { error: "Required" }),
  management: text,
});

export const DetailsStepSchema = z.object({
  contrast_volume_ml: int(0),
  procedure_duration_min: int(1),
  fluoroscopy_time_min: decimal(0, 9999.9),
  radiation_dose_mgy: optionalDecimal(0, 1_000_000),
  lvef_pct: optionalInt(0, 100),
  haemostasis_method: z.enum(ENUMS.haemostasis_method, { error: "Required" }),
  outcome_summary: text,
  complications: z.array(ComplicationSchema),
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
    discharge_date: isoDate,
    length_of_stay_hours: int(0),
    clinical_status: text,
    follow_up_date: isoDate,
    follow_up_clinic: text,
    advice: z.array(z.string().trim().min(1)),
    red_flags: z.array(z.string().trim().min(1)),
    medications: z.array(MedicationSchema),
  })
  .superRefine((d, ctx) => {
    if (d.follow_up_date < d.discharge_date) {
      ctx.addIssue({ code: "custom", path: ["follow_up_date"], message: "Follow-up must be on or after discharge" });
    }
  });

export const DischargeStepSchema = z.discriminatedUnion("admitted", [
  z.object({ admitted: z.literal(true) }),
  z.object({ admitted: z.literal(false), discharge: DischargeSchema }),
]);
