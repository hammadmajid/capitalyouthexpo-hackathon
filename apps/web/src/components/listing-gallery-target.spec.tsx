import { randomUUID } from 'node:crypto';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { GalleryAttach } from '@hsm/contracts';
import { ListingGallery } from './listing-gallery';
const fileId = randomUUID();
vi.mock('./gallery-editor', () => ({
  GalleryEditor: ({
    onSave,
  }: {
    onSave: (command: { kind: 'attach'; input: GalleryAttach }) => void;
  }) => (
    <button
      type="button"
      onClick={() =>
        onSave({ kind: 'attach', input: { fileId, altText: 'Bed view', sortOrder: 0 } })
      }
    >
      Fixture save image
    </button>
  ),
}));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
const actorId = randomUUID(),
  branchId = randomUUID(),
  roomId = randomUUID(),
  bedId = randomUUID();
const image = {
  id: randomUUID(),
  branchId,
  fileId,
  altText: 'Bed view',
  sortOrder: 0,
  roomId,
  bedId,
  publishedAt: null,
  archivedAt: null,
  scanStatus: 'clean',
  version: 'a'.repeat(64),
};
it('ROOM-002/003: a bed gallery reads and attaches only for its exact room and bed target', async () => {
  const requests: Request[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn<typeof fetch>().mockImplementation(async (input, init) => {
      const request = input instanceof Request ? input : new Request(input, init);
      requests.push(request.clone());
      return request.method === 'POST'
        ? Response.json(image, { status: 201 })
        : Response.json({ data: [], nextCursor: null, canEdit: true, canPublish: true });
    }),
  );
  const cache = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={cache}>
      <ListingGallery
        actorId={actorId}
        branchId={branchId}
        target={{ kind: 'bed', roomId, bedId }}
        title="Bed A photos"
      />
    </QueryClientProvider>,
  );
  fireEvent.click(screen.getByRole('button', { name: 'View bed a photos' }));
  expect(await screen.findByRole('heading', { name: 'Bed A photos' })).toBeDefined();
  expect(screen.getByText(/its own published bed photo/)).toBeDefined();
  const read = new URL(requests[0]?.url ?? '');
  expect(read.searchParams.get('roomId')).toBe(roomId);
  expect(read.searchParams.get('bedId')).toBe(bedId);
  fireEvent.click(screen.getByRole('button', { name: 'Add listing image' }));
  fireEvent.click(screen.getByRole('button', { name: 'Fixture save image' }));
  await waitFor(() => expect(requests.some((request) => request.method === 'POST')).toBe(true));
  const attach = requests.find((request) => request.method === 'POST');
  expect(await attach?.json()).toEqual({
    fileId,
    altText: 'Bed view',
    sortOrder: 0,
    target: { kind: 'bed', roomId, bedId },
  });
  expect(await screen.findByRole('status')).toBeDefined();
});
