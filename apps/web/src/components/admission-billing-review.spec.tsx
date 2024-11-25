import type { ManualAdmissionCommand } from '@hsm/contracts';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { AdmissionBillingReview } from './admission-billing-review';
import {
  admissionUiManual,
  admissionUiId as id,
  admissionUiOther as other,
} from './admission-ui.fixture';
afterEach(cleanup);
function fixture(manual = admissionUiManual()) {
  const onAdmit = vi.fn<(command: ManualAdmissionCommand) => void>(),
    onBack = vi.fn();
  const props = {
    actorId: id,
    branchId: id,
    branchLabel: 'Garden branch',
    residentLabel: 'Offline resident',
    targetLabel: 'Room101 · BedA',
    manual,
    pending: false,
    unavailable: false,
    onAdmit,
    onBack,
  };
  return { props, onAdmit, onBack };
}
function date(label = 'Rent billing starts', value = '2028-01-15') {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}
function review() {
  fireEvent.click(screen.getByRole('button', { name: 'Review admission' }));
}
function confirm() {
  fireEvent.click(screen.getByRole('checkbox'));
  fireEvent.click(screen.getByRole('button', { name: 'Admit resident' }));
}
it('W-17 / STAY-001 / FIN-004: named exact-amount review requires deliberate confirmation before any command', () => {
  const f = fixture();
  render(<AdmissionBillingReview {...f.props} />);
  expect(screen.getByText('PKR 18,000.01')).toBeDefined();
  expect(screen.getByText('PKR 10,000.01')).toBeDefined();
  expect(screen.queryByText(id)).toBeNull();
  date();
  review();
  expect(f.onAdmit).not.toHaveBeenCalled();
  expect(
    (screen.getByRole('button', { name: 'Admit resident' }) as HTMLButtonElement).disabled,
  ).toBe(true);
  confirm();
  expect(f.onAdmit).toHaveBeenCalledTimes(1);
  expect(f.onAdmit).toHaveBeenCalledWith({
    manual: f.props.manual,
    initialBilling: [{ item: 'rent', cadence: 'periodic', periodIndex: 0 }],
  });
});
it('RENT-003: absent period does not silently select original or current rent', () => {
  const f = fixture();
  render(<AdmissionBillingReview {...f.props} />);
  const form = screen.getByRole('button', { name: 'Review admission' }).closest('form');
  if (!form) throw Error('Review form absent');
  fireEvent.submit(form);
  expect(screen.getByRole('alert')).toBeDefined();
  expect(f.onAdmit).not.toHaveBeenCalled();
  expect(screen.queryByRole('button', { name: 'Admit resident' })).toBeNull();
});
it('RENT-003: manual partial amount is required and explicit zero survives confirmation', () => {
  const manual = admissionUiManual();
  manual.terms.policy.proration = { kind: 'manual' };
  const f = fixture(manual);
  render(<AdmissionBillingReview {...f.props} />);
  date();
  expect(screen.getByLabelText('Rent partial amount')).toBeDefined();
  fireEvent.change(screen.getByLabelText('Rent partial amount'), { target: { value: '0.00' } });
  expect(screen.getByText('PKR 0.00')).toBeDefined();
  review();
  confirm();
  expect(f.onAdmit.mock.calls[0]?.[0].initialBilling).toEqual([
    { item: 'rent', cadence: 'periodic', periodIndex: 0, manualAmountPaisa: 0 },
  ]);
});
it('FIN-004: mandatory disclosed one-time fee is retained without inventing a receipt or duplicate period', () => {
  const manual = admissionUiManual();
  manual.terms.fees = [{ code: 'admission', cadence: 'one_time', amountPaisa: 501 }];
  manual.terms.policy.feeBilling = { oneTimeDueOffsetDays: 2 };
  const f = fixture(manual);
  render(<AdmissionBillingReview {...f.props} />);
  date();
  review();
  confirm();
  expect(f.onAdmit.mock.calls[0]?.[0].initialBilling).toEqual([
    { item: 'rent', cadence: 'periodic', periodIndex: 0 },
    { item: 'admission', cadence: 'one_time', periodIndex: 0 },
  ]);
  expect(screen.queryByText('Paid')).toBeNull();
});
it('RENT-003 / FIN-004: rent and monthly mess keep separate explicitly chosen calendars', () => {
  const manual = admissionUiManual();
  manual.terms.policy.cycle = { kind: 'week', dueOffsetDays: 0 };
  manual.terms.policy.feeBilling = {
    oneTimeDueOffsetDays: 0,
    monthly: { cycle: { kind: 'calendar_month', dueDay: 10 }, proration: { kind: 'full_period' } },
  };
  manual.terms.fees = [{ code: 'mess', cadence: 'monthly', amountPaisa: 501 }];
  const f = fixture(manual);
  render(<AdmissionBillingReview {...f.props} />);
  date('Rent billing starts', '2028-01-29');
  date('mess (monthly) billing starts', '2028-02-01');
  review();
  confirm();
  expect(f.onAdmit.mock.calls[0]?.[0].initialBilling).toEqual([
    { item: 'rent', cadence: 'periodic', periodIndex: 2 },
    { item: 'mess', cadence: 'periodic', periodIndex: 1 },
  ]);
});
it('ACC-004: editing periods resets confirmation rather than reusing approval for changed intent', () => {
  const f = fixture();
  render(<AdmissionBillingReview {...f.props} />);
  date();
  review();
  fireEvent.click(screen.getByRole('checkbox'));
  fireEvent.click(screen.getByRole('button', { name: 'Edit billing periods' }));
  date('Rent billing starts', '2028-02-01');
  review();
  expect((screen.getByRole('checkbox') as HTMLInputElement).checked).toBe(false);
  expect(f.onAdmit).not.toHaveBeenCalled();
});
it('SEC-003: unavailable access hides private review and cannot submit', () => {
  const f = fixture();
  const view = render(<AdmissionBillingReview {...f.props} />);
  date();
  review();
  view.rerender(<AdmissionBillingReview {...f.props} unavailable />);
  expect(screen.getByRole('alert')).toBeDefined();
  expect(screen.queryByText(/Garden branch/)).toBeNull();
  expect(screen.queryByRole('button', { name: 'Admit resident' })).toBeNull();
  expect(f.onAdmit).not.toHaveBeenCalled();
});
it('ACC-004: pending command disables confirmation and navigation', () => {
  const f = fixture();
  const view = render(<AdmissionBillingReview {...f.props} />);
  date();
  review();
  fireEvent.click(screen.getByRole('checkbox'));
  view.rerender(<AdmissionBillingReview {...f.props} pending />);
  fireEvent.click(screen.getByRole('button', { name: 'Admitting…' }));
  fireEvent.click(screen.getByRole('button', { name: 'Back to resident details' }));
  expect(f.onAdmit).not.toHaveBeenCalled();
  expect(f.onBack).not.toHaveBeenCalled();
});
it('ACC-004: uncertain result retries the exact reviewed command while edits stay disabled', () => {
  const f = fixture();
  const view = render(<AdmissionBillingReview {...f.props} />);
  date();
  review();
  confirm();
  const first = f.onAdmit.mock.calls[0]?.[0];
  view.rerender(<AdmissionBillingReview {...f.props} uncertain />);
  expect(
    (screen.getByRole('button', { name: 'Edit billing periods' }) as HTMLButtonElement).disabled,
  ).toBe(true);
  expect(
    (screen.getByRole('button', { name: 'Back to resident details' }) as HTMLButtonElement)
      .disabled,
  ).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: 'Retry same admission' }));
  expect(f.onAdmit).toHaveBeenNthCalledWith(2, first);
});
it.each(['actor', 'branch', 'policy'] as const)(
  'SEC-003 / ACC-004: changed %s context cannot retain the old confirmed command',
  (kind) => {
    const f = fixture();
    const view = render(<AdmissionBillingReview {...f.props} />);
    date();
    review();
    fireEvent.click(screen.getByRole('checkbox'));
    const props = {
      ...f.props,
      ...(kind === 'actor' ? { actorId: other } : {}),
      ...(kind === 'branch' ? { branchId: other } : {}),
      ...(kind === 'policy'
        ? {
            manual: {
              ...f.props.manual,
              terms: { ...f.props.manual.terms, policyVersionId: other },
            },
          }
        : {}),
    };
    view.rerender(<AdmissionBillingReview {...props} />);
    expect(screen.queryByRole('button', { name: 'Admit resident' })).toBeNull();
    expect((screen.getByLabelText('Rent billing starts') as HTMLInputElement).value).toBe('');
    expect(f.onAdmit).not.toHaveBeenCalled();
  },
);
it('FIN-004: agreed catalogue unit prices are disclosed without automatically charging extras', () => {
  const manual = admissionUiManual();
  manual.terms.policy.customCharges = 'catalog_only';
  manual.terms.catalog = [
    {
      catalogId: other,
      code: 'linen',
      name: 'Linen replacement',
      unitLabel: 'item',
      unitAmountPaisa: 501,
    },
  ];
  const f = fixture(manual);
  render(<AdmissionBillingReview {...f.props} />);
  expect(screen.getByText(/Linen replacement: PKR 5\.01/)).toBeDefined();
  date();
  review();
  confirm();
  expect(f.onAdmit.mock.calls[0]?.[0].initialBilling).toHaveLength(1);
  expect(f.onAdmit.mock.calls[0]?.[0].manual.terms.catalog).toEqual(manual.terms.catalog);
});

it('SEC-003: restored access requires a fresh review and confirmation for an unsubmitted admission', () => {
  const f = fixture();
  const view = render(<AdmissionBillingReview {...f.props} />);
  date();
  review();
  fireEvent.click(screen.getByRole('checkbox'));
  view.rerender(<AdmissionBillingReview {...f.props} unavailable />);
  view.rerender(<AdmissionBillingReview {...f.props} />);
  expect(screen.queryByRole('button', { name: 'Admit resident' })).toBeNull();
  expect((screen.getByLabelText('Rent billing starts') as HTMLInputElement).value).toBe('');
  expect(f.onAdmit).not.toHaveBeenCalled();
});

it('ACC-004: uncertain admission keeps its exact confirmed command through access loss and restoration', () => {
  const f = fixture();
  const view = render(<AdmissionBillingReview {...f.props} />);
  date();
  review();
  confirm();
  const original = f.onAdmit.mock.calls[0]?.[0];
  view.rerender(<AdmissionBillingReview {...f.props} unavailable uncertain />);
  expect(screen.queryByText(/Garden branch/)).toBeNull();
  view.rerender(<AdmissionBillingReview {...f.props} uncertain />);
  fireEvent.click(screen.getByRole('button', { name: 'Retry same admission' }));
  expect(f.onAdmit).toHaveBeenNthCalledWith(2, original);
  expect(
    (screen.getByRole('button', { name: 'Edit billing periods' }) as HTMLButtonElement).disabled,
  ).toBe(true);
});
