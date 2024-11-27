import { useState } from 'react';
import { Image, ScrollView, Text } from 'react-native';
import { mobileMarketplaceColors as colors, marketplaceMetrics as metrics } from '@hsm/ui';
import { config } from '../../lib/runtime';
function StripPhoto({ id, label }: { id: string; label: string }) {
  const [failed, setFailed] = useState(false);
  return failed ? (
    <Text style={{ color: colors.secondary }}>Photo unavailable: {label}</Text>
  ) : (
    <Image
      source={{ uri: config.apiUrl + '/v1/marketplace/media/' + id }}
      accessibilityLabel={label}
      resizeMode="cover"
      onError={() => setFailed(true)}
      style={{ width: 192, height: 128, borderRadius: metrics.card }}
    />
  );
}
// ROOM-004: customers inspect the room and the specific bed photos before requesting them.
export function InventoryPhotoStrip({ ids, label }: { ids: string[]; label: string }) {
  return (
    <ScrollView
      horizontal
      accessibilityLabel={label + ' photos'}
      contentContainerStyle={{ gap: metrics.sm }}
    >
      {ids.map((id, index) => (
        <StripPhoto key={id} id={id} label={label + ' photo ' + String(index + 1)} />
      ))}
    </ScrollView>
  );
}
