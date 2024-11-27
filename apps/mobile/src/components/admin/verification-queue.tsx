import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Building2, CheckCheck, ChevronRight, PencilLine } from 'lucide-react-native';
import { listHostelRevisions, readVerificationQueue } from '@hsm/api-client';
import type { VerificationStatus } from '@hsm/contracts';
import { mobileColors as colors, mobileSurfaces, radii, spacing } from '@hsm/ui';
import { useStaffPages } from './staff-data';
import { StaffPage, ReadState, Continuation } from './staff-ui';
import { ChipRow, StatusPill, karachiTime, statusMeta } from './verification-ui';
type Filter = 'pending' | 'edits' | Exclude<VerificationStatus, 'submitted' | 'under_review'>;
// ADM-007: "Pending" is everything awaiting a decision (submitted + in review), matching the
// dashboard count; the other filters are single server statuses.
const filters: Filter[] = [
  'pending',
  // CHG-041: approved hostels whose edits wait for re-verification.
  'edits',
  'changes_requested',
  'approved',
  'rejected',
  'suspended',
  'draft',
];
const labels: Record<Filter, string> = {
  pending: 'Pending',
  edits: 'Edits',
  changes_requested: statusMeta.changes_requested.label,
  approved: statusMeta.approved.label,
  rejected: statusMeta.rejected.label,
  suspended: statusMeta.suspended.label,
  draft: statusMeta.draft.label,
};
function useQueue(status: VerificationStatus) {
  return useStaffPages(
    'verifications',
    (c, cursor) =>
      readVerificationQueue(c, {
        status,
        limit: 20,
        ...(cursor ? { cursor } : {}),
      }),
    { status },
  );
}
export function VerificationQueue() {
  const [filter, setFilter] = useState<Filter>('pending');
  const first = useQueue(filter === 'pending' || filter === 'edits' ? 'submitted' : filter);
  const review = useQueue('under_review');
  const lists = filter === 'pending' ? [first, review] : [first];
  const shown = filter === 'edits' ? [] : lists;
  const empty = shown.every((list) => !list.isPending && list.rows.length === 0);
  return (
    <StaffPage title="Verification">
      <ChipRow values={filters} value={filter} onChange={setFilter} labels={labels} />
      {filter === 'edits' ? <EditsList /> : null}
      {shown.map((list, index) => (
        <ReadState key={'state' + index} query={list} />
      ))}
      {filter !== 'edits' && empty && shown.every((list) => !list.isError) ? (
        <View style={styles.empty}>
          <CheckCheck size={32} color={colors.primary} strokeWidth={1.5} />
          <Text className="font-heading text-body text-heading">All clear</Text>
        </View>
      ) : null}
      {shown
        .flatMap((list) => list.rows)
        .map((row) => (
          <QueueRow key={row.branchId} row={row} />
        ))}
      {shown.map((list, index) => (
        <Continuation key={'more' + index} query={list} />
      ))}
    </StaffPage>
  );
}
function EditsList() {
  const list = useStaffPages('hostel-revisions', (c, cursor) =>
    listHostelRevisions(c, { limit: 20, ...(cursor ? { cursor } : {}) }),
  );
  return (
    <>
      <ReadState query={list} />
      {!list.isPending && !list.isError && !list.rows.length ? (
        <View style={styles.empty}>
          <CheckCheck size={32} color={colors.primary} strokeWidth={1.5} />
          <Text className="font-heading text-body text-heading">No edits waiting</Text>
        </View>
      ) : null}
      {list.rows.map((row) => (
        <Pressable
          key={row.id}
          accessibilityRole="button"
          accessibilityLabel={'Review changes to ' + row.branchName}
          android_ripple={{ color: colors.aqua }}
          onPress={() =>
            router.push({
              pathname: '/admin/verifications/changes/[revisionId]',
              params: { revisionId: row.id },
            })
          }
          style={styles.row}
        >
          <View style={styles.icon}>
            <PencilLine size={20} color={colors.primary} strokeWidth={1.75} />
          </View>
          <View style={styles.grow}>
            <Text className="font-heading text-body text-heading" numberOfLines={1}>
              {row.branchName}
            </Text>
            <Text className="font-body text-sm text-secondary" numberOfLines={1}>
              {row.organizationName} · {karachiTime(row.submittedAt)}
            </Text>
          </View>
          <ChevronRight size={20} color={colors.primary} />
        </Pressable>
      ))}
      <Continuation query={list} />
    </>
  );
}
function QueueRow({ row }: { row: ReturnType<typeof useQueue>['rows'][number] }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={'Review ' + row.branchName}
      android_ripple={{ color: colors.aqua }}
      onPress={() =>
        router.push({
          pathname: '/admin/verifications/[branchId]',
          params: { branchId: row.branchId },
        })
      }
      style={styles.row}
    >
      <View style={styles.icon}>
        <Building2 size={20} color={colors.primary} strokeWidth={1.75} />
      </View>
      <View style={styles.grow}>
        <Text className="font-heading text-body text-heading" numberOfLines={1}>
          {row.branchName}
        </Text>
        <Text className="font-body text-sm text-secondary" numberOfLines={1}>
          {row.organizationName} · {karachiTime(row.updatedAt)}
        </Text>
        <StatusPill status={row.status} />
      </View>
      <ChevronRight size={20} color={colors.primary} />
    </Pressable>
  );
}
const styles = StyleSheet.create({
  row: {
    ...mobileSurfaces.icyCard,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radii.card,
    borderWidth: 1,
  },
  icon: {
    width: 44,
    height: 44,
    borderRadius: radii.pill,
    backgroundColor: colors.aqua,
    alignItems: 'center',
    justifyContent: 'center',
  },
  grow: { flex: 1, gap: spacing.xs },
  empty: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xxl },
});
