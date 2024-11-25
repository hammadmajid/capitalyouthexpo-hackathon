import { useEffect, useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  archiveListingRule,
  createListingRule,
  editListingRule,
  listListingRules,
  readListingRule,
} from '@hsm/api-client';
import type { ListingRuleInput } from '@hsm/contracts';
import { browserClient } from '../lib/client';
export type RuleCommand =
  | { kind: 'create'; input: ListingRuleInput }
  | { kind: 'edit'; id: string; version: string; input: ListingRuleInput }
  | { kind: 'archive'; id: string; version: string; reason: string };
export function useListingRules(
  actorId: string,
  branchId: string,
  state: 'active' | 'archived',
  cursor: string | undefined,
  open: boolean,
  onSaved: () => void,
) {
  const cache = useQueryClient(),
    active = useRef(true),
    keys = useRef(new Map<string, string>());
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  const queryKey = ['listing-rules', actorId, branchId];
  const query = useQuery({
    queryKey: [...queryKey, state, cursor],
    enabled: open,
    gcTime: 0,
    queryFn: () =>
      listListingRules(browserClient(), branchId, {
        state,
        limit: 20,
        ...(cursor ? { cursor } : {}),
      }),
  });
  const current = useMutation({
    gcTime: 0,
    mutationFn: (id: string) => readListingRule(browserClient(), branchId, id),
    onSuccess: (result) => {
      if (!active.current) return;
      cache.setQueriesData<Awaited<ReturnType<typeof listListingRules>>>(
        { queryKey },
        (previous) => (previous ? { ...previous, canEdit: result.canEdit } : previous),
      );
    },
  });
  const mutation = useMutation({
    gcTime: 0,
    mutationFn: (command: RuleCommand) => {
      const intent = JSON.stringify(command);
      let key = keys.current.get(intent);
      if (!key) {
        key = crypto.randomUUID();
        keys.current.set(intent, key);
      }
      const client = browserClient();
      if (command.kind === 'create') return createListingRule(client, branchId, command.input, key);
      if (command.kind === 'edit')
        return editListingRule(client, branchId, command.id, command.version, command.input, key);
      return archiveListingRule(
        client,
        branchId,
        command.id,
        command.version,
        { reason: command.reason },
        key,
      );
    },
    onSuccess: async () => {
      if (!active.current) return;
      keys.current.clear();
      current.reset();
      onSaved();
      await cache.invalidateQueries({ queryKey });
      if (!active.current) return;
      await cache.invalidateQueries({ queryKey: ['public-listing-rules', branchId] });
    },
  });
  return { query, current, mutation, clearKeys: () => keys.current.clear() };
}
