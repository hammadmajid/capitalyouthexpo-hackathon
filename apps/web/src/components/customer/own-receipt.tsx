'use client';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { marketplacePrice, ownReceiptPdfPath, readCustomerStayReceipt } from '@hsm/api-client';
import { browserClient } from '../../lib/client';
import { errorMessage } from '../../lib/messages';
import { Button } from '../ui/button';
type Props = { actorId: string; stayId: string; receiptId: string };
// PAY-008 / BR-01: a receipt exists only for a payment the hostel approved. It shows what the
// hostel recorded, including a later reversal, and the platform never holds the money.
export function OwnReceipt({ actorId, stayId, receiptId }: Props) {
  const [open, setOpen] = useState(false);
  const receipt = useQuery({
    queryKey: ['own-receipt', actorId, stayId, receiptId],
    gcTime: 0,
    retry: false,
    enabled: open,
    queryFn: () => readCustomerStayReceipt(browserClient(), stayId, receiptId),
  });
  const value = receipt.data;
  return (
    <span className="block space-y-1">
      <Button variant="ghost" onClick={() => setOpen(!open)}>
        {open ? 'Hide receipt' : 'View receipt'}
      </Button>{' '}
      <a href={'/api' + ownReceiptPdfPath(stayId, receiptId)} download>
        Download receipt PDF
      </a>
      {open && receipt.isPending ? <span role="status">Loading receipt…</span> : null}
      {open && receipt.error ? (
        <span role="alert" className="block">
          {errorMessage(receipt.error)}
        </span>
      ) : null}
      {open && value ? (
        <span aria-label="Payment receipt" className="block space-y-1 text-sm">
          <span className="block font-semibold">Receipt {value.receiptNumber}</span>
          <span className="block">
            {marketplacePrice(value.snapshot.amountPaisa)} received by {value.snapshot.hostelName}{' '}
            on {value.snapshot.paidOn}
          </span>
          {value.snapshot.distribution.depositPaisa > 0 ? (
            <span className="block">
              Security deposit: {marketplacePrice(value.snapshot.distribution.depositPaisa)}
            </span>
          ) : null}
          <span className="block">
            Bills: {marketplacePrice(value.snapshot.distribution.allocatedPaisa)}
          </span>
          {value.reversed ? (
            <span role="alert" className="block">
              This payment was reversed by the hostel.
            </span>
          ) : null}
        </span>
      ) : null}
    </span>
  );
}
