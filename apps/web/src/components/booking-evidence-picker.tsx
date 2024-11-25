'use client';
import { useId, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ClientFailure, submitBookingDocument } from '@hsm/api-client';
import type { BookingDocumentSubmission } from '@hsm/contracts';
import { browserClient } from '../lib/client';
import { errorMessage } from '../lib/messages';
import { PrivateFileInput } from './private-file-input';
import { MarketplaceButton as Button } from './ui/marketplace-button';
type Kind = BookingDocumentSubmission['kind'];
export const bookingEvidenceLabels: Record<Kind, string> = {
  cnic: 'CNIC document',
  student_id: 'Student ID',
  admission_proof: 'Admission proof',
  employment_proof: 'Employment proof',
};
export function BookingEvidencePicker(props: {
  actorId: string;
  branchId: string;
  kind: Kind;
  consent: boolean;
  disabled: boolean;
  onReady: (fileId: string | undefined) => void;
  onBusy: (busy: boolean) => void;
}) {
  return <Picker key={props.actorId + ':' + props.branchId + ':' + props.kind} {...props} />;
}
function Picker({
  actorId,
  branchId,
  kind,
  consent,
  disabled,
  onReady,
  onBusy,
}: {
  actorId: string;
  branchId: string;
  kind: Kind;
  consent: boolean;
  disabled: boolean;
  onReady: (fileId: string | undefined) => void;
  onBusy: (busy: boolean) => void;
}) {
  const id = useId(),
    cache = useQueryClient(),
    key = useRef<{ fileId: string; key: string } | undefined>(undefined);
  const [fileId, setFileId] = useState<string>(),
    [shared, setShared] = useState(false);
  const share = useMutation({
    gcTime: 0,
    onMutate: () => onBusy(true),
    onSettled: () => onBusy(false),
    mutationFn: async (selected: string) => {
      if (key.current?.fileId !== selected)
        key.current = { fileId: selected, key: crypto.randomUUID() };
      const result = await submitBookingDocument(
        browserClient(),
        branchId,
        { kind, fileId: selected, shareWithOwner: true },
        key.current.key,
      );
      if (
        result.branchId !== branchId.toLowerCase() ||
        result.kind !== kind ||
        result.fileId !== selected ||
        result.bookingId !== null ||
        result.consumedAt !== null ||
        result.state === 'rejected'
      )
        throw new ClientFailure('INVALID_RESPONSE');
      return result;
    },
    onSuccess: async (_result, selected) => {
      setShared(true);
      onReady(selected);
      key.current = undefined;
      await cache.invalidateQueries({
        queryKey: ['booking-evidence', actorId, branchId],
        exact: true,
      });
    },
  });
  return (
    <div className="space-y-3">
      <PrivateFileInput
        id={id}
        label={bookingEvidenceLabels[kind]}
        purpose="resident_document"
        disabled={disabled || share.isPending}
        onBusy={onBusy}
        onReady={(selected) => {
          setFileId(selected);
          setShared(false);
          onReady(undefined);
          share.reset();
        }}
      />
      {fileId && !shared ? (
        <Button
          variant="secondary"
          disabled={!consent || disabled || share.isPending}
          onClick={() => share.mutate(fileId)}
        >
          Share {bookingEvidenceLabels[kind]} with Owner
        </Button>
      ) : null}
      {shared ? (
        <p role="status">Shared privately with this hostel Owner for verification.</p>
      ) : null}
      {share.isPending ? <p role="status">Sharing document…</p> : null}
      {share.error ? <p role="alert">{errorMessage(share.error)}</p> : null}
    </div>
  );
}
