import { fireEvent, render, screen } from '@testing-library/react-native';
import { Share } from 'react-native';
import { ShareHostel } from './share-hostel';

jest.mock('expo-router', () => ({ router: {} }));
jest.mock('../../lib/runtime', () => ({ config: { webUrl: 'https://web.example.test' } }));
const branchId = '10000000-0000-4000-8000-000000000001';
afterEach(() => jest.restoreAllMocks());
it('p.14 / SEC-003: native share carries only the public family URL without account/booking/payment data', async () => {
  const share = jest.spyOn(Share, 'share').mockResolvedValue({ action: Share.sharedAction });
  await render(<ShareHostel branchId={branchId} />);
  await fireEvent.press(screen.getByRole('button', { name: 'Share hostel with family' }));
  expect(share).toHaveBeenCalledWith({
    title: 'HSM hostel summary',
    message: 'Public hostel summary: https://web.example.test/share/' + branchId,
    url: 'https://web.example.test/share/' + branchId,
  });
});
it('p.14: native sharing failure is visible and can be retried', async () => {
  const share = jest
    .spyOn(Share, 'share')
    .mockRejectedValueOnce(new Error('PRIVATE marker'))
    .mockResolvedValue({ action: Share.dismissedAction });
  await render(<ShareHostel branchId={branchId} />);
  await fireEvent.press(screen.getByRole('button', { name: 'Share hostel with family' }));
  await screen.findByText('Sharing unavailable. Please try again.');
  expect(screen.queryByText('PRIVATE marker')).toBeNull();
  await fireEvent.press(screen.getByRole('button', { name: 'Share hostel with family' }));
  expect(share).toHaveBeenCalledTimes(2);
});
