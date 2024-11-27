import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Banknote, Image as ImageIcon } from 'lucide-react-native';
import { readVerificationSnapshots, readVerificationSnapshotItems } from '@hsm/api-client';
import { spacing } from '@hsm/ui';
import { useStaffPages, useStaffRecord } from './staff-data';
import { AdminCard, AdminHeading } from './ui';
import { Continuation, ReadState } from './staff-ui';
import { Copy } from '../ui';
import { ChipRow, IconButton, karachiTime } from './verification-ui';
import { PriceLine, modeLabels } from './verification-listing';
type Selection = { id: string; kind: 'pricing' | 'photo' };
// ADM-007: what changed since the last approval, then current vs approved submissions.
export function VerificationSnapshots({ branchId }: { branchId: string }) {
  const query = useStaffRecord('verification-snapshots', branchId, (c) =>
    readVerificationSnapshots(c, branchId),
  );
  const [which, setWhich] = useState<'current' | 'approved'>('current');
  const [selected, setSelected] = useState<Selection>();
  const comparison = query.record;
  const snapshot = comparison
    ? which === 'current'
      ? comparison.current
      : comparison.lastApproved
    : null;
  return (
    <AdminCard>
      <AdminHeading>Submissions</AdminHeading>
      <ReadState query={query} />
      {comparison ? (
        <>
          {comparison.changedFields.length ? (
            <Copy>Changed: {comparison.changedFields.join(', ')}</Copy>
          ) : null}
          <ChipRow
            values={['current', 'approved'] as const}
            value={which}
            onChange={(next) => {
              setWhich(next);
              setSelected(undefined);
            }}
            labels={{ current: 'Current', approved: 'Last approved' }}
          />
          {snapshot ? (
            <>
              <Text className="font-body text-sm text-secondary">
                {karachiTime(snapshot.submittedAt)}
              </Text>
              <View style={styles.row}>
                <IconButton
                  Icon={Banknote}
                  label="Prices"
                  tone={selected?.kind === 'pricing' ? 'solid' : 'outline'}
                  onPress={() => setSelected({ id: snapshot.id, kind: 'pricing' })}
                />
                <IconButton
                  Icon={ImageIcon}
                  label="Photos"
                  tone={selected?.kind === 'photo' ? 'solid' : 'outline'}
                  onPress={() => setSelected({ id: snapshot.id, kind: 'photo' })}
                />
              </View>
            </>
          ) : (
            <Copy>{comparison.historicalSnapshotUnavailable ? 'Unavailable' : 'None'}</Copy>
          )}
        </>
      ) : null}
      {selected ? (
        <SnapshotItems
          key={selected.id + selected.kind}
          branchId={branchId}
          submissionId={selected.id}
          kind={selected.kind}
        />
      ) : null}
    </AdminCard>
  );
}
function SnapshotItems({
  branchId,
  submissionId,
  kind,
}: {
  branchId: string;
  submissionId: string;
  kind: Selection['kind'];
}) {
  const list = useStaffPages(
    'verification-snapshot-items',
    (c, cursor) =>
      readVerificationSnapshotItems(c, branchId, submissionId, {
        kind,
        limit: 20,
        ...(cursor ? { cursor } : {}),
      }),
    { branchId, submissionId, kind },
  );
  return (
    <>
      <ReadState query={list} empty={list.rows.length === 0} />
      {list.rows.map((row) =>
        row.kind === 'pricing' ? (
          <View key={row.sourceId} style={styles.item}>
            <Text className="font-heading text-body text-heading">{row.data.name}</Text>
            <Text className="font-body text-sm text-secondary">
              {modeLabels[row.data.inventoryMode]} · {row.data.capacity} capacity
            </Text>
            <PriceLine
              bed={row.data.bedMonthlyRentPaisa}
              room={row.data.roomMonthlyRentPaisa}
              deposit={row.data.depositPaisa}
            />
          </View>
        ) : (
          <Copy key={row.sourceId}>{row.data.altText || 'Listing photo'}</Copy>
        ),
      )}
      <Continuation query={list} />
    </>
  );
}
const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: spacing.sm },
  item: { gap: spacing.xs },
});
