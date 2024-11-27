import { useLocalSearchParams, Redirect } from 'expo-router';
import { AuthFlow } from '../../components/auth-flow';
import { flowSchema } from '../../lib/auth';
export default function Authentication() {
  const { flow } = useLocalSearchParams<{ flow: string }>();
  const parsed = flowSchema.safeParse(flow);
  return parsed.success ? <AuthFlow flow={parsed.data} /> : <Redirect href="/" />;
}
