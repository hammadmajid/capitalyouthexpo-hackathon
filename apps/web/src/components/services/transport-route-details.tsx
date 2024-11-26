import { marketplacePrice } from '@hsm/api-client';
import type { TransportRoute } from '@hsm/contracts';

const weekdays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export function TransportRouteDetails({
  route,
  hidePrice,
}: {
  route: TransportRoute;
  hidePrice?: boolean;
}) {
  const trips = route.trips?.filter((trip) => trip.active) ?? [];
  return (
    <div className="space-y-1">
      <p>
        <strong>{route.name}</strong>
        {!hidePrice && (route.pricingMode === 'included' || route.monthlyChargePaisa > 0)
          ? ' · ' +
            (route.pricingMode === 'included'
              ? 'Included in rent'
              : marketplacePrice(route.monthlyChargePaisa) +
                ' per month, billed separately from rent')
          : null}
      </p>
      {route.destinations?.length ? (
        <p>{route.destinations.map(({ name }) => name).join(', ')}</p>
      ) : null}
      {route.stops.length ? <p>{route.stops.join(' → ')}</p> : null}
      {trips.length ? (
        <ul>
          {trips.map((trip, index) => (
            <li key={index}>
              {trip.days.map((day) => weekdays[day - 1]).join(', ')} · hostel to destination{' '}
              {trip.outboundDeparts}
              {trip.outboundArrives
                ? ' · arrives ' +
                  trip.outboundArrives +
                  (trip.outboundArrivesNextDay ? ' (next day)' : '')
                : ''}
              {trip.returnDeparts
                ? ' · destination to hostel ' +
                  trip.returnDeparts +
                  (trip.returnDepartsNextDay ? ' (next day)' : '')
                : ''}
              {trip.returnArrives
                ? ' · return arrives ' +
                  trip.returnArrives +
                  (trip.returnArrivesNextDay ? ' (next day)' : '')
                : ''}
              {' · from ' + trip.effectiveFrom + ' PKT'}
            </li>
          ))}
        </ul>
      ) : route.departureTimes.length ? (
        <p>{route.departureTimes.join(', ')} PKT</p>
      ) : null}
    </div>
  );
}
