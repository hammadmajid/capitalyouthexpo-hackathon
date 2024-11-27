import * as SecureStore from 'expo-secure-store';
import type { SelfProfile } from '@hsm/contracts';
// A remembered UI preference only. It never grants a capability: entry re-checks the
// server profile every time, so a stale or tampered value cannot open an unauthorized space.
export type AppMode = 'owner' | 'customer' | 'admin';
const options: SecureStore.SecureStoreOptions = { keychainService: 'pk.hsm.mode' };
const storageKey = (userId: string) => 'hsm.mode.' + userId.replace(/[^a-zA-Z0-9]/g, '');
export async function readMode(userId: string): Promise<AppMode | undefined> {
  try {
    const value = await SecureStore.getItemAsync(storageKey(userId), options);
    return value === 'owner' || value === 'customer' || value === 'admin' ? value : undefined;
  } catch {
    return undefined;
  }
}
export async function rememberMode(userId: string, mode: AppMode) {
  try {
    await SecureStore.setItemAsync(storageKey(userId), mode, options);
  } catch {
    // Preference only; entry falls back to the capability default.
  }
}
export async function forgetAdminMode(userId: string) {
  if ((await readMode(userId)) !== 'admin') return;
  try {
    await SecureStore.deleteItemAsync(storageKey(userId), options);
  } catch {
    /* UI preference only. */
  }
}
export function entryFor(profile: SelfProfile, remembered: AppMode | undefined) {
  const caps = profile.capabilities;
  const owner = caps.owner && profile.user.emailVerified;
  const customerOnly =
    caps.customer && !caps.owner && caps.managerOf.length === 0 && caps.admin === null;
  // ADM-002: authenticated entry prioritizes real Admin access over UI preferences.
  // Explicit in-session Customer/Owner switching navigates directly and remains available.
  if (caps.admin) return '/admin' as const;
  if (remembered === 'owner' && owner) return '/owner' as const;
  // MGRD: an assigned Manager signs in to the Manager workspace first, even when they also
  // use a Customer account; they switch to Customer from Manager Account if they want.
  if (caps.managerOf.length) return '/manager' as const;
  if (remembered === 'customer' && caps.customer) return '/marketplace' as const;
  if (customerOnly) return '/marketplace' as const;
  if (owner && caps.customer && remembered === 'customer') return '/marketplace' as const;
  if (owner && caps.admin === null) return '/owner' as const;
  return '/account' as const;
}
