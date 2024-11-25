'use client';
import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { UpfrontSettings as Settings } from '@hsm/contracts';
import { readUpfrontSettings, updateUpfrontSettings } from '@hsm/api-client';
import { browserClient } from '../lib/client';
import { errorMessage } from '../lib/messages';
import { Button } from './ui/button';
const labels: Record<Settings['requirement'], string> = {
  none: 'No upfront payment (approval confirms)',
  deposit: 'Security deposit before confirmation',
  first_rent: 'First month rent before confirmation',
  deposit_and_first_rent: 'Deposit and first month rent before confirmation',
};
// BKG-007: Owner policy; requests already submitted keep their captured terms.
export function UpfrontSettingsEditor({
  actorId,
  branchId,
  owner,
}: {
  actorId: string;
  branchId: string;
  owner: boolean;
}) {
  const cache = useQueryClient(),
    keys = useRef(new Map<string, string>()),
    queryKey = ['upfront-settings', actorId, branchId];
  const [draft, setDraft] = useState<Settings>();
  const query = useQuery({
    queryKey,
    gcTime: 0,
    queryFn: () => readUpfrontSettings(browserClient(), branchId),
  });
  const save = useMutation({
    gcTime: 0,
    mutationFn: (input: Settings) => {
      const intent = JSON.stringify(input),
        key = keys.current.get(intent) ?? crypto.randomUUID();
      keys.current.set(intent, key);
      return updateUpfrontSettings(browserClient(), branchId, input, key);
    },
    onSuccess: async (_result, input) => {
      keys.current.delete(JSON.stringify(input));
      setDraft(undefined);
      await cache.invalidateQueries({ queryKey, exact: true });
    },
  });
  if (query.isPending) return <p role="status">Loading upfront payment policy…</p>;
  if (query.isError) return <p role="alert">{errorMessage(query.error)}</p>;
  const value = draft ?? query.data;
  return (
    <div className="space-y-2" aria-label="Upfront payment policy">
      <label className="field-label" htmlFor={'upfront-requirement-' + branchId}>
        Upfront payment before confirmation
      </label>
      <select
        id={'upfront-requirement-' + branchId}
        className="field-input"
        value={value.requirement}
        disabled={!owner || save.isPending}
        onChange={(event) => {
          const requirement = (Object.keys(labels) as Settings['requirement'][]).find(
            (key) => key === event.target.value,
          );
          if (requirement) setDraft({ ...value, requirement });
        }}
      >
        {(Object.keys(labels) as Settings['requirement'][]).map((key) => (
          <option key={key} value={key}>
            {labels[key]}
          </option>
        ))}
      </select>
      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={value.proofRetryAllowed}
          disabled={!owner || save.isPending}
          onChange={(event) => setDraft({ ...value, proofRetryAllowed: event.target.checked })}
        />
        Allow a replacement proof after rejection
      </label>
      <p>Changes apply to booking requests submitted afterwards.</p>
      {save.isError ? <p role="alert">{errorMessage(save.error)}</p> : null}
      {owner && draft ? (
        <Button disabled={save.isPending} onClick={() => save.mutate(draft)}>
          Save upfront payment policy
        </Button>
      ) : null}
    </div>
  );
}
