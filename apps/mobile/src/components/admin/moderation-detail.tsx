import { WorkflowTabs, StatusBadge } from './management-ui';
import { useState } from 'react';
import { useLocalSearchParams } from 'expo-router';
import {
  dismissReviewReport,
  moderateReview,
  readModerationHistory,
  readModerationReview,
} from '@hsm/api-client';
import { reviewModerationInputSchema, type ModerationReview } from '@hsm/contracts';
import type { z } from 'zod';
import { useStaffPages, useStaffRecord } from './staff-data';
import { StaffPage, ReadState, Continuation, sentence } from './staff-ui';
import { EyeOff, Flag, RotateCcw, Trash2, User, X, type LucideIcon } from 'lucide-react-native';
import { ActionButton, ButtonRow, Fact, pkTime } from './admin-list';
import { AdminCard, AdminField, AdminHeading } from './ui';
import { useAdminCommand } from './data';
import { NativeCommandRecovery } from '../services/command-recovery';
import { Copy } from '../ui';
import { safeMessage } from '../../lib/messages';
export function ModerationDetail() {
  const params = useLocalSearchParams<{ reviewId?: string; reportId?: string }>();
  const reviewId = typeof params.reviewId === 'string' ? params.reviewId : '';
  const reportId = typeof params.reportId === 'string' ? params.reportId : undefined;
  const detail = useStaffRecord('moderation-review', reviewId, (c) =>
    readModerationReview(c, reviewId),
  );
  const history = useStaffPages(
    'moderation-history',
    (c, cursor) =>
      readModerationHistory(c, reviewId, {
        limit: 20,
        ...(cursor ? { cursor } : {}),
      }),
    { reviewId },
  );
  return (
    <StaffPage title="Review moderation">
      <ReadState query={detail} />
      {detail.record ? (
        <>
          <AdminCard>
            <StatusBadge value={detail.record.status} />
            <Copy>{detail.record.body ?? 'Text unavailable'}</Copy>
            {detail.record.moderationReason ? (
              <Fact icon={Flag}>{detail.record.moderationReason}</Fact>
            ) : null}
          </AdminCard>
          <WorkflowTabs
            sections={[
              {
                title: 'Decision',
                content: (
                  <>
                    <ModerationActions
                      key={detail.record.reviewId + ':' + detail.record.version}
                      review={detail.record}
                      {...(reportId ? { reportId } : {})}
                    />
                  </>
                ),
              },
              {
                title: 'History',
                content: (
                  <>
                    <ReadState query={history} empty={history.rows.length === 0} />
                    {history.rows.map((row) => (
                      <AdminCard key={row.id}>
                        <AdminHeading>{sentence(row.action)}</AdminHeading>
                        <Fact icon={User}>
                          {row.reviewerName} · {pkTime(row.createdAt)}
                        </Fact>
                        <Copy>{row.reason}</Copy>
                      </AdminCard>
                    ))}
                    <Continuation query={history} />
                  </>
                ),
              },
            ]}
          />
        </>
      ) : null}
    </StaffPage>
  );
}
function ModerationActions({ review, reportId }: { review: ModerationReview; reportId?: string }) {
  const [action, setAction] = useState<'hide' | 'remove' | 'restore' | 'dismiss'>();
  const [reason, setReason] = useState('');
  const change = useAdminCommand(
    'Admin:moderation:' + review.reviewId,
    (c, input: z.infer<typeof reviewModerationInputSchema>, key) =>
      moderateReview(c, review.reviewId, input, key),
    false,
    'moderation',
  );
  const dismiss = useAdminCommand(
    'Admin:dismiss:' + (reportId ?? ''),
    (c, input: { reason: string }, key) => dismissReviewReport(c, reportId, input, key),
    false,
    'moderation',
  );
  const command = action === 'dismiss' ? dismiss : change;
  const locked = change.isPending || change.unresolved || dismiss.isPending || dismiss.unresolved;
  function choose(next: typeof action) {
    setAction(next);
    setReason('');
    change.reset();
    dismiss.reset();
  }
  function submit() {
    if (!action || !reason.trim() || locked) return;
    const onSuccess = () => {
      setAction(undefined);
      setReason('');
    };
    if (action === 'dismiss') dismiss.mutate({ reason: reason.trim() }, { onSuccess });
    else
      change.mutate(
        {
          action,
          expectedVersion: review.version,
          reason: reason.trim(),
          ...(reportId ? { reportId } : {}),
        },
        { onSuccess },
      );
  }
  const options = [
    review.status === 'published' && { key: 'hide', text: 'Hide', icon: EyeOff, tone: 'outline' },
    review.status !== 'removed' && { key: 'remove', text: 'Remove', icon: Trash2, tone: 'danger' },
    review.status !== 'published' && {
      key: 'restore',
      text: 'Restore',
      icon: RotateCcw,
      tone: 'solid',
    },
    reportId && { key: 'dismiss', text: 'Dismiss', icon: X, tone: 'outline' },
  ].filter(Boolean) as {
    key: NonNullable<typeof action>;
    text: string;
    icon: LucideIcon;
    tone: 'solid' | 'outline' | 'danger';
  }[];
  const selected = options.find((option) => option.key === action);
  return (
    <AdminCard>
      <NativeCommandRecovery command={change} />
      <NativeCommandRecovery command={dismiss} />
      {command.isError ? <Copy alert>{safeMessage(command.error)}</Copy> : null}
      {selected ? (
        <>
          <AdminField
            label="Moderation policy reason"
            value={reason}
            onChange={setReason}
            disabled={locked}
          />
          <ButtonRow>
            <ActionButton
              icon={X}
              text="Cancel"
              label="Cancel moderation decision"
              disabled={locked}
              onPress={() => setAction(undefined)}
            />
            <ActionButton
              icon={selected.icon}
              text={selected.text}
              label="Confirm moderation decision"
              tone={selected.tone === 'danger' ? 'danger' : 'solid'}
              disabled={locked || !reason.trim()}
              onPress={submit}
            />
          </ButtonRow>
        </>
      ) : (
        <ButtonRow>
          {options.map((option) => (
            <ActionButton
              key={option.key}
              icon={option.icon}
              text={option.text}
              label={option.key === 'dismiss' ? 'Dismiss report' : option.text + ' review'}
              tone={option.tone}
              disabled={locked}
              onPress={() => choose(option.key)}
            />
          ))}
        </ButtonRow>
      )}
    </AdminCard>
  );
}
