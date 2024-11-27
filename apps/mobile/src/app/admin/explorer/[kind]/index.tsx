import { useLocalSearchParams } from 'expo-router';
import { adminExplorerKindSchema, adminExplorerQuerySchema } from '@hsm/contracts';
import { AdminAccess } from '../../../../components/admin/access';
import { ExplorerList } from '../../../../components/admin/explorer-list';
import { Copy } from '../../../../components/ui';
export default function Directory() {
  const params = useLocalSearchParams();
  const kind = adminExplorerKindSchema.safeParse(params.kind);
  const filters = adminExplorerQuerySchema.safeParse({
    ...(params.parentId ? { parentId: params.parentId } : {}),
    ...(params.ownerId ? { ownerId: params.ownerId } : {}),
    ...(params.managerId ? { managerId: params.managerId } : {}),
    ...(params.status ? { status: params.status } : {}),
  });
  return (
    <AdminAccess rootOnly>
      {kind.success && filters.success ? (
        <ExplorerList
          key={JSON.stringify([kind.data, filters.data])}
          kind={kind.data}
          filters={filters.data}
        />
      ) : (
        <Copy alert>Invalid directory or filter.</Copy>
      )}
    </AdminAccess>
  );
}
