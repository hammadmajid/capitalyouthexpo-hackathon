import { useState } from 'react';
import { router } from 'expo-router';
import { listModerationReports, listModeratedReviews } from '@hsm/api-client';
import { moderationReportStatusSchema, moderationReviewStatusSchema } from '@hsm/contracts';
import { useStaffPages } from './staff-data';
import { Flag, Star } from 'lucide-react-native';
import { StaffPage, Choices, ReadState, Continuation, sentence } from './staff-ui';
import { RecordRow } from './admin-list';
// REV-006: queues hold policy reports and restoration candidates; never negativity alone.
function WorkflowSwitch({
  value,
  onChange,
}: {
  value: 'reports' | 'restoration';
  onChange: (value: 'reports' | 'restoration') => void;
}) {
  return (
    <Choices
      label="Moderation queue"
      values={['reports', 'restoration']}
      value={value}
      labels={{ reports: 'Reported', restoration: 'Restore' }}
      onChange={onChange}
    />
  );
}
export function ModerationQueue() {
  const [mode, setMode] = useState<'reports' | 'restoration'>('reports');
  return (
    <StaffPage title="Review moderation">
      <WorkflowSwitch value={mode} onChange={setMode} />
      {mode === 'reports' ? <ReportedReviews /> : <RestorationReviews />}
    </StaffPage>
  );
}
function ReportedReviews() {
  const [status, setStatus] = useState<'open' | 'investigating' | 'actioned' | 'dismissed'>('open');
  const list = useStaffPages(
    'moderation-reports',
    (c, cursor) =>
      listModerationReports(c, {
        reportStatus: status,
        limit: 20,
        ...(cursor ? { cursor } : {}),
      }),
    { status },
  );
  return (
    <>
      <Choices
        label="Report status"
        values={moderationReportStatusSchema.options}
        value={status}
        onChange={setStatus}
      />
      <ReadState query={list} empty={list.rows.length === 0} />
      {list.rows.map((row) => (
        <RecordRow
          key={row.reportId}
          icon={Flag}
          title={sentence(row.reason)}
          subtitle={row.details ?? undefined}
          body={row.reviewBody ?? 'Review text unavailable'}
          status={row.reviewStatus}
          label="Review reported content"
          onPress={() =>
            router.push({
              pathname: '/admin/moderation/[reviewId]',
              params: { reviewId: row.reviewId, reportId: row.reportId },
            })
          }
        />
      ))}
      <Continuation query={list} />
    </>
  );
}
function RestorationReviews() {
  const [status, setStatus] = useState<'published' | 'hidden' | 'removed'>('hidden');
  const list = useStaffPages(
    'moderation-discovery',
    (c, cursor) =>
      listModeratedReviews(c, {
        status,
        limit: 20,
        ...(cursor ? { cursor } : {}),
      }),
    { status },
  );
  return (
    <>
      <Choices
        label="Review publication status"
        values={moderationReviewStatusSchema.options}
        value={status}
        onChange={setStatus}
      />
      <ReadState query={list} empty={list.rows.length === 0} />
      {list.rows.map((row) => (
        <RecordRow
          key={row.reviewId}
          icon={Star}
          title={sentence(row.status) + ' review'}
          subtitle={row.moderationReason ?? undefined}
          body={row.body ?? 'Review text unavailable'}
          label="Review moderation history"
          onPress={() =>
            router.push({
              pathname: '/admin/moderation/[reviewId]',
              params: { reviewId: row.reviewId },
            })
          }
        />
      ))}
      <Continuation query={list} />
    </>
  );
}
