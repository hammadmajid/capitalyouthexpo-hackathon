/// <reference types="jest" />
import { fireEvent, render, screen } from '@testing-library/react-native';
import { MarketplaceHero } from './hero';
jest.mock('lucide-react-native', () => ({
  ShieldCheck: () => null,
  BedDouble: () => null,
  UsersRound: () => null,
}));
test('ACC-002: native Home artwork is explicitly illustrative with accessible live headline and guidance', async () => {
  await render(<MarketplaceHero />);
  expect(screen.getByRole('header')).toHaveTextContent(/Find Your/);
  expect(screen.getByText('Illustrative image')).toBeOnTheScreen();
  expect(screen.getByText('Safe. Comfortable. Near Your University.')).toBeOnTheScreen();
  expect(screen.queryByText('Verified property')).toBeNull();
});
test('ACC-002: image failure retains live Home content and a truthful branded fallback', async () => {
  await render(<MarketplaceHero />);
  await fireEvent(screen.getByTestId('Home hero artwork'), 'error');
  expect(screen.queryByTestId('Home hero artwork')).toBeNull();
  expect(screen.getByText('Illustration unavailable.')).toBeOnTheScreen();
  expect(screen.getByRole('header')).toHaveTextContent(/Perfect Hostel/);
});
