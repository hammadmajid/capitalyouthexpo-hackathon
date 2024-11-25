import type { HostelComparison } from '@hsm/api-client';
import { summary, branchId } from './public-summary.fixture';
export const otherId = '10000000-0000-4000-8000-000000000002';
export const candidates = [
  { branchId, name: 'North hostel' },
  { branchId: otherId, name: 'South hostel' },
];
export const compared: HostelComparison = candidates.map((item) => ({
  listing: { ...summary.listing, ...item },
  roomTypes: { ...summary.rooms, branchId: item.branchId },
}));
