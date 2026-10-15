"use client";

import { useEffect } from "react";
import type { StepState } from "./form-status";

/**
 * After a failed save, bring the first invalid field into view and focus it. Falls back to the
 * error banner when the failure is not tied to a field. Instant scroll — no animation.
 */
export function useFocusFirstError(state: StepState) {
  useEffect(() => {
    if (!state.error && !state.fieldErrors) return;
    const frame = requestAnimationFrame(() => {
      const target =
        document.querySelector<HTMLElement>('[aria-invalid="true"]') ?? document.querySelector<HTMLElement>('[role="alert"]');
      if (!target) return;
      target.scrollIntoView({ block: "center" });
      if (target.getAttribute("role") === "alert" && !target.hasAttribute("tabindex")) target.setAttribute("tabindex", "-1");
      target.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [state]);
}

export const errorCount = (state: StepState) => Object.keys(state.fieldErrors ?? {}).length;
