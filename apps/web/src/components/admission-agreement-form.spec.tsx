import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import {
  billingSettingsReadSchema,
  billingCatalogEntrySchema,
  billingPolicyVersionSchema,
} from '@hsm/contracts';
import { AdmissionAgreementForm } from './admission-agreement-form';
import {
  admissionUiManual,
  admissionUiId as id,
  admissionUiOther as other,
} from './admission-ui.fixture';
afterEach(cleanup);
function fixture() {
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
  const props = {
    actorId: id,
    branchId: id,
    roomTypeId: id,
    resident: manual.resident,
    target: manual.target,
    settings,
    fees: manual.terms.fees,
    catalog: [catalog],
    disabled: false,
    unavailable: false,
    onReview: vi.fn(),
    onBack: vi.fn(),
  };
  return { ...render(<AdmissionAgreementForm {...props} />), props, manual, catalog, version };
}
function value(label: string, text: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value: text } });
}
function fill() {
  value('Agreed move-in date', '2028-01-15');
  value('Agreed expected leave date', '2028-05-01');
  value('Agreed rent per billing period (PKR)', '18000.01');
  value('Agreed deposit (PKR)', '10000.01');
}
function submit() {
  fireEvent.submit(screen.getByRole('form', { name: 'Agree resident Stay terms' }));
}
it('STAY-001 / RENT-003: dates and financial amounts start empty and no implicit zero agreement is emitted', () => {
  const f = fixture();
  expect((screen.getByLabelText('Agreed move-in date') as HTMLInputElement).value).toBe('');
  expect((screen.getByLabelText('Agreed deposit (PKR)') as HTMLInputElement).value).toBe('');
  submit();
  expect(f.props.onReview).not.toHaveBeenCalled();
  expect(screen.getByRole('alert')).toBeDefined();
});
it('RENT-003 / RES-001: exact paisa and original offline relationship reach the explicit review without a payment', () => {
  const f = fixture();
  fill();
  submit();
  expect(f.props.onReview).toHaveBeenCalledWith(f.manual);
  expect(screen.queryByText('Paid')).toBeNull();
  expect(f.props.onBack).not.toHaveBeenCalled();
});
it.each(['', '1.001', '-1', '1e3'])(
  'RENT-003: malformed or missing rent %s cannot be reviewed',
  (amount) => {
    const f = fixture();
    fill();
    value('Agreed rent per billing period (PKR)', amount);
    submit();
    expect(f.props.onReview).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toBeDefined();
  },
);
it('RENT-003: explicitly agreed zero rent and deposit remain exact zero', () => {
  const f = fixture();
  fill();
  value('Agreed rent per billing period (PKR)', '0');
  value('Agreed deposit (PKR)', '0');
  submit();
  expect(f.props.onReview.mock.calls[0]?.[0].terms).toMatchObject({
    rentAmountPaisa: 0,
    depositPaisa: 0,
  });
});
it('FIN-004: fees and approved catalogue unit prices require deliberate disclosure and never create a charge', () => {
  const f = fixture();
  const settings = {
    ...f.props.settings,
    effectiveVersion: {
      ...f.version,
      policy: { ...f.manual.terms.policy, customCharges: 'catalog_only' as const },
    },
  };
  const fees = [{ code: 'admission' as const, cadence: 'one_time' as const, amountPaisa: 12345 }];
  f.rerender(<AdmissionAgreementForm {...f.props} settings={settings} fees={fees} />);
  fill();
  submit();
  expect(f.props.onReview.mock.calls[0]?.[0].terms).toMatchObject({ fees: [], catalog: [] });
  fireEvent.click(screen.getByRole('checkbox', { name: /^admission / }));
  fireEvent.click(screen.getByLabelText(/Laundry unit/));
  submit();
  expect(f.props.onReview.mock.calls[1]?.[0].terms).toMatchObject({
    fees,
    catalog: [{ catalogId: other, unitAmountPaisa: 1001 }],
  });
  fireEvent.click(screen.getByLabelText(/Laundry unit/));
  submit();
  expect(f.props.onReview.mock.calls[2]?.[0].terms.catalog).toEqual([]);
});
it('STAY-001: open-ended admission requires the actual policy and an explicit checked choice', () => {
  const f = fixture();
  const settings = {
    ...f.props.settings,
    effectiveVersion: {
      ...f.version,
      policy: { ...f.manual.terms.policy, allowOpenEnded: true },
    },
  };
  f.rerender(<AdmissionAgreementForm {...f.props} settings={settings} />);
  fill();
  fireEvent.click(screen.getByLabelText('Explicitly agree an open-ended Stay'));
  expect(screen.queryByLabelText('Agreed expected leave date')).toBeNull();
  submit();
  expect(f.props.onReview.mock.calls[0]?.[0].period.expectedLeaveDate).toBeNull();
});
it('RENT-003: a term policy cannot offer an open-ended agreement', () => {
  const f = fixture();
  const settings = {
    ...f.props.settings,
    effectiveVersion: {
      ...f.version,
      policy: {
        ...f.manual.terms.policy,
        allowOpenEnded: true,
        cycle: { kind: 'term' as const, dueOffsetDays: 0 },
      },
    },
  };
  f.rerender(<AdmissionAgreementForm {...f.props} settings={settings} />);
  expect(screen.queryByLabelText('Explicitly agree an open-ended Stay')).toBeNull();
  fill();
  value('Agreed expected leave date', '');
  submit();
  expect(f.props.onReview).not.toHaveBeenCalled();
});
it.each(['branch', 'room_type', 'missing'] as const)(
  'SEC-003: %s billing scope mismatch hides the private agreement',
  (scope) => {
    const f = fixture();
    const settings =
      scope === 'missing'
        ? { ...f.props.settings, effectiveVersion: null }
        : {
            ...f.props.settings,
            effectiveVersion: {
              ...f.version,
              level: scope,
              scopeId: other,
            },
          };
    f.rerender(<AdmissionAgreementForm {...f.props} settings={settings} />);
    expect(screen.queryByRole('form')).toBeNull();
    expect(screen.getByRole('alert')).toBeDefined();
  },
);
it('SEC-003: a foreign billing target cannot be substituted even when its policy is inherited', () => {
  const f = fixture();
  f.rerender(
    <AdmissionAgreementForm
      {...f.props}
      settings={{ ...f.props.settings, target: { branchId: other, roomTypeId: id } }}
    />,
  );
  expect(screen.queryByRole('form')).toBeNull();
});
it('ACC-004: changed policy requires re-entry instead of retaining old agreed amounts', () => {
  const f = fixture();
  fill();
  f.rerender(
    <AdmissionAgreementForm
      {...f.props}
      settings={{
        ...f.props.settings,
        effectiveVersion: { ...f.version, id: other },
      }}
    />,
  );
  expect(
    (screen.getByLabelText('Agreed rent per billing period (PKR)') as HTMLInputElement).value,
  ).toBe('');
  submit();
  expect(f.props.onReview).not.toHaveBeenCalled();
});
it('SEC-003: access loss and restoration discard unsent private agreement values', () => {
  const f = fixture();
  fill();
  f.rerender(<AdmissionAgreementForm {...f.props} unavailable />);
  expect(screen.queryByRole('form')).toBeNull();
  f.rerender(<AdmissionAgreementForm {...f.props} />);
  expect((screen.getByLabelText('Agreed move-in date') as HTMLInputElement).value).toBe('');
});
it('ACC-004: pending state blocks even direct form dispatch and cancellation', () => {
  const f = fixture();
  fill();
  f.rerender(<AdmissionAgreementForm {...f.props} disabled />);
  submit();
  fireEvent.click(screen.getByRole('button', { name: 'Back to admission target' }));
  expect(f.props.onReview).not.toHaveBeenCalled();
  expect(f.props.onBack).not.toHaveBeenCalled();
});
it('SEC-003 / FIN-004: inactive or foreign catalogue entries are not disclosed', () => {
  const f = fixture();
  const settings = {
    ...f.props.settings,
    effectiveVersion: {
      ...f.version,
      policy: { ...f.manual.terms.policy, customCharges: 'catalog_only' as const },
    },
  };
  f.rerender(
    <AdmissionAgreementForm
      {...f.props}
      settings={settings}
      catalog={[
        { ...f.catalog, branchId: other },
        { ...f.catalog, archivedAt: '2028-02-01T00:00:00.000Z' },
      ]}
    />,
  );
  expect(screen.queryByLabelText(/Laundry unit/)).toBeNull();
});
it('STAY-001: backing out remains an explicit action before review', () => {
  const f = fixture();
  fireEvent.click(screen.getByRole('button', { name: 'Back to admission target' }));
  expect(f.props.onBack).toHaveBeenCalledTimes(1);
  expect(f.props.onReview).not.toHaveBeenCalled();
});
