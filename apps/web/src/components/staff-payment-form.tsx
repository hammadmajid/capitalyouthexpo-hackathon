'use client';
import { useState } from 'react';
import { externalPaymentDraftSchema } from '@hsm/api-client';
import type { RecordExternalPaymentInput } from '@hsm/contracts';
import { Button } from './ui/button';
import { PaymentInvoiceChoices } from './payment-invoice-choices';
import { PaymentFormFields, type PaymentDraftValues } from './payment-form-fields';
import { StaffPaymentReview } from './staff-payment-review';
import { StaffPaymentProof, type StaffPaymentProofState } from './staff-payment-proof';
type Props = {
  actorId: string;
  branchId: string;
  stayId: string;
  residentLabel: string;
  transportOnly?: boolean;
  onRecord: (command: RecordExternalPaymentInput) => void;
};
export function StaffPaymentForm(props: Props) {
  const [draft, setDraft] = useState<PaymentDraftValues>({
    amount: '',
    method: '',
    paidOn: '',
    note: '',
    transactionReference: '',
    deposit: props.transportOnly ? '0' : '',
    advanceCredit: '0',
    allocations: [],
  });
  const [review, setReview] = useState<{ command: RecordExternalPaymentInput; labels: string[] }>();
  const [proof, setProof] = useState<StaffPaymentProofState>({
    attached: false,
    busy: false,
    fileId: undefined,
  });
  const proofReady = !proof.busy && (!proof.attached || Boolean(proof.fileId));
  const parsed = externalPaymentDraftSchema.safeParse({
    ...draft,
    ...(proof.attached && proof.fileId ? { proofFileId: proof.fileId } : {}),
    allocations: draft.allocations.map(({ invoiceId, amount }) => ({ invoiceId, amount })),
  });
  if (review)
    return (
      <StaffPaymentReview
        residentLabel={props.residentLabel}
        {...review}
        onEdit={() => setReview(undefined)}
        onRecord={() => props.onRecord(review.command)}
      />
    );
  return (
    <section aria-label="External payment draft" className="space-y-4">
      <h4 className="font-semibold">Payment for {props.residentLabel}</h4>
      <p>
        {props.transportOnly
          ? 'Allocate the received PKR amount to Transport invoices.'
          : 'Enter every amount in PKR. Enter 0 for unused security. The total must exactly match selected bill allocations and security; excess payments are blocked.'}
      </p>
      <PaymentFormFields
        value={draft}
        hideDeposit={Boolean(props.transportOnly)}
        onChange={(patch) => setDraft((current) => ({ ...current, ...patch }))}
        onAllocation={(invoiceId, amount) =>
          setDraft((current) => ({
            ...current,
            allocations: current.allocations.map((row) =>
              row.invoiceId === invoiceId ? { ...row, amount } : row,
            ),
          }))
        }
        onRemove={(id) =>
          setDraft((current) => ({
            ...current,
            allocations: current.allocations.filter((row) => row.invoiceId !== id),
          }))
        }
      />
      <StaffPaymentProof
        id={'staff-proof-' + props.branchId + '-' + props.stayId}
        value={proof}
        onChange={setProof}
      />
      <PaymentInvoiceChoices
        {...props}
        chosen={draft.allocations.map((row) => row.invoiceId)}
        onChoose={(invoiceId, invoiceNumber) =>
          setDraft((current) =>
            current.allocations.length >= 100 ||
            current.allocations.some((row) => row.invoiceId === invoiceId)
              ? current
              : {
                  ...current,
                  allocations: [...current.allocations, { invoiceId, invoiceNumber, amount: '' }],
                },
          )
        }
      />
      {!parsed.success ? (
        <p>Complete the required fields and exact allocation before reviewing.</p>
      ) : null}
      <Button
        disabled={!parsed.success || !proofReady}
        onClick={() => {
          if (parsed.success && proofReady)
            setReview({
              command: parsed.data,
              labels: draft.allocations.map((row) => row.invoiceNumber),
            });
        }}
      >
        Review payment
      </Button>
    </section>
  );
}
