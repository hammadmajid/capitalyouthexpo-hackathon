import type { SelfProfile } from '@hsm/contracts';
export type AdminModule =
  | 'verification'
  | 'moderation'
  | 'support'
  | 'safety'
  | 'announcements'
  | 'policy'
  | 'institutions'
  | 'insights'
  | 'audit'
  | 'governance'
  | 'identity_reviews'
  | 'photo_reviews';
// SEC-003 / ADM-003: presentation gates mirror documented backend capabilities.
export function moduleAllowed(profile: SelfProfile | undefined, module: AdminModule) {
  const admin = profile?.capabilities.admin;
  if (!admin) return false;
  if (admin.isRoot) return true;
  switch (module) {
    case 'verification':
      return admin.roles.includes('verification');
    case 'moderation':
    case 'photo_reviews':
    case 'governance':
      return admin.roles.includes('content_moderator');
    case 'support':
    case 'announcements':
      return admin.roles.includes('support');
    case 'safety':
      return admin.roles.some((role) => role === 'support' || role === 'content_moderator');
    default:
      return false;
  }
}
