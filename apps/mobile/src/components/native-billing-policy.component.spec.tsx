/// <reference types="jest" />
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { readBillingSettings, saveBillingSettings } from '@hsm/api-client';
import {
  billingPolicySchema,
  billingPolicyVersionSchema,
  billingSettingsReadSchema,
  billingSettingsInputSchema,
  stayIdentifierSchema,
} from '@hsm/contracts';
import { NativeBillingPolicy } from './native-billing-policy';
import {
  NativeInventoryNavigationProvider,
  useNativeInventoryNavigationLocked,
} from './native-inventory-navigation';
import { Button } from './ui';
import { pullToRefresh } from '../test-utils/pull-refresh';
jest.mock('../lib/runtime', () => ({ actorClient: jest.fn(async () => ({})) }));
jest.mock('expo-crypto', () => {
  let sequence = 0;
  return { randomUUID: () => '019a1234-1234-7123-8123-' + String(++sequence).padStart(12, '0') };
});
jest.mock('@hsm/api-client', () => ({
  ...jest.requireActual<typeof import('@hsm/api-client')>('@hsm/api-client'),
  readBillingSettings: jest.fn(),
  saveBillingSettings: jest.fn(),
}));
const id = '10000000-0000-4000-8000-000000000001',
  next = '10000000-0000-4000-8000-000000000002',
  other = '10000000-0000-4000-8000-000000000003';
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
  scopeId: id,
  policy,
  createdAt: '2026-10-20T00:00:00.000Z',
});
const initial = billingSettingsReadSchema.parse({
  target: { branchId: id },
  canEdit: true,
  localVersion: version,
  effectiveVersion: version,
});
let current = initial,
  cache: QueryClient;
beforeEach(() => {
  jest.resetAllMocks();
  current = initial;
  cache = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  jest.requireMock<{ actorClient: jest.Mock }>('../lib/runtime').actorClient.mockResolvedValue({});
  jest.mocked(readBillingSettings).mockImplementation(async () => current);
  jest.mocked(saveBillingSettings).mockImplementation(async (_client, target, body) => {
    const data = billingSettingsInputSchema.parse(body).policy;
    const result = billingPolicyVersionSchema.parse({
      ...version,
      id: next,
      level: target.roomTypeId ? 'room_type' : 'branch',
      scopeId: target.roomTypeId ?? target.branchId,
      policy: data,
    });
    current = billingSettingsReadSchema.parse({
      ...current,
      localVersion: result,
      effectiveVersion: result,
    });
    return result;
  });
});
afterEach(async () => {
  await act(async () => cache.clear());
});
const ui = (
  actorId = 'owner',
  unavailable = false,
  target = { branchId: id },
  roomTypeName?: string,
) => (
  <QueryClientProvider client={cache}>
    <NativeBillingPolicy
      actorId={actorId}
      target={target}
      accessUnavailable={unavailable}
      {...(roomTypeName ? { roomTypeName } : {})}
    />
  </QueryClientProvider>
);
async function open() {
  await render(ui());
  await fireEvent.press(screen.getByRole('button', { name: 'View billing policy' }));
  await screen.findByRole('button', { name: 'Edit billing policy' });
}
async function edit() {
  await open();
  await fireEvent.press(screen.getByRole('button', { name: 'Edit billing policy' }));
}
async function press(name: string) {
  await fireEvent.press(screen.getByRole('button', { name }));
}
async function choose(field: string, label: string) {
  await press(field + ': Choose a setting');
  await fireEvent.press(screen.getByRole('radio', { name: field + ': ' + label }));
}
it('RENT-003 / SEC-003: lazy private read and Manager read-only human summary', async () => {
  current = { ...initial, canEdit: false };
  await render(ui('manager'));
  expect(readBillingSettings).not.toHaveBeenCalled();
  await press('View billing policy');
  await screen.findByText(/View only/);
  expect(screen.getByText('Calendar month')).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Edit billing policy' })).toBeNull();
  expect(JSON.stringify(screen.toJSON())).not.toMatch(
    /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i,
  );
  expect(saveBillingSettings).not.toHaveBeenCalled();
});
it('RENT-003: Owner saves a strict new version without changing existing terms', async () => {
  await edit();
  await fireEvent.changeText(screen.getByLabelText('Grace period (days)'), '7');
  await press('Save new billing policy version');
  await screen.findByText('Billing policy version saved.');
  expect(saveBillingSettings).toHaveBeenCalledWith(
    {},
    { branchId: id },
    { policy: { ...policy, graceDays: 7 } },
    expect.any(String),
  );
  expect(
    stayIdentifierSchema.parse(jest.mocked(saveBillingSettings).mock.calls[0]?.[3]),
  ).toBeTruthy();
  expect(screen.queryByLabelText('Grace period (days)')).toBeNull();
});
it('RENT-001: absent policy leaves required choices blank and never saves invented defaults', async () => {
  current = { ...initial, localVersion: null, effectiveVersion: null };
  await edit();
  expect(screen.getByRole('button', { name: 'Rent cycle: Choose a setting' })).toBeTruthy();
  expect(screen.getByLabelText('Grace period (days)').props.value).toBe('');
  await press('Save new billing policy version');
  expect(screen.getByRole('alert')).toBeTruthy();
  expect(saveBillingSettings).not.toHaveBeenCalled();
});
it('FIN-004: recoverable failure retains draft and same valid command key without provider detail', async () => {
  jest.mocked(saveBillingSettings).mockRejectedValueOnce(new Error('private provider secret'));
  await edit();
  await fireEvent.changeText(screen.getByLabelText('Grace period (days)'), '9');
  await press('Save new billing policy version');
  await screen.findAllByRole('alert');
  expect(JSON.stringify(screen.toJSON())).not.toContain('private provider secret');
  const key = stayIdentifierSchema.parse(jest.mocked(saveBillingSettings).mock.calls[0]?.[3]);
  await pullToRefresh(cache);
  await screen.findByLabelText('Grace period (days)');
  expect(screen.getByLabelText('Grace period (days)').props.value).toBe('9');
  await press('Save new billing policy version');
  await screen.findByText('Billing policy version saved.');
  expect(jest.mocked(saveBillingSettings).mock.calls[1]?.[3]).toBe(key);
});
it('SEC-003: failed private refresh hides cached values and edit controls, then restores draft', async () => {
  await edit();
  await fireEvent.changeText(screen.getByLabelText('Grace period (days)'), '8');
  jest.mocked(readBillingSettings).mockRejectedValueOnce(new Error('private read detail'));
  await pullToRefresh(cache);
  await screen.findAllByRole('alert');
  expect(screen.queryByText('Calendar month')).toBeNull();
  expect(screen.queryByLabelText('Grace period (days)')).toBeNull();
  expect(JSON.stringify(screen.toJSON())).not.toContain('private read detail');
  await pullToRefresh(cache);
  await screen.findByLabelText('Grace period (days)');
  expect(screen.getByLabelText('Grace period (days)').props.value).toBe('8');
});
it('RENT-003: changed effective version requires explicit reload before saving retained draft', async () => {
  await edit();
  await fireEvent.changeText(screen.getByLabelText('Grace period (days)'), '8');
  current = {
    ...current,
    localVersion: { ...version, id: next },
    effectiveVersion: { ...version, id: next },
  };
  await pullToRefresh(cache);
  await screen.findByText(/Billing settings changed/);
  expect(
    screen.getByRole('button', { name: 'Save new billing policy version' }).props.accessibilityState
      .disabled,
  ).toBe(true);
  expect(screen.getByLabelText('Grace period (days)').props.value).toBe('8');
  await press('Save new billing policy version');
  expect(saveBillingSettings).not.toHaveBeenCalled();
  await press('Use current values');
  expect(screen.getByLabelText('Grace period (days)').props.value).toBe('3');
});
it('SEC-003: parent access loss hides values and actor switch restarts closed', async () => {
  const view = await render(ui());
  await press('View billing policy');
  await screen.findByRole('button', { name: 'Edit billing policy' });
  await press('Edit billing policy');
  await view.rerender(ui('owner', true));
  expect(screen.queryByText('Calendar month')).toBeNull();
  expect(screen.queryByLabelText('Grace period (days)')).toBeNull();
  await screen.findByText(/Pull down to load branch access/);
  await view.rerender(ui('another-owner'));
  expect(screen.getByRole('button', { name: 'View billing policy' })).toBeTruthy();
  expect(screen.queryByText('Calendar month')).toBeNull();
  expect(saveBillingSettings).not.toHaveBeenCalled();
});
it('FIN-004: room-type target retains inherited source and scopes its saved override', async () => {
  const target = { branchId: id, roomTypeId: other };
  current = { ...initial, target, localVersion: null };
  await render(ui('owner', false, target, 'Two beds'));
  await press('View billing policy for Two beds');
  await screen.findByText('Uses the branch rules');
  await press('Edit billing policy');
  await fireEvent.changeText(screen.getByLabelText('Grace period (days)'), '4');
  await press('Save new billing policy version');
  await screen.findByText('Billing policy version saved.');
  expect(jest.mocked(saveBillingSettings).mock.calls[0]?.[1]).toEqual(target);
});
it('RENT-003: cancel and close discard unsaved drafts without mutation', async () => {
  await edit();
  await fireEvent.changeText(screen.getByLabelText('Grace period (days)'), '8');
  await press('Cancel billing policy edit');
  await press('Edit billing policy');
  expect(screen.getByLabelText('Grace period (days)').props.value).toBe('3');
  await fireEvent.changeText(screen.getByLabelText('Grace period (days)'), '9');
  await press('Close billing policy');
  await press('View billing policy');
  await screen.findByRole('button', { name: 'Edit billing policy' });
  await press('Edit billing policy');
  expect(screen.getByLabelText('Grace period (days)').props.value).toBe('3');
  expect(saveBillingSettings).not.toHaveBeenCalled();
});
it('FIN-004: exact fixed rent and independent monthly-fee cadence survive native selection', async () => {
  const configured = billingPolicySchema.parse({
    ...policy,
    cycle: { kind: 'week', dueOffsetDays: 0 },
    proration: { kind: 'fixed_first_period', amountPaisa: 1250 },
    feeBilling: { oneTimeDueOffsetDays: 2 },
  });
  current = {
    ...initial,
    localVersion: { ...version, policy: configured },
    effectiveVersion: { ...version, policy: configured },
  };
  await edit();
  expect(screen.getByLabelText('Rent proration fixed amount (PKR)').props.value).toBe('12.50');
  await press('Monthly fee timing: Not configured');
  await fireEvent.press(screen.getByRole('radio', { name: 'Monthly fee timing: Configured' }));
  await choose('Monthly fee cycle', 'Calendar month');
  await fireEvent.changeText(screen.getByLabelText('Monthly fee due day (1–31)'), '10');
  await choose('Monthly fee proration', 'Full period');
  await press('Save new billing policy version');
  await screen.findByText('Billing policy version saved.');
  expect(jest.mocked(saveBillingSettings).mock.calls[0]?.[2]).toEqual({
    policy: {
      ...configured,
      feeBilling: {
        oneTimeDueOffsetDays: 2,
        monthly: {
          cycle: { kind: 'calendar_month', dueDay: 10 },
          proration: { kind: 'full_period' },
        },
      },
    },
  });
});
it('SEC-003: pending save has no early success and late completion cannot restore another actor', async () => {
  let finish: ((value: typeof version) => void) | undefined;
  jest.mocked(saveBillingSettings).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const view = await render(ui());
  await press('View billing policy');
  await screen.findByRole('button', { name: 'Edit billing policy' });
  await press('Edit billing policy');
  await press('Save new billing policy version');
  await waitFor(() => expect(saveBillingSettings).toHaveBeenCalledTimes(1));
  expect(screen.queryByText('Billing policy version saved.')).toBeNull();
  expect(
    screen.getByRole('button', { name: 'Close billing policy' }).props.accessibilityState.disabled,
  ).toBe(true);
  await view.rerender(ui('another-owner'));
  const complete = finish;
  if (!complete) throw Error('Missing deferred save');
  await act(async () => {
    complete(version);
  });
  expect(screen.getByRole('button', { name: 'View billing policy' })).toBeTruthy();
  expect(screen.queryByText('Billing policy version saved.')).toBeNull();
});

function NavigationProbe() {
  const locked = useNativeInventoryNavigationLocked();
  return <Button label="Next inventory page" disabled={locked} onPress={() => undefined} />;
}
it('RENT-003: open room-type settings lock navigation without blocking their own read; close releases it', async () => {
  await render(
    <QueryClientProvider client={cache}>
      <NativeInventoryNavigationProvider>
        <NavigationProbe />
        <NativeBillingPolicy actorId="owner" target={{ branchId: id }} />
      </NativeInventoryNavigationProvider>
    </QueryClientProvider>,
  );
  expect(
    screen.getByRole('button', { name: 'Next inventory page' }).props.accessibilityState.disabled,
  ).toBe(false);
  await press('View billing policy');
  await screen.findByRole('button', { name: 'Edit billing policy' });
  expect(
    screen.getByRole('button', { name: 'Next inventory page' }).props.accessibilityState.disabled,
  ).toBe(true);
  await press('Close billing policy');
  expect(
    screen.getByRole('button', { name: 'Next inventory page' }).props.accessibilityState.disabled,
  ).toBe(false);
});
it('SEC-003: initial request failure can close without retaining an inaccessible draft', async () => {
  jest.mocked(readBillingSettings).mockRejectedValueOnce(new Error('private outage'));
  await render(ui());
  await press('View billing policy');
  await screen.findAllByRole('alert');
  await press('Close billing policy');
  expect(screen.getByRole('button', { name: 'View billing policy' })).toBeTruthy();
  await press('View billing policy');
  await screen.findByRole('button', { name: 'Edit billing policy' });
  expect(saveBillingSettings).not.toHaveBeenCalled();
});
it('FIN-004: malformed decimal never reaches the server and a valid correction preserves exact paisa', async () => {
  const configured = billingPolicySchema.parse({
    ...policy,
    lateCharge: { kind: 'fixed', amountPaisa: 1250 },
  });
  current = {
    ...initial,
    localVersion: { ...version, policy: configured },
    effectiveVersion: { ...version, policy: configured },
  };
  await edit();
  expect(screen.getByLabelText('Late charge (PKR)').props.value).toBe('12.50');
  await fireEvent.changeText(screen.getByLabelText('Late charge (PKR)'), '12.501');
  await press('Save new billing policy version');
  expect(saveBillingSettings).not.toHaveBeenCalled();
  expect(screen.getByRole('alert')).toBeTruthy();
  await fireEvent.changeText(screen.getByLabelText('Late charge (PKR)'), '12.51');
  await press('Save new billing policy version');
  await screen.findByText('Billing policy version saved.');
  expect(jest.mocked(saveBillingSettings).mock.calls[0]?.[2]).toEqual({
    policy: { ...configured, lateCharge: { kind: 'fixed', amountPaisa: 1251 } },
  });
});
