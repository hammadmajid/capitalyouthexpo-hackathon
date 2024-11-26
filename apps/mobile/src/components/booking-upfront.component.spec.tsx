import { fireEvent, render, screen } from '@testing-library/react-native';
import { BookingUpfrontReview } from './booking-upfront-review';
jest.mock('../lib/runtime', () => ({ client: {}, config: { apiUrl: 'https://example.test' } }));
const proof = {
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  state: 'submitted' as const,
  amountPaisa: 1800000,
  method: 'jazzcash' as const,
  paidOn: '2026-10-25',
  reference: null,
  submittedAt: '2026-10-25T10:00:00.000Z',
  reviewedAt: null,
  reviewReason: null,
};
const upfront = {
  requirement: 'first_rent' as const,
  amountPaisa: 1800000,
  status: 'verification_pending' as const,
  approvedAt: '2026-10-25T09:00:00.000Z',
  proof,
};
const props = {
  actorId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  branchId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  bookingId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
  upfront,
  pending: false,
  error: null,
};
it('ACC-004: approval and rejection report the exact proof; rejection needs a reason', async () => {
  const onReview = jest.fn();
  await render(<BookingUpfrontReview {...props} canReview onReview={onReview} />);
  await fireEvent.press(screen.getByRole('button', { name: 'Verify payment and confirm booking' }));
  expect(onReview).toHaveBeenLastCalledWith(proof.id, { decision: 'approve' });
  await fireEvent.press(screen.getByRole('button', { name: 'Reject proof' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Reject payment proof' }));
  expect(onReview).toHaveBeenCalledTimes(1);
  await fireEvent.changeText(
    screen.getByLabelText('Reason the proof was not accepted'),
    'Not received',
  );
  await fireEvent.press(screen.getByRole('button', { name: 'Reject payment proof' }));
  expect(onReview).toHaveBeenLastCalledWith(proof.id, {
    decision: 'reject',
    reason: 'Not received',
  });
});
it('ACC-004: reviewers without grants see status only', async () => {
  await render(<BookingUpfrontReview {...props} canReview={false} onReview={jest.fn()} />);
  expect(screen.queryByRole('button', { name: 'Verify payment and confirm booking' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Open payment proof' })).toBeNull();
  expect(screen.getByLabelText('Upfront payment verification')).toBeTruthy();
});
