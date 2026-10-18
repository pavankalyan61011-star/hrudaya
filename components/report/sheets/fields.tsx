"use client";

import { useEffect, useState } from "react";

/**
 * Inputs shared by the Week 7 sheets (spec §3): every picker is a row of big buttons (44 px), every
 * typed number has its unit beside it, an optional value can be set back to "Not recorded", and a
 * registry element carries a small "R" tag.
 */

const LEGEND_DISMISSED = "hrudaya.registryLegendDismissed";

/** "R = needed for the registry", shown at the top of a sheet until dismissed (remembered per browser). */
export function RegistryLegend() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    try {
      setShow(localStorage.getItem(LEGEND_DISMISSED) !== "1");
    } catch {
      setShow(true);
    }
  }, []);
  if (!show) return null;
  return (
    <div className="mb-4 flex items-center justify-between gap-3 rounded-lg border border-sky-200 bg-sky-50 px-3 py-1 text-sm text-sky-950">
      <span>
        <RegistryTag /> = needed for the registry
      </span>
      <button
        type="button"
        className="btn min-h-11 px-3 text-sm font-medium text-sky-900 underline"
        onClick={() => {
          setShow(false);
          try {
            localStorage.setItem(LEGEND_DISMISSED, "1");
          } catch {
            /* not remembered; it simply shows again next time */
          }
        }}
      >
        Got it
      </button>
    </div>
  );
}

export function RegistryTag() {
  return (
    <span title="Registry element (NIC)" className="ml-1.5 inline-flex h-5 min-w-5 items-center justify-center rounded bg-sky-100 px-1 align-middle text-[11px] font-bold text-sky-900">
      R<span className="sr-only"> — registry element</span>
    </span>
  );
}

function Legend({ children, registry }: { children: React.ReactNode; registry?: boolean }) {
  return (
    <legend className="label">
      {children}
      {registry && <RegistryTag />}
    </legend>
  );
}

const optionClass = (on: boolean, muted = false) =>
  `inline-flex min-h-11 min-w-11 cursor-pointer items-center justify-center rounded-lg border px-3 text-sm font-semibold has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-sky-600 ${
    on ? (muted ? "border-slate-500 bg-slate-500 text-white" : "border-sky-700 bg-sky-700 text-white") : "border-slate-300 bg-white text-slate-800"
  }`;

type Option<T extends string> = { value: T; label: string };

/**
 * A big-button picker. `optional` adds "Not recorded" (value null), shown grey when chosen, so an
 * empty value is a visible choice rather than a missing tap.
 */
export function Choice<T extends string>({
  name,
  legend,
  value,
  onChange,
  options,
  optional = false,
  registry,
  columns,
  error,
}: {
  name: string;
  legend: string;
  value: T | null;
  onChange: (value: T | null) => void;
  options: Option<T>[];
  optional?: boolean;
  registry?: boolean;
  /** Fixed grid columns (e.g. 4 for the vessel list); otherwise options wrap. */
  columns?: number;
  error?: string;
}) {
  const layout = columns ? "grid gap-2" : "flex flex-wrap gap-2";
  const style = columns ? { gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` } : undefined;
  return (
    <fieldset aria-describedby={error ? `${name}-error` : undefined}>
      <Legend registry={registry}>{legend}</Legend>
      <div className={layout} style={style}>
        {options.map((o) => (
          <label key={o.value} className={optionClass(value === o.value)}>
            <input type="radio" name={name} value={o.value} checked={value === o.value} onChange={() => onChange(o.value)} className="sr-only" />
            {o.label}
          </label>
        ))}
        {optional && (
          <label className={optionClass(value === null, true)}>
            <input type="radio" name={name} value="" checked={value === null} onChange={() => onChange(null)} className="sr-only" />
            Not recorded
          </label>
        )}
      </div>
      {error && (
        <p id={`${name}-error`} className="mt-1 text-sm text-red-700">
          {error}
        </p>
      )}
    </fieldset>
  );
}

/**
 * Yes / No as two big buttons. `null` = untouched: neither is selected, because an untouched "No"
 * would look like a recorded finding. The Week 1 columns behind these are `boolean default false`,
 * so an untouched value still saves as false (backlog: booleans → tri_state in Week 7b).
 */
export function YesNo({ name, legend, value, onChange, registry }: { name: string; legend: string; value: boolean | null; onChange: (v: boolean) => void; registry?: boolean }) {
  return (
    <Choice
      name={name}
      legend={legend}
      registry={registry}
      value={value === null ? null : value ? "yes" : "no"}
      onChange={(v) => onChange(v === "yes")}
      options={[
        { value: "yes", label: "Yes" },
        { value: "no", label: "No" },
      ]}
    />
  );
}

/** A typed number with its unit beside it. Kept as text so an empty field stays empty. */
export function NumberWithUnit({
  id,
  label,
  unit,
  value,
  onChange,
  decimal = false,
  registry,
  hint,
  error,
}: {
  id: string;
  label: string;
  unit: string;
  value: string;
  onChange: (v: string) => void;
  decimal?: boolean;
  registry?: boolean;
  hint?: string;
  error?: string;
}) {
  return (
    <div>
      <label htmlFor={id} className="label">
        {label}
        {registry && <RegistryTag />}
      </label>
      <div className="flex items-center gap-2">
        <input
          id={id}
          inputMode={decimal ? "decimal" : "numeric"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined}
          className={`input max-w-[8rem] ${error ? "border-red-600" : ""}`}
        />
        <span className="text-sm font-medium text-slate-700">{unit}</span>
      </div>
      {hint && !error && (
        <p id={`${id}-hint`} className="mt-1 text-xs text-slate-500">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="mt-1 text-sm text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}

/**
 * Medina classification as three toggles drawn on a Y: proximal main vessel (the stem), distal main
 * vessel (straight on) and side branch (angled off). 1 = ≥ 50% stenosis in that segment.
 */
export function MedinaPicker({ value, onChange }: { value: string | null; onChange: (v: string | null) => void }) {
  const parts = (value ?? "0,0,0").split(",").map((d) => d === "1");
  const set = (i: number) => {
    const next = [...parts];
    next[i] = !next[i];
    onChange(next.map((b) => (b ? "1" : "0")).join(","));
  };
  // Ink for a diseased segment, light grey for a clear one; red is kept for "needs attention".
  const stroke = (on: boolean) => (on ? "#1A232B" : "#cbd5e1");
  const names = ["Proximal main vessel", "Distal main vessel", "Side branch"];
  const toggle = (i: number, className: string) => (
    <button
      type="button"
      aria-pressed={parts[i]}
      onClick={() => set(i)}
      className={`absolute inline-flex min-h-11 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-semibold ${
        parts[i] ? "border-[#1A232B] bg-[#1A232B] text-white" : "border-slate-300 bg-white text-slate-700"
      } ${className}`}
    >
      <span className="text-base tabular-nums">{parts[i] ? "1" : "0"}</span> {names[i]}
    </button>
  );
  return (
    <fieldset>
      <legend className="label">Medina</legend>
      <div className="relative mx-auto h-48 w-full max-w-[22rem]">
        <svg viewBox="0 0 200 180" className="absolute left-1/2 top-0 h-full -translate-x-1/2" aria-hidden>
          <line x1="100" y1="170" x2="100" y2="95" stroke={stroke(parts[0])} strokeWidth="14" strokeLinecap="round" />
          <line x1="100" y1="95" x2="100" y2="12" stroke={stroke(parts[1])} strokeWidth="14" strokeLinecap="round" />
          <line x1="100" y1="95" x2="178" y2="38" stroke={stroke(parts[2])} strokeWidth="12" strokeLinecap="round" />
        </svg>
        {toggle(1, "left-0 top-0")}
        {toggle(2, "right-0 top-12")}
        {toggle(0, "bottom-0 left-0")}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-slate-700">
        {value === null ? (
          <span>Medina not recorded — tap a segment to set it.</span>
        ) : (
          <>
            <span>
              Medina <span className="font-mono font-semibold">{value}</span>
              <span className="text-slate-500"> (proximal main, distal main, side branch)</span>
            </span>
            <button type="button" className="btn min-h-11 px-3 text-sm text-slate-700 underline" onClick={() => onChange(null)}>
              Clear
            </button>
          </>
        )}
      </div>
    </fieldset>
  );
}

/** yes / no / not recorded (tri_state). "Not recorded" is grey when chosen, and is the default. */
export function TriState({ name, legend, value, onChange, registry }: { name: string; legend: string; value: "yes" | "no" | "not_recorded"; onChange: (v: "yes" | "no" | "not_recorded") => void; registry?: boolean }) {
  return (
    <Choice
      name={name}
      legend={legend}
      registry={registry}
      value={value === "not_recorded" ? null : value}
      onChange={(v) => onChange(v ?? "not_recorded")}
      options={[
        { value: "yes", label: "Yes" },
        { value: "no", label: "No" },
      ]}
      optional
    />
  );
}

/** A nullable boolean (e.g. previous PCI): Yes / No / Not recorded. */
export function YesNoUnknown({ name, legend, value, onChange, registry }: { name: string; legend: string; value: boolean | null; onChange: (v: boolean | null) => void; registry?: boolean }) {
  return (
    <Choice
      name={name}
      legend={legend}
      registry={registry}
      value={value === null ? null : value ? "yes" : "no"}
      onChange={(v) => onChange(v === null ? null : v === "yes")}
      options={[
        { value: "yes", label: "Yes" },
        { value: "no", label: "No" },
      ]}
      optional
    />
  );
}

/** Multi-select chips (techniques, treatments, vascular complications): each a 44 px toggle. */
export function Chips<T extends string>({ legend, values, onChange, options, error }: { legend?: string; values: T[]; onChange: (v: T[]) => void; options: { value: T; label: string }[]; error?: string }) {
  const toggle = (v: T) => onChange(values.includes(v) ? values.filter((x) => x !== v) : [...values, v]);
  const chips = (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => {
        const on = values.includes(o.value);
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={on}
            onClick={() => toggle(o.value)}
            className={`inline-flex min-h-11 items-center justify-center rounded-full border px-3 text-sm font-semibold ${
              on ? "border-sky-700 bg-sky-700 text-white" : "border-slate-300 bg-white text-slate-800"
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
  if (!legend) return chips;
  return (
    <fieldset>
      <legend className="label">{legend}</legend>
      {chips}
      {error && <p className="mt-1 text-sm text-red-700">{error}</p>}
    </fieldset>
  );
}

/** The three-state rule as a status pill (spec §3: "Not performed" is a recorded fact). */
export function StatusPill({ name, legend, value, onChange, registry }: { name: string; legend: string; value: "not_recorded" | "not_performed" | "recorded"; onChange: (v: "not_recorded" | "not_performed" | "recorded") => void; registry?: boolean }) {
  return (
    <Choice
      name={name}
      legend={legend}
      registry={registry}
      value={value}
      onChange={(v) => v && onChange(v)}
      options={[
        { value: "not_recorded", label: "Not recorded" },
        { value: "not_performed", label: "Not performed" },
        { value: "recorded", label: "Recorded" },
      ]}
    />
  );
}

/** A date and time in India time (datetime-local; the server adds +05:30). */
export function DateTimeField({ id, label, value, onChange, error }: { id: string; label: string; value: string; onChange: (v: string) => void; error?: string }) {
  return (
    <div>
      <label htmlFor={id} className="label">
        {label} <span className="font-normal text-slate-500">(IST)</span>
      </label>
      <input
        id={id}
        type="datetime-local"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={error ? true : undefined}
        className={`input max-w-[16rem] ${error ? "border-red-600" : ""}`}
      />
      {error && <p className="mt-1 text-sm text-red-700">{error}</p>}
    </div>
  );
}

/** Field-level message under a group that has no input of its own. */
export function FieldError({ message }: { message?: string }) {
  return message ? <p className="text-sm text-red-700">{message}</p> : null;
}
