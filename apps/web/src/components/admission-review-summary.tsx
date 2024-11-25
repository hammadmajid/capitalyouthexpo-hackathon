import type { ReactNode } from 'react';
import { formatDate, moneyFromJson, type ManualStayInput } from '@hsm/contracts';
import { admissionAmount } from './admission-billing-values';
import { BillingPolicySummary } from './billing-policy-summary';
function Value({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}
export function AdmissionReviewSummary({
  manual,
  branchLabel,
  residentLabel,
  targetLabel,
}: {
  manual: ManualStayInput;
  branchLabel: string;
  residentLabel: string;
  targetLabel: string;
}) {
  return (
    <>
      <p>
        {branchLabel} · {residentLabel} · {targetLabel}
      </p>
      <p>
        This records actual admission now. The agreed deposit is a requirement, not a recorded
        payment.
      </p>
      <dl className="grid gap-3 sm:grid-cols-2">
        <Value label="Agreed Stay start">
          {formatDate(manual.period.moveInDate + 'T00:00:00.000Z')}
        </Value>
        <Value label="Agreed departure">
          {manual.period.expectedLeaveDate
            ? formatDate(manual.period.expectedLeaveDate + 'T00:00:00.000Z')
            : 'Open-ended agreement'}
        </Value>
        <Value label="Agreed rent per billing cycle">
          {admissionAmount(moneyFromJson(manual.terms.rentAmountPaisa))}
        </Value>
        <Value label="Agreed deposit requirement">
          {admissionAmount(moneyFromJson(manual.terms.depositPaisa))}
        </Value>
      </dl>
      <details>
        <summary>Agreed billing policy</summary>
        <BillingPolicySummary policy={manual.terms.policy} />
      </details>
      {manual.terms.catalog.length ? (
        <div>
          <p>Agreed extra-charge unit prices. This action does not charge these extras.</p>
          <ul>
            {manual.terms.catalog.map((item) => (
              <li key={item.catalogId}>
                {item.name}: {admissionAmount(moneyFromJson(item.unitAmountPaisa))} /{' '}
                {item.unitLabel}
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p>No additional catalogue charges are agreed.</p>
      )}
    </>
  );
}
