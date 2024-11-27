/// <reference types="jest" />
import { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { publicGallery, readBranchMenu, readPublicMenu } from '@hsm/api-client';
import { ClockPicker, joinClock } from './clock-picker';
import { clock12 } from './menu-week';
import { MealTimesEditor, timeKey, type Draft } from './meal-times-editor';
import { OwnerMenuCard, readTimes } from './owner-menu-card';
import { PublicFood } from './public-food';
jest.mock('../../lib/runtime', () => ({
  client: {},
  actorClient: async () => ({}),
  config: { apiUrl: 'http://api' },
}));
jest.mock('../../lib/messages', () => ({ safeMessage: () => 'Failed' }));
jest.mock('@hsm/api-client', () => ({
  ...jest.requireActual('@hsm/api-client'),
  publicGallery: jest.fn(),
  readPublicMenu: jest.fn(),
  readBranchMenu: jest.fn(),
  updateBranchMenu: jest.fn(),
}));
const branchId = '10000000-0000-4000-8000-000000000001';
test('CHG-037: clock values read as 12-hour and save as 24-hour', () => {
  expect(clock12('07:05')).toBe('7:05 AM');
  expect(clock12('19:30')).toBe('7:30 PM');
  expect(clock12('00:00')).toBe('12:00 AM');
  expect(joinClock(12, 0, false)).toBe('00:00');
  expect(joinClock(7, 30, true)).toBe('19:30');
});
test('CHG-037: picking an hour then minutes on the clock sets the time', async () => {
  const onPick = jest.fn();
  await render(
    <ClockPicker
      visible
      title="Lunch starts"
      value={undefined}
      onClose={jest.fn()}
      onPick={onPick}
    />,
  );
  await fireEvent.press(screen.getByRole('button', { name: 'PM' }));
  await fireEvent.press(screen.getByRole('button', { name: '1' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Choose minutes' }));
  await fireEvent.press(screen.getByRole('button', { name: '30' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Set time' }));
  expect(onPick).toHaveBeenCalledWith('13:30');
});
function Editor() {
  const [draft, setDraft] = useState<Draft>({
    [timeKey(1, 'breakfast', 'from')]: '07:00',
    [timeKey(1, 'breakfast', 'to')]: '09:00',
  });
  return (
    <>
      <MealTimesEditor day={1} draft={draft} change={setDraft} disabled={false} />
      <MealTimesEditor day={6} draft={draft} change={setDraft} disabled={false} />
    </>
  );
}
test('CHG-037: Monday times copy to weekdays only, so the weekend can differ', async () => {
  await render(<Editor />);
  expect(screen.queryByRole('button', { name: 'Every day' })).toBeNull();
  const [weekdays] = screen.getAllByRole('button', { name: 'Mon–Fri' });
  if (weekdays) await fireEvent.press(weekdays);
  expect(screen.getAllByText('7:00 AM')).toHaveLength(1);
  // A lunch dish needs complete times…
  expect(readTimes({ '2:lunch': 'Daal', [timeKey(2, 'lunch', 'from')]: '13:00' }).problem).toMatch(
    /Tuesday lunch/,
  );
  // …but lunch is optional: with no lunch dish its leftover times are ignored, not an error.
  expect(readTimes({ [timeKey(2, 'lunch', 'from')]: '13:00' })).toEqual({ times: [] });
  expect(readTimes({ [timeKey(2, 'breakfast', 'from')]: '08:00' }).problem).toMatch(
    /Tuesday breakfast/,
  );
  expect(
    readTimes({ [timeKey(6, 'dinner', 'from')]: '20:00', [timeKey(6, 'dinner', 'to')]: '22:00' })
      .times,
  ).toEqual([{ dayOfWeek: 6, meal: 'dinner', startsAt: '20:00', endsAt: '22:00' }]);
});
test('SERV-001: setup opens the menu editor and reveals optional serving times on demand', async () => {
  jest
    .mocked(readBranchMenu)
    .mockResolvedValue({ branchId, version: 0, updatedAt: null, items: [], times: [] });
  await render(
    <QueryClientProvider client={new QueryClient()}>
      <OwnerMenuCard actorId="owner" branchId={branchId} />
    </QueryClientProvider>,
  );
  const open = await screen.findByRole('button', { name: 'Add food menu' });
  expect(screen.queryByLabelText('Breakfast')).toBeNull();
  await fireEvent.press(open);
  await fireEvent.press(screen.getByRole('button', { name: 'Mon' }));
  expect(screen.getByText('Meals for Monday')).toBeTruthy();
  expect(screen.getByLabelText('Breakfast')).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Breakfast starts' })).toBeNull();
  await fireEvent.press(screen.getByRole('button', { name: 'Set serving times (optional)' }));
  expect(screen.getByRole('button', { name: 'Breakfast starts' })).toBeTruthy();
});
test('SERV-001: guests see kitchen and dining photos with the menu and its times', async () => {
  jest.mocked(readPublicMenu).mockResolvedValue({
    branchId,
    version: 1,
    updatedAt: null,
    items: [1, 2, 3, 4, 5, 6, 7].map((dayOfWeek) => ({
      dayOfWeek,
      meal: 'lunch' as const,
      description: 'Daal Chawal',
    })),
    times: [1, 2, 3, 4, 5, 6, 7].map((dayOfWeek) => ({
      dayOfWeek,
      meal: 'lunch' as const,
      startsAt: '13:00',
      endsAt: '14:30',
    })),
  });
  jest.mocked(publicGallery).mockResolvedValue({
    branchId,
    data: [
      { id: 'a', altText: 'Kitchen: Kitchen' },
      { id: 'b', altText: 'Dining: Dining area' },
      { id: 'c', altText: 'Hostel photos' },
    ],
    nextCursor: null,
  } as never);
  await render(
    <QueryClientProvider client={new QueryClient()}>
      <PublicFood branchId={branchId} />
    </QueryClientProvider>,
  );
  expect(await screen.findByText('Lunch · 1:00 PM–2:30 PM')).toBeTruthy();
  expect(screen.getByText('Daal Chawal')).toBeTruthy();
  expect(screen.getByLabelText('Kitchen: Kitchen')).toBeTruthy();
  expect(screen.getByLabelText('Dining: Dining area')).toBeTruthy();
  expect(screen.queryByLabelText('Hostel photos')).toBeNull();
});
test('CHG-037: the owner can preview the saved week or reopen editing', async () => {
  jest.mocked(readBranchMenu).mockResolvedValue({
    branchId,
    version: 1,
    updatedAt: null,
    items: [{ dayOfWeek: 6, meal: 'dinner', description: 'Biryani' }],
    times: [{ dayOfWeek: 6, meal: 'dinner', startsAt: '20:00', endsAt: '22:00' }],
  });
  await render(
    <QueryClientProvider client={new QueryClient()}>
      <OwnerMenuCard actorId="owner" branchId={branchId} />
    </QueryClientProvider>,
  );
  await fireEvent.press(await screen.findByRole('button', { name: 'View weekly menu' }));
  expect(screen.getByText('Biryani')).toBeTruthy();
  expect(screen.getByText('8:00 PM–10:00 PM')).toBeTruthy();
  await fireEvent.press(screen.getByRole('button', { name: 'Edit menu' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Sat' }));
  expect(screen.getByLabelText('Dinner').props.value).toBe('Biryani');
});
