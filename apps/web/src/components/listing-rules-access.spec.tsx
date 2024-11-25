import { randomUUID } from 'node:crypto';
import { expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import {
  ruleId,
  row,
  page,
  state,
  sent,
  problem,
  show,
  open,
} from '../../test/unit/listing-rules.fixture';
it('ACC-004: archived history and actual continuation are reachable without editing history', async () => {
  const requests: Request[] = [];
  show(
    vi.fn<typeof fetch>(async (input, init) => {
      const request = sent(input, init);
      requests.push(request);
      const query = new URL(request.url).searchParams;
      if (query.get('state') === 'archived')
        return Response.json({
          ...page,
          state: 'archived',
          data: [{ ...row, archivedAt: row.updatedAt }],
        });
      if (query.get('cursor')) return Response.json({ ...page, data: [] });
      return Response.json({
        ...page,
        data: Array.from({ length: 20 }, (_, sortOrder) => ({
          ...row,
          id: sortOrder === 19 ? ruleId : randomUUID(),
          sortOrder,
        })),
        nextCursor: '19:' + ruleId,
      });
    }),
  );
  open();
  const pages = within(screen.getByRole('navigation', { name: 'Hostel rule pages' }));
  const next = await pages.findByRole('button', { name: 'Next hostel rules' });
  expect(next.matches(':disabled')).toBe(false);
  fireEvent.click(next);
  await screen.findByText('No hostel rules have been added.');
  expect(new URL(requests.at(-1)?.url ?? '').searchParams.get('cursor')).toBe('19:' + ruleId);
  fireEvent.click(pages.getByRole('button', { name: 'Back to first rules page' }));
  await pages.findByRole('button', { name: 'Next hostel rules' });
  fireEvent.click(pages.getByRole('button', { name: 'View archived rules' }));
  await screen.findByText('Archived rule history');
  expect(screen.queryByRole('button', { name: 'Edit this rule' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Archive this rule' })).toBeNull();
  expect(new URL(requests.at(-1)?.url ?? '').searchParams.has('cursor')).toBe(false);
  fireEvent.click(pages.getByRole('button', { name: 'View active rules' }));
  await screen.findByText('Published informational rules');
});
it('ACC-004: an outage disables writes while retaining an existing draft until a successful current read', async () => {
  let failed = false;
  show(
    vi.fn<typeof fetch>(async (input, init) => {
      const request = sent(input, init);
      if (new URL(request.url).pathname.endsWith('/' + ruleId)) return Response.json(state);
      return failed ? problem('INTERNAL', 503) : Response.json(page);
    }),
  );
  open();
  fireEvent.click(await screen.findByRole('button', { name: 'Edit this rule' }));
  await screen.findByRole('form', { name: 'Hostel rule editor' });
  fireEvent.change(screen.getByLabelText('Rule text'), {
    target: { value: 'Retained outage draft.' },
  });
  failed = true;
  fireEvent.click(screen.getByRole('button', { name: 'Refresh current hostel rules' }));
  await screen.findByRole('alert');
  expect((screen.getByLabelText('Rule text') as HTMLTextAreaElement).value).toBe(
    'Retained outage draft.',
  );
  expect(
    (screen.getByLabelText('Rule text') as HTMLTextAreaElement).closest('fieldset')?.disabled,
  ).toBe(true);
  failed = false;
  fireEvent.click(screen.getByRole('button', { name: 'Refresh current hostel rules' }));
  await waitFor(() =>
    expect(
      (screen.getByLabelText('Rule text') as HTMLTextAreaElement).closest('fieldset')?.disabled,
    ).toBe(false),
  );
  expect((screen.getByLabelText('Rule text') as HTMLTextAreaElement).value).toBe(
    'Retained outage draft.',
  );
});

it('ACC-004: current-row read observes revoked edit authority and removes stale page mutation controls', async () => {
  show(
    vi.fn<typeof fetch>(async (input, init) => {
      const request = sent(input, init);
      return Response.json(
        new URL(request.url).pathname.endsWith('/' + ruleId) ? { ...state, canEdit: false } : page,
      );
    }),
  );
  open();
  fireEvent.click(await screen.findByRole('button', { name: 'Edit this rule' }));
  await screen.findByText('Editing hostel rules requires a listing grant.');
  expect(screen.queryByRole('button', { name: 'Add hostel rule' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Edit this rule' })).toBeNull();
  expect(screen.queryByRole('form')).toBeNull();
});
