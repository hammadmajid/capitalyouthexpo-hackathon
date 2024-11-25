import { FlowPage } from '../../components/auth/flow-page';
import { RegistrationForm } from '../../components/auth/registration';
import { safeReturnPath } from '../../lib/return-path';
type Props = { searchParams: Promise<{ returnTo?: string | string[] }> };
export default async function Page({ searchParams }: Props) {
  const returnPath = safeReturnPath((await searchParams).returnTo);
  return (
    <FlowPage
      title="Create your account"
      description="One identity for your available HSM spaces."
      returnPath={returnPath}
    >
      <RegistrationForm returnPath={returnPath} />
    </FlowPage>
  );
}
