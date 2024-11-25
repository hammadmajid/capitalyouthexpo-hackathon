'use client';
import { useState, type FormEvent } from 'react';
import { residentProfileInputSchema, type ManualStayInput } from '@hsm/contracts';
import { Button } from './ui/button';
import { AdmissionResidentFields } from './admission-resident-fields';
import { CnicInput, cnicComplete } from './cnic-input';
import { PrivateFileInput } from './private-file-input';
export function AdmissionNewResident({
  disabled,
  onChoose,
}: {
  disabled: boolean;
  onChoose: (resident: ManualStayInput['resident'], label: string, cnicPhoto?: string) => void;
}) {
  const [name, setName] = useState(''),
    [phone, setPhone] = useState(''),
    [email, setEmail] = useState(''),
    [cnic, setCnic] = useState(''),
    [photo, setPhoto] = useState<string>(),
    [uploading, setUploading] = useState(false),
    [invalid, setInvalid] = useState(false);
  function submit(event: FormEvent) {
    event.preventDefault();
    if (disabled || uploading) return;
    // CHG-054: a new walk-in resident's CNIC is required in the app (the API keeps it optional
    // for residents added earlier).
    const result = residentProfileInputSchema.safeParse({
      displayName: name,
      ...(phone.trim() ? { phone } : {}),
      ...(email.trim() ? { email } : {}),
      cnic,
    });
    if (!result.success || !cnicComplete(cnic)) {
      setInvalid(true);
      return;
    }
    setInvalid(false);
    onChoose({ kind: 'new', profile: result.data }, result.data.displayName, photo);
  }
  return (
    <form onSubmit={submit} className="space-y-3">
      <p>
        This creates an offline resident relationship for this branch. It does not create a login or
        merge matching contact details with an account.
      </p>
      {invalid ? (
        <p role="alert">
          Enter a resident name, a 13-digit CNIC and valid optional contact details.
        </p>
      ) : null}
      <AdmissionResidentFields
        name={name}
        phone={phone}
        email={email}
        disabled={disabled}
        onName={setName}
        onPhone={setPhone}
        onEmail={setEmail}
      />
      <CnicInput id="admission-cnic" value={cnic} onChange={setCnic} disabled={disabled} />
      <PrivateFileInput
        id="admission-cnic-photo"
        label="CNIC photo (optional)"
        purpose="resident_document"
        disabled={disabled}
        onBusy={setUploading}
        onReady={setPhoto}
      />
      <Button type="submit" disabled={disabled || uploading}>
        Continue with offline resident
      </Button>
    </form>
  );
}
