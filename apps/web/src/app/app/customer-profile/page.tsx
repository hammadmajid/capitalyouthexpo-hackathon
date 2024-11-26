import { Shell } from '../../../components/shell';
import { CustomerProfileForm } from '../../../components/auth/customer-profile';
import { safeReturnPath } from '../../../lib/return-path';
type Props = { searchParams: Promise<{ returnTo?: string | string[] }> };
export default async function Page({ searchParams }: Props) {
  const returnPath = safeReturnPath((await searchParams).returnTo);
  return (
    <Shell focused>
      <CustomerProfileForm returnPath={returnPath} />
    </Shell>
  );
}
