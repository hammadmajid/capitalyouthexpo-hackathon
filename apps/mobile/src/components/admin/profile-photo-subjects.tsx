import { profileReviewQuerySchema } from '@hsm/contracts';
import { useState } from 'react';
import { flagProfilePhoto, listProfilePhotoSubjects } from '@hsm/api-client';
import { useProfileReviewPages } from './profile-review-data';
import { useAdminCommand } from './data';
import { AdminCard, AdminField, AdminHeading } from './ui';
import { Continuation, ReadState } from './staff-ui';
import { NativeCommandRecovery } from '../services/command-recovery';
import { Copy } from '../ui';
import { Flag, User, X } from 'lucide-react-native';
import { ActionButton, ButtonRow, Fact, shortId } from './admin-list';
import { safeMessage } from '../../lib/messages';
export function NativePhotoSubjects() {
  const list = useProfileReviewPages(
    'photo-subjects',
    (c, cursor?: string) => listProfilePhotoSubjects(c, cursor ? { cursor } : {}),
    {},
    false,
    profileReviewQuerySchema.shape.cursor,
  );
  return (
    <AdminCard>
      <AdminHeading>Current profile photos</AdminHeading>
      <ReadState query={list} empty={!list.rows.length} />
      {list.rows.map((row) => (
        <PhotoCase key={row.userId + row.fileId} userId={row.userId} fileId={row.fileId} />
      ))}
      <Continuation query={list} />
    </AdminCard>
  );
}
function PhotoCase({ userId, fileId }: { userId: string; fileId: string }) {
  const [reason, setReason] = useState(''),
    [confirm, setConfirm] = useState(false);
  const command = useAdminCommand(
    'flag-profile-photo:' + userId,
    (c, input: { fileId: string; reason: string }, key) => flagProfilePhoto(c, userId, input, key),
    false,
    'photo_reviews',
  );
  const locked = command.isPending || command.unresolved;
  return (
    <AdminCard>
      <Fact icon={User}>{shortId(userId)}</Fact>
      <NativeCommandRecovery command={command} />
      {command.error ? <Copy alert>{safeMessage(command.error)}</Copy> : null}
      {command.isSuccess ? <Copy>Case created. Pending queue updated.</Copy> : null}
      <AdminField
        label={'Moderation case reason for ' + userId}
        value={reason}
        onChange={setReason}
        maxLength={500}
        multiline
        disabled={locked || confirm}
      />
      {confirm ? (
        <>
          <ButtonRow>
            <ActionButton
              icon={X}
              text="Cancel"
              label="Cancel photo case"
              disabled={locked}
              onPress={() => setConfirm(false)}
            />
            <ActionButton
              icon={Flag}
              text="Open case"
              label="Confirm photo case"
              tone="solid"
              disabled={locked}
              onPress={() =>
                command.mutate({ fileId, reason }, { onSuccess: () => setConfirm(false) })
              }
            />
          </ButtonRow>
        </>
      ) : (
        <ActionButton
          icon={Flag}
          text="Flag photo"
          label="Review photo case"
          disabled={locked || reason.trim().length < 8}
          onPress={() => setConfirm(true)}
        />
      )}
    </AdminCard>
  );
}
