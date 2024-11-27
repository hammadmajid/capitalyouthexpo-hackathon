import { useQuery } from '@tanstack/react-query';
import { readBedOccupancy } from '@hsm/api-client';
import { Building2 } from 'lucide-react-native';
import { Text, View } from 'react-native';
import { mobileColors as c } from '@hsm/ui';
import { actorClient } from '../lib/runtime';
import {
  ResidentGlassCorners,
  ResidentSectionTitle,
  residentStyles as s,
} from './resident-detail-ui';
type Props = { actorId: string; branchId: string; bedId: string | null; roomAssigned: boolean };
export function StaffStayAccommodation({ actorId, branchId, bedId, roomAssigned }: Props) {
  const occupancy = useQuery({
    queryKey: ['staff-stay-accommodation', actorId, branchId, bedId],
    enabled: Boolean(bedId),
    retry: false,
    queryFn: async () => {
      if (!bedId) throw new Error('No bed selected');
      return readBedOccupancy(await actorClient(actorId), branchId, bedId);
    },
  });
  const detail = occupancy.data;
  const rows: [string, string][] = !roomAssigned
    ? [['Assignment', 'Not assigned']]
    : !bedId
      ? [
          ['Room', 'Assigned'],
          ['Bed', 'Whole room'],
        ]
      : occupancy.isPending
        ? [['Location', 'Loading…']]
        : occupancy.isError || !detail
          ? [['Location', 'Unavailable']]
          : [
              ['Building /\nBlock', detail.location?.building?.name ?? '—'],
              ['Floor', detail.location?.floor?.label ?? '—'],
              ['Room', detail.room.label],
              ['Bed', detail.bed.label],
            ];
  return (
    <View accessibilityLabel="Resident accommodation" style={[s.card, { padding: 12 }]}>
      <ResidentGlassCorners />
      <ResidentSectionTitle title="Accommodation" Icon={Building2} />
      <View style={[s.inset, { flexDirection: 'row', padding: 10, gap: 0, minHeight: 80 }]}>
        <ResidentGlassCorners />
        {rows.map(([label, value], index) => (
          <View
            key={label}
            style={{
              flex: 1,
              minWidth: 0,
              gap: 5,
              paddingHorizontal: 4,
              borderLeftWidth: index ? 1 : 0,
              borderColor: c.border,
            }}
          >
            <Text
              style={[s.body, { fontSize: 12, lineHeight: 15, minHeight: 30 }]}
              numberOfLines={2}
              adjustsFontSizeToFit
              minimumFontScale={0.8}
            >
              {label}
            </Text>
            <Text
              style={[s.value, { fontSize: 15, lineHeight: 20 }]}
              numberOfLines={2}
              adjustsFontSizeToFit
              minimumFontScale={0.7}
              accessibilityLabel={label.replace('\n', ' ') + ': ' + value}
            >
              {value}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}
