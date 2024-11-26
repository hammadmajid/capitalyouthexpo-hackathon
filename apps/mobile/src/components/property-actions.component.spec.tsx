/// <reference types="jest" />
import { fireEvent, render, screen } from '@testing-library/react-native';
import { PropertyActions } from './property-actions';
import type { FloorRooms } from './use-floor-rooms';
const mockMutate = jest.fn();
const mockCommand = { mutate: mockMutate, isPending: false, unresolved: false, error: null };
jest.mock('./services/use-command', () => ({ useNativeCommand: () => mockCommand }));
jest.mock('lucide-react-native', () => ({
  Pencil: () => null,
  Trash2: () => null,
  Check: () => null,
  X: () => null,
  ChevronRight: () => null,
  ArrowLeft: () => null,
}));
const data = { actorId: 'actor', branchId: 'branch' } as FloorRooms;
beforeEach(() => {
  mockMutate.mockClear();
  mockCommand.isPending = false;
  mockCommand.unresolved = false;
});
it.each(['building', 'floor', 'room', 'seat'] as const)(
  'ROOM-002 / BED-001: %s deletion requires confirmation; cancelling never submits',
  async (kind) => {
    await render(
      <PropertyActions
        data={data}
        kind={kind}
        id="id"
        label="Block A"
        name="Block A"
        version={2}
      />,
    );
    expect(screen.queryByText('Delete Block A?')).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: 'Edit Block A' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Delete' }));
    expect(screen.getByText('Delete Block A?')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Cancel' }));
    expect(mockMutate).not.toHaveBeenCalled();
    expect(screen.queryByText('Delete Block A?')).toBeNull();
  },
);
it('ACC-006: submits a confirmed intent and blocks duplicate or uncertain commands', async () => {
  const view = await render(
    <PropertyActions data={data} kind="room" id="id" label="Room 101" name="101" />,
  );
  await fireEvent.press(screen.getByRole('button', { name: 'Edit Room 101' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Delete' }));
  expect(screen.getByText('This also removes its beds. History is kept.')).toBeTruthy();
  await fireEvent.press(screen.getByRole('button', { name: 'Confirm delete' }));
  expect(mockMutate).toHaveBeenCalledWith(
    { confirmed: true },
    expect.objectContaining({ onSuccess: expect.any(Function) }),
  );
  mockCommand.isPending = true;
  await view.rerender(
    <PropertyActions data={data} kind="room" id="id" label="Room 101" name="101" />,
  );
  expect(screen.getByRole('button', { name: 'Confirm delete' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
});

it('ROOM-002: edit name submits a trimmed name and expected old name', async () => {
  await render(<PropertyActions data={data} kind="room" id="id" label="Room 101" name="101" />);
  await fireEvent.press(screen.getByRole('button', { name: 'Edit Room 101' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Edit name' }));
  expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  await fireEvent.changeText(screen.getByLabelText('Name'), '  102  ');
  await fireEvent.press(screen.getByRole('button', { name: 'Save' }));
  expect(mockMutate).toHaveBeenCalledWith(
    { name: '102', expectedName: '101' },
    expect.objectContaining({ onSuccess: expect.any(Function) }),
  );
});

it('ROOM-002: the action dialog fills its padded frame instead of shrinking to button text', async () => {
  await render(<PropertyActions data={data} kind="room" id="id" label="Room 101" name="101" />);
  await fireEvent.press(screen.getByRole('button', { name: 'Edit Room 101' }));
  expect(screen.getByLabelText('Property actions dialog')).toHaveStyle({ width: '100%' });
});
