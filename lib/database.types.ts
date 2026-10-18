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
          grade: string | null
          id: string
          management: string
          occurred_at: string | null
          onset: Database["public"]["Enums"]["complication_onset"] | null
          onset_at: string | null
          outcome: string | null
          procedure_id: string
          resolution: Database["public"]["Enums"]["event_resolution"] | null
          severity: Database["public"]["Enums"]["complication_severity"]
          treatment_other: string | null
          treatments: Database["public"]["Enums"]["event_treatment"][]
          updated_at: string
        }
        Insert: {
          complication: Database["public"]["Enums"]["complication_type"]
          created_at?: string
          created_by?: string | null
          grade?: string | null
          id?: string
          management: string
          occurred_at?: string | null
          onset?: Database["public"]["Enums"]["complication_onset"] | null
          onset_at?: string | null
          outcome?: string | null
          procedure_id: string
          resolution?: Database["public"]["Enums"]["event_resolution"] | null
          severity: Database["public"]["Enums"]["complication_severity"]
          treatment_other?: string | null
          treatments?: Database["public"]["Enums"]["event_treatment"][]
          updated_at?: string
        }
        Update: {
          complication?: Database["public"]["Enums"]["complication_type"]
          created_at?: string
          created_by?: string | null
          grade?: string | null
          id?: string
          management?: string
          occurred_at?: string | null
          onset?: Database["public"]["Enums"]["complication_onset"] | null
          onset_at?: string | null
          outcome?: string | null
          procedure_id?: string
          resolution?: Database["public"]["Enums"]["event_resolution"] | null
          severity?: Database["public"]["Enums"]["complication_severity"]
          treatment_other?: string | null
          treatments?: Database["public"]["Enums"]["event_treatment"][]
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
      device_inflations: {
        Row: {
          device_id: string
          duration_s: number | null
          id: string
          notes: string | null
          pressure_atm: number
          recorded_at: string
          recorded_by: string | null
          sequence: number
          source: Database["public"]["Enums"]["value_source"]
        }
        Insert: {
          device_id: string
          duration_s?: number | null
          id?: string
          notes?: string | null
          pressure_atm: number
          recorded_at?: string
          recorded_by?: string | null
          sequence: number
          source?: Database["public"]["Enums"]["value_source"]
        }
        Update: {
          device_id?: string
          duration_s?: number | null
          id?: string
          notes?: string | null
          pressure_atm?: number
          recorded_at?: string
          recorded_by?: string | null
          sequence?: number
          source?: Database["public"]["Enums"]["value_source"]
        }
        Relationships: [
          {
            foreignKeyName: "device_inflations_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "devices_used"
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
      grafts: {
        Row: {
          cabg_year: number | null
          graft_type: Database["public"]["Enums"]["graft_type"]
          id: string
          lesion_location:
            | Database["public"]["Enums"]["graft_lesion_location"]
            | null
          notes: string | null
          patency: Database["public"]["Enums"]["graft_patency"]
          procedure_id: string
          recorded_at: string
          recorded_by: string | null
          sequential: boolean
          source: Database["public"]["Enums"]["value_source"]
          stenosis_pct: number | null
          target_vessel: Database["public"]["Enums"]["vessel"]
        }
        Insert: {
          cabg_year?: number | null
          graft_type: Database["public"]["Enums"]["graft_type"]
          id?: string
          lesion_location?:
            | Database["public"]["Enums"]["graft_lesion_location"]
            | null
          notes?: string | null
          patency: Database["public"]["Enums"]["graft_patency"]
          procedure_id: string
          recorded_at?: string
          recorded_by?: string | null
          sequential?: boolean
          source?: Database["public"]["Enums"]["value_source"]
          stenosis_pct?: number | null
          target_vessel: Database["public"]["Enums"]["vessel"]
        }
        Update: {
          cabg_year?: number | null
          graft_type?: Database["public"]["Enums"]["graft_type"]
          id?: string
          lesion_location?:
            | Database["public"]["Enums"]["graft_lesion_location"]
            | null
          notes?: string | null
          patency?: Database["public"]["Enums"]["graft_patency"]
          procedure_id?: string
          recorded_at?: string
          recorded_by?: string | null
          sequential?: boolean
          source?: Database["public"]["Enums"]["value_source"]
          stenosis_pct?: number | null
          target_vessel?: Database["public"]["Enums"]["vessel"]
        }
        Relationships: [
          {
            foreignKeyName: "grafts_procedure_id_fkey"
            columns: ["procedure_id"]
            isOneToOne: false
            referencedRelation: "procedures"
            referencedColumns: ["id"]
          },
        ]
      }
      haemodynamics: {
        Row: {
          ao_diastolic: number | null
          ao_mean: number | null
          ao_systolic: number | null
          heart_rate_at_measurement: number | null
          id: string
          left_status: Database["public"]["Enums"]["measurement_status"]
          lv_edp: number | null
          lv_systolic: number | null
          notes: string | null
          procedure_id: string
          recorded_at: string
          recorded_by: string | null
          rhythm: Database["public"]["Enums"]["heart_rhythm"] | null
          source: Database["public"]["Enums"]["value_source"]
        }
        Insert: {
          ao_diastolic?: number | null
          ao_mean?: number | null
          ao_systolic?: number | null
          heart_rate_at_measurement?: number | null
          id?: string
          left_status?: Database["public"]["Enums"]["measurement_status"]
          lv_edp?: number | null
          lv_systolic?: number | null
          notes?: string | null
          procedure_id: string
          recorded_at?: string
          recorded_by?: string | null
          rhythm?: Database["public"]["Enums"]["heart_rhythm"] | null
          source?: Database["public"]["Enums"]["value_source"]
        }
        Update: {
          ao_diastolic?: number | null
          ao_mean?: number | null
          ao_systolic?: number | null
          heart_rate_at_measurement?: number | null
          id?: string
          left_status?: Database["public"]["Enums"]["measurement_status"]
          lv_edp?: number | null
          lv_systolic?: number | null
          notes?: string | null
          procedure_id?: string
          recorded_at?: string
          recorded_by?: string | null
          rhythm?: Database["public"]["Enums"]["heart_rhythm"] | null
          source?: Database["public"]["Enums"]["value_source"]
        }
        Relationships: [
          {
            foreignKeyName: "haemodynamics_procedure_id_fkey"
            columns: ["procedure_id"]
            isOneToOne: true
            referencedRelation: "procedures"
            referencedColumns: ["id"]
          },
        ]
      }
      in_hospital_outcomes: {
        Row: {
          aki: Database["public"]["Enums"]["tri_state"]
          bleeding: Database["public"]["Enums"]["tri_state"]
          bleeding_barc: number | null
          bleeding_barc_sub: string | null
          cardiac_tamponade: Database["public"]["Enums"]["tri_state"]
          creatinine_post_umol_l: number | null
          death: Database["public"]["Enums"]["tri_state"]
          death_cause: string | null
          disposition: Database["public"]["Enums"]["disposition"] | null
          emergency_cabg: Database["public"]["Enums"]["tri_state"]
          event_links: string[]
          id: string
          mi: Database["public"]["Enums"]["tri_state"]
          new_dialysis: Database["public"]["Enums"]["tri_state"]
          notes: string | null
          procedure_id: string
          recorded_at: string
          recorded_by: string | null
          source: Database["public"]["Enums"]["value_source"]
          stroke: Database["public"]["Enums"]["tri_state"]
          transfusion: Database["public"]["Enums"]["tri_state"]
          unplanned_repeat_pci: Database["public"]["Enums"]["tri_state"]
          vascular_complications: Database["public"]["Enums"]["vascular_complication"][]
          vascular_status: Database["public"]["Enums"]["tri_state"]
        }
        Insert: {
          aki?: Database["public"]["Enums"]["tri_state"]
          bleeding?: Database["public"]["Enums"]["tri_state"]
          bleeding_barc?: number | null
          bleeding_barc_sub?: string | null
          cardiac_tamponade?: Database["public"]["Enums"]["tri_state"]
          creatinine_post_umol_l?: number | null
          death?: Database["public"]["Enums"]["tri_state"]
          death_cause?: string | null
          disposition?: Database["public"]["Enums"]["disposition"] | null
          emergency_cabg?: Database["public"]["Enums"]["tri_state"]
          event_links?: string[]
          id?: string
          mi?: Database["public"]["Enums"]["tri_state"]
          new_dialysis?: Database["public"]["Enums"]["tri_state"]
          notes?: string | null
          procedure_id: string
          recorded_at?: string
          recorded_by?: string | null
          source?: Database["public"]["Enums"]["value_source"]
          stroke?: Database["public"]["Enums"]["tri_state"]
          transfusion?: Database["public"]["Enums"]["tri_state"]
          unplanned_repeat_pci?: Database["public"]["Enums"]["tri_state"]
          vascular_complications?: Database["public"]["Enums"]["vascular_complication"][]
          vascular_status?: Database["public"]["Enums"]["tri_state"]
        }
        Update: {
          aki?: Database["public"]["Enums"]["tri_state"]
          bleeding?: Database["public"]["Enums"]["tri_state"]
          bleeding_barc?: number | null
          bleeding_barc_sub?: string | null
          cardiac_tamponade?: Database["public"]["Enums"]["tri_state"]
          creatinine_post_umol_l?: number | null
          death?: Database["public"]["Enums"]["tri_state"]
          death_cause?: string | null
          disposition?: Database["public"]["Enums"]["disposition"] | null
          emergency_cabg?: Database["public"]["Enums"]["tri_state"]
          event_links?: string[]
          id?: string
          mi?: Database["public"]["Enums"]["tri_state"]
          new_dialysis?: Database["public"]["Enums"]["tri_state"]
          notes?: string | null
          procedure_id?: string
          recorded_at?: string
          recorded_by?: string | null
          source?: Database["public"]["Enums"]["value_source"]
          stroke?: Database["public"]["Enums"]["tri_state"]
          transfusion?: Database["public"]["Enums"]["tri_state"]
          unplanned_repeat_pci?: Database["public"]["Enums"]["tri_state"]
          vascular_complications?: Database["public"]["Enums"]["vascular_complication"][]
          vascular_status?: Database["public"]["Enums"]["tri_state"]
        }
        Relationships: [
          {
            foreignKeyName: "in_hospital_outcomes_procedure_id_fkey"
            columns: ["procedure_id"]
            isOneToOne: true
            referencedRelation: "procedures"
            referencedColumns: ["id"]
          },
        ]
      }
      interventions: {
        Row: {
          bifurcation_strategy:
            | Database["public"]["Enums"]["bifurcation_strategy"]
            | null
          bifurcation_strategy_other: string | null
          created_at: string
          created_by: string | null
          dissection: boolean
          dissection_grade:
            | Database["public"]["Enums"]["dissection_grade"]
            | null
          failure_reason:
            | Database["public"]["Enums"]["pci_failure_reason"]
            | null
          guidewire: string
          guiding_catheter: string | null
          id: string
          intervention_type: Database["public"]["Enums"]["intervention_type"]
          no_reflow: boolean
          notes: string | null
          perforation: boolean
          perforation_class:
            | Database["public"]["Enums"]["perforation_class"]
            | null
          procedure_id: string
          residual_stenosis_pct: number
          stent_overlap: boolean
          success: boolean
          technique_other: string | null
          techniques: Database["public"]["Enums"]["technique"][]
          timi_flow_post: number
          total_stent_length_mm: number | null
          updated_at: string
          vessel_finding_id: string
          wires: string[]
        }
        Insert: {
          bifurcation_strategy?:
            | Database["public"]["Enums"]["bifurcation_strategy"]
            | null
          bifurcation_strategy_other?: string | null
          created_at?: string
          created_by?: string | null
          dissection?: boolean
          dissection_grade?:
            | Database["public"]["Enums"]["dissection_grade"]
            | null
          failure_reason?:
            | Database["public"]["Enums"]["pci_failure_reason"]
            | null
          guidewire: string
          guiding_catheter?: string | null
          id?: string
          intervention_type: Database["public"]["Enums"]["intervention_type"]
          no_reflow?: boolean
          notes?: string | null
          perforation?: boolean
          perforation_class?:
            | Database["public"]["Enums"]["perforation_class"]
            | null
          procedure_id: string
          residual_stenosis_pct: number
          stent_overlap?: boolean
          success: boolean
          technique_other?: string | null
          techniques?: Database["public"]["Enums"]["technique"][]
          timi_flow_post: number
          total_stent_length_mm?: number | null
          updated_at?: string
          vessel_finding_id: string
          wires?: string[]
        }
        Update: {
          bifurcation_strategy?:
            | Database["public"]["Enums"]["bifurcation_strategy"]
            | null
          bifurcation_strategy_other?: string | null
          created_at?: string
          created_by?: string | null
          dissection?: boolean
          dissection_grade?:
            | Database["public"]["Enums"]["dissection_grade"]
            | null
          failure_reason?:
            | Database["public"]["Enums"]["pci_failure_reason"]
            | null
          guidewire?: string
          guiding_catheter?: string | null
          id?: string
          intervention_type?: Database["public"]["Enums"]["intervention_type"]
          no_reflow?: boolean
          notes?: string | null
          perforation?: boolean
          perforation_class?:
            | Database["public"]["Enums"]["perforation_class"]
            | null
          procedure_id?: string
          residual_stenosis_pct?: number
          stent_overlap?: boolean
          success?: boolean
          technique_other?: string | null
          techniques?: Database["public"]["Enums"]["technique"][]
          timi_flow_post?: number
          total_stent_length_mm?: number | null
          updated_at?: string
          vessel_finding_id?: string
          wires?: string[]
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
      intravascular_imaging: {
        Row: {
          calcium_arc_deg: number | null
          calcium_thickness_mm: number | null
          edge_dissection: boolean | null
          eem_area_mm2: number | null
          id: string
          image_instance_uid: string | null
          image_series_uid: string | null
          image_study_uid: string | null
          lipid_arc_deg: number | null
          malapposition: boolean | null
          max_lcbi_4mm: number | null
          method: Database["public"]["Enums"]["imaging_method"] | null
          mla_frame: number | null
          mla_mm2: number | null
          modality: Database["public"]["Enums"]["imaging_modality"]
          msa_mm2: number | null
          notes: string | null
          phase: Database["public"]["Enums"]["measurement_phase"]
          plaque_burden_pct: number | null
          pullback_length_mm: number | null
          recorded_at: string
          recorded_by: string | null
          source: Database["public"]["Enums"]["value_source"]
          stent_expansion_pct: number | null
          vessel_finding_id: string
        }
        Insert: {
          calcium_arc_deg?: number | null
          calcium_thickness_mm?: number | null
          edge_dissection?: boolean | null
          eem_area_mm2?: number | null
          id?: string
          image_instance_uid?: string | null
          image_series_uid?: string | null
          image_study_uid?: string | null
          lipid_arc_deg?: number | null
          malapposition?: boolean | null
          max_lcbi_4mm?: number | null
          method?: Database["public"]["Enums"]["imaging_method"] | null
          mla_frame?: number | null
          mla_mm2?: number | null
          modality: Database["public"]["Enums"]["imaging_modality"]
          msa_mm2?: number | null
          notes?: string | null
          phase: Database["public"]["Enums"]["measurement_phase"]
          plaque_burden_pct?: number | null
          pullback_length_mm?: number | null
          recorded_at?: string
          recorded_by?: string | null
          source?: Database["public"]["Enums"]["value_source"]
          stent_expansion_pct?: number | null
          vessel_finding_id: string
        }
        Update: {
          calcium_arc_deg?: number | null
          calcium_thickness_mm?: number | null
          edge_dissection?: boolean | null
          eem_area_mm2?: number | null
          id?: string
          image_instance_uid?: string | null
          image_series_uid?: string | null
          image_study_uid?: string | null
          lipid_arc_deg?: number | null
          malapposition?: boolean | null
          max_lcbi_4mm?: number | null
          method?: Database["public"]["Enums"]["imaging_method"] | null
          mla_frame?: number | null
          mla_mm2?: number | null
          modality?: Database["public"]["Enums"]["imaging_modality"]
          msa_mm2?: number | null
          notes?: string | null
          phase?: Database["public"]["Enums"]["measurement_phase"]
          plaque_burden_pct?: number | null
          pullback_length_mm?: number | null
          recorded_at?: string
          recorded_by?: string | null
          source?: Database["public"]["Enums"]["value_source"]
          stent_expansion_pct?: number | null
          vessel_finding_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "intravascular_imaging_vessel_finding_id_fkey"
            columns: ["vessel_finding_id"]
            isOneToOne: false
            referencedRelation: "vessel_findings"
            referencedColumns: ["id"]
          },
        ]
      }
      lesion_physiology: {
        Row: {
          agent_dose: string | null
          decision: Database["public"]["Enums"]["physiology_decision"] | null
          hyperaemic_agent:
            | Database["public"]["Enums"]["hyperaemic_agent"]
            | null
          id: string
          image_series_uid: string | null
          image_study_uid: string | null
          index: Database["public"]["Enums"]["physiology_index"]
          method: Database["public"]["Enums"]["physiology_method"] | null
          notes: string | null
          phase: Database["public"]["Enums"]["measurement_phase"]
          recorded_at: string
          recorded_by: string | null
          source: Database["public"]["Enums"]["value_source"]
          value: number
          vessel_finding_id: string
        }
        Insert: {
          agent_dose?: string | null
          decision?: Database["public"]["Enums"]["physiology_decision"] | null
          hyperaemic_agent?:
            | Database["public"]["Enums"]["hyperaemic_agent"]
            | null
          id?: string
          image_series_uid?: string | null
          image_study_uid?: string | null
          index: Database["public"]["Enums"]["physiology_index"]
          method?: Database["public"]["Enums"]["physiology_method"] | null
          notes?: string | null
          phase: Database["public"]["Enums"]["measurement_phase"]
          recorded_at?: string
          recorded_by?: string | null
          source?: Database["public"]["Enums"]["value_source"]
          value: number
          vessel_finding_id: string
        }
        Update: {
          agent_dose?: string | null
          decision?: Database["public"]["Enums"]["physiology_decision"] | null
          hyperaemic_agent?:
            | Database["public"]["Enums"]["hyperaemic_agent"]
            | null
          id?: string
          image_series_uid?: string | null
          image_study_uid?: string | null
          index?: Database["public"]["Enums"]["physiology_index"]
          method?: Database["public"]["Enums"]["physiology_method"] | null
          notes?: string | null
          phase?: Database["public"]["Enums"]["measurement_phase"]
          recorded_at?: string
          recorded_by?: string | null
          source?: Database["public"]["Enums"]["value_source"]
          value?: number
          vessel_finding_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lesion_physiology_vessel_finding_id_fkey"
            columns: ["vessel_finding_id"]
            isOneToOne: false
            referencedRelation: "vessel_findings"
            referencedColumns: ["id"]
          },
        ]
      }
      lv_wall_motion: {
        Row: {
          id: string
          motion: Database["public"]["Enums"]["wall_motion"]
          notes: string | null
          procedure_id: string
          recorded_at: string
          recorded_by: string | null
          segment: number
          source: Database["public"]["Enums"]["value_source"]
        }
        Insert: {
          id?: string
          motion: Database["public"]["Enums"]["wall_motion"]
          notes?: string | null
          procedure_id: string
          recorded_at?: string
          recorded_by?: string | null
          segment: number
          source?: Database["public"]["Enums"]["value_source"]
        }
        Update: {
          id?: string
          motion?: Database["public"]["Enums"]["wall_motion"]
          notes?: string | null
          procedure_id?: string
          recorded_at?: string
          recorded_by?: string | null
          segment?: number
          source?: Database["public"]["Enums"]["value_source"]
        }
        Relationships: [
          {
            foreignKeyName: "lv_wall_motion_procedure_id_fkey"
            columns: ["procedure_id"]
            isOneToOne: false
            referencedRelation: "procedures"
            referencedColumns: ["id"]
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
      procedure_amendments: {
        Row: {
          amendment_no: number
          changes: Json | null
          closed_at: string | null
          closed_by: string | null
          id: string
          opened_at: string
          opened_by: string | null
          previous_reviewed_at: string
          previous_reviewing_clinician_id: string | null
          procedure_id: string
          reason: string
          reviewing_clinician_id: string | null
          snapshot: Json
          status: Database["public"]["Enums"]["amendment_status"]
        }
        Insert: {
          amendment_no: number
          changes?: Json | null
          closed_at?: string | null
          closed_by?: string | null
          id?: string
          opened_at?: string
          opened_by?: string | null
          previous_reviewed_at: string
          previous_reviewing_clinician_id?: string | null
          procedure_id: string
          reason: string
          reviewing_clinician_id?: string | null
          snapshot: Json
          status?: Database["public"]["Enums"]["amendment_status"]
        }
        Update: {
          amendment_no?: number
          changes?: Json | null
          closed_at?: string | null
          closed_by?: string | null
          id?: string
          opened_at?: string
          opened_by?: string | null
          previous_reviewed_at?: string
          previous_reviewing_clinician_id?: string | null
          procedure_id?: string
          reason?: string
          reviewing_clinician_id?: string | null
          snapshot?: Json
          status?: Database["public"]["Enums"]["amendment_status"]
        }
        Relationships: [
          {
            foreignKeyName: "procedure_amendments_previous_reviewing_clinician_id_fkey"
            columns: ["previous_reviewing_clinician_id"]
            isOneToOne: false
            referencedRelation: "operators"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "procedure_amendments_procedure_id_fkey"
            columns: ["procedure_id"]
            isOneToOne: false
            referencedRelation: "procedures"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "procedure_amendments_reviewing_clinician_id_fkey"
            columns: ["reviewing_clinician_id"]
            isOneToOne: false
            referencedRelation: "operators"
            referencedColumns: ["id"]
          },
        ]
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
          cardiac_arrest_pre_procedure: boolean
          cardiogenic_shock: boolean
          case_code: string
          ccs_class: number | null
          communication_notes: string | null
          consent_by_operator_id: string | null
          consent_obtained_at: string | null
          contrast_agent: string | null
          contrast_volume_ml: number | null
          created_at: string
          created_by: string | null
          creatinine_umol_l: number | null
          dap_gy_cm2: number | null
          device_time_at: string | null
          diagnostic_catheters: string[]
          dominance: Database["public"]["Enums"]["coronary_dominance"] | null
          door_at: string | null
          ecg_findings: string | null
          egfr: number | null
          ended_at: string | null
          facility_id: string | null
          findings_communicated_to_patient_at: string | null
          findings_communicated_to_team: boolean
          first_medical_contact_at: string | null
          fluoroscopy_time_min: number | null
          guiding_catheter: string | null
          haemoglobin_g_dl: number | null
          haemostasis_method:
            | Database["public"]["Enums"]["haemostasis_method"]
            | null
          id: string
          immediate_care_notes: string | null
          indication: Database["public"]["Enums"]["indication"] | null
          lv_gram_performed: boolean | null
          lvedp_mmhg: number | null
          lvedp_status: Database["public"]["Enums"]["measurement_status"]
          lvef_measured_on: string | null
          lvef_pct: number | null
          lvef_source: Database["public"]["Enums"]["lvef_source"] | null
          lvef_status: Database["public"]["Enums"]["measurement_status"]
          mitral_regurgitation_grade: number | null
          nyha_class: number | null
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
          prior_cabg: boolean | null
          prior_pci: boolean | null
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
          stress_test_result:
            | Database["public"]["Enums"]["stress_test_result"]
            | null
          stress_test_type:
            | Database["public"]["Enums"]["stress_test_type"]
            | null
          symptom_onset_at: string | null
          thrombolysis_given: boolean
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
          cardiac_arrest_pre_procedure?: boolean
          cardiogenic_shock?: boolean
          case_code: string
          ccs_class?: number | null
          communication_notes?: string | null
          consent_by_operator_id?: string | null
          consent_obtained_at?: string | null
          contrast_agent?: string | null
          contrast_volume_ml?: number | null
          created_at?: string
          created_by?: string | null
          creatinine_umol_l?: number | null
          dap_gy_cm2?: number | null
          device_time_at?: string | null
          diagnostic_catheters?: string[]
          dominance?: Database["public"]["Enums"]["coronary_dominance"] | null
          door_at?: string | null
          ecg_findings?: string | null
          egfr?: number | null
          ended_at?: string | null
          facility_id?: string | null
          findings_communicated_to_patient_at?: string | null
          findings_communicated_to_team?: boolean
          first_medical_contact_at?: string | null
          fluoroscopy_time_min?: number | null
          guiding_catheter?: string | null
          haemoglobin_g_dl?: number | null
          haemostasis_method?:
            | Database["public"]["Enums"]["haemostasis_method"]
            | null
          id?: string
          immediate_care_notes?: string | null
          indication?: Database["public"]["Enums"]["indication"] | null
          lv_gram_performed?: boolean | null
          lvedp_mmhg?: number | null
          lvedp_status?: Database["public"]["Enums"]["measurement_status"]
          lvef_measured_on?: string | null
          lvef_pct?: number | null
          lvef_source?: Database["public"]["Enums"]["lvef_source"] | null
          lvef_status?: Database["public"]["Enums"]["measurement_status"]
          mitral_regurgitation_grade?: number | null
          nyha_class?: number | null
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
          prior_cabg?: boolean | null
          prior_pci?: boolean | null
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
          stress_test_result?:
            | Database["public"]["Enums"]["stress_test_result"]
            | null
          stress_test_type?:
            | Database["public"]["Enums"]["stress_test_type"]
            | null
          symptom_onset_at?: string | null
          thrombolysis_given?: boolean
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
          cardiac_arrest_pre_procedure?: boolean
          cardiogenic_shock?: boolean
          case_code?: string
          ccs_class?: number | null
          communication_notes?: string | null
          consent_by_operator_id?: string | null
          consent_obtained_at?: string | null
          contrast_agent?: string | null
          contrast_volume_ml?: number | null
          created_at?: string
          created_by?: string | null
          creatinine_umol_l?: number | null
          dap_gy_cm2?: number | null
          device_time_at?: string | null
          diagnostic_catheters?: string[]
          dominance?: Database["public"]["Enums"]["coronary_dominance"] | null
          door_at?: string | null
          ecg_findings?: string | null
          egfr?: number | null
          ended_at?: string | null
          facility_id?: string | null
          findings_communicated_to_patient_at?: string | null
          findings_communicated_to_team?: boolean
          first_medical_contact_at?: string | null
          fluoroscopy_time_min?: number | null
          guiding_catheter?: string | null
          haemoglobin_g_dl?: number | null
          haemostasis_method?:
            | Database["public"]["Enums"]["haemostasis_method"]
            | null
          id?: string
          immediate_care_notes?: string | null
          indication?: Database["public"]["Enums"]["indication"] | null
          lv_gram_performed?: boolean | null
          lvedp_mmhg?: number | null
          lvedp_status?: Database["public"]["Enums"]["measurement_status"]
          lvef_measured_on?: string | null
          lvef_pct?: number | null
          lvef_source?: Database["public"]["Enums"]["lvef_source"] | null
          lvef_status?: Database["public"]["Enums"]["measurement_status"]
          mitral_regurgitation_grade?: number | null
          nyha_class?: number | null
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
          prior_cabg?: boolean | null
          prior_pci?: boolean | null
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
          stress_test_result?:
            | Database["public"]["Enums"]["stress_test_result"]
            | null
          stress_test_type?:
            | Database["public"]["Enums"]["stress_test_type"]
            | null
          symptom_onset_at?: string | null
          thrombolysis_given?: boolean
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
          bifurcation_medina: string | null
          calcification:
            | Database["public"]["Enums"]["calcification_grade"]
            | null
          collaterals_rentrop: number | null
          created_at: string
          created_by: string | null
          cto: boolean
          cto_duration_months: number | null
          graft_id: string | null
          id: string
          image_frame: number | null
          image_instance_uid: string | null
          image_series_uid: string | null
          image_study_uid: string | null
          image_view: string | null
          in_stent_restenosis: boolean
          is_culprit: boolean
          isr_pattern: Database["public"]["Enums"]["isr_pattern"] | null
          lesion_class: Database["public"]["Enums"]["lesion_class"] | null
          lesion_length_mm: number | null
          lesion_notes: string | null
          measurement_method:
            | Database["public"]["Enums"]["stenosis_method"]
            | null
          mld_mm: number | null
          ostial: boolean
          procedure_id: string
          rvd_mm: number | null
          segment: Database["public"]["Enums"]["vessel_segment"] | null
          stenosis_pct: number
          stenosis_source: Database["public"]["Enums"]["value_source"]
          thrombus: boolean
          timi_flow: number
          timi_frame_count: number | null
          tortuosity: Database["public"]["Enums"]["tortuosity_grade"] | null
          updated_at: string
          vessel: Database["public"]["Enums"]["vessel"]
        }
        Insert: {
          bifurcation?: boolean
          bifurcation_medina?: string | null
          calcification?:
            | Database["public"]["Enums"]["calcification_grade"]
            | null
          collaterals_rentrop?: number | null
          created_at?: string
          created_by?: string | null
          cto?: boolean
          cto_duration_months?: number | null
          graft_id?: string | null
          id?: string
          image_frame?: number | null
          image_instance_uid?: string | null
          image_series_uid?: string | null
          image_study_uid?: string | null
          image_view?: string | null
          in_stent_restenosis?: boolean
          is_culprit?: boolean
          isr_pattern?: Database["public"]["Enums"]["isr_pattern"] | null
          lesion_class?: Database["public"]["Enums"]["lesion_class"] | null
          lesion_length_mm?: number | null
          lesion_notes?: string | null
          measurement_method?:
            | Database["public"]["Enums"]["stenosis_method"]
            | null
          mld_mm?: number | null
          ostial?: boolean
          procedure_id: string
          rvd_mm?: number | null
          segment?: Database["public"]["Enums"]["vessel_segment"] | null
          stenosis_pct: number
          stenosis_source?: Database["public"]["Enums"]["value_source"]
          thrombus?: boolean
          timi_flow: number
          timi_frame_count?: number | null
          tortuosity?: Database["public"]["Enums"]["tortuosity_grade"] | null
          updated_at?: string
          vessel: Database["public"]["Enums"]["vessel"]
        }
        Update: {
          bifurcation?: boolean
          bifurcation_medina?: string | null
          calcification?:
            | Database["public"]["Enums"]["calcification_grade"]
            | null
          collaterals_rentrop?: number | null
          created_at?: string
          created_by?: string | null
          cto?: boolean
          cto_duration_months?: number | null
          graft_id?: string | null
          id?: string
          image_frame?: number | null
          image_instance_uid?: string | null
          image_series_uid?: string | null
          image_study_uid?: string | null
          image_view?: string | null
          in_stent_restenosis?: boolean
          is_culprit?: boolean
          isr_pattern?: Database["public"]["Enums"]["isr_pattern"] | null
          lesion_class?: Database["public"]["Enums"]["lesion_class"] | null
          lesion_length_mm?: number | null
          lesion_notes?: string | null
          measurement_method?:
            | Database["public"]["Enums"]["stenosis_method"]
            | null
          mld_mm?: number | null
          ostial?: boolean
          procedure_id?: string
          rvd_mm?: number | null
          segment?: Database["public"]["Enums"]["vessel_segment"] | null
          stenosis_pct?: number
          stenosis_source?: Database["public"]["Enums"]["value_source"]
          thrombus?: boolean
          timi_flow?: number
          timi_frame_count?: number | null
          tortuosity?: Database["public"]["Enums"]["tortuosity_grade"] | null
          updated_at?: string
          vessel?: Database["public"]["Enums"]["vessel"]
        }
        Relationships: [
          {
            foreignKeyName: "vessel_findings_graft_fk"
            columns: ["graft_id", "procedure_id"]
            isOneToOne: false
            referencedRelation: "grafts"
            referencedColumns: ["id", "procedure_id"]
          },
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
      check_outcome_rules_for: {
        Args: { p_procedure_id: string }
        Returns: undefined
      }
      close_amendment: {
        Args: {
          p_changes: Json
          p_procedure_id: string
          p_reviewing_clinician_id: string
        }
        Returns: undefined
      }
      open_amendment: {
        Args: { p_procedure_id: string; p_reason: string }
        Returns: string
      }
      procedure_is_draft: { Args: { p_procedure_id: string }; Returns: boolean }
      procedure_is_editable: {
        Args: { p_procedure_id: string }
        Returns: boolean
      }
      procedure_snapshot: { Args: { p_procedure_id: string }; Returns: Json }
      registry_completeness: {
        Args: { p_procedure_id: string }
        Returns: {
          filled: number
          missing: string[]
          total: number
        }[]
      }
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
      amendment_status: "open" | "closed"
      bifurcation_strategy:
        | "provisional"
        | "t_tap"
        | "culotte"
        | "dk_crush"
        | "mini_crush"
        | "simultaneous_kissing_stents"
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
        | "side_branch_closure"
        | "abrupt_vessel_closure"
        | "acute_stent_thrombosis"
        | "distal_embolisation"
        | "air_embolism"
        | "coronary_spasm"
        | "significant_arrhythmia"
        | "cardiac_arrest"
        | "new_cardiogenic_shock"
        | "contrast_reaction"
        | "pulmonary_oedema"
        | "unplanned_repeat_pci"
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
      disposition:
        | "home"
        | "ward"
        | "ccu"
        | "icu"
        | "transferred"
        | "deceased"
        | "left_against_advice"
      dissection_grade: "a" | "b" | "c" | "d" | "e" | "f"
      dose_frequency: "od" | "bd" | "tds" | "qds" | "prn" | "weekly"
      dose_unit: "mg" | "mcg" | "g" | "ml" | "iu" | "units" | "units_per_kg"
      event_resolution: "resolved" | "ongoing_at_discharge" | "fatal"
      event_treatment:
        | "none"
        | "additional_stent"
        | "covered_stent"
        | "prolonged_balloon_inflation"
        | "intracoronary_vasodilator"
        | "thrombus_aspiration"
        | "gp_iib_iiia"
        | "defibrillation"
        | "cardioversion"
        | "temporary_pacing"
        | "pericardiocentesis"
        | "iabp"
        | "impella_or_ecmo"
        | "intubation"
        | "emergency_cabg"
        | "repeat_pci"
        | "transfusion"
        | "dialysis"
        | "other"
      graft_lesion_location: "ostial" | "body" | "distal_anastomosis"
      graft_patency: "patent" | "stenosed" | "occluded" | "not_visualised"
      graft_type:
        | "lima"
        | "rima"
        | "svg"
        | "radial"
        | "gastroepiploic"
        | "other"
      haemostasis_method:
        | "radial_compression_band"
        | "manual_compression"
        | "vascular_closure_device"
        | "other"
      heart_rhythm: "sinus" | "af" | "paced" | "other"
      hyperaemic_agent:
        | "adenosine_iv"
        | "adenosine_ic"
        | "papaverine"
        | "regadenoson"
        | "none"
      imaging_method: "manual" | "vendor_auto"
      imaging_modality: "ivus" | "oct" | "nirs_ivus"
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
      isr_pattern: "focal" | "diffuse" | "proliferative" | "occlusive"
      lesion_class: "a" | "b1" | "b2" | "c"
      lvef_source: "echo" | "ventriculography" | "mri" | "other"
      measurement_phase: "pre" | "post"
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
      pci_failure_reason:
        | "unable_to_cross"
        | "unable_to_dilate"
        | "unable_to_deliver"
        | "complication"
        | "other"
      perforation_class: "ellis_1" | "ellis_2" | "ellis_3" | "ellis_3_cavity"
      physiology_decision: "defer" | "treat"
      physiology_index: "ffr" | "ifr" | "rfr" | "dfr" | "pd_pa_rest"
      physiology_method: "pressure_wire" | "angiography_derived"
      post_procedure_condition: "stable" | "unstable" | "deceased"
      post_procedure_destination:
        | "ward"
        | "ccu"
        | "icu"
        | "day_case_recovery"
        | "transferred"
      procedure_status: "draft" | "completed" | "reviewed" | "amending"
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
      stenosis_method: "visual" | "qca_manual_edge" | "qca_auto_edge"
      stress_test_result: "positive" | "negative" | "equivocal"
      stress_test_type:
        | "tmt"
        | "stress_echo"
        | "spect"
        | "pet"
        | "cmr"
        | "ct_ffr"
        | "none"
      summary_language: "en" | "te" | "hi" | "ta" | "kn" | "ml"
      summary_status: "draft" | "approved"
      technique:
        | "poba"
        | "predilation"
        | "direct_stent"
        | "post_dilation"
        | "pot"
        | "re_pot"
        | "kissing_balloon"
        | "thrombectomy"
        | "rotational_atherectomy"
        | "orbital_atherectomy"
        | "intravascular_lithotripsy"
        | "laser_atherectomy"
        | "cutting_balloon"
        | "scoring_balloon"
        | "drug_coated_balloon"
        | "cto_antegrade"
        | "cto_retrograde"
        | "bailout_stent"
        | "other"
      tortuosity_grade: "none" | "moderate" | "severe"
      tri_state: "yes" | "no" | "not_recorded"
      urgency: "elective" | "urgent" | "emergency"
      value_source:
        | "typed"
        | "picked"
        | "scanned"
        | "measured_viewer"
        | "pullback"
        | "hemo_system"
        | "xray_dose"
        | "phone"
        | "generated"
      vascular_complication:
        | "haematoma"
        | "pseudoaneurysm"
        | "av_fistula"
        | "retroperitoneal_bleed"
        | "limb_ischaemia"
        | "radial_occlusion"
        | "dissection_access_vessel"
        | "other"
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
      wall_motion: "hypokinetic" | "akinetic" | "dyskinetic" | "aneurysmal"
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
      amendment_status: ["open", "closed"],
      bifurcation_strategy: [
        "provisional",
        "t_tap",
        "culotte",
        "dk_crush",
        "mini_crush",
        "simultaneous_kissing_stents",
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
        "side_branch_closure",
        "abrupt_vessel_closure",
        "acute_stent_thrombosis",
        "distal_embolisation",
        "air_embolism",
        "coronary_spasm",
        "significant_arrhythmia",
        "cardiac_arrest",
        "new_cardiogenic_shock",
        "contrast_reaction",
        "pulmonary_oedema",
        "unplanned_repeat_pci",
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
      disposition: [
        "home",
        "ward",
        "ccu",
        "icu",
        "transferred",
        "deceased",
        "left_against_advice",
      ],
      dissection_grade: ["a", "b", "c", "d", "e", "f"],
      dose_frequency: ["od", "bd", "tds", "qds", "prn", "weekly"],
      dose_unit: ["mg", "mcg", "g", "ml", "iu", "units", "units_per_kg"],
      event_resolution: ["resolved", "ongoing_at_discharge", "fatal"],
      event_treatment: [
        "none",
        "additional_stent",
        "covered_stent",
        "prolonged_balloon_inflation",
        "intracoronary_vasodilator",
        "thrombus_aspiration",
        "gp_iib_iiia",
        "defibrillation",
        "cardioversion",
        "temporary_pacing",
        "pericardiocentesis",
        "iabp",
        "impella_or_ecmo",
        "intubation",
        "emergency_cabg",
        "repeat_pci",
        "transfusion",
        "dialysis",
        "other",
      ],
      graft_lesion_location: ["ostial", "body", "distal_anastomosis"],
      graft_patency: ["patent", "stenosed", "occluded", "not_visualised"],
      graft_type: ["lima", "rima", "svg", "radial", "gastroepiploic", "other"],
      haemostasis_method: [
        "radial_compression_band",
        "manual_compression",
        "vascular_closure_device",
        "other",
      ],
      heart_rhythm: ["sinus", "af", "paced", "other"],
      hyperaemic_agent: [
        "adenosine_iv",
        "adenosine_ic",
        "papaverine",
        "regadenoson",
        "none",
      ],
      imaging_method: ["manual", "vendor_auto"],
      imaging_modality: ["ivus", "oct", "nirs_ivus"],
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
      isr_pattern: ["focal", "diffuse", "proliferative", "occlusive"],
      lesion_class: ["a", "b1", "b2", "c"],
      lvef_source: ["echo", "ventriculography", "mri", "other"],
      measurement_phase: ["pre", "post"],
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
      pci_failure_reason: [
        "unable_to_cross",
        "unable_to_dilate",
        "unable_to_deliver",
        "complication",
        "other",
      ],
      perforation_class: ["ellis_1", "ellis_2", "ellis_3", "ellis_3_cavity"],
      physiology_decision: ["defer", "treat"],
      physiology_index: ["ffr", "ifr", "rfr", "dfr", "pd_pa_rest"],
      physiology_method: ["pressure_wire", "angiography_derived"],
      post_procedure_condition: ["stable", "unstable", "deceased"],
      post_procedure_destination: [
        "ward",
        "ccu",
        "icu",
        "day_case_recovery",
        "transferred",
      ],
      procedure_status: ["draft", "completed", "reviewed", "amending"],
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
      stenosis_method: ["visual", "qca_manual_edge", "qca_auto_edge"],
      stress_test_result: ["positive", "negative", "equivocal"],
      stress_test_type: [
        "tmt",
        "stress_echo",
        "spect",
        "pet",
        "cmr",
        "ct_ffr",
        "none",
      ],
      summary_language: ["en", "te", "hi", "ta", "kn", "ml"],
      summary_status: ["draft", "approved"],
      technique: [
        "poba",
        "predilation",
        "direct_stent",
        "post_dilation",
        "pot",
        "re_pot",
        "kissing_balloon",
        "thrombectomy",
        "rotational_atherectomy",
        "orbital_atherectomy",
        "intravascular_lithotripsy",
        "laser_atherectomy",
        "cutting_balloon",
        "scoring_balloon",
        "drug_coated_balloon",
        "cto_antegrade",
        "cto_retrograde",
        "bailout_stent",
        "other",
      ],
      tortuosity_grade: ["none", "moderate", "severe"],
      tri_state: ["yes", "no", "not_recorded"],
      urgency: ["elective", "urgent", "emergency"],
      value_source: [
        "typed",
        "picked",
        "scanned",
        "measured_viewer",
        "pullback",
        "hemo_system",
        "xray_dose",
        "phone",
        "generated",
      ],
      vascular_complication: [
        "haematoma",
        "pseudoaneurysm",
        "av_fistula",
        "retroperitoneal_bleed",
        "limb_ischaemia",
        "radial_occlusion",
        "dissection_access_vessel",
        "other",
      ],
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
      wall_motion: ["hypokinetic", "akinetic", "dyskinetic", "aneurysmal"],
    },
  },
} as const

