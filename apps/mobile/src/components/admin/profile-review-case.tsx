import { profileReviewHistoryQuerySchema } from '@hsm/contracts';
import { useState } from 'react';
import { Linking } from 'react-native';
import {
  accessProfileReview,
  accessProfileReviewEvidence,
  decideProfileReview,
  readProfileReviewHistory,
  type ProfileReviewKind,
} from '@hsm/api-client';
import { useProfileReviewPages, useProfileReviewSensitive } from './profile-review-data';
import { useAdminData } from './data';
import { useNativeCommand } from '../services/use-command';
import { NativeCommandRecovery } from '../services/command-recovery';
import { moduleAllowed } from '../../lib/admin-modules';
import { AdminCard, AdminField, AdminHeading } from './ui';
import { Continuation, ReadState, sentence } from './staff-ui';
import { Copy } from '../ui';
import {
  Check,
  Clock,
  ExternalLink,
  Eye,
  FileText,
  Info,
  Lock,
  Paperclip,
  Undo2,
  X,
} from 'lucide-react-native';
import { StatusBadge } from './management-ui';
import { ActionButton, ButtonRow, Fact, pkTime, shortId } from './admin-list';
import { safeMessage } from '../../lib/messages';
export function NativeProfileReviewCase({
  id,
  kind,
  own = false,
  close,
}: {
  id: string;
  kind: ProfileReviewKind;
  own?: boolean;
  close: () => void;
}) {
  const data = useAdminData();
  const [openingError, setOpeningError] = useState(false);
  const [purpose, setPurpose] = useState(''),
    [reason, setReason] = useState(''),
    [action, setAction] = useState<string>();
  const access = useProfileReviewSensitive(kind, own, (c, justification: string) =>
    accessProfileReview(c, kind, id, { justification }, own),
  );
  const evidence = useProfileReviewSensitive(
    kind,
    own,
    (c, input: { fileId: string; justification: string }) =>
      accessProfileReviewEvidence(
        c,
        kind,
        id,
        input.fileId,
        { justification: input.justification },
        own,
      ),
  );
  const history = useProfileReviewPages(
    'history',
    (c, cursor?: number) =>
      readProfileReviewHistory(c, kind, id, { ...(cursor ? { cursor } : {}) }, own),
    { id, kind },
    own,
    profileReviewHistoryQuerySchema.shape.cursor,
  );
  const command = useNativeCommand(
    'profile-review:' + kind + ':' + id + ':' + own,
    data.actorId,
    async (client, input: unknown, key) => {
      const fresh = await data.session.refetch();
      if (
        fresh?.user.id !== data.actorId ||
        (!own && !moduleAllowed(fresh, kind === 'identity' ? 'identity_reviews' : 'photo_reviews'))
      )
        throw new Error('Review authority unavailable');
      return decideProfileReview(client, kind, id, input, key, own);
    },
    [data.key],
  );
  const locked = command.isPending || command.unresolved,
    detail = access.isPending || access.isError ? undefined : access.data;
  const actions = !detail
    ? []
    : own
      ? detail.review.status === 'pending' &&
        !(kind === 'profile_photo' && detail.previousPhotoFileId === detail.proposedPhotoFileId)
        ? ['cancel']
        : []
      : detail.review.status === 'pending'
        ? ['approve', 'reject']
        : kind === 'profile_photo' && detail.review.status === 'approved' && detail.currentPhoto
          ? ['withdraw']
          : [];
  return (
    <AdminCard>
      <NativeCommandRecovery command={command} />
      {command.error ? <Copy alert>{safeMessage(command.error)}</Copy> : null}
      {command.isSuccess ? <Copy>Decision recorded. Queue updated.</Copy> : null}
      <AdminHeading>
        Private {kind === 'identity' ? 'identity correction' : 'photo'} case
      </AdminHeading>
      <Fact icon={Lock}>Audited access · case {shortId(id)}</Fact>
      <AdminField
        label="Profile review access purpose"
        value={purpose}
        onChange={setPurpose}
        maxLength={500}
      />
      <ActionButton
        icon={Eye}
        text="View details"
        label="Access private review details"
        tone="solid"
        disabled={access.isPending || purpose.trim().length < 8 || command.isPending}
        onPress={() => {
          evidence.reset();
          access.mutate(purpose);
        }}
      />
      {access.isError ? <Copy alert>{safeMessage(access.error)}</Copy> : null}
      {detail ? (
        <>
          <StatusBadge value={detail.review.status} />
          <Fact icon={FileText}>
            Revision {detail.review.version} · {detail.reason}
          </Fact>
          {kind === 'identity' ? (
            <>
              <Copy>Previous name: {detail.previousFullName ?? 'Unavailable'}</Copy>
              <Copy>Requested name: {detail.proposedFullName ?? 'Unchanged'}</Copy>
              <Copy>Previous CNIC ending: {detail.previousCnicLast4 ?? 'Unavailable'}</Copy>
              <Copy>
                Requested CNIC:{' '}
                {detail.proposedCnic
                  ? own
                    ? 'Ending ' + detail.proposedCnic.slice(-4)
                    : detail.proposedCnic
                  : 'Unchanged'}
              </Copy>
            </>
          ) : (
            <Copy>
              {detail.currentPhoto ? 'Current profile photo' : 'Photo is not currently displayed'}
            </Copy>
          )}
          <ButtonRow>
            {detail.evidenceFileIds.map((fileId, index) => (
              <ActionButton
                key={fileId}
                icon={Paperclip}
                text={'Evidence ' + (index + 1)}
                label={'Access evidence ' + (index + 1)}
                disabled={evidence.isPending || purpose.trim().length < 8}
                onPress={() => evidence.mutate({ fileId, justification: purpose })}
              />
            ))}
          </ButtonRow>
          {evidence.isError ? <Copy alert>{safeMessage(evidence.error)}</Copy> : null}
          {evidence.data && !evidence.isError && !evidence.isPending ? (
            <ActionButton
              icon={ExternalLink}
              text="Open"
              label="Open authorized review evidence"
              tone="solid"
              onPress={() => {
                const url = evidence.data.url;
                evidence.reset();
                access.reset();
                setOpeningError(false);
                void Linking.openURL(url).catch(() => setOpeningError(true));
              }}
            />
          ) : null}
          {actions.length ? (
            <>
              <AdminField
                label="Profile review decision reason"
                value={reason}
                onChange={setReason}
                maxLength={500}
                disabled={locked || Boolean(action)}
                multiline
              />
              {action ? (
                <>
                  {action === 'approve' && kind === 'identity' ? (
                    <Fact icon={Info}>Requires a fresh login.</Fact>
                  ) : null}
                  <ButtonRow>
                    <ActionButton
                      icon={X}
                      text="Back"
                      label="Revise profile review decision"
                      disabled={locked}
                      onPress={() => setAction(undefined)}
                    />
                    <ActionButton
                      icon={Check}
                      text={'Confirm ' + sentence(action).toLowerCase()}
                      label="Confirm profile review decision"
                      tone={action === 'reject' ? 'danger' : 'solid'}
                      disabled={locked}
                      onPress={() =>
                        command.mutate(
                          {
                            ...(own ? {} : { action }),
                            expectedVersion: detail.review.version,
                            reason,
                          },
                          { onSuccess: close },
                        )
                      }
                    />
                  </ButtonRow>
                </>
              ) : (
                <ButtonRow>
                  {actions.map((value) => (
                    <ActionButton
                      key={value}
                      icon={value === 'reject' ? X : value === 'approve' ? Check : Undo2}
                      text={sentence(value)}
                      label={value + ' profile review'}
                      tone={
                        value === 'reject' ? 'danger' : value === 'approve' ? 'solid' : 'outline'
                      }
                      disabled={locked || reason.trim().length < 8}
                      onPress={() => setAction(value)}
                    />
                  ))}
                </ButtonRow>
              )}
            </>
          ) : null}
        </>
      ) : null}
      {openingError ? (
        <Copy alert>Unable to open evidence. Request a fresh authorized link and retry.</Copy>
      ) : null}
      <AdminHeading>Decision history</AdminHeading>
      <ReadState query={history} empty={!history.rows.length} />
      {history.rows.map((row) => (
        <Fact key={row.version} icon={Clock}>
          {'Rev ' +
            row.version +
            ' · ' +
            sentence(row.action) +
            ' · ' +
            shortId(row.actorId) +
            ' · ' +
            pkTime(row.createdAt) +
            (row.reason ? ' · ' + row.reason : '')}
        </Fact>
      ))}
      <Continuation query={history} />
      <ActionButton
        icon={X}
        text="Close"
        label="Close private review"
        disabled={command.isPending}
        onPress={close}
      />
    </AdminCard>
  );
}
