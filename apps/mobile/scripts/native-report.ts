import { z } from 'zod';
const operations = [
  ['tapOnElement', 'tap'],
  ['scrollUntilVisibleCommand', 'scroll'],
  ['assertConditionCommand', 'assert'],
  ['inputTextCommand', 'input'],
  ['hideKeyboardCommand', 'keyboard'],
  ['launchAppCommand', 'launch'],
] as const;
const targets = [
  ['Find your place in the Twin Cities.', 'welcome_screen'],
  ['field-fullName', 'display_name'],
  ['field-email', 'email'],
  ['field-phone', 'phone'],
  ['field-password', 'password'],
  ['field-dateOfBirth', 'birth_date'],
  ['field-cnic', 'identity_number'],
  ['field-code', 'verification_code'],
  ['Verify your email', 'verification_screen'],
  ['Customer space', 'customer_space'],
  ['Manager space', 'manager_space'],
  ['Choose your space', 'experience_selection'],
  ['Hello, Mobile Identity', 'authenticated_screen'],
  ['Create account', 'create_account_button'],
] as const;
const reportSchema = z
  .array(
    z.object({
      metadata: z.object({ status: z.string() }),
      command: z.record(z.unknown()),
    }),
  )
  .max(1000);
const selectorSchema = z.object({
  idRegex: z.string().optional(),
  textRegex: z.string().optional(),
});
const detailSchema = z.object({
  selector: selectorSchema.optional(),
  condition: z.object({ visible: selectorSchema.optional() }).optional(),
});
export interface NativeStep {
  position: number;
  operation: (typeof operations)[number][1];
  target: (typeof targets)[number][1] | 'unknown';
}
// SEC-003: retain only closed identifiers, never report text, errors or evaluated input.
export function nativeReport(value: unknown): NativeStep | undefined {
  const parsed = reportSchema.safeParse(value);
  if (!parsed.success) return undefined;
  const failed = parsed.data.findLast((record) => record.metadata.status === 'FAILED');
  if (!failed) return undefined;
  const operation = operations.find(([key]) => Object.hasOwn(failed.command, key));
  if (!operation) return undefined;
  const detail = detailSchema.safeParse(failed.command[operation[0]]);
  const selector = detail.success
    ? (detail.data.selector ?? detail.data.condition?.visible)
    : undefined;
  const target = targets.find(([key]) => key === selector?.idRegex || key === selector?.textRegex);
  return {
    position: parsed.data.lastIndexOf(failed) + 1,
    operation: operation[1],
    target: target?.[1] ?? 'unknown',
  };
}
