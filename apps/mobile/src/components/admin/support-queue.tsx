import { AlertTriangle, MessagesSquare } from 'lucide-react-native';
import { FilterPanel } from './management-ui';
import { RecordRow } from './admin-list';
import { useState } from 'react';
import { router } from 'expo-router';
import { readAdminSupportQueue } from '@hsm/api-client';
import { supportStatusSchema, supportPrioritySchema } from '@hsm/contracts';
import { useStaffPages } from './staff-data';
import { StaffPage, Choices, ReadState, Continuation, sentence } from './staff-ui';
export function SupportQueue() {
  const [status, setStatus] = useState('all');
  const [priority, setPriority] = useState('all');
  const [search, setSearch] = useState('');
  const [q, setQ] = useState('');
  const list = useStaffPages(
    'support-queue',
    (c, cursor) =>
      readAdminSupportQueue(c, {
        ...(status !== 'all' ? { status } : {}),
        ...(priority !== 'all' ? { priority } : {}),
        ...(q ? { q } : {}),
        ...(cursor ? { cursor } : {}),
        limit: 20,
      }),
    { status, priority, q },
  );
  return (
    <StaffPage
      title="Support"
      search={{
        label: 'Search ticket subject',
        value: search,
        onChange: setSearch,
        onSubmit: () => setQ(search.trim()),
        submitLabel: 'Apply ticket search',
        maxLength: 160,
      }}
    >
      <FilterPanel>
        <Choices
          label="Ticket status"
          values={['all', ...supportStatusSchema.options]}
          value={status}
          onChange={setStatus}
        />
        <Choices
          label="Ticket priority"
          values={['all', ...supportPrioritySchema.options]}
          value={priority}
          onChange={setPriority}
        />
      </FilterPanel>
      <ReadState query={list} empty={list.rows.length === 0} />
      {list.rows.map((row) => (
        <RecordRow
          key={row.id}
          icon={row.priority === 'critical' ? AlertTriangle : MessagesSquare}
          title={row.subject}
          subtitle={
            sentence(row.priority) +
            ' · ' +
            sentence(row.category) +
            ' · ' +
            row.openedByName +
            ' → ' +
            (row.assignedToName ?? 'Unassigned')
          }
          status={row.status}
          label={'Open ticket: ' + row.subject}
          onPress={() =>
            router.push({
              pathname: '/admin/support/[ticketId]',
              params: { ticketId: row.id },
            })
          }
        />
      ))}
      <Continuation query={list} />
    </StaffPage>
  );
}
