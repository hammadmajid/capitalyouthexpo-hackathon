import { expect, it } from 'vitest';
import { backportExpiry, verifyAudit, verifyAuditExecution } from './security-audit-policy.js';
const now = new Date('2026-10-09T00:00:00.000Z');
const forge = {
  github_advisory_id: 'GHSA-86w9-cpqp-85rv',
  module_name: 'node-forge',
  url: 'https://github.com/advisories/GHSA-86w9-cpqp-85rv',
  severity: 'high',
  patched_versions: '<0.0.0',
  findings: [{ version: '1.4.0', paths: ['apps__mobile>expo>@expo/cli>node-forge'] }],
};
const braces = {
  github_advisory_id: 'GHSA-vfj7-8cjw-p6xm',
  module_name: 'braces',
  url: 'https://github.com/advisories/' + 'GHSA-vfj7-8cjw-p6xm',
  severity: 'high',
  patched_versions: '<0.0.0',
  findings: [
    { version: '3.0.3', paths: ['apps__mobile>expo>@expo/metro>metro-file-map>micromatch>braces'] },
  ],
};
function report(advisories: unknown = { forge, braces }, high = 2, critical = 0) {
  return { advisories, metadata: { vulnerabilities: { high, critical } } };
}
it('SEC-001: reports only the two explicitly approved tooling exceptions', () => {
  expect(verifyAudit(report(), now)).toEqual({
    accepted: [forge.github_advisory_id, braces.github_advisory_id],
    expiresAt: backportExpiry,
  });
});
it('SEC-001: reports a clean registry scan without claiming exceptions', () => {
  expect(verifyAudit(report({}, 0), now)).toEqual({ accepted: [], expiresAt: null });
});
it('SEC-001: lower severity findings remain visible without lowering the high gate', () => {
  expect(
    verifyAudit(report({ moderate: { ...forge, severity: 'moderate' } }, 0), now).accepted,
  ).toEqual([]);
});
it.each([
  { ...forge, github_advisory_id: 'GHSA-unknown-finding' },
  { ...forge, module_name: 'another-module' },
  { ...forge, patched_versions: '>=1.4.1' },
  { ...forge, url: 'https://example.com/advisory' },
  { ...forge, findings: [{ version: '1.4.1', paths: forge.findings[0]?.paths }] },
  { ...forge, findings: [{ version: '1.4.0', paths: ['apps__api>node-forge'] }] },
  {
    ...forge,
    findings: [
      { version: '1.4.0', paths: [...(forge.findings[0]?.paths ?? []), 'apps__api>node-forge'] },
    ],
  },
])('SEC-001: rejects scope, version and advisory drift', (finding) => {
  expect(() => verifyAudit(report({ finding }, 1), now)).toThrow('Unaccepted');
});
it('SEC-001: critical severity is never excepted, even for a known advisory', () => {
  expect(() =>
    verifyAudit(report({ forge: { ...forge, severity: 'critical' } }, 0, 1), now),
  ).toThrow('Unaccepted');
});
it('SEC-001: duplicate findings cannot multiply an exception', () => {
  expect(() => verifyAudit(report({ first: forge, second: forge }), now)).toThrow('Duplicate');
});
it.each([new Date(backportExpiry), new Date('2026-11-09')])(
  'SEC-001: exceptions fail closed on and after expiry',
  (date) => {
    expect(() => verifyAudit(report(), date)).toThrow('expired');
  },
);
it.each([
  undefined,
  {},
  { advisories: {}, metadata: { vulnerabilities: { high: -1, critical: 0 } } },
])('SEC-001: malformed scanner reports cannot pass', (value) => {
  expect(() => verifyAudit(value, now)).toThrow('Invalid');
});
it('SEC-001: invalid clocks and inconsistent scanner counts cannot pass', () => {
  expect(() => verifyAudit(report(), new Date('invalid'))).toThrow('Invalid');
  expect(() => verifyAudit(report({}, 1), now)).toThrow('Inconsistent');
});

it('SEC-001: valid scanner exit status must agree with its high-severity findings', () => {
  expect(verifyAuditExecution(report(), 1, now).accepted).toHaveLength(2);
  expect(verifyAuditExecution(report({}, 0), 0, now).accepted).toEqual([]);
  expect(() => verifyAuditExecution(report(), 0, now)).toThrow('scanner status');
  expect(() => verifyAuditExecution(report({}, 0), 1, now)).toThrow('scanner status');
});
it.each([2, null])('SEC-001: scanner process failures can never use an exception', (code) => {
  expect(() => verifyAuditExecution(report(), code, now)).toThrow('scanner status');
});
