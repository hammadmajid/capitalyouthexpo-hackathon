import { randomUUID } from 'node:crypto';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { ListingRuleEditor } from './listing-rule-editor';
const row = {
  id: randomUUID(),
  branchId: randomUUID(),
  body: 'Original text.',
  sortOrder: 1,
  version: 'a'.repeat(64),
  createdAt: '2026-10-17T00:00:00Z',
  updatedAt: '2026-10-17T00:00:00Z',
  archivedAt: null,
};
afterEach(cleanup);
it.each(['', '-1', '1.5', '2147483648'])(
  'TRUST-006: invalid explicit order %s never dispatches a rule command',
  (order) => {
    const submit = vi.fn();
    render(
      <ListingRuleEditor
        draft={{ kind: 'create' }}
        disabled={false}
        busy={false}
        submit={submit}
        cancel={vi.fn()}
      />,
    );
    fireEvent.change(screen.getByLabelText('Rule text'), { target: { value: 'Actual text' } });
    fireEvent.change(screen.getByLabelText('Display order'), { target: { value: order } });
    fireEvent.submit(screen.getByRole('form'));
    expect(submit).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toBeDefined();
  },
);
it('TRUST-006: whitespace-only text is invalid and is not silently stored', () => {
  const submit = vi.fn();
  render(
    <ListingRuleEditor
      draft={{ kind: 'edit', row }}
      disabled={false}
      busy={false}
      submit={submit}
      cancel={vi.fn()}
    />,
  );
  fireEvent.change(screen.getByLabelText('Rule text'), { target: { value: '   ' } });
  fireEvent.submit(screen.getByRole('form'));
  expect(submit).not.toHaveBeenCalled();
  expect(screen.getByRole('alert')).toBeDefined();
});
it('AUD-001: whitespace-only archival reason never dispatches', () => {
  const submit = vi.fn();
  render(
    <ListingRuleEditor
      draft={{ kind: 'archive', row }}
      disabled={false}
      busy={false}
      submit={submit}
      cancel={vi.fn()}
    />,
  );
  fireEvent.change(screen.getByLabelText('Reason for archival'), { target: { value: '  ' } });
  fireEvent.submit(screen.getByRole('form'));
  expect(submit).not.toHaveBeenCalled();
  expect(screen.getByRole('alert')).toBeDefined();
});
it('ACC-004: cancel invokes only cancellation even with an otherwise valid edit', () => {
  const submit = vi.fn(),
    cancel = vi.fn();
  render(
    <ListingRuleEditor
      draft={{ kind: 'edit', row }}
      disabled={false}
      busy={false}
      submit={submit}
      cancel={cancel}
    />,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Cancel rule changes' }));
  expect(cancel).toHaveBeenCalledTimes(1);
  expect(submit).not.toHaveBeenCalled();
});
it.each([
  { disabled: true, busy: false },
  { disabled: false, busy: true },
])('ACC-004: stale authority or pending command %# cannot dispatch another write', (flags) => {
  const submit = vi.fn();
  render(
    <ListingRuleEditor draft={{ kind: 'edit', row }} {...flags} submit={submit} cancel={vi.fn()} />,
  );
  fireEvent.submit(screen.getByRole('form'));
  expect(submit).not.toHaveBeenCalled();
  expect(
    (screen.getByLabelText('Rule text') as HTMLTextAreaElement).closest('fieldset')?.disabled,
  ).toBe(true);
});
