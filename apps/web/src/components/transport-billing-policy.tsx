'use client';
import { useState } from 'react';
import {
  billingFormPaisa,
  billingFormRupees,
  marketplacePrice,
  saveTransportBillingPolicy,
} from '@hsm/api-client';
import { ungroupNumberInput } from '@hsm/ui';
import { transportBillingPolicySchema, type TransportBillingPolicyInput } from '@hsm/contracts';
import { browserClient } from '../lib/client';
import { errorMessage } from '../lib/messages';
import { Button } from './ui/button';
import { GroupedNumberField } from './ui/grouped-number-input';
import { CommandRecovery } from './services/command-recovery';
import { useCommand } from './services/use-command';
export function TransportBillingPolicyForm({
  actorId,
  branchId,
  version,
  policy,
  canEdit,
}: {
  actorId: string;
  branchId: string;
  version: string;
  policy: TransportBillingPolicyInput['transportBilling'] | undefined;
  canEdit: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [mode, setMode] = useState(policy?.offer?.mode ?? 'separate');
  const [priceError, setPriceError] = useState(false);
  const [invalid, setInvalid] = useState(false);
  const rules = policy && 'dueDay' in policy ? policy : undefined;
  const save = useCommand(
    'transport-billing-policy',
    (input: TransportBillingPolicyInput, key) =>
      saveTransportBillingPolicy(browserClient(), branchId, input, key),
    [['billing-policy', actorId, branchId]],
  );
  return (
    <section
      aria-label="Transport billing"
      className="space-y-3 rounded-xl border border-border p-3"
    >
      <h3 className="font-semibold">Transport billing</h3>
      <p>
        {policy?.offer?.mode === 'included'
          ? 'Included in rent'
          : rules?.offer
            ? marketplacePrice(rules.offer.monthlyChargePaisa) + '/month · Due day ' + rules.dueDay
            : 'Choose how transport is priced.'}
      </p>
      {canEdit && editing ? (
        <form
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            const fields = new FormData(event.currentTarget);
            const kind = fields.get('proration');
            const refundable = fields.get('refundable');
            let monthlyChargePaisa = 0;
            try {
              if (mode === 'separate')
                monthlyChargePaisa = billingFormPaisa(
                  ungroupNumberInput(String(fields.get('fee'))),
                );
            } catch {
              setPriceError(true);
              return;
            }
            setPriceError(mode === 'separate' && monthlyChargePaisa === 0);
            const parsed = transportBillingPolicySchema.safeParse(
              mode === 'included'
                ? { offer: { mode } }
                : {
                    offer: { mode, monthlyChargePaisa },
                    dueDay: Number(fields.get('dueDay')),
                    refundable:
                      refundable === 'yes' ? true : refundable === 'no' ? false : undefined,
                    proration: kind === 'calendar_days' ? { kind, rounding: 'half_up' } : { kind },
                  },
            );
            // Any schema failure says so; the form never silently does nothing.
            setInvalid(!parsed.success);
            if (parsed.success)
              save.mutate(
                { policyVersionId: version, transportBilling: parsed.data },
                { onSuccess: () => setEditing(false) },
              );
          }}
        >
          <label className="field-label">
            Transport pricing
            <select
              className="field-input"
              value={mode}
              onChange={(event) => {
                setMode(event.target.value === 'included' ? 'included' : 'separate');
                setPriceError(false);
              }}
            >
              <option value="included">Included in rent</option>
              <option value="separate">Billed separately</option>
            </select>
          </label>
          {mode === 'separate' ? (
            <>
              <label className="field-label">
                Monthly transport fee (PKR)
                <GroupedNumberField
                  className="field-input"
                  name="fee"
                  required
                  defaultValue={
                    rules?.offer ? billingFormRupees(rules.offer.monthlyChargePaisa) : ''
                  }
                />
              </label>
              {priceError ? <p role="alert">Enter a monthly fee greater than zero.</p> : null}
              {invalid && !priceError ? (
                <p role="alert">Check the due day, refund and proration choices.</p>
              ) : null}
              <label className="field-label">
                Transport due day
                <input
                  className="field-input"
                  name="dueDay"
                  type="number"
                  min={1}
                  max={31}
                  required
                  defaultValue={rules?.dueDay}
                />
              </label>
              <label className="field-label">
                Refund policy
                <select
                  className="field-input"
                  name="refundable"
                  required
                  defaultValue={rules ? (rules.refundable ? 'yes' : 'no') : ''}
                >
                  <option value="" disabled>
                    Select refund policy
                  </option>
                  <option value="yes">Refundable</option>
                  <option value="no">Non-refundable</option>
                </select>
              </label>
              <label className="field-label">
                Partial months
                <select
                  className="field-input"
                  name="proration"
                  required
                  defaultValue={rules?.proration.kind ?? ''}
                >
                  <option value="" disabled>
                    Select proration
                  </option>
                  <option value="calendar_days">By days</option>
                  <option value="full_period">Full fee</option>
                  <option value="manual">Manual</option>
                </select>
              </label>
            </>
          ) : null}
          <p>Applies to new agreements and subscriptions.</p>
          <CommandRecovery command={save} />
          {save.isError ? <p role="alert">{errorMessage(save.error)}</p> : null}
          <Button type="submit" disabled={save.isPending || save.unresolved}>
            Save transport billing
          </Button>
          <Button
            type="button"
            variant="ghost"
            disabled={save.isPending || save.unresolved}
            onClick={() => setEditing(false)}
          >
            Cancel
          </Button>
        </form>
      ) : canEdit ? (
        <Button
          onClick={() => {
            setMode(policy?.offer?.mode ?? 'separate');
            setPriceError(false);
            setEditing(true);
          }}
        >
          Edit transport billing
        </Button>
      ) : null}
    </section>
  );
}
