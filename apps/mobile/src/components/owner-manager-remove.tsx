import { View } from 'react-native';
import { removeOwnerManager } from '@hsm/api-client';
import { actorClient } from '../lib/runtime';
import { FlowForm } from './flow-form';
import { invitationErrorMessage } from './invitation-error';
import { SetupButton, SetupText } from './owner-wizard-ui';
// AUTH-M-006: removing a Manager (or cancelling an invitation) ends the assignment for good.
// The Owner confirms with their own password; the server checks it and audits the change.
export function OwnerManagerRemove(props: {
  actorId: string;
  branchId: string;
  assignment: { id: string; name: string; pending: boolean };
  onDone: () => void;
  onClose: () => void;
}) {
  const { assignment } = props;
  return (
    <View style={{ gap: 8 }}>
      <SetupText>
        {assignment.pending
          ? 'Cancel this invitation? It cannot be undone.'
          : 'Remove ' + assignment.name + '? Their access ends now and cannot be undone.'}
      </SetupText>
      <FlowForm
        key={assignment.id}
        label={assignment.pending ? 'Yes, cancel' : 'Yes, remove'}
        formatError={invitationErrorMessage}
        fields={[{ name: 'currentPassword', label: 'Your password', secret: true }]}
        submit={async (values) => {
          await removeOwnerManager(
            await actorClient(props.actorId),
            props.branchId,
            assignment.id,
            values.currentPassword ?? '',
          );
          props.onDone();
          return '';
        }}
      />
      <SetupButton secondary label="No" onPress={props.onClose} />
    </View>
  );
}
