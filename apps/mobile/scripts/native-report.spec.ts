import { expect, it } from 'vitest';
import { nativeReport } from './native-report';
import { NativeCommandFailure } from './native-diagnostics';
const privateValue = 'private-password-token-identity';
function record(command: Record<string, unknown>, status = 'FAILED') {
  return { command, metadata: { status, error: privateValue, evaluatedCommand: privateValue } };
}
it.each([
  ['tapOnElement', { selector: { idRegex: 'field-email' } }, 'tap', 'email'],
  [
    'scrollUntilVisibleCommand',
    { selector: { idRegex: 'field-cnic' } },
    'scroll',
    'identity_number',
  ],
  [
    'assertConditionCommand',
    { condition: { visible: { textRegex: 'Verify your email' } } },
    'assert',
    'verification_screen',
  ],
  [
    'assertConditionCommand',
    { condition: { visible: { textRegex: 'Customer space' } } },
    'assert',
    'customer_space',
  ],
  ['inputTextCommand', { text: privateValue }, 'input', 'unknown'],
  ['hideKeyboardCommand', {}, 'keyboard', 'unknown'],
  ['launchAppCommand', { appId: privateValue }, 'launch', 'unknown'],
] as const)(
  'SEC-003: structured native failures retain only closed operation and target identifiers',
  (key, detail, operation, target) => {
    const result = nativeReport([record({ [key]: detail })]);
    expect(result).toEqual({ position: 1, operation, target });
    expect(JSON.stringify(result)).not.toContain(privateValue);
    const message = new NativeCommandFailure({
      failure: 'command_failed',
      action: 'unknown',
      step: {
        position: result?.position ?? 1,
        operation: result?.operation ?? 'tap',
        target: result?.target ?? 'unknown',
      },
    }).message;
    expect(message).toContain('; operation: ' + operation + '; target: ' + target);
    expect(message).not.toContain(privateValue);
  },
);
it('SEC-003: successful commands and unknown private selectors are not reflected', () => {
  expect(nativeReport([record({ tapOnElement: {} }, 'COMPLETED')])).toBeUndefined();
  expect(
    nativeReport([record({ tapOnElement: { selector: { textRegex: privateValue } } })]),
  ).toEqual({ position: 1, operation: 'tap', target: 'unknown' });
  expect(nativeReport([record({ tapOnElement: privateValue })])).toEqual({
    position: 1,
    operation: 'tap',
    target: 'unknown',
  });
  expect(
    nativeReport([record({ inputTextCommand: {} }), record({ hideKeyboardCommand: {} })]),
  ).toEqual({ position: 2, operation: 'keyboard', target: 'unknown' });
});
it('SEC-003: malformed, unknown and oversized reports fail closed', () => {
  for (const value of [
    null,
    privateValue,
    [{}],
    [record({ [privateValue]: privateValue })],
    Array.from({ length: 1001 }, () => record({ tapOnElement: {} })),
  ]) {
    expect(nativeReport(value)).toBeUndefined();
  }
});

it('SEC-003: command position distinguishes opening a form from its final submit', () => {
  const first = record({ tapOnElement: { selector: { textRegex: 'Create account' } } });
  expect(nativeReport([first])).toEqual({
    position: 1,
    operation: 'tap',
    target: 'create_account_button',
  });
  const previous = record({ inputTextCommand: { text: privateValue } }, 'COMPLETED');
  expect(nativeReport([previous, first])).toEqual({
    position: 2,
    operation: 'tap',
    target: 'create_account_button',
  });
});

it.each([
  ['Manager space', 'manager_space'],
  ['Choose your space', 'experience_selection'],
])(
  'SEC-003: manager verification failures identify only the fixed target %s',
  (selector, target) => {
    const result = nativeReport([
      record({
        assertConditionCommand: {
          condition: { visible: { textRegex: selector } },
          error: privateValue,
        },
      }),
    ]);
    expect(result).toEqual({ position: 1, operation: 'assert', target });
    expect(JSON.stringify(result)).not.toContain(privateValue);
  },
);
