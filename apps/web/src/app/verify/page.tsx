import Link from 'next/link';
import { FlowPage } from '../../components/auth/flow-page';
import { VerifyForm } from '../../components/auth/flows';
export default function Page() {
  return (
    <FlowPage title="Verify your email" description="Enter the six-digit code from your email.">
      <VerifyForm />
      <Link className="text-link block text-sm" href="/resend">
        Send another code
      </Link>
    </FlowPage>
  );
}
