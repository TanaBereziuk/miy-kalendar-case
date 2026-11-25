// Повторювані події (18.11): змінити чи прибрати лише цю подію, цю й наступні або всі — як у Google Календарі.
// Серія — один запис items з repeat; «лише цю» додає дату в repeat.skip і, якщо змінюємо, окрему подію на цю дату;
// «цю й наступні» обриває серію напередодні (repeat.until) і, якщо змінюємо, починає нову серію з цієї дати.
import type { CalendarItem, NewItem, Repeat } from '../types';
import { addDays, fromISO, toISO } from './dates';

export type Scope = 'one' | 'following' | 'all';

export const SCOPE_LABELS: Record<Scope, string> = {
  one: 'лише цю',
  following: 'цю й наступні',
  all: 'усі',
};

/** Зміни в подіях, які треба зробити (застосовує App, щоб їх можна було скасувати). */
export interface SeriesOps {
  update: { id: string; data: NewItem }[];
  add: NewItem[];
  remove: string[];
}

/** Запис без службових полів — те, що зберігаємо в базі */
export function toNew(it: CalendarItem): NewItem {
  const { id: _i, createdAt: _c, updatedAt: _u, seriesId: _s, ...rest } = it;
  return rest;
}

const dayBefore = (iso: string) => toISO(addDays(fromISO(iso), -1));

function withRepeat(item: NewItem, repeat: Repeat | undefined): NewItem {
  return { ...item, repeat };
}

/** Серія закінчується напередодні дати occ; пропуски після кінця вже не потрібні */
function cutBefore(r: Repeat, occ: string): Repeat {
  const until = dayBefore(occ);
  const skip = (r.skip ?? []).filter((d) => d <= until);
  return { ...r, until, skip: skip.length ? skip : undefined };
}

/** Прибрати подію серії на дату occ */
export function deleteOccurrence(series: CalendarItem, occ: string, scope: Scope): SeriesOps {
  const ops: SeriesOps = { update: [], add: [], remove: [] };
  const r = series.repeat;
  if (!r || scope === 'all' || (scope === 'following' && occ <= series.date)) {
    ops.remove.push(series.id);
    return ops;
  }
  if (scope === 'one') {
    const skip = Array.from(new Set([...(r.skip ?? []), occ])).sort();
    ops.update.push({ id: series.id, data: withRepeat(toNew(series), { ...r, skip }) });
    return ops;
  }
  ops.update.push({ id: series.id, data: withRepeat(toNew(series), cutBefore(r, occ)) });
  return ops;
}

/**
 * Змінити подію серії на дату occ. data — нові поля з вікна події (дата в data — дата цієї події або,
 * для «усі», дата початку серії).
 */
export function editOccurrence(series: CalendarItem, occ: string, data: NewItem, scope: Scope): SeriesOps {
  const ops: SeriesOps = { update: [], add: [], remove: [] };
  const r = series.repeat;
  if (!r || scope === 'all' || (scope === 'following' && occ <= series.date)) {
    // усі: пропуски лишаються, якщо правило повтору те саме
    const keepSkip = r && data.repeat && data.repeat.freq === r.freq ? r.skip : undefined;
    const repeat = data.repeat ? { ...data.repeat, skip: keepSkip ?? data.repeat.skip } : undefined;
    ops.update.push({ id: series.id, data: { ...data, repeat } });
    return ops;
  }
  if (scope === 'one') {
    const skip = Array.from(new Set([...(r.skip ?? []), occ])).sort();
    ops.update.push({ id: series.id, data: withRepeat(toNew(series), { ...r, skip }) });
    ops.add.push({ ...data, repeat: undefined });
    return ops;
  }
  // цю й наступні: стара серія — до вчора, нова — з цієї дати з новими полями
  ops.update.push({ id: series.id, data: withRepeat(toNew(series), cutBefore(r, occ)) });
  const laterSkip = (r.skip ?? []).filter((d) => d > occ);
  const repeat = data.repeat
    ? { ...data.repeat, skip: data.repeat.freq === r.freq && laterSkip.length ? laterSkip : undefined }
    : undefined;
  ops.add.push({ ...data, repeat });
  return ops;
}

/** Розбирає id показу повторюваної події: '<серія>|<дата>' */
export function splitOccurrenceId(id: string): { seriesId: string; date: string } | null {
  const i = id.lastIndexOf('|');
  return i > 0 ? { seriesId: id.slice(0, i), date: id.slice(i + 1) } : null;
}
