jest.mock('expo-crypto', () => ({ randomUUID: () => '019a1234-1234-7123-8123-123456789abc' }));
jest.mock('../lib/runtime', () => ({ client: {}, actorClient: async () => ({}) }));
jest.mock('@hsm/api-client', () => ({
  ...jest.requireActual('@hsm/api-client'),
  readVisitingHours: jest.fn(),
  executeVisitCommand: jest.fn(),
}));
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { executeVisitCommand, readVisitingHours } from '@hsm/api-client';
import { VisitingHours } from './visiting-hours';
import { useVisitCommand } from './use-visit-command';
const branchId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
function Harness({ onContinue }: { onContinue: () => void }) {
  const operation = useVisitCommand('owner');
  return (
    <VisitingHours
      actorId="owner"
      branchId={branchId}
      accessUnavailable={false}
      operation={operation}
      onContinue={onContinue}
    />
  );
}
beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(readVisitingHours).mockResolvedValue({
    branchId,
    version: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    windows: [{ dayOfWeek: 4, opensAt: '09:00', closesAt: '13:00' }],
  } as never);
  jest.mocked(executeVisitCommand).mockResolvedValue({} as never);
});
it('VISIT-001: each day keeps its own slots and Save & Continue saves before moving on', async () => {
  const onContinue = jest.fn();
  await render(
    <QueryClientProvider client={new QueryClient()}>
      <Harness onContinue={onContinue} />
    </QueryClientProvider>,
  );
  // Monday switched on copies the nearest open day; Thursday gets a second slot.
  await fireEvent(await screen.findByLabelText('Monday open for visits'), 'valueChange', true);
  await fireEvent.press(screen.getByRole('button', { name: 'Add a time slot on Thursday' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Save & Continue' }));
  await waitFor(() => expect(onContinue).toHaveBeenCalledTimes(1));
  expect(executeVisitCommand).toHaveBeenCalledTimes(1);
  expect(jest.mocked(executeVisitCommand).mock.calls[0]?.[1]).toMatchObject({
    kind: 'hours',
    branchId,
    body: {
      expectedVersion: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      windows: [
        { dayOfWeek: 1, opensAt: '09:00', closesAt: '13:00' },
        { dayOfWeek: 4, opensAt: '09:00', closesAt: '13:00' },
        { dayOfWeek: 4, opensAt: '13:00', closesAt: '15:00' },
      ],
    },
  });
});
it('VISIT-001: "Same every day" copies one day to all seven; with no edits Continue just moves on', async () => {
  const onContinue = jest.fn();
  await render(
    <QueryClientProvider client={new QueryClient()}>
      <Harness onContinue={onContinue} />
    </QueryClientProvider>,
  );
  await fireEvent.press(
    await screen.findByRole('button', { name: "Use the first open day's times for every day" }),
  );
  await fireEvent.press(screen.getByRole('button', { name: 'Save & Continue' }));
  await waitFor(() => expect(onContinue).toHaveBeenCalledTimes(1));
  const windows = (
    jest.mocked(executeVisitCommand).mock.calls[0]?.[1] as { body: { windows: unknown[] } }
  ).body.windows;
  expect(windows).toHaveLength(7);
  // Nothing changed after saving: Continue does not send another request.
  await fireEvent.press(screen.getByRole('button', { name: 'Save & Continue' }));
  expect(onContinue).toHaveBeenCalledTimes(2);
  expect(executeVisitCommand).toHaveBeenCalledTimes(1);
});
