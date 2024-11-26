/// <reference types="jest" />
import { render, screen, fireEvent } from '@testing-library/react-native';
import type { PropertyFloor } from '@hsm/contracts';
import { OwnerFloorGrid } from './owner-floor-grid';
jest.mock('lucide-react-native', () => ({
  ChevronRight: () => null,
  Layers3: () => null,
  Plus: () => null,
}));
const floor: PropertyFloor = {
  id: '019a1234-1234-7123-8123-000000000001',
  buildingId: '019a1234-1234-7123-8123-000000000002',
  branchId: '019a1234-1234-7123-8123-000000000003',
  label: 'Ground floor',
  levelNumber: 0,
  version: 1,
  archivedAt: null,
};
it('BRN-001: floor cards show the saved floor name and open the exact saved floor', async () => {
  const open = jest.fn();
  await render(<OwnerFloorGrid floors={[floor]} open={open} />);
  expect(screen.getByText('Ground floor')).toBeTruthy();
  expect(screen.queryByText('0')).toBeNull();
  await fireEvent.press(screen.getByRole('button', { name: 'Open floor 0' }));
  expect(open).toHaveBeenCalledWith(floor);
  expect(screen.queryByRole('button', { name: 'Add floor' })).toBeNull();
});
it('SEC-001: creation is absent for readers and unavailable while a command is unresolved', async () => {
  const add = jest.fn();
  await render(<OwnerFloorGrid floors={[]} open={jest.fn()} add={add} busy />);
  expect(screen.getByRole('button', { name: 'Add floor' })).toBeDisabled();
  await fireEvent.press(screen.getByRole('button', { name: 'Add floor' }));
  expect(add).not.toHaveBeenCalled();
});
