import { useState } from 'react';
import { Image, View } from 'react-native';
import { UserRound } from 'lucide-react-native';
import { useQuery } from '@tanstack/react-query';
import { mobileOwnerColors as c } from '@hsm/ui';
import { readStayResidentPhoto } from '@hsm/api-client';
import { actorClient } from '../lib/runtime';
import { Skeleton } from './loading/skeleton';
import { Copy } from './ui';
export function StayResidentPhoto(props: {
  actorId: string;
  stayId: string;
  branchId?: string;
  size?: number;
}) {
  const size = props.size ?? 88;
  const [failed, setFailed] = useState<string | null>(null);
  const photo = useQuery({
    queryKey: ['stay-resident-photo', props.actorId, props.branchId ?? 'own', props.stayId],
    retry: false,
    refetchOnMount: 'always',
    staleTime: 0,
    refetchInterval: 30000,
    gcTime: 0,
    queryFn: async () =>
      readStayResidentPhoto(await actorClient(props.actorId), props.stayId, props.branchId),
  });
  return (
    <View style={{ gap: 6 }}>
      <View
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
          overflow: 'hidden',
          alignItems: 'center',
          justifyContent: 'center',
          borderWidth: 1,
          borderColor: c.primary,
          backgroundColor: c.primarySoft,
        }}
      >
        {photo.isPending ? (
          <Skeleton kind="inline" label="Loading resident photo" />
        ) : !photo.isError && photo.data?.url && failed !== photo.data.url ? (
          <Image
            source={{ uri: photo.data.url }}
            accessibilityLabel="Resident profile photo"
            style={{ width: size, height: size }}
            onError={() => setFailed(photo.data?.url ?? null)}
          />
        ) : (
          <View accessible accessibilityRole="image" accessibilityLabel="Resident avatar">
            <UserRound size={size * 0.43} color={c.primary} />
          </View>
        )}
      </View>
      {photo.isError ? <Copy>Photo unavailable</Copy> : null}
    </View>
  );
}
