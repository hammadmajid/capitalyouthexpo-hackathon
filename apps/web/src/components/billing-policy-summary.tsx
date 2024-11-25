import type { BillingPolicy } from '@hsm/contracts';
import { billingDraftFrom } from '../lib/billing-policy-draft';
import { billingPolicyFields } from './billing-policy-fields';
export function BillingPolicySummary({ policy }: { policy: BillingPolicy }) {
  const draft = billingDraftFrom(policy);
  return (
    <dl className="grid gap-3 sm:grid-cols-2">
      {billingPolicyFields(draft).map((field) => (
        <div key={field.name}>
          <dt className="text-sm text-hsm-secondary">{field.label}</dt>
          <dd>
            {field.choices
              ? field.choices.find(([value]) => value === draft[field.name])?.[1]
              : field.amount
                ? 'Rs ' + draft[field.name]
                : draft[field.name]}
          </dd>
        </div>
      ))}
    </dl>
  );
}
