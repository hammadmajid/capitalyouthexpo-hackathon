import { useState } from 'react';
import { Linking, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { ExternalLink, IdCard, Lock, X } from 'lucide-react-native';
import {
  readVerificationDossier,
  readVerificationEvidence,
  readVerificationHistory,
} from '@hsm/api-client';
import type { VerificationDossier } from '@hsm/contracts';
import { mobileColors as colors, spacing } from '@hsm/ui';
import { useStaffPages, useStaffRecord } from './staff-data';
import { useSensitiveRead } from './sensitive-read';
import { StaffPage, ReadState, Continuation } from './staff-ui';
import { WorkflowTabs } from './management-ui';
import { AdminCard, AdminField } from './ui';
import { Copy } from '../ui';
import { safeMessage } from '../../lib/messages';
import { VerificationPhotos, VerificationPricing } from './verification-listing';
import { VerificationSnapshots } from './verification-snapshots';
import { DossierSummary } from './verification-summary';
import { VerificationDecision } from './verification-decision';
import { IconButton, StatusPill, karachiTime } from './verification-ui';
export function VerificationDetail() {
  const params = useLocalSearchParams<{ branchId?: string }>();
  const branchId = typeof params.branchId === 'string' ? params.branchId : '';
  const detail = useStaffRecord('verification-dossier', branchId, (c) =>
    readVerificationDossier(c, branchId),
  );
  return (
    <StaffPage title="Verification">
      <ReadState query={detail} />
      {detail.record ? (
        <>
          <DossierSummary dossier={detail.record} />
          <VerificationDecision dossier={detail.record} />
          <WorkflowTabs
            sections={[
              { title: 'Evidence', content: <Evidence dossier={detail.record} /> },
              { title: 'Pricing', content: <VerificationPricing branchId={branchId} /> },
              { title: 'History', content: <History branchId={branchId} /> },
            ]}
          />
        </>
      ) : null}
    </StaffPage>
  );
}
// SEC-003: one audited purpose unlocks identity and listing evidence for this review.
function Evidence({ dossier }: { dossier: VerificationDossier }) {
  const [purpose, setPurpose] = useState('');
  const ready = purpose.trim().length >= 8;
  return (
    <>
      <AdminCard>
        <View style={styles.lock}>
          <Lock size={16} color={colors.secondary} />
          <Text className="font-body text-sm text-secondary">Audited access</Text>
        </View>
        <AdminField label="Access purpose" value={purpose} onChange={setPurpose} />
        <IdentityEvidence
          dossier={dossier}
          purpose={ready ? purpose.trim() : ''}
          clear={() => setPurpose('')}
        />
      </AdminCard>
      <VerificationPhotos
        branchId={dossier.branchId}
        purpose={ready ? purpose.trim() : ''}
        clear={() => setPurpose('')}
      />
      <VerificationSnapshots branchId={dossier.branchId} />
    </>
  );
}
function IdentityEvidence({
  dossier,
  purpose,
  clear,
}: {
  dossier: VerificationDossier;
  purpose: string;
  clear: () => void;
}) {
  const [openError, setOpenError] = useState(false);
  const access = useSensitiveRead(
    'verification',
    (c, input: { fileId: string; justification: string }) =>
      readVerificationEvidence(c, dossier.branchId, input.fileId, {
        justification: input.justification,
      }),
  );
  if (!dossier.evidence.length) return <Copy>No CNIC evidence</Copy>;
  return (
    <>
      <View style={styles.row}>
        {dossier.evidence.map((file) => (
          <IconButton
            key={file.fileId}
            Icon={IdCard}
            label={file.side === 'front' ? 'CNIC front' : 'CNIC back'}
            disabled={!file.available || !purpose || access.isPending}
            onPress={() => {
              setOpenError(false);
              access.mutate({ fileId: file.fileId, justification: purpose });
            }}
          />
        ))}
      </View>
      {access.isError ? <Copy alert>{safeMessage(access.error)}</Copy> : null}
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
    </>
  );
}
function History({ branchId }: { branchId: string }) {
  const history = useStaffPages(
    'verification-history',
    (c, cursor) =>
      readVerificationHistory(c, branchId, {
        limit: 20,
        ...(cursor ? { cursor } : {}),
      }),
    { branchId },
  );
  return (
    <>
      <ReadState query={history} empty={history.rows.length === 0} />
      {history.rows.map((event) => (
        <AdminCard key={event.id}>
          <StatusPill status={event.toStatus} />
          <Text className="font-body text-sm text-secondary">
            {event.reviewerName} · {karachiTime(event.createdAt)}
          </Text>
          {event.reason ? <Copy>{event.reason}</Copy> : null}
        </AdminCard>
      ))}
      <Continuation query={history} />
    </>
  );
}
const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: spacing.sm },
  lock: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
});
