import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { BookingPolicyRead } from '@hsm/api-client';
import { BookingPolicyEditor } from './booking-policy-editor';
afterEach(cleanup);
const target = { level: 'branch' as const, scopeId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' };
const settings: BookingPolicyRead = { configured: false, target, canEdit: true };
it('BKG-006: untouched local overrides remain inherited and never become guessed defaults', () => {
  const save = vi.fn();
  render(
    <BookingPolicyEditor
      settings={settings}
      pending={false}
      disabled={false}
      onSave={save}
      onCancel={() => undefined}
    />,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Save booking policy' }));
  expect(save).toHaveBeenCalledWith({
    overrides: expect.objectContaining({
      bookingMode: null,
      holdSeconds: null,
      requiredDocuments: null,
    }),
  });
});
it('CHG-007: explicitly disabling document inheritance can make CNIC optional', () => {
  const save = vi.fn();
  render(
    <BookingPolicyEditor
      settings={settings}
      pending={false}
      disabled={false}
      onSave={save}
      onCancel={() => undefined}
    />,
  );
  fireEvent.click(screen.getByLabelText('Inherit required documents'));
  fireEvent.click(screen.getByRole('button', { name: 'Save booking policy' }));
  expect(save).toHaveBeenCalledWith({
    overrides: expect.objectContaining({ requiredDocuments: [] }),
  });
});
it('BKG-006: invalid numeric settings show a safe error before mutation', () => {
  const save = vi.fn();
  render(
    <BookingPolicyEditor
      settings={settings}
      pending={false}
      disabled={false}
      onSave={save}
      onCancel={() => undefined}
    />,
  );
  fireEvent.change(screen.getByLabelText('Hold duration (seconds)'), { target: { value: '-1' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save booking policy' }));
  expect(screen.getByRole('alert')).toBeDefined();
  expect(save).not.toHaveBeenCalled();
});
it.each([
  { pending: true, disabled: false },
  { pending: false, disabled: true },
])('SEC-003: unavailable form %j prevents submissions', (state) => {
  const save = vi.fn();
  const { container } = render(
    <BookingPolicyEditor settings={settings} {...state} onSave={save} onCancel={() => undefined} />,
  );
  const form = container.querySelector('form');
  if (!form) throw new Error('Expected form');
  fireEvent.submit(form);
  expect(save).not.toHaveBeenCalled();
  expect(screen.getByLabelText('Hold duration (seconds)').closest('fieldset')?.disabled).toBe(true);
});
it('BKG-006: unconfigured Root cannot save incomplete default values', () => {
  const save = vi.fn();
  render(
    <BookingPolicyEditor
      settings={{ configured: false, target: { level: 'platform', scopeId: null }, canEdit: true }}
      pending={false}
      disabled={false}
      onSave={save}
      onCancel={() => undefined}
    />,
  );
  expect(screen.getByText('Platform safety limits')).toBeDefined();
  fireEvent.click(screen.getByRole('button', { name: 'Save booking policy' }));
  expect(screen.getByRole('alert')).toBeDefined();
  expect(save).not.toHaveBeenCalled();
});
