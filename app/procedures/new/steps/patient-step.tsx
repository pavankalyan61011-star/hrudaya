"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useFormState } from "react-dom";
import { ENUMS, label, type Enums } from "@/lib/labels";
import { ageOn } from "@/lib/dates";
import { Field } from "@/components/form/field";
import { EnumSelect } from "@/components/form/enum-select";
import { TextInput } from "@/components/form/text-input";
import { CheckRow } from "@/components/form/yes-no";
import { ErrorBanner, StepActions, type StepState } from "@/components/form/form-status";
import { errorCount, useFocusFirstError } from "@/components/form/use-focus-first-error";
import { getPatientRiskFactorsAction, savePatientStep, searchPatientsAction } from "../actions";
import type { PatientSearchResult } from "@/lib/queries/patients";

type RiskFactor = Enums["risk_factor"];
type RiskState = Partial<Record<RiskFactor, { checked: boolean; detail: string }>>;

type Props = {
  procedureId: string | null;
  today: string;
  initialPatient: (PatientSearchResult & { risk_factors: { factor: RiskFactor; detail: string | null }[] }) | null;
};

const toRiskState = (rows: { factor: RiskFactor; detail: string | null }[]): RiskState =>
  Object.fromEntries(rows.map((r) => [r.factor, { checked: true, detail: r.detail ?? "" }]));

export function PatientStep({ procedureId, today, initialPatient }: Props) {
  const [state, formAction] = useFormState<StepState, FormData>(savePatientStep, {});
  useFocusFirstError(state);
  const errors = state.fieldErrors ?? {};

  const [mode, setMode] = useState<"existing" | "new">("existing");
  const [selected, setSelected] = useState<PatientSearchResult | null>(initialPatient);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PatientSearchResult[]>([]);
  const [searching, startSearch] = useTransition();
  const [loadingRisk, startRiskLoad] = useTransition();
  const [newPatient, setNewPatient] = useState({ mrn: "", full_name: "", sex: "", date_of_birth: "", mobile: "" });
  const [risk, setRisk] = useState<RiskState>(toRiskState(initialPatient?.risk_factors ?? []));
  const debounce = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    clearTimeout(debounce.current);
    if (query.trim().length < 2) {
      setResults([]);
      return;
    }
    debounce.current = setTimeout(() => {
      startSearch(async () => setResults(await searchPatientsAction(query)));
    }, 250);
    return () => clearTimeout(debounce.current);
  }, [query]);

  function choose(p: PatientSearchResult) {
    setSelected(p);
    setQuery("");
    setResults([]);
    startRiskLoad(async () => setRisk(toRiskState(await getPatientRiskFactorsAction(p.id))));
  }

  const payload = {
    mode,
    patient_id: selected?.id,
    new_patient: mode === "new" ? newPatient : undefined,
    risk_factors: ENUMS.risk_factor
      .filter((f) => risk[f]?.checked)
      .map((f) => ({ factor: f, detail: risk[f]?.detail ?? "" })),
  };

  const setNp = (k: keyof typeof newPatient) => (v: string) => setNewPatient((p) => ({ ...p, [k]: v }));

  return (
    <form action={formAction} className="space-y-5">
      <input type="hidden" name="procedure_id" value={procedureId ?? ""} />
      <input type="hidden" name="payload" value={JSON.stringify(payload)} />
      <ErrorBanner message={state.error} />

      <div className="flex gap-2" role="tablist" aria-label="Patient">
        <button type="button" role="tab" aria-selected={mode === "existing"} onClick={() => setMode("existing")}
          className={`btn flex-1 border ${mode === "existing" ? "border-sky-700 bg-sky-50 text-sky-900" : "border-slate-300 bg-white"}`}>
          Existing patient
        </button>
        <button type="button" role="tab" aria-selected={mode === "new"} onClick={() => setMode("new")}
          className={`btn flex-1 border ${mode === "new" ? "border-sky-700 bg-sky-50 text-sky-900" : "border-slate-300 bg-white"}`}>
          New patient
        </button>
      </div>

      {mode === "existing" ? (
        <section className="card space-y-3">
          {selected && (
            <div className="flex items-start justify-between gap-2 rounded-lg bg-sky-50 p-3">
              <div>
                <p className="font-semibold">{selected.full_name}</p>
                <p className="text-sm text-slate-700">
                  MRN {selected.mrn} · {label(selected.sex)} · {ageOn(selected.date_of_birth, today)} y
                </p>
              </div>
              <button type="button" className="btn-secondary min-h-11 px-3 text-sm" onClick={() => setSelected(null)}>
                Change
              </button>
            </div>
          )}
          {!selected && (
            <Field label="Search by MRN or name" htmlFor="patient-search" error={errors.patient_id}>
              <input
                id="patient-search"
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="e.g. SYN-MRN-0001"
                autoComplete="off"
                aria-invalid={errors.patient_id ? true : undefined}
                aria-describedby={errors.patient_id ? "patient-search-error" : undefined}
                className={`input ${errors.patient_id ? "border-red-600" : ""}`}
              />
            </Field>
          )}
          {!selected && query.trim().length >= 2 && (
            <div aria-live="polite">
              {searching ? (
                <p className="text-sm text-slate-600">Searching…</p>
              ) : results.length === 0 ? (
                <p className="text-sm text-slate-600">No matching patient. Use “New patient”.</p>
              ) : (
                <ul className="divide-y divide-slate-200 rounded-lg border border-slate-200">
                  {results.map((p) => (
                    <li key={p.id}>
                      <button type="button" onClick={() => choose(p)} className="flex min-h-11 w-full flex-col items-start px-3 py-2 text-left hover:bg-slate-50">
                        <span className="font-medium">{p.full_name}</span>
                        <span className="text-sm text-slate-600">
                          MRN {p.mrn} · {label(p.sex)} · {ageOn(p.date_of_birth, today)} y
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </section>
      ) : (
        <section className="card grid gap-4 sm:grid-cols-2">
          <Field label="MRN" htmlFor="mrn" required error={errors["new_patient.mrn"]}>
            <TextInput id="mrn" value={newPatient.mrn} onChange={setNp("mrn")} invalid={!!errors["new_patient.mrn"]} placeholder="SYN-MRN-…" />
          </Field>
          <Field label="Full name" htmlFor="full_name" required error={errors["new_patient.full_name"]}>
            <TextInput id="full_name" value={newPatient.full_name} onChange={setNp("full_name")} invalid={!!errors["new_patient.full_name"]} />
          </Field>
          <Field label="Sex" htmlFor="sex" required error={errors["new_patient.sex"]}>
            <EnumSelect id="sex" value={newPatient.sex} onChange={setNp("sex")} options={ENUMS.sex} invalid={!!errors["new_patient.sex"]} />
          </Field>
          <Field label="Date of birth" htmlFor="dob" required error={errors["new_patient.date_of_birth"]}
            hint={newPatient.date_of_birth ? `Age ${ageOn(newPatient.date_of_birth, today)}` : undefined}>
            <TextInput id="dob" type="date" value={newPatient.date_of_birth} onChange={setNp("date_of_birth")} invalid={!!errors["new_patient.date_of_birth"]} />
          </Field>
          <Field label="Mobile (optional)" htmlFor="mobile" className="sm:col-span-2">
            <TextInput id="mobile" type="tel" inputMode="tel" value={newPatient.mobile} onChange={setNp("mobile")} />
          </Field>
        </section>
      )}

      <section className="card">
        <h2 className="mb-1 font-semibold">Risk factors</h2>
        <p className="mb-2 text-sm text-slate-600">
          {loadingRisk ? "Loading this patient's risk factors…" : "Tick all that apply. Detail is optional."}
        </p>
        <ul className="divide-y divide-slate-100">
          {ENUMS.risk_factor.map((f) => {
            const entry = risk[f];
            return (
              <li key={f} className="py-1">
                <CheckRow id={`rf-${f}`} checked={!!entry?.checked}
                  onChange={(c) => setRisk((r) => ({ ...r, [f]: { checked: c, detail: r[f]?.detail ?? "" } }))}>
                  {label(f)}
                </CheckRow>
                {entry?.checked && (
                  <div className="pb-2 pl-9">
                    <label htmlFor={`rf-${f}-detail`} className="sr-only">
                      {label(f)} detail
                    </label>
                    <input id={`rf-${f}-detail`} value={entry.detail} placeholder="Detail, e.g. 10 years"
                      onChange={(e) => setRisk((r) => ({ ...r, [f]: { checked: true, detail: e.target.value } }))}
                      className="input" />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      <StepActions errorCount={errorCount(state)} />
    </form>
  );
}
