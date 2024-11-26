import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { Camera, CircleCheck } from 'lucide-react-native';
import { mobileColors as c, spacing, icons } from '@hsm/ui';
import { CnicField } from './cnic-field';
import { PropertyActionDialog } from './property-action-dialog';
import { PrivateFilePicker } from './private-file-picker';

export function AdmissionCnicPhoto(props: {
  actorId: string;
  value: string;
  onChange: (value: string) => void;
  fileId: string | undefined;
  onReady: (id: string | undefined) => void;
  onBusy: (busy: boolean) => void;
  onPending: (pending: boolean) => void;
  disabled: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [autoPick, setAutoPick] = useState(false);
  return (
    <>
      <CnicField
        value={props.value}
        onChange={props.onChange}
        disabled={props.disabled}
        action={
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={props.fileId ? 'View CNIC photo' : 'Add CNIC photo'}
            accessibilityState={{ disabled: props.disabled }}
            disabled={props.disabled}
            onPress={() => {
              setAutoPick(!props.fileId);
              setOpen(true);
            }}
            style={{
              width: spacing.touch,
              height: spacing.touch,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Camera size={icons.size} color={c.primary} accessible={false} />
            {props.fileId ? (
              <View
                style={{
                  position: 'absolute',
                  right: 0,
                  top: 0,
                  backgroundColor: c.icy,
                  borderRadius: spacing.touch,
                }}
              >
                <CircleCheck size={14} color={c.primary} accessibilityLabel="CNIC photo ready" />
              </View>
            ) : null}
          </Pressable>
        }
      />
      <PropertyActionDialog
        title="CNIC photo"
        visible={open}
        busy={busy}
        close={() => {
          if (!busy) {
            props.onPending(false);
            setOpen(false);
          }
        }}
      >
        {open ? (
          <PrivateFilePicker
            key={props.actorId}
            label="CNIC photo"
            actorId={props.actorId}
            purpose="resident_document"
            imagesOnly
            autoOpen={autoPick}
            fileId={props.fileId}
            hideLabel
            hideHint
            disabled={props.disabled}
            onReady={props.onReady}
            onPending={props.onPending}
            onBusy={(value) => {
              setBusy(value);
              props.onBusy(value);
            }}
          />
        ) : null}
      </PropertyActionDialog>
    </>
  );
}
