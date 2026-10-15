import { label as enumLabel } from "@/lib/labels";

type Props = {
  id: string;
  value: string;
  onChange: (value: string) => void;
  options: readonly (string | { value: string; label: string })[];
  placeholder?: string;
  invalid?: boolean;
  required?: boolean;
};

/** A native <select> (best on phones) for an enum or any value list. */
export function EnumSelect({ id, value, onChange, options, placeholder = "Choose…", invalid, required }: Props) {
  return (
    <select
      id={id}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-invalid={invalid || undefined}
      aria-describedby={invalid ? `${id}-error` : undefined}
      required={required}
      className={`input ${invalid ? "border-red-600" : ""}`}
    >
      <option value="">{placeholder}</option>
      {options.map((o) => {
        const opt = typeof o === "string" ? { value: o, label: enumLabel(o) } : o;
        return (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        );
      })}
    </select>
  );
}
