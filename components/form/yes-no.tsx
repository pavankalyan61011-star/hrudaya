type Option<T extends string> = { value: T; label: string };

type Props<T extends string> = {
  name: string;
  legend: string;
  value: T;
  onChange: (value: T) => void;
  options: Option<T>[];
};

/** Segmented choice with large tap targets — used for yes/no style fields. */
export function Segmented<T extends string>({ name, legend, value, onChange, options }: Props<T>) {
  return (
    <fieldset>
      <legend className="label">{legend}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => (
          <label
            key={o.value}
            className={`btn min-w-16 cursor-pointer border text-sm ${
              value === o.value ? "border-sky-700 bg-sky-700 text-white" : "border-slate-300 bg-white text-slate-800"
            }`}
          >
            <input
              type="radio"
              name={name}
              value={o.value}
              checked={value === o.value}
              onChange={() => onChange(o.value)}
              className="sr-only"
            />
            {o.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/** A single checkbox styled as a 44px row. */
export function CheckRow({ id, checked, onChange, children }: { id: string; checked: boolean; onChange: (v: boolean) => void; children: React.ReactNode }) {
  return (
    <label htmlFor={id} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg px-1">
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-5 w-5 shrink-0 rounded border-slate-400 text-sky-700"
      />
      <span className="text-base">{children}</span>
    </label>
  );
}
