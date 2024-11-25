'use client';
// CHG-054: 13 digits shown as 00000-0000000-0 while typing.
export function formatCnic(raw: string) {
  const digits = raw.replace(/\D/g, '').slice(0, 13);
  return [digits.slice(0, 5), digits.slice(5, 12), digits.slice(12)].filter(Boolean).join('-');
}
export function cnicComplete(value: string) {
  return /^\d{5}-\d{7}-\d$/.test(value);
}
// The resident's CNIC is private: stored encrypted server-side and shown to staff only as the
// last 4 digits afterwards. The input never keeps it beyond this form.
export function CnicInput(props: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  id: string;
}) {
  const partial = props.value.length > 0 && !cnicComplete(props.value);
  return (
    <label className="field-label" htmlFor={props.id}>
      Resident CNIC
      <input
        id={props.id}
        className="field-input"
        inputMode="numeric"
        autoComplete="off"
        placeholder="00000-0000000-0"
        maxLength={15}
        value={props.value}
        disabled={props.disabled}
        aria-invalid={partial || undefined}
        onChange={(event) => props.onChange(formatCnic(event.target.value))}
      />
    </label>
  );
}
