"use client";

import { useFormStatus } from "react-dom";

type Props = {
  children: React.ReactNode;
  pendingLabel?: string;
  className?: string;
  name?: string;
  value?: string;
};

/** Submit button that disables itself and changes label while its form is submitting. */
export function SubmitButton({ children, pendingLabel, className = "btn-primary", name, value }: Props) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" name={name} value={value} disabled={pending} aria-busy={pending} className={className}>
      {pending ? (pendingLabel ?? "Saving…") : children}
    </button>
  );
}
