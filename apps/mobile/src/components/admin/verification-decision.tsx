import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import {
  Ban,
  Check,
  PenLine,
  RotateCcw,
  ScanSearch,
  X,
  type LucideIcon,
} from 'lucide-react-native';
import { submitVerificationDecision } from '@hsm/api-client';
import {
  nextVerificationStatus,
  verificationActionSchema,
  verificationCommandInputSchema,
  type VerificationDossier,
} from '@hsm/contracts';
import type { z } from 'zod';
import { spacing } from '@hsm/ui';
import { useAdminCommand } from './data';
import { AdminCard, AdminField, AdminHeading } from './ui';
import { NativeCommandRecovery } from '../services/command-recovery';
import { Copy } from '../ui';
import { safeMessage } from '../../lib/messages';
import { IconButton } from './verification-ui';
type Action = z.infer<typeof verificationActionSchema>;
// ADM-007: decisive actions first; destructive ones are red; a reason is asked only where the
// server rule requires one (request changes, reject, suspend, reinstate).
const actions: Record<
  Action,
  { label: string; Icon: LucideIcon; tone: 'solid' | 'outline' | 'danger' }
> = {
  approve: { label: 'Approve', Icon: Check, tone: 'solid' },
  reject: { label: 'Reject', Icon: X, tone: 'danger' },
  start_review: { label: 'Start review', Icon: ScanSearch, tone: 'outline' },
  request_changes: { label: 'Request changes', Icon: PenLine, tone: 'outline' },
  reinstate: { label: 'Reinstate', Icon: RotateCcw, tone: 'solid' },
  suspend: { label: 'Suspend', Icon: Ban, tone: 'danger' },
};
const order: Action[] = [
  'approve',
  'reject',
  'start_review',
  'request_changes',
  'reinstate',
  'suspend',
];
// `only` narrows the buttons, e.g. Suspend / Lift suspension on a hostel's own screen.
export function VerificationDecision({
  dossier,
  only,
  labels,
}: {
  dossier: VerificationDossier;
  only?: Action[];
  labels?: Partial<Record<Action, string>>;
}) {
  const [action, setAction] = useState<Action>();
  const [reason, setReason] = useState('');
  const [baseline, setBaseline] = useState(dossier);
  const command = useAdminCommand(
    'Admin:verification:' + dossier.branchId,
    (c, input: z.infer<typeof verificationCommandInputSchema>, key) =>
      submitVerificationDecision(c, dossier.branchId, input, key),
    false,
    'verification',
  );
  const locked = command.isPending || command.unresolved;
  const available = order.filter(
    (a) => (!only || only.includes(a)) && nextVerificationStatus(dossier.status, a),
  );
  const label = (a: Action) => labels?.[a] ?? actions[a].label;
  if (!available.length && !command.unresolved) return null;
  const move = action ? nextVerificationStatus(baseline.status, action) : null;
  const confirm = () => {
    if (!action) return;
    const note = reason.trim();
    command.mutate(
      {
        action,
        ...(note ? { reason: note } : {}),
        expectedStatus: baseline.status,
        expectedUpdatedAt: baseline.updatedAt,
      },
      {
        onSuccess: () => {
          setAction(undefined);
          setReason('');
        },
      },
    );
  };
  return (
    <AdminCard>
      <NativeCommandRecovery command={command} />
      {command.isError ? <Copy alert>{safeMessage(command.error)}</Copy> : null}
      {action ? (
        <>
          <AdminHeading>{label(action)}</AdminHeading>
          <AdminField
            label={move?.reasonRequired ? 'Reason' : 'Note (optional)'}
            value={reason}
            onChange={setReason}
            disabled={locked}
          />
          <View style={styles.row}>
            <IconButton
              Icon={X}
              label="Cancel"
              disabled={locked}
              onPress={() => setAction(undefined)}
            />
            <IconButton
              Icon={actions[action].Icon}
              label="Confirm"
              tone={actions[action].tone === 'danger' ? 'danger' : 'solid'}
              disabled={locked || Boolean(move?.reasonRequired && !reason.trim())}
              onPress={confirm}
            />
          </View>
        </>
      ) : (
        pairs(available).map((pair) => (
          <View key={pair.join()} style={styles.row}>
            {pair.map((a) => (
              <IconButton
                key={a}
                Icon={actions[a].Icon}
                label={label(a)}
                tone={actions[a].tone}
                disabled={locked}
                onPress={() => {
                  setBaseline(dossier);
                  setAction(a);
                  setReason('');
                  command.reset();
                }}
              />
            ))}
          </View>
        ))
      )}
    </AdminCard>
  );
}
function pairs<T>(items: T[]) {
  return Array.from({ length: Math.ceil(items.length / 2) }, (_, i) =>
    items.slice(i * 2, i * 2 + 2),
  );
}
const styles = StyleSheet.create({ row: { flexDirection: 'row', gap: spacing.sm } });
