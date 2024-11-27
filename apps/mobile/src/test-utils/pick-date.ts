import { fireEvent, screen } from '@testing-library/react-native';
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const SPECIAL = new Set(['.', '*', '+', '?', '^', '$', '{', '}', '(', ')', '|', '[', ']', '\\']);
const escape = (text: string) =>
  [...text].map((char) => (SPECIAL.has(char) ? '\\' + char : char)).join('');
// The date field's button reads "<label>: <date or 'not set'>".
const dateName = (label: string) => new RegExp('^' + escape(label) + ':');
export function dateButton(label: string) {
  return screen.getByRole('button', { name: dateName(label) });
}
// Opens the wheel picker, taps the year, month and day, then saves. value is YYYY-MM-DD.
export async function pickDate(label: string, value: string) {
  const [year, month, day] = value.split('-').map(Number);
  await fireEvent.press(await screen.findByRole('button', { name: dateName(label) }));
  await fireEvent.press(screen.getByRole('button', { name: 'Year ' + String(year) }));
  await fireEvent.press(
    screen.getByRole('button', { name: 'Month ' + (MONTHS[(month ?? 1) - 1] ?? 'Jan') }),
  );
  if (day && screen.queryByLabelText('Day'))
    await fireEvent.press(screen.getByRole('button', { name: 'Day ' + String(day) }));
  await fireEvent.press(screen.getByRole('button', { name: 'Set date' }));
}
