/**
 * Synthetic fixture for the FHIR unit tests: one reviewed STEMI PCI with every section filled.
 * Not a real patient; never touches the database.
 */
import type { FhirSource } from "./load.ts";

const OP = { id: "00000000-0000-4000-8000-000000000001", full_name: "Dr Test Operator", role: "interventional_cardiologist" };
const REVIEWER = { id: "00000000-0000-4000-8000-000000000002", full_name: "Dr Test Reviewer", role: "interventional_cardiologist" };
const FACILITY = { id: "00000000-0000-4000-8000-000000000003", name: "Synthetic Test Hospital", cath_lab_name: "Lab 1", city: "Testpur" };

export function fixture(overrides: Record<string, unknown> = {}): FhirSource {
  const base = {
    id: "10000000-0000-4000-8000-000000000001",
    case_code: "PCI-TEST-001",
    status: "reviewed",
    procedure_type: "angiography_and_pci",
    indication: "stemi",
    urgency: "emergency",
    procedure_date: "2026-10-01",
    admitted_at: "2026-09-30T22:30:00+00:00",
    started_at: "2026-09-30T23:45:00+00:00",
    ended_at: "2026-10-01T00:30:00+00:00",
    reviewed_at: "2026-10-02T03:30:00+00:00",
    access_site: "right_radial",
    sheath_size_fr: 6,
    dominance: "right",
    outcome_summary: "Test impression.",
    contrast_agent: "Iohexol 350",
    contrast_volume_ml: 100,
    fluoroscopy_time_min: 10,
    air_kerma_mgy: 850,
    dap_gy_cm2: 65,
    baseline_bp_systolic: 120,
    baseline_bp_diastolic: 75,
    baseline_heart_rate: 88,
    creatinine_umol_l: 90,
    egfr: 80,
    haemoglobin_g_dl: 14,
    platelets_x10e9_l: 250,
    aortic_pressure_systolic: 114,
    aortic_pressure_diastolic: 71,
    lvedp_status: "recorded",
    lvedp_mmhg: 22,
    lvef_status: "recorded",
    lvef_pct: 45,
    lvef_source: "echo",
    lvef_measured_on: "2026-10-02",
    post_procedure_condition: "stable",
    post_procedure_destination: "ccu",
    immediate_care_notes: null,
    sheath_removed_at: null,
    patient: {
      id: "20000000-0000-4000-8000-000000000001",
      mrn: "SYN-TEST-1",
      full_name: "Synthetic Test Patient",
      sex: "male",
      date_of_birth: "1960-01-01",
      is_synthetic: true,
      risk_factors: [
        { id: "30000000-0000-4000-8000-000000000001", factor: "hypertension", detail: null },
        { id: "30000000-0000-4000-8000-000000000002", factor: "prior_pci", detail: "RCA DES" },
      ],
    },
    operator: OP,
    reviewer: REVIEWER,
    facility: FACILITY,
    vessel_findings: [
      { id: "40000000-0000-4000-8000-000000000001", vessel: "lmca", segment: null, stenosis_pct: 0, timi_flow: 3, is_culprit: false, lesion_notes: null, lesion_length_mm: null, calcification: null, thrombus: false, bifurcation: false },
      { id: "40000000-0000-4000-8000-000000000002", vessel: "lad", segment: "proximal", stenosis_pct: 100, timi_flow: 0, is_culprit: true, lesion_notes: "Thrombotic occlusion", lesion_length_mm: 20, calcification: "mild", thrombus: true, bifurcation: false },
    ],
    interventions: [
      {
        id: "50000000-0000-4000-8000-000000000001",
        vessel_finding_id: "40000000-0000-4000-8000-000000000002",
        intervention_type: "pci_des",
        guidewire: "Test wire",
        residual_stenosis_pct: 0,
        timi_flow_post: 3,
        success: true,
        devices_used: [
          { id: "60000000-0000-4000-8000-000000000001", phase: "pre_dilation", category: "balloon_sc", product_name: "Test balloon", manufacturer: null, diameter_mm: 2.5, length_mm: 15, inflation_atm: 12, lot_number: "SYN-B-1", expiry_date: null, udi: null, quantity: 1 },
          { id: "60000000-0000-4000-8000-000000000002", phase: "deployment", category: "stent", product_name: "Test DES", manufacturer: "Synthetic Co", diameter_mm: 3.5, length_mm: 28, inflation_atm: 14, lot_number: "SYN-S-1", expiry_date: "2028-01-31", udi: "(01)TEST", quantity: 1 },
          { id: "60000000-0000-4000-8000-000000000003", phase: "deployment", category: "balloon_dcb", product_name: "Test DCB", manufacturer: null, diameter_mm: 3, length_mm: 20, inflation_atm: 8, lot_number: "SYN-D-1", expiry_date: null, udi: null, quantity: 1 },
        ],
      },
    ],
    procedure_medications: [
      { id: "70000000-0000-4000-8000-000000000001", drug_name: "Unfractionated heparin", dose: 70, dose_unit: "units_per_kg", route: "iv", timing: "intra_procedure", act_seconds: 270, administered_at: "2026-09-30T23:55:00+00:00", act_measured_at: "2026-10-01T00:00:00+00:00", notes: null },
      { id: "70000000-0000-4000-8000-000000000002", drug_name: "Intracoronary adenosine", dose: null, dose_unit: null, route: "intra_arterial", timing: "intra_procedure", act_seconds: null, administered_at: null, act_measured_at: null, notes: "for no-reflow" },
    ],
    complications: [],
    discharge: {
      id: "80000000-0000-4000-8000-000000000001",
      discharged_at: "2026-10-04T04:30:00+00:00",
      discharge_date: "2026-10-04",
      follow_up_date: "2026-10-15",
      follow_up_clinic: "Cardiology OPD",
      clinical_status: "Clinically stable",
      advice: ["Strict DAPT adherence", "Smoking cessation"],
      red_flags: ["Recurrent chest pain", "Significant bleeding"],
      dapt_planned_months: 12,
      dapt_review_date: "2027-09-01",
      discharge_medications: [
        { id: "90000000-0000-4000-8000-000000000001", drug_name: "Aspirin", dose: 75, dose_unit: "mg", frequency: "od", route: "oral", duration: null, purpose: null, is_dapt: true },
        { id: "90000000-0000-4000-8000-000000000002", drug_name: "Ticagrelor", dose: 90, dose_unit: "mg", frequency: "bd", route: "oral", duration: "12 months", purpose: null, is_dapt: true },
        { id: "90000000-0000-4000-8000-000000000003", drug_name: "Atorvastatin", dose: 80, dose_unit: "mg", frequency: "od", route: "oral", duration: null, purpose: null, is_dapt: false },
        { id: "90000000-0000-4000-8000-000000000004", drug_name: "GTN", dose: null, dose_unit: null, frequency: "prn", route: "sublingual", duration: null, purpose: "angina relief", is_dapt: false },
      ],
    },
  };
  return { ...base, ...overrides } as unknown as FhirSource;
}
