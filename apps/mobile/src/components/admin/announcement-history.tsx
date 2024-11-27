import { useState } from 'react';
import { cancelAnnouncement, readAdminAnnouncements } from '@hsm/api-client';
import { useStaffPages } from './staff-data';
import { AdminCard, AdminHeading } from './ui';
import { Choices, Continuation, ReadState, sentence } from './staff-ui';
import { Clock, Undo2, Users, X } from 'lucide-react-native';
import { StatusBadge } from './management-ui';
import { ActionButton, ButtonRow, Fact, pkTime } from './admin-list';
import { audienceLabels } from './announcement-audience';
import { useAdminCommand } from './data';
import { NativeCommandRecovery } from '../services/command-recovery';
import { Copy } from '../ui';
import { safeMessage } from '../../lib/messages';
export function AnnouncementHistory() {
  const [status, setStatus] = useState('all');
  const [selected, setSelected] = useState<string>();
  const list = useStaffPages(
    'announcement-history',
    (c, cursor) =>
      readAdminAnnouncements(c, {
        limit: 20,
        ...(status !== 'all' ? { status } : {}),
        ...(cursor ? { cursor } : {}),
      }),
    { status },
  );
  const cancel = useAdminCommand(
    'Admin:announcement-cancel',
    (c, input: { id: string }, key) => cancelAnnouncement(c, input.id, key),
    false,
    'announcements',
  );
  const locked = cancel.isPending || cancel.unresolved;
  return (
    <>
      <AdminHeading>History</AdminHeading>
      <Choices
        label="Announcement status"
        values={['all', 'scheduled', 'sent', 'cancelled']}
        value={status}
        onChange={setStatus}
        disabled={locked}
      />
      <NativeCommandRecovery command={cancel} />
      {cancel.isError ? <Copy alert>{safeMessage(cancel.error)}</Copy> : null}
      <ReadState query={list} empty={list.rows.length === 0} />
      {list.rows.map((row) => (
        <AdminCard key={row.id}>
          <AdminHeading>{row.title}</AdminHeading>
          <StatusBadge value={row.status} />
          <Copy>{row.body}</Copy>
          <Fact icon={Users}>
            {(audienceLabels[row.audience as keyof typeof audienceLabels] ??
              sentence(row.audience)) +
              (row.recipientCount === null ? '' : ' · ' + row.recipientCount + ' in-app')}
          </Fact>
          <Fact icon={Clock}>{pkTime(row.scheduledAt)}</Fact>
          {row.status === 'scheduled' && selected !== row.id ? (
            <ActionButton
              icon={X}
              text="Cancel"
              label="Cancel scheduled announcement"
              tone="danger"
              disabled={locked}
              onPress={() => setSelected(row.id)}
            />
          ) : null}
          {selected === row.id ? (
            <ButtonRow>
              <ActionButton
                icon={Undo2}
                text="Keep"
                label="Keep announcement"
                disabled={locked}
                onPress={() => setSelected(undefined)}
              />
              <ActionButton
                icon={X}
                text="Cancel it"
                label="Confirm announcement cancellation"
                tone="danger"
                disabled={locked}
                onPress={() =>
                  cancel.mutate({ id: row.id }, { onSuccess: () => setSelected(undefined) })
                }
              />
            </ButtonRow>
          ) : null}
        </AdminCard>
      ))}
      <Continuation query={list} />
    </>
  );
}
