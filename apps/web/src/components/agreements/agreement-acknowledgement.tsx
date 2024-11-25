'use client';
import { useState } from 'react';
import { acknowledgeStayAgreement } from '@hsm/api-client';
import { formatDate, type StayRecord } from '@hsm/contracts';
import { browserClient } from '../../lib/client';
import { errorMessage } from '../../lib/messages';
import { BillingPolicySummary } from '../billing-policy-summary';
import { useCommand } from '../services/use-command';
import { Button } from '../ui/button';
type Agreement = StayRecord['agreements'][number];
type Props = { actorId: string; stayId: string; agreement: Agreement; own: boolean };
// STAY-002: a resident reviews the agreed rules and acknowledges the exact terms digest; the
// server records who accepted which version and when. Staff see the record but cannot accept.
export function AgreementAcknowledgement({ actorId, stayId, agreement, own }: Props) {
  const [fullText, setFullText] = useState(false);
  const command = useCommand<{ version: number; termsDigest: string; acknowledged: true }>(
    'agreement-acknowledgement:' + agreement.id,
    (input, key) => acknowledgeStayAgreement(browserClient(), stayId, agreement.id, input, key),
    [['stay-record', actorId]],
  );
  const template = agreement.terms.policy.agreementTemplate,
    digest = agreement.termsDigest,
    accepted = agreement.acknowledgements?.some((row) => row.acceptedByUserId === actorId);
  return (
    <section aria-label="Agreement rules" className="space-y-2">
      <h5 className="font-semibold">Agreement rules</h5>
      {agreement.acknowledgements?.map((row) => (
        <p key={row.id}>Acknowledged {formatDate(row.acceptedAt)}</p>
      ))}
      <BillingPolicySummary policy={agreement.terms.policy} />
      {template ? (
        <>
          <p className="font-semibold">{template.title}</p>
          {template.text ? (
            <Button variant="ghost" onClick={() => setFullText(!fullText)}>
              {fullText ? 'Hide agreement text' : 'Show agreement text'}
            </Button>
          ) : null}
          {fullText ? <p className="whitespace-pre-wrap text-sm">{template.text}</p> : null}
        </>
      ) : null}
      {own && digest && !accepted ? (
        <Button
          disabled={command.isPending || command.unresolved}
          onClick={() =>
            command.mutate({ version: agreement.version, termsDigest: digest, acknowledged: true })
          }
        >
          Acknowledge this agreement
        </Button>
      ) : null}
      {command.error ? <p role="alert">{errorMessage(command.error)}</p> : null}
      {command.unresolved && !command.isPending ? (
        <Button onClick={() => command.retryOriginal()}>Retry acknowledgement</Button>
      ) : null}
    </section>
  );
}
