import { Skeleton } from './loading/skeleton';
import type { ProfileDetails } from '@hsm/contracts';
import { useProfileDetails } from './use-profile-details';
import { useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { Pencil } from 'lucide-react-native';
import { useQueryClient } from '@tanstack/react-query';
import { OwnerProfileSummary } from './owner-profile-summary';
import { router } from 'expo-router';
import { ClientFailure } from '@hsm/api-client';
import { mobileOwnerColors as c, ownerMetrics as m } from '@hsm/ui';
import { completeOwnerProfile } from '../lib/owner-profile';
import { ownerProfileError } from '../lib/owner-profile-error';
import { clearOwnerPhotoDraft } from '../lib/owner-photo-draft';
import { client } from '../lib/runtime';
import { useSession } from './providers';
import { FlowForm, type Field } from './flow-form';
import { OwnerProfilePhoto } from './owner-profile-photo';
import {
  OwnerProfileInput,
  OwnerProfileShell,
  OwnerProfileValidation,
  OwnerSaveButton,
} from './owner-profile-ui';
import { OwnerScreen } from './owner-screen';
import {
  FieldLabel,
  SetupButton,
  SetupCard,
  SetupHeading,
  StatusChip,
  SetupText,
} from './owner-wizard-ui';
const fields: readonly Field[] = [
  { name: 'fullName', label: 'Full name' },
  {
    name: 'phone',
    label: 'Mobile number',
    keyboard: 'phone-pad',
    maxLength: 14,
  },
  { name: 'address', label: 'Owner address' },
  {
    name: 'cnic',
    numberFormat: 'plain',
    label: 'CNIC number',
    keyboard: 'number-pad',
    hint: 'Re-enter 13 digits to confirm identity.',
    maxLength: 13,
  },
  { name: 'organizationName', label: 'Organization name' },
];
function leave() {
  if (router.canGoBack()) router.back();
  else router.replace('/account');
}
function Message({ title, text, action }: { title: string; text: string; action?: ReactNode }) {
  return (
    <OwnerScreen back={leave} title={title}>
      <SetupCard>
        <SetupText>{text}</SetupText>
        {action}
      </SetupCard>
    </OwnerScreen>
  );
}
export function OwnerProfileFlow() {
  const session = useSession();
  const identity = session.profile?.user;
  const query = useProfileDetails(identity?.id, Boolean(identity?.emailVerified));
  if (!identity?.emailVerified)
    return (
      <Message
        title="Verify your email"
        text="A verified email is required to complete this profile."
      />
    );
  if (query.isError)
    return (
      <Message
        title="Profile unavailable"
        text="Unable to load your profile. Pull down to try again."
      />
    );
  if (!query.data) return <Skeleton kind="form" label="Loading saved profile" />;
  return <OwnerProfileFlowEditor key={identity.id} details={query.data} />;
}
// OWN-001: evidence is retained; only its onboarding presentation moves.
function OwnerProfileFlowEditor({ details }: { details: ProfileDetails }) {
  const session = useSession();
  const cache = useQueryClient();
  const [editing, setEditing] = useState(!details.owner?.completed);
  const [revision, setRevision] = useState(0);
  const [photo, setPhoto] = useState<string | null | undefined>(
    details.profilePhotoFileId ?? undefined,
  );
  const [accepted, setAccepted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [invalid, setInvalid] = useState(false);
  const [uploading, setUploading] = useState<Record<string, boolean>>({});
  const busy = Object.values(uploading).some(Boolean);
  const completed = Boolean(details.owner?.completed);
  const profile = session.profile;
  if (!profile?.user.emailVerified)
    return (
      <Message
        title="Verify your email"
        text="A verified email is required to complete this profile."
      />
    );
  function uploadingFile(key: string, value: boolean) {
    setUploading((previous) => ({ ...previous, [key]: value }));
  }
  async function submit(input: Record<string, string>) {
    setInvalid(true);
    if (!/^\d{13}$/.test((input.cnic ?? '').replace(/-/g, '')))
      return 'Enter your 13-digit CNIC number to save changes.';
    if (!accepted) return 'Accept the Owner agreement to save.';
    const saved = await completeOwnerProfile(client, {
      fullName: input.fullName,
      phone: input.phone,
      cnic: input.cnic,
      address: input.address,
      agreementAccepted: accepted,
      agreementVersion: 'owner-foundation-v1',
      ...(input.organizationName?.trim() ? { organizationName: input.organizationName } : {}),
      // CHG-031: profile photos save directly; there is no photo moderation queue.
      ...(photo !== undefined ? { profilePhotoFileId: photo } : {}),
    });
    const fresh = await session.refetch();
    if (!fresh || fresh.user.id !== saved.user.id || !fresh.capabilities.owner)
      throw new ClientFailure('INVALID_RESPONSE');
    if (photo) await clearOwnerPhotoDraft(saved.user.id);
    await cache.invalidateQueries({ queryKey: ['private-profile-details', saved.user.id] });
    if (completed) {
      setEditing(false);
      setAccepted(false);
      setInvalid(false);
    } else router.replace('/owner');
    return '';
  }
  return (
    <OwnerProfileShell
      back={leave}
      busy={busy || saving}
      actions={
        completed && !editing ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Edit Owner profile"
            onPress={() => setEditing(true)}
            style={{
              width: m.touch,
              height: m.touch,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Pencil size={m.stepIcon} color={c.primary} />
          </Pressable>
        ) : undefined
      }
    >
      <OwnerProfilePhoto
        userId={profile.user.id}
        saved={details.profilePhotoFileId}
        value={photo}
        onChange={setPhoto}
        reviews={false}
        onBusy={(value) => uploadingFile('photo', value)}
        disabled={saving}
        editable={editing}
      />
      <View style={styles.identity}>
        <Text className="font-heading" style={styles.name}>
          {details.fullName || profile.user.fullName || 'Your profile'}
        </Text>
        {/* While editing, the CNIC on file is shown masked because the form asks for it again. */}
        {editing && details.cnicLast4 ? (
          <StatusChip label={'CNIC ending in ' + details.cnicLast4} />
        ) : null}
      </View>
      {!editing ? (
        <OwnerProfileSummary details={details} />
      ) : (
        <SetupCard>
          <SetupHeading>Personal details</SetupHeading>
          <OwnerProfileValidation.Provider value={{ submitted: invalid, photoBusy: busy }}>
            <FlowForm
              key={revision}
              Action={OwnerSaveButton}
              Label={FieldLabel}
              Input={OwnerProfileInput}
              formatError={ownerProfileError}
              initialValues={{
                fullName: details.fullName,
                phone: details.phone ?? '',
                cnic: '',
                address: details.owner?.address ?? '',
                organizationName: '',
              }}
              resetAfterSubmit={false}
              onSubmittingChange={setSaving}
              fields={
                completed
                  ? fields
                      .filter((field) => field.name !== 'organizationName')
                      .map((field) => ({
                        ...field,
                        ...(field.name === 'fullName'
                          ? { readOnly: true, hint: 'Identity changes require review in Account.' }
                          : {}),
                      }))
                  : fields
              }
              label="Save Owner profile"
              submit={submit}
              extra={(_values, _set, locked) => (
                <View style={styles.extra}>
                  <View style={styles.agreement}>
                    <SetupHeading>Owner agreement</SetupHeading>
                    <SetupText>
                      I am authorized to represent this hostel and confirm my details are accurate.
                      Private evidence is subject to review; submission does not approve or publish
                      a hostel. Residents pay the hostel directly. HSM holds no rent or deposits.
                    </SetupText>
                    <View style={styles.accept}>
                      <View style={styles.grow}>
                        <FieldLabel>I accept this agreement</FieldLabel>
                      </View>
                      <Switch
                        accessibilityLabel="I accept this Owner agreement."
                        value={accepted}
                        onValueChange={setAccepted}
                        disabled={locked}
                        trackColor={{ true: c.primary, false: c.border }}
                      />
                    </View>
                  </View>
                </View>
              )}
            />
          </OwnerProfileValidation.Provider>
          {completed ? (
            <SetupButton
              label="Cancel"
              secondary
              disabled={busy || saving}
              onPress={() => {
                setEditing(false);
                setAccepted(false);
                setInvalid(false);
                setRevision((value) => value + 1);
                setPhoto(details.profilePhotoFileId ?? undefined);
              }}
            />
          ) : null}
        </SetupCard>
      )}
    </OwnerProfileShell>
  );
}
const styles = StyleSheet.create({
  identity: { alignItems: 'center', gap: m.smallGap },
  name: { color: c.heading, fontSize: m.title },
  grow: { flex: 1 },
  extra: { gap: m.section },
  agreement: { gap: m.smallGap, borderTopWidth: 1, borderTopColor: c.border, paddingTop: m.gap },
  accept: { flexDirection: 'row', alignItems: 'center', gap: m.gap, minHeight: m.touch },
});
