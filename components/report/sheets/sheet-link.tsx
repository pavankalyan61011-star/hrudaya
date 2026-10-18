"use client";

import Link from "next/link";
import { markSheetOpened } from "./sheet";

/** Opens a sheet by URL (`?sheet=…&row=…`); remembers it was opened from this page so Close goes back. */
export function SheetLink({ href, id, className, children, label }: { href: string; id?: string; className?: string; children: React.ReactNode; label?: string }) {
  return (
    <Link id={id} href={href} scroll={false} aria-label={label} className={className} onClick={() => markSheetOpened(href)}>
      {children}
    </Link>
  );
}
