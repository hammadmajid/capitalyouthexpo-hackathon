'use client';
import type { ManualStayInput } from '@hsm/contracts';
import type { useAdmissionBillingDraft } from './use-admission-billing-draft';
import { AdmissionBillingLine } from './admission-billing-line';
import { Button } from './ui/button';
export function AdmissionBillingFields({
  manual,
  draft,
  pending,
  uncertain,
}: {
  manual: ManualStayInput;
  draft: ReturnType<typeof useAdmissionBillingDraft>;
  pending: boolean;
  uncertain: boolean;
}) {
  const disabled = pending || uncertain || Boolean(draft.prepared);
  return (
    <form onSubmit={draft.review} className="space-y-4">
      <fieldset disabled={disabled} className="space-y-4">
        <legend className="font-semibold">Initial rent and every disclosed fee</legend>
        {draft.obligations.map((item) => {
          const value = draft.values.get(item.key);
          return value ? (
            <AdmissionBillingLine
              key={item.key}
              manual={manual}
              obligation={item}
              value={value}
              disabled={disabled}
              onChange={(next) => draft.update(item.key, next)}
            />
          ) : null;
        })}
      </fieldset>
      {!draft.prepared ? (
        <Button type="submit" disabled={pending || uncertain}>
          Review admission
        </Button>
      ) : null}
    </form>
  );
}
