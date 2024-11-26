/// <reference types="jest" />
import { render, screen } from '@testing-library/react-native';
import { OwnerDraftResume } from './owner-draft-resume';
import { setupStepKeys } from './owner-setup-steps';

jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
jest.mock('./owner-setup-overview', () => ({
  stepCopy: { location: { title: 'Location & Address' }, review: { title: 'Review & Submit' } },
}));
jest.mock('./use-owner-draft', () => ({
  setupStepKeys: jest.requireActual('./owner-setup-steps').setupStepKeys,
  useOwnerHostel: () => ({ data: { name: 'Saved hostel' }, isError: false }),
  useOwnerDraftDetails: () => ({}),
  draftProgress: () => ({ basics: true }),
}));

it('HSM-SETUP uses the canonical wizard total for visible and accessible progress', async () => {
  await render(<OwnerDraftResume actorId="owner" brandId="brand" />);
  expect(screen.getByText(`1 of ${setupStepKeys.length} steps saved`)).toBeTruthy();
  expect(screen.getByRole('progressbar').props.accessibilityValue).toEqual({
    min: 0,
    max: setupStepKeys.length,
    now: 1,
  });
});
