// @vitest-environment node
import { readdir, readFile } from 'node:fs/promises';
import ts from 'typescript';
import { expect, it, vi } from 'vitest';
import type { FullResult, Suite, TestCase, TestResult } from '@playwright/test/reporter';
import PrivateBrowserReporter from './private-browser-reporter';
import configuration from '../../playwright.config';

async function approvedScenarios() {
  const directory = new URL('../../test/e2e/', import.meta.url);
  const files = (await readdir(directory)).filter((name) => name.endsWith('.spec.ts')).sort();
  const titles: string[] = [];
  for (const name of files) {
    const source = ts.createSourceFile(
      name,
      await readFile(new URL(name, directory), 'utf8'),
      ts.ScriptTarget.Latest,
      true,
    );
    const visit = (node: ts.Node) => {
      if (
        ts.isCallExpression(node) &&
        ts.isIdentifier(node.expression) &&
        node.expression.text === 'test'
      ) {
        const title = node.arguments[0];
        if (!title || !ts.isStringLiteral(title))
          throw new Error('Browser scenario needs a static title');
        titles.push(title.text);
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
  return titles;
}
const result = (status: TestResult['status']) =>
  ({
    status,
    error: { message: 'PRIVATE_FAILURE_MARKER' },
    attachments: [{ body: Buffer.from('PRIVATE_ATTACHMENT_MARKER') }],
  }) as TestResult;

it('ACC-001 / SEC-003 / AUD-002: every actual approved scenario passes through the default private reporter', async () => {
  const titles = await approvedScenarios();
  expect(configuration.reporter).toEqual([['./src/server/private-browser-reporter.ts']]);
  expect(titles).toHaveLength(22);
  const tests = titles.map((title) => ({ title }) as TestCase);
  const output = vi.fn<(xml: string) => Promise<void>>(async () => undefined);
  const reporter = new PrivateBrowserReporter(output);
  reporter.onBegin({}, { allTests: () => tests } as Suite);
  for (const test of tests) reporter.onTestEnd(test, result('passed'));
  expect(await reporter.onEnd({ status: 'passed' } as FullResult)).toBeUndefined();
  const xml = output.mock.calls[0]?.[0] ?? '';
  expect(xml).toContain('tests="22" failures="0" skipped="0"');
  expect(xml).not.toContain('Unrecognized');
  expect(xml).not.toContain('PRIVATE_');
  const names = [...xml.matchAll(/<testcase name="([^"]+)"/g)].map((match) => match[1]);
  expect(new Set(names).size).toBe(22);
  expect(titles.some((title) => xml.includes(title))).toBe(false);
});

it.each(['failed', 'timedOut', 'interrupted', 'skipped'] as const)(
  'ACC-001 / SEC-003 / AUD-002: a real %s scenario remains blocking with private diagnostics excluded',
  async (status) => {
    const titles = await approvedScenarios();
    const tests = titles.map((title) => ({ title }) as TestCase);
    const output = vi.fn<(xml: string) => Promise<void>>(async () => undefined);
    const reporter = new PrivateBrowserReporter(output);
    reporter.onBegin({}, { allTests: () => tests } as Suite);
    for (const [index, test] of tests.entries())
      reporter.onTestEnd(test, result(index === tests.length - 1 ? status : 'passed'));
    expect(
      await reporter.onEnd({ status: status === 'skipped' ? 'passed' : 'failed' } as FullResult),
    ).toEqual({ status: 'failed' });
    expect(output.mock.calls[0]?.[0]).toContain(
      status === 'skipped'
        ? 'tests="22" failures="0" skipped="1"'
        : 'tests="22" failures="1" skipped="0"',
    );
    expect(output.mock.calls[0]?.[0]).not.toContain('PRIVATE_');
  },
);
