import { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { subscribeChatRealtime, type ChatRealtimeState } from '@hsm/api-client';
import { actorRealtimeToken, config } from '../lib/runtime';
export function useChatRealtime(actorId: string, conversationId: string, branchId?: string) {
  const cache = useQueryClient(),
    [state, setState] = useState<ChatRealtimeState>('connecting'),
    [revision, setRevision] = useState(0);
  useEffect(() => {
    let generation = 0,
      stop: (() => void) | undefined;
    function disconnect() {
      generation++;
      stop?.();
      stop = undefined;
    }
    function connect() {
      disconnect();
      const current = generation;
      setState('connecting');
      void actorRealtimeToken(actorId)
        .then((token) => {
          if (current !== generation) return;
          stop = subscribeChatRealtime({
            url: config.apiUrl,
            path: '/v1/rt',
            conversationId,
            branchId,
            token,
            browser: false,
            state: setState,
            refresh: () => {
              void cache.invalidateQueries({ queryKey: ['chat', actorId] });
            },
          });
        })
        .catch(() => {
          if (current === generation) setState('denied');
        });
    }
    if (AppState.currentState !== 'background' && AppState.currentState !== 'inactive') connect();
    const subscription = AppState.addEventListener('change', (next) => {
      if (next === 'active') connect();
      else {
        disconnect();
        setState('disconnected');
      }
    });
    return () => {
      disconnect();
      subscription.remove();
    };
  }, [actorId, conversationId, branchId, cache, revision]);
  return { state, reconnect: () => setRevision((value) => value + 1) };
}
