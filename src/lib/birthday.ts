// Дні народження (22.11, макет погоджено в чаті): подія «інше» на весь день, щороку, source 'bday' або 'bday:<рік народження>'.
// Старі події «День народження …» (щороку, на весь день) теж показуються стікером. Нового SQL не потрібно.
import type { CalendarItem } from '../types';

const PREFIX = /^день\s+народження\s*/i;

export const isBirthday = (it: CalendarItem) =>
  !!it.source?.startsWith('bday') || (it.allDay && it.repeat?.freq === 'yearly' && PREFIX.test(it.title));

export const bdaySource = (year?: number) => (year ? `bday:${year}` : 'bday');

export function bdayYear(it: CalendarItem): number | undefined {
  const m = it.source?.match(/^bday:(\d{4})$/);
  return m ? Number(m[1]) : undefined;
}

/** Ім'я на стікері: назва події (для старих — без «День народження») */
export function bdayName(it: CalendarItem): string {
  if (it.source?.startsWith('bday')) return it.title;
  const rest = it.title.replace(PREFIX, '').trim();
  return rest ? rest[0].toUpperCase() + rest.slice(1) : it.title;
}

const yearsWord = (n: number) => {
  const a = n % 10, b = n % 100;
  if (a === 1 && b !== 11) return 'рік';
  if (a >= 2 && a <= 4 && (b < 12 || b > 14)) return 'роки';
  return 'років';
};

/** Підпис під ім'ям: «55 років» (якщо відомий рік) або «день народження» */
export function bdaySub(it: CalendarItem, iso: string): string {
  const y = bdayYear(it);
  if (!y) return 'день народження';
  const n = Number(iso.slice(0, 4)) - y;
  return n > 0 ? `${n} ${yearsWord(n)}` : 'день народження';
}

/** Кольори стікера (як у референсі): фон, хвиля, текст. Обираються автоматично за назвою. */
export const BDAY_COLORS = [
  { bg: '#1340B8', line: '#FFF8EC', text: '#FFF8EC' },
  { bg: '#FFF8EC', line: '#1340B8', text: '#1340B8' },
  { bg: '#F7A600', line: '#FFF8EC', text: '#FFF8EC' },
  { bg: '#F7B7B5', line: '#FFF8EC', text: '#1340B8' },
];
export function bdayColor(it: CalendarItem) {
  let h = 0;
  for (const ch of bdayName(it)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return BDAY_COLORS[h % BDAY_COLORS.length];
}
/** Легкий нахил −3…3° за тією ж назвою */
export function bdayTilt(it: CalendarItem) {
  let h = 7;
  for (const ch of it.title) h = (h * 17 + ch.charCodeAt(0)) >>> 0;
  return (h % 7) - 3;
}
