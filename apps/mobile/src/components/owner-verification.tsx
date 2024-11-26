import type { ComponentProps } from 'react';
import { CircleCheck, IdCard, ShieldCheck, type LucideIcon } from 'lucide-react-native';
import { mobileColors as colors } from '@hsm/ui';
import { IconHead } from './owner-icon-head';
import { useState } from 'react';
import { Pressable, Switch, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import type { ProfileDetails } from '@hsm/contracts';
import { completeOwnerProfile } from '../lib/owner-profile';
import { ownerProfileError } from '../lib/owner-profile-error';
import { client } from '../lib/runtime';
import { useSession } from './providers';
import { useProfileDetails } from './use-profile-details';
import { OwnerProfileShell, OwnerProfileInput } from './owner-profile-ui';
import { FlowForm } from './flow-form';
import { PrivateFilePicker } from './private-file-picker';
import { Skeleton } from './loading/skeleton';
import { FieldLabel, SetupButton, SetupCard, SetupText } from './owner-wizard-ui';
const leave = () => (router.canGoBack() ? router.back() : router.replace('/owner'));
// CNIC side picker as a tile; the accessible name stays "Choose CNIC front/back".
function CnicTile(props: ComponentProps<typeof SetupButton>) {
  return <Tile {...props} Icon={IdCard} />;
}
function DoneTile(props: ComponentProps<typeof SetupButton>) {
  return <Tile {...props} Icon={CircleCheck} />;
}
function Tile(props: ComponentProps<typeof SetupButton> & { Icon: LucideIcon }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={props.label}
      accessibilityState={{ disabled: props.disabled ?? false }}
      disabled={props.disabled}
      onPress={props.onPress}
      style={{
        minHeight: 110,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        borderRadius: 18,
        borderWidth: 1,
        borderStyle: 'dashed',
        borderColor: colors.primary,
        backgroundColor: colors.icy,
        opacity: props.disabled ? 0.5 : 1,
      }}
    >
      <props.Icon size={30} color={colors.primary} />
      <Text className="font-heading" style={{ color: colors.primary }}>
        {props.label.replace('Choose CNIC ', '').replace(/^./, (c) => c.toUpperCase())}
      </Text>
    </Pressable>
  );
}
export function OwnerVerification() {
  const session = useSession();
  const query = useProfileDetails(
    session.profile?.user.id,
    Boolean(session.profile?.capabilities.owner),
  );
  return (
    <OwnerProfileShell title="Owner verification" back={leave}>
      {!query.data ? (
        <Skeleton kind="form" label="Loading verification" />
      ) : (
        <Evidence key={query.data.userId} details={query.data} />
      )}
    </OwnerProfileShell>
  );
}
function Evidence({ details }: { details: ProfileDetails }) {
  const cache = useQueryClient();
  const [front, setFront] = useState(details.owner?.cnicFrontFileId ?? undefined);
  const [back, setBack] = useState(details.owner?.cnicBackFileId ?? undefined);
  const [busy, setBusy] = useState<Record<string, boolean>>({}),
    [accepted, setAccepted] = useState(false);
  return (
    <SetupCard>
      <IconHead
        Icon={ShieldCheck}
        title="Verify identity"
        note="Private · photo or PDF · max 10 MB"
      />
      <View style={{ flexDirection: 'row', gap: 12 }}>
        <View style={{ flex: 1 }}>
          <PrivateFilePicker
            label="CNIC front"
            hideLabel
            hideHint
            purpose="verification_document"
            onReady={setFront}
            onBusy={(value) => setBusy((old) => ({ ...old, front: value }))}
            Action={front ? DoneTile : CnicTile}
          />
        </View>
        <View style={{ flex: 1 }}>
          <PrivateFilePicker
            label="CNIC back"
            hideLabel
            hideHint
            purpose="verification_document"
            onReady={setBack}
            onBusy={(value) => setBusy((old) => ({ ...old, back: value }))}
            Action={back ? DoneTile : CnicTile}
          />
        </View>
      </View>
      <FlowForm
        fields={[
          {
            name: 'cnic',
            numberFormat: 'plain',
            label: 'Confirm CNIC number',
            keyboard: 'number-pad',
            maxLength: 13,
          },
        ]}
        Action={SetupButton}
        Label={FieldLabel}
        Input={OwnerProfileInput}
        label="Save verification evidence"
        resetAfterSubmit={false}
        formatError={ownerProfileError}
        disabled={Object.values(busy).some(Boolean)}
        extra={(_values, _set, locked) => (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <View style={{ flex: 1 }}>
              <SetupText>These are my documents</SetupText>
            </View>
            <Switch
              accessibilityLabel="Confirm identity evidence"
              disabled={locked}
              value={accepted}
              onValueChange={setAccepted}
            />
          </View>
        )}
        submit={async (input) => {
          if (!front || !back) return 'Add both CNIC sides.';
          if (!accepted) return 'Confirm your identity documents before saving.';
          await completeOwnerProfile(client, {
            fullName: details.fullName,
            phone: details.phone,
            address: details.owner?.address,
            cnic: input.cnic,
            cnicFrontFileId: front,
            cnicBackFileId: back,
            agreementAccepted: true,
            agreementVersion: 'owner-foundation-v1',
          });
          await cache.invalidateQueries({ queryKey: ['private-profile-details', details.userId] });
          leave();
          return '';
        }}
      />
    </SetupCard>
  );
}
