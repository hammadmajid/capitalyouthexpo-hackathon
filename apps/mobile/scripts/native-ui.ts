import { z } from 'zod';
const states = [
  ['Unable to start', 'startup_error'],
  ['Unable to continue', 'render_error'],
  ['Choose your space', 'authenticated'],
  ['Connection unavailable', 'connection_error'],
  ['Sign-out incomplete', 'cleanup_error'],
  ['Find your place in the Twin Cities.', 'welcome'],
  ['Create your account', 'registration'],
  ['Verify your email', 'verification'],
  ['Restoring your session…', 'loading'],
  ['Sign out', 'authenticated'],
] as const;
export type NativeUiState =
  (typeof states)[number][1] | 'app_unknown' | 'outside_application' | 'unavailable';
// SEC-003: return only fixed UI states; never retain text, attributes or package identifiers.
export function nativeUi(input: unknown): NativeUiState {
  const parsed = z.string().max(262144).safeParse(input);
  if (
    !parsed.success ||
    !parsed.data.includes('<hierarchy') ||
    !parsed.data.includes('</hierarchy>')
  )
    return 'unavailable';
  if (!parsed.data.includes('package="pk.hsm.app"')) return 'outside_application';
  const state = states.find(([text]) => parsed.data.includes('text="' + text + '"'));
  return state?.[1] ?? 'app_unknown';
}
