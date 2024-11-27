import { render, screen, fireEvent } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { readResidentProfile } from '@hsm/api-client';
import { ResidentProfile } from './resident-profile';
import type { ResidentProfile as Profile } from '@hsm/contracts';
jest.mock('../lib/runtime', () => ({ actorClient: async () => ({}) }));
jest.mock('@hsm/api-client', () => ({ readResidentProfile: jest.fn() }));
jest.mock('./staff-stay-workspace', () => ({
  StaffStayWorkspace: (props: { stayId: string; onClose: () => void; onHistory?: () => void }) => {
    const { Text, Pressable, View } =
      jest.requireActual<typeof import('react-native')>('react-native');
    return (
      <View>
        <Text>{'Details ' + props.stayId}</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back to residents"
          onPress={props.onClose}
        >
          <Text>Back</Text>
        </Pressable>
        {props.onHistory ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Resident stay history"
            onPress={props.onHistory}
          >
            <Text>History</Text>
          </Pressable>
        ) : null}
      </View>
    );
  },
}));
const active: Profile['stays'][number] = {
  id: 'current-stay',
  state: 'active',
  moveInDate: '2026-11-17',
  expectedLeaveDate: null,
  closedAt: null,
  source: 'manual',
};
const past: Profile['stays'][number] = {
  ...active,
  id: 'past-stay',
  state: 'completed',
  moveInDate: '2026-09-01',
  closedAt: '2026-10-01T00:00:00Z',
};
beforeEach(() => jest.clearAllMocks());
async function show(stays: Profile['stays'] = [active]) {
  jest.mocked(readResidentProfile).mockResolvedValue({
    id: 'resident',
    branchId: 'branch',
    displayName: 'Ali',
    contact: { phone: null, email: null },
    cnicLast4: null,
    linked: false,
    archived: false,
    createdAt: '2026-11-17T00:00:00Z',
    currentStay: stays.find((stay) => stay.state === 'active') ?? null,
    stays,
    staysTruncated: false,
    status: stays.length ? 'current' : 'none',
  } as never);
  const close = jest.fn();
  const cache = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  await render(
    <QueryClientProvider client={cache}>
      <ResidentProfile actorId="actor" branchId="branch" residentId="resident" onClose={close} />
    </QueryClientProvider>,
  );
  return close;
}
it('RES-004: opens the current stay directly and returns to the directory in one back', async () => {
  const close = await show();
  expect(await screen.findByText('Details current-stay')).toBeTruthy();
  expect(screen.queryByText('Stays')).toBeNull();
  await fireEvent.press(screen.getByRole('button', { name: 'Back to residents' }));
  expect(close).toHaveBeenCalledTimes(1);
});
it('RES-004: keeps previous stays available from the details menu', async () => {
  await show([past, active]);
  await screen.findByText('Details current-stay');
  await fireEvent.press(screen.getByRole('button', { name: 'Resident stay history' }));
  await fireEvent.press(await screen.findByRole('button', { name: /Stay 1 Sept 2026/ }));
  expect(await screen.findByText('Details past-stay')).toBeTruthy();
});
it('RES-004: keeps the profile usable when there is no stay', async () => {
  await show([]);
  expect(await screen.findByText('No stays yet')).toBeTruthy();
});
