import { useState, type FormEvent, type ReactNode } from 'react';
import {
  listingSettingsInputSchema,
  type ListingSettingsInput,
  type PrivateListing,
} from '@hsm/contracts';
import { Button } from './ui/button';
type Amenity = { code: string; name: string };
export function ListingEditor({
  initial,
  catalog,
  disabled,
  onSave,
  onCancel,
  custom,
  customCodes = [],
}: {
  initial: PrivateListing;
  catalog: Amenity[];
  // LIST-00x: the Owner's own amenities render separately and are excluded from this list.
  custom?: (codes: string[], change: (codes: string[]) => void) => ReactNode;
  customCodes?: string[];
  disabled: boolean;
  onSave: (input: ListingSettingsInput) => void;
  onCancel: () => void;
}) {
  const [description, setDescription] = useState(initial.description ?? ''),
    [landmark, setLandmark] = useState(initial.nearbyLandmark ?? ''),
    [phone, setPhone] = useState(initial.publicPhone ?? ''),
    [email, setEmail] = useState(initial.publicEmail ?? ''),
    [visible, setVisible] = useState(initial.showPublicContact),
    [codes, setCodes] = useState(initial.amenities.map((entry) => entry.code)),
    [invalid, setInvalid] = useState(false);
  const choices = new Map(initial.amenities.map((entry) => [entry.code, entry]));
  for (const entry of catalog) choices.set(entry.code, { ...entry, isActive: true });
  for (const code of customCodes) choices.delete(code);
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (disabled) return;
    const parsed = listingSettingsInputSchema.safeParse({
      description: description.trim() || null,
      nearbyLandmark: landmark.trim() || null,
      publicPhone: phone.trim() || null,
      publicEmail: email.trim() || null,
      showPublicContact: visible,
      amenityCodes: codes,
    });
    setInvalid(!parsed.success);
    if (parsed.success) onSave(parsed.data);
  }
  const field = 'mt-1 block w-full rounded-input border border-hsm-border bg-hsm-surface p-3';
  return (
    <form onSubmit={submit} className="space-y-4" aria-label="Edit listing details">
      <fieldset disabled={disabled} className="space-y-4">
        <legend className="font-semibold">Listing details and approved amenities</legend>
        <label className="block">
          Description
          <textarea
            className={field}
            maxLength={4000}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
          />
        </label>
        <label className="block">
          Nearby landmark
          <input
            className={field}
            maxLength={1000}
            value={landmark}
            onChange={(event) => setLandmark(event.target.value)}
          />
        </label>
        <label className="block">
          Public contact phone
          <input
            className={field}
            type="tel"
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
          />
        </label>
        <label className="block">
          Public contact email
          <input
            className={field}
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </label>
        <label className="flex gap-2">
          <input
            type="checkbox"
            checked={visible}
            onChange={(event) => setVisible(event.target.checked)}
          />
          Show these contact details publicly
        </label>
        <p>
          Only the contact details entered here can appear on the marketplace. Clearing a field
          removes its saved value.
        </p>
        <fieldset className="space-y-2">
          <legend>Approved amenities</legend>
          {[...choices.values()].map((entry) => (
            <label key={entry.code} className="flex gap-2">
              <input
                type="checkbox"
                checked={codes.includes(entry.code)}
                disabled={!entry.isActive && !codes.includes(entry.code)}
                onChange={(event) =>
                  setCodes((current) =>
                    event.target.checked
                      ? [...current, entry.code]
                      : current.filter((code) => code !== entry.code),
                  )
                }
              />
              {entry.name}
              {entry.isActive ? '' : ' — Retired; may be removed'}
            </label>
          ))}
          {!choices.size ? <p>No approved amenities are available on the loaded pages.</p> : null}
        </fieldset>
        {custom?.(codes, setCodes)}
        {invalid ? (
          <p role="alert">
            Check the listing fields. Use an international phone number and a valid email address.
          </p>
        ) : null}
        <Button type="submit">Save listing details</Button>
      </fieldset>
      <Button type="button" variant="secondary" onClick={onCancel}>
        Cancel listing edit
      </Button>
    </form>
  );
}
