/// <reference types="jest" />
import { render, screen, userEvent } from '@testing-library/react-native';
import { MarketplaceNavigation } from './navigation';
import { MarketplaceHeader } from './header';
jest.mock('lucide-react-native', () => ({
  Home: () => null,
  MapPin: () => null,
  Heart: () => null,
  CalendarDays: () => null,
  UserRound: () => null,
  Bell: () => null,
  House: () => null,
}));
test('ACC-002: customer navigation exposes the approved five destinations', async () => {
  const select = jest.fn();
  await render(<MarketplaceNavigation selected="Home" select={select} />);
  expect(screen.getAllByRole('tab')).toHaveLength(5);
  expect(screen.getByRole('tab', { name: 'Home', selected: true })).toBeVisible();
  await userEvent.setup().press(screen.getByRole('tab', { name: 'Saved' }));
  expect(select).toHaveBeenCalledWith('Saved');
});
test('ACC-002: notification count reflects the supplied state and guest profile remains accessible', async () => {
  const profile = jest.fn(),
    notifications = jest.fn();
  await render(
    <MarketplaceHeader
      name={null}
      unreadCount={0}
      openProfile={profile}
      openNotifications={notifications}
    />,
  );
  expect(screen.queryByText('0')).toBeNull();
  await userEvent.setup().press(screen.getByRole('button', { name: 'Notifications' }));
  await userEvent.setup().press(screen.getByRole('button', { name: 'Profile' }));
  expect(notifications).toHaveBeenCalledTimes(1);
  expect(profile).toHaveBeenCalledTimes(1);
});
