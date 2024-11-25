'use client';
import type { ProfileDetails } from '@hsm/contracts';
import { useProfileDetails } from '../use-profile-details';
import { Button } from '../ui/button';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { completeOwnerProfile } from '../../lib/owner-profile';
import { browserClient } from '../../lib/client';
import { useSession } from '../providers';
import { OwnPhoto } from '../customer/own-photo';
import { PrivateFileInput } from '../private-file-input';
import { FlowForm, type Field } from './flow-form';
const fields: readonly Field[] = [
  { name: 'fullName', label: 'Full name', autoComplete: 'name' },
  { name: 'phone', label: 'Mobile number', type: 'tel', autoComplete: 'tel' },
  { name: 'cnic', label: 'CNIC number', autoComplete: 'off' },
  { name: 'address', label: 'Owner address', autoComplete: 'street-address' },
  { name: 'organizationName', label: 'Organization name (optional)' },
];
export function OwnerProfileForm() {
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
  if (!query.data) return <p role="status">Loading your saved profile…</p>;
  return <OwnerProfileFormEditor key={identity.id} details={query.data} />;
}
function OwnerProfileFormEditor({ details }: { details: ProfileDetails }) {
  const router = useRouter(),
    cache = useQueryClient();
  const reviewedPhotos = useSession().data?.features?.profileReviews === true;
  const [front, setFront] = useState<string | undefined>(
      details.owner?.cnicFrontFileId ?? undefined,
    ),
    [back, setBack] = useState<string | undefined>(details.owner?.cnicBackFileId ?? undefined);
  const [uploading, setUploading] = useState<Record<string, boolean>>({});
  const busy = Object.values(uploading).some(Boolean);
  const [photo, setPhoto] = useState<string | undefined>(details.profilePhotoFileId ?? undefined),
    [accepted, setAccepted] = useState(false);
  async function submit(input: Record<string, string>) {
    const profile = await completeOwnerProfile(browserClient(), {
      fullName: input.fullName,
      phone: input.phone,
      cnic: input.cnic,
      address: input.address,
      cnicFrontFileId: front,
      cnicBackFileId: back,
      agreementAccepted: accepted,
      agreementVersion: 'owner-foundation-v1',
      ...(input.organizationName?.trim() ? { organizationName: input.organizationName } : {}),
      ...(photo ? { profilePhotoFileId: photo } : {}),
    });
    cache.clear();
    cache.setQueryData(['session'], profile);
    router.replace('/app/owner');
  }
  return (
    <section className="max-w-xl space-y-6 rounded-panel border border-hsm-border bg-hsm-surface p-6">
      <h2 className="text-2xl font-bold text-hsm-heading">Complete your Owner profile</h2>
      <p>{details.email}</p>
      <p>
        Use your existing identity name. Your mobile number is a contact and sign-in identifier;
        email verification does not verify phone ownership.
      </p>
      <p>
        Re-enter your CNIC to save changes. Saved private evidence is retained unless you choose a
        replacement.
      </p>
      {details.cnicLast4 ? <p>CNIC ending in {details.cnicLast4}</p> : null}
      <PrivateFileInput
        id="cnic-front"
        label="CNIC front"
        purpose="verification_document"
        onReady={setFront}
        onBusy={(value) => setUploading((previous) => ({ ...previous, front: value }))}
      />
      <PrivateFileInput
        id="cnic-back"
        label="CNIC back"
        purpose="verification_document"
        onReady={setBack}
        onBusy={(value) => setUploading((previous) => ({ ...previous, back: value }))}
      />
      <OwnPhoto userId={details.userId} fileId={details.profilePhotoFileId} />
      {reviewedPhotos ? (
        <p>Profile photos are reviewed from your Account profile-review workspace.</p>
      ) : (
        <PrivateFileInput
          id="owner-photo"
          label="Profile photo (optional)"
          purpose="avatar"
          onReady={setPhoto}
          onBusy={(value) => setUploading((previous) => ({ ...previous, photo: value }))}
        />
      )}
      <div className="space-y-3 rounded-card border border-hsm-border p-4">
        <h3 className="font-semibold">Owner foundation agreement — version owner-foundation-v1</h3>
        <p>
          I confirm that I am authorized to represent this hostel and that the identity and property
          details I provide are accurate. Documents are private verification evidence. Submission is
          subject to platform review and does not approve or publish a hostel. Residents pay the
          hostel directly; the platform does not hold rent or deposits.
        </p>
        <label className="flex items-start gap-3">
          <input
            type="checkbox"
            checked={accepted}
            onChange={(event) => setAccepted(event.target.checked)}
          />
          I accept this Owner agreement.
        </label>
      </div>
      <p className="text-sm">Both CNIC sides must finish their security scans before saving.</p>
      <FlowForm
        initialValues={{
          fullName: details.fullName,
          phone: details.phone ?? '',
          cnic: '',
          address: details.owner?.address ?? '',
          organizationName: '',
        }}
        disabled={busy}
        fields={fields}
        submit={submit}
        label="Save Owner profile"
      />
    </section>
  );
}
