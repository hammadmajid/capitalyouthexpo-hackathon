import { useEffect, useState } from 'react';
import { Text, TextInput, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { ChefHat, Clock, Eye, EyeOff, Pencil, Plus, X } from 'lucide-react-native';
import { readBranchMenu, updateBranchMenu } from '@hsm/api-client';
import { mobileColors as c, mobileSurfaces } from '@hsm/ui';
import { actorClient } from '../../lib/runtime';
import { safeMessage } from '../../lib/messages';
import { NavIconButton } from '../navigation/header';
import { Skeleton } from '../loading/skeleton';
import { NativeCommandRecovery } from '../services/command-recovery';
import { useNativeCommand } from '../services/use-command';
import { FieldLabel, SetupButton, SetupHeading, SetupText } from '../owner-wizard-ui';
import { DayChips, menuDayNames, menuMeals, todayMenuDay } from './menu-week';
import { MealTimesEditor, timeKey, type Draft } from './meal-times-editor';
import { MenuBoard } from './menu-board';
const examples = {
  breakfast: 'e.g. Eggs and paratha',
  lunch: 'e.g. Dal and rice',
  dinner: 'e.g. Chicken curry and roti',
} as const;
// SERV-001 / CHG-037: the Owner sets the weekly food menu and per-day serving times during
// setup; guests see them with the kitchen and dining photos. Saving replaces the week.
const input = {
  minHeight: 48,
  paddingHorizontal: 14,
  borderRadius: 14,
  borderWidth: 1,
  borderColor: mobileSurfaces.icyCard.borderColor,
  backgroundColor: c.inputSurface,
  color: c.heading,
} as const;
type Time = { dayOfWeek: number; meal: string; startsAt: string; endsAt: string };
// A meal time needs both ends, start before end; returns the problem to show, if any.
export function readTimes(draft: Draft): { times: Time[]; problem?: string } {
  const times: Time[] = [];
  for (let day = 1; day <= 7; day += 1)
    for (const { key, label } of menuMeals) {
      const startsAt = draft[timeKey(day, key, 'from')] ?? '';
      const endsAt = draft[timeKey(day, key, 'to')] ?? '';
      if (!startsAt && !endsAt) continue;
      // Lunch is optional: with no lunch dish that day, its times are not saved or checked.
      if (key === 'lunch' && !draft[day + ':lunch']?.trim()) continue;
      if (!startsAt || !endsAt || startsAt >= endsAt)
        return {
          times,
          problem:
            menuDayNames[day - 1] +
            ' ' +
            label.toLowerCase() +
            ' needs a start time and a later end time.',
        };
      times.push({ dayOfWeek: day, meal: key, startsAt, endsAt });
    }
  return { times };
}
export function OwnerMenuCard({
  actorId,
  branchId,
  onUnsavedChange,
}: {
  actorId: string;
  branchId: string;
  // Hostel Setup holds Continue while menu edits are unsaved, so they are never dropped.
  onUnsavedChange?: (unsaved: boolean) => void;
}) {
  const menu = useQuery({
    queryKey: ['branch-menu', actorId, branchId],
    gcTime: 0,
    retry: false,
    queryFn: async () => readBranchMenu(await actorClient(actorId), branchId),
  });
  const [day, setDay] = useState(todayMenuDay);
  const [draft, setDraft] = useState<Draft>();
  const [problem, setProblem] = useState<string>();
  const [preview, setPreview] = useState(false);
  const [showTimes, setShowTimes] = useState(false);
  const save = useNativeCommand(
    'owner-menu:' + branchId,
    actorId,
    (client, body: Record<string, unknown>, key) => updateBranchMenu(client, branchId, body, key),
    [['branch-menu', actorId, branchId]],
  );
  const saved: Draft = Object.fromEntries([
    ...(menu.data?.items ?? []).map((item) => [item.dayOfWeek + ':' + item.meal, item.description]),
    ...(menu.data?.times ?? []).flatMap((time) => [
      [timeKey(time.dayOfWeek, time.meal, 'from'), time.startsAt],
      [timeKey(time.dayOfWeek, time.meal, 'to'), time.endsAt],
    ]),
  ]);
  const week = draft ?? saved;
  const unsaved = draft !== undefined;
  useEffect(() => onUnsavedChange?.(unsaved), [unsaved, onUnsavedChange]);
  const [editing, setEditing] = useState(false);
  const hasMenu = Boolean(menu.data?.items.length || menu.data?.times?.length);
  const busy = save.isPending || save.unresolved;
  const startEdit = () => {
    setDraft(undefined);
    setProblem(undefined);
    setShowTimes(false);
    setPreview(false);
    setEditing(true);
  };
  const dayName = menuDayNames[day - 1];
  const change = (value: Draft) => {
    setDraft(value);
    setProblem(undefined);
  };
  function submit() {
    if (!menu.data) return;
    const { times, problem: issue } = readTimes(week);
    setProblem(issue);
    if (issue) return;
    save.mutate(
      {
        expectedVersion: menu.data.version,
        times,
        items: Object.entries(week)
          .filter(([key, text]) => !key.startsWith('time:') && text.trim())
          .map(([key, description]) => ({
            dayOfWeek: Number(key.split(':')[0]),
            meal: key.split(':')[1],
            description: description.trim(),
          })),
      },
      {
        onSuccess: () => {
          setDraft(undefined);
          setEditing(false);
          setShowTimes(false);
        },
      },
    );
  }
  const cancel = () => {
    setDraft(undefined);
    setProblem(undefined);
    setEditing(false);
  };
  const PreviewIcon = preview ? EyeOff : Eye;
  return (
    <View className="gap-3">
      <View className="flex-row items-center gap-2">
        <ChefHat color={c.primary} size={21} />
        <View className="flex-1">
          <SetupHeading>Food menu</SetupHeading>
        </View>
        {menu.data ? (
          editing ? (
            <>
              <NavIconButton
                label={showTimes ? 'Hide serving times' : 'Set serving times (optional)'}
                disabled={busy}
                onPress={() => setShowTimes((shown) => !shown)}
              >
                <Clock color={showTimes ? c.primary : c.secondary} size={21} />
              </NavIconButton>
              <NavIconButton label="Cancel menu edit" disabled={busy} onPress={cancel}>
                <X color={c.primary} size={21} />
              </NavIconButton>
            </>
          ) : (
            <>
              {hasMenu ? (
                <NavIconButton
                  label={preview ? 'Hide weekly menu' : 'View weekly menu'}
                  onPress={() => setPreview((shown) => !shown)}
                >
                  <PreviewIcon color={c.primary} size={21} />
                </NavIconButton>
              ) : null}
              <NavIconButton label={hasMenu ? 'Edit menu' : 'Add food menu'} onPress={startEdit}>
                {hasMenu ? (
                  <Pencil color={c.primary} size={20} />
                ) : (
                  <Plus color={c.primary} size={21} />
                )}
              </NavIconButton>
            </>
          )
        ) : null}
      </View>
      {menu.isPending ? <Skeleton kind="inline" label="Loading menu…" /> : null}
      {menu.data && !editing ? (
        preview && hasMenu ? (
          <MenuBoard menu={menu.data} />
        ) : (
          <SetupText muted>{hasMenu ? 'Weekly menu saved' : 'No menu yet'}</SetupText>
        )
      ) : menu.data ? (
        <>
          <DayChips
            wrap
            day={day}
            setDay={setDay}
            filled={(d) => menuMeals.some(({ key }) => Boolean(week[d + ':' + key]?.trim()))}
          />
          <FieldLabel>Meals for {dayName}</FieldLabel>
          <MealTimesEditor
            day={day}
            draft={week}
            change={change}
            disabled={busy}
            showTimes={showTimes}
            renderMeal={({ key, label, Icon }) => (
              <View key={key} className="gap-1">
                <View className="flex-row items-center gap-2">
                  <Icon color={c.primary} size={17} />
                  <Text className="font-heading text-sm text-heading">
                    {key === 'lunch' ? label + ' (optional)' : label}
                  </Text>
                </View>
                <TextInput
                  accessibilityLabel={label}
                  placeholder={examples[key]}
                  placeholderTextColor={c.secondary}
                  value={week[day + ':' + key] ?? ''}
                  onChangeText={(text) => change({ ...week, [day + ':' + key]: text })}
                  maxLength={200}
                  editable={!busy}
                  style={input}
                  className="font-body text-body"
                />
              </View>
            )}
          />
          {problem ? <SetupText alert>{problem}</SetupText> : null}
          {save.isError ? <SetupText alert>{safeMessage(save.error)}</SetupText> : null}
          <NativeCommandRecovery command={save} />
          {draft ? (
            <SetupButton
              label={save.isPending ? 'Saving…' : 'Save menu'}
              disabled={busy}
              onPress={submit}
            />
          ) : null}
        </>
      ) : menu.isError ? (
        <SetupText alert>{safeMessage(menu.error)}</SetupText>
      ) : null}
    </View>
  );
}
