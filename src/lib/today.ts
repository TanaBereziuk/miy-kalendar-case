// Етап 2 плану (21.11): «сьогодні» — дедлайни ФОП і процедури улюбленця на сьогодні й прострочені (ще не «Зроблено»),
// задачі з днем на сьогодні й прострочені. «Зроблено» зберігається в профілі (settings.done) — без нового SQL.
import type { CalendarItem, Task } from '../types';
import type { DoneEntry } from '../onboarding/answers';
import { addDays, fromISO, toISO } from './dates';
import { expandForDays, occursOn } from './repeat';
import { isVisibleTask } from './tasks';

/** Скільки днів назад шукати прострочене */
export const OVERDUE_DAYS = 7;

export const doneKey = (item: CalendarItem) => `${item.seriesId ?? item.id}@${item.date}`;
export const canBeDone = (item: CalendarItem) => (item.module === 'fop' || item.module === 'pet') && !item.undated;

export interface TodayEvent {
  item: CalendarItem;
  overdue: boolean;
}

/** Події ФОП і улюбленця: сьогоднішні та прострочені (з кожної повторюваної — лише останній пропущений показ). */
export function todayEvents(items: CalendarItem[], done: DoneEntry[], today = new Date()): TodayEvent[] {
  const iso = toISO(today);
  const days = Array.from({ length: OVERDUE_DAYS + 1 }, (_, i) => addDays(today, -OVERDUE_DAYS + i));
  const from = toISO(days[0]);
  const keys = new Set(done.map((d) => d.key));
  const occ = expandForDays(items.filter(canBeDone), days).filter((o) => o.date >= from && o.date <= iso && !keys.has(doneKey(o)));
  const latestMissed = new Map<string, CalendarItem>();
  const todays: CalendarItem[] = [];
  for (const o of occ) {
    if (o.date === iso) todays.push(o);
    else {
      const k = o.seriesId ?? o.id;
      const prev = latestMissed.get(k);
      if (!prev || prev.date < o.date) latestMissed.set(k, o);
    }
  }
  // повторювана, у якої є сьогоднішній показ, у простроченому не дублюється
  const todaySeries = new Set(todays.map((o) => o.seriesId ?? o.id));
  const overdue = [...latestMissed.values()].filter((o) => !todaySeries.has(o.seriesId ?? o.id));
  const byTime = (a: CalendarItem, b: CalendarItem) =>
    a.date.localeCompare(b.date) || (a.allDay ? '' : a.start ?? '').localeCompare(b.allDay ? '' : b.start ?? '');
  return [
    ...overdue.sort(byTime).map((item) => ({ item, overdue: true })),
    ...todays.sort(byTime).map((item) => ({ item, overdue: false })),
  ];
}

/** День задачі: свій або день підвʼязаної події */
export function taskDayOf(t: Task, items: CalendarItem[]): string | undefined {
  if (t.due) return t.due;
  if (t.itemId) {
    const base = items.find((i) => i.id === t.itemId);
    if (base && !base.undated) return t.itemDate ?? base.date;
  }
  return undefined;
}

/** Задачі на сьогодні й прострочені (виконані сьогодні — теж, перекреслені до кінця дня) */
export function todayTasks(tasks: Task[], items: CalendarItem[], today = new Date()) {
  const iso = toISO(today);
  return tasks
    .filter((t) => isVisibleTask(t, iso))
    .map((t) => ({ task: t, day: taskDayOf(t, items) }))
    .filter((x) => x.day && x.day <= iso)
    .map((x) => ({ ...x, overdue: x.day! < iso && !x.task.doneAt }));
}

/** Наступний показ після дати (для підказки «наступне — …»); до 2 років уперед */
export function nextAfter(item: CalendarItem, date: string): string | undefined {
  if (!item.repeat) return undefined;
  let d = addDays(fromISO(date), 1);
  for (let i = 0; i < 732; i++, d = addDays(d, 1)) if (occursOn(item, d)) return toISO(d);
  return undefined;
}
