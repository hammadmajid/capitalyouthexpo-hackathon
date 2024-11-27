import { WorkflowTabs } from './management-ui';
import { useState } from 'react';
import {
  bookingDocumentSchema,
  platformBookingSettingsSchema,
  type BookingPolicy,
} from '@hsm/contracts';
import type { z } from 'zod';
import { AdminField } from './ui';
import { Copy } from '../ui';
import { Choices } from './staff-ui';
import { Text } from 'react-native';
import { ArrowRight, Check, Circle } from 'lucide-react-native';
import { ActionButton, ButtonRow } from './admin-list';
type Input = z.infer<typeof platformBookingSettingsSchema>;
type Flag =
  | 'requestReservesInventory'
  | 'customerSelectsInventory'
  | 'cancellationAllowed'
  | 'allowEvidenceReuse'
  | 'documentReviewRequired';
// BKG-006: the platform defaults every hostel inherits, in plain words and everyday units.
// Times are typed in minutes/hours and stored in seconds exactly as before.
const unit = { seconds: 1, minutes: 60, hours: 3600 } as const;
type Unit = keyof typeof unit;
const policyNumbers: [keyof BookingPolicy, string, Unit][] = [
  ['holdSeconds', 'Hold a bed for (minutes)', 'minutes'],
  ['requestExpirySeconds', 'Request expires after (hours)', 'hours'],
  ['minimumStayDays', 'Shortest stay (days)', 'seconds'],
  ['maximumStayDays', 'Longest stay (days, empty = no limit)', 'seconds'],
  ['minimumAdvanceDays', 'Book at least (days ahead)', 'seconds'],
  ['maximumAdvanceDays', 'Book at most (days ahead)', 'seconds'],
  ['cancellationCutoffHours', 'Cancel up to (hours before)', 'seconds'],
];
const limits: [keyof Input['limits'], string, Unit][] = [
  ['maximumHoldSeconds', 'Longest hold any hostel can set (minutes)', 'minutes'],
  ['maximumActiveHolds', 'Holds one customer can have at once', 'seconds'],
  // Contract field name, not a credential.
  // eslint-disable-next-line no-secrets/no-secrets
  ['maximumRequestExpirySeconds', 'Longest request wait (hours)', 'hours'],
  ['maximumAdvanceDays', 'Furthest booking ahead (days)', 'seconds'],
  ['maximumFiniteStayDays', 'Longest stay any hostel can set (days)', 'seconds'],
];
const flags: [Flag, string][] = [
  ['requestReservesInventory', 'Hold the bed while a request waits'],
  ['customerSelectsInventory', 'Customer picks the exact bed'],
  ['cancellationAllowed', 'Customer can cancel'],
  ['allowEvidenceReuse', 'Reuse documents from earlier bookings'],
  ['documentReviewRequired', 'Staff check documents first'],
];
const documentNames: Record<string, string> = {
  cnic: 'CNIC',
  student_id: 'Student ID',
  admission_proof: 'Admission',
  employment_proof: 'Job proof',
};
const show = (value: unknown, per: Unit) =>
  typeof value === 'number' ? String(value / unit[per]) : '';
export function PolicyForm({
  initial,
  pending,
  onReview,
}: {
  initial?: Input;
  pending: boolean;
  onReview: (input: Input) => void;
}) {
  const [numbers, setNumbers] = useState<Record<string, string>>(() =>
    Object.fromEntries([
      ...policyNumbers.map(([key, , per]) => ['policy:' + key, show(initial?.policy[key], per)]),
      ...limits.map(([key, , per]) => ['limit:' + key, show(initial?.limits[key], per)]),
    ]),
  );
  const [policy, setPolicy] = useState<Partial<BookingPolicy>>(
    initial?.policy ?? { bookingMode: 'request', requiredDocuments: [] },
  );
  const [invalid, setInvalid] = useState(false);
  const set = (next: Partial<BookingPolicy>) => setPolicy({ ...policy, ...next });
  const toggle = <T extends string>(list: T[] | undefined, value: T) =>
    list?.includes(value) ? list.filter((v) => v !== value) : [...(list ?? []), value];
  function review() {
    const fields = Object.fromEntries(
      policyNumbers.map(([key, , per]) => {
        const text = numbers['policy:' + key]?.trim() ?? '';
        if (key === 'maximumStayDays' && (text === '' || text === 'unlimited'))
          return [key, 'unlimited'];
        return [key, parse(text, per)];
      }),
    );
    const bounds = Object.fromEntries(
      limits.map(([key, , per]) => [key, parse(numbers['limit:' + key], per)]),
    );
    const parsed = platformBookingSettingsSchema.safeParse({
      policy: { ...policy, ...fields },
      limits: bounds,
    });
    setInvalid(!parsed.success);
    if (parsed.success) onReview(parsed.data);
  }
  const field = (scope: 'policy' | 'limit', key: string, label: string) => (
    <AdminField
      key={key}
      label={label}
      value={numbers[scope + ':' + key] ?? ''}
      onChange={(v) => setNumbers({ ...numbers, [scope + ':' + key]: v })}
      disabled={pending}
      maxLength={20}
    />
  );
  return (
    <>
      <WorkflowTabs
        sections={[
          {
            title: 'Booking',
            content: (
              <>
                <Choices
                  label="Booking type"
                  values={['request', 'instant']}
                  labels={{ request: 'Request first', instant: 'Instant' }}
                  value={policy.bookingMode ?? 'request'}
                  disabled={pending}
                  onChange={(bookingMode) => set({ bookingMode })}
                />
                {policyNumbers.map(([key, label]) => field('policy', key, label))}
              </>
            ),
          },
          {
            title: 'Rules',
            content: (
              <>
                {flags.map(([key, label]) => (
                  <YesNo
                    key={key}
                    label={label}
                    value={policy[key]}
                    disabled={pending}
                    onChange={(value) => set({ [key]: value })}
                  />
                ))}
                <Text className="font-heading text-sm text-secondary">Book by</Text>
                <ButtonRow>
                  {(['day', 'week', 'month'] as const).map((stay) => (
                    <Tick
                      key={stay}
                      text={stay[0]?.toUpperCase() + stay.slice(1)}
                      on={Boolean(policy.allowedStayUnits?.includes(stay))}
                      disabled={pending}
                      onPress={() =>
                        set({ allowedStayUnits: toggle(policy.allowedStayUnits, stay) })
                      }
                    />
                  ))}
                </ButtonRow>
                <Text className="font-heading text-sm text-secondary">
                  Documents needed (none ticked = no documents)
                </Text>
                <ButtonRow>
                  {bookingDocumentSchema.options.map((doc) => (
                    <Tick
                      key={doc}
                      text={documentNames[doc] ?? doc}
                      on={Boolean(policy.requiredDocuments?.includes(doc))}
                      disabled={pending}
                      onPress={() =>
                        set({ requiredDocuments: toggle(policy.requiredDocuments, doc) })
                      }
                    />
                  ))}
                </ButtonRow>
              </>
            ),
          },
          {
            title: 'Limits',
            content: <>{limits.map(([key, label]) => field('limit', key, label))}</>,
          },
        ]}
      />
      {invalid ? (
        <Copy alert>
          Fill every box with a whole number, answer every Yes/No and pick at least one Book by.
          Limits must be at least the defaults.
        </Copy>
      ) : null}
      <ActionButton
        icon={ArrowRight}
        text="Review"
        label="Review booking policy changes"
        tone="solid"
        disabled={pending}
        onPress={review}
      />
    </>
  );
}
function YesNo(props: {
  label: string;
  value: boolean | undefined;
  disabled: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <>
      <Text className="font-heading text-sm text-heading">{props.label}</Text>
      <ButtonRow>
        {([true, false] as const).map((answer) => (
          <ActionButton
            key={String(answer)}
            icon={props.value === answer ? Check : Circle}
            text={answer ? 'Yes' : 'No'}
            label={props.label + ': ' + (answer ? 'Yes' : 'No')}
            tone={props.value === answer ? 'solid' : 'outline'}
            disabled={props.disabled}
            onPress={() => props.onChange(answer)}
          />
        ))}
      </ButtonRow>
    </>
  );
}
function Tick(props: { text: string; on: boolean; disabled: boolean; onPress: () => void }) {
  return (
    <ActionButton
      icon={props.on ? Check : Circle}
      text={props.text}
      label={props.text + (props.on ? ': selected' : '')}
      tone={props.on ? 'solid' : 'outline'}
      disabled={props.disabled}
      onPress={props.onPress}
    />
  );
}
// Whole numbers in the chosen unit become exact whole seconds (or days/counts).
function parse(value: string | undefined, per: Unit) {
  const text = value?.trim() ?? '';
  if (!/^[0-9]+(\.[0-9]+)?$/.test(text)) return Number.NaN;
  const result = Number(text) * unit[per];
  return Number.isInteger(result) ? result : Number.NaN;
}
