import { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { AdmissionCnicPhoto } from './admission-cnic-photo';
const mockPicker = jest.fn();
jest.mock('./private-file-picker', () => {
  const { Pressable, Text } = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    PrivateFilePicker: (props: { onReady: (id: string | undefined) => void }) => {
      mockPicker(props);
      return (
        <>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Select test photo"
            onPress={() => props.onReady('photo')}
          >
            <Text>Select</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Delete test photo"
            onPress={() => props.onReady(undefined)}
          >
            <Text>Delete</Text>
          </Pressable>
        </>
      );
    },
  };
});
function Fixture({ disabled = false }: { disabled?: boolean }) {
  const [value, setValue] = useState('35202-1234567-1');
  const [fileId, setFile] = useState<string>();
  return (
    <AdmissionCnicPhoto
      actorId="owner"
      value={value}
      onChange={setValue}
      fileId={fileId}
      onReady={setFile}
      onBusy={jest.fn()}
      onPending={jest.fn()}
      disabled={disabled}
    />
  );
}
beforeEach(() => mockPicker.mockClear());
it('RES-001 / UI-001: the camera opens an actor-bound image picker without changing the CNIC', async () => {
  await render(<Fixture />);
  await fireEvent.press(screen.getByRole('button', { name: 'Add CNIC photo' }));
  expect(mockPicker).toHaveBeenLastCalledWith(
    expect.objectContaining({
      actorId: 'owner',
      imagesOnly: true,
      purpose: 'resident_document',
      autoOpen: true,
    }),
  );
  await fireEvent.press(screen.getByRole('button', { name: 'Select test photo' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Cancel' }));
  expect(screen.getByRole('button', { name: 'View CNIC photo' })).toBeTruthy();
  expect(screen.getByLabelText('CNIC').props.value).toBe('35202-1234567-1');
  await fireEvent.press(screen.getByRole('button', { name: 'View CNIC photo' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Delete test photo' }));
  expect(mockPicker).toHaveBeenLastCalledWith(expect.objectContaining({ autoOpen: false }));
  await fireEvent.press(screen.getByRole('button', { name: 'Cancel' }));
  expect(screen.getByRole('button', { name: 'Add CNIC photo' })).toBeTruthy();
});
it('SEC-003: disabled admission cannot open a photo chooser', async () => {
  await render(<Fixture disabled />);
  expect(screen.getByRole('button', { name: 'Add CNIC photo' })).toBeDisabled();
  await fireEvent.press(screen.getByRole('button', { name: 'Add CNIC photo' }));
  expect(mockPicker).not.toHaveBeenCalled();
});
