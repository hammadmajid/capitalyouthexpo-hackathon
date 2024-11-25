import type { SelfProfile } from '@hsm/contracts';
export const contexts = ['customer', 'resident', 'owner', 'manager', 'admin'] as const;
export type Context = (typeof contexts)[number];
export function canEnter(profile: SelfProfile, context: Context) {
  switch (context) {
    case 'customer':
      return profile.capabilities.customer;
    // Active-stay authorization arrives with the resident domain in a later phase.
    case 'resident':
      return false;
    case 'owner':
      return profile.capabilities.owner;
    case 'manager':
      return profile.capabilities.managerOf.length > 0;
    case 'admin':
      return profile.capabilities.admin !== null;
  }
}
export function initialContext(profile: SelfProfile) {
  return contexts.find((context) => canEnter(profile, context));
}
