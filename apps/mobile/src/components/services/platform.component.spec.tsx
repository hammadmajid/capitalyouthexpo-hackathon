import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import * as sdk from '@hsm/api-client';
import { NativeHelpSupport } from './platform';
jest.mock('../../lib/runtime', () => ({ client: {}, actorClient: async () => ({}) }));
jest.mock('expo-crypto', () => ({ randomUUID: () => 'ffffffff-ffff-4fff-8fff-ffffffffffff' }));
jest.mock('@hsm/api-client', () => ({
  ...jest.requireActual('@hsm/api-client'),
  readOwnTickets: jest.fn(),
  readOwnTicket: jest.fn(),
  readOwnSupportMessages: jest.fn(),
  openSupportTicket: jest.fn(),
  replyOwnTicket: jest.fn(),
}));
const at = '2026-10-26T10:00:00.000Z';
const id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ticket = {
  id,
  subject: 'OTP',
  category: 'account',
  priority: 'normal',
  status: 'waiting_for_user',
  openedByName: 'A',
  assignedToName: null,
  version: 1,
  createdAt: at,
  updatedAt: at,
  messages: [
    { id, authorName: 'S', fromSupport: true, internal: false, body: 'Try again', createdAt: at },
  ],
};
async function show(node: ReactNode) {
  await render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      {node}
    </QueryClientProvider>,
  );
}
it('ADM-009: resident opens a ticket and replies', async () => {
  jest.mocked(sdk.readOwnTickets).mockResolvedValue({ data: [ticket], nextCursor: null } as never);
  jest.mocked(sdk.readOwnTicket).mockResolvedValue(ticket as never);
  jest.mocked(sdk.readOwnSupportMessages).mockResolvedValue({
    ticketId: ticket.id,
    data: ticket.messages,
    nextCursor: null,
  });
  jest.mocked(sdk.openSupportTicket).mockResolvedValue({} as never);
  jest.mocked(sdk.replyOwnTicket).mockResolvedValue({} as never);
  await show(<NativeHelpSupport actorId="u" />);
  await fireEvent.press(screen.getByRole('button', { name: 'Help & Support' }));
  await fireEvent.press(await screen.findByRole('button', { name: 'OTP: Waiting for your reply' }));
  expect(await screen.findByText('HSM support: Try again')).toBeTruthy();
  await fireEvent.changeText(screen.getByLabelText('Your reply'), 'Still failing');
  await fireEvent.press(screen.getByRole('button', { name: 'Send reply' }));
  await waitFor(() => expect(sdk.replyOwnTicket).toHaveBeenCalled());
  await fireEvent.changeText(screen.getByLabelText('Ticket subject'), 'Login');
  await fireEvent.changeText(screen.getByLabelText('Describe the problem'), 'No OTP');
  await fireEvent.press(screen.getByRole('button', { name: 'Open ticket' }));
  await waitFor(() => expect(sdk.openSupportTicket).toHaveBeenCalled());
});
