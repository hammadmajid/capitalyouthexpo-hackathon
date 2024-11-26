import { PrivateFilePicker } from './private-file-picker';
import { SetupButton } from './owner-wizard-ui';
export function OwnerPhotoField({
  actorId,
  label,
  fileId,
  change,
  busy,
  disabled,
  compact = false,
}: {
  compact?: boolean;
  actorId: string;
  label: string;
  fileId: string | undefined;
  change: (fileId: string | undefined) => void;
  busy: (busy: boolean) => void;
  disabled: boolean;
}) {
  return (
    <PrivateFilePicker
      label={label.replace(/\s*\*$/, '')}
      fileId={fileId}
      hideLabel={compact}
      hideHint={compact}
      purpose="listing_photo"
      actorId={actorId}
      Action={SetupButton}
      disabled={disabled}
      onBusy={busy}
      onReady={change}
    />
  );
}
