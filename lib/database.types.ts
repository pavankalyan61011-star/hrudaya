export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      complications: {
        Row: {
          complication: Database["public"]["Enums"]["complication_type"]
          created_at: string
          created_by: string | null
          id: string
          management: string
          onset: Database["public"]["Enums"]["complication_onset"] | null
          onset_at: string | null
          outcome: string | null
          procedure_id: string
          severity: Database["public"]["Enums"]["complication_severity"]
          updated_at: string
        }
        Insert: {
          complication: Database["public"]["Enums"]["complication_type"]
          created_at?: string
          created_by?: string | null
          id?: string
          management: string
          onset?: Database["public"]["Enums"]["complication_onset"] | null
          onset_at?: string | null
          outcome?: string | null
          procedure_id: string
          severity: Database["public"]["Enums"]["complication_severity"]
          updated_at?: string
        }
        Update: {
          complication?: Database["public"]["Enums"]["complication_type"]
          created_at?: string
          created_by?: string | null
          id?: string
          management?: string
          onset?: Database["public"]["Enums"]["complication_onset"] | null
          onset_at?: string | null
          outcome?: string | null
          procedure_id?: string
          severity?: Database["public"]["Enums"]["complication_severity"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "complications_procedure_id_fkey"
            columns: ["procedure_id"]
            isOneToOne: false
            referencedRelation: "procedures"
            referencedColumns: ["id"]
          },
        ]
      }
      devices_used: {
        Row: {
          category: Database["public"]["Enums"]["device_category"]
          created_at: string
          created_by: string | null
          diameter_mm: number
          expiry_date: string | null
          id: string
          inflation_atm: number | null
          intervention_id: string
          length_mm: number
          lot_number: string | null
          manufacturer: string | null
          phase: Database["public"]["Enums"]["device_phase"]
          product_name: string
          quantity: number
          udi: string | null
          updated_at: string
        }
        Insert: {
          category: Database["public"]["Enums"]["device_category"]
          created_at?: string
          created_by?: string | null
          diameter_mm: number
          expiry_date?: string | null
          id?: string
          inflation_atm?: number | null
          intervention_id: string
          length_mm: number
          lot_number?: string | null
          manufacturer?: string | null
          phase: Database["public"]["Enums"]["device_phase"]
          product_name: string
          quantity?: number
          udi?: string | null
          updated_at?: string
        }
        Update: {
          category?: Database["public"]["Enums"]["device_category"]
          created_at?: string
          created_by?: string | null
          diameter_mm?: number
          expiry_date?: string | null
          id?: string
          inflation_atm?: number | null
          intervention_id?: string
          length_mm?: number
          lot_number?: string | null
          manufacturer?: string | null
          phase?: Database["public"]["Enums"]["device_phase"]
          product_name?: string
          quantity?: number
          udi?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "devices_used_intervention_id_fkey"
            columns: ["intervention_id"]
            isOneToOne: false
            referencedRelation: "interventions"
            referencedColumns: ["id"]
          },
        ]
      }
      discharge_medications: {
        Row: {
          created_at: string
          created_by: string | null
          discharge_id: string
          dose: number | null
          dose_unit: Database["public"]["Enums"]["dose_unit"] | null
          drug_name: string
          duration: string | null
          frequency: Database["public"]["Enums"]["dose_frequency"]
          id: string
          is_dapt: boolean
          purpose: string | null
          route: Database["public"]["Enums"]["medication_route"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          discharge_id: string
          dose?: number | null
          dose_unit?: Database["public"]["Enums"]["dose_unit"] | null
          drug_name: string
          duration?: string | null
          frequency: Database["public"]["Enums"]["dose_frequency"]
          id?: string
          is_dapt?: boolean
          purpose?: string | null
          route?: Database["public"]["Enums"]["medication_route"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          discharge_id?: string
          dose?: number | null
          dose_unit?: Database["public"]["Enums"]["dose_unit"] | null
          drug_name?: string
          duration?: string | null
          frequency?: Database["public"]["Enums"]["dose_frequency"]
          id?: string
          is_dapt?: boolean
          purpose?: string | null
          route?: Database["public"]["Enums"]["medication_route"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "discharge_medications_discharge_id_fkey"
            columns: ["discharge_id"]
            isOneToOne: false
            referencedRelation: "discharges"
            referencedColumns: ["id"]
          },
        ]
      }
      discharge_summaries: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          approved_text: string | null
          approving_clinician_id: string | null
          audit_flags: Json
          draft_text: string
          generated_at: string
          generated_by: string | null
          id: string
          input_hash: string
          language: Database["public"]["Enums"]["summary_language"]
          model: string
          procedure_id: string
          prompt_version: string
          status: Database["public"]["Enums"]["summary_status"]
          tokens_in: number | null
          tokens_out: number | null
          version: number
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          approved_text?: string | null
          approving_clinician_id?: string | null
          audit_flags?: Json
          draft_text: string
          generated_at?: string
          generated_by?: string | null
          id?: string
          input_hash: string
          language: Database["public"]["Enums"]["summary_language"]
          model: string
          procedure_id: string
          prompt_version: string
          status?: Database["public"]["Enums"]["summary_status"]
          tokens_in?: number | null
          tokens_out?: number | null
          version: number
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          approved_text?: string | null
          approving_clinician_id?: string | null
          audit_flags?: Json
          draft_text?: string
          generated_at?: string
          generated_by?: string | null
          id?: string
          input_hash?: string
          language?: Database["public"]["Enums"]["summary_language"]
          model?: string
          procedure_id?: string
          prompt_version?: string
          status?: Database["public"]["Enums"]["summary_status"]
          tokens_in?: number | null
          tokens_out?: number | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "discharge_summaries_approving_clinician_id_fkey"
            columns: ["approving_clinician_id"]
            isOneToOne: false
            referencedRelation: "operators"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "discharge_summaries_procedure_id_fkey"
            columns: ["procedure_id"]
            isOneToOne: false
            referencedRelation: "procedures"
            referencedColumns: ["id"]
          },
        ]
      }
      discharges: {
        Row: {
          advice: string[]
          clinical_status: string
          created_at: string
          created_by: string | null
          dapt_planned_months: number | null
          dapt_review_date: string | null
          discharge_date: string
          discharged_at: string
          follow_up_clinic: string
          follow_up_date: string
          id: string
          procedure_id: string
          red_flags: string[]
          updated_at: string
        }
        Insert: {
          advice?: string[]
          clinical_status: string
          created_at?: string
          created_by?: string | null
          dapt_planned_months?: number | null
          dapt_review_date?: string | null
          discharge_date: string
          discharged_at: string
          follow_up_clinic: string
          follow_up_date: string
          id?: string
          procedure_id: string
          red_flags?: string[]
          updated_at?: string
        }
        Update: {
          advice?: string[]
          clinical_status?: string
          created_at?: string
          created_by?: string | null
          dapt_planned_months?: number | null
          dapt_review_date?: string | null
          discharge_date?: string
          discharged_at?: string
          follow_up_clinic?: string
          follow_up_date?: string
          id?: string
          procedure_id?: string
          red_flags?: string[]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "discharges_procedure_id_fkey"
            columns: ["procedure_id"]
            isOneToOne: true
            referencedRelation: "procedures"
            referencedColumns: ["id"]
          },
        ]
      }
      facilities: {
        Row: {
          cath_lab_name: string
          city: string
          created_at: string
          created_by: string | null
          hfr_id: string | null
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          cath_lab_name: string
          city: string
          created_at?: string
          created_by?: string | null
          hfr_id?: string | null
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          cath_lab_name?: string
          city?: string
          created_at?: string
          created_by?: string | null
          hfr_id?: string | null
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      interventions: {
        Row: {
          created_at: string
          created_by: string | null
          dissection: boolean
          guidewire: string
          id: string
          intervention_type: Database["public"]["Enums"]["intervention_type"]
          notes: string | null
          perforation: boolean
          procedure_id: string
          residual_stenosis_pct: number
          success: boolean
          timi_flow_post: number
          updated_at: string
          vessel_finding_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          dissection?: boolean
          guidewire: string
          id?: string
          intervention_type: Database["public"]["Enums"]["intervention_type"]
          notes?: string | null
          perforation?: boolean
          procedure_id: string
          residual_stenosis_pct: number
          success: boolean
          timi_flow_post: number
          updated_at?: string
          vessel_finding_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          dissection?: boolean
          guidewire?: string
          id?: string
          intervention_type?: Database["public"]["Enums"]["intervention_type"]
          notes?: string | null
          perforation?: boolean
          procedure_id?: string
          residual_stenosis_pct?: number
          success?: boolean
          timi_flow_post?: number
          updated_at?: string
          vessel_finding_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "interventions_procedure_id_fkey"
            columns: ["procedure_id"]
            isOneToOne: false
            referencedRelation: "procedures"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "interventions_vessel_finding_id_procedure_id_fkey"
            columns: ["vessel_finding_id", "procedure_id"]
            isOneToOne: false
            referencedRelation: "vessel_findings"
            referencedColumns: ["id", "procedure_id"]
          },
        ]
      }
      operators: {
        Row: {
          created_at: string
          created_by: string | null
          full_name: string
          hpr_id: string | null
          id: string
          role: Database["public"]["Enums"]["operator_role"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          full_name: string
          hpr_id?: string | null
          id?: string
          role: Database["public"]["Enums"]["operator_role"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          full_name?: string
          hpr_id?: string | null
          id?: string
          role?: Database["public"]["Enums"]["operator_role"]
          updated_at?: string
        }
        Relationships: []
      }
      patient_risk_factors: {
        Row: {
          created_at: string
          created_by: string | null
          detail: string | null
          factor: Database["public"]["Enums"]["risk_factor"]
          id: string
          patient_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          detail?: string | null
          factor: Database["public"]["Enums"]["risk_factor"]
          id?: string
          patient_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          detail?: string | null
          factor?: Database["public"]["Enums"]["risk_factor"]
          id?: string
          patient_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "patient_risk_factors_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      patients: {
        Row: {
          abha_address: string | null
          abha_number: string | null
          created_at: string
          created_by: string | null
          date_of_birth: string
          full_name: string
          id: string
          is_synthetic: boolean
          mobile: string | null
          mrn: string
          sex: Database["public"]["Enums"]["sex"]
          updated_at: string
        }
        Insert: {
          abha_address?: string | null
          abha_number?: string | null
          created_at?: string
          created_by?: string | null
          date_of_birth: string
          full_name: string
          id?: string
          is_synthetic?: boolean
          mobile?: string | null
          mrn: string
          sex: Database["public"]["Enums"]["sex"]
          updated_at?: string
        }
        Update: {
          abha_address?: string | null
          abha_number?: string | null
          created_at?: string
          created_by?: string | null
          date_of_birth?: string
          full_name?: string
          id?: string
          is_synthetic?: boolean
          mobile?: string | null
          mrn?: string
          sex?: Database["public"]["Enums"]["sex"]
          updated_at?: string
        }
        Relationships: []
      }
      procedure_events: {
        Row: {
          actor: string | null
          at: string
          event: string
          id: string
          payload: Json | null
          procedure_id: string
        }
        Insert: {
          actor?: string | null
          at?: string
          event: string
          id?: string
          payload?: Json | null
          procedure_id: string
        }
        Update: {
          actor?: string | null
          at?: string
          event?: string
          id?: string
          payload?: Json | null
          procedure_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "procedure_events_procedure_id_fkey"
            columns: ["procedure_id"]
            isOneToOne: false
            referencedRelation: "procedures"
            referencedColumns: ["id"]
          },
        ]
      }
      procedure_medications: {
        Row: {
          act_measured_at: string | null
          act_seconds: number | null
          administered_at: string | null
          created_at: string
          created_by: string | null
          dose: number | null
          dose_unit: Database["public"]["Enums"]["dose_unit"] | null
          drug_name: string
          id: string
          notes: string | null
          procedure_id: string
          route: Database["public"]["Enums"]["medication_route"]
          timing: Database["public"]["Enums"]["medication_timing"]
          updated_at: string
        }
        Insert: {
          act_measured_at?: string | null
          act_seconds?: number | null
          administered_at?: string | null
          created_at?: string
          created_by?: string | null
          dose?: number | null
          dose_unit?: Database["public"]["Enums"]["dose_unit"] | null
          drug_name: string
          id?: string
          notes?: string | null
          procedure_id: string
          route: Database["public"]["Enums"]["medication_route"]
          timing: Database["public"]["Enums"]["medication_timing"]
          updated_at?: string
        }
        Update: {
          act_measured_at?: string | null
          act_seconds?: number | null
          administered_at?: string | null
          created_at?: string
          created_by?: string | null
          dose?: number | null
          dose_unit?: Database["public"]["Enums"]["dose_unit"] | null
          drug_name?: string
          id?: string
          notes?: string | null
          procedure_id?: string
          route?: Database["public"]["Enums"]["medication_route"]
          timing?: Database["public"]["Enums"]["medication_timing"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "procedure_medications_procedure_id_fkey"
            columns: ["procedure_id"]
            isOneToOne: false
            referencedRelation: "procedures"
            referencedColumns: ["id"]
          },
        ]
      }
      procedures: {
        Row: {
          access_attempts: number | null
          access_site: Database["public"]["Enums"]["access_site"] | null
          access_ultrasound_guided: boolean | null
          admitted_at: string | null
          air_kerma_mgy: number | null
          allergies: string | null
          aortic_pressure_diastolic: number | null
          aortic_pressure_systolic: number | null
          baseline_bp_diastolic: number | null
          baseline_bp_systolic: number | null
          baseline_heart_rate: number | null
          case_code: string
          communication_notes: string | null
          consent_by_operator_id: string | null
          consent_obtained_at: string | null
          contrast_agent: string | null
          contrast_volume_ml: number | null
          created_at: string
          created_by: string | null
          creatinine_umol_l: number | null
          dap_gy_cm2: number | null
          diagnostic_catheters: string[]
          dominance: Database["public"]["Enums"]["coronary_dominance"] | null
          ecg_findings: string | null
          egfr: number | null
          ended_at: string | null
          facility_id: string | null
          findings_communicated_to_patient_at: string | null
          findings_communicated_to_team: boolean
          fluoroscopy_time_min: number | null
          guiding_catheter: string | null
          haemoglobin_g_dl: number | null
          haemostasis_method:
            | Database["public"]["Enums"]["haemostasis_method"]
            | null
          id: string
          immediate_care_notes: string | null
          indication: Database["public"]["Enums"]["indication"] | null
          lvedp_mmhg: number | null
          lvedp_status: Database["public"]["Enums"]["measurement_status"]
          lvef_measured_on: string | null
          lvef_pct: number | null
          lvef_source: Database["public"]["Enums"]["lvef_source"] | null
          lvef_status: Database["public"]["Enums"]["measurement_status"]
          outcome_summary: string | null
          patient_id: string
          platelets_x10e9_l: number | null
          post_procedure_condition:
            | Database["public"]["Enums"]["post_procedure_condition"]
            | null
          post_procedure_destination:
            | Database["public"]["Enums"]["post_procedure_destination"]
            | null
          presentation_notes: string | null
          primary_operator_id: string | null
          procedure_date: string | null
          procedure_type: Database["public"]["Enums"]["procedure_type"] | null
          referring_clinician: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          reviewing_clinician_id: string | null
          sheath_removed_at: string | null
          sheath_size_fr: number | null
          started_at: string | null
          status: Database["public"]["Enums"]["procedure_status"]
          timeout_by_operator_id: string | null
          timeout_completed_at: string | null
          troponin_elevated: boolean | null
          updated_at: string
          urgency: Database["public"]["Enums"]["urgency"] | null
        }
        Insert: {
          access_attempts?: number | null
          access_site?: Database["public"]["Enums"]["access_site"] | null
          access_ultrasound_guided?: boolean | null
          admitted_at?: string | null
          air_kerma_mgy?: number | null
          allergies?: string | null
          aortic_pressure_diastolic?: number | null
          aortic_pressure_systolic?: number | null
          baseline_bp_diastolic?: number | null
          baseline_bp_systolic?: number | null
          baseline_heart_rate?: number | null
          case_code: string
          communication_notes?: string | null
          consent_by_operator_id?: string | null
          consent_obtained_at?: string | null
          contrast_agent?: string | null
          contrast_volume_ml?: number | null
          created_at?: string
          created_by?: string | null
          creatinine_umol_l?: number | null
          dap_gy_cm2?: number | null
          diagnostic_catheters?: string[]
          dominance?: Database["public"]["Enums"]["coronary_dominance"] | null
          ecg_findings?: string | null
          egfr?: number | null
          ended_at?: string | null
          facility_id?: string | null
          findings_communicated_to_patient_at?: string | null
          findings_communicated_to_team?: boolean
          fluoroscopy_time_min?: number | null
          guiding_catheter?: string | null
          haemoglobin_g_dl?: number | null
          haemostasis_method?:
            | Database["public"]["Enums"]["haemostasis_method"]
            | null
          id?: string
          immediate_care_notes?: string | null
          indication?: Database["public"]["Enums"]["indication"] | null
          lvedp_mmhg?: number | null
          lvedp_status?: Database["public"]["Enums"]["measurement_status"]
          lvef_measured_on?: string | null
          lvef_pct?: number | null
          lvef_source?: Database["public"]["Enums"]["lvef_source"] | null
          lvef_status?: Database["public"]["Enums"]["measurement_status"]
          outcome_summary?: string | null
          patient_id: string
          platelets_x10e9_l?: number | null
          post_procedure_condition?:
            | Database["public"]["Enums"]["post_procedure_condition"]
            | null
          post_procedure_destination?:
            | Database["public"]["Enums"]["post_procedure_destination"]
            | null
          presentation_notes?: string | null
          primary_operator_id?: string | null
          procedure_date?: string | null
          procedure_type?: Database["public"]["Enums"]["procedure_type"] | null
          referring_clinician?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          reviewing_clinician_id?: string | null
          sheath_removed_at?: string | null
          sheath_size_fr?: number | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["procedure_status"]
          timeout_by_operator_id?: string | null
          timeout_completed_at?: string | null
          troponin_elevated?: boolean | null
          updated_at?: string
          urgency?: Database["public"]["Enums"]["urgency"] | null
        }
        Update: {
          access_attempts?: number | null
          access_site?: Database["public"]["Enums"]["access_site"] | null
          access_ultrasound_guided?: boolean | null
          admitted_at?: string | null
          air_kerma_mgy?: number | null
          allergies?: string | null
          aortic_pressure_diastolic?: number | null
          aortic_pressure_systolic?: number | null
          baseline_bp_diastolic?: number | null
          baseline_bp_systolic?: number | null
          baseline_heart_rate?: number | null
          case_code?: string
          communication_notes?: string | null
          consent_by_operator_id?: string | null
          consent_obtained_at?: string | null
          contrast_agent?: string | null
          contrast_volume_ml?: number | null
          created_at?: string
          created_by?: string | null
          creatinine_umol_l?: number | null
          dap_gy_cm2?: number | null
          diagnostic_catheters?: string[]
          dominance?: Database["public"]["Enums"]["coronary_dominance"] | null
          ecg_findings?: string | null
          egfr?: number | null
          ended_at?: string | null
          facility_id?: string | null
          findings_communicated_to_patient_at?: string | null
          findings_communicated_to_team?: boolean
          fluoroscopy_time_min?: number | null
          guiding_catheter?: string | null
          haemoglobin_g_dl?: number | null
          haemostasis_method?:
            | Database["public"]["Enums"]["haemostasis_method"]
            | null
          id?: string
          immediate_care_notes?: string | null
          indication?: Database["public"]["Enums"]["indication"] | null
          lvedp_mmhg?: number | null
          lvedp_status?: Database["public"]["Enums"]["measurement_status"]
          lvef_measured_on?: string | null
          lvef_pct?: number | null
          lvef_source?: Database["public"]["Enums"]["lvef_source"] | null
          lvef_status?: Database["public"]["Enums"]["measurement_status"]
          outcome_summary?: string | null
          patient_id?: string
          platelets_x10e9_l?: number | null
          post_procedure_condition?:
            | Database["public"]["Enums"]["post_procedure_condition"]
            | null
          post_procedure_destination?:
            | Database["public"]["Enums"]["post_procedure_destination"]
            | null
          presentation_notes?: string | null
          primary_operator_id?: string | null
          procedure_date?: string | null
          procedure_type?: Database["public"]["Enums"]["procedure_type"] | null
          referring_clinician?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          reviewing_clinician_id?: string | null
          sheath_removed_at?: string | null
          sheath_size_fr?: number | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["procedure_status"]
          timeout_by_operator_id?: string | null
          timeout_completed_at?: string | null
          troponin_elevated?: boolean | null
          updated_at?: string
          urgency?: Database["public"]["Enums"]["urgency"] | null
        }
        Relationships: [
          {
            foreignKeyName: "procedures_consent_by_operator_id_fkey"
            columns: ["consent_by_operator_id"]
            isOneToOne: false
            referencedRelation: "operators"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "procedures_facility_id_fkey"
            columns: ["facility_id"]
            isOneToOne: false
            referencedRelation: "facilities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "procedures_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "procedures_primary_operator_id_fkey"
            columns: ["primary_operator_id"]
            isOneToOne: false
            referencedRelation: "operators"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "procedures_reviewing_clinician_id_fkey"
            columns: ["reviewing_clinician_id"]
            isOneToOne: false
            referencedRelation: "operators"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "procedures_timeout_by_operator_id_fkey"
            columns: ["timeout_by_operator_id"]
            isOneToOne: false
            referencedRelation: "operators"
            referencedColumns: ["id"]
          },
        ]
      }
      vessel_findings: {
        Row: {
          bifurcation: boolean
          calcification:
            | Database["public"]["Enums"]["calcification_grade"]
            | null
          created_at: string
          created_by: string | null
          id: string
          is_culprit: boolean
          lesion_length_mm: number | null
          lesion_notes: string | null
          procedure_id: string
          segment: Database["public"]["Enums"]["vessel_segment"] | null
          stenosis_pct: number
          thrombus: boolean
          timi_flow: number
          updated_at: string
          vessel: Database["public"]["Enums"]["vessel"]
        }
        Insert: {
          bifurcation?: boolean
          calcification?:
            | Database["public"]["Enums"]["calcification_grade"]
            | null
          created_at?: string
          created_by?: string | null
          id?: string
          is_culprit?: boolean
          lesion_length_mm?: number | null
          lesion_notes?: string | null
          procedure_id: string
          segment?: Database["public"]["Enums"]["vessel_segment"] | null
          stenosis_pct: number
          thrombus?: boolean
          timi_flow: number
          updated_at?: string
          vessel: Database["public"]["Enums"]["vessel"]
        }
        Update: {
          bifurcation?: boolean
          calcification?:
            | Database["public"]["Enums"]["calcification_grade"]
            | null
          created_at?: string
          created_by?: string | null
          id?: string
          is_culprit?: boolean
          lesion_length_mm?: number | null
          lesion_notes?: string | null
          procedure_id?: string
          segment?: Database["public"]["Enums"]["vessel_segment"] | null
          stenosis_pct?: number
          thrombus?: boolean
          timi_flow?: number
          updated_at?: string
          vessel?: Database["public"]["Enums"]["vessel"]
        }
        Relationships: [
          {
            foreignKeyName: "vessel_findings_procedure_id_fkey"
            columns: ["procedure_id"]
            isOneToOne: false
            referencedRelation: "procedures"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      procedure_is_draft: { Args: { p_procedure_id: string }; Returns: boolean }
    }
    Enums: {
      access_site:
        | "right_radial"
        | "left_radial"
        | "right_femoral"
        | "left_femoral"
        | "right_ulnar"
        | "left_ulnar"
        | "other"
      calcification_grade: "none" | "mild" | "moderate" | "severe"
      complication_onset: "intraprocedural" | "inpatient"
      complication_severity: "minor" | "major"
      complication_type:
        | "dissection"
        | "perforation"
        | "no_reflow"
        | "access_site_haematoma"
        | "radial_occlusion"
        | "contrast_nephropathy"
        | "arrhythmia"
        | "cardiac_tamponade"
        | "stroke"
        | "death"
        | "other"
      coronary_dominance: "right" | "left" | "co_dominant"
      device_category:
        | "stent"
        | "balloon_sc"
        | "balloon_nc"
        | "guidewire"
        | "other"
        | "balloon_dcb"
        | "balloon_scoring"
      device_phase: "pre_dilation" | "deployment" | "post_dilation" | "other"
      dose_frequency: "od" | "bd" | "tds" | "qds" | "prn" | "weekly"
      dose_unit: "mg" | "mcg" | "g" | "ml" | "iu" | "units" | "units_per_kg"
      haemostasis_method:
        | "radial_compression_band"
        | "manual_compression"
        | "vascular_closure_device"
        | "other"
      indication:
        | "stemi"
        | "nstemi"
        | "unstable_angina"
        | "stable_angina"
        | "positive_stress_test"
        | "pre_op_assessment"
        | "cardiomyopathy_workup"
        | "other"
      intervention_type:
        | "pci_des"
        | "pci_bms"
        | "poba"
        | "drug_coated_balloon"
        | "thrombectomy"
        | "rotational_atherectomy"
        | "other"
      lvef_source: "echo" | "ventriculography" | "mri" | "other"
      measurement_status: "not_recorded" | "not_performed" | "recorded"
      medication_route:
        | "oral"
        | "sc"
        | "iv"
        | "topical"
        | "sublingual"
        | "intra_arterial"
      medication_timing: "pre_procedure" | "intra_procedure" | "post_procedure"
      operator_role:
        | "interventional_cardiologist"
        | "fellow"
        | "cath_lab_technologist"
        | "nurse"
      post_procedure_condition: "stable" | "unstable" | "deceased"
      post_procedure_destination:
        | "ward"
        | "ccu"
        | "icu"
        | "day_case_recovery"
        | "transferred"
      procedure_status: "draft" | "completed" | "reviewed"
      procedure_type: "diagnostic_angiography" | "pci" | "angiography_and_pci"
      risk_factor:
        | "hypertension"
        | "diabetes_t2"
        | "diabetes_t1"
        | "dyslipidaemia"
        | "smoking"
        | "ex_smoker"
        | "family_history"
        | "ckd"
        | "obesity"
        | "prior_pci"
        | "prior_cabg"
        | "prior_mi"
        | "other"
      sex: "male" | "female" | "other"
      summary_language: "en" | "te" | "hi" | "ta" | "kn" | "ml"
      summary_status: "draft" | "approved"
      urgency: "elective" | "urgent" | "emergency"
      vessel:
        | "lmca"
        | "lad"
        | "d1"
        | "d2"
        | "lcx"
        | "om1"
        | "om2"
        | "ramus"
        | "rca"
        | "pda"
        | "plv"
        | "graft"
        | "other"
      vessel_segment: "ostial" | "proximal" | "mid" | "distal"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      access_site: [
        "right_radial",
        "left_radial",
        "right_femoral",
        "left_femoral",
        "right_ulnar",
        "left_ulnar",
        "other",
      ],
      calcification_grade: ["none", "mild", "moderate", "severe"],
      complication_onset: ["intraprocedural", "inpatient"],
      complication_severity: ["minor", "major"],
      complication_type: [
        "dissection",
        "perforation",
        "no_reflow",
        "access_site_haematoma",
        "radial_occlusion",
        "contrast_nephropathy",
        "arrhythmia",
        "cardiac_tamponade",
        "stroke",
        "death",
        "other",
      ],
      coronary_dominance: ["right", "left", "co_dominant"],
      device_category: [
        "stent",
        "balloon_sc",
        "balloon_nc",
        "guidewire",
        "other",
        "balloon_dcb",
        "balloon_scoring",
      ],
      device_phase: ["pre_dilation", "deployment", "post_dilation", "other"],
      dose_frequency: ["od", "bd", "tds", "qds", "prn", "weekly"],
      dose_unit: ["mg", "mcg", "g", "ml", "iu", "units", "units_per_kg"],
      haemostasis_method: [
        "radial_compression_band",
        "manual_compression",
        "vascular_closure_device",
        "other",
      ],
      indication: [
        "stemi",
        "nstemi",
        "unstable_angina",
        "stable_angina",
        "positive_stress_test",
        "pre_op_assessment",
        "cardiomyopathy_workup",
        "other",
      ],
      intervention_type: [
        "pci_des",
        "pci_bms",
        "poba",
        "drug_coated_balloon",
        "thrombectomy",
        "rotational_atherectomy",
        "other",
      ],
      lvef_source: ["echo", "ventriculography", "mri", "other"],
      measurement_status: ["not_recorded", "not_performed", "recorded"],
      medication_route: [
        "oral",
        "sc",
        "iv",
        "topical",
        "sublingual",
        "intra_arterial",
      ],
      medication_timing: ["pre_procedure", "intra_procedure", "post_procedure"],
      operator_role: [
        "interventional_cardiologist",
        "fellow",
        "cath_lab_technologist",
        "nurse",
      ],
      post_procedure_condition: ["stable", "unstable", "deceased"],
      post_procedure_destination: [
        "ward",
        "ccu",
        "icu",
        "day_case_recovery",
        "transferred",
      ],
      procedure_status: ["draft", "completed", "reviewed"],
      procedure_type: ["diagnostic_angiography", "pci", "angiography_and_pci"],
      risk_factor: [
        "hypertension",
        "diabetes_t2",
        "diabetes_t1",
        "dyslipidaemia",
        "smoking",
        "ex_smoker",
        "family_history",
        "ckd",
        "obesity",
        "prior_pci",
        "prior_cabg",
        "prior_mi",
        "other",
      ],
      sex: ["male", "female", "other"],
      summary_language: ["en", "te", "hi", "ta", "kn", "ml"],
      summary_status: ["draft", "approved"],
      urgency: ["elective", "urgent", "emergency"],
      vessel: [
        "lmca",
        "lad",
        "d1",
        "d2",
        "lcx",
        "om1",
        "om2",
        "ramus",
        "rca",
        "pda",
        "plv",
        "graft",
        "other",
      ],
      vessel_segment: ["ostial", "proximal", "mid", "distal"],
    },
  },
} as const

