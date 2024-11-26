/// <reference types="jest" />
import { Text as MockText, View as MockView } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { LocationPicker } from './location-picker';
import { BranchMap } from './branch-map';
jest.mock('@maplibre/maplibre-react-native', () => ({
  Map: ({
    children,
    onPress,
    onDidFailLoadingMap,
    onDidFinishLoadingMap,
  }: {
    children: React.ReactNode;
    onPress: (event: unknown) => void;
    onDidFailLoadingMap: () => void;
    onDidFinishLoadingMap: () => void;
  }) => (
    <MockView>
      <MockText onPress={onDidFinishLoadingMap}>Finish map loading</MockText>
      <MockText onPress={() => onPress({ nativeEvent: { lngLat: [73.04, 33.7] } })}>
        Pick test map point
      </MockText>
      <MockText onPress={() => onPress({ nativeEvent: { lngLat: [999, 33] } })}>
        Invalid test map point
      </MockText>
      <MockText onPress={onDidFailLoadingMap}>Fail map loading</MockText>
      {children}
    </MockView>
  ),
  Camera: () => null,
  Marker: ({ children }: { children: React.ReactNode }) => <MockView>{children}</MockView>,
}));
test('ONB-001: the full-screen map saves only a valid chosen place', async () => {
  const change = jest.fn();
  await render(<LocationPicker change={change} disabled={false} />);
  expect(screen.queryByText('Pick test map point')).toBeNull();
  await fireEvent.press(screen.getByRole('button', { name: 'Choose on map' }));
  await fireEvent.press(await screen.findByText('Finish map loading'));
  expect(screen.getByText('Move the map to the hostel')).toBeVisible();
  await fireEvent.press(screen.getByText('Invalid test map point'));
  expect(screen.getByRole('button', { name: 'Save location' })).toBeDisabled();
  await fireEvent.press(screen.getByText('Pick test map point'));
  expect(change).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByRole('button', { name: 'Save location' }));
  expect(change).toHaveBeenCalledWith({ longitude: 73.04, latitude: 33.7 });
  expect(screen.queryByText('Pick test map point')).toBeNull();
});
test('ONB-001: native map failure and cancellation preserve the saved coordinates', async () => {
  const change = jest.fn();
  await render(
    <LocationPicker value={{ latitude: 33, longitude: 73 }} change={change} disabled={false} />,
  );
  await fireEvent.press(screen.getByRole('button', { name: 'Choose on map' }));
  await fireEvent.press(await screen.findByText('Fail map loading'));
  expect(screen.getByRole('alert')).toHaveTextContent(
    'Map unavailable. Close and reopen the map, or use your current location.',
  );
  await fireEvent.press(screen.getByRole('button', { name: 'Close map' }));
  expect(change).not.toHaveBeenCalled();
});
test('ONB-001: an existing native pin is rendered and invalid map events are rejected', async () => {
  const pick = jest.fn();
  await render(<BranchMap pin={{ latitude: 33, longitude: 73 }} pick={pick} close={jest.fn()} />);
  expect(screen.getByLabelText('Selected branch pin')).toBeVisible();
  await fireEvent.press(screen.getByText('Invalid test map point'));
  expect(pick).not.toHaveBeenCalled();
});
