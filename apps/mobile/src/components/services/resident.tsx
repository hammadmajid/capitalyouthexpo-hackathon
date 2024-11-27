import { Skeleton } from '../loading/skeleton';
import { useState } from 'react';
import { TextInput, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { reviewCategorySchema, type ReviewRatings } from '@hsm/contracts';
import { createReview, readReviewEligibility, readStayMenu } from '@hsm/api-client';
import { actorClient } from '../../lib/runtime';
import { safeMessage } from '../../lib/messages';
import { MenuWeek, type MenuView } from '../menu/menu-week';
import { Copy } from '../ui';
import { MarketplaceAction as Button } from '../marketplace/action';
import { OwnComplaints } from './resident-complaints';
import { ResidentTransport } from '../transport/resident-transport';
import { useNativeCommand } from './use-command';
import { NativeCommandRecovery } from './command-recovery';
export { field, statusText } from './resident-text';
import { field } from './resident-text';
// SERV-001: each configured day as one line; nothing is invented for missing meals.
export function NativeMenu({ menu }: { menu: MenuView }) {
  if (!menu.items.length) return <Copy>No menu published.</Copy>;
  return <MenuWeek menu={menu} />;
}
function useOwn<T>(
  actorId: string,
  key: string,
  stayId: string,
  read: (client: Awaited<ReturnType<typeof actorClient>>) => Promise<T>,
  enabled = true,
) {
  return useQuery({
    queryKey: [key, actorId, stayId],
    enabled,
    gcTime: 0,
    retry: false,
    queryFn: async () => read(await actorClient(actorId)),
  });
}
// SERV / CMP / REV for the resident's own Stay; every rule is re-checked by the server.
export function NativeResidentServices({
  actorId,
  stayId,
  closed,
}: {
  actorId: string;
  stayId: string;
  closed: boolean;
}) {
  const [open, setOpen] = useState(false);
  if (!open) return <Button secondary label="Hostel services" onPress={() => setOpen(true)} />;
  return (
    <View className="gap-3" accessibilityLabel="Hostel services">
      {closed ? null : <OwnMenu actorId={actorId} stayId={stayId} />}
      <ResidentTransport actorId={actorId} stayId={stayId} closed={closed} />
      <OwnComplaints actorId={actorId} stayId={stayId} closed={closed} />
      <OwnReview actorId={actorId} stayId={stayId} />
    </View>
  );
}
function OwnMenu({ actorId, stayId }: { actorId: string; stayId: string }) {
  const menu = useOwn(actorId, 'stay-menu', stayId, (client) => readStayMenu(client, stayId));
  if (menu.isError) return <Copy alert>{safeMessage(menu.error)}</Copy>;
  return menu.data ? (
    <NativeMenu menu={menu.data} />
  ) : (
    <Skeleton kind="inline" label="Loading menu…" />
  );
}
function OwnReview({ actorId, stayId }: { actorId: string; stayId: string }) {
  const eligibility = useOwn(actorId, 'review-eligibility', stayId, (client) =>
    readReviewEligibility(client, stayId),
  );
  const [ratings, setRatings] = useState<Partial<ReviewRatings>>({}),
    [body, setBody] = useState('');
  const submit = useNativeCommand(
    'NativeResidentServices:submit',
    actorId,
    (client, input: Record<string, unknown>, key) => createReview(client, stayId, input, key),
    [['review-eligibility', actorId, stayId]],
  );
  const e = eligibility.data;
  if (!e) return null;
  if (e.reason === 'too_early')
    return <Copy>You can review this hostel from {e.eligibleFrom} (after 30 days of stay).</Copy>;
  if (e.reason === 'already_reviewed') return <Copy>Verified Stay review published.</Copy>;
  if (!e.eligible) return <Copy>Reviews open after check-in.</Copy>;
  const complete = reviewCategorySchema.options.every((key) => (ratings[key] ?? 0) >= 1);
  return (
    <View className="gap-1" accessibilityLabel="Review">
      <NativeCommandRecovery command={submit} />
      {submit.isError ? <Copy alert>{safeMessage(submit.error)}</Copy> : null}
      {reviewCategorySchema.options.map((key) => (
        <View key={key} className="flex-row flex-wrap gap-1">
          <Copy>{key}</Copy>
          {[1, 2, 3, 4, 5].map((value) => (
            <Button
              key={value}
              secondary={ratings[key] !== value}
              label={`${key} ${value}`}
              onPress={() => setRatings({ ...ratings, [key]: value })}
            />
          ))}
        </View>
      ))}
      <TextInput
        accessibilityLabel="Review text (optional)"
        value={body}
        onChangeText={setBody}
        maxLength={2000}
        multiline
        className={field}
      />
      <Button
        label="Publish review"
        disabled={!complete || submit.isPending}
        onPress={() => submit.mutate({ ratings, ...(body.trim() ? { body: body.trim() } : {}) })}
      />
    </View>
  );
}
