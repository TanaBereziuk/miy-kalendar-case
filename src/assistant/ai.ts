// Асистент на ШІ (25.11): запит до серверної функції /api/assistant (безкоштовна модель Gemini).
// Модель повертає сирі дії; тут вони перевіряються й стають тим самим `Plan`, що й у parse.ts.
// Будь-яка помилка (немає ключа, ліміт, інтернет) — повертаємо null, і useAssistant розбирає фразу вбудованими правилами.
import { supabase } from '../lib/supabase';
import { DAYS_SHORT, MONTHS_GEN, addDays, fromISO, toISO, toMinutes, weekdayIndex } from '../lib/dates';
import type { ModuleId, NewItem, Repeat } from '../types';
import type { Plan } from './parse';

export interface AiTask {
  title: string;
  due?: string;
}

/** Питання від застосунку (26.11): модель дала неповну справу — не додаємо мовчки, а питаємо. */
export interface AiAsk {
  text: string;
  options: string[];
}

export interface AiResult {
  reply: string;
  clarify: string;
  /** готові відповіді на уточнення — кнопки в чаті */
  options: string[];
  plans: Plan[];
  tasks: AiTask[];
  /** справи, яких бракує дня чи часу або які в минулому, — питання по черзі */
  asks: AiAsk[];
  /** користувач виправляє щойно додане («ні, о 9») — спершу скасувати попередню відповідь */
  replaceLast: boolean;
}

interface RawAction {
  type?: string;
  title?: string;
  module?: string;
  date?: string;
  allDay?: boolean;
  start?: string;
  end?: string;
  note?: string;
  repeatFreq?: string;
  repeatDays?: number[];
  repeatUntil?: string;
  removeWords?: string[];
  removeDates?: string[];
  removeScope?: string;
  removeWeekdays?: number[];
  repeatInterval?: number;
  dateTo?: string;
}

const MODULES: ModuleId[] = ['food', 'fop', 'hobby', 'pet', 'other'];
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const HM = /^([01]\d|2[0-3]):[0-5]\d$/;

const validDate = (s?: string): s is string => !!s && ISO.test(s) && !Number.isNaN(fromISO(s).getTime());
const cap = (s: string) => s.replace(/^./, (c) => c.toUpperCase());

export interface AiCtx {
  today: string;
  /** поточний час 'HH:MM' — щоб не ставити події на сьогодні в минуле */
  now?: string;
  date?: string;
  start?: string;
  dishes?: { id: string; name: string }[];
  petNames?: string[];
  /** останні повідомлення чату — для відповідей на уточнення */
  history?: { role: 'user' | 'bot'; text: string }[];
}

function toRepeat(a: RawAction): Repeat | undefined {
  const f = a.repeatFreq;
  if (f !== 'daily' && f !== 'weekly' && f !== 'monthly' && f !== 'yearly') return undefined;
  const r: Repeat = { freq: f };
  if (f === 'weekly') {
    const days = (a.repeatDays ?? []).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6);
    r.days = days.length ? [...new Set(days)].sort() : [weekdayIndex(fromISO(a.date!))];
  }
  if (validDate(a.repeatUntil)) r.until = a.repeatUntil;
  const n = Number(a.repeatInterval);
  if (Number.isInteger(n) && n > 1 && n <= 12) r.interval = n;
  return r;
}

/** «пт, 27 листопада» */
const dayLabel = (iso: string) => {
  const d = fromISO(iso);
  return `${DAYS_SHORT[weekdayIndex(d)].toLowerCase()}, ${d.getDate()} ${MONTHS_GEN[d.getMonth()]}`;
};
const hm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
const isMeds = (t: string) => /(?:^|\s)(?:ліки|ліків|таблет\S*|пігулк\S*|крапл\S*|вітамін\S*)/i.test(t);

/** Три години під частину дня (страви — під сніданок, обід, вечерю) і «На весь день» — правила, розділ 4. */
function timeOptions(title: string): string[] {
  const t = title.toLowerCase();
  const hours = /сніданок/.test(t) ? ['08:00', '09:00'] : /обід/.test(t) ? ['12:00', '13:00', '14:00'] : /вечер/.test(t) ? ['18:00', '19:00', '20:00'] : ['09:00', '13:00', '18:00'];
  return [...hours.map((h) => `о ${h}`), 'На весь день'];
}

type ItemOut = { item: NewItem; say?: string } | { ask: AiAsk } | null;

/** Дія моделі → подія; неповну чи минулу справу не додаємо, а повертаємо питання (26.11). */
function toItem(a: RawAction, ctx: AiCtx): ItemOut {
  const title = cap((a.title ?? '').trim().slice(0, 300));
  if (!title) return null;
  // у питанні — назва в лапках з малої («йога»), абревіатури й імена улюбленців як є
  const w0 = title.split(/\s|:/)[0];
  const keep = w0.length > 1 && w0 === w0.toUpperCase();
  const q = `«${keep || ctx.petNames?.includes(w0) ? title : title.replace(/^./, (c) => c.toLowerCase())}»`;
  const modelDate = validDate(a.date) ? a.date : undefined;
  const date = modelDate ?? ctx.date;
  if (!date) return { ask: { text: `На який день ${q}?`, options: ['Сьогодні', 'Завтра', dayLabel(toISO(addDays(fromISO(ctx.today), 2))).replace(/^./, (c) => c.toUpperCase())] } };
  // клітинку обрано свідомо — її день і час приймаємо навіть у минулому
  const cellDay = date === ctx.date;
  const module = MODULES.includes(a.module as ModuleId) ? (a.module as ModuleId) : 'other';
  const repeat = toRepeat({ ...a, date });
  let start = a.start && HM.test(a.start) ? a.start : undefined;
  if (!start && !a.allDay && cellDay && ctx.start) start = ctx.start;
  if (!start && !a.allDay) return { ask: { text: `На котру годину ${q}, ${dayLabel(date)}?`, options: timeOptions(title) } };
  if (!repeat && !cellDay && date < ctx.today)
    return { ask: { text: `${dayLabel(date).replace(/^./, (c) => c.toUpperCase())} уже минуло. На який день ${q}?`, options: ['Сьогодні', 'Завтра'] } };
  if (!repeat && start && date === ctx.today && ctx.now && start < ctx.now && !(cellDay && start === ctx.start)) {
    const next = Math.ceil((toMinutes(ctx.now) + 1) / 60) * 60;
    const options = [...(next < 24 * 60 ? [`Сьогодні о ${hm(next)}`] : []), `Завтра о ${start}`];
    return { ask: { text: `${start} уже минуло. Як бути з подією ${q}?`, options } };
  }
  if (repeat?.until && repeat.until < date)
    return { ask: { text: `Кінець повтору ${q} раніше за початок. До якого дня повторювати?`, options: ['Без кінця'] } };
  const item: NewItem = { title, module, date, allDay: !start };
  let say: string | undefined;
  if (start) {
    item.start = start;
    const e = a.end && HM.test(a.end) ? a.end : undefined;
    if (e && toMinutes(e) > toMinutes(start)) item.end = e;
    else if (e && toMinutes(e) < toMinutes(start) && toMinutes(start) >= 20 * 60) {
      // «з 23 до 1» — подія не переходить через північ
      item.end = '23:59';
      say = `Подія не переходить через північ: «${title}» закінчується о 23:59.`;
    } else item.end = hm(Math.min(toMinutes(start) + (isMeds(title) ? 15 : 60), 23 * 60 + 59));
  }
  if (a.note?.trim()) item.note = a.note.trim().slice(0, 1000);
  if (repeat) {
    item.repeat = repeat;
    // серія, що почалася б у минулому, — з сьогодні
    if (!cellDay && date < ctx.today && repeat.freq === 'daily') item.date = ctx.today;
  }
  const dish = module === 'food' ? ctx.dishes?.find((d) => d.name.trim().toLowerCase() === title.toLowerCase()) : undefined;
  if (dish) item.source = `dish:${dish.id}`;
  return { item, say };
}

/** Фраза → дії від моделі; { error } — ШІ недоступний (тоді працюють вбудовані правила, а причина показується в чаті). */
export async function askAssistant(text: string, ctx: AiCtx): Promise<AiResult | { error: string }> {
  try {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) return { error: 'немає входу' };
    // Демоверсія: серверних функцій немає — одразу вбудовані правила, без пояснення в чаті
    if (token === 'demo') return { error: 'demo' };
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 30000);
    const res = await fetch('/api/assistant', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({
        text,
        today: ctx.today,
        now: ctx.now,
        date: ctx.date,
        start: ctx.start,
        dishes: (ctx.dishes ?? []).map((d) => d.name),
        petNames: ctx.petNames ?? [],
        history: ctx.history ?? [],
      }),
      signal: ctrl.signal,
    }).finally(() => clearTimeout(timer));
    if (!res.ok) {
      const e = (await res.json().catch(() => ({}))) as { error?: string };
      return { error: `${res.status}${e.error ? ' ' + e.error : ''}` };
    }
    const json = (await res.json()) as { reply?: string; clarify?: string; options?: string[]; actions?: RawAction[]; replaceLast?: boolean };
    if (!Array.isArray(json.actions)) return { error: 'порожня відповідь' };
    const plans: Plan[] = [];
    const tasks: AiTask[] = [];
    const asks: AiAsk[] = [];
    for (const a of json.actions) {
      if (a.type === 'add') {
        const r = toItem(a, ctx);
        if (r && 'ask' in r) asks.push(r.ask);
        else if (r) plans.push({ kind: 'add', items: [r.item], say: r.say });
      } else if (a.type === 'remove') {
        const words = (a.removeWords ?? []).map((w) => String(w).trim()).filter(Boolean);
        if (!words.length) continue;
        const dates = (a.removeDates ?? []).filter(validDate);
        const weekdays = [...new Set((a.removeWeekdays ?? []).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))];
        const scope = a.removeScope === 'all' || a.removeScope === 'next' ? a.removeScope : undefined;
        plans.push({ kind: 'remove', query: { words, dates: weekdays.length ? [] : dates, weekdays, scope } });
      } else if (a.type === 'task') {
        const title = (a.title ?? '').trim().slice(0, 300);
        if (title) tasks.push({ title: cap(title), due: validDate(a.date) ? a.date : undefined });
      } else if (a.type === 'list') {
        // «що в мене завтра?» — до 14 днів
        const from = validDate(a.date) ? a.date : ctx.today;
        let to = validDate(a.dateTo) && a.dateTo >= from ? a.dateTo : from;
        const max = toISO(addDays(fromISO(from), 13));
        if (to > max) to = max;
        plans.push({ kind: 'list', from, to });
      }
    }
    return {
      reply: (json.reply ?? '').trim(),
      clarify: (json.clarify ?? '').trim(),
      options: (json.options ?? []).map((o) => String(o).trim()).filter(Boolean).slice(0, 4),
      plans,
      tasks,
      asks,
      replaceLast: json.replaceLast === true,
    };
  } catch {
    return { error: 'немає зʼєднання' };
  }
}
