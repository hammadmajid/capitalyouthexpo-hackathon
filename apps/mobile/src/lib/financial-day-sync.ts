import { DISPLAY_TIME_ZONE } from '@hsm/contracts';
import type { QueryClient } from '@tanstack/react-query';
const dayFormat = new Intl.DateTimeFormat('en-CA', {
  timeZone: DISPLAY_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});
const timeFormat = new Intl.DateTimeFormat('en-GB', {
  timeZone: DISPLAY_TIME_ZONE,
  hourCycle: 'h23',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});
const dated = new Set([
  'bed-board',
  'bed-detail',
  'rent-board',
  'stay-settlement',
  'private-invoices',
  'branch-dashboard',
  'owner-dashboard',
]);
export function millisecondsUntilFinancialDay(now: Date) {
  const values = Object.fromEntries(
    timeFormat.formatToParts(now).map((part) => [part.type, part.value]),
  );
  const elapsed =
    (Number(values.hour) * 3600 + Number(values.minute) * 60 + Number(values.second)) * 1000 +
    now.getMilliseconds();
  return 86400000 - elapsed + 50;
}
// One daily boundary timer, plus foreground recovery. Server calculations remain authoritative.
export function startFinancialDaySync(
  cache: Pick<QueryClient, 'invalidateQueries'>,
  options: {
    active: () => boolean;
    subscribe: (check: () => void) => () => void;
    now?: () => Date;
  },
) {
  const now = options.now ?? (() => new Date());
  let day = dayFormat.format(now()),
    timer: ReturnType<typeof setTimeout>;
  function check() {
    const current = dayFormat.format(now());
    if (!options.active() || current === day) return;
    day = current;
    void cache.invalidateQueries({ predicate: (query) => dated.has(String(query.queryKey[0])) });
  }
  function schedule() {
    timer = setTimeout(() => {
      check();
      schedule();
    }, millisecondsUntilFinancialDay(now()));
  }
  schedule();
  const unsubscribe = options.subscribe(check);
  return () => {
    clearTimeout(timer);
    unsubscribe();
  };
}
