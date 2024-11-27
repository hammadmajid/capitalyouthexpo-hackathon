import { useLocalSearchParams } from 'expo-router';
import { adminExplorerKindSchema, stayIdentifierSchema } from '@hsm/contracts';
import { AdminAccess } from '../../../../components/admin/access';
import { ExplorerDetail } from '../../../../components/admin/explorer-detail';
import { Copy } from '../../../../components/ui';
export default function DirectoryProfile() {
  const params = useLocalSearchParams();
  const kind = adminExplorerKindSchema.safeParse(params.kind),
    id = stayIdentifierSchema.safeParse(params.id);
  return (
    <AdminAccess rootOnly>
      {kind.success && id.success ? (
        <ExplorerDetail key={kind.data + id.data} kind={kind.data} id={id.data} />
      ) : (
        <Copy alert>Invalid profile.</Copy>
      )}
    </AdminAccess>
  );
}
