import { profileReviewQuerySchema } from '@hsm/contracts';
import { useState } from 'react';
import { listProfileReviews, type ProfileReviewKind } from '@hsm/api-client';
import { useSession } from '../providers';
import { useProfileReviewPages } from './profile-review-data';
import { NativeProfileReviewCase } from './profile-review-case';
import { IdCard, ImageIcon } from 'lucide-react-native';
import { Choices, Continuation, ReadState, StaffPage } from './staff-ui';
import { RecordRow, pkTime, shortId } from './admin-list';
import { NativePhotoSubjects } from './profile-photo-subjects';
export function NativeProfileReviewBoard({
  kind,
  own = false,
}: {
  kind: ProfileReviewKind;
  own?: boolean;
}) {
  const actorId = useSession().profile?.user.id ?? '';
  const [status, setStatus] = useState('pending'),
    [selected, setSelected] = useState<string>();
  const list = useProfileReviewPages(
    'queue',
    (c, cursor?: string) =>
      listProfileReviews(c, kind, { status, ...(cursor ? { cursor } : {}) }, own),
    { kind, status, own },
    own,
    profileReviewQuerySchema.shape.cursor,
  );
  return (
    <>
      <Choices
        label="Profile review status"
        values={[
          'pending',
          'approved',
          'rejected',
          'cancelled',
          ...(kind === 'profile_photo' ? ['withdrawn'] : []),
        ]}
        value={status}
        onChange={(value) => {
          setSelected(undefined);
          setStatus(value);
        }}
      />
      <ReadState query={list} empty={!list.rows.length} />
      {list.rows.map((row) => (
        <RecordRow
          key={row.id}
          icon={kind === 'identity' ? IdCard : ImageIcon}
          title={'Revision ' + row.version}
          subtitle={pkTime(row.submittedAt) + (own ? '' : ' · ' + shortId(row.userId))}
          status={row.status}
          label={'Review case ' + row.id}
          onPress={() => setSelected(row.id)}
        />
      ))}
      <Continuation query={list} />
      {selected ? (
        <NativeProfileReviewCase
          key={actorId + ':' + selected}
          id={selected}
          kind={kind}
          own={own}
          close={() => setSelected(undefined)}
        />
      ) : null}
      {!own && kind === 'profile_photo' ? <NativePhotoSubjects /> : null}
    </>
  );
}
export function AdminProfileReviews({ kind }: { kind: ProfileReviewKind }) {
  return (
    <StaffPage title={kind === 'identity' ? 'Identity reviews' : 'Photo reviews'}>
      <NativeProfileReviewBoard kind={kind} />
    </StaffPage>
  );
}
