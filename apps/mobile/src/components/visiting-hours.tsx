import { Skeleton } from './loading/skeleton';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Copy as CopyIcon } from 'lucide-react-native';
import { useQuery } from '@tanstack/react-query';
import { readVisitingHours } from '@hsm/api-client';
import { visitingScheduleSchema, type VisitingWindow } from '@hsm/contracts';
import { mobileColors as c } from '@hsm/ui';
import { actorClient } from '../lib/runtime';
import { safeMessage } from '../lib/messages';
import type { useVisitCommand } from './use-visit-command';
import { formatTime } from './time-field';
import { VisitingDay } from './visiting-day';
import { SetupButton } from './owner-wizard-ui';
import { Button, Copy } from './ui';
type Props = {
  actorId: string;
  branchId: string;
  accessUnavailable: boolean;
  operation: ReturnType<typeof useVisitCommand>;
};
export const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const fullDays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
type Slot = Pick<VisitingWindow, 'opensAt' | 'closesAt'>;
const standard: Slot[] = [{ opensAt: '09:00', closesAt: '17:00' }];
// VISIT-001: one row per weekday, each with its own slots, so every day can differ. The
// server re-validates overlaps. `onContinue` (Hostel Setup) saves unsaved changes first and
// moves on only after the save succeeds, so leaving the step never drops them.
export function VisitingHours({
  actorId,
  branchId,
  accessUnavailable,
  operation,
  onContinue,
}: Props & { onContinue?: () => void }) {
  const query = useQuery({
    queryKey: ['visits', actorId, 'hours', branchId],
    gcTime: 0,
    retry: false,
    enabled: !accessUnavailable,
    queryFn: async () => readVisitingHours(await actorClient(actorId), branchId),
  });
  const { mutation, locked } = operation,
    [draft, setDraft] = useState<VisitingWindow[] | null>(null),
    [baseVersion, setBaseVersion] = useState<string>(),
    [error, setError] = useState('');
  const saved = mutation.isSuccess && operation.kind === 'hours';
  if (accessUnavailable || query.error)
    return (
      <View className="gap-2">
        <Copy alert>
          {accessUnavailable ? 'Current branch access required.' : safeMessage(query.error)}
        </Copy>
      </View>
    );
  if (!query.data) return <Skeleton kind="list" label="Loading visiting hours…" />;
  const windows = draft ?? query.data.windows;
  const editing = draft !== null;
  const byDay = dayNames.map((_, day) =>
    windows
      .filter((window) => window.dayOfWeek === day)
      .map(({ opensAt, closesAt }) => ({ opensAt, closesAt })),
  );
  function update(next: VisitingWindow[]) {
    setBaseVersion((current) => current ?? query.data?.version);
    setDraft(next);
    setError('');
  }
  function setDay(day: number, slots: Slot[]) {
    update([
      ...windows.filter((window) => window.dayOfWeek !== day),
      ...slots.map((slot) => ({ dayOfWeek: day, ...slot })),
    ]);
  }
  // The nearest open day's slots, so switching a day on copies sensible times.
  function template(day: number) {
    for (let step = 1; step < 7; step += 1) {
      const slots = byDay[(day + 7 - step) % 7];
      if (slots?.length) return slots;
    }
    return standard;
  }
  function save(thenContinue: boolean) {
    const sorted = [...windows].sort(
      (a, b) => a.dayOfWeek - b.dayOfWeek || a.opensAt.localeCompare(b.opensAt),
    );
    const parsed = visitingScheduleSchema.safeParse(sorted);
    if (!parsed.success || !query.data) {
      setError(
        'Check the times: each slot ends after it starts and slots on a day cannot overlap.',
      );
      return;
    }
    setError('');
    // Only this save's own success clears the edits (an older success, or a background
    // refresh of the setup screen, must never drop unsaved changes).
    mutation.mutate(
      {
        kind: 'hours',
        branchId,
        body: { expectedVersion: baseVersion ?? query.data.version, windows: parsed.data },
      },
      {
        onSuccess: () => {
          setDraft(null);
          setBaseVersion(undefined);
          if (thenContinue) onContinue?.();
        },
      },
    );
  }
  const first = byDay.find((slots) => slots.length);
  return (
    <View className="gap-3">
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <View style={{ flex: 1 }} />
        {first ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Use the first open day's times for every day"
            disabled={locked}
            onPress={() =>
              update(
                dayNames.flatMap((_, day) => first.map((slot) => ({ dayOfWeek: day, ...slot }))),
              )
            }
            style={{ flexDirection: 'row', alignItems: 'center', gap: 6, padding: 6 }}
          >
            <CopyIcon color={c.primary} size={20} />
            <Text style={{ color: c.primary, fontWeight: '700' }}>Same every day</Text>
          </Pressable>
        ) : null}
      </View>
      {first ? null : <Copy>Closed every day · switch on the days visitors can come</Copy>}
      {dayNames.map((_, day) => (
        <VisitingDay
          key={day}
          name={fullDays[day] ?? ''}
          slots={byDay[day] ?? []}
          template={template(day)}
          disabled={locked}
          onChange={(slots) => setDay(day, slots)}
        />
      ))}
      {error || (operation.kind === 'hours' && mutation.error) ? (
        <Copy alert>{error || safeMessage(mutation.error)}</Copy>
      ) : null}
      {saved && !editing && !onContinue ? <Copy>Saved</Copy> : null}
      {onContinue ? (
        <SetupButton
          label={mutation.isPending ? 'Saving…' : 'Save & Continue'}
          disabled={locked}
          onPress={() => (editing ? save(true) : onContinue())}
        />
      ) : editing ? (
        <>
          <Button disabled={locked} label="Save visiting hours" onPress={() => save(false)} />
          <Button
            secondary
            disabled={locked}
            label="Discard changes"
            onPress={() => {
              setDraft(null);
              setBaseVersion(undefined);
              setError('');
            }}
          />
        </>
      ) : null}
      {locked && !mutation.isPending && operation.kind === 'hours' ? (
        <Button label="Retry saving hours" onPress={() => mutation.mutate(undefined)} />
      ) : null}
    </View>
  );
}
// Lists a day's windows as "4:00 PM – 7:00 PM" for customers.
export function windowLabel(window: VisitingWindow) {
  return formatTime(window.opensAt) + ' – ' + formatTime(window.closesAt);
}
