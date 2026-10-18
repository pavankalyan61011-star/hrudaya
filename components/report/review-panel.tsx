"use client";

import { useState } from "react";
import { useFormState } from "react-dom";
import { markReviewedAction } from "@/app/procedures/new/actions";
import { EnumSelect } from "@/components/form/enum-select";
import { Field } from "@/components/form/field";
import { ErrorBanner, type StepState } from "@/components/form/form-status";
import { SubmitButton } from "@/components/submit-button";

type Props = {
  procedureId: string;
  operators: { id: string; full_name: string }[];
  defaultClinicianId: string | null;
  /** Week 7 §3.7: sign-off warns about missing registry elements but never blocks. */
  registry?: { filled: number; total: number } | null;
};

/** Sign-off for a completed procedure. After this the record is read-only, so it asks first. */
export function ReviewPanel({ procedureId, operators, defaultClinicianId, registry }: Props) {
  const [state, formAction] = useFormState<StepState, FormData>(markReviewedAction, {});
  const [clinician, setClinician] = useState(defaultClinicianId ?? "");
  const name = operators.find((o) => o.id === clinician)?.full_name;

  return (
    <form
      action={formAction}
      onSubmit={(e) => {
        if (!window.confirm(`Mark as reviewed by ${name ?? "the selected clinician"}? The record cannot be changed afterwards.`)) e.preventDefault();
      }}
      className="card space-y-3 border-sky-200 bg-sky-50"
    >
      <input type="hidden" name="procedure_id" value={procedureId} />
      <input type="hidden" name="reviewing_clinician_id" value={clinician} />
      <p className="font-medium">Awaiting review</p>
      <ErrorBanner message={state.error} />
      {registry && registry.filled < registry.total && (
        <p className="text-sm text-slate-700">
          Registry: {registry.filled} of {registry.total} elements recorded. Sign-off is not blocked; the missing ones are listed under &ldquo;Registry&rdquo; above.
        </p>
      )}
      <Field label="Reviewing clinician" htmlFor="reviewer" required error={state.fieldErrors?.reviewing_clinician_id}>
        <EnumSelect id="reviewer" value={clinician} onChange={setClinician} options={operators.map((o) => ({ value: o.id, label: o.full_name }))} />
      </Field>
      <SubmitButton className="btn-primary w-full sm:w-auto" pendingLabel="Saving…">
        Mark as reviewed
      </SubmitButton>
    </form>
  );
}
