import { useState } from 'react';
import { Text, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { marketplacePrice, readPublicRoutes, readPublicReviews } from '@hsm/api-client';
import { TransportCard } from '../transport/transport-ui';
import { Bus, MapPin } from 'lucide-react-native';
import { mobileColors as colors } from '@hsm/ui';
import { client } from '../../lib/runtime';
import { Copy } from '../ui';
import { MarketplaceAction as Button } from '../marketplace/action';
// SERV-002 + REV on the public listing (no sign-in needed); the menu is PublicFood.
export function NativePublicServices({ branchId }: { branchId: string }) {
  const [open, setOpen] = useState(false);
  const routes = useQuery({
    queryKey: ['public-routes', branchId],
    enabled: open,
    gcTime: 0,
    retry: false,
    queryFn: () => readPublicRoutes(client, branchId),
  });
  const reviews = useQuery({
    queryKey: ['public-reviews', branchId],
    enabled: open,
    gcTime: 0,
    retry: false,
    queryFn: () => readPublicReviews(client, branchId),
  });
  const places = [
    ...new Set(
      // A route saved before CHG-049 without places is listed by its own name.
      (routes.data?.data ?? []).flatMap((route) =>
        route.destinations.length ? route.destinations.map((item) => item.name) : [route.name],
      ),
    ),
  ];
  if (!open)
    return <Button secondary label="Transport and reviews" onPress={() => setOpen(true)} />;
  return (
    <View className="gap-2" accessibilityLabel="Transport and reviews">
      {routes.data?.offer?.mode === 'separate' ? (
        <Copy>
          {marketplacePrice(routes.data.offer.monthlyChargePaisa)}/month for transport, billed
          separately from rent
        </Copy>
      ) : null}
      {routes.data?.offer?.mode === 'included' ? <Copy>Transport is included in rent.</Copy> : null}
      {/* CHG-049: one list of the places the hostel offers transport to (only published
          routes come back; with none, nothing is implied). */}
      {places.length ? (
        <TransportCard>
          <View style={{ gap: 8 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Bus color={colors.primary} size={22} />
              <Text style={{ color: colors.heading, fontSize: 16, fontWeight: '700' }}>
                Transport available at
              </Text>
            </View>
            {places.map((place) => (
              <View key={place} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <MapPin color={colors.primary} size={18} />
                <Text style={{ color: colors.text, fontSize: 15 }}>{place}</Text>
              </View>
            ))}
          </View>
        </TransportCard>
      ) : null}
      {reviews.data ? (
        <>
          <Copy>Verified reviews ({reviews.data.summary.count})</Copy>
          {reviews.data.data.map((row) => (
            <Copy key={row.id}>
              {row.reviewerName} · Verified Stay · {row.ratings.overall}/5
              {row.body ? ' · ' + row.body : ''}
              {row.reply ? ' · Hostel reply: ' + row.reply.body : ''}
            </Copy>
          ))}
        </>
      ) : null}
    </View>
  );
}
