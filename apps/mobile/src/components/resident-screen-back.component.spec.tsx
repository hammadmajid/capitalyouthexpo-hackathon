import { useState, useCallback, type ReactNode } from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import { Text } from 'react-native';
import { OwnerScreen } from './owner-screen';
import { useOwnerScreenBack } from './owner-screen-back';
jest.mock('./owner-wizard-ui', () => ({
  SetupShell: (props: { back: () => void; children: ReactNode }) => {
    const {
      Pressable,
      View,
      Text: Label,
    } = jest.requireActual<typeof import('react-native')>('react-native');
    return (
      <View>
        <Pressable accessibilityRole="button" accessibilityLabel="Screen Back" onPress={props.back}>
          <Label>Back</Label>
        </Pressable>
        {props.children}
      </View>
    );
  },
}));
function Details({ close }: { close: () => void }) {
  useOwnerScreenBack(close, true, 3);
  return <Text>Resident details</Text>;
}
function Workspace() {
  const [detail, setDetail] = useState(true);
  const close = useCallback(() => setDetail(false), []);
  return detail ? <Details close={close} /> : <Text>Residents list</Text>;
}
it('RES-004: the retained top Back returns to Residents before leaving branch operations', async () => {
  const dashboard = jest.fn();
  await render(
    <OwnerScreen title="Branch Operations" back={dashboard}>
      <Workspace />
    </OwnerScreen>,
  );
  await waitFor(() => expect(screen.getByText('Resident details')).toBeTruthy());
  await fireEvent.press(screen.getByRole('button', { name: 'Screen Back' }));
  expect(await screen.findByText('Residents list')).toBeTruthy();
  expect(dashboard).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByRole('button', { name: 'Screen Back' }));
  expect(dashboard).toHaveBeenCalledTimes(1);
});
function NestedWorkspace({ exit }: { exit: () => void }) {
  const [panel, setPanel] = useState(false);
  useOwnerScreenBack(() => exit());
  return panel ? (
    <Details close={() => setPanel(false)} />
  ) : (
    <Text accessibilityRole="button" onPress={() => setPanel(true)}>
      Open payment panel
    </Text>
  );
}
it('RES-004: closing a nested panel restores its parent Back handler', async () => {
  const exit = jest.fn(),
    dashboard = jest.fn();
  await render(
    <OwnerScreen title="Branch Operations" back={dashboard}>
      <NestedWorkspace exit={exit} />
    </OwnerScreen>,
  );
  await fireEvent.press(screen.getByRole('button', { name: 'Open payment panel' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Screen Back' }));
  expect(screen.getByText('Open payment panel')).toBeTruthy();
  expect(exit).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByRole('button', { name: 'Screen Back' }));
  expect(exit).toHaveBeenCalledTimes(1);
  expect(dashboard).not.toHaveBeenCalled();
});
