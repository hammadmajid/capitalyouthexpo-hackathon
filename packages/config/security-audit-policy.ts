import { z } from 'zod';
export const backportExpiry = '2026-11-08T00:00:00.000Z';
const advisory = z.object({
  github_advisory_id: z.string(),
  module_name: z.string(),
  url: z.string().url(),
  patched_versions: z.string(),
  severity: z.enum(['info', 'low', 'moderate', 'high', 'critical']),
  findings: z.array(z.object({ version: z.string(), paths: z.array(z.string()).min(1) })).min(1),
});
const reportSchema = z.object({
  advisories: z.record(advisory),
  metadata: z.object({
    vulnerabilities: z.object({
      high: z.number().int().nonnegative(),
      critical: z.number().int().nonnegative(),
    }),
  }),
});
const exceptions = new Map([
  [
    'GHSA-86w9-cpqp-85rv',
    {
      module: 'node-forge',
      version: '1.4.0',
      path: 'apps__mobile>expo>@expo/cli>node-forge',
    },
  ],
  [
    'GHSA-vfj7-8cjw-p6xm',
    {
      module: 'braces',
      version: '3.0.3',
      path: 'apps__mobile>expo>@expo/metro>metro-file-map>micromatch>braces',
    },
  ],
]);
// SEC-001: exceptions are version/path limited, expire, and never cover critical findings.
export function validateAuditReport(input: unknown) {
  const parsed = reportSchema.safeParse(input);
  if (!parsed.success) throw new Error('Invalid security audit report');
  return parsed.data;
}
export function verifyAudit(input: unknown, now: Date) {
  const report = validateAuditReport(input);
  if (!Number.isFinite(now.getTime())) throw new Error('Invalid security audit report');
  const high = Object.values(report.advisories).filter(
    (item) => item.severity === 'high' || item.severity === 'critical',
  );
  if (
    report.metadata.vulnerabilities.high + report.metadata.vulnerabilities.critical !==
    high.length
  )
    throw new Error('Inconsistent security audit report');
  const accepted: string[] = [];
  for (const item of high) {
    const allowed = exceptions.get(item.github_advisory_id);
    if (now.getTime() >= Date.parse(backportExpiry))
      throw new Error('Security backport exception expired');
    if (
      !allowed ||
      item.severity !== 'high' ||
      item.patched_versions !== '<0.0.0' ||
      item.module_name !== allowed.module ||
      item.url !== 'https://github.com/advisories/' + item.github_advisory_id ||
      item.findings.some(
        (finding) =>
          finding.version !== allowed.version ||
          finding.paths.some((path) => path !== allowed.path),
      )
    )
      throw new Error('Unaccepted high or critical security finding');
    if (accepted.includes(item.github_advisory_id)) throw new Error('Duplicate security finding');
    accepted.push(item.github_advisory_id);
  }
  return { accepted, expiresAt: accepted.length ? backportExpiry : null };
}

export function verifyAuditExecution(input: unknown, code: number | null, now: Date) {
  if (code !== 0 && code !== 1) throw new Error('Invalid scanner status');
  const result = verifyAudit(input, now);
  if ((code === 0) !== (result.accepted.length === 0))
    throw new Error('Inconsistent scanner status');
  return result;
}
