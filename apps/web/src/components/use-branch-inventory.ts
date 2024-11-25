import { usePagedInventory } from './use-paged-inventory';
import { useRef } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ApiFailure,
  saveInventoryRoomType,
  createInventoryRoom,
  createInventoryBed,
  changeInventoryState,
  archiveInventory,
} from '@hsm/api-client';
import type { RoomTypeInput, RoomInput, SeatInput } from '@hsm/contracts';
import { browserClient } from '../lib/client';
type Resource = 'room_type' | 'room' | 'seat';
type Command =
  | { kind: 'type'; id?: string; input: RoomTypeInput }
  | { kind: 'room'; input: RoomInput }
  | { kind: 'seat'; roomId: string; input: SeatInput }
  | { kind: 'archive'; resource: Resource; id: string; reason: string }
  | {
      kind: 'state';
      resource: 'room' | 'seat';
      id: string;
      reason: string;
      status: 'active' | 'inactive' | 'maintenance';
    };
export function useBranchInventory(actorId: string, branchId: string, onSaved: () => void) {
  const cache = useQueryClient(),
    keys = useRef(new Map<string, string>());
  const { queryKey, query, paging, access } = usePagedInventory(actorId, branchId);
  const mutation = useMutation({
    gcTime: 0,
    mutationFn: (command: Command) => {
      const serialized = JSON.stringify(command);
      let key = keys.current.get(serialized);
      if (!key) {
        key = crypto.randomUUID();
        keys.current.set(serialized, key);
      }
      const client = browserClient();
      switch (command.kind) {
        case 'type':
          return saveInventoryRoomType(client, branchId, command.input, key, command.id);
        case 'room':
          return createInventoryRoom(client, branchId, command.input, key);
        case 'seat':
          return createInventoryBed(client, branchId, command.roomId, command.input, key);
        case 'state':
          return changeInventoryState(
            client,
            branchId,
            command.resource,
            command.id,
            { status: command.status, reason: command.reason },
            key,
          );
        case 'archive':
          return archiveInventory(
            client,
            branchId,
            command.resource,
            command.id,
            command.reason,
            key,
          );
      }
    },
    onSuccess: async (_result, command) => {
      keys.current.delete(JSON.stringify(command));
      onSaved();
      await cache.invalidateQueries({ queryKey });
    },
    onError: () => {
      void query.refetch();
    },
  });
  return { query, mutation, paging, access };
}

const scopeDenials = new Set([
  'UNAUTHENTICATED',
  'TOKEN_EXPIRED',
  'SESSION_REVOKED',
  'ACCOUNT_SUSPENDED',
  'EMAIL_NOT_VERIFIED',
  'FORBIDDEN',
  'BRANCH_FORBIDDEN',
]);
export function inventoryScopeDenied(error: unknown): boolean {
  return error instanceof ApiFailure && scopeDenials.has(error.code);
}
