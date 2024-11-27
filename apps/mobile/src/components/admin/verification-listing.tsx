import { useState } from 'react';
import { Linking, StyleSheet, Text, View } from 'react-native';
import { BedDouble, DoorOpen, ExternalLink, Image as ImageIcon, X } from 'lucide-react-native';
import {
  readVerificationEvidence,
  readVerificationPhotos,
  readVerificationPricing,
} from '@hsm/api-client';
import { formatExactMoney, money } from '@hsm/contracts';
import { mobileColors as colors, spacing } from '@hsm/ui';
import { useStaffPages } from './staff-data';
import { useSensitiveRead } from './sensitive-read';
import { AdminCard, AdminHeading } from './ui';
import { Continuation, ReadState } from './staff-ui';
import { Copy } from '../ui';
import { IconButton } from './verification-ui';
export const modeLabels = {
  per_bed: 'Per bed',
  whole_room: 'Whole room',
  both: 'Bed or room',
} as const;
export const marketplacePrice = (value: string | null) =>
  value === null ? '—' : formatExactMoney(money(BigInt(value)));
export function PriceLine({
  bed,
  room,
  deposit,
}: {
  bed: string | null;
  room: string | null;
  deposit: string;
}) {
  return (
    <View style={styles.prices}>
      {(
        [
          ['Bed / month', bed],
          ['Room / month', room],
          ['Deposit', deposit],
        ] as const
      ).map(([name, value]) => (
        <View key={name} style={styles.price}>
          <Text className="font-body text-sm text-secondary">{name}</Text>
          <Text className="font-heading text-body text-heading">{marketplacePrice(value)}</Text>
        </View>
      ))}
    </View>
  );
}
export function VerificationPricing({ branchId }: { branchId: string }) {
  const query = useStaffPages(
    'verification-pricing',
    (c, cursor) =>
      readVerificationPricing(c, branchId, {
        limit: 20,
        ...(cursor ? { cursor } : {}),
      }),
    { branchId },
  );
  return (
    <>
      <ReadState query={query} empty={query.rows.length === 0} />
      {query.rows.map((row) => (
        <AdminCard key={row.id}>
          <View style={styles.head}>
            {row.inventoryMode === 'whole_room' ? (
              <DoorOpen size={18} color={colors.primary} />
            ) : (
              <BedDouble size={18} color={colors.primary} />
            )}
            <AdminHeading>{row.name}</AdminHeading>
          </View>
          <Text className="font-body text-sm text-secondary">
            {modeLabels[row.inventoryMode]} · {row.capacity} capacity
          </Text>
          <PriceLine
            bed={row.bedMonthlyRentPaisa}
            room={row.roomMonthlyRentPaisa}
            deposit={row.depositPaisa}
          />
        </AdminCard>
      ))}
      <Continuation query={query} />
    </>
  );
}
// SEC-003: listing photos open only through the audited purpose entered on the Evidence tab.
export function VerificationPhotos({
  branchId,
  purpose,
  clear,
}: {
  branchId: string;
  purpose: string;
  clear: () => void;
}) {
  const [openError, setOpenError] = useState(false);
  const query = useStaffPages(
    'verification-photos',
    (c, cursor) =>
      readVerificationPhotos(c, branchId, {
        limit: 20,
        ...(cursor ? { cursor } : {}),
      }),
    { branchId },
  );
  const access = useSensitiveRead(
    'verification',
    (c, input: { fileId: string; justification: string }) =>
      readVerificationEvidence(c, branchId, input.fileId, { justification: input.justification }),
  );
  return (
    <AdminCard>
      <AdminHeading>Photos</AdminHeading>
      <ReadState query={query} empty={query.rows.length === 0} />
      {query.rows.map((row) => (
        <IconButton
          key={row.id}
          Icon={ImageIcon}
          label={
            (row.altText ||
              (row.roomId ? 'Room photo' : row.seatId ? 'Bed photo' : 'Branch photo')) +
            (row.available ? '' : ' · unavailable')
          }
          disabled={!row.available || access.isPending || !purpose}
          onPress={() => {
            setOpenError(false);
            access.mutate({ fileId: row.fileId, justification: purpose });
          }}
        />
      ))}
      {access.isError ? <Copy alert>Photo unavailable or access denied.</Copy> : null}
      {access.data ? (
        <View style={styles.row}>
          <IconButton
            Icon={ExternalLink}
            label="Open"
            tone="solid"
            onPress={() => void Linking.openURL(access.data.url).catch(() => setOpenError(true))}
          />
          <IconButton
            Icon={X}
            label="Close"
            onPress={() => {
              access.reset();
              clear();
            }}
          />
        </View>
      ) : null}
      {openError ? <Copy alert>Unable to open. Request access again.</Copy> : null}
      <Continuation query={query} />
    </AdminCard>
  );
}
const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  row: { flexDirection: 'row', gap: spacing.sm },
  prices: { flexDirection: 'row', gap: spacing.sm },
  price: { flex: 1, gap: spacing.xs },
});
