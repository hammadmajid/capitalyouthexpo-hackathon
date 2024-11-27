/// <reference types="jest" />
import { render, screen, userEvent } from '@testing-library/react-native';
import { listingSummarySchema } from '@hsm/contracts';
import { HostelCard } from './card';
jest.mock('lucide-react-native', () => ({
  Heart: () => null,
  MapPin: () => null,
  ShieldCheck: () => null,
  Building2: () => null,
}));
const listing = listingSummarySchema.parse({
  branchId: '019a1234-1234-7123-8123-123456789abc',
  brandName: 'Fixture hostel',
  name: 'Approved hostel',
  slug: 'approved-hostel',
  category: 'boys',
  city: 'Islamabad',
  area: null,
  latitude: 33.68,
  longitude: 73.04,
  priceFromPaisa: null,
  verified: true,
  availableBeds: null,
  availableWholeRooms: null,
  amenities: [],
  media: [],
  distanceMeters: null,
});
test('ACC-002: unknown favorite status cannot masquerade as unsaved or trigger a mutation', async () => {
  const toggleSaved = jest.fn();
  await render(
    <HostelCard
      listing={listing}
      imageUrl={null}
      saved={null}
      open={jest.fn()}
      toggleSaved={toggleSaved}
    />,
  );
  const button = screen.getByRole('button', {
    name: 'Saved status not loaded for Approved hostel',
  });
  expect(button).toBeDisabled();
  await userEvent.setup().press(button);
  expect(toggleSaved).not.toHaveBeenCalled();
  expect(screen.queryByRole('button', { name: 'Save Approved hostel' })).toBeNull();
});
test('ACC-002: a known saved card offers an explicit remove action', async () => {
  const toggleSaved = jest.fn();
  await render(
    <HostelCard
      listing={listing}
      imageUrl={null}
      saved
      open={jest.fn()}
      toggleSaved={toggleSaved}
    />,
  );
  await userEvent.setup().press(screen.getByRole('button', { name: 'Unsave Approved hostel' }));
  expect(toggleSaved).toHaveBeenCalledTimes(1);
});
