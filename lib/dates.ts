const IST = "Asia/Kolkata";

/** Today's date in India as YYYY-MM-DD (the cath lab's calendar, not the server's). */
export function todayIST(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: IST, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

export function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Age in whole years on a given date. Age is always derived, never stored. */
export function ageOn(dateOfBirth: string, onDate: string): number {
  const [by, bm, bd] = dateOfBirth.split("-").map(Number);
  const [y, m, d] = onDate.split("-").map(Number);
  return y - by - (m < bm || (m === bm && d < bd) ? 1 : 0);
}

/** 2026-09-01 → 1 Sep 2026 */
export function formatDate(isoDate: string | null | undefined): string {
  if (!isoDate) return "—";
  const d = new Date(`${isoDate}T00:00:00Z`);
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(d);
}

/** An instant → "YYYY-MM-DDTHH:mm" for <input type="datetime-local">, in IST. */
export function toISTInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(new Date(iso).getTime() + 330 * 60_000);
  return d.toISOString().slice(0, 16);
}

/** "YYYY-MM-DDTHH:mm" typed as IST → ISO instant. Times are always entered as India time. */
export function fromISTInput(local: string): string {
  return `${local}:00+05:30`;
}

/** The India calendar date of an instant. */
export function istDateOf(iso: string): string {
  return new Date(new Date(iso).getTime() + 330 * 60_000).toISOString().slice(0, 10);
}
