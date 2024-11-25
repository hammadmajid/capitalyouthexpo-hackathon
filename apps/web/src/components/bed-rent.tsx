'use client';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  billingFormPaisa,
  billingFormRupees,
  marketplacePrice,
  readBedRent,
  scheduleBedRent,
} from '@hsm/api-client';
import type { BedRentInput } from '@hsm/contracts';
import { browserClient } from '../lib/client';
import { errorMessage } from '../lib/messages';
import { Button } from './ui/button';
import { useCommand } from './services/use-command';
import { CommandRecovery } from './services/command-recovery';
import { BedRentEditor } from './bed-rent-editor';
type Props = { actorId: string; branchId: string; bedId: string };
// CHG-056 / CHG-058: this physical bed's own dated rent and security preset (mobile parity with
// apps/mobile/src/components/bed-rent.tsx). Existing booking/agreement snapshots never change.
export function BedRent({ actorId, branchId, bedId }: Props) {
  const queryKey = ['bed-rent', actorId, branchId, bedId];
  const [draft, setDraft] = useState<{ rent: string; security: string }>();
  const query = useQuery({
    queryKey,
    retry: false,
    gcTime: 0,
    queryFn: () => readBedRent(browserClient(), branchId, bedId),
  });
  const run = useCommand(
    'BedRent:save:' + bedId,
    async (input: BedRentInput, key) => {
      const result = await scheduleBedRent(browserClient(), branchId, bedId, input, key);
      setDraft(undefined);
      return result;
    },
    [queryKey, ['branch-inventory-pages', actorId, branchId], ['bed-board', actorId, branchId]],
  );
  if (query.isError) return <p role="alert">{errorMessage(query.error)}</p>;
  if (!query.data) return <p role="status">Loading bed rent…</p>;
  const { bedLabel, canEdit, current } = query.data,
    busy = run.isPending || run.unresolved;
  return (
    <section aria-label="Bed rent and security" className="space-y-2">
      <p>
        {bedLabel} ·{' '}
        {current ? marketplacePrice(current.monthlyRentPaisa) + ' / month' : 'Rent not set'}
      </p>
      {current?.depositPaisa !== undefined ? (
        <p>Security {marketplacePrice(current.depositPaisa)}</p>
      ) : null}
      <CommandRecovery command={run} />
      {run.isError ? <p role="alert">{errorMessage(run.error)}</p> : null}
      {draft ? (
        <BedRentEditor
          initial={draft}
          busy={busy}
          parse={toInput}
          onSave={(input) => run.mutate(input)}
          onCancel={() => setDraft(undefined)}
        />
      ) : canEdit ? (
        <Button
          variant="secondary"
          disabled={busy}
          onClick={() => {
            run.reset();
            setDraft({
              rent: current ? billingFormRupees(current.monthlyRentPaisa) : '',
              security: billingFormRupees(current?.depositPaisa ?? 0),
            });
          }}
        >
          Edit rent &amp; security
        </Button>
      ) : null}
    </section>
  );
}
// Integer paisa only (non-negotiable 5); throws on anything that is not a rupee amount.
function toInput(rent: string, security: string, effectiveFrom: string): BedRentInput {
  return {
    monthlyRentPaisa: billingFormPaisa(rent),
    depositPaisa: billingFormPaisa(security),
    effectiveFrom,
  };
}
