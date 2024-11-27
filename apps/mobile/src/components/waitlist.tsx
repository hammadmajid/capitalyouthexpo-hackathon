import { mobileColors as c, mobileSurfaces } from '@hsm/ui';
import { Skeleton } from './loading/skeleton';
import { useState, type ReactNode } from 'react';
import { Text, View } from 'react-native';
import { Users } from 'lucide-react-native';
import { useQuery } from '@tanstack/react-query';
import { listBranchWaitlist, listOwnWaitlist } from '@hsm/api-client';
import { actorClient } from '../lib/runtime';
import { safeMessage } from '../lib/messages';
import { Button, Copy } from './ui';
import { useWaitlistCommand } from './use-waitlist-command';
import { formatDate } from './date-field';
import { VacancyEstimates } from './vacancy-estimates';
import { ListPager } from './list-pager';
type Props = {
  actorId: string;
  standalone?: boolean;
  branchId?: string;
  accessUnavailable?: boolean;
};
export function Waitlist(props: Props) {
  return <Workspace key={props.actorId + ':' + (props.branchId ?? 'own')} {...props} />;
}
function Workspace({ actorId, branchId, accessUnavailable = false, standalone = false }: Props) {
  const [open, setOpen] = useState(standalone || Boolean(branchId)),
    [cursor, setCursor] = useState<string>(),
    // CHG-040: leaving asks once; rejoining needs a resident's notice again.
    [leaving, setLeaving] = useState<string>();
  const { mutation, locked } = useWaitlistCommand(actorId);
  const query = useQuery({
    queryKey: ['waitlist', actorId, branchId ?? 'own', cursor],
    gcTime: 0,
    retry: false,
    enabled: open && !accessUnavailable,
    queryFn: async () => {
      const client = await actorClient(actorId);
      return branchId
        ? listBranchWaitlist(client, branchId, cursor ? { cursor } : {})
        : listOwnWaitlist(client, cursor ? { cursor } : {});
    },
  });
  return (
    <View className="gap-3">
      {!standalone && !branchId ? (
        <Button
          secondary
          disabled={locked}
          label={open ? 'Close waiting list' : 'My waiting list'}
          onPress={() => setOpen(!open)}
        />
      ) : null}
      {mutation.error ? <Copy alert>{safeMessage(mutation.error)}</Copy> : null}
      {branchId && open ? (
        <VacancyEstimates
          actorId={actorId}
          branchId={branchId}
          accessUnavailable={accessUnavailable || query.isError}
        />
      ) : null}
      {locked && !mutation.isPending ? (
        <Button
          disabled={accessUnavailable}
          label="Retry original leave request"
          onPress={() => mutation.mutate(undefined)}
        />
      ) : null}
      {open ? (
        accessUnavailable || query.isError ? (
          <>
            <Copy alert>
              {accessUnavailable ? 'Pull down to load branch access.' : safeMessage(query.error)}
            </Copy>
          </>
        ) : query.isPending || query.isFetching ? (
          <Skeleton kind="list" label="Loading current waiting list…" />
        ) : (
          <View
            style={branchId ? mobileSurfaces.icyCard : undefined}
            className={
              branchId ? 'gap-3 rounded-card border border-cardBorder p-4 frosted-card' : 'gap-3'
            }
          >
            {branchId ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <Users color={c.primary} size={22} />
                <Text style={{ flex: 1, color: c.heading, fontSize: 17, fontWeight: '700' }}>
                  Waiting list
                </Text>
                <Text style={{ color: c.secondary, fontWeight: '600' }}>
                  {query.data?.data.filter((row) => row.leftAt === null).length ?? 0}
                </Text>
              </View>
            ) : null}
            {!query.data?.data.length ? (
              <Copy>{branchId ? 'No one is waiting yet.' : 'No waiting-list entries.'}</Copy>
            ) : null}
            {query.data?.data.map((row) => (
              <Entry key={row.id} row={row} branch={Boolean(branchId)}>
                {!branchId && row.leftAt === null && leaving !== row.id ? (
                  <Button
                    disabled={locked}
                    label="Leave waiting list"
                    onPress={() => setLeaving(row.id)}
                  />
                ) : null}
                {!branchId && row.leftAt === null && leaving === row.id ? (
                  <>
                    <Copy>Leave? You may not be able to join again.</Copy>
                    <Button
                      disabled={locked}
                      label="Yes, leave"
                      onPress={() => {
                        setLeaving(undefined);
                        mutation.mutate({ kind: 'leave', entryId: row.id });
                      }}
                    />
                    <Button secondary label="Stay on list" onPress={() => setLeaving(undefined)} />
                  </>
                ) : null}
              </Entry>
            ))}
            <ListPager
              first="First waiting-list page"
              next="Next waiting-list page"
              hasPrevious={Boolean(cursor)}
              hasNext={Boolean(query.data?.nextCursor)}
              disabled={locked}
              onFirst={() => setCursor(undefined)}
              onNext={() => setCursor(query.data?.nextCursor ?? undefined)}
            />
          </View>
        )
      ) : null}
    </View>
  );
}
type Row = Awaited<ReturnType<typeof listOwnWaitlist>>['data'][number] & { customerName?: unknown };
// Branch rows lead with the customer; a customer's own rows lead with the hostel.
function Entry(props: { row: Row; branch: boolean; children: ReactNode }) {
  const { row } = props;
  const room = row.roomTypeName ?? 'Any room type';
  return (
    <View
      style={
        props.branch
          ? { borderTopWidth: 1, borderColor: c.border, paddingTop: 10, gap: 4 }
          : mobileSurfaces.icyCard
      }
      className={props.branch ? '' : 'gap-2 rounded-card border border-cardBorder p-4 frosted-card'}
    >
      {props.branch ? (
        <Text style={{ color: c.heading, fontWeight: '700' }}>
          {row.customerName ? String(row.customerName) : 'Customer'} · {room}
        </Text>
      ) : (
        <Copy>
          {row.branchName} — {room}
        </Copy>
      )}
      <Text
        style={{ color: row.leftAt ? c.secondary : c.primary, fontSize: 13, fontWeight: '600' }}
      >
        {row.leftAt ? 'Left waiting list' : 'Waiting for availability'}
      </Text>
      {row.expectedVacancyDate ? (
        <Text style={{ color: c.secondary, fontSize: 13 }}>
          Bed frees on {formatDate(row.expectedVacancyDate)} (resident&apos;s notice, not
          guaranteed)
        </Text>
      ) : null}
      {props.children}
    </View>
  );
}
