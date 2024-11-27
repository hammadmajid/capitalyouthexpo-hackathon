import { useState } from 'react';
import { decideCustomer, listGovernedCustomers } from '@hsm/api-client';
import { customerGovernanceInputSchema, type customerGovernanceRecordSchema } from '@hsm/contracts';
import type { z } from 'zod';
import { useStaffPages } from './staff-data';
import { Choices, Continuation, ReadState, StaffPage } from './staff-ui';
import { AdminCard, AdminField, AdminHeading } from './ui';
import { StyleSheet, Text, View } from 'react-native';
import {
  Ban,
  Info,
  Pause,
  RotateCcw,
  TriangleAlert,
  X,
  type LucideIcon,
} from 'lucide-react-native';
import { spacing } from '@hsm/ui';
import { Copy } from '../ui';
import { StatusBadge } from './management-ui';
import { ActionButton, ButtonRow, Fact, shortId } from './admin-list';
import { useAdminCommand } from './data';
import { NativeCommandRecovery } from '../services/command-recovery';
import { safeMessage } from '../../lib/messages';
type Customer = z.infer<typeof customerGovernanceRecordSchema>;
// GOV-001: Admin, Owner and active Manager identities are protected server-side; every
// decision needs a reason (≥ 8 characters) and is audited.
const actionMeta: Record<
  string,
  { text: string; icon: LucideIcon; tone: 'outline' | 'danger' | 'solid'; effect?: string }
> = {
  warn: { text: 'Warn', icon: TriangleAlert, tone: 'outline' },
  suspend: { text: 'Suspend', icon: Pause, tone: 'danger', effect: 'Signs out every session.' },
  ban: { text: 'Ban', icon: Ban, tone: 'danger', effect: 'Signs out every session.' },
  reinstate: {
    text: 'Lift suspension',
    icon: RotateCcw,
    tone: 'solid',
    effect: 'Requires a fresh login.',
  },
};
export function CustomerGovernance() {
  const [status, setStatus] = useState('active');
  const list = useStaffPages(
    'customer-governance',
    (c, cursor) => listGovernedCustomers(c, { status, ...(cursor ? { cursor } : {}) }),
    { status },
  );
  return (
    <StaffPage title="Customer suspensions">
      <Choices
        label="Customer status"
        values={['active', 'suspended', 'banned']}
        value={status}
        onChange={setStatus}
      />
      <ReadState query={list} empty={!list.rows.length} />
      {list.rows.map((row) => (
        <CustomerDecision key={row.userId + row.updatedAt} row={row} />
      ))}
      <Continuation query={list} />
    </StaffPage>
  );
}
export function CustomerDecision({ row }: { row: Customer }) {
  const [reason, setReason] = useState(''),
    [action, setAction] = useState<string>();
  const [baseline] = useState(row);
  const command = useAdminCommand(
    'customer-governance:' + row.userId,
    (c, input: z.infer<typeof customerGovernanceInputSchema>, key) =>
      decideCustomer(c, row.userId, input, key),
    false,
    'governance',
  );
  const locked = command.isPending || command.unresolved;
  const actions =
    row.status === 'active'
      ? ['warn', 'suspend', 'ban']
      : row.status === 'suspended'
        ? ['ban', 'reinstate']
        : ['reinstate'];
  const meta = action ? actionMeta[action] : undefined;
  return (
    <AdminCard>
      <View style={styles.head}>
        <View style={styles.grow}>
          <AdminHeading>{row.fullName}</AdminHeading>
          <Text className="font-body text-xs text-secondary">{shortId(row.userId)}</Text>
        </View>
        <StatusBadge value={row.status} />
      </View>
      <NativeCommandRecovery command={command} />
      {command.error ? <Copy alert>{safeMessage(command.error)}</Copy> : null}
      {command.isSuccess ? <Copy>Decision recorded.</Copy> : null}
      {action && meta ? (
        <>
          <AdminField
            label={'Decision reason for ' + row.fullName}
            value={reason}
            onChange={setReason}
            disabled={locked}
            maxLength={500}
            multiline
          />
          {meta.effect ? <Fact icon={Info}>{meta.effect}</Fact> : null}
          <ButtonRow>
            <ActionButton
              icon={X}
              text="Cancel"
              label="Cancel customer decision"
              disabled={locked}
              onPress={() => setAction(undefined)}
            />
            <ActionButton
              icon={meta.icon}
              text={meta.text}
              label="Confirm customer decision"
              tone={meta.tone === 'danger' ? 'danger' : 'solid'}
              disabled={locked || reason.trim().length < 8}
              onPress={() =>
                command.mutate(
                  customerGovernanceInputSchema.parse({
                    action,
                    reason,
                    expectedStatus: baseline.status,
                    expectedUpdatedAt: baseline.updatedAt,
                  }),
                  { onSuccess: () => setAction(undefined) },
                )
              }
            />
          </ButtonRow>
        </>
      ) : (
        <ButtonRow>
          {actions.map((value) => {
            const item = actionMeta[value];
            return item ? (
              <ActionButton
                key={value}
                icon={item.icon}
                text={item.text}
                label={value + ' customer'}
                tone={item.tone}
                disabled={locked}
                onPress={() => {
                  setReason('');
                  setAction(value);
                }}
              />
            ) : null;
          })}
        </ButtonRow>
      )}
    </AdminCard>
  );
}
const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  grow: { flex: 1, gap: spacing.xs },
});
