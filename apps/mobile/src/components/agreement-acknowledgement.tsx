import { useState } from 'react';
import { View } from 'react-native';
import { formatDate, type StayRecord } from '@hsm/contracts';
import { acknowledgeStayAgreement } from '@hsm/api-client';
import { safeMessage } from '../lib/messages';
import { useNativeCommand } from './services/use-command';
import { NativeBillingPolicySummary } from './native-billing-policy-form';
import { Button, Copy } from './ui';
import { IconChip } from './inventory-tools';
import { FileText } from 'lucide-react-native';
type Agreement = StayRecord['agreements'][number];
export function AgreementAcknowledgement(props: {
  actorId: string;
  stayId: string;
  agreement: Agreement;
  own: boolean;
  embedded?: boolean;
}) {
  const [reviewing, setReviewing] = useState(props.embedded ?? false),
    [fullText, setFullText] = useState(false);
  const { agreement, actorId, stayId } = props;
  const command = useNativeCommand<{ version: number; termsDigest: string; acknowledged: true }>(
    'agreement-acknowledgement:' + agreement.id,
    actorId,
    (client, input, key) => acknowledgeStayAgreement(client, stayId, agreement.id, input, key),
    [['stay-record', actorId]],
  );
  const ownAcknowledgement = agreement.acknowledgements?.find(
    (row) => row.acceptedByUserId === actorId,
  );
  return (
    <View className="gap-2">
      {agreement.acknowledgements?.map((row) => (
        <Copy key={row.id}>Acknowledged {formatDate(row.acceptedAt)}</Copy>
      ))}
      {props.embedded ? null : (
        <Button
          secondary
          label={reviewing ? 'Hide agreement policy' : 'Review agreement policy'}
          onPress={() => setReviewing(!reviewing)}
        />
      )}
      {reviewing ? (
        <>
          <NativeBillingPolicySummary policy={agreement.terms.policy} compact />
          {/* The full agreement text repeats these rules, so it opens only on request. */}
          {agreement.terms.policy.agreementTemplate ? (
            <View style={{ alignSelf: 'flex-start' }}>
              <IconChip
                Icon={FileText}
                text={fullText ? 'Hide text' : 'Full text'}
                label={fullText ? 'Hide agreement text' : 'Show agreement text'}
                onPress={() => setFullText(!fullText)}
              />
            </View>
          ) : null}
          {fullText && agreement.terms.policy.agreementTemplate ? (
            <Copy>{agreement.terms.policy.agreementTemplate.text}</Copy>
          ) : null}
        </>
      ) : null}
      {props.own && !ownAcknowledgement && agreement.termsDigest && reviewing ? (
        <Button
          label="Acknowledge this agreement"
          disabled={command.isPending || command.unresolved}
          onPress={() => {
            if (agreement.termsDigest)
              command.mutate({
                version: agreement.version,
                termsDigest: agreement.termsDigest,
                acknowledged: true,
              });
          }}
        />
      ) : null}
      {command.isError ? <Copy alert>{safeMessage(command.error)}</Copy> : null}
      {command.unresolved && !command.isPending ? (
        <Button label="Retry acknowledgement" onPress={() => command.retryOriginal()} />
      ) : null}
    </View>
  );
}
