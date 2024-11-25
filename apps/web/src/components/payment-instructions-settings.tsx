'use client';
import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  addPaymentInstruction,
  archivePaymentInstruction,
  branchPaymentInstructions,
} from '@hsm/api-client';
import { browserClient } from '../lib/client';
import { errorMessage } from '../lib/messages';
import { Button } from './ui/button';
import { UpfrontSettingsEditor } from './upfront-settings';
const methods = ['bank_transfer', 'jazzcash', 'easypaisa', 'cash', 'other'] as const;
// BKG-007 / BR-01: the Owner publishes where customers pay the hostel directly.
export function PaymentInstructionsSettings({
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
    queryKey = ['payment-instructions', actorId, branchId];
  const [open, setOpen] = useState(false),
    [method, setMethod] = useState<(typeof methods)[number]>('bank_transfer'),
    [accountTitle, setTitle] = useState(''),
    [accountIdentifier, setIdentifier] = useState(''),
    [instructions, setInstructions] = useState('');
  const query = useQuery({
    queryKey,
    enabled: open,
    gcTime: 0,
    queryFn: () => branchPaymentInstructions(browserClient(), branchId),
  });
  const mutation = useMutation({
    gcTime: 0,
    mutationFn: (
      command: { kind: 'add'; input: Record<string, unknown> } | { kind: 'archive'; id: string },
    ) => {
      const intent = JSON.stringify(command),
        key = keys.current.get(intent) ?? crypto.randomUUID();
      keys.current.set(intent, key);
      return command.kind === 'add'
        ? addPaymentInstruction(browserClient(), branchId, command.input, key)
        : archivePaymentInstruction(browserClient(), branchId, command.id, key);
    },
    onSuccess: async (_result, command) => {
      keys.current.delete(JSON.stringify(command));
      if (command.kind === 'add') {
        setTitle('');
        setIdentifier('');
        setInstructions('');
      }
      await cache.invalidateQueries({ queryKey, exact: true });
    },
  });
  if (!open)
    return (
      <Button variant="secondary" onClick={() => setOpen(true)}>
        View payment instructions
      </Button>
    );
  return (
    <section className="space-y-3" aria-label="Payment instructions">
      <h3 className="font-semibold">Payment instructions</h3>
      <p>
        Customers see these only after you approve a booking that requires upfront payment. The
        platform never receives the money.
      </p>
      <UpfrontSettingsEditor actorId={actorId} branchId={branchId} owner={owner} />
      {query.isPending ? <p role="status">Loading payment instructions…</p> : null}
      {query.isError ? <p role="alert">{errorMessage(query.error)}</p> : null}
      {mutation.isError ? <p role="alert">{errorMessage(mutation.error)}</p> : null}
      {query.data?.data.length === 0 ? <p>No payment instructions are published.</p> : null}
      {query.data?.data.map((row) => (
        <div key={row.id} className="flex flex-wrap items-center gap-2">
          <p>
            {row.method.replaceAll('_', ' ')}: {row.accountTitle} · {row.accountIdentifier}
            {row.instructions ? ' · ' + row.instructions : ''}
          </p>
          {owner ? (
            <Button
              variant="ghost"
              disabled={mutation.isPending}
              onClick={() => mutation.mutate({ kind: 'archive', id: row.id })}
            >
              Archive {row.accountTitle}
            </Button>
          ) : null}
        </div>
      ))}
      {owner ? (
        <form
          className="space-y-2"
          onSubmit={(event) => {
            event.preventDefault();
            if (!accountTitle.trim() || !accountIdentifier.trim() || mutation.isPending) return;
            mutation.mutate({
              kind: 'add',
              input: {
                method,
                accountTitle: accountTitle.trim(),
                accountIdentifier: accountIdentifier.trim(),
                instructions: instructions.trim() || null,
              },
            });
          }}
        >
          <label className="field-label" htmlFor={'instruction-method-' + branchId}>
            Method
          </label>
          <select
            id={'instruction-method-' + branchId}
            className="field-input"
            value={method}
            onChange={(event) =>
              setMethod(methods.find((value) => value === event.target.value) ?? 'other')
            }
          >
            {methods.map((value) => (
              <option key={value} value={value}>
                {value.replaceAll('_', ' ')}
              </option>
            ))}
          </select>
          <label className="field-label" htmlFor={'instruction-title-' + branchId}>
            Account title
          </label>
          <input
            id={'instruction-title-' + branchId}
            className="field-input"
            maxLength={120}
            required
            value={accountTitle}
            onChange={(event) => setTitle(event.target.value)}
          />
          <label className="field-label" htmlFor={'instruction-account-' + branchId}>
            Account number, IBAN or wallet number
          </label>
          <input
            id={'instruction-account-' + branchId}
            className="field-input"
            maxLength={80}
            required
            value={accountIdentifier}
            onChange={(event) => setIdentifier(event.target.value)}
          />
          <label className="field-label" htmlFor={'instruction-notes-' + branchId}>
            Instructions (optional)
          </label>
          <textarea
            id={'instruction-notes-' + branchId}
            className="field-input"
            maxLength={500}
            value={instructions}
            onChange={(event) => setInstructions(event.target.value)}
          />
          <Button
            type="submit"
            disabled={!accountTitle.trim() || !accountIdentifier.trim() || mutation.isPending}
          >
            Add payment instruction
          </Button>
        </form>
      ) : null}
    </section>
  );
}
