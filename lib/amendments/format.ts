/**
 * Display text for a value in a change list (Week 6 spec §4). Missing values read "Not recorded",
 * never blank; enum values use the report's labels; times are shown in India time.
 */
import { label } from "../labels.ts";
import { formatDate } from "../dates.ts";
import { formatDateTime, NOT_RECORDED } from "../report-format.ts";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const ISO_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;
const ENUMISH = /^[a-z0-9]+(_[a-z0-9]+)*$/;

/** Fields shown when a whole row was added or removed, in this order. */
const ROW_SUMMARY = ["drug_name", "dose", "dose_unit", "frequency", "product_name", "diameter_mm", "length_mm", "lot_number", "complication",
  "outcome", "vessel", "segment", "stenosis_pct", "intervention_type", "timing", "route"];

export function formatChangeValue(v: unknown): string {
  if (v === null || v === undefined || v === "") return NOT_RECORDED;
  if (typeof v === "boolean") return v ? "Yes" : "No";
  if (typeof v === "number") return String(v);
  if (Array.isArray(v)) return v.length ? v.map(formatChangeValue).join("; ") : "None recorded";
  if (typeof v === "object") {
    const row = v as Record<string, unknown>;
    const parts = ROW_SUMMARY.filter((k) => row[k] !== null && row[k] !== undefined && row[k] !== "").map((k) => formatChangeValue(row[k]));
    return parts.length ? parts.join(" · ") : "(row)";
  }
  const s = String(v);
  if (ISO_TIME.test(s)) return formatDateTime(s);
  if (ISO_DATE.test(s)) return formatDate(s);
  if (ENUMISH.test(s)) return label(s);
  return s;
}
