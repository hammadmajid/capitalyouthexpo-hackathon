import { useRef } from 'react';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  archiveListingImage,
  attachListingImage,
  editListingImage,
  listListingGallery,
  selectListingCover,
} from '@hsm/api-client';
import type {
  GalleryAttach,
  GalleryEdit,
  GalleryMedia,
  GalleryQuery,
  GalleryTarget,
} from '@hsm/contracts';
import { browserClient } from '../lib/client';
export type GalleryCommand =
  | { kind: 'attach'; input: GalleryAttach }
  | { kind: 'edit'; initial: GalleryMedia; input: GalleryEdit }
  | { kind: 'archive'; initial: GalleryMedia; reason: string }
  | { kind: 'cover'; initial: GalleryMedia };
export function useListingGallery(
  actorId: string,
  branchId: string,
  state: GalleryQuery['state'],
  open: boolean,
  onSaved: () => void,
  target?: GalleryTarget,
) {
  const cache = useQueryClient(),
    keys = useRef(new Map<string, string>()),
    scope = target ? [target.roomId, target.kind === 'bed' ? target.bedId : null] : [],
    queryKey = ['private-gallery', actorId, branchId, ...scope, state];
  const query = useInfiniteQuery({
    queryKey,
    enabled: open,
    gcTime: 0,
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      listListingGallery(browserClient(), branchId, {
        limit: 20,
        state,
        ...(pageParam ? { cursor: pageParam } : {}),
        // ROOM-002/003: room and bed galleries are scoped to their exact inventory target.
        ...(target ? { roomId: target.roomId } : {}),
        ...(target?.kind === 'bed' ? { bedId: target.bedId } : {}),
      }),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });
  const mutation = useMutation({
    gcTime: 0,
    mutationFn: (command: GalleryCommand) => {
      const intent = JSON.stringify(command);
      let key = keys.current.get(intent);
      if (!key) {
        key = crypto.randomUUID();
        keys.current.set(intent, key);
      }
      const client = browserClient();
      if (command.kind === 'attach')
        return attachListingImage(
          client,
          branchId,
          target ? { ...command.input, target } : command.input,
          key,
        );
      const { id, version } = command.initial;
      if (command.kind === 'edit')
        return editListingImage(client, branchId, id, version, command.input, key);
      if (command.kind === 'archive')
        return archiveListingImage(client, branchId, id, version, command.reason, key);
      return selectListingCover(client, branchId, id, version, key);
    },
    onSuccess: async (_result, command) => {
      keys.current.delete(JSON.stringify(command));
      onSaved();
      await cache.invalidateQueries({
        queryKey: ['private-gallery', actorId, branchId, ...scope],
      });
    },
    onError: () => {
      void query.refetch();
    },
  });
  return { query, mutation, clearKeys: () => keys.current.clear() };
}
