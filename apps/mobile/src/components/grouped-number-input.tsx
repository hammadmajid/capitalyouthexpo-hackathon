import { useRef, useState } from 'react';
import { TextInput, type TextInputProps } from 'react-native';
import { groupNumberInput, groupedNumberEdit } from '@hsm/ui';

export function GroupedNumberInput(props: TextInputProps & { grouped?: boolean }) {
  const {
    grouped = true,
    value,
    defaultValue,
    onChangeText,
    onSelectionChange,
    selection: suppliedSelection,
    maxLength,
    ...input
  } = props;
  const [draft, setDraft] = useState(defaultValue ?? '');
  const [selection, setSelection] = useState<{ start: number; end: number }>();
  const pending = useRef<number | undefined>(undefined);
  const raw = value ?? draft;
  const text = grouped ? groupNumberInput(raw) : raw;
  return (
    <TextInput
      {...input}
      value={text}
      maxLength={grouped && maxLength ? maxLength + Math.ceil(maxLength / 3) : maxLength}
      selection={
        suppliedSelection ??
        (selection
          ? {
              start: Math.min(selection.start, text.length),
              end: Math.min(selection.end, text.length),
            }
          : undefined)
      }
      onSelectionChange={(event) => {
        const next = event.nativeEvent.selection;
        if (pending.current !== undefined) {
          if (next.start === pending.current && next.end === pending.current)
            pending.current = undefined;
        } else setSelection(next);
        onSelectionChange?.(event);
      }}
      onChangeText={(next) => {
        if (!grouped) {
          setDraft(next);
          onChangeText?.(next);
          return;
        }
        const edit = groupedNumberEdit(text, next, maxLength, selection?.start);
        pending.current = edit.cursor;
        setSelection({ start: edit.cursor, end: edit.cursor });
        setDraft(edit.value);
        onChangeText?.(edit.value);
      }}
    />
  );
}

// Only real numeric fields opt in; identifiers keep their original representation.
export function NumericTextInput(props: TextInputProps) {
  return (
    <GroupedNumberInput
      {...props}
      grouped={['number-pad', 'decimal-pad', 'numeric'].includes(props.keyboardType ?? '')}
    />
  );
}
