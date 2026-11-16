// Асистент (16.11): історія розмови, виконання плану (додати / прибрати події) і скасування.
import { useCallback, useState } from 'react';
import type { CalendarItem, ModuleId, NewItem } from '../types';
import { DAYS_SHORT, MONTHS_GEN, fromISO, toISO, weekdayIndex } from '../lib/dates';
import { describeRepeat, occursOn } from '../lib/repeat';
import { parsePhrase, type ParseCtx, type RemoveQuery } from './parse';

export interface Shown {
  title: string;
  module: ModuleId;
  when: string;
}

interface Undo {
  added: string[];
  removed: CalendarItem[];
  updated: { id: string; before: NewItem }[];
}

export type Msg =
  | { id: number; role: 'user'; text: string }
  | { id: number; role: 'bot'; text: string; shown?: Shown[]; undo?: Undo; undone?: boolean };

export interface AssistantCtx {
  date?: string;
  start?: string;
}

interface Store {
  items: CalendarItem[];
  add: (d: NewItem, id?: string) => string;
  update: (id: string, d: NewItem) => void;
  remove: (id: string) => void;
}

/** «пн, 17 листопада» */
export function dayLabel(iso: string): string {
  const d = fromISO(iso);
  return `${DAYS_SHORT[weekdayIndex(d)].toLowerCase()}, ${d.getDate()} ${MONTHS_GEN[d.getMonth()]}`;
}

function when(i: NewItem): string {
  const time = i.allDay ? 'весь день' : i.end ? `${i.start}–${i.end}` : i.start ?? '';
  if (!i.repeat) return `${dayLabel(i.date)} · ${time}`;
  return `${describeRepeat(i.repeat)} · ${time} · з ${dayLabel(i.date).split(', ')[1]}`;
}

const strip = (it: CalendarItem): NewItem => {
  const { id: _i, createdAt: _c, updatedAt: _u, seriesId: _s, ...rest } = it;
  return rest;
};

const stem = (w: string) => (w.length > 4 ? w.slice(0, w.length - 2) : w.slice(0, 3));

let seq = 0;

export function useAssistant(store: Store, base: Omit<ParseCtx, 'today' | 'date' | 'start'>) {
  const [messages, setMessages] = useState<Msg[]>([]);

  const findForRemove = (q: RemoveQuery): CalendarItem[] => {
    const today = toISO(new Date());
    const stems = q.words.map((w) => stem(w.toLowerCase()));
    return store.items.filter((it) => {
      const t = it.title.toLowerCase();
      if (!stems.every((s) => t.includes(s))) return false;
      if (q.dates.length) return q.dates.some((d) => (it.repeat ? occursOn(it, fromISO(d)) : it.date === d));
      if (it.repeat) return !it.repeat.until || it.repeat.until >= today;
      return it.date >= today;
    });
  };

  /** Обробляє фразу; повертає першу дату доданих подій, щоб показати її в календарі. */
  const send = useCallback(
    (text: string, ctx: AssistantCtx): string | undefined => {
      const trimmed = text.trim();
      if (!trimmed) return;
      const user: Msg = { id: ++seq, role: 'user', text: trimmed };
      const plans = parsePhrase(trimmed, { ...base, today: new Date(), ...ctx });
      const undo: Undo = { added: [], removed: [], updated: [] };
      const added: Shown[] = [];
      const removed: Shown[] = [];
      let unknown = false;
      let notFound = false;
      let reveal: string | undefined;

      for (const plan of plans) {
        if (plan.kind === 'unknown') {
          unknown = true;
          continue;
        }
        if (plan.kind === 'add') {
          for (const it of plan.items) {
            undo.added.push(store.add(it));
            added.push({ title: it.title, module: it.module, when: when(it) });
            reveal = reveal ?? it.date;
          }
          continue;
        }
        const found = findForRemove(plan.query);
        if (!found.length) {
          notFound = true;
          continue;
        }
        for (const it of found) {
          // у щотижневій серії з кількома днями прибираємо лише названі дні
          const r = it.repeat;
          if (r?.freq === 'weekly' && plan.query.weekdays.length && (r.days?.length ?? 0) > 1) {
            const days = (r.days ?? []).filter((d) => !plan.query.weekdays.includes(d));
            if (days.length) {
              const before = strip(it);
              const next = { ...before, repeat: { ...r, days } };
              store.update(it.id, next);
              undo.updated.push({ id: it.id, before });
              removed.push({ title: it.title, module: it.module, when: `лишилося: ${describeRepeat(next.repeat)}` });
              continue;
            }
          }
          store.remove(it.id);
          undo.removed.push(it);
          removed.push({ title: it.title, module: it.module, when: when(it) });
        }
      }

      const lines: string[] = [];
      if (added.length) lines.push(added.length === 1 ? 'Додано в календар:' : `Додано в календар (${added.length}):`);
      if (removed.length) lines.push('Прибрано з календаря:');
      if (notFound) lines.push('Не знайдено таких подій. Перевірте назву або день.');
      if (unknown && !added.length && !removed.length)
        lines.push('Не вдалося зрозуміти, що саме запланувати. Напишіть назву, день і час, наприклад: «танці в пн і ср з 18 до 20».');
      else if (unknown) lines.push('Частину фрази не вдалося розібрати.');

      const touched = undo.added.length + undo.removed.length + undo.updated.length > 0;
      const bot: Msg = {
        id: ++seq,
        role: 'bot',
        text: lines.join(' '),
        shown: [...added, ...removed],
        undo: touched ? undo : undefined,
      };
      setMessages((m) => [...m, user, bot]);
      return reveal;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [store.items, store.add, store.update, store.remove, base.dishes, base.petNames],
  );

  const undo = useCallback(
    (id: number) => {
      const m = messages.find((x) => x.id === id);
      if (!m || m.role !== 'bot' || !m.undo || m.undone) return;
      m.undo.added.forEach((x) => store.remove(x));
      m.undo.removed.forEach((it) => store.add(strip(it), it.id));
      m.undo.updated.forEach((u) => store.update(u.id, u.before));
      setMessages((list) => list.map((x) => (x.id === id ? { ...x, undone: true } : x)));
    },
    [messages, store.add, store.update, store.remove],
  );

  return { messages, send, undo };
}
