'use client';
type Props = {
  name: string;
  phone: string;
  email: string;
  disabled: boolean;
  onName: (value: string) => void;
  onPhone: (value: string) => void;
  onEmail: (value: string) => void;
};
export function AdmissionResidentFields(props: Props) {
  return (
    <fieldset disabled={props.disabled} className="space-y-3">
      <legend className="font-semibold">New offline resident</legend>
      <label className="field-label">
        Resident name
        <input
          className="field-input"
          value={props.name}
          maxLength={120}
          required
          onChange={(event) => props.onName(event.target.value)}
        />
      </label>
      <label className="field-label">
        Resident phone (optional)
        <input
          className="field-input"
          type="tel"
          value={props.phone}
          onChange={(event) => props.onPhone(event.target.value)}
        />
      </label>
      <label className="field-label">
        Resident email (optional)
        <input
          className="field-input"
          type="email"
          value={props.email}
          onChange={(event) => props.onEmail(event.target.value)}
        />
      </label>
    </fieldset>
  );
}
