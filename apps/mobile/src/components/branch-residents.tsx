import { NativeResidentDirectory } from './resident-directory';
import { Copy } from './ui';
import { Skeleton } from './loading/skeleton';
import { safeMessage } from '../lib/messages';
import { useNativeInventoryPages } from './use-native-inventory-pages';
type Props = {
  actorId: string;
  branchId: string;
  accessUnavailable?: boolean;
  initialBilling?: 'due' | 'overdue';
  initialMonth?: string;
};
// RES-004 / CHG-048: the Residents tab is the people list itself (search, live filters,
// contact details, every stay). New residents are added on a vacant bed in Rooms & rent,
// so there is no separate Add resident or Directory tile. The server re-checks every call.
export function BranchResidents({
  actorId,
  branchId,
  accessUnavailable = false,
  initialBilling,
  initialMonth,
}: Props) {
  const { query } = useNativeInventoryPages(actorId, branchId, !accessUnavailable);
  const data = query.data;
  if (accessUnavailable) return <Copy alert>Pull down to load branch access first.</Copy>;
  if (data && !data.permissions.includes('stay_manage'))
    return <Copy>No resident access · ask the Owner</Copy>;
  if (!data)
    return query.isError ? (
      <Copy alert>{safeMessage(query.error)}</Copy>
    ) : (
      <Skeleton kind="list" label="Loading residents…" />
    );
  return (
    <NativeResidentDirectory
      actorId={actorId}
      branchId={branchId}
      canFinance={data.permissions.includes('finance_view')}
      {...(initialBilling ? { initialBilling } : {})}
      {...(initialMonth ? { initialMonth } : {})}
    />
  );
}
