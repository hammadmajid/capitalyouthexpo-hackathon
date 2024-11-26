import { Banknote } from 'lucide-react-native';
import { IconHead } from './owner-icon-head';
import { OwnerAgreementTemplate } from './owner-agreement-template';
import { OwnerHostelRules } from './owner-hostel-rules';
import { NativeBillingPolicy } from './native-billing-policy';
import { SetupButton, SetupCard } from './owner-wizard-ui';
// RENT-001: use the existing versioned billing editor; never infer financial terms.
// Every policy change applies to new stays only.
export function OwnerPoliciesStep({
  actorId,
  branchId,
  next,
}: {
  actorId: string;
  branchId: string;
  next: () => void;
}) {
  return (
    <>
      <SetupCard>
        <IconHead Icon={Banknote} title="Rent policy" note="Due day, grace, notice · new stays" />
        <NativeBillingPolicy actorId={actorId} target={{ branchId }} />
      </SetupCard>
      {/* CHG-050: payment methods are their own step (Payment Methods, step 8). */}
      <OwnerAgreementTemplate actorId={actorId} branchId={branchId} />
      <OwnerHostelRules actorId={actorId} branchId={branchId} />
      <SetupButton label="Continue" onPress={next} />
    </>
  );
}
