import { mobileColors as c, mobileSurfaces } from '@hsm/ui';
import { Skeleton } from './loading/skeleton';
import { useState } from 'react';
import { Text, TextInput, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import {
  listBranchVisits,
  listOwnVisits,
  formatVisitStart,
  visitAvailableActions,
  visitStartFromLocal,
} from '@hsm/api-client';
import type { VisitCommand, VisitListEntry } from '@hsm/contracts';
import { actorClient } from '../lib/runtime';
import { safeMessage } from '../lib/messages';
import { useVisitCommand } from './use-visit-command';
import { Button, Copy } from './ui';
import { VisitHistory } from './visit-history';
import { DateField } from './date-field';
import { VisitInterest } from './visit-interest';
import { TimeField } from './time-field';
import { ListPager } from './list-pager';
// Plain words for each visit state and action (VISIT-001).
const statusText: Record<VisitListEntry['status'], string> = {
  requested: 'Waiting for reply',
  approved: 'Confirmed',
  rescheduled: 'New time proposed',
  rejected: 'Declined',
  cancelled: 'Cancelled',
  completed: 'Visited',
  no_show: 'Did not come',
};
const actionText: Record<VisitCommand['action'], string> = {
  approve: 'Approve',
  reschedule: 'Propose new time',
  reject: 'Decline',
  cancel: 'Cancel visit',
  'accept-reschedule': 'Accept new time',
  complete: 'Mark visited',
  'no-show': 'Did not come',
};
type Props = {
  actorId: string;
  standalone?: boolean;
  branchId?: string;
  accessUnavailable?: boolean;
};
export function Visits(props: Props) {
  return <VisitWorkspace key={props.actorId + ':' + (props.branchId ?? 'own')} {...props} />;
}
function VisitWorkspace({
  actorId,
  branchId,
  accessUnavailable = false,
  standalone = false,
}: Props) {
  const [open, setOpen] = useState(standalone || Boolean(branchId)),
    [cursor, setCursor] = useState<string>();
  const operation = useVisitCommand(actorId),
    { mutation, locked } = operation;
  const query = useQuery({
    queryKey: ['visits', actorId, branchId ?? 'own', cursor],
    gcTime: 0,
    retry: false,
    enabled: open && !accessUnavailable,
    queryFn: async () => {
      const client = await actorClient(actorId);
      return branchId
        ? listBranchVisits(client, branchId, cursor ? { cursor } : {})
        : listOwnVisits(client, cursor ? { cursor } : {});
    },
  });
  return (
    <View className="gap-4">
      {!standalone && !branchId ? (
        <Button
          secondary
          disabled={locked}
          label={open ? 'Close visits' : 'My visits'}
          onPress={() => setOpen((value) => !value)}
        />
      ) : null}
      {mutation.error ? <Copy alert>{safeMessage(mutation.error)}</Copy> : null}
      {locked && !mutation.isPending ? (
        <>
          <Copy>Outcome unknown. The original request is retained.</Copy>
          <Button label="Retry original visit request" onPress={() => mutation.mutate(undefined)} />
        </>
      ) : null}
      {mutation.isSuccess ? <Copy>Visit updated.</Copy> : null}
      {open ? (
        accessUnavailable || query.isError ? (
          <>
            <Copy alert>
              {accessUnavailable ? 'Pull down to load branch access.' : safeMessage(query.error)}
            </Copy>
          </>
        ) : query.isPending || query.isFetching ? (
          <Skeleton kind="list" label="Loading current visits…" />
        ) : (
          <>
            {!query.data?.data.length ? (
              <Copy>{branchId ? 'No visit requests yet.' : 'No visits.'}</Copy>
            ) : null}
            {query.data?.data.map((visit) => (
              <VisitCard
                operation={operation}
                key={visit.id + ':' + visit.updatedAt}
                actorId={actorId}
                {...(branchId ? { branchId } : {})}
                visit={visit}
                management={Boolean(branchId)}
                locked={locked}
                submit={(command) =>
                  mutation.mutate({
                    kind: 'action',
                    visitId: visit.id,
                    branchId: branchId ?? null,
                    body: { expectedUpdatedAt: visit.updatedAt, command },
                  })
                }
              />
            ))}
            <ListPager
              first="First visits page"
              next="Next visits page"
              hasPrevious={Boolean(cursor)}
              hasNext={Boolean(query.data?.nextCursor)}
              disabled={locked}
              onFirst={() => setCursor(undefined)}
              onNext={() => {
                if (query.data?.nextCursor) setCursor(query.data.nextCursor);
              }}
            />
          </>
        )
      ) : null}
    </View>
  );
}
function VisitCard({
  operation,
  actorId,
  branchId,
  visit,
  management,
  locked,
  submit,
}: {
  operation: ReturnType<typeof useVisitCommand>;
  actorId: string;
  branchId?: string;
  visit: VisitListEntry;
  management: boolean;
  locked: boolean;
  submit: (command: VisitCommand) => void;
}) {
  const [action, setAction] = useState<VisitCommand['action']>(),
    [date, setDate] = useState(''),
    [time, setTime] = useState(''),
    [reason, setReason] = useState(''),
    [error, setError] = useState('');
  const actions = visitAvailableActions(visit, management, Date.now());
  function send() {
    if (!action) return;
    try {
      let command: VisitCommand;
      if (action === 'reschedule')
        command = {
          action,
          proposedStart: visitStartFromLocal(date, time),
          ...(reason.trim() ? { note: reason.trim() } : {}),
        };
      else if (action === 'reject') command = { action, reason };
      else command = { action };
      setError('');
      submit(command);
    } catch {
      setError('Choose a date and a time.');
    }
  }
  return (
    <View
      style={mobileSurfaces.icyCard}
      className="rounded-input border border-border p-4 gap-3 frosted-card"
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Text style={{ flex: 1, color: c.heading, fontSize: 16, fontWeight: '700' }}>
          {management ? visit.customerName : visit.branchName}
        </Text>
        <Text style={{ color: c.primary, fontSize: 13, fontWeight: '700' }}>
          {statusText[visit.status]}
        </Text>
      </View>
      <Text style={{ color: c.text }}>{formatVisitStart(visit.requestedStart)}</Text>
      <VisitHistory actorId={actorId} visitId={visit.id} {...(branchId ? { branchId } : {})} />
      {visit.status === 'completed' ? (
        <VisitInterest
          operation={operation}
          actorId={actorId}
          visitId={visit.id}
          {...(branchId ? { branchId } : {})}
        />
      ) : null}
      {visit.proposedStart ? (
        <Copy>
          New time proposed: {formatVisitStart(visit.proposedStart)}
          {management ? '. Waiting for the customer.' : '. Accept it or cancel.'}
        </Copy>
      ) : null}
      {visit.reason ? <Copy>{visit.reason}</Copy> : null}
      {actions.map((value) => (
        <Button
          key={value}
          secondary={value !== action}
          disabled={locked}
          label={actionText[value]}
          onPress={() => setAction(value)}
        />
      ))}
      {action === 'reschedule' ? (
        <>
          <DateField
            label="Proposed visit date"
            value={date}
            onChange={setDate}
            disabled={locked}
          />
          <TimeField
            label="Proposed visit time"
            value={time}
            onChange={setTime}
            disabled={locked}
          />
        </>
      ) : null}
      {action === 'reject' || action === 'reschedule' ? (
        <>
          <Copy>{action === 'reject' ? 'Rejection reason' : 'Optional note'}</Copy>
          <TextInput
            style={mobileSurfaces.icyCard}
            className="rounded-input border border-border p-3 text-text frosted-card"
            accessibilityLabel="Visit reason"
            value={reason}
            maxLength={500}
            editable={!locked}
            onChangeText={setReason}
          />
        </>
      ) : null}
      {error ? <Copy alert>{error}</Copy> : null}
      {actions.length ? (
        <Button
          disabled={locked || !action || (action === 'reject' && !reason.trim())}
          label={action ? 'Confirm: ' + actionText[action] : 'Choose an action'}
          onPress={send}
        />
      ) : null}
    </View>
  );
}
