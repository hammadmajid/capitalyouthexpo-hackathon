import { randomUUID } from 'node:crypto';
import { expect, it, vi } from 'vitest';
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import {
  actorId,
  ruleId,
  row,
  page,
  state,
  sent,
  problem,
  show,
  open,
  submit,
} from '../../test/unit/listing-rules.fixture';
it('ACC-004: lazy read-only rules show actual text without privileged forms or raw identifiers', async () => {
  const fetcher = vi
    .fn<typeof fetch>()
    .mockResolvedValue(Response.json({ ...page, canEdit: false }));
  show(fetcher);
  expect(fetcher).not.toHaveBeenCalled();
  open();
  await screen.findByText('Actual hostel rule.');
  await screen.findByText('Editing hostel rules requires a listing grant.');
  expect(screen.queryByRole('button', { name: 'Add hostel rule' })).toBeNull();
  expect(document.body.textContent).not.toContain(ruleId);
  expect(document.body.textContent).not.toContain(actorId);
});
it('TRUST-006: explicit creation uses validated text and actual stored receipt before refreshing', async () => {
  const requests: Request[] = [];
  show(
    vi.fn<typeof fetch>(async (input, init) => {
      const request = sent(input, init);
      requests.push(request);
      return Response.json(
        request.method === 'POST'
          ? { ...state, body: 'Keep shared areas tidy.', sortOrder: 3 }
          : page,
      );
    }),
  );
  open();
  fireEvent.click(await screen.findByRole('button', { name: 'Add hostel rule' }));
  fireEvent.change(screen.getByLabelText('Rule text'), {
    target: { value: ' Keep shared areas tidy. ' },
  });
  fireEvent.change(screen.getByLabelText('Display order'), { target: { value: '3' } });
  submit();
  await screen.findByText('Hostel rule saved. Current rules are being refreshed.');
  const write = requests.find((request) => request.method === 'POST');
  if (!write) throw new Error('Missing actual rule creation');
  expect(await write.json()).toEqual({ body: 'Keep shared areas tidy.', sortOrder: 3 });
  expect(write.headers.get('Idempotency-Key')).toBeTruthy();
  expect(screen.queryByRole('form', { name: 'Hostel rule editor' })).toBeNull();
});
it('ACC-004: exact current row version is loaded before editing; network retry retains one command key', async () => {
  const writes: Request[] = [];
  show(
    vi.fn<typeof fetch>(async (input, init) => {
      const request = sent(input, init);
      if (request.method === 'PUT') {
        writes.push(request);
        if (writes.length === 1) return problem('INTERNAL', 503);
        return Response.json({ ...state, body: 'Updated actual rule.' });
      }
      return Response.json(new URL(request.url).pathname.endsWith('/' + ruleId) ? state : page);
    }),
  );
  open();
  fireEvent.click(await screen.findByRole('button', { name: 'Edit this rule' }));
  await screen.findByRole('form', { name: 'Hostel rule editor' });
  fireEvent.change(screen.getByLabelText('Rule text'), {
    target: { value: 'Updated actual rule.' },
  });
  submit();
  await screen.findByRole('alert');
  expect((screen.getByLabelText('Rule text') as HTMLTextAreaElement).value).toBe(
    'Updated actual rule.',
  );
  submit();
  await screen.findByText('Hostel rule saved. Current rules are being refreshed.');
  expect(writes).toHaveLength(2);
  expect(writes[0]?.headers.get('Idempotency-Key')).toBe(writes[1]?.headers.get('Idempotency-Key'));
  expect(writes[0]?.headers.get('If-Match')).toBe('"' + row.version + '"');
});
it('ACC-004: stale edits retain draft, prevent repeat save and require explicit current-state reload', async () => {
  let changed = false;
  show(
    vi.fn<typeof fetch>(async (input, init) => {
      const request = sent(input, init);
      if (request.method === 'PUT') {
        changed = true;
        return problem('PRECONDITION_FAILED', 412);
      }
      return Response.json(
        new URL(request.url).pathname.endsWith('/' + ruleId)
          ? changed
            ? { ...state, body: 'Other writer rule.', version: 'b'.repeat(64) }
            : state
          : page,
      );
    }),
  );
  open();
  fireEvent.click(await screen.findByRole('button', { name: 'Edit this rule' }));
  await screen.findByRole('form', { name: 'Hostel rule editor' });
  fireEvent.change(screen.getByLabelText('Rule text'), { target: { value: 'Unsaved draft.' } });
  submit();
  await screen.findByRole('alert');
  expect(
    (screen.getByRole('button', { name: 'Save hostel rule' }) as HTMLButtonElement).closest(
      'fieldset',
    )?.disabled,
  ).toBe(true);
  expect((screen.getByLabelText('Rule text') as HTMLTextAreaElement).value).toBe('Unsaved draft.');
  fireEvent.click(screen.getByRole('button', { name: 'Reload current hostel rule' }));
  await waitFor(() =>
    expect((screen.getByLabelText('Rule text') as HTMLTextAreaElement).value).toBe(
      'Other writer rule.',
    ),
  );
});
it('AUD-001: cancel is reversible and archival requires an explicit reason with current version', async () => {
  const writes: Request[] = [];
  show(
    vi.fn<typeof fetch>(async (input, init) => {
      const request = sent(input, init);
      if (request.method === 'POST') {
        writes.push(request);
        return Response.json({ ...state, archivedAt: row.updatedAt });
      }
      return Response.json(new URL(request.url).pathname.endsWith('/' + ruleId) ? state : page);
    }),
  );
  open();
  fireEvent.click(await screen.findByRole('button', { name: 'Add hostel rule' }));
  fireEvent.click(screen.getByRole('button', { name: 'Cancel rule changes' }));
  expect(writes).toHaveLength(0);
  fireEvent.click(screen.getByRole('button', { name: 'Archive this rule' }));
  await screen.findByRole('form', { name: 'Archive hostel rule' });
  fireEvent.change(screen.getByLabelText('Reason for archival'), {
    target: { value: ' Superseded ' },
  });
  fireEvent.submit(screen.getByRole('form', { name: 'Archive hostel rule' }));
  await screen.findByText('Hostel rule saved. Current rules are being refreshed.');
  expect(writes).toHaveLength(1);
  expect(await writes[0]?.json()).toEqual({ reason: 'Superseded' });
  expect(writes[0]?.headers.get('If-Match')).toBe('"' + row.version + '"');
});
it('ACC-004: grant denial hides cached authority and retries access without restoring an old draft', async () => {
  let denied = false;
  show(
    vi.fn<typeof fetch>(async (input, init) => {
      const request = sent(input, init);
      if (request.method === 'PUT') {
        denied = true;
        return problem('FORBIDDEN', 403);
      }
      return Response.json(
        new URL(request.url).pathname.endsWith('/' + ruleId)
          ? state
          : { ...page, canEdit: !denied },
      );
    }),
  );
  open();
  fireEvent.click(await screen.findByRole('button', { name: 'Edit this rule' }));
  await screen.findByRole('form', { name: 'Hostel rule editor' });
  submit();
  await screen.findByRole('alert');
  expect(screen.queryByRole('form')).toBeNull();
  expect(screen.queryByRole('button', { name: 'Add hostel rule' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Retry hostel rule access' }));
  await screen.findByText('Editing hostel rules requires a listing grant.');
  expect(screen.queryByRole('form')).toBeNull();
});
it('ACC-004: branch switch discards editor and ignores late preceding rule command completion', async () => {
  let finish: ((response: Response) => void) | undefined;
  const fetcher = vi.fn<typeof fetch>(async (input, init) => {
    const request = sent(input, init);
    if (request.method === 'POST')
      return new Promise<Response>((resolve) => {
        finish = resolve;
      });
    return Response.json(page);
  });
  const view = show(fetcher);
  open();
  fireEvent.click(await screen.findByRole('button', { name: 'Add hostel rule' }));
  fireEvent.change(screen.getByLabelText('Rule text'), { target: { value: row.body } });
  fireEvent.change(screen.getByLabelText('Display order'), { target: { value: '0' } });
  submit();
  await waitFor(() => expect(finish).toBeDefined());
  view.rerender(view.tree(randomUUID(), randomUUID()));
  await act(async () => {
    finish?.(Response.json(state));
  });
  expect(screen.getByRole('button', { name: 'View hostel rules' })).toBeDefined();
  expect(screen.queryByRole('form')).toBeNull();
  expect(screen.queryByText('Hostel rule saved. Current rules are being refreshed.')).toBeNull();
});
