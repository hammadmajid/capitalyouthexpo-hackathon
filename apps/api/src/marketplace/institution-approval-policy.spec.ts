import { describe, expect, it } from 'vitest';
import { nextInstitutionApproval } from './institution-approval-policy.js';

const first = new Date('2026-10-01T10:00:00.000Z');
const later = new Date('2026-10-30T10:00:00.000Z');

describe('Institution approval integrity', () => {
  it('GEO-003: explicit reapproval replaces prior authority on material correction', () => {
    expect(
      nextInstitutionApproval(
        { publicApprovedAt: first, publicApprovedByUserId: 'root-one' },
        true,
        'root-two',
        later,
        true,
      ),
    ).toEqual({ publicApprovedAt: later, publicApprovedByUserId: 'root-two' });
  });
  it('GEO-003: records the first public approval', () => {
    expect(nextInstitutionApproval(null, true, 'root-one', first)).toEqual({
      publicApprovedAt: first,
      publicApprovedByUserId: 'root-one',
    });
  });

  it('GEO-003: preserves existing approval on an ordinary edit', () => {
    expect(
      nextInstitutionApproval(
        {
          publicApprovedAt: first,
          publicApprovedByUserId: 'root-one',
        },
        true,
        'root-two',
        later,
      ),
    ).toEqual({
      publicApprovedAt: first,
      publicApprovedByUserId: 'root-one',
    });
  });

  it('GEO-003: withdrawal clears approval metadata', () => {
    expect(
      nextInstitutionApproval(
        {
          publicApprovedAt: first,
          publicApprovedByUserId: 'root-one',
        },
        false,
        'root-two',
        later,
      ),
    ).toEqual({
      publicApprovedAt: null,
      publicApprovedByUserId: null,
    });
  });

  it('GEO-003: reapproval records the new approval authority', () => {
    expect(
      nextInstitutionApproval(
        {
          publicApprovedAt: null,
          publicApprovedByUserId: null,
        },
        true,
        'root-two',
        later,
      ),
    ).toEqual({
      publicApprovedAt: later,
      publicApprovedByUserId: 'root-two',
    });
  });
});
