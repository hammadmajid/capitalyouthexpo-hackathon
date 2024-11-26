import { router } from 'expo-router';
import type { SetupStep } from './use-owner-draft';
export function leaveSetup() {
  if (router.canGoBack()) router.back();
  else router.replace('/owner');
}
// BRN-001: the branch being set up (or a pending "add branch") rides along on every step
// route of the current flow, so drill-down screens need not thread it through props. The
// wizard sets it from its own route params on each render.
export type SetupBranch = { branchId?: string; addBranch?: boolean };
let current: SetupBranch = {};
export function setSetupBranch(branch: SetupBranch) {
  current = branch;
}
function branchParams(branchId = current.branchId) {
  return branchId ? { branchId } : current.addBranch ? { addBranch: '1' } : {};
}
export function openSetupStep(step: SetupStep, brandId?: string) {
  router.push({
    pathname: '/owner-setup',
    params: { step, ...(brandId ? { brandId, ...branchParams() } : {}) },
  });
}
// HSM-SETUP: Back walks the wizard one level up: a rooms drill-down level returns to the
// screen that pushed it, a step returns to the previous step, step 1 to the overview.
export function setupBack(
  step: SetupStep,
  steps: readonly SetupStep[],
  brandId: string | undefined,
  drillDown: boolean,
) {
  if (drillDown && router.canGoBack()) return router.back();
  if (!brandId) return leaveSetup();
  const index = steps.indexOf(step);
  replaceSetupStep(index > 0 ? steps[index - 1] : undefined, brandId);
}
// Replace the current step as the wizard advances.
export function replaceSetupStep(step: SetupStep | undefined, brandId: string, branchId?: string) {
  router.replace({
    pathname: '/owner-setup',
    params: { brandId, ...branchParams(branchId), ...(step ? { step } : {}) },
  });
}
export function openAddBranch(brandId: string) {
  router.push({ pathname: '/owner-setup', params: { brandId, addBranch: '1' } });
}
export function openBranchSetup(brandId: string, branchId: string) {
  router.push({ pathname: '/owner-setup', params: { brandId, branchId } });
}
// Unsaved form text survives step navigation for this app session only; never persisted.
const drafts = new Map<string, Record<string, string>>();
export function setupDraft(key: string) {
  return drafts.get(key);
}
export function keepSetupDraft(key: string, values: Record<string, string> | undefined) {
  if (values) drafts.set(key, values);
  else drafts.delete(key);
}
// Building & Rooms drill-down: Building → Floor → Room each on its own screen.
export type RoomsLevel = {
  buildingId?: string;
  floorId?: string;
  roomId?: string;
  add?: 'building' | 'floor' | 'room' | 'bed';
};
export function openRoomsLevel(brandId: string, level: RoomsLevel) {
  router.push({
    pathname: '/owner-setup',
    params: { brandId, ...branchParams(), step: 'rooms', ...level },
  });
}
export function backToRooms(brandId: string) {
  router.dismissTo({
    pathname: '/owner-setup',
    params: { brandId, ...branchParams(), step: 'rooms' },
  });
}
