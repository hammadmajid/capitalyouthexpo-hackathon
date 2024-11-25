import { FlowPage } from '../../components/auth/flow-page';
import { ResetForm } from '../../components/auth/flows';
export default function Page() {
  return (
    <FlowPage title="Choose a new password" description="Enter the reset code from your email.">
      <ResetForm />
    </FlowPage>
  );
}
