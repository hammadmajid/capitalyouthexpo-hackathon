/// <reference types="jest" />
import { fireEvent, render, screen } from '@testing-library/react-native';
import type { StayRecord } from '@hsm/contracts';
import { AgreementAcknowledgement } from './agreement-acknowledgement';
const mockMutate = jest.fn();
jest.mock('./services/use-command', () => ({
  useNativeCommand: () => ({ mutate: mockMutate, isPending: false, unresolved: false }),
}));
jest.mock('./native-billing-policy-form', () => ({ NativeBillingPolicySummary: () => null }));
jest.mock('expo-router', () => ({ router: {}, useFocusEffect: jest.fn() }));
const agreement = {
  id: 'original-agreement',
  version: 3,
  termsDigest: 'a'.repeat(64),
  acknowledgements: [],
  terms: { policy: {} },
} as unknown as StayRecord['agreements'][number];
it('STAY-002: only an own-stay reader can explicitly acknowledge the reviewed original version', async () => {
  await render(
    <AgreementAcknowledgement
      actorId="resident"
      stayId="original-stay"
      agreement={agreement}
      own
    />,
  );
  expect(screen.queryByRole('button', { name: 'Acknowledge this agreement' })).toBeNull();
  await fireEvent.press(screen.getByRole('button', { name: 'Review agreement policy' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Acknowledge this agreement' }));
  expect(mockMutate).toHaveBeenCalledWith({
    version: 3,
    termsDigest: 'a'.repeat(64),
    acknowledged: true,
  });
});
it('ACC-002: staff cannot claim acknowledgement on behalf of the resident', async () => {
  await render(
    <AgreementAcknowledgement
      actorId="owner"
      stayId="original-stay"
      agreement={agreement}
      own={false}
    />,
  );
  await fireEvent.press(screen.getByRole('button', { name: 'Review agreement policy' }));
  expect(screen.queryByRole('button', { name: 'Acknowledge this agreement' })).toBeNull();
});
