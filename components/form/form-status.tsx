import Link from "next/link";
import { SubmitButton } from "@/components/submit-button";

export type StepState = { error?: string; fieldErrors?: Record<string, string> };

export function ErrorBanner({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
      {message}
    </p>
  );
}

/** Back + Next, sticky to the bottom of the screen on phones so Next is always reachable. */
export function StepActions({
  backHref,
  nextLabel = "Save & next",
  pendingLabel = "Saving…",
  errorCount = 0,
}: {
  backHref?: string;
  nextLabel?: string;
  pendingLabel?: string;
  /** Fields that failed validation on the last save — shown beside the button. */
  errorCount?: number;
}) {
  return (
    <div className="sticky bottom-0 -mx-4 mt-6 border-t border-slate-200 bg-white/95 px-4 py-3 backdrop-blur">
      {errorCount > 0 && (
        <p role="status" className="mb-2 text-right text-sm font-medium text-red-700">
          {errorCount === 1 ? "1 field needs attention" : `${errorCount} fields need attention`}
        </p>
      )}
      <div className="flex gap-3">
      {backHref ? (
        <Link href={backHref} className="btn-secondary flex-1">
          Back
        </Link>
      ) : (
        <Link href="/procedures" className="btn-secondary flex-1">
          Cancel
        </Link>
      )}
      <SubmitButton className="btn-primary flex-[2]" pendingLabel={pendingLabel}>
        {nextLabel}
      </SubmitButton>
      </div>
    </div>
  );
}

/** Visible "Remove" leads the accessible name; `what` adds context for screen readers only. */
export function RemoveButton({ onClick, what }: { onClick: () => void; what: string }) {
  return (
    <button type="button" onClick={onClick} className="btn min-h-11 px-3 text-sm text-red-700 hover:bg-red-50">
      Remove<span className="sr-only"> {what}</span>
    </button>
  );
}
