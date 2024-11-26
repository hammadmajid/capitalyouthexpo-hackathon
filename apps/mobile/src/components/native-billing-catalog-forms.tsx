import { NumericTextInput as TextInput } from './grouped-number-input';
import { View } from 'react-native';
import { Button, Copy } from './ui';
export const emptyNativeCatalogDraft = { code: '', name: '', unitLabel: '', price: '' };
export type NativeCatalogDraft = typeof emptyNativeCatalogDraft;
const fields = [
  ['code', 'Charge code'],
  ['name', 'Charge name'],
  ['unitLabel', 'Charge unit'],
  ['price', 'Unit price (PKR)'],
] as const;
const inputClass =
  'min-h-12 rounded-input border border-border bg-inputSurface px-4 py-3 font-body text-body text-text';
export function NativeCatalogCreateForm({
  draft,
  change,
  disabled,
  save,
}: {
  draft: NativeCatalogDraft;
  change: (draft: NativeCatalogDraft) => void;
  disabled: boolean;
  save: () => void;
}) {
  return (
    <View className="gap-3">
      <Copy>New approved charge</Copy>
      <Copy>Use a unique lowercase code. Existing agreements keep their saved prices.</Copy>
      {fields.map(([key, label]) => (
        <View key={key} className="gap-2">
          <Copy>{label}</Copy>
          <TextInput
            accessibilityLabel={label}
            className={inputClass}
            value={draft[key]}
            editable={!disabled}
            maxLength={key === 'price' ? 17 : key === 'code' ? 64 : key === 'unitLabel' ? 40 : 120}
            keyboardType={key === 'price' ? 'decimal-pad' : 'default'}
            autoCapitalize={key === 'code' ? 'none' : 'sentences'}
            autoCorrect={key !== 'code'}
            onChangeText={(value) => change({ ...draft, [key]: value })}
          />
        </View>
      ))}
      <Button label="Create approved charge" disabled={disabled} onPress={save} />
    </View>
  );
}
export function NativeCatalogArchiveForm({
  name,
  reason,
  change,
  disabled,
  save,
  cancel,
}: {
  name: string;
  reason: string;
  change: (value: string) => void;
  disabled: boolean;
  save: () => void;
  cancel: () => void;
}) {
  return (
    <View className="gap-3">
      <Copy>Archive {name}. Existing agreements retain its original price.</Copy>
      <Copy>Archival reason</Copy>
      <TextInput
        accessibilityLabel="Archival reason"
        className={inputClass}
        value={reason}
        onChangeText={change}
        editable={!disabled}
        maxLength={500}
        multiline
      />
      <Button label="Confirm archive approved charge" disabled={disabled} onPress={save} />
      <Button label="Cancel charge archive" secondary disabled={disabled} onPress={cancel} />
    </View>
  );
}
