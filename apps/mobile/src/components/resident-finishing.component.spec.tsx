import { render, screen, fireEvent } from '@testing-library/react-native';
import { Text } from 'react-native';
import { OwnerScreenBack } from './owner-screen-back';
import { StayStaffSections } from './stay-staff-sections';

it('RES-004: checkout keeps a visible local Back even inside the scrolling Owner shell', async () => {
  await render(
    <OwnerScreenBack.Provider value={() => () => undefined}>
      <StayStaffSections
        showLifecycle
        agreement={<Text>Agreement</Text>}
        money={<Text>History</Text>}
        lifecycle={<Text>Checkout details</Text>}
        transfer={<Text>Transfer</Text>}
      />
    </OwnerScreenBack.Provider>,
  );
  await fireEvent.press(screen.getByRole('button', { name: 'Stay and checkout' }));
  expect(screen.getByRole('button', { name: 'Back from stay and checkout' })).toBeTruthy();
  await fireEvent.press(screen.getByRole('button', { name: 'Back from stay and checkout' }));
  expect(screen.getByRole('button', { name: 'Collect rent' })).toBeTruthy();
});
