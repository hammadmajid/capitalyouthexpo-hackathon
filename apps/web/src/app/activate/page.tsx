import { FlowPage } from '../../components/auth/flow-page';
import { ActivateForm } from '../../components/auth/flows';
export default function Page() {
  return (
    <FlowPage
      title="Activate your manager account"
      description="Use the temporary credentials provided in your invitation."
    >
      <ActivateForm />
    </FlowPage>
  );
}
