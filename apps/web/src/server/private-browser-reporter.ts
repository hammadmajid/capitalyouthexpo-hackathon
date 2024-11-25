import { mkdir, writeFile } from 'node:fs/promises';
import type {
  FullResult,
  Reporter,
  Suite,
  TestCase,
  TestResult,
  TestStep,
} from '@playwright/test/reporter';
const scenarios = new Map([
  [
    'HMA-015: moderator approves private photo and withdraws the current avatar through Web forms',
    'HMA-015 private photo moderation',
  ],
  [
    'HMA-015: private identity correction through real Web review forms',
    'HMA-015 private identity review',
  ],
  [
    'HMA-015/016: Root governs institution revisions and customer warnings through real Web forms',
    'HMA-015 governed institution revisions and customer enforcement',
  ],
  [
    'AUTH-C CHG-006: real private Owner evidence upload and additive capability',
    'AUTH-C private Owner evidence and additive access',
  ],
  [
    'CHG-006 SEC-001: guests can open the public shell and preserve a supported destination through signup',
    'CHG-006 guest entry and signup return',
  ],
  [
    'AUTH-C / SEC-001: real registration, OTP, cookie session, revocation and recovery',
    'AUTH-C real identity and session lifecycle',
  ],
  [
    'SEC-001: responsive public pages have CSP and accessible controls',
    'SEC-001 public browser security and accessibility',
  ],
  [
    'MGR-004 / ACC-002: real manager activation, branch scope and immediate suspension rejection',
    'ACC-002 real manager scope and revocation',
  ],
  [
    'STAY-001 / RES-001 / ACC-001: real browser booking check-in and walk-in admission',
    'STAY-001 booking and walk-in admission',
  ],
  [
    'ACC-001/004 / SEC-003: real paged block target, persisted claim and historical release',
    'ACC-001 paged inventory blocking and release',
  ],
  [
    'BKG-001/002/004 / ACC-001/002: real browser guest return, hold, booking snapshot and public privacy',
    'BKG-001 booking checkout and public privacy',
  ],
  [
    'PAY-001..009 / OUT-001..006: real browser rent proof, approval, receipt, checkout and Past Stay',
    'PAY-001 rent proof receipt and checkout',
  ],
  [
    'PAY-006 / PAY-007 / RES-005: real browser proof rejection, partial payment and bed transfer',
    'PAY-006 rejected proof partial payment and transfer',
  ],
  [
    'Journey 1 / P9-FIX-01: a differently priced transfer amends rent from the first unbilled period',
    'P9-FIX-01 repriced Stay transfer',
  ],
  [
    'Journey 2 / P9-FIX-02: extending after billing ran out resumes billing exactly once',
    'P9-FIX-02 exhausted billing extension',
  ],
  [
    'Journey 3+4 / P9-FIX-03/04: deposit applied once at checkout; later refund shown beside the frozen statement',
    'P9-FIX-03 deposit checkout and subsequent refund',
  ],
  [
    'Journey 5 / CMP-001..006: complaint resolved, reopened, resolved again and accepted with full history',
    'CMP-001 complaint reopen and acceptance',
  ],
  [
    'Journey 6 / SERV-002: staff add a priced route; resident joins at that price; billing starts; resident leaves',
    'SERV-002 transport enrollment and billing',
  ],
  [
    'Journey 7 / REV-001..006: too-early gate; Verified Stay review shown publicly with the hostel reply',
    'REV-001 verified Stay review and reply',
  ],
  [
    'Journey 8 / OWN-001..004: owner sees authoritative totals, drills into a branch and downloads a report',
    'OWN-001 owner dashboard and report',
  ],
  [
    'Journey 9 / ADM-001..008: a moderator hides a reported review by policy; Root mutations are refused; audit kept',
    'ADM-001 moderation scope and audit',
  ],
  [
    'Journey 10 / SEC-001 / ACC-002: a Branch A manager and another resident cannot reach Branch B or private records',
    'ACC-002 cross-branch and resident privacy',
  ],
]);
type Outcome = 'passed' | 'failed' | 'skipped';
type Result = { name: string; outcome: Outcome; failureAt?: string };
async function artifact(xml: string) {
  await mkdir('test-results', { recursive: true });
  await writeFile('test-results/browser.xml', xml);
}
// SEC-003: a closed report excludes error messages, evaluated values, paths and attachments.
export default class PrivateBrowserReporter implements Reporter {
  private readonly cases = new Map<TestCase, Result>();
  private infrastructureFailed = false;
  private readonly failedSteps = new Map<TestCase, string>();
  private readonly output: (xml: string) => Promise<void>;
  constructor(output?: ((xml: string) => Promise<void>) | Record<string, unknown>) {
    this.output = typeof output === 'function' ? output : artifact;
  }
  printsToStdio() {
    return true;
  }
  onBegin(_config: unknown, suite: Suite) {
    for (const test of suite.allTests())
      this.cases.set(test, {
        name: scenarios.get(test.title) ?? 'Unrecognized browser scenario',
        outcome: 'failed',
      });
  }
  onStepEnd(test: TestCase, _result: TestResult, step: TestStep) {
    if (!step.error || !step.location || this.failedSteps.has(test)) return;
    const match = /(?:^|[/\\])(auth|management|admin-governance|profile-reviews)\.spec\.ts$/.exec(
      step.location.file,
    );
    const line = step.location.line;
    if (match && Number.isInteger(line) && line > 0 && line <= 5000)
      this.failedSteps.set(test, match[1] + ':' + line.toString());
  }
  onTestEnd(test: TestCase, result: TestResult) {
    const known = scenarios.get(test.title);
    this.cases.set(test, {
      name: known ?? 'Unrecognized browser scenario',
      ...(this.failedSteps.get(test) ? { failureAt: this.failedSteps.get(test) as string } : {}),
      outcome: !known
        ? 'failed'
        : result.status === 'passed'
          ? 'passed'
          : result.status === 'skipped'
            ? 'skipped'
            : 'failed',
    });
  }
  onError() {
    this.infrastructureFailed = true;
  }
  async onEnd(result: FullResult) {
    const cases = [...this.cases.values()];
    if (
      cases.length === 0 ||
      this.infrastructureFailed ||
      (result.status !== 'passed' && !cases.some((value) => value.outcome === 'failed'))
    )
      cases.push({ name: 'Browser infrastructure', outcome: 'failed' });
    const failures = cases.filter((value) => value.outcome === 'failed').length;
    const skipped = cases.filter((value) => value.outcome === 'skipped').length;
    const entries = cases
      .map(
        (value) =>
          '<testcase name="' +
          value.name +
          '">' +
          (value.outcome === 'failed'
            ? '<failure message="Browser verification failed' +
              (value.failureAt ? ';check=' + value.failureAt : '') +
              '"/>'
            : value.outcome === 'skipped'
              ? '<skipped/>'
              : '') +
          '</testcase>',
      )
      .join('');
    await this.output(
      '<testsuite name="Real browser API integration" tests="' +
        cases.length +
        '" failures="' +
        failures +
        '" skipped="' +
        skipped +
        '">' +
        entries +
        '</testsuite>',
    );
    if (failures > 0 || skipped > 0) return { status: 'failed' as const };
  }
}
