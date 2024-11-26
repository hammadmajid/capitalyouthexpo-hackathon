import { Skeleton } from './loading/skeleton';
import { useState } from 'react';
import { BookingCheckIn } from './booking-check-in';
import { BookingUpfrontReview } from './booking-upfront-review';
import { TextInput, View } from 'react-native';
import { marketplacePrice } from '@hsm/api-client';
import { safeMessage } from '../lib/messages';
import { Button, Copy } from './ui';
import {
  nativeScopeDenied,
  useHostelBookings,
  type HostelBookingAction,
} from './use-hostel-bookings';
const actionNames = {
  confirm: 'confirmation',
  approve: 'approval',
  reject: 'rejection',
  cancel: 'cancellation',
};
export function HostelBookings(props: {
  actorId: string;
  branchId: string;
  accessUnavailable?: boolean;
}) {
  return <BranchQueue key={props.actorId + ':' + props.branchId} {...props} />;
}
function BranchQueue({
  actorId,
  branchId,
  accessUnavailable = false,
}: {
  actorId: string;
  branchId: string;
  accessUnavailable?: boolean;
}) {
  const [selection, setSelection] = useState<{ id: string; action: HostelBookingAction }>(),
    [reason, setReason] = useState(''),
    [saved, setSaved] = useState(false);
  const { query, access, action, review } = useHostelBookings(actorId, branchId, () => {
    setSelection(undefined);
    setReason('');
    setSaved(true);
  });
  const denied = [query.error, access.error, action.error].find(nativeScopeDenied);
  if (denied) return <Copy alert>{safeMessage(denied)}</Copy>;
  if (query.isPending) return <Skeleton kind="list" label="Loading branch bookings…" />;
  if (!query.data)
    return (
      <View className="gap-3">
        <Copy alert>{safeMessage(query.error)}</Copy>
      </View>
    );
  const rows = query.data.pages.flatMap((page) => page.data),
    permissions = access.data?.permissions.includes('booking_manage') ?? false,
    canCheckIn = (['stay_manage', 'rent_manage', 'finance_view'] as const).every(
      (permission) => access.data?.permissions.includes(permission) ?? false,
    ),
    canReview =
      permissions &&
      (['payment_record', 'finance_view'] as const).every(
        (permission) => access.data?.permissions.includes(permission) ?? false,
      );
  const selected = rows.find((row) => row.id === selection?.id),
    available =
      selected &&
      (selected.state === 'pending_request' ||
        (selected.state === 'confirmed' && selection?.action === 'cancel'));
  const disabled =
    accessUnavailable ||
    action.isPending ||
    query.isFetching ||
    access.isFetching ||
    Boolean(query.error || access.error) ||
    !permissions;
  return (
    <View className="gap-4">
      {saved ? <Copy>Saved</Copy> : null}
      {query.error || access.error ? <Copy alert>Could not refresh · actions paused</Copy> : null}
      {action.error ? <Copy alert>{safeMessage(action.error)}</Copy> : null}
      {rows.length === 0 ? <Copy>No bookings yet</Copy> : null}
      {rows.map((booking) => (
        <View key={booking.id} className="gap-2 rounded-input border border-border p-4">
          <Copy>{booking.reference}</Copy>
          <Copy>Status: {booking.state.replaceAll('_', ' ')}</Copy>
          <Copy>
            Room {booking.quote.listing.roomLabel}
            {booking.quote.listing.bedLabel ? ', bed ' + booking.quote.listing.bedLabel : ''}
          </Copy>
          <Copy>
            Move in: {booking.quote.range.moveInDate} · Move out: {booking.quote.range.moveOutDate}
          </Copy>
          {/* BKG-004: the price locked at request time. */}
          {booking.quote.transportRequested && booking.quote.transportOffer ? (
            <Copy>
              Transport selected:{' '}
              {marketplacePrice(booking.quote.transportOffer.monthlyChargePaisa)}/month
            </Copy>
          ) : null}
          {booking.quote.includedTransport?.length ? (
            <Copy>Transport is included in rent on the hostel's listed routes.</Copy>
          ) : null}
          <Copy>Rent {marketplacePrice(booking.quote.price.monthlyRentPaisa)}/month</Copy>
          <Copy>Deposit {marketplacePrice(booking.quote.price.depositPaisa)}</Copy>
          {booking.quote.price.fees.map((fee) => (
            <Copy key={fee.code + ':' + fee.cadence}>
              {fee.code.replaceAll('_', ' ')}: {marketplacePrice(fee.amountPaisa)} (
              {fee.cadence === 'monthly' ? 'monthly' : 'one time'})
            </Copy>
          ))}
          {booking.requestExpiresAt ? (
            <Copy>Request deadline: {booking.requestExpiresAt}</Copy>
          ) : null}
          {booking.documents.map((document) => (
            <Copy key={document.kind}>
              {document.kind.replaceAll('_', ' ')}: {document.state}
            </Copy>
          ))}
          {booking.stay ? (
            <Copy>Checked in · {booking.stay.state.replaceAll('_', ' ')}</Copy>
          ) : null}
          {!booking.stay && canCheckIn && booking.state === 'confirmed' && !disabled ? (
            <BookingCheckIn actorId={actorId} branchId={branchId} bookingId={booking.id} />
          ) : null}
          {booking.upfront ? (
            <BookingUpfrontReview
              actorId={actorId}
              branchId={branchId}
              bookingId={booking.id}
              upfront={booking.upfront}
              canReview={canReview && booking.state === 'pending_request' && !disabled}
              pending={review.isPending}
              error={review.error}
              onReview={(proofId, decision) =>
                review.mutate({ id: booking.id, proofId, review: decision })
              }
            />
          ) : null}
          {permissions && (booking.state === 'pending_request' || booking.state === 'confirmed') ? (
            selection?.id === booking.id && available ? (
              <View className="gap-3">
                <Copy>Reason for {actionNames[selection.action]}</Copy>
                <TextInput
                  accessibilityLabel="Booking action reason"
                  value={reason}
                  onChangeText={setReason}
                  maxLength={500}
                  multiline
                  editable={!disabled}
                  className="min-h-12 rounded-input border border-border bg-inputSurface px-4 py-3 font-body text-body text-text"
                />
                <Button
                  label={
                    action.isPending ? 'Saving booking…' : 'Submit ' + actionNames[selection.action]
                  }
                  disabled={disabled || !reason.trim()}
                  onPress={() => {
                    if (!disabled && reason.trim())
                      action.mutate({ ...selection, reason: reason.trim() });
                  }}
                />
                <Button
                  secondary
                  label="Keep booking unchanged"
                  disabled={action.isPending}
                  onPress={() => {
                    setSelection(undefined);
                    setReason('');
                    action.reset();
                  }}
                />
              </View>
            ) : (
              <View className="gap-2">
                {(booking.state !== 'pending_request'
                  ? (['cancel'] as const)
                  : !booking.upfront
                    ? (['confirm', 'reject', 'cancel'] as const)
                    : booking.upfront.status === 'awaiting_approval'
                      ? (['approve', 'reject', 'cancel'] as const)
                      : (['reject', 'cancel'] as const)
                ).map((next) => (
                  <Button
                    key={next}
                    secondary
                    label={
                      next === 'confirm'
                        ? 'Confirm request'
                        : next === 'approve'
                          ? 'Approve and request payment'
                          : next === 'reject'
                            ? 'Reject request'
                            : 'Cancel booking'
                    }
                    disabled={disabled}
                    onPress={() => {
                      setSelection({ id: booking.id, action: next });
                      setReason('');
                      setSaved(false);
                      action.reset();
                    }}
                  />
                ))}
              </View>
            )
          ) : null}
        </View>
      ))}
      {selection && (!available || !permissions) ? (
        <>
          <Copy alert>This booking action is no longer available.</Copy>
          <Button
            secondary
            label="Close unavailable action"
            onPress={() => {
              setSelection(undefined);
              setReason('');
              action.reset();
            }}
          />
        </>
      ) : null}
      {query.hasNextPage ? (
        <Button
          secondary
          label="More branch bookings"
          disabled={query.isFetchingNextPage}
          onPress={() => void query.fetchNextPage()}
        />
      ) : null}
    </View>
  );
}
