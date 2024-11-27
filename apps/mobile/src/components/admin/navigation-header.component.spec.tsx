import { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { BackHandler } from 'react-native';
import { router } from 'expo-router';
import { AdminHeader } from './navigation-header';
jest.mock('expo-router', () => ({
  useFocusEffect: (work: () => undefined | (() => void)) =>
    jest.requireActual<typeof import('react')>('react').useEffect(work, [work]),
  router: { back: jest.fn(), replace: jest.fn(), canGoBack: jest.fn() },
}));
beforeEach(() => jest.clearAllMocks());
it('ADM-001: back follows history and deep links have an explicit safe parent', async () => {
  jest.mocked(router.canGoBack).mockReturnValue(true);
  await render(<AdminHeader title="Branch" backTo="/admin/admins" />);
  await fireEvent.press(screen.getByRole('button', { name: 'Back' }));
  expect(router.back).toHaveBeenCalledTimes(1);
  expect(router.replace).not.toHaveBeenCalled();
  jest.mocked(router.canGoBack).mockReturnValue(false);
  await fireEvent.press(screen.getByRole('button', { name: 'Back' }));
  expect(router.replace).toHaveBeenCalledWith('/admin/admins');
});
it('ADM-001: pending commands disable back; unsupported search has no decorative icon', async () => {
  await render(<AdminHeader title="Decision" backDisabled />);
  expect(screen.getByRole('button', { name: 'Back' })).toBeDisabled();
  await fireEvent.press(screen.getByRole('button', { name: 'Back' }));
  expect(router.back).not.toHaveBeenCalled();
  expect(screen.queryByRole('button', { name: 'Search Decision' })).toBeNull();
});
it('HMA-017: contextual search reveals input, submits exact text and preserves draft when closed', async () => {
  const submit = jest.fn();
  function Fixture() {
    const [value, onChange] = useState('');
    return (
      <AdminHeader
        title="Branches"
        search={{
          label: 'Branch search',
          value,
          onChange,
          onSubmit: () => submit(value),
          submitLabel: 'Find branches',
        }}
      />
    );
  }
  await render(<Fixture />);
  expect(screen.queryByLabelText('Branch search')).toBeNull();
  await fireEvent.press(screen.getByRole('button', { name: 'Search Branches' }));
  await fireEvent.changeText(screen.getByLabelText('Branch search'), 'Branch %_');
  await fireEvent.press(screen.getByRole('button', { name: 'Find branches' }));
  expect(submit).toHaveBeenCalledWith('Branch %_');
  await fireEvent.press(screen.getByRole('button', { name: 'Search Branches' }));
  expect(screen.queryByLabelText('Branch search')).toBeNull();
  await fireEvent.press(screen.getByRole('button', { name: 'Search Branches' }));
  expect(screen.getByLabelText('Branch search').props.value).toBe('Branch %_');
});

it('ACC-001: primary dashboards omit back; modal back delegates to its existing close handler', async () => {
  const close = jest.fn();
  const view = await render(<AdminHeader title="HSM" showBack={false} />);
  expect(screen.queryByRole('button', { name: 'Back' })).toBeNull();
  await view.rerender(<AdminHeader title="Hostel details" onBack={close} />);
  await fireEvent.press(screen.getByRole('button', { name: 'Back' }));
  expect(close).toHaveBeenCalledTimes(1);
  expect(router.back).not.toHaveBeenCalled();
});

it('ACC-001: inline Android back closes the active workflow and cleans up its listener', async () => {
  const close = jest.fn(),
    remove = jest.fn();
  let back: () => boolean | null | undefined = () => false;
  const subscription = jest
    .spyOn(BackHandler, 'addEventListener')
    .mockImplementation((_event, handler) => {
      back = () => handler({} as never);
      return { remove };
    });
  const view = await render(<AdminHeader title="Rooms" onBack={close} />);
  expect(back()).toBe(true);
  expect(close).toHaveBeenCalledTimes(1);
  await view.rerender(<AdminHeader title="Rooms" onBack={close} backDisabled />);
  expect(back()).toBe(true);
  expect(close).toHaveBeenCalledTimes(1);
  await view.unmount();
  expect(remove).toHaveBeenCalled();
  subscription.mockRestore();
});
