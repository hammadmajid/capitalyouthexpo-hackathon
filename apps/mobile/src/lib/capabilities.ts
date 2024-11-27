import type { SelfProfile } from '@hsm/contracts';
export const contexts = ['customer', 'resident', 'owner', 'manager', 'admin'] as const;
export type Context = (typeof contexts)[number];
export function canEnter(profile: SelfProfile, context: Context) {
  switch (context) {
    case 'customer':
      return profile.capabilities.customer;
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
