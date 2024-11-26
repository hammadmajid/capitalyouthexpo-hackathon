import { mobileSurfaces } from '@hsm/ui';
import { Image, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { BedDouble, Building2, MapPin, Users, type LucideIcon } from 'lucide-react-native';
import { readOwnFileUrl } from '@hsm/api-client';
import type { branchSummarySchema, ownerBranchRowSchema } from '@hsm/contracts';
import type { z } from 'zod';
import { mobileOwnerColors as c, ownerMetrics as m } from '@hsm/ui';
import { actorClient } from '../lib/runtime';
import { withFreshSession } from '../lib/fresh-session';
import { useAreaNames } from './owner-area-picker';
import { verificationLabel, verificationTone } from './owner-status';
import { SetupButton, SetupText, StatusChip } from './owner-wizard-ui';
import { openAddBranch, openBranchSetup } from './owner-setup-nav';
import {
  canAddBranch,
  editableStatuses,
  useOwnerDraftDetails,
  useOwnerHostel,
} from './use-owner-draft';
type Branch = z.infer<typeof branchSummarySchema>;
type Row = Pick<z.infer<typeof ownerBranchRowSchema>, 'branchId' | 'beds' | 'activeResidents'>;
// OWN-001..004: one card per hostel. Photo, area and status are the saved server values; the
// cover photo is the Owner's own uploaded hostel photo (signed, short-lived URL).
// Small stat tile: icon, number, label.
function Stat({ Icon, value, label }: { Icon: LucideIcon; value: string; label: string }) {
  return (
    <View
      accessible
      accessibilityLabel={label + ': ' + value}
      style={{
        flex: 1,
        alignItems: 'center',
        gap: 4,
        paddingVertical: 10,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: mobileSurfaces.icyCard.borderColor,
        backgroundColor: c.primarySoft,
      }}
    >
      <Icon size={20} color={c.primary} />
      <Text className="font-heading" style={{ color: c.heading, fontSize: 16 }}>
        {value}
      </Text>
      <Text className="font-body" style={{ color: c.secondary, fontSize: 12 }}>
        {label}
      </Text>
    </View>
  );
}
export function OwnerHostelCard({
  actorId,
  hostel,
  branches,
  rows,
}: {
  actorId: string;
  hostel: { id: string; name: string };
  branches: Branch[];
  rows: Row[];
}) {
  const data = useOwnerHostel(actorId, hostel.id).data;
  const main = data?.mainBranch;
  const details = useOwnerDraftDetails(actorId, main?.id);
  const cover = details.gallery.data?.data.find((image) => image.scanStatus === 'clean');
  const photo = useQuery({
    queryKey: ['owner-photo-url', actorId, cover?.fileId],
    enabled: Boolean(cover),
    retry: false,
    staleTime: 60_000,
    queryFn: () =>
      withFreshSession(async () => readOwnFileUrl(await actorClient(actorId), cover?.fileId ?? '')),
  });
  const place = useAreaNames(actorId, {
    cityId: main?.cityId ?? null,
    areaId: main?.areaId ?? null,
    subAreaId: main?.subAreaId ?? null,
  });
  const status = main?.verificationStatus ?? branches[0]?.verificationStatus;
  const editable = !status || editableStatuses.includes(status);
  const beds = rows.reduce((sum, row) => sum + row.beds.beds, 0);
  const occupied = rows.reduce((sum, row) => sum + row.beds.occupied, 0);
  const residents = rows.reduce((sum, row) => sum + row.activeResidents, 0);
  return (
    <View style={styles.card}>
      <View style={styles.top}>
        {photo.data ? (
          <Image
            source={{ uri: photo.data.url }}
            accessibilityLabel={cover?.altText ?? hostel.name + ' photo'}
            style={styles.photo}
          />
        ) : (
          <View style={[styles.photo, styles.placeholder]}>
            <Building2 size={m.heading} color={c.primary} />
          </View>
        )}
        <View style={styles.grow}>
          <Text accessibilityRole="header" className="font-heading" style={styles.name}>
            {hostel.name}
          </Text>
          <View style={styles.place}>
            <MapPin size={m.small + 2} color={c.secondary} />
            <SetupText muted>
              {place || (main?.cityId ? 'Loading area…' : 'Location not set')}
            </SetupText>
          </View>
          {status ? (
            <StatusChip label={verificationLabel(status)} tone={verificationTone(status)} />
          ) : (
            <StatusChip label="Setup incomplete" />
          )}
        </View>
      </View>
      {data?.verificationNote ? (
        <View style={styles.note} accessibilityRole="alert">
          <Text className="font-heading" style={{ color: c.warning }}>
            {status === 'rejected' ? 'Reason from HSM' : 'HSM asked for changes'}
          </Text>
          <SetupText>{data.verificationNote}</SetupText>
        </View>
      ) : null}
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Stat Icon={Building2} value={String(branches.length)} label="Branches" />
        <Stat Icon={BedDouble} value={occupied + '/' + beds} label="Beds used" />
        <Stat Icon={Users} value={String(residents)} label="Residents" />
      </View>
      {editable ? (
        <>
          <SetupText muted>Private until approved</SetupText>
          <SetupButton
            label="Continue Setup"
            onPress={() =>
              router.push({ pathname: '/owner-setup', params: { brandId: hostel.id } })
            }
          />
        </>
      ) : null}
      {/* Secondary actions pair up two per row. */}
      <View style={styles.actions}>
        {branches.map((branch) =>
          // BRN-001: an unapproved additional branch reopens its own six-step setup.
          main && branch.id !== main.id && editableStatuses.includes(branch.verificationStatus) ? (
            <View key={branch.id} style={styles.action}>
              <SetupButton
                secondary
                label={'Continue ' + branch.name + ' setup'}
                onPress={() => openBranchSetup(hostel.id, branch.id)}
              />
            </View>
          ) : (
            <View key={branch.id} style={styles.action}>
              <SetupButton
                secondary
                label={branches.length > 1 ? 'Manage ' + branch.name : 'Manage branch'}
                onPress={() =>
                  router.push({ pathname: '/owner-branch', params: { branchId: branch.id } })
                }
              />
            </View>
          ),
        )}
        {branches
          .filter((branch) => branch.id !== main?.id && branch.verificationStatus === 'approved')
          .map((branch) => (
            <View key={branch.id + ':amenities'} style={styles.action}>
              <SetupButton
                secondary
                label={'Amenities & Services · ' + branch.name}
                onPress={() =>
                  router.push({
                    pathname: '/owner-setup',
                    params: { brandId: hostel.id, branchId: branch.id, step: 'amenities' },
                  })
                }
              />
            </View>
          ))}
        {canAddBranch(data) ? (
          <View style={styles.action}>
            <SetupButton secondary label="Add branch" onPress={() => openAddBranch(hostel.id)} />
          </View>
        ) : null}
        {status === 'approved' ? (
          // CHG-041: edits wait for re-verification while the hostel stays live.
          <View style={styles.action}>
            <SetupButton
              secondary
              label="Edit hostel details"
              onPress={() =>
                router.push({ pathname: '/owner-setup', params: { brandId: hostel.id } })
              }
            />
          </View>
        ) : null}
        {!editable && status !== 'approved' ? (
          <View style={styles.action}>
            <SetupButton
              secondary
              label="View submission"
              onPress={() =>
                router.push({
                  pathname: '/owner-setup',
                  params: { brandId: hostel.id, step: 'review' },
                })
              }
            />
          </View>
        ) : null}
      </View>
    </View>
  );
}
const styles = StyleSheet.create({
  card: {
    ...mobileSurfaces.icyCard,
    backgroundColor: mobileSurfaces.icyCard.backgroundColor,
    borderRadius: m.cardRadius,
    borderWidth: 1,
    borderColor: mobileSurfaces.icyCard.borderColor,
    padding: m.gap,
    gap: m.gap - 4,
  },
  top: { flexDirection: 'row', gap: m.gap, alignItems: 'center' },
  photo: { width: 96, height: 96, borderRadius: m.inputRadius },
  placeholder: { backgroundColor: c.primarySoft, alignItems: 'center', justifyContent: 'center' },
  grow: { flex: 1, gap: 6 },
  name: { color: c.heading, fontSize: m.title - 2 },
  place: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  note: {
    backgroundColor: c.warningSoft,
    borderRadius: m.inputRadius,
    padding: m.gap - 4,
    gap: 4,
  },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: m.smallGap },
  action: { flexGrow: 1, flexBasis: '45%' },
  stats: { flexDirection: 'row', justifyContent: 'space-between', gap: m.smallGap },
});
