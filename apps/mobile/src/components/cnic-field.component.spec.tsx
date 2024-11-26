/// <reference types="jest" />
import { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { CnicField, cnicComplete, formatCnic } from './cnic-field';
function Harness() {
  const [value, setValue] = useState('');
  return <CnicField value={value} onChange={setValue} />;
}
test('CHG-054: CNIC digits are grouped as typed and the tick shows only when complete', async () => {
  expect(formatCnic('352021234567')).toBe('35202-1234567');
  expect(formatCnic('35202-1234567-1x9')).toBe('35202-1234567-1');
  expect(cnicComplete('35202-1234567-1')).toBe(true);
  expect(cnicComplete('35202-123456')).toBe(false);
  await render(<Harness />);
  await fireEvent.changeText(screen.getByLabelText('CNIC'), '3520212345');
  expect(screen.getByLabelText('CNIC')).toHaveDisplayValue('35202-12345');
  expect(screen.queryByLabelText('CNIC complete')).toBeNull();
  await fireEvent.changeText(screen.getByLabelText('CNIC'), '3520212345671');
  expect(screen.getByLabelText('CNIC')).toHaveDisplayValue('35202-1234567-1');
  expect(screen.getByLabelText('CNIC complete')).toBeTruthy();
});
