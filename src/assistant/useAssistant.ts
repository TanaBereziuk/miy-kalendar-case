// Асистент (16.11): історія розмови, виконання плану (додати / прибрати події) і скасування.
import { useCallback, useRef, useState } from 'react';
import type { CalendarItem, ModuleId, NewItem, NewTask } from '../types';
import { DAYS_SHORT, MONTHS_GEN, addDays, fromISO, toISO, weekdayIndex } from '../lib/dates';
import { describeRepeat, occursOn } from '../lib/repeat';
import { parsePhrase, type ParseCtx, type Plan, type RemoveQuery } from './parse';
import { askAssistant, type AiTask } from './ai';

export interface Shown {
  title: string;
  module: ModuleId;
  when: string;
  /** задача, а не подія (етап 1, 18.11) */
  task?: boolean;
}

interface Undo {
  /** id доданих задач */
  tasks?: string[];
  added: string[];
  removed: CalendarItem[];
  updated: { id: string; before: NewItem }[];
}

export type Msg =
  | { id: number; role: 'user'; text: string }
  | { id: number; role: 'bot'; text: string; shown?: Shown[]; undo?: Undo; undone?: boolean; pending?: boolean; options?: string[] };

type BotMsg = Extract<Msg, { role: 'bot' }>;

export interface AssistantCtx {
  date?: string;
  start?: string;
}

interface Store {
  items: CalendarItem[];
  add: (d: NewItem, id?: string) => string;
  update: (id: string, d: NewItem) => void;
  remove: (id: string) => void;
  /** задачі (етап 1, 18.11): «додай задачу …»; немає — асистент задач не додає */
  addTask?: (t: NewTask) => string;
  removeTask?: (id: string) => void;
}

/** «додай задачу …», «задача: …», «нова задача …» */
const TASK_RE = /^\s*(?:додай(?:те)?\s+|додати\s+|нова\s+|запиши\s+)?задач[уаі]\s*[:—–-]?\s*(.+)$/i;

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

/** Чи подія з часом сьогодні вже закінчилась. */
function passedToday(it: CalendarItem): boolean {
  if (it.allDay || !it.end) return false;
  const now = new Date();
  const hm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  return it.end <= hm;
}

/** Найближчий майбутній показ серед знайдених подій (для «лише найближчу»). */
function nearest(found: CalendarItem[]): { it: CalendarItem; date: string } | undefined {
  const today = new Date();
  let best: { it: CalendarItem; date: string } | undefined;
  for (const it of found) {
    let date: string | undefined;
    // сьогоднішній показ, що вже закінчився, — уже минуле
    for (let i = passedToday(it) ? 1 : 0; i < 400 && !date; i++) {
      const d = addDays(today, i);
      if (it.repeat ? occursOn(it, d) : it.date === toISO(d)) date = toISO(d);
    }
    if (date && (!best || date < best.date)) best = { it, date };
  }
  return best;
}

const stem = (w: string) => (w.length > 4 ? w.slice(0, w.length - 2) : w.slice(0, 3));

/** Слова з запиту на прибирання є в назві: збіг за основою слова, але не довшого слова («йогу» ≠ «Йогурт»). */
function titleMatches(title: string, words: string[]): boolean {
  const t = title.toLowerCase();
  const tw = t.split(/[^а-яіїєґʼa-z0-9]+/).filter(Boolean);
  const qs = words.flatMap((w) => w.toLowerCase().split(/\s+/)).filter((w) => w.length >= 3);
  if (!qs.length) return false;
  return qs.every((q) => {
    const s = stem(q);
    return tw.some((x) => x === q || (x.startsWith(s) && x.length <= q.length + 1));
  });
}

const nowHM = () => {
  const n = new Date();
  return `${String(n.getHours()).padStart(2, '0')}:${String(n.getMinutes()).padStart(2, '0')}`;
};

/** Та сама подія вже є: назва, день, час і повтор збігаються (26.11) — не додаємо вдруге. */
const sameItem = (a: NewItem, b: NewItem) =>
  a.title.trim().toLowerCase() === b.title.trim().toLowerCase() &&
  a.date === b.date &&
  !!a.allDay === !!b.allDay &&
  (a.allDay || a.start === b.start) &&
  (a.repeat?.freq ?? '') === (b.repeat?.freq ?? '');

/** «скасуй», «відміни останнє», «поверни як було» — кнопка «Скасувати» під останньою відповіддю (26.11) */
const UNDO_RE = /^\s*(?:скасуй(?:те)?|скасувати|відміни(?:ть)?|відмінити|поверни(?:ть)? як було|верни як було)(?:\s+(?:це|останнє|останню зміну|що додано|щойно додане))?[\s.!]*$/i;

let seq = 0;

export function useAssistant(store: Store, base: Omit<ParseCtx, 'today' | 'date' | 'start'>) {
  const [messages, setMessages] = useState<Msg[]>([]);
  // актуальні повідомлення для історії (send не залежить від messages)
  const msgRef = useRef<Msg[]>(messages);
  msgRef.current = messages;
  // питання, які ще треба поставити (26.11): одне питання за раз, решта — у наступних відповідях
  const pendingRef = useRef<{ text: string; options: string[] }[]>([]);

  const findForRemove = (q: RemoveQuery, skip: Set<string>): CalendarItem[] => {
    const today = toISO(new Date());
    // лише майбутні: сьогоднішня подія, що вже закінчилась, — минуле (26.11)
    const upcoming = (it: CalendarItem, d: string) => d > today || (d === today && !passedToday(it));
    return store.items.filter((it) => {
      if (skip.has(it.id) || !titleMatches(it.title, q.words)) return false;
      if (q.dates.length) return q.dates.some((d) => upcoming(it, d) && (it.repeat ? occursOn(it, fromISO(d)) : it.date === d));
      if (it.repeat) return !it.repeat.until || it.repeat.until >= today;
      return upcoming(it, it.date);
    });
  };

  /** Скасовує зміни однієї відповіді асистента. */
  const undoMsg = (m: BotMsg) => {
    if (!m.undo || m.undone) return [] as string[];
    m.undo.tasks?.forEach((x) => store.removeTask?.(x));
    m.undo.added.forEach((x) => store.remove(x));
    m.undo.removed.forEach((it) => store.add(strip(it), it.id));
    m.undo.updated.forEach((u) => store.update(u.id, u.before));
    setMessages((list) => list.map((x) => (x.id === m.id ? { ...x, undone: true } : x)));
    return m.undo.added;
  };

  /** Події з from до to (до 14 днів) — для «що в мене завтра?» (26.11). */
  const listShown = (from: string, to: string): Shown[] => {
    const out: (Shown & { key: string })[] = [];
    const single = from === to;
    for (let d = fromISO(from), i = 0; toISO(d) <= to && i < 14; d = addDays(d, 1), i++) {
      const iso = toISO(d);
      for (const it of store.items) {
        if (it.undated) continue;
        if (!(it.repeat ? occursOn(it, d) : it.date === iso)) continue;
        const time = it.allDay ? 'весь день' : it.end ? `${it.start}–${it.end}` : it.start ?? '';
        out.push({ title: it.title, module: it.module, when: single ? time : `${dayLabel(iso)} · ${time}`, key: iso + (it.allDay ? '' : it.start ?? '') });
      }
    }
    return out.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0)).map(({ key: _k, ...x }) => x);
  };

  /** Виконує план: додає й прибирає події, додає задачі; повертає відповідь і першу дату доданого. */
  const execute = (plans: Plan[], tasks: AiTask[], id: number, skip: Set<string> = new Set()): { bot: BotMsg; reveal?: string } => {
    const undo: Undo = { added: [], removed: [], updated: [] };
    const added: Shown[] = [];
    const removed: Shown[] = [];
    const listed: Shown[] = [];
    const dups: string[] = [];
    const says: string[] = [];
    const replies: string[] = [];
    const lists: string[] = [];
    const addedNow: NewItem[] = [];
    const allTasks: AiTask[] = [...tasks];
    let unknown = false;
    let badDate = false;
    let notFound = false;
    let reveal: string | undefined;
    let ask: { text: string; options: string[] } | undefined;

    const addItem = (it: NewItem) => {
      if (store.items.some((x) => !skip.has(x.id) && sameItem(it, x)) || addedNow.some((x) => sameItem(it, x))) {
        dups.push(`«${it.title}», ${it.allDay ? dayLabel(it.date) : `${dayLabel(it.date)}, ${it.start}`}`);
        return;
      }
      addedNow.push(it);
      undo.added.push(store.add(it));
      added.push({ title: it.title, module: it.module, when: when(it) });
      reveal = reveal ?? it.date;
    };

    for (const plan of plans) {
      if (plan.kind === 'unknown') {
        if (plan.reason === 'bad-date') badDate = true;
        else unknown = true;
        continue;
      }
      if (plan.kind === 'reply') {
        replies.push(plan.text);
        continue;
      }
      if (plan.kind === 'task') {
        if (store.addTask) allTasks.push({ title: plan.title, due: plan.due });
        else addItem(plan.item);
        continue;
      }
      if (plan.kind === 'list') {
        const shown = listShown(plan.from, plan.to);
        const range = plan.from === plan.to ? dayLabel(plan.from) : `${dayLabel(plan.from)} – ${dayLabel(plan.to)}`;
        lists.push(shown.length ? `Заплановано на ${range}:` : `На ${range} нічого не заплановано.`);
        listed.push(...shown);
        continue;
      }
      if (plan.kind === 'add') {
        for (const it of plan.items) addItem(it);
        if (plan.say) says.push(plan.say);
        continue;
      }
      const q = plan.query;
      const found = findForRemove(q, skip);
      if (!found.length) {
        notFound = true;
        continue;
      }
      // кілька збігів чи повторювана подія без названого дня — спершу спитати (25.11, правила асистента)
      if (!q.dates.length && !q.weekdays.length && q.scope !== 'all') {
        const near = nearest(found);
        if (q.scope === 'next' && near) {
          const { it, date } = near;
          const before = strip(it);
          if (it.repeat) {
            store.update(it.id, { ...before, repeat: { ...it.repeat, skip: [...(it.repeat.skip ?? []), date] } });
            undo.updated.push({ id: it.id, before });
          } else {
            store.remove(it.id);
            undo.removed.push(it);
          }
          removed.push({ title: it.title, module: it.module, when: when({ ...before, date, repeat: undefined }) });
          continue;
        }
        if (near && (found.length > 1 || found.some((x) => x.repeat))) {
          if (!ask) {
            const name = found.length === 1 ? found[0].title : q.words.join(' ');
            ask = {
              text:
                found.length === 1
                  ? `«${name}» повторюється. Прибрати всі майбутні чи лише найближчу, ${dayLabel(near.date)}?`
                  : `Знайдено подій «${name}»: ${found.length}. Прибрати всі майбутні чи лише найближчу, ${dayLabel(near.date)}?`,
              options: ['Усі майбутні', 'Лише найближчу'],
            };
          }
          continue;
        }
      }
      const today = toISO(new Date());
      for (const it of found) {
        const r = it.repeat;
        // повторювана, і названо дати — прибрати лише ці дні з серії («прибери танці в середу» — одна середа)
        if (r && q.dates.length && !q.weekdays.length) {
          const before = strip(it);
          const days = q.dates.filter((d) => occursOn(it, fromISO(d)) && !(r.skip ?? []).includes(d));
          store.update(it.id, { ...before, repeat: { ...r, skip: [...(r.skip ?? []), ...days] } });
          undo.updated.push({ id: it.id, before });
          for (const d of days) removed.push({ title: it.title, module: it.module, when: when({ ...before, date: d, repeat: undefined }) });
          continue;
        }
        // «прибери танці по середах» — день прибирається з розкладу; минулі покази лишаються (26.11)
        if (r?.freq === 'weekly' && q.weekdays.length && (r.days?.length ?? 0) > 1) {
          const days = (r.days ?? []).filter((d) => !q.weekdays.includes(d));
          if (days.length) {
            const before = strip(it);
            const nextRepeat = { ...r, days };
            if (it.date < today) {
              // стара серія закінчується вчора, з сьогодні — нова без цього дня
              const keepToday = occursOn(it, new Date()) && passedToday(it);
              const cut = keepToday ? today : toISO(addDays(new Date(), -1));
              store.update(it.id, { ...before, repeat: { ...r, until: cut } });
              undo.updated.push({ id: it.id, before });
              const first = toISO(addDays(fromISO(cut), 1));
              const skipLeft = (r.skip ?? []).filter((d) => d >= first);
              const { skip: _old, ...rest } = nextRepeat;
              undo.added.push(store.add({ ...before, date: first, repeat: skipLeft.length ? { ...rest, skip: skipLeft } : rest }));
            } else {
              store.update(it.id, { ...before, repeat: nextRepeat });
              undo.updated.push({ id: it.id, before });
            }
            removed.push({ title: it.title, module: it.module, when: `лишилося: ${describeRepeat(nextRepeat)}` });
            continue;
          }
        }
        // повторювана, що почалася в минулому, — минулі покази лишаються, серія закінчується вчора
        if (r && it.date < today) {
          const before = strip(it);
          // сьогоднішній показ, що вже закінчився, теж лишається
          const keepToday = occursOn(it, new Date()) && passedToday(it);
          store.update(it.id, { ...before, repeat: { ...r, until: keepToday ? today : toISO(addDays(new Date(), -1)) } });
          undo.updated.push({ id: it.id, before });
          removed.push({ title: it.title, module: it.module, when: `${describeRepeat(r)} · з ${dayLabel(today).split(', ')[1]}` });
          continue;
        }
        store.remove(it.id);
        undo.removed.push(it);
        removed.push({ title: it.title, module: it.module, when: when(it) });
      }
    }

    const taskShown: Shown[] = [];
    if (store.addTask) {
      for (const t of allTasks) {
        (undo.tasks ??= []).push(store.addTask({ title: t.title, due: t.due }));
        taskShown.push({ title: t.title, module: 'other', when: t.due ? dayLabel(t.due) : 'без дня', task: true });
      }
    }

    // спершу пояснення, потім заголовки переліку (перелік стоїть під текстом)
    const lines: string[] = [...replies];
    if (dups.length) lines.push(`Уже є в календарі: ${dups.join('; ')}.`);
    lines.push(...says);
    lines.push(...lists);
    if (added.length) lines.push(added.length === 1 ? 'Додано в календар:' : `Додано в календар (${added.length}):`);
    if (taskShown.length) lines.push('Додано в задачі:');
    if (removed.length) lines.push('Прибрано з календаря:');
    if (notFound) lines.push('Не знайдено таких подій. Перевірте назву або день.');
    if (badDate) lines.push('Такої дати немає. Перевірте день і місяць.');
    const did = added.length + removed.length + taskShown.length + listed.length + replies.length + dups.length;
    if (unknown && !did && !badDate)
      lines.push('Не вдалося зрозуміти, що саме запланувати. Напишіть назву, день і час, наприклад: «танці в пн і ср з 18 до 20».');
    else if (unknown) lines.push('Частину фрази не вдалося розібрати.');
    if (ask) lines.push(ask.text);

    const touched = undo.added.length + undo.removed.length + undo.updated.length + (undo.tasks?.length ?? 0) > 0;
    const bot: BotMsg = {
      id,
      role: 'bot',
      text: lines.join(' '),
      shown: [...listed, ...added, ...taskShown, ...removed],
      undo: touched ? undo : undefined,
      options: ask?.options,
    };
    return { bot, reveal };
  };

  /** Одне питання за раз: якщо у відповіді питання немає, ставимо наступне з черги. */
  const withPending = (bot: BotMsg, asks: { text: string; options: string[] }[]): BotMsg => {
    const queue = [...asks, ...pendingRef.current].filter((q, i, all) => all.findIndex((x) => x.text === q.text) === i);
    let out = bot;
    if (!bot.options?.length && !/\?\s*$/.test(bot.text) && queue.length) {
      const q = queue.shift()!;
      out = { ...bot, text: `${bot.text}\n${q.text}`.trim(), options: q.options.length ? q.options : undefined };
    }
    pendingRef.current = queue.slice(0, 5);
    return out;
  };

  /** Обробляє фразу: спершу ШІ (/api/assistant), без нього — вбудовані правила. Повертає першу дату доданих подій. */
  const send = useCallback(
    async (text: string, ctx: AssistantCtx): Promise<string | undefined> => {
      const trimmed = text.trim();
      if (!trimmed) return;
      // останні повідомлення (без «Думаю…» і скасованих) — щоб відповідь на уточнення поєднувалась із запитом
      const history = msgRef.current
        .filter((m) => !(m.role === 'bot' && (m.pending || m.undone)))
        .slice(-10)
        .map((m) => ({
          role: m.role,
          text: m.role === 'bot' && m.shown?.length ? `${m.text} ${m.shown.map((x) => `${x.title}, ${x.when}`).join('; ')}` : m.text,
        }));
      const user: Msg = { id: ++seq, role: 'user', text: trimmed };
      const botId = ++seq;
      setMessages((m) => [...m, user, { id: botId, role: 'bot', text: 'Думаю…', pending: true }]);
      const finish = (bot: Msg) => setMessages((m) => m.map((x) => (x.id === botId ? bot : x)));
      const lastBot = () =>
        [...msgRef.current].reverse().find((m): m is BotMsg => m.role === 'bot' && !m.pending && !!m.undo && !m.undone);

      // «скасуй» без назви — скасувати останню відповідь асистента (26.11)
      if (UNDO_RE.test(trimmed)) {
        const m = lastBot();
        if (m) undoMsg(m);
        finish({ id: botId, role: 'bot', text: m ? 'Останню зміну скасовано.' : 'Скасовувати нічого.' });
        return;
      }

      const today = toISO(new Date());

      // 1) ШІ
      const ai = await askAssistant(trimmed, { today, now: nowHM(), ...ctx, dishes: base.dishes, petNames: base.petNames, history });
      if (!('error' in ai)) {
        const asks = [...(ai.clarify ? [{ text: ai.clarify, options: ai.options }] : []), ...ai.asks];
        // «ні, о 9» — виправлення щойно доданого: спершу скасувати попередню відповідь
        let skip = new Set<string>();
        let fixed = false;
        if (ai.replaceLast && (ai.plans.length || ai.tasks.length)) {
          const m = lastBot();
          if (m) {
            skip = new Set(undoMsg(m));
            fixed = true;
          }
        }
        if (!ai.plans.length && !ai.tasks.length) {
          const q = asks.shift();
          pendingRef.current = [...asks, ...pendingRef.current].slice(0, 5);
          finish({ id: botId, role: 'bot', text: q?.text || ai.reply || 'Не вдалося зрозуміти, що саме запланувати. Напишіть назву, день і час.', options: q?.options.length ? q.options : undefined });
          return;
        }
        const { bot, reveal } = execute(ai.plans, ai.tasks, botId, skip);
        const shownBot = fixed ? { ...bot, text: `Попереднє скасовано. ${bot.text}` } : bot;
        // зрозуміле додано, а про решту питання в тому самому повідомленні (кнопки-варіанти — під ним);
        // якщо застосунок уже питає про прибирання, питання моделі — у наступній відповіді
        finish(withPending(shownBot, asks));
        return reveal;
      }

      // 2) вбудовані правила (ШІ недоступний)
      // Задача (етап 1, 18.11): назва й необовʼязковий день; час не потрібен
      const tm = store.addTask ? trimmed.match(TASK_RE) : null;
      if (tm && store.addTask) {
        const rest = tm[1].trim();
        const first = parsePhrase(rest, { ...base, today: new Date(), ...ctx }).find((p) => p.kind === 'add' || p.kind === 'task');
        const it = first?.kind === 'add' ? first.items[0] : first?.kind === 'task' ? first.item : undefined;
        const due = it && (it.date !== today || /сьогодні/i.test(rest)) ? it.date : undefined;
        const title = (it?.title || rest).replace(/^./, (c) => c.toUpperCase());
        const { bot } = execute([], [{ title, due }], botId);
        finish({ ...bot, text: ai.error === 'demo' ? bot.text : `${bot.text} (ШІ не відповів: ${ai.error}.)` });
        return;
      }
      const { bot, reveal } = execute(parsePhrase(trimmed, { ...base, today: new Date(), ...ctx }), [], botId);
      finish({ ...bot, text: (ai.error === 'demo' ? bot.text : `${bot.text} (ШІ не відповів: ${ai.error}, фразу розібрано за правилами.)`).trim() });
      return reveal;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [store.items, store.add, store.update, store.remove, store.addTask, base.dishes, base.petNames],
  );

  const undo = useCallback(
    (id: number) => {
      const m = messages.find((x) => x.id === id);
      if (!m || m.role !== 'bot') return;
      undoMsg(m);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [messages, store.add, store.update, store.remove, store.removeTask],
  );

  return { messages, send, undo };
}
