import { describe, expect, it } from 'vitest';
import type { HostelOnboarding } from '@hsm/contracts';
import {
  canAddBranch,
  canSkipSetupStep,
  draftProgress,
  nextSetupStep,
  parseSetupStep,
  setupStepKeys,
  setupStepLocked,
} from './setup-steps';
function hostel(status: string | null, missingFields: string[] = []) {
  return {
    id: 'brand',
    missingFields,
    mainBranch: status ? { id: 'branch', isPrimary: true, verificationStatus: status } : null,
  } as unknown as HostelOnboarding;
}
const room = (seats: number, archivedAt: string | null = null) => ({
  archivedAt,
  seats: Array.from({ length: seats }, () => ({ archivedAt: null })),
});
describe('HSM-SETUP wizard steps', () => {
  it('HSM-SETUP: keeps the mobile ten-step order ending in Review', () => {
    expect(setupStepKeys).toEqual([
      'basics',
      'location',
      'amenities',
      'policies',
      'photos',
      'visits',
      'rooms',
      'payments',
      'staff',
      'review',
    ]);
    expect(parseSetupStep('rooms')).toBe('rooms');
    expect(parseSetupStep('unknown')).toBeUndefined();
  });
  it('HSM-SETUP: only optional steps of a saved draft can be skipped', () => {
    expect(canSkipSetupStep('photos', true, 'brand')).toBe(true);
    expect(canSkipSetupStep('basics', false, 'brand')).toBe(false);
    expect(canSkipSetupStep('photos', true, undefined)).toBe(false);
  });
  it('CHG-041: submitted drafts lock every step; approved ones lock only name and location', () => {
    expect(setupStepLocked(hostel('draft'), 'basics')).toBe(false);
    expect(setupStepLocked(hostel('submitted'), 'rooms')).toBe(true);
    expect(setupStepLocked(hostel('submitted'), 'review')).toBe(false);
    expect(setupStepLocked(hostel('approved'), 'rooms')).toBe(false);
    expect(setupStepLocked(hostel('approved'), 'location')).toBe(true);
    expect(setupStepLocked(hostel('changes_requested'), 'location')).toBe(false);
  });
  it('BRN-001: another branch can be added only after the main branch was submitted', () => {
    expect(canAddBranch(hostel('draft'))).toBe(false);
    expect(canAddBranch(hostel('submitted'))).toBe(true);
    expect(canAddBranch(undefined)).toBe(false);
  });
});
describe('HSM-SETUP draft progress', () => {
  it('HSM-SETUP: progress comes from saved server state, never local flags', () => {
    const progress = draftProgress(hostel('draft', ['area']), {
      inventory: { rooms: [room(2), room(1, '2026-01-01T00:00:00Z')] },
      gallery: { data: [{}] },
      listing: { amenities: [] },
      policy: { effectiveVersion: { id: 'v1' } },
      staff: { data: [] },
      visits: { windows: [{}] },
      payments: { data: [] },
    });
    expect(progress).toMatchObject({
      basics: true,
      location: false,
      rooms: true,
      photos: true,
      amenities: false,
      policies: true,
      visits: true,
      payments: false,
      staff: false,
      review: false,
      roomCount: 1,
      bedCount: 2,
      ready: false,
    });
    expect(nextSetupStep(progress)).toBe('location');
  });
  it('HSM-SETUP: a room without beds is not a saved Rooms step', () => {
    const progress = draftProgress(hostel('draft'), { inventory: { rooms: [room(0)] } });
    expect(progress.rooms).toBe(false);
    expect(progress.ready).toBe(true);
  });
  it('HSM-SETUP: a submitted draft marks Review done', () => {
    expect(draftProgress(hostel('submitted'), {}).review).toBe(true);
    expect(draftProgress(undefined, {}).basics).toBe(false);
  });
});
