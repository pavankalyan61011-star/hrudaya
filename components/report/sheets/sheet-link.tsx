"use client";

import Link from "next/link";
import { markSheetOpened } from "./sheet";

/**
 * Opens a sheet by URL (`?sheet=…&row=…`); remembers it was opened from this page so Close goes back.
 * `confirmDiscard`: the link leaves a sheet with unsaved changes — ask first.
 */
export function SheetLink({
  href,
  id,
  className,
  children,
  label,
  confirmDiscard = false,
}: {
  href: string;
  id?: string;
  className?: string;
  children: React.ReactNode;
  label?: string;
  confirmDiscard?: boolean;
}) {
  return (
    <Link
      id={id}
      href={href}
      scroll={false}
      aria-label={label}
      className={className}
      onClick={(e) => {
        if (confirmDiscard && !window.confirm("Discard changes?")) {
          e.preventDefault();
          return;
        }
        markSheetOpened(href);
      }}
    >
      {children}
    </Link>
  );
}
