import type { SelfProfile } from '@hsm/contracts';
// ADM-001..003: phone values and remembered modes never grant authority.
export function canUseAdmin(profile: SelfProfile | undefined, rootOnly = false) {
  return Boolean(profile?.capabilities.admin && (!rootOnly || profile.capabilities.admin.isRoot));
}
export function adminSignature(profile: SelfProfile | undefined) {
  const admin = profile?.capabilities.admin;
  return JSON.stringify([profile?.user.id, admin?.isRoot, admin?.roles.slice().sort()]);
}
export function isAdminKey(key: readonly unknown[]) {
  return key[0] === 'platform-admin';
}
