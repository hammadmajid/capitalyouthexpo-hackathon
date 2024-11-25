import { useState, type ComponentProps } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { readInventoryAccess } from '@hsm/api-client';
import {
  billingSettingsReadSchema,
  billingPolicyVersionSchema,
  type InventoryAccess,
} from '@hsm/contracts';
import { AdmissionWorkflow } from './admission-workflow';
import {
  admissionUiManual,
  admissionUiId as id,
  admissionUiOther as other,
} from './admission-ui.fixture';
import { inventory, type as roomType } from '../../test/unit/inventory-pages.fixture';
const observed = vi.hoisted(() => ({ agreement: vi.fn(), submission: vi.fn() }));
vi.mock('@hsm/api-client', async (original) => ({
  ...(await original<typeof import('@hsm/api-client')>()),
  readInventoryAccess: vi.fn(),
}));
vi.mock('../lib/client', () => ({ browserClient: () => ({}) }));
vi.mock('./admission-resident-picker', () => ({
  AdmissionResidentPicker: (
    props: ComponentProps<typeof import('./admission-resident-picker').AdmissionResidentPicker>,
  ) => (
    <button
      disabled={props.pending}
      onClick={() => props.onChoose(admissionUiManual().resident, 'Chosen resident')}
    >
      Choose resident
    </button>
  ),
}));
vi.mock('./admission-target-choice', () => ({
  AdmissionTargetChoice: (
    props: ComponentProps<typeof import('./admission-target-choice').AdmissionTargetChoice>,
  ) => (
    <button
      disabled={props.disabled}
      onClick={() => {
        props.onRoom(id);
        props.onChoose(admissionUiManual().target, 'Named physical bed');
      }}
    >
      Choose physical target
    </button>
  ),
}));
vi.mock('./admission-agreement-form', () => ({
  AdmissionAgreementForm: (
    props: ComponentProps<typeof import('./admission-agreement-form').AdmissionAgreementForm>,
  ) => {
    observed.agreement(props);
    return (
      <button
        disabled={props.disabled}
        onClick={() =>
          props.onReview({ ...admissionUiManual(), resident: props.resident, target: props.target })
        }
      >
        Review original agreement
      </button>
    );
  },
}));
vi.mock('./admission-submission', () => ({
  AdmissionSubmission: (
    props: ComponentProps<typeof import('./admission-submission').AdmissionSubmission>,
  ) => {
    observed.submission(props);
    const [token] = useState(() => crypto.randomUUID());
    return (
      <section aria-label="Submitted admission">
        <span data-testid="submission-instance">{token}</span>
        <button onClick={props.onBack}>Back from submission</button>
        <button onClick={props.onDone}>Finish admission</button>
      </section>
    );
  },
}));
const caches: QueryClient[] = [];
const grants: InventoryAccess['permissions'] = ['stay_manage', 'rent_manage', 'finance_view'];
function access(permissions = grants) {
  return { branchId: id, permissions, canConfigureManagers: false };
}
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(readInventoryAccess).mockResolvedValue(access());
});
afterEach(() => {
  cleanup();
  for (const cache of caches.splice(0)) cache.clear();
});
function fixture(unavailable = false) {
  const manual = admissionUiManual();
  const settings = billingSettingsReadSchema.parse({
    target: { branchId: id, roomTypeId: id },
    canEdit: false,
    localVersion: null,
    effectiveVersion: {
      id,
      level: 'branch',
      scopeId: id,
      policy: manual.terms.policy,
      createdAt: '2028-01-01T00:00:00.000Z',
    },
  });
  const version = billingPolicyVersionSchema.parse(settings.effectiveVersion);
  const props = {
    actorId: id,
    branchId: id,
    branchLabel: 'Current branch',
    roomType: { ...roomType, id, branchId: id },
    rooms: inventory.rooms.map((room) => ({ ...room, branchId: id, roomTypeId: id })),
    settings,
    catalog: [],
    pending: false,
    unavailable,
    navigation: <p>Scoped admission paging</p>,
    onRoom: vi.fn(),
    onCancel: vi.fn(),
    onDone: vi.fn(),
  };
  const cache = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  caches.push(cache);
  function tree(value = props) {
    return (
      <QueryClientProvider client={cache}>
        <AdmissionWorkflow {...value} />
      </QueryClientProvider>
    );
  }
  return { ...render(tree()), props, cache, tree, version };
}
async function resident() {
  fireEvent.click(await screen.findByRole('button', { name: 'Choose resident' }));
}
function target() {
  fireEvent.click(screen.getByRole('button', { name: 'Choose physical target' }));
}
function review() {
  fireEvent.click(screen.getByRole('button', { name: 'Review original agreement' }));
}
it.each(grants)(
  'SEC-003: missing current %s cannot mount the private admission draft',
  async (missing) => {
    vi.mocked(readInventoryAccess).mockResolvedValue(
      access(grants.filter((grant) => grant !== missing)),
    );
    const f = fixture();
    await waitFor(() =>
      expect(f.cache.getQueryState(['inventory-access', id, id])?.status).toBe('success'),
    );
    const refresh = screen.getByText('Refresh admission access');
    expect(refresh.tagName).toBe('BUTTON');
    expect(refresh).toHaveProperty('disabled', false);
    expect(readInventoryAccess).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Choose resident')).toBeNull();
    expect(screen.getByRole('alert')).toBeDefined();
  },
);
it('STAY-001: selected branch relationship, physical target and original terms reach the final submission stage', async () => {
  const f = fixture();
  await resident();
  target();
  expect(f.props.onRoom).toHaveBeenCalledWith(id);
  const agreement = observed.agreement.mock.calls.at(-1)?.[0];
  expect(agreement).toMatchObject({
    resident: admissionUiManual().resident,
    target: admissionUiManual().target,
    settings: f.props.settings,
  });
  review();
  expect(observed.submission.mock.calls.at(-1)?.[0]).toMatchObject({
    actorId: id,
    branchId: id,
    residentLabel: 'Chosen resident',
    targetLabel: 'Named physical bed',
    manual: admissionUiManual(),
  });
  fireEvent.click(screen.getByRole('button', { name: 'Finish admission' }));
  expect(f.props.onDone).toHaveBeenCalledTimes(1);
});
it('SEC-003: access loss clears the unsent relationship/target stage before restored access', async () => {
  const f = fixture();
  await resident();
  await act(async () => {
    f.cache.setQueryData(['inventory-access', id, id], access([]));
  });
  await screen.findByRole('alert');
  expect(screen.queryByRole('button', { name: 'Choose physical target' })).toBeNull();
  await act(async () => {
    f.cache.setQueryData(['inventory-access', id, id], access());
  });
  await screen.findByRole('button', { name: 'Choose resident' });
  expect(screen.queryByRole('button', { name: 'Choose physical target' })).toBeNull();
});
it('ACC-004: submitted command stays mounted through access loss and changed inventory/policy props', async () => {
  const f = fixture();
  await resident();
  target();
  review();
  const token = screen.getByTestId('submission-instance').textContent;
  await act(async () => {
    f.cache.setQueryData(['inventory-access', id, id], access([]));
  });
  f.rerender(
    f.tree({
      ...f.props,
      roomType: { ...f.props.roomType, name: 'Changed metadata' },
      settings: {
        ...f.props.settings,
        effectiveVersion: { ...f.version, id: other },
      },
    }),
  );
  expect(screen.getByTestId('submission-instance').textContent).toBe(token);
  expect(observed.submission.mock.calls.at(-1)?.[0].manual).toEqual(admissionUiManual());
  expect(screen.queryByRole('button', { name: 'Cancel admission' })).toBeNull();
});
it('SEC-003: changing the actor discards the previous submitted scope', async () => {
  const f = fixture();
  await resident();
  target();
  review();
  f.rerender(f.tree({ ...f.props, actorId: other }));
  await screen.findByRole('button', { name: 'Choose resident' });
  expect(screen.queryByRole('region', { name: 'Submitted admission' })).toBeNull();
});
it('ACC-004: leaving an unsubmitted review starts a fresh deliberate relationship choice', async () => {
  fixture();
  await resident();
  target();
  review();
  fireEvent.click(screen.getByRole('button', { name: 'Back from submission' }));
  await screen.findByRole('button', { name: 'Choose resident' });
  expect(screen.queryByRole('button', { name: 'Choose physical target' })).toBeNull();
});
it('SEC-003: an unavailable host scope performs no access request and allows safe cancellation', () => {
  const f = fixture(true);
  expect(readInventoryAccess).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Cancel admission' }));
  expect(f.props.onCancel).toHaveBeenCalledTimes(1);
  expect(screen.queryByRole('button', { name: 'Choose resident' })).toBeNull();
});

it('SEC-003 / ACC-004: failed access hides private stages and provider detail, then explicit refresh rechecks authority', async () => {
  vi.mocked(readInventoryAccess).mockRejectedValueOnce(Error('private provider failure detail'));
  fixture();
  await waitFor(() =>
    expect(
      screen.getByRole('button', { name: 'Refresh admission access' }).hasAttribute('disabled'),
    ).toBe(false),
  );
  expect(screen.queryByRole('button', { name: 'Choose resident' })).toBeNull();
  expect(screen.getByRole('alert').textContent).not.toContain('private provider failure detail');
  fireEvent.click(screen.getByRole('button', { name: 'Refresh admission access' }));
  await screen.findByRole('button', { name: 'Choose resident' });
  expect(readInventoryAccess).toHaveBeenCalledTimes(2);
});

it('ACC-004: inventory paging is available only before the protected review stage', async () => {
  const f = fixture();
  await resident();
  expect(screen.getByText('Scoped admission paging')).toBeDefined();
  target();
  review();
  expect(screen.queryByText('Scoped admission paging')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Back from submission' }));
  expect(screen.getByText('Scoped admission paging')).toBeDefined();
  expect(f.props.onCancel).not.toHaveBeenCalled();
});
