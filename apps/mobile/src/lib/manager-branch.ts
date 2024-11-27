import { useSyncExternalStore } from 'react';
// MGRD: the branch a Manager picked on the Dashboard is the one Operations and Residents open,
// so a Manager of two branches never lands on the other branch's tools. Memory only: a
// convenience, the server still checks every branch call.
let picked: string | undefined;
const listeners = new Set<() => void>();
export function pickManagerBranch(branchId: string) {
  picked = branchId;
  listeners.forEach((listener) => listener());
}
export function usePickedManagerBranch<T extends { branchId: string }>(branches: readonly T[]) {
  const id = useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => picked,
  );
  return branches.find((row) => row.branchId === id) ?? branches[0];
}
