import { randomUUID } from 'node:crypto';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { PhysicalInventoryEditor, InventoryLifecycleEditor } from './inventory-physical-editor';
afterEach(cleanup);
const roomTypeId = randomUUID();
const types = [
  { id: roomTypeId, name: 'Two beds', archivedAt: null },
  { id: randomUUID(), name: 'Retired type', archivedAt: '2026-10-15T00:00:00Z' },
];
it('ACC-001/004: physical room creation requires a live type and explicit availability', () => {
  const save = vi.fn();
  render(
    <PhysicalInventoryEditor
      roomTypes={types}
      bed={false}
      pending={false}
      onRoom={save}
      onBed={vi.fn()}
      onCancel={vi.fn()}
    />,
  );
  expect(screen.queryByRole('option', { name: 'Retired type' })).toBeNull();
  fireEvent.change(screen.getByLabelText('Room type'), { target: { value: roomTypeId } });
  fireEvent.change(screen.getByLabelText('Room label'), { target: { value: ' 101 ' } });
  fireEvent.change(screen.getByLabelText('Initial availability'), { target: { value: 'active' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save room' }));
  expect(save).toHaveBeenCalledWith({ roomTypeId, label: '101', status: 'active' });
});
it('ACC-001: bed creation cannot assign or reuse an ordinal', () => {
  const save = vi.fn();
  render(
    <PhysicalInventoryEditor
      roomTypes={types}
      bed
      pending={false}
      onRoom={vi.fn()}
      onBed={save}
      onCancel={vi.fn()}
    />,
  );
  expect(screen.queryByLabelText('Room type')).toBeNull();
  fireEvent.change(screen.getByLabelText('Bed label'), { target: { value: 'A' } });
  fireEvent.change(screen.getByLabelText('Initial availability'), {
    target: { value: 'inactive' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Save bed' }));
  expect(save).toHaveBeenCalledWith({ label: 'A', status: 'inactive' });
});
it('ACC-001: invalid physical input fails before a mutation', () => {
  const save = vi.fn();
  render(
    <PhysicalInventoryEditor
      roomTypes={types}
      bed
      pending={false}
      onRoom={vi.fn()}
      onBed={save}
      onCancel={vi.fn()}
    />,
  );
  const form = screen.getByRole('button', { name: 'Save bed' }).closest('form');
  if (!form) throw new Error('Physical editor form missing');
  fireEvent.submit(form);
  expect(save).not.toHaveBeenCalled();
  expect(screen.getByRole('alert')).toBeDefined();
});
it('ACC-004: archival requires a reason and never exposes a forced-cancellation option', () => {
  const save = vi.fn();
  render(
    <InventoryLifecycleEditor
      label="Room 101"
      archive
      pending={false}
      onSave={save}
      onCancel={vi.fn()}
    />,
  );
  expect(screen.queryByLabelText('New availability')).toBeNull();
  fireEvent.change(screen.getByLabelText('Reason'), { target: { value: ' Retired ' } });
  fireEvent.click(screen.getByRole('button', { name: 'Confirm archival' }));
  expect(save).toHaveBeenCalledWith('Retired');
});
it('ACC-001: availability changes retain a required reason and a closed status', () => {
  const save = vi.fn();
  render(
    <InventoryLifecycleEditor
      label="Bed A"
      archive={false}
      pending={false}
      onSave={save}
      onCancel={vi.fn()}
    />,
  );
  fireEvent.change(screen.getByLabelText('New availability'), { target: { value: 'maintenance' } });
  fireEvent.change(screen.getByLabelText('Reason'), { target: { value: ' Scheduled work ' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save availability' }));
  expect(save).toHaveBeenCalledWith('Scheduled work', 'maintenance');
});
it('ACC-004: pending physical commands disable all editing and cancellation', () => {
  render(
    <InventoryLifecycleEditor
      label="Room 101"
      archive
      pending
      onSave={vi.fn()}
      onCancel={vi.fn()}
    />,
  );
  expect(screen.getByLabelText('Reason').matches(':disabled')).toBe(true);
  expect(screen.getByRole('button', { name: 'Cancel edit' }).matches(':disabled')).toBe(true);
});
