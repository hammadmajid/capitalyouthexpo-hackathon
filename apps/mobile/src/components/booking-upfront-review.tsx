import { useState } from 'react';
import { Linking, TextInput, View } from 'react-native';
import type { BookingUpfront } from '@hsm/contracts';
import { bookingPaymentProofLink, marketplacePrice } from '@hsm/api-client';
import { actorClient } from '../lib/runtime';
import { safeMessage } from '../lib/messages';
import { Copy } from './ui';
import { MarketplaceAction as Button } from './marketplace/action';
type Review = { decision: 'approve' } | { decision: 'reject'; reason: string };
// ACC-004 / BKG-008: staff compare the proof with their own records; approval confirms.
export function BookingUpfrontReview({
  actorId,
  branchId,
  bookingId,
  upfront,
  canReview,
  pending,
  error,
  onReview,
}: {
  actorId: string;
  branchId: string;
  bookingId: string;
  upfront: BookingUpfront;
  canReview: boolean;
  pending: boolean;
  error: unknown;
  onReview: (proofId: string, review: Review) => void;
}) {
  const [rejecting, setRejecting] = useState(false),
    [reason, setReason] = useState(''),
    [linkError, setLinkError] = useState<unknown>();
  const proof = upfront.proof;
  return (
    <View className="gap-2" accessibilityLabel="Upfront payment verification">
      <Copy>
        Upfront{' '}
        {upfront.requirement === 'none'
          ? 'selected transport'
          : upfront.requirement.replaceAll('_', ' ')}
        : {marketplacePrice(upfront.amountPaisa)} · {upfront.status.replaceAll('_', ' ')}
      </Copy>
      {proof ? (
        <Copy>
          Proof {proof.state}: {marketplacePrice(proof.amountPaisa)} by{' '}
          {proof.method.replaceAll('_', ' ')} on {proof.paidOn}
          {proof.reference ? ' · reference ' + proof.reference : ''}
          {proof.reviewReason ? ' · ' + proof.reviewReason : ''}
        </Copy>
      ) : null}
      {canReview && proof?.state === 'submitted' ? (
        <View className="gap-2">
          <Button
            secondary
            label="Open payment proof"
            onPress={() => {
              setLinkError(undefined);
              void actorClient(actorId)
                .then((client) => bookingPaymentProofLink(client, branchId, bookingId, proof.id))
                .then((link) => Linking.openURL(link.url))
                .catch(setLinkError);
            }}
          />
          {linkError ? <Copy alert>{safeMessage(linkError)}</Copy> : null}
          <Copy>Approve only after the money appears in your own hostel account.</Copy>
          {error ? <Copy alert>{safeMessage(error)}</Copy> : null}
          {rejecting ? (
            <View className="gap-2">
              <TextInput
                accessibilityLabel="Reason the proof was not accepted"
                className="rounded-input border border-border px-3 py-2"
                maxLength={500}
                multiline
                value={reason}
                editable={!pending}
                onChangeText={setReason}
              />
              <Button
                label="Reject payment proof"
                disabled={pending || !reason.trim()}
                onPress={() => onReview(proof.id, { decision: 'reject', reason: reason.trim() })}
              />
              <Button secondary label="Keep proof pending" onPress={() => setRejecting(false)} />
            </View>
          ) : (
            <View className="gap-2">
              <Button
                label={pending ? 'Verifying…' : 'Verify payment and confirm booking'}
                disabled={pending}
                onPress={() => onReview(proof.id, { decision: 'approve' })}
              />
              <Button secondary label="Reject proof" onPress={() => setRejecting(true)} />
            </View>
          )}
        </View>
      ) : null}
    </View>
  );
}
