/**
 * Messages the summary card shows when no summary can be made. Kept in its own module because the
 * card is a client component: importing lib/summary/api.ts would pull node:crypto into the browser.
 */
export const AMENDING_BLOCKER = "Discharge summaries are paused while an amendment is open. They return when the record has been re-reviewed.";
