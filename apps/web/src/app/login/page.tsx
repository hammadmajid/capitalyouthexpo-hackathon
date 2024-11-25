import { AuthFrame } from '../../components/auth/frame';
import { LoginForm } from '../../components/auth/login';
import { safeReturnPath } from '../../lib/return-path';
type Props = { searchParams: Promise<{ returnTo?: string | string[] }> };
export default async function Login({ searchParams }: Props) {
  const returnPath = safeReturnPath((await searchParams).returnTo);
  return (
    <AuthFrame>
      <LoginForm returnPath={returnPath} />
    </AuthFrame>
  );
}
