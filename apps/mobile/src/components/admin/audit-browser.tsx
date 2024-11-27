import { FilterPanel } from './management-ui';
import { useState } from 'react';
import { readPlatformAudit } from '@hsm/api-client';
import { platformAuditQuerySchema } from '@hsm/contracts';
import { useStaffPages } from './staff-data';
import { Filter, ScrollText } from 'lucide-react-native';
import { AdminField } from './ui';
import { StaffPage, Continuation, ReadState, sentence } from './staff-ui';
import { Copy } from '../ui';
import { DateField } from '../date-field';
import { ActionButton, RecordRow, pkTime, shortId } from './admin-list';
export function PlatformAuditBrowser() {
  const [action, setAction] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [filters, setFilters] = useState<{ action?: string; from?: string; to?: string }>({});
  const [invalid, setInvalid] = useState(false);
  const list = useStaffPages(
    'platform-audit',
    (c, cursor) =>
      readPlatformAudit(c, {
        ...filters,
        limit: 20,
        ...(cursor ? { cursor } : {}),
      }),
    filters,
  );
  return (
    <StaffPage title="Audit log">
      <FilterPanel>
        <AdminField label="Action (exact)" value={action} onChange={setAction} maxLength={120} />
        <DateField label="From" value={from} onChange={setFrom} optional minYear={2024} />
        <DateField label="To" value={to} onChange={setTo} optional minYear={2024} />
        <ActionButton
          icon={Filter}
          text="Apply"
          label="Apply audit filters"
          tone="solid"
          onPress={() => {
            const input = {
              ...(action.trim() ? { action: action.trim() } : {}),
              ...(from ? { from } : {}),
              ...(to ? { to } : {}),
            };
            const p = platformAuditQuerySchema.safeParse(input);
            setInvalid(!p.success);
            if (p.success) setFilters(input);
          }}
        />
        {invalid ? <Copy alert>Check the audit action and date range.</Copy> : null}
      </FilterPanel>
      <ReadState query={list} empty={list.rows.length === 0} />
      {list.rows.map((row) => (
        <RecordRow
          key={row.id}
          icon={ScrollText}
          title={row.action}
          subtitle={
            pkTime(row.createdAt) + ' · ' + sentence(row.actorRole) + ' ' + shortId(row.actorId)
          }
          body={sentence(row.targetType) + ' ' + shortId(row.targetId) + ' · #' + row.id}
          label={row.action + ' at ' + pkTime(row.createdAt)}
        />
      ))}
      <Continuation query={list} />
    </StaffPage>
  );
}
