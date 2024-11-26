'use client';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { marketplacePrice, readPublicMenu, readPublicRoutes } from '@hsm/api-client';
import { browserClient } from '../../lib/client';
import { Button } from '../ui/button';
import { MenuEditor, MenuTable, StayMenu } from './menu';
import { BranchTransport, StayTransport } from './transport';
import { BranchComplaints, StayComplaints } from './complaints';
import { BranchReviews, PublicReviews, StayReview } from './reviews';
// SERV / CMP / REV: the resident's hostel services for one Stay (past Stays keep history only).
export function ResidentServicesPanel(props: { actorId: string; stayId: string; closed: boolean }) {
  const [open, setOpen] = useState(false);
  if (!open)
    return (
      <Button variant="secondary" onClick={() => setOpen(true)}>
        Hostel services
      </Button>
    );
  return (
    <section aria-label="Hostel services" className="space-y-3">
      {props.closed ? null : <StayMenu actorId={props.actorId} stayId={props.stayId} />}
      <StayTransport {...props} />
      <StayComplaints {...props} />
      <StayReview actorId={props.actorId} stayId={props.stayId} />
    </section>
  );
}
// Staff view of the selected branch; each action is re-authorized by the server.
export function BranchServicesPanel(props: { actorId: string; branchId: string }) {
  const [open, setOpen] = useState(false);
  if (!open)
    return (
      <Button variant="secondary" onClick={() => setOpen(true)}>
        Manage menu, transport, complaints and reviews
      </Button>
    );
  return (
    <section aria-label="Branch services" className="space-y-3">
      <MenuEditor {...props} />
      <BranchTransport {...props} />
      <BranchComplaints {...props} staffUserId={props.actorId} />
      <BranchReviews {...props} />
    </section>
  );
}
// SERV-001/002 + REV on the public listing: only published configuration and reviews.
export function PublicServices({ branchId }: { branchId: string }) {
  const menu = useQuery({
    queryKey: ['public-menu', branchId],
    gcTime: 0,
    retry: false,
    queryFn: () => readPublicMenu(browserClient(), branchId),
  });
  const routes = useQuery({
    queryKey: ['public-routes', branchId],
    gcTime: 0,
    retry: false,
    queryFn: () => readPublicRoutes(browserClient(), branchId),
  });
  const places = [
    ...new Set(
      (routes.data?.data ?? []).flatMap((route) =>
        route.destinations?.length ? route.destinations.map((item) => item.name) : [route.name],
      ),
    ),
  ];
  return (
    <section aria-label="Food, transport and reviews" className="space-y-3">
      <h3 className="font-semibold">Mess menu</h3>
      {menu.data ? <MenuTable menu={menu.data} /> : <p>Menu not available.</p>}
      <h3 className="font-semibold">Transport</h3>
      {routes.data?.offer?.mode === 'separate' ? (
        <p>
          {marketplacePrice(routes.data.offer.monthlyChargePaisa)} per month, billed separately from
          rent
        </p>
      ) : null}
      {routes.data?.offer?.mode === 'included' ? (
        <p>Transport is included in rent on routes set by the hostel.</p>
      ) : null}
      {/* CHG-049: one list of the places the hostel offers transport to (only published routes
          come back). A route saved before CHG-049 without places is listed by its own name. */}
      {places.length ? (
        <>
          <p className="font-semibold">Transport available at</p>
          <ul className="list-disc pl-5">
            {places.map((place) => (
              <li key={place}>{place}</li>
            ))}
          </ul>
        </>
      ) : (
        <p>No transport offered.</p>
      )}
      <PublicReviews branchId={branchId} />
    </section>
  );
}
