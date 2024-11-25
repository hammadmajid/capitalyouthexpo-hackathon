import { PublicPolicyPage } from '../../components/public-policy-page';
export const metadata = { title: 'Terms and conditions' };
// BR-01: the same plain statement mobile shows under Account › Terms and conditions.
export default function TermsPage() {
  return (
    <PublicPolicyPage title="Terms and conditions">
      <p>
        Review the hostel’s booking terms, charges and cancellation rules before you confirm a
        booking.
      </p>
      <p>
        Pay rent and deposits directly to the hostel. We record your payment proof for the hostel to
        verify; we never hold your money.
      </p>
    </PublicPolicyPage>
  );
}
