import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Check, X } from 'lucide-react-native';
import { decideHostelRevision, readHostelRevisionReview } from '@hsm/api-client';
import type { HostelRevisionReview } from '@hsm/contracts';
import { mobileColors as colors, spacing } from '@hsm/ui';
import { useAdminCommand } from './data';
import { useStaffRecord } from './staff-data';
import { StaffPage, ReadState } from './staff-ui';
import { AdminCard, AdminField, AdminHeading } from './ui';
import { IconButton, karachiTime } from './verification-ui';
import { NativeCommandRecovery } from '../services/command-recovery';
import { Copy } from '../ui';
import { safeMessage } from '../../lib/messages';
const labels: Record<string, string> = {
  name: 'Name',
  logoFileId: 'Logo',
  category: 'Hostel type',
  description: 'About',
  phone: 'Phone',
  showPublicContact: 'Show contact',
  propertyTier: 'Property tier',
  establishmentYear: 'Year established',
  cityId: 'City',
  areaId: 'Area',
  subAreaId: 'Sub-area',
  addressLine: 'Address',
  location: 'Map pin',
  nearbyLandmark: 'Landmark',
};
const placeKeys = new Set(['cityId', 'areaId', 'subAreaId']);
// CHG-041: places show by name, the map pin by its coordinates, the logo as changed/removed.
function show(key: string, value: unknown, names: Record<string, string>) {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (placeKeys.has(key) && typeof value === 'string') return names[value] ?? 'Unknown place';
  if (key === 'logoFileId') return 'Logo image';
  if (typeof value === 'object') {
    const { latitude, longitude } = value as { latitude?: unknown; longitude?: unknown };
    return typeof latitude === 'number' && typeof longitude === 'number'
      ? latitude.toFixed(5) + ', ' + longitude.toFixed(5)
      : 'Map pin';
  }
  return String(value).replaceAll('_', ' ');
}
// Each changed field shows what customers see now and what the Owner asked for.
export function revisionRows(review: Pick<HostelRevisionReview, 'live' | 'revision'>) {
  const live: Record<string, unknown> = {
    ...(review.live.mainBranch ?? {}),
    name: review.live.name,
    logoFileId: review.live.logoFileId,
  };
  const proposed: Record<string, unknown> = {
    ...(review.revision.changes.basics ?? {}),
    ...(review.revision.changes.main ?? {}),
  };
  return Object.keys(labels)
    .filter(
      (key) =>
        key in proposed &&
        JSON.stringify(proposed[key] ?? null) !== JSON.stringify(live[key] ?? null),
    )
    .map((key) => ({ key, label: labels[key] ?? key, now: live[key], next: proposed[key] }));
}
// CHG-041 / ADM-007: approving publishes the changes; rejecting keeps the live hostel.
export function HostelRevisionReviewScreen({ revisionId }: { revisionId: string }) {
  const query = useStaffRecord('hostel-revision', revisionId, (client) =>
    readHostelRevisionReview(client, revisionId),
  );
  const review = query.record;
  return (
    <StaffPage title="Hostel changes">
      <ReadState query={query} />
      {review ? (
        <>
          <AdminCard>
            <AdminHeading>{review.branchName}</AdminHeading>
            <Copy>
              {review.organizationName}
              {review.revision.submittedAt
                ? ' · sent ' + karachiTime(review.revision.submittedAt)
                : ''}
            </Copy>
            <Copy>The hostel stays live with its current details until you approve.</Copy>
          </AdminCard>
          {revisionRows(review).map((row) => (
            <AdminCard key={row.key}>
              <Text className="font-heading text-body text-heading">{row.label}</Text>
              <Text style={styles.now}>Now: {show(row.key, row.now, review.placeNames ?? {})}</Text>
              <Text style={styles.next}>
                New: {show(row.key, row.next, review.placeNames ?? {})}
              </Text>
            </AdminCard>
          ))}
          {review.revision.status === 'submitted' ? (
            <Decision review={review} />
          ) : (
            <Copy>Already decided: {review.revision.status}.</Copy>
          )}
        </>
      ) : null}
    </StaffPage>
  );
}
function Decision({ review }: { review: HostelRevisionReview }) {
  const [rejecting, setRejecting] = useState(false);
  // Approving publishes at once, so it asks once like rejecting does.
  const [approving, setApproving] = useState(false);
  const [reason, setReason] = useState('');
  const command = useAdminCommand(
    'Admin:hostel-revision:' + review.revision.id,
    (client, input: { action: 'approve' | 'reject'; reason?: string }, key) =>
      decideHostelRevision(
        client,
        review.revision.id,
        { expectedVersion: review.revision.version, ...input },
        key,
      ),
    false,
    'verification',
  );
  const locked = command.isPending || command.unresolved;
  const done = () => router.back();
  return (
    <AdminCard>
      <NativeCommandRecovery command={command} />
      {command.isError ? <Copy alert>{safeMessage(command.error)}</Copy> : null}
      {rejecting ? (
        <AdminField label="Reason" value={reason} onChange={setReason} disabled={locked} />
      ) : null}
      <View style={styles.row}>
        <IconButton
          Icon={X}
          label={rejecting ? 'Confirm reject' : 'Reject'}
          tone="danger"
          disabled={locked || approving || (rejecting && !reason.trim())}
          onPress={() =>
            rejecting
              ? command.mutate({ action: 'reject', reason: reason.trim() }, { onSuccess: done })
              : setRejecting(true)
          }
        />
        <IconButton
          Icon={Check}
          label={approving ? 'Confirm approve · goes live' : 'Approve'}
          tone="solid"
          disabled={locked || rejecting}
          onPress={() =>
            approving
              ? command.mutate({ action: 'approve' }, { onSuccess: done })
              : setApproving(true)
          }
        />
      </View>
      {rejecting || approving ? (
        <IconButton
          Icon={X}
          label="Cancel"
          disabled={locked}
          onPress={() => {
            setRejecting(false);
            setApproving(false);
          }}
        />
      ) : null}
    </AdminCard>
  );
}
const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: spacing.sm },
  now: { color: colors.secondary },
  next: { color: colors.primary, fontWeight: '600' },
});
