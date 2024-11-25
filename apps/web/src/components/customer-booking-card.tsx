import type { z } from 'zod';
import type { bookingSummarySchema } from '@hsm/contracts';
import { marketplacePrice } from '@hsm/api-client';
import { Button } from './ui/button';
import { BookingUpfrontCustomer, upfrontLabels } from './booking-upfront-customer';
export type CustomerBooking = z.infer<typeof bookingSummarySchema>;
const stateLabels: Record<CustomerBooking['state'], string> = {
  pending_request: 'Awaiting hostel approval',
  confirmed: 'Confirmed',
  rejected: 'Rejected',
  cancelled: 'Cancelled',
  expired: 'Request expired',
};
export function CustomerBookingCard({
  actorId,
  booking,
  disabled,
  onCancel,
}: {
  actorId: string;
  booking: CustomerBooking;
  disabled: boolean;
  onCancel: () => void;
}) {
  return (
    <article
      className="customer-frost space-y-2 p-4 sm:p-5"
      aria-label={'Booking at ' + booking.quote.listing.hostelName}
    >
      <h4 className="font-semibold">{booking.quote.listing.hostelName}</h4>
      <p>
        {booking.quote.listing.branchName !== booking.quote.listing.hostelName
          ? booking.quote.listing.branchName + ' · '
          : ''}
        {booking.quote.listing.roomTypeName}
      </p>
      <p className="break-all text-sm">Reference: {booking.reference}</p>
      <p>
        Status:{' '}
        {booking.state === 'pending_request' && booking.upfront
          ? upfrontLabels[booking.upfront.status]
          : stateLabels[booking.state]}
      </p>
      <p>
        Room {booking.quote.listing.roomLabel}
        {booking.quote.listing.bedLabel ? ', bed ' + booking.quote.listing.bedLabel : ''}
      </p>
      <p>
        Move in: {booking.quote.range.moveInDate} · Move out: {booking.quote.range.moveOutDate}
      </p>
      {booking.quote.transportRequested && booking.quote.transportOffer ? (
        <p>
          Transport selected: {marketplacePrice(booking.quote.transportOffer.monthlyChargePaisa)}
          /month
        </p>
      ) : null}
      {booking.quote.includedTransport?.length ? (
        <p>Transport is included in rent on the hostel's listed routes.</p>
      ) : null}
      <p>Agreed monthly rent: {marketplacePrice(booking.quote.price.monthlyRentPaisa)}</p>
      <p>Disclosed deposit: {marketplacePrice(booking.quote.price.depositPaisa)}</p>
      {booking.quote.price.fees.map((fee) => (
        <p key={fee.code + ':' + fee.cadence}>
          {fee.code.replaceAll('_', ' ')}: {marketplacePrice(fee.amountPaisa)} (
          {fee.cadence === 'monthly' ? 'monthly' : 'one time'})
        </p>
      ))}
      {booking.documents.map((document) => (
        <p key={document.kind}>
          {document.kind.replaceAll('_', ' ')}: {document.state}
        </p>
      ))}
      {booking.upfront ? (
        <BookingUpfrontCustomer
          actorId={actorId}
          bookingId={booking.id}
          upfront={booking.upfront}
          open={booking.state === 'pending_request' && !disabled}
        />
      ) : null}
      <p>
        Cancellation:{' '}
        {booking.quote.policy.cancellationAllowed
          ? 'Allowed subject to the agreed ' +
            booking.quote.policy.cancellationCutoffHours +
            '-hour cutoff and server checks.'
          : 'Not allowed by the agreed policy.'}
      </p>
      {booking.quote.policy.cancellationAllowed &&
      (booking.state === 'pending_request' || booking.state === 'confirmed') ? (
        <Button variant="secondary" disabled={disabled} onClick={onCancel}>
          Cancel booking
        </Button>
      ) : null}
    </article>
  );
}
