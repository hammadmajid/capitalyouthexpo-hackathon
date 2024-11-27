import { router } from 'expo-router';
import {
  listGovernedCustomers,
  readAdminExplorerDetail,
  readVerificationDossier,
} from '@hsm/api-client';
import { VerificationDecision } from './verification-decision';
import { customerGovernanceQuerySchema, type AdminExplorerKind } from '@hsm/contracts';
import { useStaffRecord } from './staff-data';
import { AdminCard, AdminHeading } from './ui';
import { ReadState, StaffPage } from './staff-ui';
import {
  BedDouble,
  Building2,
  CalendarDays,
  List,
  ClipboardCheck,
  Hash,
  Info,
  Tag,
  Wallet,
} from 'lucide-react-native';
import { ActionButton, Fact, RecordRow, pkTime } from './admin-list';
import { explorerTitles, openExplorer, openExplorerProfile } from './explorer-navigation';
import { StatusBadge } from './management-ui';
import { paisaText } from './explorer-list';
import { CustomerDecision } from './customer-governance';

export function ExplorerDetail({ kind, id }: { kind: AdminExplorerKind; id: string }) {
  const query = useStaffRecord('explorer-profile-' + kind, id, (client) =>
    readAdminExplorerDetail(client, kind, id),
  );
  const detail = query.record;
  return (
    <StaffPage title={explorerTitles[kind]}>
      <ReadState query={query} />
      {detail ? (
        <>
          <AdminCard>
            <AdminHeading>{detail.record.name}</AdminHeading>
            <StatusBadge value={detail.record.status} />
            <Fact icon={CalendarDays}>{pkTime(detail.record.createdAt)}</Fact>
            {detail.record.parentName ? (
              <Fact icon={Building2}>{detail.record.parentName}</Fact>
            ) : null}
            {detail.record.reason ? <Fact icon={Tag}>{detail.record.reason}</Fact> : null}
            {detail.record.quantity !== null ? (
              <Fact icon={kind === 'payments' ? Wallet : BedDouble}>
                {detail.record.quantity}{' '}
                {kind === 'payments' ? 'approved payments' : 'occupied placements'}
              </Fact>
            ) : null}
            {detail.record.amountPaisa !== null ? (
              <Fact icon={Wallet}>{paisaText(detail.record.amountPaisa)} hostel-direct</Fact>
            ) : null}
            {detail.facts.map((fact) => (
              <Fact key={fact.label} icon={Info}>
                {fact.label}: {fact.value}
              </Fact>
            ))}
            <Fact icon={Hash}>{detail.record.id}</Fact>
          </AdminCard>
          {detail.action === 'verification' ? <HostelSuspension branchId={id} /> : null}
          {detail.action === 'verification' ? (
            <ActionButton
              icon={ClipboardCheck}
              text="Verification"
              label="Open branch verification and history"
              tone="solid"
              onPress={() =>
                router.push({
                  pathname: '/admin/verifications/[branchId]',
                  params: { branchId: id },
                })
              }
            />
          ) : null}
          {detail.links.map((link) => (
            <RecordRow
              key={link.label}
              icon={List}
              title={link.label}
              label={link.label}
              onPress={() =>
                link.id
                  ? openExplorerProfile(link.kind, link.id)
                  : openExplorer(link.kind, {
                      ...(link.parentId ? { parentId: link.parentId } : {}),
                      ...(link.ownerId ? { ownerId: link.ownerId } : {}),
                      ...(link.managerId ? { managerId: link.managerId } : {}),
                    })
              }
            />
          ))}
          {detail.action === 'customer_governance' ? (
            <ProfileGovernance id={id} status={detail.record.status} />
          ) : null}
          {detail.notice ? <Fact icon={Info}>{detail.notice}</Fact> : null}
        </>
      ) : null}
    </StaffPage>
  );
}
// Suspend a hostel branch, or lift its suspension, right from its own screen (ADM-007).
function HostelSuspension({ branchId }: { branchId: string }) {
  const query = useStaffRecord('explorer-hostel-suspension', branchId, (client) =>
    readVerificationDossier(client, branchId),
  );
  return query.record ? (
    <VerificationDecision
      dossier={query.record}
      only={['suspend', 'reinstate']}
      labels={{ suspend: 'Suspend hostel', reinstate: 'Lift suspension' }}
    />
  ) : (
    <ReadState query={query} />
  );
}
function ProfileGovernance({ id, status }: { id: string; status: string }) {
  const input = customerGovernanceQuerySchema.parse({ userId: id, status });
  const query = useStaffRecord('explorer-enforcement', id + ':' + status, (client) =>
    listGovernedCustomers(client, input),
  );
  const row = query.record?.data.find((value) => value.userId === id);
  return (
    <AdminCard>
      <ReadState query={query} empty={!row} />
      {row ? <CustomerDecision row={row} /> : null}
    </AdminCard>
  );
}
