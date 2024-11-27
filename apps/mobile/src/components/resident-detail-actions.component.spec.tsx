import { render, screen, fireEvent } from '@testing-library/react-native';
import { Text, Pressable, View } from 'react-native';
import { StayStaffSections } from './stay-staff-sections';
async function show() {
  await render(
    <StayStaffSections
      showLifecycle
      agreement={<Text>Agreement record</Text>}
      money={<Text>Invoices and payment records</Text>}
      lifecycle={<Text>Checkout form</Text>}
      transfer={<Text>Bed transfer form</Text>}
      header={(checkout, agreement) => (
        <View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Stay and checkout"
            onPress={checkout}
          >
            <Text>More</Text>
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="Agreement" onPress={agreement}>
            <Text>Agreement in menu</Text>
          </Pressable>
        </View>
      )}
      summary={(open) => (
        <Pressable accessibilityRole="button" accessibilityLabel="View payments" onPress={open}>
          <Text>Summary</Text>
        </Pressable>
      )}
    />,
  );
}
it('RES-004 / PAY-008: View payments opens the same payment workspace as the footer', async () => {
  await show();
  await fireEvent.press(screen.getByRole('button', { name: 'View payments' }));
  expect(screen.getByText('Invoices and payment records')).toBeTruthy();
  await fireEvent.press(screen.getByRole('button', { name: 'Back from payment history' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Collect rent' }));
  expect(screen.getByText('Invoices and payment records')).toBeTruthy();
});
it('RES-004: preserves Shift Bed and Agreement actions', async () => {
  await show();
  await fireEvent.press(screen.getByRole('button', { name: 'Shift bed' }));
  expect(screen.getByText('Bed transfer form')).toBeTruthy();
  await fireEvent.press(screen.getByRole('button', { name: 'Back from shift bed' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Agreement' }));
  expect(screen.getByText('Agreement record')).toBeTruthy();
});
it('RES-004: keeps checkout reachable through the identity menu', async () => {
  await show();
  await fireEvent.press(screen.getByRole('button', { name: 'Stay and checkout' }));
  expect(screen.getByText('Checkout form')).toBeTruthy();
});
it('RES-004: keeps Edit out of the bottom action row', async () => {
  await show();
  expect(screen.queryByRole('button', { name: 'Edit resident' })).toBeNull();
});
