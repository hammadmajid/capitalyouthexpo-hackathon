import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { FlowInput } from './flow-input';
import { FlowForm } from './flow-form';
it('UI-001: money is grouped while phone identifiers keep their original digits', async () => {
  await render(
    <>
      <FlowInput
        field={{ name: 'rent', label: 'Rent', keyboard: 'number-pad' }}
        value="1234567.89"
        change={jest.fn()}
        blur={jest.fn()}
        disabled={false}
      />
      <FlowInput
        field={{ name: 'phone', label: 'Phone', keyboard: 'phone-pad' }}
        value="03151234567"
        change={jest.fn()}
        blur={jest.fn()}
        disabled={false}
      />
    </>,
  );
  expect(screen.getByLabelText('Rent').props.value).toBe('1,234,567.89');
  expect(screen.getByLabelText('Phone').props.value).toBe('03151234567');
});
it('BKG-004 / UI-001: typed separators never enter the submitted money value', async () => {
  const submit = jest.fn().mockResolvedValue(undefined);
  await render(
    <FlowForm
      fields={[{ name: 'rent', label: 'Rent', keyboard: 'number-pad' }]}
      label="Save"
      submit={submit}
    />,
  );
  await fireEvent.changeText(screen.getByLabelText('Rent'), '1,234,567.89');
  expect(screen.getByLabelText('Rent').props.value).toBe('1,234,567.89');
  await fireEvent.press(screen.getByRole('button', { name: 'Save' }));
  await waitFor(() => expect(submit).toHaveBeenCalledWith({ rent: '1234567.89' }));
});

it.each([
  ['code', 'Six-digit email code', '123456'],
  ['cnic', 'CNIC', '3520212345671'],
  ['year', 'Establishment year', '2026'],
])(
  'UI-001: explicitly plain numeric identifier %s never gains separators',
  async (name, label, value) => {
    await render(
      <FlowInput
        field={{ name, label, keyboard: 'number-pad', numberFormat: 'plain' }}
        value={value}
        change={jest.fn()}
        blur={jest.fn()}
        disabled={false}
      />,
    );
    expect(screen.getByLabelText(label).props.value).toBe(value);
  },
);
