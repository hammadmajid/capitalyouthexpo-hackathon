import { PublicPolicyPage } from '../../components/public-policy-page';
export const metadata = { title: 'Privacy Policy' };
// BR-05: the same plain statement mobile shows under Account › Privacy Policy.
export default function PrivacyPage() {
  return (
    <PublicPolicyPage title="Privacy Policy">
      <p>We use your account details to sign you in and to manage your bookings and stays.</p>
      <p>
        Public hostel listings never show residents’ identities or rent status. Access to private
        stay records and uploaded documents is restricted to you and the hostel staff who are
        allowed to see them.
      </p>
      <p>Contact Help &amp; support in your account with questions about your information.</p>
    </PublicPolicyPage>
  );
}
