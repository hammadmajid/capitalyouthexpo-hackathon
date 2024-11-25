import { renderToString } from 'react-dom/server';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { z } from 'zod';
import { FlowForm } from './flow-form';
afterEach(cleanup);
function form() {
  const submit = vi.fn(async (values: Record<string, string>) => {
    z.object({ email: z.string().email() }).parse(values);
    return 'Request accepted';
  });
  render(
    <FlowForm
      fields={[{ name: 'email', label: 'Email address', type: 'email' }]}
      submit={submit}
      label="Send code"
    />,
  );
  return userEvent.setup();
}
it('AUTH-C: shared forms reject invalid boundaries without exposing validation payloads', async () => {
  const user = form();
  await user.click(screen.getByLabelText('Email address'));
  await user.paste('invalid-private-value');
  await user.click(screen.getByRole('button', { name: 'Send code' }));
  expect((await screen.findByRole('alert')).textContent).toBe('Check the fields and try again.');
  expect(document.body.textContent).not.toContain('invalid-private-value');
});
it('AUTH-C: shared forms announce success and clear entered identity fields', async () => {
  const user = form();
  await user.click(screen.getByLabelText('Email address'));
  await user.paste('person@example.test');
  await user.click(screen.getByRole('button', { name: 'Send code' }));
  expect((await screen.findByRole('status')).textContent).toBe('Request accepted');
  expect((screen.getByLabelText('Email address') as HTMLInputElement).value).toBe('');
});

it('SEC-001: server-rendered form controls wait for hydration before accepting identity input', () => {
  const html = renderToString(
    <FlowForm
      fields={[{ name: 'email', label: 'Email address' }]}
      label="Verify email"
      submit={async () => undefined}
    />,
  );
  expect(html).toMatch(/<fieldset[^>]*disabled/);
  expect(html).toMatch(/<button[^>]*disabled/);
});

it('AUTH-C: refreshed defaults never overwrite an in-progress profile edit', async () => {
  const submit = vi.fn(async () => undefined);
  const fields = [{ name: 'age', label: 'Age' }];
  const view = render(
    <FlowForm fields={fields} label="Save" submit={submit} initialValues={{ age: '24' }} />,
  );
  const user = userEvent.setup();
  expect((screen.getByLabelText('Age') as HTMLInputElement).value).toBe('24');
  await user.clear(screen.getByLabelText('Age'));
  await user.type(screen.getByLabelText('Age'), '25');
  view.rerender(
    <FlowForm fields={fields} label="Save" submit={submit} initialValues={{ age: '29' }} />,
  );
  expect((screen.getByLabelText('Age') as HTMLInputElement).value).toBe('25');
  await user.click(screen.getByRole('button', { name: 'Save' }));
  expect(submit).toHaveBeenCalledWith({ age: '25' });
});

it('ONB-001: saving a resumable draft retains entered fields when reset is disabled', async () => {
  const submit = vi.fn(async () => 'Draft saved');
  render(
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
  await user.click(screen.getByLabelText('Draft name'));
  await user.paste('Edited draft');
  await user.click(screen.getByRole('button', { name: 'Save draft' }));
  await screen.findByText('Draft saved');
  expect((screen.getByLabelText('Draft name') as HTMLInputElement).value).toBe('Edited draft');
  expect(submit).toHaveBeenCalledWith({ name: 'Edited draft' });
});

it('ONB-001: confirmed coordinates change only their fields and retain other unsaved form input', async () => {
  const submit = vi.fn(async () => undefined);
  render(
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
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            set('latitude', '33.7');
            set('longitude', '73.04');
          }}
        >
          Confirm fixture pin
        </button>
      )}
    />,
  );
  const user = userEvent.setup();
  await user.clear(screen.getByLabelText('Address'));
  await user.type(screen.getByLabelText('Address'), 'Unsaved address');
  await user.click(screen.getByText('Confirm fixture pin'));
  await user.click(screen.getByText('Save branch'));
  expect(submit).toHaveBeenCalledWith({
    address: 'Unsaved address',
    latitude: '33.7',
    longitude: '73.04',
  });
  expect((screen.getByLabelText('Address') as HTMLInputElement).value).toBe('Unsaved address');
});
