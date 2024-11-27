import type { HostelComparison } from '@hsm/api-client';
export const candidates = [
  { branchId: '10000000-0000-4000-8000-000000000001', name: 'North hostel' },
  { branchId: '10000000-0000-4000-8000-000000000002', name: 'South hostel' },
];
export const compared: HostelComparison = candidates.map((item) => ({
  listing: {
    ...item,
    brandName: 'Hostel',
    slug: item.branchId,
    category: 'boys',
    city: 'Islamabad',
    area: null,
    latitude: 33,
    longitude: 73,
    priceFromPaisa: 1800001,
    verified: true,
    availableBeds: null,
    availableWholeRooms: null,
    amenities: [],
    media: [],
    distanceMeters: null,
  },
  roomTypes: {
    branchId: item.branchId,
    data: [
      {
        id: '10000000-0000-4000-8000-000000000004',
        name: 'Twin beds',
        capacity: 2,
        inventoryMode: 'both',
        bedMonthlyRentPaisa: 1800001,
        roomMonthlyRentPaisa: 3000000,
        depositPaisa: 500000,
        fees: [],
        amenities: [],
      },
    ],
    nextCursor: null,
  },
}));
