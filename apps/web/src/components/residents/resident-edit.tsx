'use client';
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { updateResidentContact } from '@hsm/api-client';
import { residentContactUpdateSchema } from '@hsm/contracts';
import { browserClient } from '../../lib/client';
import { errorMessage } from '../../lib/messages';
import { Button } from '../ui/button';
// A local 03XXXXXXXXX number is stored in the +92 form the server requires.
export function toE164(value: string) {
  const digits = value.replace(/[\s-]/g, '');
  if (!digits) return null;
  if (/^0[0-9]{10}$/.test(digits)) return '+92' + digits.slice(1);
  if (/^92[0-9]{10}$/.test(digits)) return '+' + digits;
  return digits;
}
type Props = {
  actorId: string;
  branchId: string;
  residentId: string;
  name: string;
  phone: string | null;
  email: string | null;
  close: () => void;
};
// RES-006: staff correct an offline resident's name and contact; the server audits it and
// refuses linked residents, who manage their own account details (CHG-009).
export function ResidentEdit(props: Props) {
  const cache = useQueryClient();
  const [name, setName] = useState(props.name),
    [phone, setPhone] = useState(props.phone ?? ''),
    [email, setEmail] = useState(props.email ?? '');
  const parsed = residentContactUpdateSchema.safeParse({
    displayName: name,
    phone: toE164(phone),
    email: email.trim() ? email : null,
  });
  const save = useMutation({
    mutationFn: () => {
      if (!parsed.success) throw new Error('Invalid resident details');
      return updateResidentContact(browserClient(), props.branchId, props.residentId, parsed.data);
    },
    onSuccess: async () => {
      await Promise.allSettled(
        [
          'resident-profile',
          'resident-directory',
          'stay-record',
          'private-stays',
          'bed-detail',
        ].map((root) =>
          cache.invalidateQueries({ queryKey: [root, props.actorId, props.branchId] }),
        ),
      );
      props.close();
    },
  });
  return (
    <section
      aria-label="Edit resident"
      className="space-y-3 rounded-input border border-hsm-border p-4"
    >
      <h4 className="font-semibold">Edit resident</h4>
      <label className="field-label">
        Resident name
        <input
          className="field-input"
          value={name}
          maxLength={120}
          onChange={(event) => setName(event.target.value)}
        />
      </label>
      <label className="field-label">
        Resident phone
        <input
          className="field-input"
          type="tel"
          value={phone}
          placeholder="03XX XXXXXXX"
          onChange={(event) => setPhone(event.target.value)}
        />
      </label>
      <label className="field-label">
        Resident email (optional)
        <input
          className="field-input"
          type="email"
          value={email}
          maxLength={254}
          onChange={(event) => setEmail(event.target.value)}
        />
      </label>
      {!parsed.success && name.trim() ? (
        <p className="text-sm">Phone 03XXXXXXXXX · valid email</p>
      ) : null}
      {save.error ? <p role="alert">{errorMessage(save.error)}</p> : null}
      <div className="flex flex-wrap gap-2">
        <Button disabled={!parsed.success || save.isPending} onClick={() => save.mutate()}>
          {save.isPending ? 'Saving…' : 'Save resident'}
        </Button>
        <Button variant="ghost" disabled={save.isPending} onClick={props.close}>
          Cancel resident edit
        </Button>
      </div>
    </section>
  );
}
