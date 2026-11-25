// Швидке додавання з клітинки календаря (18.11): клік по порожньому місцю тижня (або «Додати подію» в дні на телефоні)
// одразу відкриває поруч компактне вікно «нова подія» (ItemDialog у режимі quick) з назвою й типами.
// Тут — спільні частини: виділена клітинка, підписи типів, рядок дня й години, позиція вікна поруч із клітинкою.
import { useLayoutEffect, useState, type RefObject } from 'react';
import type { ModuleId } from '../types';
import { DAYS_FULL, MONTHS_GEN, fromISO, weekdayIndex } from '../lib/dates';
import { MODULES } from '../types';
import { ICONS } from './Icon';
import type { Anchor } from './EventView';

/** Клітинка, з якої додають подію (18.11, 10:20): виділена, поки відкрито перелік або вікно з полями */
export interface CellSel {
  date: string;
  /** без start — «весь день» */
  start?: string;
  end?: string;
  /** обраний модуль (другий крок) — виділення в його кольорі */
  module?: ModuleId;
}

/** Підписи модулів у переліку «що додати» */
export const QUICK_LABELS: Record<ModuleId, string> = {
  food: 'страва',
  fop: 'нагадування ФОП',
  hobby: 'заняття',
  pet: 'улюбленець',
  other: 'інша подія',
};

/**
 * Що можна створити з клітинки (23.11, форма у два кроки): спершу перелік типів, потім форма обраного типу.
 * «вітання» — день народження (подія «інше», щороку, на весь день, source 'bday'); «задача» — окремий список.
 */
export type QuickType = ModuleId | 'task' | 'bday';

/** Порядок у переліку першого кроку й у випадному списку типу */
export const QUICK_TYPE_ORDER: QuickType[] = ['food', 'hobby', 'pet', 'fop', 'bday', 'task', 'other'];

/** Плитка типу: тло, колір іконки, іконка; «вітання» — сині кольори стікерів днів народження */
export function quickTypeMeta(t: QuickType): { label: string; bg: string; fg: string; icon: string } {
  if (t === 'task') return { label: 'задача', bg: '#e5e5ea', fg: '#1d1d1f', icon: ICONS.tasks };
  if (t === 'bday') return { label: 'вітання', bg: '#1340b8', fg: '#fff8ec', icon: ICONS.gift };
  const m = MODULES[t];
  return { label: QUICK_LABELS[t], bg: m.color, fg: m.text, icon: m.icon };
}

/** «сб, 21 листопада» (інший рік — «сб, 3 січня 2027») */
export function dayLabel(iso: string): string {
  if (!iso) return '';
  const d = fromISO(iso);
  const short = ['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'нд'][weekdayIndex(d)];
  const year = d.getFullYear() !== new Date().getFullYear() ? ` ${d.getFullYear()}` : '';
  return `${short}, ${d.getDate()} ${MONTHS_GEN[d.getMonth()]}${year}`;
}

/** Тривалість між двома «гг:хх»: «1 год», «30 хв», «1 год 30 хв»; порожньо, якщо кінець не пізніше */
export function durLabel(start: string, end: string): string {
  const toM = (v: string) => Number(v.slice(0, 2)) * 60 + Number(v.slice(3, 5));
  if (!start || !end) return '';
  const m = toM(end) - toM(start);
  if (!(m > 0)) return '';
  const h = Math.floor(m / 60), r = m % 60;
  return [h ? `${h} год` : '', r ? `${r} хв` : ''].filter(Boolean).join(' ');
}

/** «ср, 18 листопада · 10:00» або «… · весь день» */
export function slotLine(date: string, start?: string): string {
  if (!date) return '';
  const d = fromISO(date);
  const day = `${DAYS_FULL[weekdayIndex(d)]}, ${d.getDate()} ${MONTHS_GEN[d.getMonth()]}`;
  return start ? `${day} · ${start}` : `${day} · весь день`;
}

/**
 * Позиція вікна поруч із клітинкою: праворуч, а якщо не вміщається — ліворуч; верх — на рівні клітинки,
 * не виходячи за межі екрана (16 від країв). На телефоні — вікно знизу, позиція не потрібна.
 */
export function usePopoverPos(ref: RefObject<HTMLElement | null>, anchor: Anchor | undefined, phone: boolean, width: number, deps: unknown[] = []) {
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  useLayoutEffect(() => {
    if (phone || !ref.current) return;
    const place = () => {
      if (!ref.current) return;
      const h = ref.current.offsetHeight;
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      if (!anchor) return setPos({ left: Math.max(16, (vw - width) / 2), top: Math.max(16, (vh - h) / 2) });
      let left = anchor.right + 8;
      if (left + width > vw - 16) left = anchor.left - 8 - width;
      left = Math.min(Math.max(16, left), vw - width - 16);
      const top = Math.min(Math.max(16, anchor.top), Math.max(16, vh - h - 16));
      setPos({ left, top });
    };
    place();
    // висота вікна змінюється разом із полями (наприклад, «своє нагадування») — підлаштовуємо верх
    const ro = new ResizeObserver(place);
    ro.observe(ref.current);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anchor, phone, width, ...deps]);
  if (phone) return undefined;
  return { left: pos?.left ?? 0, top: pos?.top ?? 0, visibility: pos ? ('visible' as const) : ('hidden' as const) };
}
