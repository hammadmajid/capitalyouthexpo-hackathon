'use client';
import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { readInventoryAccess, reissueStayInvoice } from '@hsm/api-client';
import type { ResidentInvoiceBalance } from '@hsm/contracts';
import { browserClient } from '../../lib/client';
import { errorMessage } from '../../lib/messages';
import { Button } from '../ui/button';
// CHG-053: only a wholly unpaid, unadjusted open bill can be cancelled and reissued.
export function canReissue(value: ResidentInvoiceBalance) {
  return (
    (value.state === 'issued' || value.state === 'overdue') &&
    value.allocatedPaisa === 0 &&
    value.debitAdjustmentsPaisa === 0 &&
    value.creditAdjustmentsPaisa === 0
  );
}
type Props = { actorId: string; branchId: string; stayId: string; balance: ResidentInvoiceBalance };
// Owner only (canConfigureManagers marks the Owner); the server rechecks the role and the bill,
// voids the old one (kept, never deleted) and issues a replacement with the new due date.
export function BillReissue(props: Props) {
  const [open, setOpen] = useState(false),
    [dueDate, setDueDate] = useState(props.balance.dueDate),
    [reason, setReason] = useState('');
  const key = useRef(crypto.randomUUID());
  const cache = useQueryClient();
  const access = useQuery({
    queryKey: ['inventory-access', props.actorId, props.branchId],
    retry: false,
    // Reuse the parent screen's access read; the server rechecks the Owner role on reissue.
    staleTime: 60_000,
    queryFn: () => readInventoryAccess(browserClient(), props.branchId),
  });
  const save = useMutation({
    mutationFn: () =>
      reissueStayInvoice(
        browserClient(),
        props.branchId,
        props.stayId,
        props.balance.invoiceId,
        { dueDate, reason: reason.trim() },
        key.current,
      ),
    onSuccess: async () => {
      key.current = crypto.randomUUID();
      setOpen(false);
      // The bed's rent colour and the board counts change with the bill, so reload them too.
      await Promise.allSettled(
        ['private-invoices', 'bed-detail', 'bed-board', 'rent-board'].map((root) =>
          cache.invalidateQueries({ queryKey: [root, props.actorId] }),
        ),
      );
    },
  });
  if (!access.data?.canConfigureManagers || !canReissue(props.balance)) return null;
  if (!open)
    return (
      <Button variant="secondary" onClick={() => setOpen(true)}>
        Change due date
      </Button>
    );
  return (
    <section aria-label="Change due date" className="space-y-2">
      <label className="field-label">
        New due date
        <input
          className="field-input"
          type="date"
          value={dueDate}
          onChange={(event) => setDueDate(event.target.value)}
        />
      </label>
      <label className="field-label">
        Why
        <input
          className="field-input"
          value={reason}
          maxLength={500}
          onChange={(event) => setReason(event.target.value)}
        />
      </label>
      {save.error ? <p role="alert">{errorMessage(save.error)}</p> : null}
      <div className="flex flex-wrap gap-2">
        <Button
          disabled={
            save.isPending || !reason.trim() || !dueDate || dueDate === props.balance.dueDate
          }
          onClick={() => save.mutate()}
        >
          {save.isPending ? 'Saving…' : 'Cancel bill & reissue'}
        </Button>
        <Button variant="ghost" disabled={save.isPending} onClick={() => setOpen(false)}>
          Back
        </Button>
      </div>
    </section>
  );
}
