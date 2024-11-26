'use client';
import { useQuery } from '@tanstack/react-query';
import { marketplacePrice } from '@hsm/api-client';
import type { StaffSalary } from '@hsm/contracts';
import { browserClient } from '../../lib/client';
import { useCommand } from '../services/use-command';
// CHG-039: one Staff module shared by Owner and Manager; the server decides what each sees
// (mobile parity with apps/mobile/src/components/staff/staff-shared.tsx).
export const staffKey = (actorId: string, branchId: string) => ['staff', actorId, branchId];
export function useStaffRead<T>(
  actorId: string,
  branchId: string,
  part: unknown[],
  read: (client: ReturnType<typeof browserClient>) => Promise<T>,
) {
  return useQuery({
    queryKey: [...staffKey(actorId, branchId), ...part],
    gcTime: 0,
    retry: false,
    queryFn: () => read(browserClient()),
  });
}
// Every staff change refreshes the branch's staff list, detail and dashboard together.
export function useStaffCommand<T>(
  operation: string,
  actorId: string,
  branchId: string,
  run: (client: ReturnType<typeof browserClient>, body: T, key: string) => Promise<unknown>,
) {
  return useCommand<T>(operation + ':' + branchId, (body, key) => run(browserClient(), body, key), [
    staffKey(actorId, branchId),
    ['owner-dashboard', actorId],
  ]);
}
export const jobTitles = {
  receptionist: 'Receptionist',
  security_guard: 'Security guard',
  cleaner: 'Cleaner',
  cook: 'Cook',
  maintenance: 'Maintenance',
  supervisor: 'Supervisor',
  other: 'Other',
} as const;
export const methods = {
  cash: 'Cash',
  bank_transfer: 'Bank transfer',
  mobile_wallet: 'Mobile wallet',
  other: 'Other',
} as const;
export const staffStatuses = { active: 'Active', inactive: 'Inactive', ended: 'Ended' } as const;
export const pkr = (paisa: number) => marketplacePrice(paisa);
// Whole rupees typed by people become exact integer paisa (non-negotiable 5).
export function rupeesToPaisa(text: string) {
  const clean = text.replace(/[,\s]/g, '');
  return /^\d{1,9}$/.test(clean) ? Number(clean) * 100 : undefined;
}
// Local phone shown as 03xx…; the API stores +923xx….
export const localPhone = (phone: string) => '0' + phone.slice(3);
export const monthLabel = (month: string, style: 'short' | 'long' = 'short') =>
  new Date(month + 'T00:00:00Z').toLocaleDateString('en-PK', {
    month: style,
    year: 'numeric',
    timeZone: 'UTC',
  });
const tones = {
  paid: { label: 'Paid', tone: 'border-hsm-success text-hsm-success' },
  unpaid: { label: 'Unpaid', tone: 'border-hsm-border text-hsm-secondary' },
  due: { label: 'Due today', tone: 'border-hsm-gold text-hsm-heading' },
  overdue: { label: 'Overdue', tone: 'border-hsm-dangerText text-hsm-dangerText' },
} as const;
// Timing and money progress are shown together so "partial" never hides "overdue".
export function SalaryChip({ salary }: { salary: StaffSalary }) {
  const tone = tones[salary.timing];
  return (
    <span className="flex flex-wrap gap-2">
      <Chip label={tone.label} tone={tone.tone} />
      {salary.partial ? (
        <Chip label="Partly paid" tone="border-hsm-primary text-hsm-primary" />
      ) : null}
    </span>
  );
}
export function Chip({ label, tone }: { label: string; tone: string }) {
  return (
    <span className={'rounded-full border px-2 py-0.5 text-xs font-semibold ' + tone}>{label}</span>
  );
}
export function Choice<T extends string>(props: {
  label: string;
  options: Record<T, string>;
  value: T | undefined;
  onChange: (value: T) => void;
}) {
  return (
    <label className="field-label">
      {props.label}
      <select
        className="field-input"
        value={props.value ?? ''}
        onChange={(event) => props.onChange(event.target.value as T)}
      >
        <option value="" disabled>
          Choose…
        </option>
        {(Object.keys(props.options) as T[]).map((key) => (
          <option key={key} value={key}>
            {props.options[key]}
          </option>
        ))}
      </select>
    </label>
  );
}
