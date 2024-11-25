'use client';
import { externalPaymentMethodSchema } from '@hsm/contracts';
import { Button } from './ui/button';
export type PaymentDraftValues = {
  amount: string;
  method: string;
  paidOn: string;
  note: string;
  transactionReference: string;
  deposit: string;
  advanceCredit: string;
  allocations: { invoiceId: string; invoiceNumber: string; amount: string }[];
};
export function PaymentTextField({
  label,
  value,
  onChange,
  type = 'text',
  maxLength = 17,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: 'text' | 'date';
  maxLength?: number;
}) {
  return (
    <label className="field-label">
      {label}
      <input
        className="field-input"
        type={type}
        value={value}
        maxLength={maxLength}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}
export function PaymentFormFields({
  value,
  onChange,
  onAllocation,
  onRemove,
  hideDeposit = false,
}: {
  value: PaymentDraftValues;
  hideDeposit?: boolean;
  onChange: (patch: Partial<PaymentDraftValues>) => void;
  onAllocation: (id: string, amount: string) => void;
  onRemove: (id: string) => void;
}) {
  return (
    <div className="space-y-3">
      <PaymentTextField
        label="Total received (PKR)"
        value={value.amount}
        onChange={(amount) => onChange({ amount })}
      />
      <label className="field-label">
        Payment method
        <select
          className="field-input"
          value={value.method}
          onChange={(event) => onChange({ method: event.target.value })}
        >
          <option value="" disabled>
            Select payment method
          </option>
          {externalPaymentMethodSchema.options.map((method) => (
            <option key={method} value={method}>
              {method.replaceAll('_', ' ')}
            </option>
          ))}
        </select>
      </label>
      <PaymentTextField
        label="Date received"
        value={value.paidOn}
        type="date"
        onChange={(paidOn) => onChange({ paidOn })}
      />
      <PaymentTextField
        label="External reference (optional)"
        value={value.transactionReference}
        maxLength={160}
        onChange={(transactionReference) => onChange({ transactionReference })}
      />
      <PaymentTextField
        label="Recording note"
        value={value.note}
        maxLength={500}
        onChange={(note) => onChange({ note })}
      />
      {hideDeposit ? null : (
        <>
          <PaymentTextField
            label="Deposit received (PKR)"
            value={value.deposit}
            onChange={(deposit) => onChange({ deposit })}
          />
        </>
      )}
      <ul className="space-y-3">
        {value.allocations.map((row) => (
          <li key={row.invoiceId}>
            <PaymentTextField
              label={'Allocation for ' + row.invoiceNumber + ' (PKR)'}
              value={row.amount}
              onChange={(amount) => onAllocation(row.invoiceId, amount)}
            />
            <Button variant="ghost" onClick={() => onRemove(row.invoiceId)}>
              Remove allocation {row.invoiceNumber}
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}
