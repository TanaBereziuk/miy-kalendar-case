export const MONTHS_GEN = [
  'січня', 'лютого', 'березня', 'квітня', 'травня', 'червня',
  'липня', 'серпня', 'вересня', 'жовтня', 'листопада', 'грудня',
];
export const DAYS_SHORT = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Нд'];
export const DAYS_FULL = ['понеділок', 'вівторок', 'середа', 'четвер', 'пʼятниця', 'субота', 'неділя'];

const pad = (n: number) => String(n).padStart(2, '0');

export function toISO(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function fromISO(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

/** Понеділок тижня, в якому лежить дата. */
export function startOfWeek(d: Date): Date {
  const r = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const day = (r.getDay() + 6) % 7; // 0 = понеділок
  return addDays(r, -day);
}

export function weekDays(monday: Date): Date[] {
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
}

/** 0 = понеділок … 6 = неділя */
export function weekdayIndex(d: Date): number {
  return (d.getDay() + 6) % 7;
}

export function sameDay(a: Date, b: Date): boolean {
  return toISO(a) === toISO(b);
}

/** «09—15 листопада 2026» або «30 листопада — 06 грудня 2026» */
export function weekRangeParts(monday: Date): { nums: string; rest: string } {
  const sunday = addDays(monday, 6);
  if (monday.getMonth() === sunday.getMonth()) {
    return {
      nums: `${pad(monday.getDate())}—${pad(sunday.getDate())}`,
      rest: `${MONTHS_GEN[monday.getMonth()]} ${sunday.getFullYear()}`,
    };
  }
  return {
    nums: `${pad(monday.getDate())}—${pad(sunday.getDate())}`,
    rest: `${MONTHS_GEN[monday.getMonth()]} — ${MONTHS_GEN[sunday.getMonth()]} ${sunday.getFullYear()}`,
  };
}

export function toMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

export function fromMinutes(min: number): string {
  const m = Math.max(0, Math.min(24 * 60 - 1, min));
  return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
}
