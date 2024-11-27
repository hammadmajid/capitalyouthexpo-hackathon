import { useState } from 'react';
import { readBookingSettings, saveBookingSettings } from '@hsm/api-client';
import { platformBookingSettingsSchema } from '@hsm/contracts';
import type { z } from 'zod';
import { useStaffRecord } from './staff-data';
import { useAdminCommand } from './data';
import { StaffPage, ReadState, sentence } from './staff-ui';
import { AdminCard, AdminHeading } from './ui';
import { PolicyForm } from './policy-form';
import { Copy } from '../ui';
import { StyleSheet, View } from 'react-native';
import {
  CalendarRange,
  Check,
  FileText,
  Pencil,
  Repeat,
  ShieldAlert,
  Timer,
  X,
  Zap,
} from 'lucide-react-native';
import { spacing } from '@hsm/ui';
import { StatusBadge } from './management-ui';
import { ActionButton, ButtonRow, Fact } from './admin-list';
const styles = StyleSheet.create({
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
});
import { NativeCommandRecovery } from '../services/command-recovery';
import { safeMessage } from '../../lib/messages';
type Input = z.infer<typeof platformBookingSettingsSchema>;
export function AdminBookingPolicy() {
  const query = useStaffRecord('booking-policy', 'platform', (c) =>
    readBookingSettings(c, { level: 'platform' }),
  );
  const [editing, setEditing] = useState(false);
  const [baseVersion, setBaseVersion] = useState<string | null>(null);
  const [preview, setPreview] = useState<Input>();
  const command = useAdminCommand(
    'Admin:platform-policy',
    (c, input: Input, key) => saveBookingSettings(c, { level: 'platform' }, input, key),
    true,
    'policy',
  );
  const locked = command.isPending || command.unresolved;
  const current = query.record;
  return (
    <StaffPage title="Platform policies">
      <ReadState query={query} />
      <NativeCommandRecovery command={command} />
      {command.isError ? <Copy alert>{safeMessage(command.error)}</Copy> : null}
      {current ? (
        <AdminCard>
          <View style={styles.head}>
            <AdminHeading>Defaults and limits for every hostel</AdminHeading>
            <StatusBadge value={current.configured ? 'active' : 'not configured'} />
          </View>
          {current.configured ? (
            <>
              <Fact icon={Zap}>
                {current.effective.bookingMode === 'instant' ? 'Instant booking' : 'Request first'}
              </Fact>
              <Fact icon={CalendarRange}>
                Stay {current.effective.minimumStayDays}–
                {current.effective.maximumStayDays === 'unlimited'
                  ? 'any'
                  : current.effective.maximumStayDays}{' '}
                days · book {current.effective.minimumAdvanceDays}–
                {current.effective.maximumAdvanceDays} days ahead
              </Fact>
              <Fact icon={Timer}>
                Hold {minutes(current.effective.holdSeconds)} · request waits{' '}
                {hours(current.effective.requestExpirySeconds)}
              </Fact>
              <Fact icon={Repeat}>
                {current.effective.allowedStayUnits.map(sentence).join(', ')}
              </Fact>
              <Fact icon={FileText}>
                {current.effective.requiredDocuments.map(sentence).join(', ') || 'No documents'}
              </Fact>
              <Fact icon={ShieldAlert}>
                Limits: {current.limits.maximumActiveHolds} holds per customer · hold up to{' '}
                {minutes(current.limits.maximumHoldSeconds)} · wait up to{' '}
                {hours(current.limits.maximumRequestExpirySeconds)}
              </Fact>
            </>
          ) : null}
          {preview ? (
            <>
              <AdminHeading>Review</AdminHeading>
              <Fact icon={Zap}>
                {preview.policy.bookingMode === 'instant' ? 'Instant booking' : 'Request first'}
              </Fact>
              <Fact icon={CalendarRange}>
                Stay {preview.policy.minimumStayDays}–{preview.policy.maximumStayDays} days ·
                advance {preview.policy.minimumAdvanceDays}–{preview.policy.maximumAdvanceDays} days
              </Fact>
              <ButtonRow>
                <ActionButton
                  icon={Pencil}
                  text="Edit"
                  label="Edit policy again"
                  disabled={locked}
                  onPress={() => setPreview(undefined)}
                />
                <ActionButton
                  icon={Check}
                  text="Save"
                  label="Confirm platform booking policy"
                  tone="solid"
                  disabled={locked || query.isFetching}
                  onPress={() =>
                    command.mutate(
                      {
                        ...preview,
                        expectedCurrentVersionId: baseVersion,
                      },
                      {
                        onSuccess: () => {
                          setPreview(undefined);
                          setEditing(false);
                        },
                      },
                    )
                  }
                />
              </ButtonRow>
            </>
          ) : editing ? (
            <PolicyForm
              pending={locked}
              onReview={setPreview}
              {...(current.configured
                ? { initial: { policy: current.effective, limits: current.limits } }
                : {})}
            />
          ) : (
            <ActionButton
              icon={Pencil}
              text="Edit"
              label="Edit platform booking policy"
              tone="solid"
              disabled={locked || !current.canEdit}
              onPress={() => {
                setBaseVersion(current.configured ? (current.localVersion?.id ?? null) : null);
                setEditing(true);
              }}
            />
          )}
          {editing ? (
            <ActionButton
              icon={X}
              text="Cancel"
              label="Cancel policy edit"
              disabled={locked}
              onPress={() => {
                setEditing(false);
                setPreview(undefined);
              }}
            />
          ) : null}
        </AdminCard>
      ) : null}
    </StaffPage>
  );
}
// Seconds are stored; people read minutes and hours.
const minutes = (seconds: number) => Math.round(seconds / 60) + ' min';
const hours = (seconds: number) => {
  const value = seconds / 3600;
  return (Number.isInteger(value) ? value : value.toFixed(1)) + ' h';
};
