import type { NativeUiState } from './native-ui.ts';
import type { NativeStep } from './native-report.ts';
export type NativeFailure =
  | 'timed_out'
  | 'invalid_flow'
  | 'device_unavailable'
  | 'toolchain_failed'
  | 'assertion_failed'
  | 'command_failed'
  | 'command_unavailable';
const actions = [
  ['Enter test display name', 'display_name'],
  ['Enter test email', 'email'],
  ['Enter test mobile number', 'phone'],
  ['Enter test password', 'password'],
  ['Enter adult birth date', 'birth_date'],
  ['Enter test identity number', 'identity_number'],
  ['Enter verification code', 'verification_code'],
] as const;
export interface NativeDiagnostic {
  failure: NativeFailure;
  step?: NativeStep;
  ui?: NativeUiState;
  action: (typeof actions)[number][1] | 'unknown';
}
export function nativeDiagnostic(output: string, timedOut: boolean): NativeDiagnostic {
  let failure: NativeFailure = 'command_failed';
  if (timedOut) failure = 'timed_out';
  else if (
    /Flow parsing|Unrecognized field|Error parsing|Failed to parse|No such option/i.test(output)
  )
    failure = 'invalid_flow';
  else if (/No connected devices|No devices found|Device not found/i.test(output))
    failure = 'device_unavailable';
  else if (/UnsupportedClassVersionError|Could not find or load main class/i.test(output))
    failure = 'toolchain_failed';
  else if (
    /Element not found|No visible element found|Unable to find|Assertion is false/i.test(output)
  )
    failure = 'assertion_failed';
  let action: NativeDiagnostic['action'] = 'unknown';
  let last = -1;
  for (const [label, identifier] of actions) {
    const index = output.lastIndexOf(label);
    if (index > last) {
      action = identifier;
      last = index;
    }
  }
  return { failure, action };
}
export class NativeCommandFailure extends Error {
  readonly diagnostic: NativeDiagnostic;
  constructor(diagnostic: NativeDiagnostic) {
    super(
      'Native command failed: ' +
        diagnostic.failure +
        '; last input: ' +
        diagnostic.action +
        (diagnostic.step
          ? '; command: ' +
            diagnostic.step.position +
            '; operation: ' +
            diagnostic.step.operation +
            '; target: ' +
            diagnostic.step.target
          : '') +
        (diagnostic.ui ? '; UI state: ' + diagnostic.ui : ''),
    );
    this.name = 'NativeCommandFailure';
    this.diagnostic = diagnostic;
  }
}
