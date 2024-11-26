import { rememberMode } from '../lib/owner-mode';
import { customerProfileError } from '../lib/customer-profile-error';
import {
  CustomerProfileScreen,
  CustomerProfileInput,
  CustomerProfileChoice,
  CustomerProfileSubmit,
  CustomerProfileSummary,
  CustomerProfileEmail,
  CustomerProfileInformation,
  CustomerProfilePhoto,
  CustomerPhotoAction,
} from './customer-profile-ui';
import { Skeleton } from './loading/skeleton';
import type { ProfileDetails } from '@hsm/contracts';
import { useProfileDetails } from './use-profile-details';
import { useCallback, useState } from 'react';
import { PrivateFilePicker } from './private-file-picker';
import { router } from 'expo-router';
import { canAssociateEmail, ClientFailure } from '@hsm/api-client';
import { EmailAssociation } from './email-association';
import { completeCustomerProfile } from '../lib/customer-profile';
import { client } from '../lib/runtime';
import { useSession } from './providers';
import { FlowForm, type Field } from './flow-form';
import { Page } from './frame';
import { Button, Copy } from './ui';
const fields: readonly Field[] = [
  { name: 'fullName', label: 'Full name' },
  { name: 'phone', label: 'Mobile number', keyboard: 'phone-pad' },
  { name: 'age', label: 'Age (18 or older)', keyboard: 'number-pad' },
  { name: 'gender', label: 'Gender', options: ['male', 'female'] },
  { name: 'institution', label: 'Institution (optional)' },
];
// MGRD: a Manager reaches this step only from manager activation; the profile is required,
// so Back signs out to the login screen (signing in again resumes here).
function useLeaveAsManager() {
  const { logout } = useSession();
  return () => {
    void logout().finally(() => router.replace('/'));
  };
}
export function CustomerProfileFlow({
  fromAccount = false,
  forManager = false,
}: {
  fromAccount?: boolean;
  // MGRD: a Manager's first open completes this profile, then returns to /manager.
  forManager?: boolean;
} = {}) {
  const session = useSession();
  const leaveAsManager = useLeaveAsManager();
  const identity = session.profile?.user;
  const query = useProfileDetails(identity?.id, Boolean(identity?.emailVerified));
  if (!identity?.emailVerified)
    return (
      <Page
        backTo="/account"
        {...(forManager ? { onBack: leaveAsManager } : {})}
        title="Verify your email"
      >
        {session.profile && canAssociateEmail(session.profile) ? (
          // AUTH-M: a phone-activated Manager adds and verifies an email here first.
          <EmailAssociation
            userId={identity?.id ?? ''}
            onVerified={async (verified) => {
              const fresh = await session.refetch();
              if (fresh?.user.id !== verified.user.id || !fresh.user.emailVerified)
                throw new ClientFailure('INVALID_RESPONSE');
            }}
          />
        ) : (
          <Copy>A verified email is required to complete this profile.</Copy>
        )}
      </Page>
    );
  if (query.isError)
    return (
      <Page backTo="/account" title="Customer profile">
        <Copy>Unable to load your profile. Please try again.</Copy>
      </Page>
    );
  if (!query.data)
    return (
      <Page backTo="/account" title="Customer profile">
        <Skeleton kind="form" label="Loading your saved profile…" />
      </Page>
    );
  return (
    <CustomerProfileFlowEditor
      key={identity.id}
      details={query.data}
      fromAccount={fromAccount}
      forManager={forManager}
      reload={async () => {
        await query.refetch();
      }}
    />
  );
}
function CustomerProfileFlowEditor({
  details,
  fromAccount,
  forManager,
  reload,
}: {
  details: ProfileDetails;
  fromAccount: boolean;
  forManager: boolean;
  reload: () => Promise<void>;
}) {
  const session = useSession();
  const leaveAsManager = useLeaveAsManager();
  const [editing, setEditing] = useState(!details.customer?.completed);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  if (!session.profile?.user.emailVerified)
    return (
      <Page backTo="/account" title="Verify your email">
        <Copy>A verified email is required to complete this profile.</Copy>
      </Page>
    );
  async function submit(input: Record<string, string>, photo: string | null | undefined) {
    const fresh = await completeCustomerProfile(
      { client, refetch: session.refetch },
      {
        ...input,
        ...(photo !== undefined ? { profilePhotoFileId: photo } : {}),
      },
    );
    if (forManager && !details.customer?.completed) {
      router.replace('/manager');
      return;
    }
    if (!fromAccount && !details.customer?.completed) {
      await rememberMode(fresh.user.id, 'customer');
      router.replace('/marketplace');
      return;
    }
    await reload();
    setSaved(true);
    setSaving(false);
    setEditing(false);
  }
  return (
    <CustomerProfileScreen
      busy={saving}
      {...(forManager ? { onBack: leaveAsManager, title: 'Your profile' } : {})}
      {...(!editing
        ? {
            edit: () => {
              setSaved(false);
              setEditing(true);
            },
          }
        : {})}
    >
      {editing ? (
        <CustomerProfileForm
          details={details}
          email={session.profile.user.email}
          setBusy={setSaving}
          submit={submit}
        />
      ) : (
        <>
          <CustomerProfilePhoto
            userId={details.userId}
            fileId={details.profilePhotoFileId ?? undefined}
          />
          <CustomerProfileInformation>
            <CustomerProfileSummary details={details} saved={saved} />
            <CustomerProfileEmail email={session.profile.user.email} />
          </CustomerProfileInformation>
        </>
      )}
    </CustomerProfileScreen>
  );
}

function CustomerProfileForm({
  details,
  email,
  setBusy,
  submit,
}: {
  details: ProfileDetails;
  email: string | null;
  setBusy: (value: boolean) => void;
  submit: (input: Record<string, string>, photo: string | null | undefined) => Promise<void>;
}) {
  const [photo, setPhoto] = useState<string | null | undefined>(
    details.profilePhotoFileId ?? undefined,
  );
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const photoBusy = useCallback(
    (value: boolean) => {
      setUploading(value);
      setBusy(value || submitting);
    },
    [setBusy, submitting],
  );
  return (
    <>
      <CustomerProfilePhoto userId={details.userId} fileId={photo ?? undefined}>
        <PrivateFilePicker
          label="profile photo"
          fileId={photo ?? undefined}
          preview={false}
          overlay
          purpose="avatar"
          actorId={details.userId}
          hideLabel
          hideHint
          Action={CustomerPhotoAction}
          disabled={submitting}
          onReady={(id) => setPhoto(id ?? null)}
          onBusy={photoBusy}
        />
      </CustomerProfilePhoto>
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
        extra={(values, set, disabled) => {
          const nameChanged = details.fullName && values.fullName?.trim() !== details.fullName;
          const genderChanged = details.gender && values.gender !== details.gender;
          if (!nameChanged && !genderChanged) return null;
          return (
            <Button
              secondary
              label={
                nameChanged && genderChanged
                  ? 'Use saved name and gender'
                  : nameChanged
                    ? 'Use saved name'
                    : 'Use saved gender'
              }
              disabled={disabled}
              onPress={() => {
                if (nameChanged) set('fullName', details.fullName);
                if (genderChanged) set('gender', details.gender ?? '');
              }}
            />
          );
        }}
        wrapFields={(inputs) => (
          <CustomerProfileInformation>
            {details.fullName || details.gender ? (
              <Copy>Changes to your saved name or gender require identity review.</Copy>
            ) : null}
            {inputs}
            <CustomerProfileEmail email={email} />
          </CustomerProfileInformation>
        )}
        Input={CustomerProfileInput}
        Choice={CustomerProfileChoice}
        Action={CustomerProfileSubmit}
        formatError={customerProfileError}
        onSubmittingChange={(value) => {
          setSubmitting(value);
          setBusy(value || uploading);
        }}
        resetAfterSubmit={false}
        label="Save Customer profile"
        submit={(input) => submit(input, photo)}
      />
    </>
  );
}
