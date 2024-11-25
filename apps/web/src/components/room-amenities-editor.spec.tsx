import { randomUUID } from 'node:crypto';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { RoomAmenitiesEditor } from './room-amenities-editor';
const wifi = { code: 'wifi', name: 'Wi-Fi', isActive: true };
const initial = {
  branchId: randomUUID(),
  roomTypeId: randomUUID(),
  version: 'a'.repeat(64),
  canEdit: true,
  amenities: [wifi],
};
afterEach(cleanup);
function setup(
  options: {
    disabled?: boolean;
    pending?: boolean;
    canEdit?: boolean;
    retired?: boolean;
    invalid?: boolean;
  } = {},
) {
  const save = vi.fn(),
    cancel = vi.fn();
  render(
    <RoomAmenitiesEditor
      initial={{
        ...initial,
        canEdit: options.canEdit ?? true,
        amenities: [{ ...wifi, isActive: !options.retired }],
      }}
      catalog={
        options.invalid
          ? [{ code: 'Invalid', name: 'Invalid catalog fixture' }]
          : [{ code: 'heater', name: 'Heater' }]
      }
      disabled={options.disabled ?? false}
      pending={options.pending ?? false}
      onSave={save}
      onCancel={cancel}
    />,
  );
  return { save, cancel };
}
const submit = () =>
  fireEvent.submit(screen.getByRole('form', { name: 'Room-type amenity selection' }));
it('ROOM-002: actual selected choices are retained and explicit changes contain no pricing fields', () => {
  const value = setup();
  expect((screen.getByLabelText('Wi-Fi') as HTMLInputElement).checked).toBe(true);
  fireEvent.click(screen.getByLabelText('Heater'));
  submit();
  expect(value.save).toHaveBeenCalledWith({ amenityCodes: ['heater', 'wifi'] });
  expect(document.body.textContent).not.toContain(initial.roomTypeId);
  expect(document.body.textContent).not.toContain(initial.branchId);
});
it('ROOM-002: retired selections remain visible and can be explicitly removed without re-adding', () => {
  const value = setup({ retired: true });
  const checkbox = screen.getByLabelText('Wi-Fi — Retired; may be removed') as HTMLInputElement;
  expect(checkbox.checked).toBe(true);
  expect(checkbox.disabled).toBe(false);
  fireEvent.click(checkbox);
  expect(checkbox.disabled).toBe(true);
  submit();
  expect(value.save).toHaveBeenCalledWith({ amenityCodes: [] });
});
it.each([{ disabled: true }, { pending: true }, { canEdit: false }])(
  'ACC-004: disabled editor %# blocks programmatic submission',
  (options) => {
    const value = setup(options);
    submit();
    expect(value.save).not.toHaveBeenCalled();
  },
);
it('ROOM-002: malformed catalog choices fail the strict form boundary before mutation', () => {
  const value = setup({ invalid: true });
  fireEvent.click(screen.getByLabelText('Invalid catalog fixture'));
  submit();
  expect(screen.getByRole('alert')).toBeDefined();
  expect(value.save).not.toHaveBeenCalled();
});
it('ROOM-002: cancellation discards the selection without saving', () => {
  const value = setup();
  fireEvent.click(screen.getByRole('button', { name: 'Cancel room amenity edit' }));
  expect(value.cancel).toHaveBeenCalledOnce();
  expect(value.save).not.toHaveBeenCalled();
});

it('ROOM-002: current retired selection metadata overrides a stale active catalog page', () => {
  render(
    <RoomAmenitiesEditor
      initial={{ ...initial, amenities: [{ ...wifi, isActive: false }] }}
      catalog={[{ code: wifi.code, name: wifi.name }]}
      disabled={false}
      pending={false}
      onSave={vi.fn()}
      onCancel={vi.fn()}
    />,
  );
  expect(screen.getByLabelText('Wi-Fi — Retired; may be removed')).toBeDefined();
});
