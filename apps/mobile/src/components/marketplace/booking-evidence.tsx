import { useRef, useState } from 'react';
import { View } from 'react-native';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { randomUUID } from 'expo-crypto';
import { submitBookingDocument } from '@hsm/api-client';
import type { BookingDocumentSubmission } from '@hsm/contracts';
import { actorClient } from '../../lib/runtime';
import { safeMessage } from '../../lib/messages';
import { PrivateFilePicker } from '../private-file-picker';
import { Copy } from '../ui';
import { MarketplaceAction as Button } from './action';
type Kind = BookingDocumentSubmission['kind'];
export const evidenceLabels: Record<Kind, string> = {
  cnic: 'CNIC document',
  student_id: 'Student ID',
  admission_proof: 'Admission proof',
  employment_proof: 'Employment proof',
};
export function BookingEvidencePicker({
  actorId,
  branchId,
  kind,
  consent,
  onReady,
  onBusy,
  disabled,
}: {
  actorId: string;
  branchId: string;
  kind: Kind;
  consent: boolean;
  disabled: boolean;
  onReady: (fileId: string | undefined) => void;
  onBusy: (busy: boolean) => void;
}) {
  const cache = useQueryClient();
  const [fileId, setFileId] = useState<string>(),
    [shared, setShared] = useState(false);
  const key = useRef<{ fileId: string; key: string } | undefined>(undefined);
  const share = useMutation({
    gcTime: 0,
    onMutate: () => onBusy(true),
    onSettled: () => onBusy(false),
    mutationFn: async (selected: string) => {
      if (key.current?.fileId !== selected) key.current = { fileId: selected, key: randomUUID() };
      return submitBookingDocument(
        await actorClient(actorId),
        branchId,
        { kind, fileId: selected, shareWithOwner: true },
        key.current.key,
      );
    },
    onSuccess: async (_response, selected) => {
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
    <View className="gap-3">
      <PrivateFilePicker
        actorId={actorId}
        label={evidenceLabels[kind]}
        purpose="resident_document"
        Action={Button}
        disabled={disabled}
        onBusy={onBusy}
        onReady={(id) => {
          setFileId(id);
          setShared(false);
          onReady(undefined);
          share.reset();
        }}
      />
      {fileId && !shared ? (
        <Button
          secondary
          label={'Share ' + evidenceLabels[kind] + ' with Owner'}
          disabled={!consent || disabled || share.isPending}
          onPress={() => share.mutate(fileId)}
        />
      ) : null}
      {shared ? <Copy>Shared privately with this hostel Owner for verification.</Copy> : null}
      {share.isPending ? <Copy>Sharing document…</Copy> : null}
      {share.isError ? <Copy alert>{safeMessage(share.error)}</Copy> : null}
    </View>
  );
}
