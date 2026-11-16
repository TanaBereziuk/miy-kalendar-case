import type { CalendarItem, Repeat } from '../types';
import { fromISO, toISO, weekdayIndex } from './dates';

const DAY_MS = 86400000;
const dayNum = (d: Date) => Math.round(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / DAY_MS);

/** Чи припадає повторювана подія на дату. */
export function occursOn(item: CalendarItem, date: Date): boolean {
  const r = item.repeat;
  const first = fromISO(item.date);
  const iso = toISO(date);
  if (iso < item.date) return false;
  if (!r) return iso === item.date;
  if (r.until && iso > r.until) return false;
  const n = Math.max(1, r.interval ?? 1);
  const diff = dayNum(date) - dayNum(first);

  switch (r.freq) {
    case 'daily':
      return diff % n === 0;
    case 'weekly': {
      const days = r.days && r.days.length ? r.days : [weekdayIndex(first)];
      if (!days.includes(weekdayIndex(date))) return false;
      const weeks = Math.floor((dayNum(date) - weekdayIndex(date) - (dayNum(first) - weekdayIndex(first))) / 7);
      return weeks % n === 0;
    }
    case 'monthly': {
      const months = (date.getFullYear() - first.getFullYear()) * 12 + date.getMonth() - first.getMonth();
      if (months % n !== 0) return false;
      const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
      return date.getDate() === Math.min(first.getDate(), lastDay);
    }
    case 'yearly':
      return (
        date.getMonth() === first.getMonth() &&
        date.getDate() === first.getDate() &&
        (date.getFullYear() - first.getFullYear()) % n === 0
      );
  }
}

/** Розгортає події на конкретні дні: повторювані дають по одному показу на кожен день. */
export function expandForDays(items: CalendarItem[], days: Date[]): CalendarItem[] {
  const out: CalendarItem[] = [];
  for (const it of items) {
    if (!it.repeat) {
      out.push(it);
      continue;
    }
    for (const d of days) {
      if (occursOn(it, d)) {
        const iso = toISO(d);
        out.push({ ...it, id: `${it.id}|${iso}`, seriesId: it.id, date: iso });
      }
    }
  }
  return out;
}

const DOW_SHORT = ['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'нд'];

/** Людський опис повторення: «щодня», «через день», «пн, ср, пт», «кожні 12 міс». */
export function describeRepeat(r?: Repeat): string {
  if (!r) return 'не повторюється';
  const n = Math.max(1, r.interval ?? 1);
  let s = '';
  if (r.freq === 'daily') s = n === 1 ? 'щодня' : n === 2 ? 'через день' : `кожні ${n} дні`;
  if (r.freq === 'weekly') {
    const days = r.days ?? [];
    const base = days.length === 1 ? `щотижня, ${DOW_SHORT[days[0]]}` : days.length > 1 ? days.map((d) => DOW_SHORT[d]).join(', ') : 'щотижня';
    s = n === 1 ? base : `${base}, раз на ${n} тижні`;
  }
  if (r.freq === 'monthly') s = n === 1 ? 'щомісяця' : `кожні ${n} міс`;
  if (r.freq === 'yearly') s = 'щороку';
  if (r.until) s += `, до ${r.until.split('-').reverse().join('.')}`;
  return s;
}
