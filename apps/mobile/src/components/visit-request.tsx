import { Skeleton } from './loading/skeleton';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { CalendarCheck } from 'lucide-react-native';
import { useQuery } from '@tanstack/react-query';
import { calendarDateSchema, visitStartIsWithinHours, type VisitingWindow } from '@hsm/contracts';
import { readVisitSlots, visitStartFromLocal } from '@hsm/api-client';
import { mobileColors as c, mobileOwnerColors, mobileSurfaces } from '@hsm/ui';
import { client } from '../lib/runtime';
import { safeMessage } from '../lib/messages';
import { useVisitCommand } from './use-visit-command';
import { DateField } from './date-field';
import { formatTime } from './time-field';
import { Button, Copy } from './ui';
export function VisitRequest({
  branchId,
  slug,
  actorId,
  signIn,
}: {
  branchId: string;
  slug: string;
  actorId?: string;
  signIn: () => void;
}) {
  if (!actorId) return <Button secondary label="Sign in to request a visit" onPress={signIn} />;
  return (
    <Request key={actorId + ':' + branchId} actorId={actorId} branchId={branchId} slug={slug} />
  );
}
// VISIT-001: half-hour start times inside the day's visiting hours that are still in the future.
export function visitTimes(date: string, windows: VisitingWindow[], now = Date.now()) {
  const times: string[] = [];
  for (const window of windows) {
    const [openHour = 0, openMinute = 0] = window.opensAt.split(':').map(Number);
    const [closeHour = 0, closeMinute = 0] = window.closesAt.split(':').map(Number);
    for (let at = openHour * 60 + openMinute; at < closeHour * 60 + closeMinute; at += 30) {
      const time =
        String(Math.floor(at / 60)).padStart(2, '0') + ':' + String(at % 60).padStart(2, '0');
      try {
        if (Date.parse(visitStartFromLocal(date, time)) > now) times.push(time);
      } catch {
        // Skip a malformed window; the server remains the authority.
      }
    }
  }
  return [...new Set(times)].sort();
}
function Request({ actorId, branchId, slug }: { actorId: string; branchId: string; slug: string }) {
  const [date, setDate] = useState(''),
    [time, setTime] = useState(''),
    [error, setError] = useState('');
  const { mutation, locked } = useVisitCommand(actorId);
  const slots = useQuery({
    queryKey: ['visit-slots', slug, date],
    enabled: calendarDateSchema.safeParse(date).success,
    retry: false,
    queryFn: () => readVisitSlots(client, slug, date),
  });
  const ready = Boolean(slots.data && !slots.error && !slots.isFetching);
  const times = ready && slots.data ? visitTimes(date, slots.data.windows) : [];
  function request() {
    try {
      const requestedStart = visitStartFromLocal(date, time);
      if (
        !slots.data ||
        slots.data.branchId !== branchId ||
        !visitStartIsWithinHours(requestedStart, slots.data.windows)
      ) {
        setError('Choose one of the times shown.');
        return;
      }
      setError('');
      mutation.mutate({ kind: 'request', body: { branchId, requestedStart } });
    } catch {
      setError('Choose a date and a time.');
    }
  }
  return (
    <View
      style={mobileSurfaces.icyCard}
      className="gap-3 rounded-card border border-cardBorder p-4 frosted-card"
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <CalendarCheck color={c.primary} size={22} />
        <Text style={{ flex: 1, color: c.heading, fontSize: 17, fontWeight: '700' }}>
          Visit this hostel
        </Text>
      </View>
      <Text style={{ color: c.secondary, fontSize: 13 }}>
        Pick a day and time. The hostel will confirm.
      </Text>
      <DateField
        label="Visit date"
        value={date}
        disabled={locked || mutation.isSuccess}
        onChange={(value) => {
          setDate(value);
          setTime('');
          mutation.reset();
        }}
      />
      {calendarDateSchema.safeParse(date).success && slots.isFetching ? (
        <Skeleton kind="list" label="Loading visiting hours…" />
      ) : null}
      {slots.error ? (
        <>
          <Copy alert>{safeMessage(slots.error)}</Copy>
        </>
      ) : null}
      {ready && slots.data ? (
        slots.data.branchId !== branchId ? (
          <Copy alert>Hostel details changed. Pull down before requesting a visit.</Copy>
        ) : times.length ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {times.map((value) => {
              const on = value === time;
              return (
                <Pressable
                  key={value}
                  accessibilityRole="button"
                  accessibilityLabel={'Visit time ' + formatTime(value)}
                  accessibilityState={{ selected: on, disabled: locked || mutation.isSuccess }}
                  disabled={locked || mutation.isSuccess}
                  onPress={() => {
                    setTime(value);
                    mutation.reset();
                  }}
                  style={{
                    paddingHorizontal: 12,
                    paddingVertical: 8,
                    borderRadius: 999,
                    borderWidth: 1,
                    borderColor: on ? c.primary : c.border,
                    backgroundColor: on ? c.primary : 'transparent',
                  }}
                >
                  <Text
                    style={{ color: on ? mobileOwnerColors.onPrimary : c.text, fontWeight: '600' }}
                  >
                    {formatTime(value)}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        ) : (
          <Copy>No visiting times left on this day. Try another day.</Copy>
        )
      ) : null}
      {mutation.isSuccess ? (
        <Copy>Visit requested. Track it in My visits.</Copy>
      ) : (
        <Button
          disabled={locked || !time || !ready || slots.data?.branchId !== branchId}
          label={mutation.isPending ? 'Sending…' : 'Send visit request'}
          onPress={request}
        />
      )}
      {error || mutation.error ? <Copy alert>{error || safeMessage(mutation.error)}</Copy> : null}
      {locked && !mutation.isPending ? (
        <Button label="Retry original visit request" onPress={() => mutation.mutate(undefined)} />
      ) : null}
    </View>
  );
}
