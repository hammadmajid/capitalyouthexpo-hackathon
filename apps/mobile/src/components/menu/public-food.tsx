import { Image, ScrollView, Text, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { ChefHat } from 'lucide-react-native';
import { publicGallery, readPublicMenu } from '@hsm/api-client';
import { mobileColors as c, mobileSurfaces } from '@hsm/ui';
import { client, config } from '../../lib/runtime';
import { MenuWeek } from './menu-week';
// SERV-001: guests see the published weekly menu, meal times and kitchen and dining photos.
// Kitchen photos are the published hostel photos whose description starts with "Kitchen".
export function PublicFood({ branchId }: { branchId: string }) {
  const menu = useQuery({
    queryKey: ['public-menu', branchId],
    gcTime: 0,
    retry: false,
    queryFn: () => readPublicMenu(client, branchId),
  });
  const photos = useQuery({
    queryKey: ['public-kitchen', branchId],
    gcTime: 0,
    retry: false,
    queryFn: () => publicGallery(client, branchId, { limit: 100 }),
  });
  const kitchen = (photos.data?.data ?? []).filter((image) =>
    /^(kitchen|dining)\b/i.test(image.altText),
  );
  const hasMenu = Boolean(menu.data?.items.length);
  if (!hasMenu && !kitchen.length) return null;
  return (
    <View
      accessibilityLabel="Food menu"
      style={{
        ...mobileSurfaces.icyCard,
        borderWidth: 1,
        borderRadius: 22,
        padding: 16,
        gap: 14,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <ChefHat color={c.primary} size={22} />
        <Text style={{ color: c.heading, fontSize: 18, fontWeight: '700' }}>Food menu</Text>
      </View>
      {kitchen.length ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 10 }}
          accessibilityLabel="Kitchen photos"
        >
          {kitchen.map((image) => (
            <Image
              key={image.id}
              accessibilityLabel={image.altText}
              source={{ uri: `${config.apiUrl}/v1/marketplace/media/${image.id}` }}
              style={{ width: 150, height: 110, borderRadius: 16, backgroundColor: c.aqua }}
            />
          ))}
        </ScrollView>
      ) : null}
      {menu.data && hasMenu ? <MenuWeek menu={menu.data} /> : null}
    </View>
  );
}
