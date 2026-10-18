"use client";

import { useFormStatus } from "react-dom";

type Props = {
  children: React.ReactNode;
  pendingLabel?: string;
  className?: string;
  name?: string;
  value?: string;
  /** Accessible name when the visible text needs context. */
  label?: string;
};

/** Submit button that disables itself and changes label while its form is submitting. */
export function SubmitButton({ children, pendingLabel, className = "btn-primary", name, value, label }: Props) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" name={name} value={value} disabled={pending} aria-busy={pending} aria-label={label} className={className}>
      {pending ? (pendingLabel ?? "Saving…") : children}
    </button>
  );
}
