import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { GalleryMedia } from '@hsm/contracts';
import { GalleryEditor, type GalleryEditorState } from './gallery-editor';
const fileId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
vi.mock('./private-file-input', () => ({
  PrivateFileInput: ({
    onReady,
    onBusy,
  }: {
    onReady: (fileId: string | undefined) => void;
    onBusy: (busy: boolean) => void;
  }) => (
    <div>
      <button
        type="button"
        onClick={() => {
          onBusy(false);
          onReady(fileId);
        }}
      >
        Use verified fixture image
      </button>
      <button
        type="button"
        onClick={() => {
          onBusy(true);
          onReady(undefined);
        }}
      >
        Fixture scan pending
      </button>
    </div>
  ),
}));
afterEach(cleanup);
const initial: GalleryMedia = {
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  branchId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  fileId,
  altText: 'Saved exterior',
  sortOrder: 4,
  roomId: null,
  bedId: null,
  publishedAt: null,
  archivedAt: null,
  scanStatus: 'clean',
  version: 'a'.repeat(64),
};
function setup(state: GalleryEditorState, disabled = false, pending = false, canPublish = true) {
  const save = vi.fn(),
    cancel = vi.fn();
  return {
    save,
    cancel,
    ...render(
      <GalleryEditor
        state={state}
        canPublish={canPublish}
        disabled={disabled}
        pending={pending}
        onSave={save}
        onCancel={cancel}
      />,
    ),
  };
}
const submit = () => fireEvent.submit(screen.getByRole('form', { name: 'Gallery image action' }));
it('ROOM-003: attachment requires a verified upload and explicit image metadata without publication', () => {
  const value = setup({ kind: 'attach' });
  submit();
  expect(value.save).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Use verified fixture image' }));
  fireEvent.change(screen.getByLabelText('Image description'), { target: { value: ' Exterior ' } });
  fireEvent.change(screen.getByLabelText('Image display order'), { target: { value: '2' } });
  submit();
  expect(value.save).toHaveBeenCalledWith({
    kind: 'attach',
    input: { fileId, altText: 'Exterior', sortOrder: 2 },
  });
  expect(screen.queryByLabelText('Enable marketplace image publication')).toBeNull();
  expect(document.body.textContent).not.toContain(fileId);
});
it('ROOM-003: edit starts with current metadata and requires an explicit publication toggle', () => {
  const value = setup({ kind: 'edit', initial });
  expect((screen.getByLabelText('Image description') as HTMLInputElement).value).toBe(
    'Saved exterior',
  );
  expect(
    (screen.getByLabelText('Enable marketplace image publication') as HTMLInputElement).checked,
  ).toBe(false);
  fireEvent.click(screen.getByLabelText('Enable marketplace image publication'));
  submit();
  expect(value.save).toHaveBeenCalledWith({
    kind: 'edit',
    initial,
    input: { altText: initial.altText, sortOrder: 4, published: true },
  });
});
it.each(['1.5', '-1', '2147483648'])(
  'ROOM-003: invalid database image order %s cannot reach a mutation',
  (order) => {
    const value = setup({ kind: 'edit', initial });
    fireEvent.change(screen.getByLabelText('Image display order'), { target: { value: order } });
    submit();
    expect(screen.getByRole('alert')).toBeDefined();
    expect(value.save).not.toHaveBeenCalled();
  },
);
it('AUD-001: archival requires a trimmed nonempty reason and keeps entered text on failure', () => {
  const value = setup({ kind: 'archive', initial });
  submit();
  expect(value.save).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText('Reason for archiving'), {
    target: { value: ' Replaced ' },
  });
  submit();
  expect(value.save).toHaveBeenCalledWith({ kind: 'archive', initial, reason: 'Replaced' });
});
it('ROOM-003: cover confirmation never introduces a publication choice', () => {
  const value = setup({ kind: 'cover', initial });
  submit();
  expect(value.save).toHaveBeenCalledWith({ kind: 'cover', initial });
  expect(screen.queryByLabelText('Enable marketplace image publication')).toBeNull();
});
it.each([
  { disabled: true, pending: false },
  { disabled: false, pending: true },
])(
  'SEC-003: unavailable editor %j blocks even programmatic submission',
  ({ disabled, pending }) => {
    const value = setup({ kind: 'edit', initial }, disabled, pending);
    submit();
    expect(value.save).not.toHaveBeenCalled();
  },
);
it('SEC-003: pending scan blocks saving and cancellation until the clean result is available', () => {
  const value = setup({ kind: 'attach' });
  fireEvent.click(screen.getByRole('button', { name: 'Fixture scan pending' }));
  submit();
  expect(value.save).not.toHaveBeenCalled();
  expect(
    (screen.getByRole('button', { name: 'Cancel image action' }) as HTMLButtonElement).disabled,
  ).toBe(true);
});
it('ROOM-003: cancellation closes the action without starting a mutation', () => {
  const value = setup({ kind: 'edit', initial });
  fireEvent.click(screen.getByRole('button', { name: 'Cancel image action' }));
  expect(value.cancel).toHaveBeenCalledOnce();
  expect(value.save).not.toHaveBeenCalled();
});

it('ACC-004: draft metadata remains editable without a publication grant, but publication cannot be enabled', () => {
  const value = setup({ kind: 'edit', initial }, false, false, false);
  expect(
    (screen.getByLabelText('Enable marketplace image publication') as HTMLInputElement).disabled,
  ).toBe(true);
  submit();
  expect(value.save).toHaveBeenCalledWith(
    expect.objectContaining({ kind: 'edit', input: expect.objectContaining({ published: false }) }),
  );
});
it.each(['cover', 'archive', 'edit'] as const)(
  'ACC-004: a missing media grant blocks %s of a published image without discarding the draft',
  (kind) => {
    const value = setup(
      { kind, initial: { ...initial, publishedAt: '2026-10-17T00:00:00.000Z' } },
      false,
      false,
      false,
    );
    submit();
    expect(value.save).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toBeDefined();
    expect(
      (screen.getByRole('button', { name: 'Cancel image action' }) as HTMLButtonElement).disabled,
    ).toBe(false);
  },
);
