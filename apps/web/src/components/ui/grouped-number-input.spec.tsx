import { afterEach, expect, it } from 'vitest';
import { useState } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { ungroupNumberInput } from '@hsm/ui';
import { GroupedNumberField, GroupedNumberInput } from './grouped-number-input';
afterEach(cleanup);
function Harness(props: { initial?: string; onValue?: (value: string) => void }) {
  const [value, setValue] = useState(props.initial ?? '');
  return (
    <>
      <GroupedNumberInput
        aria-label="Amount"
        value={value}
        onValueChange={(next) => {
          setValue(next);
          props.onValue?.(next);
        }}
      />
      <output data-testid="raw">{value}</output>
    </>
  );
}
function input() {
  return screen.getByLabelText<HTMLInputElement>('Amount');
}
it('CHG-059: shows thousands separators while form state stays ungrouped', () => {
  render(<Harness />);
  fireEvent.change(input(), { target: { value: '1250000' } });
  expect(input().value).toBe('1,250,000');
  expect(screen.getByTestId('raw').textContent).toBe('1250000');
});
it('CHG-059: groups an existing value and preserves decimal precision', () => {
  render(<Harness initial="12345.50" />);
  expect(input().value).toBe('12,345.50');
});
it('CHG-059: backspace next to a comma deletes the digit before it', () => {
  render(<Harness initial="1234" />);
  const element = input();
  element.setSelectionRange(2, 2);
  fireEvent.select(element);
  fireEvent.keyDown(element, { key: 'Backspace' });
  fireEvent.change(element, { target: { value: '1234', selectionStart: 1, selectionEnd: 1 } });
  expect(screen.getByTestId('raw').textContent).toBe('234');
  expect(element.value).toBe('234');
});
it('CHG-059: uses a decimal keypad hint and never a native number input', () => {
  render(<Harness />);
  expect(input().getAttribute('inputmode')).toBe('decimal');
  expect(input().type).toBe('text');
});
it('CHG-059: grouped={false} keeps codes and names exactly as typed', () => {
  function Plain() {
    const [value, setValue] = useState('');
    return (
      <GroupedNumberInput
        aria-label="Amount"
        grouped={false}
        value={value}
        onValueChange={setValue}
      />
    );
  }
  render(<Plain />);
  fireEvent.change(input(), { target: { value: 'LAUNDRY-1000' } });
  expect(input().value).toBe('LAUNDRY-1000');
});
it('CHG-059: GroupedNumberField submits grouped text that ungroups to exact digits', () => {
  render(
    <form aria-label="fee form">
      <GroupedNumberField aria-label="Amount" name="fee" defaultValue="2500" />
    </form>,
  );
  expect(input().value).toBe('2,500');
  fireEvent.change(input(), { target: { value: '25,0000' } });
  const fields = new FormData(screen.getByRole('form', { name: 'fee form' }) as HTMLFormElement);
  expect(ungroupNumberInput(String(fields.get('fee')))).toBe('250000');
});
it('CHG-059: replacing the whole value with the same digits never drops a digit', () => {
  const values: string[] = [];
  render(<Harness initial="18000" onValue={(value) => values.push(value)} />);
  expect(input().value).toBe('18,000');
  input().setSelectionRange(0, 6);
  fireEvent.select(input());
  fireEvent.change(input(), { target: { value: '18000' } });
  expect(values).toEqual(['18000']);
  expect(input().value).toBe('18,000');
});
