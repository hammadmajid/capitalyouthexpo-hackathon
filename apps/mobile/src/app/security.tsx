import { router } from 'expo-router';
import { z } from 'zod';
import { readApi } from '@hsm/api-client';
import { passwordChangeSchema } from '@hsm/contracts';
import { client } from '../lib/runtime';
import { useSession } from '../components/providers';
import { FlowForm } from '../components/flow-form';
import { OwnerScreen } from '../components/owner-screen';
import {
  FieldLabel,
  SetupButton,
  SetupCard,
  SetupHeading,
  SetupText,
} from '../components/owner-wizard-ui';
// AUTH: password change revokes other sessions server-side; sign-out-all ends every session.
export default function Security() {
  const session = useSession();
  return (
    <OwnerScreen
      back={() => (router.canGoBack() ? router.back() : router.replace('/account'))}
      title="Account & Security"
      subtitle=""
    >
      <SetupCard>
        <SetupHeading>Change password</SetupHeading>
        <SetupText muted>
          At least 8 characters. Changing your password signs out other devices.
        </SetupText>
        <FlowForm
          Action={SetupButton}
          Label={FieldLabel}
          label="Change password"
          fields={[
            { name: 'currentPassword', label: 'Current password', secret: true },
            { name: 'newPassword', label: 'New password', secret: true },
          ]}
          submit={async (values) => {
            await readApi(
              client.POST('/v1/auth/password/change', { body: passwordChangeSchema.parse(values) }),
              z.object({ changed: z.literal(true) }).strict(),
            );
            await session.refetch();
            return 'Password changed. Other signed-in devices have been revoked.';
          }}
        />
      </SetupCard>
      <SetupCard>
        <SetupHeading>Signed-in devices</SetupHeading>
        <SetupText muted>Ends your session on every device.</SetupText>
        <FlowForm
          Action={SetupButton}
          label="Sign out all devices"
          fields={[]}
          submit={async () => {
            await session.logout(true);
            router.replace('/');
          }}
        />
      </SetupCard>
    </OwnerScreen>
  );
}
