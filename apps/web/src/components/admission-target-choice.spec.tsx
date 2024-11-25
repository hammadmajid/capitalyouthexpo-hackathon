import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { AdmissionTargetChoice } from './admission-target-choice';
import {
  inventory,
  branchId,
  type as roomType,
  roomId,
  seatId,
} from '../../test/unit/inventory-pages.fixture';
afterEach(cleanup);
function fixture() {
  const onChoose = vi.fn(),
    onRoom = vi.fn();
  const props = { branchId, roomType, rooms: inventory.rooms, disabled: false, onChoose, onRoom };
  return { ...render(<AdmissionTargetChoice {...props} />), props, onChoose, onRoom };
}
function room() {
  fireEvent.change(screen.getByLabelText('Admission room'), { target: { value: roomId } });
}
function kind(value = 'bed') {
  fireEvent.change(screen.getByLabelText('Admission target type'), { target: { value } });
}
function select() {
  fireEvent.click(screen.getByRole('button', { name: 'Continue with selected target' }));
}

it('STAY-001 / ACC-001: missing room and target choice cannot emit an admission target', () => {
  const f = fixture();
  select();
  expect(f.onChoose).not.toHaveBeenCalled();
});
it('STAY-001 / ACC-001: a selected room in bed mode still requires an explicit bed', () => {
  const f = fixture();
  room();
  kind();
  select();
  expect(f.onChoose).not.toHaveBeenCalled();
});
it('STAY-001 / ACC-001: the explicit named physical bed reaches review without displaying raw IDs', () => {
  const f = fixture();
  room();
  kind();
  fireEvent.change(screen.getByLabelText('Admission bed'), { target: { value: seatId } });
  select();
  expect(f.onChoose).toHaveBeenCalledWith(
    { kind: 'bed', roomId, bedId: seatId },
    'Two beds · 101 · A',
  );
  expect(screen.queryByText(seatId)).toBeNull();
  expect(f.onRoom).toHaveBeenCalledWith(roomId);
});
it('STAY-001: whole-room choice omits a bed and preserves the explicit physical room', () => {
  const f = fixture();
  room();
  kind('room');
  select();
  expect(f.onChoose).toHaveBeenCalledWith({ kind: 'room', roomId }, 'Two beds · 101');
  expect(screen.queryByLabelText('Admission bed')).toBeNull();
});
it('SEC-003: foreign branch metadata hides the private target form', () => {
  const f = fixture();
  f.rerender(<AdmissionTargetChoice {...f.props} branchId={seatId} />);
  expect(screen.getByRole('alert')).toBeDefined();
  expect(screen.queryByLabelText('Admission room')).toBeNull();
  expect(f.onChoose).not.toHaveBeenCalled();
});
it('ACC-001: a target that becomes inactive cannot submit despite a retained prior choice', () => {
  const f = fixture();
  room();
  kind('room');
  f.rerender(
    <AdmissionTargetChoice
      {...f.props}
      rooms={inventory.rooms.map((value) => ({ ...value, status: 'maintenance' }))}
    />,
  );
  select();
  expect(f.onChoose).not.toHaveBeenCalled();
  expect(screen.getByRole('alert')).toBeDefined();
});
it('ACC-001: bed detail loading does not clear the deliberate room or target type', () => {
  const f = fixture();
  room();
  kind();
  f.rerender(
    <AdmissionTargetChoice
      {...f.props}
      rooms={inventory.rooms.map((value) => ({ ...value, seats: [...value.seats] }))}
    />,
  );
  expect((screen.getByLabelText('Admission room') as HTMLSelectElement).value).toBe(roomId);
  fireEvent.change(screen.getByLabelText('Admission bed'), { target: { value: seatId } });
  select();
  expect(f.onChoose).toHaveBeenCalledTimes(1);
});
it('ACC-004: pending state cannot emit or change the target through the form', () => {
  const f = fixture();
  room();
  kind('room');
  f.rerender(<AdmissionTargetChoice {...f.props} disabled />);
  select();
  expect(f.onChoose).not.toHaveBeenCalled();
  expect(screen.getByLabelText('Admission room').closest('fieldset')?.disabled).toBe(true);
});
it('ACC-001: room-type mode changes discard the old selection and remove disallowed room choices', () => {
  const f = fixture();
  room();
  kind('room');
  f.rerender(
    <AdmissionTargetChoice {...f.props} roomType={{ ...roomType, inventoryMode: 'per_bed' }} />,
  );
  expect((screen.getByLabelText('Admission room') as HTMLSelectElement).value).toBe('');
  expect(screen.queryByRole('option', { name: 'Whole room' })).toBeNull();
  select();
  expect(f.onChoose).not.toHaveBeenCalled();
});

it('ACC-001: a removed room cannot regain a stale selection when the page reappears', () => {
  const f = fixture();
  room();
  kind('room');
  f.rerender(<AdmissionTargetChoice {...f.props} rooms={[]} />);
  f.rerender(<AdmissionTargetChoice {...f.props} />);
  expect((screen.getByLabelText('Admission room') as HTMLSelectElement).value).toBe('');
  select();
  expect(f.onChoose).not.toHaveBeenCalled();
});

it('ACC-001: a bed removed and restored requires a new explicit bed choice', () => {
  const f = fixture();
  room();
  kind();
  fireEvent.change(screen.getByLabelText('Admission bed'), { target: { value: seatId } });
  f.rerender(
    <AdmissionTargetChoice
      {...f.props}
      rooms={inventory.rooms.map((value) => ({ ...value, seats: [] }))}
    />,
  );
  f.rerender(<AdmissionTargetChoice {...f.props} />);
  expect((screen.getByLabelText('Admission room') as HTMLSelectElement).value).toBe(roomId);
  expect((screen.getByLabelText('Admission bed') as HTMLSelectElement).value).toBe('');
  select();
  expect(f.onChoose).not.toHaveBeenCalled();
});
