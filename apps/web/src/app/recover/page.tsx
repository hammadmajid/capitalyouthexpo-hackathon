import Link from 'next/link';
import { FlowPage } from '../../components/auth/flow-page';
import { RecoverForm } from '../../components/auth/flows';
export default function Page() {
  return (
    <FlowPage
      title="Reset your password"
      description="We will email a reset code if the account is eligible."
    >
      <RecoverForm />
      <Link className="text-link block text-sm" href="/reset">
        Already have a reset code?
      </Link>
    </FlowPage>
  );
}
