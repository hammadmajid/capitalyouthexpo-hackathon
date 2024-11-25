import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { PrivateListing } from '@hsm/contracts';
import { ListingEditor } from './listing-editor';
afterEach(cleanup);
const initial: PrivateListing = {
  branchId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  version: 'a'.repeat(64),
  canEdit: true,
  description: 'Saved description',
  nearbyLandmark: null,
  publicPhone: null,
  publicEmail: null,
  showPublicContact: false,
  amenities: [{ code: 'retired', name: 'Old amenity', isActive: false }],
};
function setup(disabled = false) {
  const save = vi.fn(),
    cancel = vi.fn();
  const view = render(
    <ListingEditor
      initial={initial}
      catalog={[{ code: 'wifi', name: 'Wi-Fi' }]}
      disabled={disabled}
      onSave={save}
      onCancel={cancel}
    />,
  );
  return { save, cancel, ...view };
}
it('TRUST-006: starts with actual persisted values and explicit hidden contact', () => {
  const value = setup();
  expect((screen.getByLabelText('Description') as HTMLTextAreaElement).value).toBe(
    initial.description,
  );
  expect(
    (screen.getByLabelText('Show these contact details publicly') as HTMLInputElement).checked,
  ).toBe(false);
  fireEvent.click(screen.getByRole('button', { name: 'Save listing details' }));
  expect(value.save).toHaveBeenCalledWith({
    description: initial.description,
    nearbyLandmark: null,
    publicPhone: null,
    publicEmail: null,
    showPublicContact: false,
    amenityCodes: ['retired'],
  });
});
it('TRUST-006: normalizes explicit fields, clears values and selects catalog codes', () => {
  const value = setup();
  fireEvent.change(screen.getByLabelText('Description'), { target: { value: '  ' } });
  fireEvent.change(screen.getByLabelText('Public contact phone'), {
    target: { value: ' +925112345678 ' },
  });
  fireEvent.change(screen.getByLabelText('Public contact email'), {
    target: { value: ' HOSTEL@example.test ' },
  });
  fireEvent.click(screen.getByLabelText('Show these contact details publicly'));
  fireEvent.click(screen.getByLabelText('Wi-Fi'));
  fireEvent.submit(screen.getByRole('form', { name: 'Edit listing details' }));
  expect(value.save).toHaveBeenCalledWith(
    expect.objectContaining({
      description: null,
      publicPhone: '+925112345678',
      publicEmail: 'hostel@example.test',
      showPublicContact: true,
      amenityCodes: ['retired', 'wifi'],
    }),
  );
});
it('TRUST-006: allows removing a retired selection and prevents selecting it again', () => {
  const value = setup(),
    retired = screen.getByLabelText('Old amenity — Retired; may be removed');
  fireEvent.click(retired);
  expect((retired as HTMLInputElement).disabled).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: 'Save listing details' }));
  expect(value.save).toHaveBeenCalledWith(expect.objectContaining({ amenityCodes: [] }));
});
it('TRUST-006: invalid contact never reaches the mutation', () => {
  const value = setup();
  fireEvent.change(screen.getByLabelText('Public contact phone'), { target: { value: '123' } });
  fireEvent.submit(screen.getByRole('form', { name: 'Edit listing details' }));
  expect(screen.getByRole('alert')).toBeDefined();
  expect(value.save).not.toHaveBeenCalled();
});
it('SEC-003: unavailable forms retain values but prevent saves', () => {
  const value = setup(true);
  fireEvent.submit(screen.getByRole('form', { name: 'Edit listing details' }));
  expect(value.save).not.toHaveBeenCalled();
  expect(
    (screen.getByLabelText('Description').closest('fieldset') as HTMLFieldSetElement).disabled,
  ).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: 'Cancel listing edit' }));
  expect(value.cancel).toHaveBeenCalledOnce();
});
it('LIST-00x: custom amenities render separately and their selection is saved', () => {
  const save = vi.fn();
  render(
    <ListingEditor
      initial={{
        ...initial,
        amenities: [{ code: 'laundry', name: 'Laundry room', isActive: true }],
      }}
      catalog={[{ code: 'wifi', name: 'Wi-Fi' }]}
      disabled={false}
      customCodes={['laundry', 'gym']}
      custom={(codes, change) => (
        <button type="button" onClick={() => change([...codes, 'gym'])}>
          Custom picker: {codes.join(',')}
        </button>
      )}
      onSave={save}
      onCancel={vi.fn()}
    />,
  );
  expect(screen.queryByLabelText('Laundry room')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Custom picker: laundry' }));
  fireEvent.click(screen.getByRole('button', { name: 'Save listing details' }));
  expect(save).toHaveBeenCalledWith(expect.objectContaining({ amenityCodes: ['laundry', 'gym'] }));
});
