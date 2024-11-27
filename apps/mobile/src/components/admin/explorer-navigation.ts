import { router } from 'expo-router';
import type { AdminExplorerKind } from '@hsm/contracts';
export const explorerTitles: Record<AdminExplorerKind, string> = {
  users: 'Registered users',
  owners: 'Hostel owners',
  managers: 'Hostel managers',
  hostels: 'Hostel businesses',
  branches: 'Hostel branches',
  bookings: 'Bookings',
  complaints: 'Resident complaint categories',
  occupancy: 'Current occupancy',
  payments: 'Approved hostel payments',
};
export function openExplorer(
  kind: AdminExplorerKind,
  filters: { parentId?: string; ownerId?: string; managerId?: string; status?: string } = {},
) {
  router.push({ pathname: '/admin/explorer/[kind]', params: { kind, ...filters } });
}
export function openExplorerProfile(kind: AdminExplorerKind, id: string) {
  router.push({ pathname: '/admin/explorer/[kind]/[id]', params: { kind, id } });
}
