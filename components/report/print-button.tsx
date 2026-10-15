"use client";

/** The browser's own print dialog — "Save as PDF" is the PDF route (spec §8: no PDF library). */
export function PrintButton() {
  return (
    <button type="button" className="btn-primary min-h-11" onClick={() => window.print()}>
      Print / Save as PDF
    </button>
  );
}
