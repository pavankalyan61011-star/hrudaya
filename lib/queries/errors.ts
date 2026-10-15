export type DbError = { code?: string; message?: string; hint?: string } | null | undefined;

/**
 * A message safe to show the user. Built from the error code, constraint name and our own
 * trigger hints only — Postgres `details` can echo row values, so it is never used or logged.
 */
export function friendlyError(error: DbError): string {
  if (!error) return "Something went wrong. Please try again.";
  const message = error.message ?? "";

  switch (error.hint) {
    case "hrudaya:no_vessel_findings":
      return "Add at least one vessel in the Angiography step before completing.";
    case "hrudaya:pci_without_intervention":
      return "A PCI procedure needs at least one intervention (step 4).";
    case "hrudaya:reviewed_read_only":
      return "This procedure has been reviewed and can no longer be changed.";
    case "hrudaya:review_needs_completed":
      return "Only a completed procedure can be marked as reviewed.";
    case "hrudaya:diagnostic_with_intervention":
      return "This is marked diagnostic only but has an intervention recorded. Change the procedure type or remove the intervention in step 4.";
  }

  if (error.code === "23505") {
    if (message.includes("patients_mrn_key")) return "A patient with this MRN already exists. Search for them instead.";
    if (message.includes("procedures_case_code_key")) return "That case code is already used. Choose another.";
    return "That value is already in use.";
  }
  if (error.code === "23514") {
    if (message.includes("devices_used_stent_has_lot")) return "Every stent needs a lot number.";
    if (message.includes("procedures_completed_is_complete")) return "Some required fields in earlier steps are missing.";
    if (message.includes("procedures_date_matches_start")) return "The start time must be on the procedure date (step 2), in India time.";
    if (message.includes("procedures_ends_after_start")) return "The end time must be after the start time.";
    if (message.includes("discharges_date_matches_time")) return "The discharge date and time disagree.";
    if (message.includes("status_matches") || message.includes("lvef_provenance")) return "A measurement value must match its status (recorded / not performed / not recorded).";
    return "One of the values is out of range.";
  }
  if (error.code === "23502") return "A required field is missing.";
  if (error.code === "42501") return "You don't have permission to do that.";
  if (error.code === "PGRST116") return "Record not found.";
  return "Could not save. Please try again.";
}
