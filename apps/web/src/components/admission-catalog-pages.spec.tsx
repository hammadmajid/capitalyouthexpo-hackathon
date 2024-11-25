import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { billingSettingsReadSchema, billingCatalogEntrySchema } from '@hsm/contracts';
import { AdmissionAgreementForm } from './admission-agreement-form';
import {
  admissionUiManual,
  admissionUiId as id,
  admissionUiOther as other,
} from './admission-ui.fixture';
afterEach(cleanup);
function fixture() {
  const manual = admissionUiManual();
  const catalog = billingCatalogEntrySchema.parse({
    id: other,
    branchId: id,
    code: 'laundry',
    name: 'Laundry unit',
    unitLabel: 'wash',
    unitAmountPaisa: 1001,
    createdAt: '2028-01-01T00:00:00.000Z',
    archivedAt: null,
  });
  const settings = billingSettingsReadSchema.parse({
    target: { branchId: id, roomTypeId: id },
    canEdit: false,
    localVersion: null,
    effectiveVersion: {
      id,
      level: 'branch',
      scopeId: id,
      createdAt: '2028-01-01T00:00:00.000Z',
      policy: { ...manual.terms.policy, customCharges: 'catalog_only' },
    },
  });
  const props = {
    actorId: id,
    branchId: id,
    roomTypeId: id,
    resident: manual.resident,
    target: manual.target,
    settings,
    fees: [],
    catalog: [catalog],
    disabled: false,
    unavailable: false,
    onReview: vi.fn(),
    onBack: vi.fn(),
  };
  return { ...render(<AdmissionAgreementForm {...props} />), props, catalog };
}
function fill() {
  fireEvent.change(screen.getByLabelText('Agreed move-in date'), {
    target: { value: '2028-01-15' },
  });
  fireEvent.change(screen.getByLabelText('Agreed expected leave date'), {
    target: { value: '2028-05-01' },
  });
  fireEvent.change(screen.getByLabelText('Agreed rent per billing period (PKR)'), {
    target: { value: '18000.01' },
  });
  fireEvent.change(screen.getByLabelText('Agreed deposit (PKR)'), {
    target: { value: '10000.01' },
  });
}
function nextEntry(entry: ReturnType<typeof fixture>['catalog']) {
  return billingCatalogEntrySchema.parse({
    ...entry,
    id: '10000000-0000-4000-8000-000000000003',
    code: 'ironing',
    name: 'Ironing unit',
  });
}
it('FIN-004 / ACC-004: an explicitly loaded later catalogue page preserves original terms and deliberate selections', () => {
  const f = fixture(),
    next = nextEntry(f.catalog);
  fill();
  fireEvent.click(screen.getByLabelText(/Laundry unit/));
  f.rerender(<AdmissionAgreementForm {...f.props} catalog={[f.catalog, next]} />);
  expect(screen.getByLabelText('Agreed rent per billing period (PKR)')).toHaveProperty(
    'value',
    '18,000.01',
  );
  expect(screen.getByLabelText(/Laundry unit/)).toHaveProperty('checked', true);
  expect(screen.getByLabelText(/Ironing unit/)).toHaveProperty('checked', false);
  fireEvent.click(screen.getByLabelText(/Ironing unit/));
  fireEvent.submit(screen.getByRole('form', { name: 'Agree resident Stay terms' }));
  expect(f.props.onReview).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({
      terms: expect.objectContaining({
        rentAmountPaisa: 1800001,
        depositPaisa: 1000001,
        catalog: expect.arrayContaining([
          expect.objectContaining({ catalogId: f.catalog.id }),
          expect.objectContaining({ catalogId: next.id }),
        ]),
      }),
    }),
  );
});
it('FIN-004 / SEC-003: an entry loaded on a later page remains subject to financial-source refresh invalidation', () => {
  const f = fixture(),
    next = nextEntry(f.catalog);
  f.rerender(<AdmissionAgreementForm {...f.props} catalog={[f.catalog, next]} />);
  fill();
  fireEvent.click(screen.getByLabelText(/Ironing unit/));
  f.rerender(
    <AdmissionAgreementForm
      {...f.props}
      catalog={[f.catalog, { ...next, archivedAt: '2028-02-01T00:00:00.000Z' }]}
    />,
  );
  expect(screen.getByLabelText('Agreed rent per billing period (PKR)')).toHaveProperty('value', '');
  expect(screen.queryByLabelText(/Ironing unit/)).toBeNull();
  expect(screen.getByLabelText(/Laundry unit/)).toHaveProperty('checked', false);
  fireEvent.submit(screen.getByRole('form', { name: 'Agree resident Stay terms' }));
  expect(f.props.onReview).not.toHaveBeenCalled();
});
