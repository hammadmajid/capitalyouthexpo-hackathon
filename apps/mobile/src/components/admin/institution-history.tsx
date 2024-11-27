import { readAdminInstitutionHistory } from '@hsm/api-client';
import { useStaffPages } from './staff-data';
import { ReadState, Continuation, sentence } from './staff-ui';
import { Clock, FileText } from 'lucide-react-native';
import { Fact, pkTime, shortId } from './admin-list';
import { AdminCard, AdminHeading } from './ui';
import { Copy } from '../ui';
export function InstitutionHistory({ id }: { id: string }) {
  const history = useStaffPages(
    'institution-history',
    (client, cursor) =>
      readAdminInstitutionHistory(client, id, { ...(cursor ? { cursor } : {}), limit: 20 }),
    { id },
  );
  return (
    <AdminCard>
      <AdminHeading>History</AdminHeading>
      <ReadState query={history} empty={!history.rows.length} />
      {history.rows.map((row) => (
        <AdminCard key={row.revision}>
          <Fact icon={Clock}>
            {'Rev ' + row.revision + ' · ' + pkTime(row.createdAt) + ' · ' + shortId(row.actorId)}
          </Fact>
          <Fact icon={FileText}>
            {sentence(row.approval) + (row.reason ? ' · ' + row.reason : '')}
          </Fact>
          {row.changedFields.map((field) => (
            <Copy key={field}>
              {sentence(field)}: {JSON.stringify(row.before?.[field] ?? null)} →{' '}
              {JSON.stringify(row.after?.[field] ?? null)}
            </Copy>
          ))}
        </AdminCard>
      ))}
      <Continuation query={history} />
    </AdminCard>
  );
}
