/**
 * Sheet URLs (Week 7 spec §3). A sheet is open when the page URL carries `sheet=…` (plus `row` and
 * `tab` where needed); the report page and the capture form both open the same sheets this way.
 */

export const SHEETS = ["lesion", "physiology", "haemodynamics", "grafts", "intervention", "events", "indication"] as const;
export type SheetName = (typeof SHEETS)[number];
export type SheetParams = { sheet?: string; row?: string; tab?: string };

/** `base` is the page without sheet params: `/procedures/<id>` or `/procedures/new?id=<id>&step=<n>`. */
export function sheetHref(base: string, sheet: SheetName, extra: { row?: string; tab?: string } = {}): string {
  const q = new URLSearchParams({ sheet });
  if (extra.row) q.set("row", extra.row);
  if (extra.tab) q.set("tab", extra.tab);
  return `${base}${base.includes("?") ? "&" : "?"}${q.toString()}`;
}
