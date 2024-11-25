import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { InventoryBlockForm, ReleaseBlockForm } from './inventory-block-form';
afterEach(cleanup);
it.each(['create', 'release'] as const)(
  'ACC-004: %s outage blocks submission while cancellation remains available',
  (kind) => {
    const cancel = vi.fn(),
      save = vi.fn();
    render(
      kind === 'create' ? (
        <InventoryBlockForm rooms={[]} pending={false} disabled onSave={save} onCancel={cancel} />
      ) : (
        <ReleaseBlockForm
          label="Room 101"
          pending={false}
          disabled
          onSave={save}
          onCancel={cancel}
        />
      ),
    );
    const button = screen.getByRole('button', { name: 'Cancel block edit' });
    expect(button.matches(':disabled')).toBe(false);
    fireEvent.click(button);
    expect(cancel).toHaveBeenCalledOnce();
    expect(save).not.toHaveBeenCalled();
    expect(
      screen
        .getByRole('button', { name: kind === 'create' ? 'Create block' : 'Confirm release' })
        .matches(':disabled'),
    ).toBe(true);
  },
);
