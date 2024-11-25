'use client';
import type { ProfileDetails } from '@hsm/contracts';
import { useProfileDetails } from '../use-profile-details';
import { Button } from '../ui/button';

import { useState } from 'react';
import { OwnPhoto } from '../customer/own-photo';
import { PrivateFileInput } from '../private-file-input';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { completeCustomerProfile } from '../../lib/customer-profile';
import { browserClient } from '../../lib/client';
import { loginDestination, safeReturnPath } from '../../lib/return-path';
import { useSession } from '../providers';
import { FlowForm, type Field } from './flow-form';
const fields: readonly Field[] = [
  { name: 'fullName', label: 'Full name', autoComplete: 'name' },
  { name: 'phone', label: 'Mobile number', type: 'tel', autoComplete: 'tel' },
  { name: 'age', label: 'Age (18 or older)', type: 'number' },
  {
    name: 'gender',
    label: 'Gender',
    options: [
      { value: '', label: 'Choose gender' },
      { value: 'male', label: 'Male' },
      { value: 'female', label: 'Female' },
    ],
  },
  { name: 'institution', label: 'Institution (optional)' },
];
export function CustomerProfileForm({ returnPath }: { returnPath?: string | undefined } = {}) {
  const session = useSession();
  const identity = session.data?.user;
  const query = useProfileDetails(identity?.id, Boolean(identity?.emailVerified));
  if (!identity?.emailVerified)
    return <p role="alert">A verified email is required to complete this profile.</p>;
  if (query.isError)
    return (
      <div role="alert">
        <p>Unable to load your profile. Please try again.</p>
        <Button
          type="button"
          onClick={() => {
            void query.refetch();
          }}
        >
          Retry profile
        </Button>
      </div>
    );
  if (!query.data)
    return (
      <div
        role="status"
        aria-label="Loading your saved profile"
        className="customer-skeleton h-72"
      />
    );
  return (
    <CustomerProfileFormEditor key={identity.id} details={query.data} returnPath={returnPath} />
  );
}
function CustomerProfileFormEditor({
  details,
  returnPath,
}: {
  details: ProfileDetails;
  returnPath?: string | undefined;
}) {
  const reviewedPhotos = useSession().data?.features?.profileReviews === true;
  const [photo, setPhoto] = useState<string | undefined>(details.profilePhotoFileId ?? undefined);
  const [uploading, setUploading] = useState(false);
  const router = useRouter(),
    cache = useQueryClient();
  async function submit(input: Record<string, string>) {
    const profile = await completeCustomerProfile(browserClient(), {
      ...input,
      ...(photo ? { profilePhotoFileId: photo } : {}),
    });
    cache.clear();
    cache.setQueryData(['session'], profile);
    router.replace(loginDestination(safeReturnPath(returnPath) ?? '/app/customer', profile));
  }
  return (
    <section className="customer-frost max-w-xl space-y-4 p-4 sm:p-6">
      <h2 className="text-2xl font-bold text-hsm-heading">Customer profile</h2>
      <p>{details.email}</p>
      <p>
        Your mobile number is a contact and sign-in identifier. It is not verified by email
        verification.
      </p>
      <OwnPhoto userId={details.userId} fileId={details.profilePhotoFileId} />
      {reviewedPhotos ? (
        <p>Profile photos are reviewed from your Account profile-review workspace.</p>
      ) : (
        <PrivateFileInput
          id="customer-photo"
          label="Profile photo (optional)"
          purpose="avatar"
          onReady={setPhoto}
          onBusy={setUploading}
        />
      )}
      <FlowForm
        initialValues={{
          fullName: details.fullName,
          phone: details.phone ?? '',
          age: details.customer?.age?.toString() ?? '',
          gender: details.gender ?? '',
          institution: details.customer?.institution ?? '',
        }}
        disabled={uploading}
        fields={fields}
        label="Save Customer profile"
        submit={submit}
      />
    </section>
  );
}
