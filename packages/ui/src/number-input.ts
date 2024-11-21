// Display grouping is separate from the canonical text consumed by form parsers.
export function ungroupNumberInput(text: string): string {
  const clean = text.trim().replaceAll(',', '');
  if (!/^-?\d*(?:\.\d*)?$/.test(clean)) return text;
  const sign = clean.startsWith('-') ? '-' : '';
  const unsigned = sign ? clean.slice(1) : clean;
  if (!unsigned) return sign;
  const [whole = '', fraction] = unsigned.split('.');
  const integer = whole.replace(/^0+(?=\d)/, '') || (fraction !== undefined ? '0' : '');
  return sign + integer + (fraction === undefined ? '' : '.' + fraction);
}
export function groupNumberInput(value: string): string {
  const raw = ungroupNumberInput(value);
  if (!/^-?\d*(?:\.\d*)?$/.test(raw)) return value;
  const sign = raw.startsWith('-') ? '-' : '';
  const [whole = '', fraction] = (sign ? raw.slice(1) : raw).split('.');
  const groups: string[] = [];
  for (let end = whole.length; end > 0; end -= 3)
    groups.push(whole.slice(Math.max(0, end - 3), end));
  return sign + groups.reverse().join(',') + (fraction === undefined ? '' : '.' + fraction);
}
export function groupedNumberEdit(
  previous: string,
  next: string,
  maxLength = 64,
  cursorBefore?: number,
) {
  let prefix = 0,
    suffix = 0;
  while (prefix < previous.length && prefix < next.length && previous[prefix] === next[prefix])
    prefix++;
  while (
    suffix < previous.length - prefix &&
    suffix < next.length - prefix &&
    previous[previous.length - 1 - suffix] === next[next.length - 1 - suffix]
  )
    suffix++;
  // Backspace/delete at a separator must delete a digit rather than trap the caret.
  if (
    previous.length === next.length + 1 &&
    previous[prefix] === ',' &&
    ungroupNumberInput(previous) === ungroupNumberInput(next)
  ) {
    const forward = cursorBefore === prefix;
    const index = forward ? prefix + 1 : prefix - 1;
    const withoutDigit = previous.slice(0, index) + previous.slice(index + 1);
    const value = ungroupNumberInput(withoutDigit).slice(0, maxLength);
    const text = groupNumberInput(value);
    const before = previous.slice(0, forward ? prefix : index).replaceAll(',', '').length;
    let cursor = 0,
      digits = 0;
    while (cursor < text.length && digits < before) {
      if (text[cursor] !== ',') digits++;
      cursor++;
    }
    return { value, text, cursor };
  }
  const value = ungroupNumberInput(next).slice(0, maxLength);
  const text = groupNumberInput(value);
  const offset = Math.min(
    value.length,
    ungroupNumberInput(next.slice(0, next.length - suffix)).length,
  );
  let cursor = 0,
    seen = 0;
  while (cursor < text.length && seen < offset) {
    if (text[cursor] !== ',') seen++;
    cursor++;
  }
  while (text[cursor] === ',') cursor++;
  return { value, text, cursor };
}
