import Link from 'next/link';
import Image from 'next/image';
import { marketplacePrice, type readPublicHostelSummary } from '@hsm/api-client';
type Summary = Awaited<ReturnType<typeof readPublicHostelSummary>>;
export function GuardianSummary({ summary }: { summary: Summary }) {
  const { listing, rooms, rules } = summary;
  return (
    <main id="main" className="mx-auto max-w-4xl space-y-6 bg-hsm-background p-6 text-hsm-text">
      <Link href="/">Find hostels</Link>
      <header className="space-y-2">
        <p className="text-hsm-primary">Verified hostel · Public family summary</p>
        <h1 className="text-3xl font-semibold">{listing.name}</h1>
        <p>{listing.address}</p>
        <p>{[listing.area, listing.city].filter(Boolean).join(', ')}</p>
        {listing.landmark ? <p>Landmark: {listing.landmark}</p> : null}
      </header>
      <section aria-label="Prices and deposits" className="space-y-3">
        <h2 className="text-xl font-semibold">Rooms, rent and security deposit</h2>
        <p>
          {listing.priceFromPaisa === null
            ? 'Starting rent unavailable.'
            : 'Monthly rent from ' + marketplacePrice(listing.priceFromPaisa)}
        </p>
        <p>
          Prices shown are current published monthly amounts. Choose dates in the full listing for
          live availability and a booking quote.
        </p>
        {!rooms.data.length ? <p>No public room types on this page.</p> : null}
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <caption className="sr-only">Published room types and prices</caption>
            <thead>
              <tr>
                {['Room type', 'Capacity', 'Bed rent / month', 'Room rent / month', 'Deposit'].map(
                  (label) => (
                    <th className="p-2" scope="col" key={label}>
                      {label}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {rooms.data.map((type) => (
                <tr key={type.id}>
                  <th className="p-2" scope="row">
                    {type.name}
                  </th>
                  <td className="p-2">{type.capacity}</td>
                  <td className="p-2">
                    {type.bedMonthlyRentPaisa === null
                      ? 'Not offered'
                      : marketplacePrice(type.bedMonthlyRentPaisa)}
                  </td>
                  <td className="p-2">
                    {type.roomMonthlyRentPaisa === null
                      ? 'Not offered'
                      : marketplacePrice(type.roomMonthlyRentPaisa)}
                  </td>
                  <td className="p-2">{marketplacePrice(type.depositPaisa)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {rooms.nextCursor ? (
          <Link href={'?roomCursor=' + encodeURIComponent(rooms.nextCursor)}>Next room types</Link>
        ) : null}
      </section>
      {listing.media.map((photo) => (
        <Image
          key={photo.id}
          src={'/api/v1/marketplace/media/' + photo.id}
          width={640}
          height={420}
          unoptimized
          alt={photo.altText}
          className="h-auto max-w-full rounded-panel"
        />
      ))}
      <section aria-label="Amenities" className="space-y-2">
        <h2 className="text-xl font-semibold">Published amenities</h2>
        <p>
          {listing.amenities.length
            ? listing.amenities.map((amenity) => amenity.name).join(', ')
            : 'No amenities published.'}
        </p>
      </section>
      <section aria-label="Hostel rules" className="space-y-2">
        <h2 className="text-xl font-semibold">Hostel rules</h2>
        {rules.data.length ? (
          <ul className="list-disc space-y-2 pl-5">
            {rules.data.map((rule) => (
              <li className="whitespace-pre-wrap break-words" key={rule.id}>
                {rule.body}
              </li>
            ))}
          </ul>
        ) : (
          <p>No published rules on this page.</p>
        )}
        {rules.nextCursor ? (
          <Link href={'?ruleCursor=' + encodeURIComponent(rules.nextCursor)}>
            Next hostel rules
          </Link>
        ) : null}
      </section>
      {listing.description ? (
        <section>
          <h2 className="text-xl font-semibold">About the hostel</h2>
          <p className="whitespace-pre-wrap break-words">{listing.description}</p>
        </section>
      ) : null}
      {listing.publicPhone || listing.publicEmail ? (
        <section>
          <h2 className="text-xl font-semibold">Public hostel contact</h2>
          {listing.publicPhone ? <p>{listing.publicPhone}</p> : null}
          {listing.publicEmail ? <p>{listing.publicEmail}</p> : null}
        </section>
      ) : null}
      <p>Menu, transport details and verified reviews are unavailable in this summary.</p>
      <p>
        This public link contains hostel information. It contains no customer profile, booking, chat
        or payment information.
      </p>
      <Link href={'/hostels/' + listing.branchId}>
        Open the full listing and check availability
      </Link>
      <Link href={'/share/' + listing.branchId}>First summary pages</Link>
    </main>
  );
}
