"use client";

import { useFormState } from "react-dom";
import { SubmitButton } from "@/components/submit-button";
import type { SheetState } from "@/app/procedures/[id]/sheets/actions";

type Action = (prev: SheetState, formData: FormData) => Promise<SheetState>;

/**
 * A one-button form for list sheets (remove a row, record an event as an outcome…). Asks first when
 * `confirm` is set; shows the server's message in place if it is refused.
 */
export function RowAction({
  action,
  fields,
  children,
  confirm,
  className = "btn min-h-11 px-3 text-sm text-red-700 hover:bg-red-50",
  label,
}: {
  action: Action;
  fields: Record<string, string>;
  children: React.ReactNode;
  confirm?: string;
  className?: string;
  /** Accessible name when the visible text needs context ("Remove FFR pre 0.86"). */
  label?: string;
}) {
  const [state, run] = useFormState<SheetState, FormData>(action, {});
  return (
    <form
      action={run}
      onSubmit={(e) => {
        if (confirm && !window.confirm(confirm)) e.preventDefault();
      }}
      className="inline"
    >
      {Object.entries(fields).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      <SubmitButton className={className} pendingLabel="…" label={label}>
        {children}
      </SubmitButton>
      {state.error && (
        <span role="alert" className="ml-2 text-sm text-red-700">
          {state.error}
        </span>
      )}
    </form>
  );
}
