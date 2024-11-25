import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { ApiFailure } from '@hsm/api-client';
import type { SelfProfile } from '@hsm/contracts';
import { MarketplaceCheckoutGate } from './marketplace-checkout-gate';
import { checkoutBranchId as branchId, checkoutQuote as quote } from './checkout.fixture';
const { state, capture } = vi.hoisted(() => ({
  state: {
    data: undefined as SelfProfile | undefined,
    error: undefined as unknown,
    isPending: false,
    isFetching: false,
    refetch: vi.fn(),
  },
  capture: vi.fn(),
}));
vi.mock('./providers', () => ({ useSession: () => state }));
vi.mock('./marketplace-checkout', () => ({
  MarketplaceCheckout: (props: { actorId: string; accessUnavailable?: boolean }) => {
    capture(props);
    return <p>Authorized checkout fixture</p>;
  },
}));
const profile: SelfProfile = {
  user: {
    id: randomUUID(),
    fullName: 'Customer fixture',
    email: 'customer@example.test',
    emailVerified: true,
    cnicLast4: null,
  },
  capabilities: { customer: true, owner: false, managerOf: [], admin: null },
};
beforeEach(() => {
  vi.clearAllMocks();
  state.data = profile;
  state.error = undefined;
  state.isPending = false;
  state.isFetching = false;
});
afterEach(cleanup);
const show = () => render(<MarketplaceCheckoutGate branchId={branchId} quote={quote} />);
it('BKG-001: pending identity cannot mount a private booking form', () => {
  state.isPending = true;
  show();
  expect(screen.getByRole('status')).toBeDefined();
  expect(capture).not.toHaveBeenCalled();
});
it('BKG-001 / SEC-001: guests retain only the validated hostel destination through login', () => {
  state.data = undefined;
  show();
  expect(
    screen.getByRole('link', { name: 'Sign in to book this hostel' }).getAttribute('href'),
  ).toBe('/login?returnTo=' + encodeURIComponent('/hostels/' + branchId));
  expect(capture).not.toHaveBeenCalled();
});
it('BKG-001 / SEC-001: Customer profile completion retains the same allowed hostel return', () => {
  state.data = { ...profile, capabilities: { ...profile.capabilities, customer: false } };
  show();
  expect(
    screen
      .getByRole('link', { name: 'Complete your Customer profile to book' })
      .getAttribute('href'),
  ).toBe('/app/customer-profile?returnTo=' + encodeURIComponent('/hostels/' + branchId));
  expect(capture).not.toHaveBeenCalled();
});
it('SEC-003: unverified email cannot start booking checkout', () => {
  state.data = { ...profile, user: { ...profile.user, emailVerified: false } };
  show();
  expect(
    screen.getByRole('link', { name: 'Verify your email before booking' }).getAttribute('href'),
  ).toBe('/app/security');
  expect(capture).not.toHaveBeenCalled();
});
it('BKG-001: live Customer capability binds checkout to the actual identity and quote', () => {
  show();
  expect(capture).toHaveBeenLastCalledWith(
    expect.objectContaining({
      actorId: profile.user.id,
      branchId,
      quote,
      accessUnavailable: false,
    }),
  );
});
it('SEC-003: transient session refresh error preserves mounted checkout and disables writes until retry', () => {
  state.error = new Error('Private provider detail');
  show();
  expect(screen.getByText('Authorized checkout fixture')).toBeDefined();
  expect(capture).toHaveBeenLastCalledWith(expect.objectContaining({ accessUnavailable: true }));
  fireEvent.click(screen.getByRole('button', { name: 'Retry booking access' }));
  expect(state.refetch).toHaveBeenCalledTimes(1);
  expect(document.body.textContent).not.toContain('Private provider detail');
});
it('SEC-003: definitive session rejection hides cached private checkout', () => {
  state.error = new ApiFailure({
    type: 'about:blank',
    title: 'Denied',
    detail: 'Denied',
    status: 401,
    code: 'SESSION_REVOKED',
    traceId: randomUUID(),
  });
  show();
  expect(screen.queryByText('Authorized checkout fixture')).toBeNull();
  expect(capture).not.toHaveBeenCalled();
  expect(screen.getByRole('link', { name: 'Sign in to book this hostel' })).toBeDefined();
});
