import { AppHeader } from './navigation/header';
import { Skeleton } from './loading/skeleton';
import { useState } from 'react';
import { View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { readStaffStays } from '@hsm/api-client';
import { actorClient } from '../lib/runtime';
import { safeMessage } from '../lib/messages';
import { Copy } from './ui';
import { MarketplaceAction as Button } from './marketplace/action';
export type ExistingResident = { residentId: string; displayName: string };
type Props = {
  actorId: string;
  branchId: string;
  disabled: boolean;
  selected: ExistingResident | undefined;
  onChoose: (resident: ExistingResident) => void;
};
// RES-001 / CHG-009: staff pick a named relationship from this branch's own Stay history.
// The server re-checks branch scope; contact details never link or merge identities.
export function ManualAdmissionResident({
  actorId,
  branchId,
  disabled,
  selected,
  onChoose,
}: Props) {
  const [draft, setDraft] = useState(''),
    [search, setSearch] = useState(''),
    [cursor, setCursor] = useState<string>();
  const query = useQuery({
    queryKey: ['admission-residents', actorId, branchId, search, cursor],
    gcTime: 0,
    retry: false,
    enabled: !disabled,
    queryFn: async () =>
      readStaffStays(await actorClient(actorId), branchId, {
        limit: 20,
        ...(search ? { q: search } : {}),
        ...(cursor ? { cursor } : {}),
      }),
  });
  const rows = [...new Map((query.data?.data ?? []).map((row) => [row.residentId, row])).values()];
  const busy = disabled || query.isFetching;
  return (
    <View className="gap-2" accessibilityLabel="Existing branch resident">
      <Copy>Choose a named relationship from this branch&apos;s Stay history.</Copy>
      <AppHeader
        title="Select resident"
        showBack={false}
        search={{
          label: 'Search residents by name',
          value: draft,
          onChange: setDraft,
          maxLength: 100,
          submitLabel: 'Search residents',
          disabled: busy,
          onSubmit: () => {
            setSearch(draft.trim());
            setCursor(undefined);
          },
        }}
      />
      {query.isPending && !disabled ? <Skeleton kind="list" label="Loading residents…" /> : null}
      {query.isError ? <Copy alert>{safeMessage(query.error)}</Copy> : null}
      {query.isSuccess && rows.length === 0 ? <Copy>No matching residents.</Copy> : null}
      {rows.map((row) => (
        <Button
          key={row.residentId}
          secondary={selected?.residentId !== row.residentId}
          label={'Select ' + row.displayName}
          disabled={busy}
          onPress={() => onChoose({ residentId: row.residentId, displayName: row.displayName })}
        />
      ))}
      {query.data?.nextCursor ? (
        <Button
          secondary
          label="Next residents"
          disabled={busy}
          onPress={() => setCursor(query.data?.nextCursor ?? undefined)}
        />
      ) : null}
      {cursor ? (
        <Button
          secondary
          label="First residents"
          disabled={busy}
          onPress={() => setCursor(undefined)}
        />
      ) : null}
    </View>
  );
}
