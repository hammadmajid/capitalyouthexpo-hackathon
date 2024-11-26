import { useEffect } from 'react';
import { View } from 'react-native';
import { ownerCredentialForm, type OwnerSetupActions } from '@hsm/api-client';
import { FlowForm } from './flow-form';
import { invitationErrorMessage } from './invitation-error';
// AUTH-M-003: the Owner types a new temporary password for one pending invitation (never an
// active manager's own password). The app never generates one.
export function OwnerManagerReset({
  branchId,
  assignment,
  actions,
}: {
  branchId: string;
  assignment: { id: string; name: string };
  actions: OwnerSetupActions;
}) {
  useEffect(() => () => actions.forgetInvitationReset(branchId), [actions, branchId]);
  return (
    <View className="gap-3">
      <FlowForm
        key={assignment.id}
        label="Save new password"
        formatError={invitationErrorMessage}
        resetAfterSubmit
        fields={[
          { name: 'temporaryPassword', label: 'Replacement temporary password', secret: true },
        ]}
        submit={async (values) => {
          await actions.resetInvitation(branchId, assignment.id, ownerCredentialForm(values, true));
          return 'New password saved. Share it with ' + assignment.name + '.';
        }}
      />
    </View>
  );
}
