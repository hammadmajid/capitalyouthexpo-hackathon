'use client';
import { useState } from 'react';
import { createStaff, updateStaff } from '@hsm/api-client';
import type { StaffMember } from '@hsm/contracts';
import { karachiToday } from '../../lib/karachi-time';
import { errorMessage } from '../../lib/messages';
import { Button } from '../ui/button';
import { GroupedNumberInput } from '../ui/grouped-number-input';
import { Choice, jobTitles, localPhone, rupeesToPaisa, useStaffCommand } from './staff-shared';
type Title = keyof typeof jobTitles;
type Draft = {
  fullName: string;
  phone: string;
  jobTitle: Title | undefined;
  customTitle: string;
  startsOn: string;
  salary: string;
  dueDay: string;
};
// Adding staff never creates a login; salary is optional and needs payroll access.
export function StaffForm(props: {
  actorId: string;
  branchId: string;
  staff?: StaffMember;
  payroll: boolean;
  close: () => void;
}) {
  const { staff } = props;
  const [draft, setDraft] = useState<Draft>({
    fullName: staff?.fullName ?? '',
    phone: staff?.phone ? localPhone(staff.phone) : '',
    jobTitle: staff?.jobTitle,
    customTitle: staff?.customTitle ?? '',
    startsOn: staff?.startsOn ?? karachiToday(),
    salary: '',
    dueDay: '1',
  });
  const [problem, setProblem] = useState<string>();
  const save = useStaffCommand<Record<string, unknown>>(
    staff ? 'staff-edit' : 'staff-add',
    props.actorId,
    props.branchId,
    (client, body, key) =>
      staff
        ? updateStaff(client, props.branchId, staff.id, body, key)
        : createStaff(client, props.branchId, body, key),
  );
  const set = (patch: Partial<Draft>) => setDraft({ ...draft, ...patch });
  function submit() {
    const body = staffBody(draft, staff);
    if (typeof body === 'string') return setProblem(body);
    setProblem(undefined);
    save.mutate(body, { onSuccess: props.close });
  }
  return (
    <section aria-label={staff ? 'Edit staff' : 'Add staff'} className="space-y-3">
      <h3 className="font-semibold">{staff ? 'Edit staff' : 'Add staff'}</h3>
      <StaffFields draft={draft} set={set} salary={!staff && props.payroll} />
      {problem ? <p role="alert">{problem}</p> : null}
      {save.isError ? <p role="alert">{errorMessage(save.error)}</p> : null}
      <div className="flex flex-wrap gap-2">
        <Button disabled={save.isPending} onClick={submit}>
          {save.isPending ? 'Saving…' : 'Save'}
        </Button>
        <Button variant="secondary" onClick={props.close}>
          Cancel
        </Button>
      </div>
    </section>
  );
}
function StaffFields(props: {
  draft: Draft;
  set: (patch: Partial<Draft>) => void;
  salary: boolean;
}) {
  return (
    <>
      <Text
        label="Full name"
        value={props.draft.fullName}
        max={120}
        set={(v) => props.set({ fullName: v })}
      />
      <Text
        label="Mobile number (optional)"
        value={props.draft.phone}
        max={13}
        placeholder="03001234567"
        set={(v) => props.set({ phone: v })}
      />
      <Choice
        label="Job"
        options={jobTitles}
        value={props.draft.jobTitle}
        onChange={(v) => props.set({ jobTitle: v })}
      />
      {props.draft.jobTitle === 'other' ? (
        <Text
          label="Job name"
          value={props.draft.customTitle}
          max={60}
          set={(v) => props.set({ customTitle: v })}
        />
      ) : null}
      <label className="field-label">
        Start date
        <input
          className="field-input"
          type="date"
          min="2000-01-01"
          value={props.draft.startsOn}
          onChange={(event) => props.set({ startsOn: event.target.value })}
        />
      </label>
      {props.salary ? (
        <div className="grid grid-cols-3 gap-2">
          <label className="field-label col-span-2">
            Monthly salary, PKR (optional)
            <GroupedNumberInput
              className="field-input"
              value={props.draft.salary}
              placeholder="30000"
              onValueChange={(v) => props.set({ salary: v })}
            />
          </label>
          <Text
            label="Pay day"
            value={props.draft.dueDay}
            max={2}
            set={(v) => props.set({ dueDay: v })}
          />
        </div>
      ) : null}
    </>
  );
}
function Text(props: {
  label: string;
  value: string;
  max: number;
  placeholder?: string;
  set: (value: string) => void;
}) {
  return (
    <label className="field-label">
      {props.label}
      <input
        className="field-input"
        value={props.value}
        maxLength={props.max}
        {...(props.placeholder ? { placeholder: props.placeholder } : {})}
        onChange={(event) => props.set(event.target.value)}
      />
    </label>
  );
}
// Same rules as mobile StaffForm; returns a problem message when invalid.
function salaryProblem(draft: Draft, amount: number | undefined) {
  const day = Number(draft.dueDay);
  if (draft.salary.trim() && (!amount || amount <= 0)) return 'Enter the monthly salary in rupees.';
  if (amount && !(day >= 1 && day <= 28)) return 'Salary day must be 1 to 28.';
  return undefined;
}
// Same body shape as mobile StaffForm; returns a problem message when invalid.
export function staffBody(draft: Draft, staff?: StaffMember): Record<string, unknown> | string {
  const { jobTitle } = draft;
  if (!jobTitle) return 'Choose a job title.';
  const amount = draft.salary.trim() ? rupeesToPaisa(draft.salary) : undefined;
  const problem = salaryProblem(draft, amount);
  if (problem) return problem;
  const other = jobTitle === 'other';
  const common = {
    fullName: draft.fullName.trim(),
    jobTitle,
    ...(other ? { customTitle: draft.customTitle.trim() } : {}),
    startsOn: draft.startsOn,
  };
  const phone = draft.phone.trim();
  if (staff)
    return {
      ...common,
      expectedVersion: staff.version,
      phone: phone || null,
      ...(other ? {} : { customTitle: null }),
    };
  const salary = amount
    ? {
        amountPaisa: amount,
        dueDay: Number(draft.dueDay),
        effectiveFrom: draft.startsOn.slice(0, 8) + '01',
      }
    : undefined;
  return { ...common, ...(phone ? { phone } : {}), ...(salary ? { salary } : {}) };
}
