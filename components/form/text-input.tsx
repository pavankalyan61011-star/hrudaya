type Props = {
  id: string;
  value: string;
  onChange: (value: string) => void;
  invalid?: boolean;
  type?: "text" | "date" | "datetime-local" | "tel";
  /** "numeric" / "decimal" bring up the number keypad on phones. */
  inputMode?: "text" | "numeric" | "decimal" | "tel";
  placeholder?: string;
  required?: boolean;
  autoComplete?: string;
};

export function TextInput({ id, value, onChange, invalid, type = "text", inputMode, placeholder, required, autoComplete = "off" }: Props) {
  return (
    <input
      id={id}
      type={type}
      inputMode={inputMode}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      required={required}
      autoComplete={autoComplete}
      aria-invalid={invalid || undefined}
      aria-describedby={invalid ? `${id}-error` : undefined}
      className={`input ${invalid ? "border-red-600" : ""}`}
    />
  );
}

export function TextArea({ id, value, onChange, invalid, rows = 3, placeholder }: Omit<Props, "type" | "inputMode"> & { rows?: number }) {
  return (
    <textarea
      id={id}
      value={value}
      rows={rows}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      aria-invalid={invalid || undefined}
      aria-describedby={invalid ? `${id}-error` : undefined}
      className={`input ${invalid ? "border-red-600" : ""}`}
    />
  );
}
