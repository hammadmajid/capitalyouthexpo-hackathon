import { mkdir, writeFile } from 'node:fs/promises';
import { expect, it, vi } from 'vitest';
import type { FullResult, Suite, TestCase, TestResult, TestStep } from '@playwright/test/reporter';
import PrivateBrowserReporter from './private-browser-reporter';
vi.mock('node:fs/promises', () => {
  const filesystem = { mkdir: vi.fn(), writeFile: vi.fn() };
  return { ...filesystem, default: filesystem };
});
const identity =
  'AUTH-C / SEC-001: real registration, OTP, cookie session, revocation and recovery';
const security = 'SEC-001: responsive public pages have CSP and accessible controls';
const manager =
  'MGR-004 / ACC-002: real manager activation, branch scope and immediate suspension rejection';
const testCase = (title: string) => ({ title }) as TestCase;
const suite = (tests: TestCase[]) => ({ allTests: () => tests }) as Suite;
const result = (status: TestResult['status']) =>
  ({
    status,
    error: { message: 'private-password private-otp private-cnic' },
    attachments: [{ body: Buffer.from('private-document') }],
  }) as TestResult;
const run = (status: FullResult['status']) => ({ status }) as FullResult;
it('SEC-003: actual test outcomes retain only fixed scenario names and generic failure metadata', async () => {
  const output = vi.fn<(xml: string) => Promise<void>>(async () => undefined);
  const reporter = new PrivateBrowserReporter(output);
  const cases: [TestCase, TestCase, TestCase] = [
    testCase(identity),
    testCase(security),
    testCase(manager),
  ];
  reporter.onBegin({}, suite(cases));
  reporter.onTestEnd(cases[0], result('passed'));
  reporter.onTestEnd(cases[1], result('failed'));
  reporter.onTestEnd(cases[2], result('skipped'));
  await reporter.onEnd(run('failed'));
  const xml = output.mock.calls[0]?.[0];
  expect(xml).toContain('tests="3" failures="1" skipped="1"');
  expect(xml).toContain('AUTH-C real identity and session lifecycle');
  expect(xml).toContain('<skipped/>');
  expect(xml).not.toMatch(/private-|attachments|password|otp|cnic/);
  expect(reporter.printsToStdio()).toBe(true);
});
it('SEC-003: unknown names and tests never reached cannot be falsely reported passed', async () => {
  const output = vi.fn<(xml: string) => Promise<void>>(async () => undefined);
  const reporter = new PrivateBrowserReporter(output);
  const unknown = testCase('private-refresh private@example.test');
  reporter.onBegin({}, suite([unknown, testCase(identity)]));
  reporter.onTestEnd(unknown, result('passed'));
  await reporter.onEnd(run('failed'));
  expect(output.mock.calls[0]?.[0]).toContain('tests="2" failures="2" skipped="0"');
  expect(output.mock.calls[0]?.[0]).not.toMatch(/private-|private@/);
});
it.each(['timedOut', 'interrupted'] as const)(
  'SEC-003: %s remains a failure without raw context',
  async (status) => {
    const output = vi.fn<(xml: string) => Promise<void>>(async () => undefined);
    const reporter = new PrivateBrowserReporter(output);
    const test = testCase(manager);
    reporter.onBegin({}, suite([test]));
    reporter.onTestEnd(test, result(status));
    await reporter.onEnd(run('failed'));
    expect(output.mock.calls[0]?.[0]).toContain('failures="1"');
  },
);
it('SEC-003: infrastructure errors and unsuccessful empty runs produce generic failures', async () => {
  for (const explicitError of [true, false]) {
    const output = vi.fn<(xml: string) => Promise<void>>(async () => undefined);
    const reporter = new PrivateBrowserReporter(output);
    if (explicitError) reporter.onError();
    await reporter.onEnd(run('failed'));
    expect(output.mock.calls[0]?.[0]).toContain('Browser infrastructure');
    expect(output.mock.calls[0]?.[0]).toContain('tests="1" failures="1" skipped="0"');
  }
});
it('SEC-003: verified success has no invented failure or skipped case', async () => {
  const output = vi.fn<(xml: string) => Promise<void>>(async () => undefined);
  const reporter = new PrivateBrowserReporter(output);
  const test = testCase(security);
  reporter.onBegin({}, suite([test]));
  reporter.onTestEnd(test, result('passed'));
  await reporter.onEnd(run('passed'));
  expect(output.mock.calls[0]?.[0]).toContain('tests="1" failures="0" skipped="0"');
});

it('SEC-003: Playwright options use only the fixed XML artifact path', async () => {
  const reporter = new PrivateBrowserReporter({});
  await reporter.onEnd(run('failed'));
  expect(mkdir).toHaveBeenCalledWith('test-results', { recursive: true });
  expect(writeFile).toHaveBeenCalledWith(
    'test-results/browser.xml',
    expect.stringContaining('Browser infrastructure'),
  );
  vi.mocked(writeFile).mockRejectedValueOnce(new Error('Artifact unavailable'));
  await expect(reporter.onEnd(run('failed'))).rejects.toThrow('Artifact unavailable');
});

it('SEC-003: unknown, skipped or empty browser runs fail the CI command', async () => {
  for (const status of ['passed', 'skipped'] as const) {
    const reporter = new PrivateBrowserReporter(async () => undefined);
    const test = testCase(status === 'passed' ? 'Private unrecognized title' : identity);
    reporter.onBegin({}, suite([test]));
    reporter.onTestEnd(test, result(status));
    expect(await reporter.onEnd(run('passed'))).toEqual({ status: 'failed' });
  }
  const empty = new PrivateBrowserReporter(async () => undefined);
  expect(await empty.onEnd(run('passed'))).toEqual({ status: 'failed' });
});

it('SEC-003: setup errors and failed run status cannot hide behind a passed browser case', async () => {
  for (const explicitError of [true, false]) {
    const output = vi.fn<(xml: string) => Promise<void>>(async () => undefined);
    const reporter = new PrivateBrowserReporter(output);
    const test = testCase(identity);
    reporter.onBegin({}, suite([test]));
    reporter.onTestEnd(test, result('passed'));
    if (explicitError) reporter.onError();
    expect(await reporter.onEnd(run(explicitError ? 'passed' : 'failed'))).toEqual({
      status: 'failed',
    });
    expect(output.mock.calls[0]?.[0]).toContain('tests="2" failures="1" skipped="0"');
  }
});

it('SEC-003: guest entry is an explicitly recognized blocking browser scenario', async () => {
  const output = vi.fn<(xml: string) => Promise<void>>(async () => undefined),
    reporter = new PrivateBrowserReporter(output);
  const test = testCase(
    'CHG-006 SEC-001: guests can open the public shell and preserve a supported destination through signup',
  );
  reporter.onBegin({}, suite([test]));
  reporter.onTestEnd(test, result('passed'));
  expect(await reporter.onEnd(run('passed'))).toBeUndefined();
  expect(output.mock.calls[0]?.[0]).toContain('CHG-006 guest entry and signup return');
  expect(output.mock.calls[0]?.[0]).toContain('failures="0"');
});
function step(input: {
  error?: unknown;
  location?: { file: string; line: number; column: number };
}) {
  return input as TestStep;
}
it('SEC-003: failed checks retain only allowlisted source coordinates; first failure is not replaced by later steps', async () => {
  const output = vi.fn<(xml: string) => Promise<void>>(async () => undefined),
    reporter = new PrivateBrowserReporter(output),
    test = testCase(identity);
  reporter.onBegin({}, suite([test]));
  reporter.onStepEnd(
    test,
    result('failed'),
    step({
      error: { message: 'private password' },
      location: { file: '/private/identity/path/auth.spec.ts', line: 42, column: 7 },
    }),
  );
  reporter.onStepEnd(
    test,
    result('failed'),
    step({ error: {}, location: { file: 'management.spec.ts', line: 99, column: 1 } }),
  );
  reporter.onTestEnd(test, result('failed'));
  await reporter.onEnd(run('failed'));
  const xml = output.mock.calls[0]?.[0];
  expect(xml).toContain(';check=auth:42');
  expect(xml).not.toMatch(/private|identity\/path|password|99/);
});
it.each([
  {},
  { error: {} },
  { location: { file: 'auth.spec.ts', line: 10, column: 1 } },
  { error: {}, location: { file: '/private/password.txt', line: 10, column: 1 } },
  ...[0, -1, 5001, 1.5, NaN].map((line) => ({
    error: {},
    location: { file: 'auth.spec.ts', line, column: 1 },
  })),
])(
  'SEC-003: untrusted or incomplete step metadata never enters the closed report',
  async (metadata) => {
    const output = vi.fn<(xml: string) => Promise<void>>(async () => undefined),
      reporter = new PrivateBrowserReporter(output),
      test = testCase(manager);
    reporter.onBegin({}, suite([test]));
    reporter.onStepEnd(test, result('failed'), step(metadata));
    reporter.onTestEnd(test, result('failed'));
    await reporter.onEnd(run('failed'));
    expect(output.mock.calls[0]?.[0]).not.toMatch(/check=|private|password\.txt/);
  },
);

it('SEC-003: real Owner evidence scenario emits only its fixed closed name', async () => {
  const output = vi.fn<(xml: string) => Promise<void>>(async () => undefined);
  const reporter = new PrivateBrowserReporter(output);
  const owner = testCase(
    'AUTH-C CHG-006: real private Owner evidence upload and additive capability',
  );
  reporter.onBegin({}, suite([owner]));
  reporter.onTestEnd(owner, result('failed'));
  await reporter.onEnd(run('failed'));
  expect(output.mock.calls[0]?.[0]).toContain('AUTH-C private Owner evidence and additive access');
  expect(output.mock.calls[0]?.[0]).toContain('failures="1" skipped="0"');
  expect(output.mock.calls[0]?.[0]).not.toMatch(
    /private-password|private-otp|private-cnic|private-document|attachments/,
  );
});
