import { randomUUID } from 'node:crypto';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { InventoryBlockForm, ReleaseBlockForm } from './inventory-block-form';
afterEach(cleanup);
const branchId = randomUUID(),
  roomTypeId = randomUUID(),
  roomId = randomUUID(),
  bedId = randomUUID();
const rooms = [
  {
    id: roomId,
    branchId,
    roomTypeId,
    label: '101',
    status: 'active' as const,
    archivedAt: null,
    seats: [
      { id: bedId, roomId, label: 'A', ordinal: 1, status: 'active' as const, archivedAt: null },
    ],
  },
];
function fill(kind: 'room' | 'bed' = 'room') {
  fireEvent.change(screen.getByLabelText('Room to block'), { target: { value: roomId } });
  fireEvent.change(screen.getByLabelText('Block target'), { target: { value: kind } });
  if (kind === 'bed')
    fireEvent.change(screen.getByLabelText('Bed to block'), { target: { value: bedId } });
  fireEvent.change(screen.getByLabelText('Blocked from'), { target: { value: '2026-11-01' } });
  fireEvent.change(screen.getByLabelText('Available again on'), {
    target: { value: '2026-11-03' },
  });
  fireEvent.change(screen.getByLabelText('Block category'), { target: { value: 'maintenance' } });
  fireEvent.change(screen.getByLabelText('Private block reason'), {
    target: { value: ' Repair frame ' },
  });
}
it.each(['room', 'bed'] as const)(
  'ACC-001: %s form sends an exact current target, half-open dates and trimmed reason',
  (kind) => {
    const save = vi.fn();
    render(<InventoryBlockForm rooms={rooms} pending={false} onSave={save} onCancel={vi.fn()} />);
    fill(kind);
    fireEvent.click(screen.getByRole('button', { name: 'Create block' }));
    expect(save).toHaveBeenCalledWith({
      target: kind === 'room' ? { kind: 'room', roomId } : { kind: 'bed', roomId, bedId },
      range: { moveInDate: '2026-11-01', moveOutDate: '2026-11-03' },
      kind: 'maintenance',
      reason: 'Repair frame',
    });
  },
);
it('ACC-001: an empty date range cannot mutate inventory', () => {
  const save = vi.fn();
  render(<InventoryBlockForm rooms={rooms} pending={false} onSave={save} onCancel={vi.fn()} />);
  fill();
  fireEvent.change(screen.getByLabelText('Available again on'), {
    target: { value: '2026-11-01' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Create block' }));
  expect(save).not.toHaveBeenCalled();
  expect(screen.getByRole('alert')).toBeDefined();
});
it('ACC-004: retired rooms are not selectable and changing targets clears the bed selection', () => {
  render(
    <InventoryBlockForm
      rooms={[
        ...rooms,
        {
          ...rooms[0],
          id: randomUUID(),
          branchId,
          roomTypeId,
          label: 'Retired room',
          status: 'inactive',
          seats: [],
          archivedAt: '2026-10-15T10:00:00Z',
        },
      ]}
      pending={false}
      onSave={vi.fn()}
      onCancel={vi.fn()}
    />,
  );
  expect(screen.queryByRole('option', { name: 'Retired room' })).toBeNull();
  fill('bed');
  expect(screen.getByLabelText('Bed to block')).toHaveProperty('value', bedId);
  fireEvent.change(screen.getByLabelText('Block target'), { target: { value: 'room' } });
  fireEvent.change(screen.getByLabelText('Block target'), { target: { value: 'bed' } });
  expect(screen.getByLabelText('Bed to block')).toHaveProperty('value', '');
});
it('ACC-001: release requires an explicit reason and does not promise availability', () => {
  const save = vi.fn();
  render(<ReleaseBlockForm label="Room 101" pending={false} onSave={save} onCancel={vi.fn()} />);
  fireEvent.change(screen.getByLabelText('Release reason'), {
    target: { value: ' Repair complete ' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Confirm release' }));
  expect(save).toHaveBeenCalledWith('Repair complete');
  expect(
    screen.getByText(
      'Release this block. Other reservations and availability settings still apply.',
    ),
  ).toBeDefined();
});
it('ACC-004: pending block commands disable editing and cancellation', () => {
  render(<ReleaseBlockForm label="Room 101" pending onSave={vi.fn()} onCancel={vi.fn()} />);
  expect(screen.getByLabelText('Release reason').matches(':disabled')).toBe(true);
  expect(screen.getByRole('button', { name: 'Cancel block edit' }).matches(':disabled')).toBe(true);
});
