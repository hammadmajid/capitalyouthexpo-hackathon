/// <reference types="jest" />
import { render, screen, userEvent } from '@testing-library/react-native';
import { z } from 'zod';
import { FlowForm } from './flow-form';
import { Button } from './ui';
test('AUTH-C: native forms validate boundaries and announce safe errors', async () => {
  const network = jest.fn();
  await render(
    <FlowForm
      fields={[{ name: 'email', label: 'Email address', keyboard: 'email-address' }]}
      label="Continue"
      submit={async (values) => {
        z.object({ email: z.string().email() }).parse(values);
        await network();
      }}
    />,
  );
  const user = userEvent.setup();
  await user.type(screen.getByLabelText('Email address'), 'invalid');
  await user.press(screen.getByRole('button', { name: 'Continue' }));
  expect(await screen.findByText('Check email.')).toBeVisible();
  expect(network).not.toHaveBeenCalled();
});
test('AUTH-C: native forms clear entered identity after verified success', async () => {
  const submit = jest.fn(async () => 'Check your email.');
  await render(
    <FlowForm
      fields={[{ name: 'email', label: 'Email address' }]}
      label="Continue"
      submit={submit}
    />,
  );
  const user = userEvent.setup();
  await user.type(screen.getByLabelText('Email address'), 'identity@example.com');
  await user.press(screen.getByRole('button', { name: 'Continue' }));
  expect(await screen.findByText('Check your email.')).toBeVisible();
  expect(screen.getByLabelText('Email address')).toHaveDisplayValue('');
  expect(submit).toHaveBeenCalledWith({ email: 'identity@example.com' });
});
test('SEC-001: provider errors cannot expose private credentials in native alerts', async () => {
  await render(
    <FlowForm
      fields={[]}
      label="Continue"
      submit={async () => {
        throw new Error('private CNIC password');
      }}
    />,
  );
  await userEvent.setup().press(screen.getByRole('button', { name: 'Continue' }));
  expect(await screen.findByText('Something went wrong on this screen. Try again.')).toBeVisible();
  expect(screen.queryByText('private CNIC password')).toBeNull();
});

test('AUTH-C: native refreshed defaults never overwrite an in-progress profile edit', async () => {
  const submit = jest.fn(async () => undefined);
  const fields = [{ name: 'age', label: 'Age' }];
  const view = await render(
    <FlowForm fields={fields} label="Save" submit={submit} initialValues={{ age: '24' }} />,
  );
  const user = userEvent.setup();
  expect(screen.getByLabelText('Age')).toHaveDisplayValue('24');
  await user.clear(screen.getByLabelText('Age'));
  await user.type(screen.getByLabelText('Age'), '25');
  await view.rerender(
    <FlowForm fields={fields} label="Save" submit={submit} initialValues={{ age: '29' }} />,
  );
  expect(screen.getByLabelText('Age')).toHaveDisplayValue('25');
  await user.press(screen.getByRole('button', { name: 'Save' }));
  expect(submit).toHaveBeenCalledWith({ age: '25' });
});

test('ONB-001: native draft saves retain edited fields when reset is disabled', async () => {
  const submit = jest.fn(async () => 'Draft saved');
  await render(
    <FlowForm
      fields={[{ name: 'name', label: 'Draft name' }]}
      label="Save draft"
      submit={submit}
      resetAfterSubmit={false}
      initialValues={{ name: 'Saved draft' }}
    />,
  );
  const user = userEvent.setup();
  await user.clear(screen.getByLabelText('Draft name'));
  await user.type(screen.getByLabelText('Draft name'), 'Edited draft');
  await user.press(screen.getByRole('button', { name: 'Save draft' }));
  await screen.findByText('Draft saved');
  expect(screen.getByLabelText('Draft name')).toHaveDisplayValue('Edited draft');
  expect(submit).toHaveBeenCalledWith({ name: 'Edited draft' });
});

test('ONB-001: native pin confirmation preserves other unsaved fields through a retained draft save', async () => {
  const submit = jest.fn(async () => undefined);
  await render(
    <FlowForm
      fields={[
        { name: 'address', label: 'Address' },
        { name: 'latitude', label: 'Latitude' },
        { name: 'longitude', label: 'Longitude' },
      ]}
      initialValues={{ address: 'Saved address' }}
      label="Save branch"
      resetAfterSubmit={false}
      submit={submit}
      extra={(_values, set, busy) => (
        <Button
          label="Confirm fixture pin"
          disabled={busy}
          onPress={() => {
            set('latitude', '33.7');
            set('longitude', '73.04');
          }}
        />
      )}
    />,
  );
  const user = userEvent.setup();
  await user.clear(screen.getByLabelText('Address'));
  await user.type(screen.getByLabelText('Address'), 'Unsaved address');
  await user.press(screen.getByRole('button', { name: 'Confirm fixture pin' }));
  await user.press(screen.getByRole('button', { name: 'Save branch' }));
  expect(submit).toHaveBeenCalledWith({
    address: 'Unsaved address',
    latitude: '33.7',
    longitude: '73.04',
  });
  expect(screen.getByLabelText('Address')).toHaveDisplayValue('Unsaved address');
});
