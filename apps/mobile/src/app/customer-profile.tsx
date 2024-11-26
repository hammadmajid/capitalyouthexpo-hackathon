import { useLocalSearchParams } from 'expo-router';
import { CustomerProfileFlow } from '../components/customer-profile-flow';

export default function CustomerProfile() {
  const { from } = useLocalSearchParams<{ from?: string }>();
  return <CustomerProfileFlow fromAccount={from === 'account'} forManager={from === 'manager'} />;
}
