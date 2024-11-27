import {
  ArrowDownCircle,
  ArrowUpCircle,
  Ban,
  Check,
  Pause,
  Play,
  UserCog,
  X,
  type LucideIcon,
} from 'lucide-react-native';
import type { AdminAccount } from '@hsm/contracts';
import type { AdminAction } from './detail-change';
import type { useAdminChange } from './detail-change';
import { AdminField, Roles } from './ui';
import { Copy } from '../ui';
import { ActionButton, ButtonRow, Fact } from './admin-list';
type Form = ReturnType<typeof useAdminChange>;
type Tone = 'solid' | 'outline' | 'danger';
// ADM-004: the server keeps 1–3 active Roots and audits every change; labels stay explicit.
const actionMeta: Record<
  AdminAction,
  { label: string; text: string; icon: LucideIcon; tone: Tone }
> = {
  roles: { label: 'Edit Admin roles', text: 'Roles', icon: UserCog, tone: 'outline' },
  suspended: { label: 'Suspend Admin', text: 'Suspend', icon: Pause, tone: 'danger' },
  active: { label: 'Reactivate Admin', text: 'Reactivate', icon: Play, tone: 'solid' },
  deactivated: { label: 'Deactivate Admin', text: 'Deactivate', icon: Ban, tone: 'danger' },
  promote: { label: 'Promote to Root', text: 'Promote', icon: ArrowUpCircle, tone: 'outline' },
  demote: { label: 'Demote Root', text: 'Demote', icon: ArrowDownCircle, tone: 'danger' },
};
export function AdminActions({ account, form }: { account: AdminAccount; form: Form }) {
  if (account.status === 'deactivated') return <Fact icon={Ban}>Deactivated · permanent</Fact>;
  const actions: AdminAction[] = [];
  if (!account.isRoot) actions.push('roles');
  if (account.status === 'active') actions.push('suspended');
  if (account.status === 'suspended') actions.push('active');
  actions.push('deactivated');
  if (!account.isRoot && account.status === 'active') actions.push('promote');
  if (account.isRoot) actions.push('demote');
  return (
    <ButtonRow>
      {actions.map((action) => (
        <ActionButton
          key={action}
          icon={actionMeta[action].icon}
          text={actionMeta[action].text}
          label={actionMeta[action].label}
          tone={actionMeta[action].tone}
          disabled={form.locked}
          onPress={() => form.choose(action)}
        />
      ))}
    </ButtonRow>
  );
}
export function AdminConfirmation({ form }: { form: Form }) {
  const meta = form.action ? actionMeta[form.action] : undefined;
  return (
    <>
      {form.action === 'promote' || form.action === 'demote' ? (
        <Copy>1–3 active Root Admins required.</Copy>
      ) : null}
      {form.action === 'roles' ? (
        <Roles value={form.roles} onChange={form.setRoles} disabled={form.locked} />
      ) : null}
      <AdminField
        label="Reason for Admin change"
        value={form.reason}
        onChange={form.setReason}
        disabled={form.locked}
      />
      <ButtonRow>
        <ActionButton
          icon={X}
          text="Cancel"
          label="Cancel Admin change"
          disabled={form.locked}
          onPress={form.cancel}
        />
        <ActionButton
          icon={meta?.icon ?? Check}
          text={meta?.text ?? 'Confirm'}
          label="Confirm Admin change"
          tone={meta?.tone === 'danger' ? 'danger' : 'solid'}
          disabled={
            form.locked ||
            !form.reason.trim() ||
            (form.action === 'roles' && form.roles.length === 0)
          }
          onPress={form.submit}
        />
      </ButtonRow>
    </>
  );
}
