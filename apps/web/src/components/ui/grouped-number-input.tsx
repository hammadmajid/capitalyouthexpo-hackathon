'use client';
import { useLayoutEffect, useRef, useState, type InputHTMLAttributes } from 'react';
import { groupNumberInput, groupedNumberEdit, ungroupNumberInput } from '@hsm/ui';
type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type'> & {
  value: string;
  onValueChange: (value: string) => void;
  // false keeps a shared field plain (codes, names); mirrors mobile NumericTextInput opt-in.
  grouped?: boolean;
};
// CHG-059 / UI-001: display-only thousands grouping; callers always receive ungrouped text,
// so money parsers (billingFormPaisa) see the exact digits the user typed.
export function GroupedNumberInput({
  value,
  onValueChange,
  maxLength,
  grouped = true,
  ...input
}: Props) {
  const element = useRef<HTMLInputElement>(null),
    caretBefore = useRef<number | undefined>(undefined),
    caretAfter = useRef<number | undefined>(undefined),
    deleting = useRef(false);
  const text = groupNumberInput(value);
  useLayoutEffect(() => {
    const target = element.current,
      cursor = caretAfter.current;
    if (!target || cursor === undefined || document.activeElement !== target) return;
    caretAfter.current = undefined;
    target.setSelectionRange(cursor, cursor);
  });
  if (!grouped)
    return <input {...input} type="text" value={value} maxLength={maxLength} onChange={plain} />;
  function plain(event: { target: { value: string } }) {
    onValueChange(event.target.value);
  }
  function remember() {
    caretBefore.current = element.current?.selectionStart ?? undefined;
  }
  return (
    <input
      {...input}
      ref={element}
      type="text"
      inputMode="decimal"
      autoComplete="off"
      value={text}
      maxLength={maxLength ? maxLength + Math.ceil(maxLength / 3) : undefined}
      onSelect={remember}
      onKeyDown={(event) => {
        remember();
        const target = event.currentTarget;
        deleting.current =
          (event.key === 'Backspace' || event.key === 'Delete') &&
          target.selectionStart === target.selectionEnd;
        input.onKeyDown?.(event);
      }}
      onChange={(event) => {
        const edit = groupedChange(text, event.target.value, {
          deleting: deleting.current,
          maxLength,
          caret: caretBefore.current,
        });
        deleting.current = false;
        caretAfter.current = edit.cursor;
        caretBefore.current = edit.cursor;
        onValueChange(edit.value);
      }}
    />
  );
}
// Only a real single-key deletion may skip a comma onto its digit. A paste or select-all
// replacement with the same digits must keep the exact amount (it once sent 1,000 for 18,000).
export function groupedChange(
  text: string,
  next: string,
  options: { deleting: boolean; maxLength: number | undefined; caret: number | undefined },
) {
  const commaOnly =
    text.length === next.length + 1 &&
    text.includes(',') &&
    ungroupNumberInput(text) === ungroupNumberInput(next);
  if (!options.deleting && commaOnly) {
    const value = ungroupNumberInput(next).slice(0, options.maxLength);
    return { value, cursor: groupNumberInput(value).length };
  }
  return groupedNumberEdit(text, next, options.maxLength, options.caret);
}
// For FormData forms: the submitted text is grouped, so readers must ungroupNumberInput() it.
export function GroupedNumberField({
  defaultValue = '',
  ...input
}: Omit<Props, 'value' | 'onValueChange'> & { defaultValue?: string }) {
  const [value, setValue] = useState(defaultValue);
  return <GroupedNumberInput {...input} value={value} onValueChange={setValue} />;
}
