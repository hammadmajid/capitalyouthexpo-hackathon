import type { readPublicHostelSummary } from '@hsm/api-client';
export const branchId = '10000000-0000-4000-8000-000000000001';
export const summary = {
  listing: {
    branchId,
    brandName: 'Public hostel',
    name: 'Public branch',
    slug: 'public-branch',
    category: 'boys',
    city: 'Islamabad',
    area: null,
    latitude: 33.7,
    longitude: 73.1,
    priceFromPaisa: 1800001,
    verified: true,
    availableBeds: null,
    availableWholeRooms: null,
    amenities: [{ code: 'wifi', name: 'Wi-Fi' }],
    media: [],
    distanceMeters: null,
    description: '<script>Public description</script>',
    address: 'Public address',
    landmark: null,
    publicPhone: null,
    publicEmail: null,
  },
  rooms: {
    branchId,
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
  rules: {
    branchId,
    data: [
      { id: '10000000-0000-4000-8000-000000000005', sortOrder: 0, body: 'Published house rule' },
    ],
    nextCursor: null,
  },
} satisfies Awaited<ReturnType<typeof readPublicHostelSummary>>;
