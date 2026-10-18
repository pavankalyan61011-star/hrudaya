import { SheetLink } from "./sheet-link";

/**
 * §3.8: a capture step's way into the Week 7 sheets — the same sheets the report opens, writing the
 * same tables, so a case can still be entered from scratch in the six steps.
 */
export function MoreDetail({ title, links }: { title: string; links: { href: string; label: string; id?: string }[] }) {
  if (links.length === 0) return null;
  return (
    <section className="card space-y-2" aria-label={title}>
      <h2 className="font-semibold">{title}</h2>
      <div className="flex flex-wrap gap-2">
        {links.map((l) => (
          <SheetLink key={l.href} id={l.id} href={l.href} className="btn-secondary min-h-11 text-sm">
            {l.label}
          </SheetLink>
        ))}
      </div>
      <p className="text-xs text-slate-500">Each opens a sheet that saves on its own. If you changed this step, save it first — saving a sheet reloads the step.</p>
    </section>
  );
}
