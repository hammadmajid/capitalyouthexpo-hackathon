'use client';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { BranchMenu } from '@hsm/contracts';
import { readBranchMenu, readStayMenu, updateBranchMenu } from '@hsm/api-client';
import { browserClient } from '../../lib/client';
import { errorMessage } from '../../lib/messages';
import { Button } from '../ui/button';
import { useCommand } from './use-command';
import { CommandRecovery } from './command-recovery';
export const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;
export const meals = ['breakfast', 'lunch', 'dinner'] as const;
const mealLabel = { breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner' };
// SERV-001: day-wise menu table; an empty cell is shown as not configured, never invented.
// Older responses may omit meal times (CHG-037).
export function MenuTable({
  menu,
}: {
  menu: Omit<BranchMenu, 'times'> & { times?: BranchMenu['times'] | undefined };
}) {
  if (menu.version === 0 || menu.items.length === 0)
    return <p>The hostel has not published a menu yet.</p>;
  const cell = (day: number, meal: string) =>
    menu.items.find((item) => item.dayOfWeek === day && item.meal === meal)?.description ?? '—';
  return (
    <table aria-label="Weekly menu" className="w-full text-left">
      <thead>
        <tr>
          <th scope="col">Day</th>
          {meals.map((meal) => (
            <th key={meal} scope="col">
              {mealLabel[meal]}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {days.map((day, index) => (
          <tr key={day}>
            <th scope="row">{day}</th>
            {meals.map((meal) => (
              <td key={meal}>{cell(index + 1, meal)}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
export function StayMenu({ actorId, stayId }: { actorId: string; stayId: string }) {
  const menu = useQuery({
    queryKey: ['stay-menu', actorId, stayId],
    gcTime: 0,
    retry: false,
    queryFn: () => readStayMenu(browserClient(), stayId),
  });
  if (menu.isPending) return <p role="status">Loading menu…</p>;
  if (menu.isError) return <p role="alert">{errorMessage(menu.error)}</p>;
  return <MenuTable menu={menu.data} />;
}
// Staff editor: replaces the whole week against the version it loaded (stale edits conflict).
export function MenuEditor({ actorId, branchId }: { actorId: string; branchId: string }) {
  const key = ['branch-menu', actorId, branchId];
  const menu = useQuery({
    queryKey: key,
    gcTime: 0,
    retry: false,
    queryFn: () => readBranchMenu(browserClient(), branchId),
  });
  const [draft, setDraft] = useState<Record<string, string>>();
  const save = useCommand(
    'MenuEditor:save',
    (body: { expectedVersion: number; items: unknown[] }, idempotency) =>
      updateBranchMenu(browserClient(), branchId, body, idempotency),
    [key],
  );
  if (menu.isPending) return <p role="status">Loading menu…</p>;
  if (menu.isError) return <p role="alert">{errorMessage(menu.error)}</p>;
  const current =
    draft ??
    Object.fromEntries(
      menu.data.items.map((item) => [item.dayOfWeek + ':' + item.meal, item.description]),
    );
  return (
    <section aria-label="Menu editor" className="space-y-2">
      <CommandRecovery command={save} />
      <h3 className="font-semibold">Weekly menu (version {menu.data.version})</h3>
      {save.isError ? <p role="alert">{errorMessage(save.error)}</p> : null}
      {save.isSuccess ? <p role="status">Menu saved.</p> : null}
      <div className="grid grid-cols-3 gap-1">
        {days.map((day, index) =>
          meals.map((meal) => {
            const cellKey = index + 1 + ':' + meal;
            return (
              <input
                key={cellKey}
                aria-label={`${day} ${mealLabel[meal]}`}
                className="field-input"
                maxLength={200}
                value={current[cellKey] ?? ''}
                onChange={(event) => setDraft({ ...current, [cellKey]: event.target.value })}
              />
            );
          }),
        )}
      </div>
      <Button
        disabled={save.isPending}
        onClick={() =>
          save.mutate(
            {
              expectedVersion: menu.data.version,
              items: Object.entries(current)
                .filter(([, text]) => text.trim())
                .map(([cellKey, description]) => {
                  const [day, meal] = cellKey.split(':');
                  return { dayOfWeek: Number(day), meal, description: description.trim() };
                }),
            },
            { onSuccess: () => setDraft(undefined) },
          )
        }
      >
        Save menu
      </Button>
    </section>
  );
}
