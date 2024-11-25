import Link from 'next/link';
import { FlowPage } from '../../components/auth/flow-page';
import { ResendForm } from '../../components/auth/flows';
export default function Page() {
  return (
    <FlowPage title="Request another code" description="Use the email address on your account.">
      <ResendForm />
      <Link className="text-link block text-sm" href="/verify">
        Enter your verification code
      </Link>
    </FlowPage>
  );
}
