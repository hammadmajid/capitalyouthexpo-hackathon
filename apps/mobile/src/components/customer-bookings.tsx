import { Skeleton } from './loading/skeleton';
import { useState } from 'react';
import { Text, TextInput, View } from 'react-native';
import { CalendarDays } from 'lucide-react-native';
import { mobileColors, mobileSurfaces } from '@hsm/ui';
import { marketplacePrice } from '@hsm/api-client';
import { useBookings } from './use-bookings';
import { Copy } from './ui';
import { MarketplaceAction as Button } from './marketplace/action';
import { safeMessage } from '../lib/messages';
import { BookingUpfrontCustomer, upfrontLabels } from './booking-upfront-customer';
export function CustomerBookings({
  actorId,
  hideHeading = false,
}: {
  actorId: string;
  hideHeading?: boolean;
}) {
  return <BookingHistory key={actorId} actorId={actorId} hideHeading={hideHeading} />;
}
function BookingHistory({ actorId, hideHeading }: { actorId: string; hideHeading: boolean }) {
  const { query, cancel } = useBookings(actorId);
  const [target, setTarget] = useState<string>(),
    [reason, setReason] = useState('');
  if (query.isPending) return <Skeleton kind="list" label="Loading your bookings…" />;
  if (query.isError)
    return (
      <View className="gap-3">
        <Copy alert>{safeMessage(query.error)}</Copy>
      </View>
    );
  const bookings = query.data.pages.flatMap((page) => page.data);
  return (
    <View className="gap-4">
      {!hideHeading ? (
        <Text accessibilityRole="header" className="font-heading text-body text-text">
          My bookings
        </Text>
      ) : null}

      {bookings.length === 0 ? <Copy>You have no bookings yet.</Copy> : null}
      {cancel.isError ? <Copy alert>{safeMessage(cancel.error)}</Copy> : null}
      {bookings.map((booking) => (
        <View
          key={booking.id}
          style={mobileSurfaces.icyCard}
          className="rounded-card border border-cardBorder p-4 gap-2"
        >
          <Text className="font-heading text-body text-text">
            {booking.quote.listing.hostelName}
          </Text>
          {booking.quote.listing.branchName !== booking.quote.listing.hostelName ? (
            <Copy>{booking.quote.listing.branchName}</Copy>
          ) : null}
          <Copy>{booking.reference}</Copy>
          <Copy>
            Status:{' '}
            {booking.state === 'pending_request' && booking.upfront
              ? upfrontLabels[booking.upfront.status]
              : booking.state.replaceAll('_', ' ')}
          </Copy>
          <View className="flex-row items-center gap-2">
            <CalendarDays size={18} color={mobileColors.primary} accessible={false} />
            <Copy>
              {booking.quote.range.moveInDate} – {booking.quote.range.moveOutDate}
            </Copy>
          </View>
          {booking.quote.transportRequested && booking.quote.transportOffer ? (
            <Copy>
              Transport selected:{' '}
              {marketplacePrice(booking.quote.transportOffer.monthlyChargePaisa)}/month
            </Copy>
          ) : null}
          {booking.quote.includedTransport?.length ? (
            <Copy>Transport is included in rent on the hostel's listed routes.</Copy>
          ) : null}
          <Copy>Monthly rent: {marketplacePrice(booking.quote.price.monthlyRentPaisa)}</Copy>
          {booking.upfront ? (
            <BookingUpfrontCustomer
              actorId={actorId}
              bookingId={booking.id}
              upfront={booking.upfront}
              open={booking.state === 'pending_request'}
            />
          ) : null}
          {booking.documents.map((document) => (
            <Copy key={document.kind}>
              {document.kind.replaceAll('_', ' ')}: {document.state}
            </Copy>
          ))}
          {booking.quote.policy.cancellationAllowed &&
          ['pending_request', 'confirmed'].includes(booking.state) ? (
            target === booking.id ? (
              <View className="gap-3">
                <Copy>Reason for cancellation</Copy>
                <TextInput
                  accessibilityLabel="Cancellation reason"
                  value={reason}
                  onChangeText={setReason}
                  maxLength={500}
                  multiline
                  editable={!cancel.isPending}
                  className="min-h-12 rounded-input border border-border bg-inputSurface px-4 py-3 font-body text-body text-text"
                />
                <Copy>Hostel cancellation rules apply.</Copy>
                <Button
                  label={cancel.isPending ? 'Requesting cancellation…' : 'Confirm cancellation'}
                  disabled={cancel.isPending || reason.trim().length === 0}
                  onPress={() =>
                    cancel.mutate(
                      { id: booking.id, reason: reason.trim() },
                      {
                        onSuccess: () => {
                          setTarget(undefined);
                          setReason('');
                        },
                      },
                    )
                  }
                />
                <Button
                  secondary
                  label="Keep booking"
                  disabled={cancel.isPending}
                  onPress={() => {
                    setTarget(undefined);
                    setReason('');
                  }}
                />
              </View>
            ) : (
              <Button
                secondary
                label="Cancel booking"
                disabled={cancel.isPending}
                onPress={() => {
                  setTarget(booking.id);
                  setReason('');
                }}
              />
            )
          ) : null}
        </View>
      ))}
      {query.hasNextPage ? (
        <Button
          secondary
          label={query.isFetchingNextPage ? 'Loading more bookings…' : 'More bookings'}
          disabled={query.isFetchingNextPage || cancel.isPending}
          onPress={() => {
            void query.fetchNextPage();
          }}
        />
      ) : null}
    </View>
  );
}
