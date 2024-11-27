import { ownerBranchSetupActions, ownerSetupActions } from '@hsm/api-client';
import {
  hostelOnboardingStateSchema,
  type HostelBasicsInput,
  type MainBranchDraftInput,
} from '@hsm/contracts';
import { useNativeCommand } from './services/use-command';
import { useNativeInventoryNavigationLock } from './native-inventory-navigation';
type Command =
  | { kind: 'create'; organizationId: string; input: HostelBasicsInput }
  | { kind: 'basics'; brandId: string; input: HostelBasicsInput }
  | { kind: 'main'; brandId: string; input: MainBranchDraftInput }
  | { kind: 'submit'; brandId: string }
  | { kind: 'add-branch'; brandId: string; input: MainBranchDraftInput }
  | { kind: 'branch'; brandId: string; branchId: string; input: MainBranchDraftInput }
  | { kind: 'branch-submit'; brandId: string; branchId: string };
export function useOwnerSetupCommand(actorId: string, targetId: string) {
  const mutation = useNativeCommand<Command>(
    'owner-setup-wizard',
    actorId,
    async (client, body, key) => {
      const actions = ownerSetupActions(client, () => key),
        branch = ownerBranchSetupActions(client, () => key);
      switch (body.kind) {
        case 'create':
          return actions.create(body.organizationId, body.input);
        case 'basics':
          return actions.basics(body.brandId, body.input);
        case 'main':
          return actions.main(body.brandId, body.input);
        case 'submit':
          return actions.submit(body.brandId);
        case 'add-branch':
          return branch.add(body.brandId, body.input);
        case 'branch':
          return branch.save(body.brandId, body.branchId, body.input);
        case 'branch-submit':
          return branch.submit(body.brandId, body.branchId);
      }
    },
    [
      ['owner-wizard-command', actorId, targetId],
      ['owner-hostel', actorId, targetId],
      ['owner-hostels', actorId],
      ['branches', actorId, 'owner'],
      ['owner-dashboard', actorId],
    ],
  );
  useNativeInventoryNavigationLock(mutation.isPending || mutation.unresolved);
  return {
    ...mutation,
    result:
      mutation.data === undefined ? undefined : hostelOnboardingStateSchema.parse(mutation.data),
  };
}
