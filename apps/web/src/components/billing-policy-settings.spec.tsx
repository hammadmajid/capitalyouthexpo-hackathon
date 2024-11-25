import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  billingPolicySchema,
  billingPolicyVersionSchema,
  billingSettingsInputSchema,
  type BillingSettingsTarget,
  billingSettingsReadSchema,
} from '@hsm/contracts';
import { readBillingSettings, saveBillingSettings } from '@hsm/api-client';
import { BillingPolicySettings } from './billing-policy-settings';
import { InventoryNavigationProvider, useInventoryNavigationLocked } from './inventory-navigation';
vi.mock('@hsm/api-client', async (original) => ({
  ...(await original<typeof import('@hsm/api-client')>()),
  readBillingSettings: vi.fn(),
  saveBillingSettings: vi.fn(),
}));
vi.mock('../lib/client', () => ({ browserClient: () => ({}) }));
const actorId = randomUUID(),
  branchId = randomUUID(),
  id = randomUUID(),
  nextId = randomUUID();
const policy = billingPolicySchema.parse({
  cycle: { kind: 'calendar_month', dueDay: 5 },
  proration: { kind: 'calendar_days', rounding: 'half_up' },
  graceDays: 3,
  lateCharge: { kind: 'disabled' },
  noticeDays: 15,
  earlyCheckout: { kind: 'manual' },
  allowOpenEnded: true,
  customCharges: 'catalog_only',
});
const version = billingPolicyVersionSchema.parse({
  id,
  level: 'branch',
  scopeId: branchId,
  policy,
  createdAt: '2026-10-19T10:00:00.000Z',
});
let current = billingSettingsReadSchema.parse({
  target: { branchId },
  canEdit: true,
  localVersion: version,
  effectiveVersion: version,
});
const caches: QueryClient[] = [];
beforeEach(() => {
  vi.resetAllMocks();
  current = billingSettingsReadSchema.parse({
    target: { branchId },
    canEdit: true,
    localVersion: version,
    effectiveVersion: version,
  });
  vi.mocked(readBillingSettings).mockImplementation(async () => current);
  vi.mocked(saveBillingSettings).mockImplementation(async (_client, target, body) => {
    const input = billingSettingsInputSchema.parse(body),
      saved = { ...version, id: nextId, policy: input.policy };
    current = billingSettingsReadSchema.parse({
      target,
      canEdit: true,
      localVersion: saved,
      effectiveVersion: saved,
    });
    return saved;
  });
});
afterEach(() => {
  cleanup();
  for (const cache of caches.splice(0)) cache.clear();
});
function show() {
  const cache = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  caches.push(cache);
  const tree = (
    actor = actorId,
    target: BillingSettingsTarget = { branchId },
    unavailable = false,
  ) => (
    <QueryClientProvider client={cache}>
      <BillingPolicySettings actorId={actor} target={target} accessUnavailable={unavailable} />
    </QueryClientProvider>
  );
  return { tree, ...render(tree()) };
}
async function open() {
  fireEvent.click(screen.getByRole('button', { name: 'View billing policy' }));
  await screen.findByRole('button', { name: 'Refresh billing policy' });
}
async function edit() {
  await open();
  fireEvent.click(screen.getByRole('button', { name: 'Edit billing policy' }));
  await screen.findByRole('form', { name: 'Billing policy editor' });
}
function submit() {
  fireEvent.submit(screen.getByRole('form', { name: 'Billing policy editor' }));
}
it('RENT-003 / ACC-004: billing policy reads are lazy, private and display human financial settings', async () => {
  show();
  expect(readBillingSettings).not.toHaveBeenCalled();
  await open();
  expect(readBillingSettings).toHaveBeenCalledWith({}, { branchId });
  expect(screen.getByText('Effective source: branch')).not.toBeNull();
  for (const value of [id, branchId, actorId])
    expect(document.body.textContent).not.toContain(value);
});
it('ACC-004: read-only Manager receives no financial mutation controls', async () => {
  current = { ...current, canEdit: false };
  show();
  await open();
  expect(screen.queryByRole('button', { name: 'Edit billing policy' })).toBeNull();
  expect(screen.getByText(/Only the owning Owner/)).not.toBeNull();
  expect(saveBillingSettings).not.toHaveBeenCalled();
});
it('RENT-001 / FIN-004: absent policy starts blank and invalid settings never dispatch invented defaults', async () => {
  current = { ...current, localVersion: null, effectiveVersion: null };
  show();
  await edit();
  expect(screen.getByLabelText('Grace period (days)').getAttribute('value')).toBe('');
  expect(screen.getByLabelText('Rent cycle').textContent).toContain('Choose a setting');
  submit();
  await screen.findByRole('alert');
  expect(saveBillingSettings).not.toHaveBeenCalled();
});
it('RENT-003: Owner saves an explicit version and waits for matching persisted SDK result and refreshed values', async () => {
  show();
  await edit();
  expect(screen.getByLabelText('Grace period (days)').getAttribute('value')).toBe('3');
  fireEvent.change(screen.getByLabelText('Grace period (days)'), { target: { value: '7' } });
  submit();
  await screen.findByText('Billing policy version saved.');
  expect(saveBillingSettings).toHaveBeenCalledWith(
    {},
    { branchId },
    { policy: { ...policy, graceDays: 7 } },
    expect.any(String),
  );
  await waitFor(() => expect(readBillingSettings).toHaveBeenCalledTimes(2));
  expect(screen.queryByRole('form', { name: 'Billing policy editor' })).toBeNull();
});
it('RENT-003 / ACC-004: interrupted save retains entered rules and same-intent command key until successful retry', async () => {
  vi.mocked(saveBillingSettings).mockRejectedValueOnce(new Error('Private upstream failure'));
  show();
  await edit();
  fireEvent.change(screen.getByLabelText('Grace period (days)'), { target: { value: '9' } });
  submit();
  await screen.findByRole('button', { name: 'Retry billing policy' });
  expect(screen.queryByText('Billing policy version saved.')).toBeNull();
  expect(document.body.textContent).not.toContain('Private upstream failure');
  fireEvent.click(screen.getByRole('button', { name: 'Retry billing policy' }));
  await screen.findByRole('form', { name: 'Billing policy editor' });
  expect(screen.getByLabelText('Grace period (days)').getAttribute('value')).toBe('9');
  submit();
  await screen.findByText('Billing policy version saved.');
  expect(saveBillingSettings).toHaveBeenCalledTimes(2);
  expect(vi.mocked(saveBillingSettings).mock.calls[0]?.[3]).toBe(
    vi.mocked(saveBillingSettings).mock.calls[1]?.[3],
  );
});
it('SEC-003: pending/failed policy refresh hides cached settings and draft but retains input after recovery', async () => {
  let finish: ((value: typeof current) => void) | undefined;
  show();
  await edit();
  fireEvent.change(screen.getByLabelText('Grace period (days)'), { target: { value: '9' } });
  vi.mocked(readBillingSettings).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  fireEvent.click(screen.getByRole('button', { name: 'Refresh billing policy' }));
  await screen.findByText('Loading billing policy…');
  expect(screen.queryByRole('form', { name: 'Billing policy editor' })).toBeNull();
  expect(screen.queryByText('Effective source: branch')).toBeNull();
  finish?.(current);
  await screen.findByRole('form', { name: 'Billing policy editor' });
  expect(screen.getByLabelText('Grace period (days)').getAttribute('value')).toBe('9');
  vi.mocked(readBillingSettings).mockRejectedValueOnce(new Error('Revoked'));
  fireEvent.click(screen.getByRole('button', { name: 'Refresh billing policy' }));
  await screen.findByRole('button', { name: 'Retry billing policy' });
  expect(screen.queryByRole('form', { name: 'Billing policy editor' })).toBeNull();
});
it('RENT-003: changed effective version retains draft and requires explicit reload before save', async () => {
  show();
  await edit();
  fireEvent.change(screen.getByLabelText('Grace period (days)'), { target: { value: '9' } });
  const changed = { ...version, id: nextId, policy: { ...policy, graceDays: 11 } };
  current = billingSettingsReadSchema.parse({
    ...current,
    localVersion: changed,
    effectiveVersion: changed,
  });
  fireEvent.click(screen.getByRole('button', { name: 'Refresh billing policy' }));
  await screen.findByText(/Billing settings changed/);
  expect(screen.getByLabelText('Grace period (days)').getAttribute('value')).toBe('9');
  expect(
    screen.getByRole('button', { name: 'Save new billing policy version' }).matches(':disabled'),
  ).toBe(true);
  submit();
  expect(saveBillingSettings).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Reload current billing values' }));
  expect(screen.getByLabelText('Grace period (days)').getAttribute('value')).toBe('11');
  expect(
    screen.getByRole('button', { name: 'Save new billing policy version' }).matches(':disabled'),
  ).toBe(false);
});
it('ACC-004: branch access loss hides policy values and changing account discards previous draft', async () => {
  const view = show();
  await edit();
  view.rerender(view.tree(actorId, { branchId }, true));
  await screen.findByText(/Refresh branch access/);
  expect(screen.queryByRole('form', { name: 'Billing policy editor' })).toBeNull();
  view.rerender(view.tree(randomUUID()));
  expect(screen.getByRole('button', { name: 'View billing policy' })).not.toBeNull();
  expect(screen.queryByText('Effective source: branch')).toBeNull();
  expect(readBillingSettings).toHaveBeenCalledTimes(1);
});
it('FIN-004: weekly rent and monthly fees stay independent and exact fixed rent amounts use paisa', async () => {
  show();
  await edit();
  for (const [label, value] of [
    ['Rent cycle', 'week'],
    ['Rent due offset (days)', '2'],
    ['Rent proration', 'fixed_first_period'],
    ['Rent proration fixed amount (PKR)', '12.50'],
    ['Disclosed fee timing', 'configured'],
    ['One-time fee due offset (days)', '0'],
    ['Monthly fee timing', 'configured'],
    ['Monthly fee cycle', 'anniversary_month'],
    ['Monthly fee due offset (days)', '1'],
    ['Monthly fee proration', 'calendar_days'],
    ['Monthly fee proration rounding', 'down'],
  ])
    fireEvent.change(screen.getByLabelText(label ?? ''), { target: { value } });
  submit();
  await screen.findByText('Billing policy version saved.');
  expect(saveBillingSettings).toHaveBeenCalledWith(
    {},
    { branchId },
    {
      policy: {
        ...policy,
        cycle: { kind: 'week', dueOffsetDays: 2 },
        proration: { kind: 'fixed_first_period', amountPaisa: 1250 },
        feeBilling: {
          oneTimeDueOffsetDays: 0,
          monthly: {
            cycle: { kind: 'anniversary_month', dueOffsetDays: 1 },
            proration: { kind: 'calendar_days', rounding: 'down' },
          },
        },
      },
    },
    expect.any(String),
  );
});
it('RENT-003: cancelling and closing discard edits without financial writes', async () => {
  show();
  await edit();
  fireEvent.change(screen.getByLabelText('Grace period (days)'), { target: { value: '9' } });
  fireEvent.click(screen.getByRole('button', { name: 'Cancel billing policy edit' }));
  expect(screen.queryByRole('form', { name: 'Billing policy editor' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Edit billing policy' }));
  expect(screen.getByLabelText('Grace period (days)').getAttribute('value')).toBe('3');
  fireEvent.click(screen.getByRole('button', { name: 'Close billing policy' }));
  expect(screen.queryByText('Effective source: branch')).toBeNull();
  expect(saveBillingSettings).not.toHaveBeenCalled();
});

function NavigationProbe() {
  return <button disabled={useInventoryNavigationLocked()}>Change inventory page</button>;
}
it('RENT-003 / ACC-004: room-type billing keeps inherited branch scope and releases navigation on close', async () => {
  const cache = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  caches.push(cache);
  const target = { branchId, roomTypeId: randomUUID() };
  current = billingSettingsReadSchema.parse({
    target,
    canEdit: true,
    localVersion: null,
    effectiveVersion: version,
  });
  render(
    <QueryClientProvider client={cache}>
      <InventoryNavigationProvider>
        <NavigationProbe />
        <BillingPolicySettings actorId={actorId} target={target} roomTypeName="Student room" />
      </InventoryNavigationProvider>
    </QueryClientProvider>,
  );
  const navigation = screen.getByRole('button', { name: 'Change inventory page' });
  expect(navigation.matches(':disabled')).toBe(false);
  fireEvent.click(screen.getByRole('button', { name: 'View billing policy for Student room' }));
  await screen.findByRole('region', { name: 'Billing policy for Student room' });
  await screen.findByText('Effective source: branch');
  expect(navigation.matches(':disabled')).toBe(true);
  expect(readBillingSettings).toHaveBeenCalledWith({}, target);
  fireEvent.click(screen.getByRole('button', { name: 'Close billing policy for Student room' }));
  await waitFor(() => expect(navigation.matches(':disabled')).toBe(false));
  expect(saveBillingSettings).not.toHaveBeenCalled();
});
