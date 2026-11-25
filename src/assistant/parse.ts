// Асистент (16.11): розбір коротких фраз українською вбудованими правилами, без ШІ.
// Вхід — фраза («заплануй на пн, вт і ср танці з 6 до 8»), вихід — план дій: які події додати або прибрати.
// Пізніше цей модуль можна замінити на запит до Claude, який повертає той самий план (тип Plan).
import type { ModuleId, NewItem, Repeat } from '../types';
import { addDays, fromISO, fromMinutes, toISO, toMinutes, weekdayIndex } from '../lib/dates';

export interface ParseCtx {
  today: Date;
  /** дата й час, з яких відкрили асистента (клік по клітинці тижня) */
  date?: string;
  start?: string;
  /** бібліотека страв — щоб привʼязати страву з календаря до картки */
  dishes?: { id: string; name: string }[];
  /** імена тварин з налаштувань — щоб відносити такі фрази до улюбленця */
  petNames?: string[];
}

export interface RemoveQuery {
  words: string[];
  dates: string[];
  weekdays: number[];
}

export type Plan =
  | { kind: 'add'; items: NewItem[] }
  | { kind: 'remove'; query: RemoveQuery }
  | { kind: 'unknown'; reason: 'empty' | 'no-title' };

// ---------- словники ----------

const MONTHS: [RegExp, number][] = [
  [/^січ/, 0], [/^лют/, 1], [/^берез/, 2], [/^квіт/, 3], [/^трав/, 4], [/^черв/, 5],
  [/^лип/, 6], [/^серп/, 7], [/^верес/, 8], [/^жовт/, 9], [/^листоп/, 10], [/^груд/, 11],
];
const MONTH_RE = '(?:січ|лют|берез|квіт|трав|черв|лип|серп|верес|жовт|листоп|груд)[а-яіїєґʼ]*';

// Дні тижня в усіх потрібних формах; індекс 0 = понеділок
const DAY_FORMS: [string, number][] = [
  ['понеділ(?:ок|ка|ку|ки|ках|кам)', 0],
  ['вівтор(?:ок|ка|ку|ки|ках|кам)', 1],
  ['серед(?:а|у|и|і|ах|ам)', 2],
  ['четвер(?:га|гу|ги|гах|гам)?', 3],
  ['пʼ?ятниц(?:я|ю|і|ях|ям)', 4],
  ['субот(?:а|у|и|і|ах|ам)', 5],
  ['неділ(?:я|ю|і|ях|ям)', 6],
];
const DAY_SHORT = ['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'нд'];

// Межі слова для кирилиці (\b у JS не розуміє кирилицю)
const L = '(?<![а-яіїєґʼa-z0-9])';
const R = '(?![а-яіїєґʼa-z0-9])';

const MODULE_WORDS: [ModuleId, RegExp][] = [
  ['pet', new RegExp(`${L}(?:кіт|кота|коту|котом|котик\\S*|кішк\\S*|киц\\S*|собак\\S*|пес|пса|псу|песик\\S*|цуцен\\S*|ветеринар\\S*|ветклінік\\S*|щеплен\\S*|вакцин\\S*|глист\\S*|бліх\\S*|кліщ\\S*|грумінг\\S*|лоток|лотка|корм\\S*|вигул\\S*|улюблен\\S*)`, 'g')],
  ['fop', new RegExp(`${L}(?:податк\\S*|податок|єсв|єп${R}|декларац\\S*|фоп|бухгалтер\\S*|звіт\\S*|пдв|інвойс\\S*|е-кабінет\\S*|акт\\S* виконаних)`, 'g')],
  ['hobby', new RegExp(`${L}(?:танц\\S*|танго|сальс\\S*|йог\\S*|спорт\\S*|тренуван\\S*|трену\\S*|біг${R}|бігати|пробіжк\\S*|басейн\\S*|плаван\\S*|зал${R}|залу|спортзал\\S*|фітнес\\S*|пілатес\\S*|бокс\\S*|теніс\\S*|велосипед\\S*|вело${R}|гітар\\S*|піаніно|вокал\\S*|малюван\\S*|курс\\S*|урок\\S*|занятт\\S*|розтяжк\\S*|стретчинг\\S*|скелелаз\\S*|лиж\\S*|футбол\\S*|волейбол\\S*|баскетбол\\S*|медитац\\S*|англійськ\\S*|кераміка|гончар\\S*)`, 'g')],
  ['food', new RegExp(`${L}(?:сніданок|сніданку|обід${R}|обіду|вечер(?:я|ю|і)${R}|перекус\\S*|приготув\\S*|готувати|страв\\S*|їжа|їжу|поїсти|борщ\\S*|суп\\S*|салат\\S*|піц\\S*|паст(?:а|у)${R}|вареник\\S*|млинц\\S*|сирник\\S*|каш(?:а|у)${R}|омлет\\S*|плов\\S*)`, 'g')],
];

// Слова-команди, які не потрапляють у назву
const COMMAND_RE = new RegExp(
  `${L}(?:будь ласка|додай(?:те)?|додати|заплануй(?:те)?|запланувати|запиши(?:ть)?|записати|постав(?:те)?|поставити|створи(?:ть)?|внеси(?:ть)?|нагадай(?:те)?|нагадати|нагадування|мені|мене|нам|в календар|у календар|в календарі|у календарі|подію|подія|будь-ласка)${R}`,
  'g',
);
const REMOVE_RE = new RegExp(`^\\s*(?:видали(?:ти|ть)?|прибери(?:ть)?|прибрати|скасуй(?:те)?|скасувати|викресли(?:ть)?|забери(?:ть)?)${R}`);

// Службові слова, які лишаються на краях після вирізання днів і часу
const STOP = new Set([
  'в', 'у', 'на', 'о', 'об', 'з', 'із', 'зі', 'від', 'до', 'по', 'і', 'й', 'та', 'а', 'й', 'ще', 'це', 'цю', 'цей',
  'кожного', 'кожен', 'кожну', 'кожної', 'кожний', 'кожні', 'цього', 'наступного', 'наступний', 'наступну', 'наступної',
  'наступному', 'тижня', 'тижні', 'тиждень', 'щ', 'бо', 'же', 'ж', 'десь', 'приблизно', 'близько', 'години', 'годину',
  'год', 'тоді', 'потім', 'також', 'як', 'завжди', 'теж',
]);

const PART = {
  morning: new RegExp(`${L}(?:ранку|вранці|зранку|уранці|ранок)${R}`, 'g'),
  day: new RegExp(`${L}(?:дня|вдень|удень|опівдні|по обіді|після обіду)${R}`, 'g'),
  evening: new RegExp(`${L}(?:вечора|ввечері|увечері|вечір)${R}`, 'g'),
  night: new RegExp(`${L}(?:ночі|вночі|уночі)${R}`, 'g'),
};

// ---------- допоміжне ----------

function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[’'`ʹ]/g, 'ʼ')
    .replace(/[–—]/g, '-')
    .replace(/ё/g, 'е')
    .replace(/\s+/g, ' ')
    .trim();
}

interface Cut {
  text: string;
}

/** Вирізає збіги з тексту (замінює їх на «|», щоб розділити залишок на шматки) і повертає їх.
 *  keep — необовʼязковий фільтр: збіги, для яких він повертає false, лишаються в тексті. */
function take(c: Cut, re: RegExp, keep?: (m: RegExpExecArray, before: string) => boolean): RegExpExecArray[] {
  const out: RegExpExecArray[] = [];
  const g = new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g');
  let m: RegExpExecArray | null;
  while ((m = g.exec(c.text))) {
    if (m[0].length === 0) {
      g.lastIndex++;
      continue;
    }
    if (!keep || keep(m, c.text.slice(0, m.index))) out.push(m);
  }
  for (let i = out.length - 1; i >= 0; i--) {
    const x = out[i];
    c.text = c.text.slice(0, x.index) + ' | ' + c.text.slice(x.index + x[0].length);
  }
  return out;
}

function nextOn(from: Date, wd: number): Date {
  return addDays(from, (wd - weekdayIndex(from) + 7) % 7);
}

function hhmm(h: number, m: number): string {
  return fromMinutes(h * 60 + m);
}

/** Повертає словам назви регістр з оригінальної фрази («олею» → «Олею», «єсв» → «ЄСВ»). */
function restoreCase(title: string, original: string): string {
  const words = original.replace(/[’'`ʹ]/g, 'ʼ').replace(/[–—]/g, '-').split(/[\s,.;:!?]+/).filter(Boolean);
  return title
    .split(' ')
    .map((w) => words.find((o) => o.toLowerCase().replace(/ё/g, 'е') === w) ?? w)
    .join(' ');
}

function capitalize(s: string): string {
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}

const dayRe = (forms: string) =>
  new RegExp(`${L}(?:що|по\\s+|кожн(?:ого|ий|ої|у|ен)\\s+|в\\s+|у\\s+|на\\s+)?(?:${forms})${R}`, 'g');
const WEEKLY_HINT =
  /(?:^|\s)(?:що|по\s+|кожн\S*\s+)(?:понеділ|вівтор|серед|четвер|пʼ?ятниц|субот|неділ)|(?:понеділках|вівторках|середах|четвергах|пʼ?ятницях|суботах|неділях)/;

// ---------- розбір однієї фрази ----------

interface Parsed {
  title: string;
  module: ModuleId;
  dates: string[];
  weekdays: number[];
  repeat?: Repeat['freq'];
  until?: string;
  start?: string;
  end?: string;
  durMin?: number;
  nextWeek: boolean;
}

function extract(raw: string, ctx: ParseCtx, forRemove = false): Parsed {
  const c: Cut = { text: ' ' + raw + ' ' };
  const today = new Date(ctx.today.getFullYear(), ctx.today.getMonth(), ctx.today.getDate());

  // модуль визначаємо по всій фразі, до вирізання
  let module: ModuleId = 'other';
  let best = 0;
  for (const [id, re] of MODULE_WORDS) {
    const n = (c.text.match(re) ?? []).length;
    if (n > best) {
      best = n;
      module = id;
    }
  }
  for (const name of ctx.petNames ?? []) {
    const nm = normalize(name);
    if (nm.length >= 3 && c.text.includes(nm.slice(0, Math.max(3, nm.length - 1)))) module = 'pet';
  }

  take(c, COMMAND_RE);

  // повтори
  let repeat: Repeat['freq'] | undefined;
  let until: string | undefined;
  if (take(c, new RegExp(`${L}(?:щодня|щоденно|кожен день|кожного дня|кожний день|щодень|всі дні|усі дні)${R}`)).length) repeat = 'daily';
  if (take(c, new RegExp(`${L}(?:щотижня|щотижнево|кожного тижня|кожен тиждень|раз на тиждень)${R}`)).length) repeat = 'weekly';
  if (take(c, new RegExp(`${L}(?:щомісяця|щомісячно|кожного місяця|кожен місяць|раз на місяць)${R}`)).length) repeat = 'monthly';
  if (take(c, new RegExp(`${L}(?:щороку|щорічно|кожного року|раз на рік)${R}`)).length) repeat = 'yearly';

  if (!repeat && WEEKLY_HINT.test(c.text)) repeat = 'weekly';

  // «до кінця року / місяця», «до 20 грудня» — межа повторів
  if (take(c, new RegExp(`${L}до кінця року${R}`)).length) until = `${today.getFullYear()}-12-31`;
  if (take(c, new RegExp(`${L}до кінця місяця${R}`)).length) until = toISO(new Date(today.getFullYear(), today.getMonth() + 1, 0));

  // дати: «20 листопада», «20.11», «20.11.2026»
  const dates: string[] = [];
  const mkDate = (d: number, mo: number, y?: number) => {
    let year = y ?? today.getFullYear();
    if (year < 100) year += 2000;
    let dt = new Date(year, mo, d);
    if (dt.getMonth() !== mo) return undefined;
    if (!y && dt < today) dt = new Date(year + 1, mo, d);
    return toISO(dt);
  };
  for (const m of take(c, new RegExp(`${L}(до\\s+)?(\\d{1,2})(?:\\s*(?:,|і|та|й)\\s*(\\d{1,2}))*\\s+(${MONTH_RE})${R}`))) {
    const mo = MONTHS.find(([re]) => re.test(m[4]))?.[1];
    if (mo === undefined) continue;
    const nums = m[0].replace(/^до\s+/, '').match(/\d{1,2}/g) ?? [];
    for (const n of nums) {
      const iso = mkDate(Number(n), mo);
      if (!iso) continue;
      if (m[1] && repeat) until = iso;
      else dates.push(iso);
    }
  }
  for (const m of take(c, new RegExp(`${L}(до\\s+)?(\\d{1,2})[./](\\d{1,2})(?:[./](\\d{2,4}))?${R}`))) {
    const iso = mkDate(Number(m[2]), Number(m[3]) - 1, m[4] ? Number(m[4]) : undefined);
    if (!iso) continue;
    if (m[1] && repeat) until = iso;
    else dates.push(iso);
  }

  // відносні дні
  if (take(c, new RegExp(`${L}післязавтра${R}`)).length) dates.push(toISO(addDays(today, 2)));
  if (take(c, new RegExp(`${L}завтра${R}`)).length) dates.push(toISO(addDays(today, 1)));
  if (take(c, new RegExp(`${L}сьогодні${R}`)).length) dates.push(toISO(today));
  for (const m of take(c, new RegExp(`${L}через\\s+(\\d+|два|три|тиждень)(?:\\s+(?:дн\\S*|тиж\\S*))?${R}`))) {
    const n = m[1] === 'тиждень' ? 7 : m[1] === 'два' ? 2 : m[1] === 'три' ? 3 : Number(m[1]);
    const unit = /тиж/.test(m[0]) && m[1] !== 'тиждень' ? 7 : 1;
    dates.push(toISO(addDays(today, n * unit)));
  }

  // «наступного тижня» / «на наступному тижні» / «наступного понеділка»
  const nextWeek = take(c, new RegExp(`${L}(?:наступного тижня|на наступному тижні|наступний тиждень|на наступний тиждень)${R}`)).length > 0
    || /(?:^|\s)наступн\S*\s+(?:понеділ|вівтор|серед|четвер|пʼ?ятниц|субот|неділ)/.test(c.text);

  // дні тижня
  const weekdays: number[] = [];
  const addWd = (i: number) => !weekdays.includes(i) && weekdays.push(i);
  if (take(c, new RegExp(`${L}(?:у |в |по )?(?:будні(?: дні)?|буднях|будній день|робочі дні)${R}`)).length) [0, 1, 2, 3, 4].forEach(addWd);
  if (take(c, new RegExp(`${L}(?:у |в |на )?(?:вихідні|вихідних)${R}`)).length) [5, 6].forEach(addWd);
  for (const [forms, i] of DAY_FORMS) {
    if (take(c, dayRe(forms)).length) addWd(i);
  }
  DAY_SHORT.forEach((s, i) => {
    if (take(c, new RegExp(`${L}${s}\\.?${R}`)).length) addWd(i);
  });
  weekdays.sort((a, b) => a - b);

  // тривалість: «на 2 години», «на півтори години», «на 30 хв» (до часу, щоб «на 2» не стало часом)
  let durMin: number | undefined;
  for (const m of take(c, new RegExp(`${L}(?:на\\s+)?(\\d+(?:[.,]\\d+)?)\\s*(годин\\S*|години|год\\.?|хвилин\\S*|хв\\.?)(?=\\s|$|[,.;])`), (m, before) =>
    // «о 7 год», «з 6 до 8 год» — це час, а не тривалість
    /^на/.test(m[0]) || !/(?:^|\s)(?:о|об|в|у|з|із|від|до)\s*$|-\s*$/.test(before),
  )) {
    const num = Number(m[1].replace(',', '.'));
    durMin = /^хв/.test(m[2]) ? Math.round(num) : Math.round(num * 60);
  }
  const W: Record<string, number> = { 'годину': 60, 'одну годину': 60, 'півтори години': 90, 'пів години': 30, 'півгодини': 30, 'дві години': 120, 'три години': 180 };
  for (const m of take(c, new RegExp(`${L}на\\s+(годину|одну годину|півтори години|пів години|півгодини|дві години|три години)${R}`))) durMin = W[m[1]];

  // частина дня
  const part = (Object.keys(PART) as (keyof typeof PART)[]).find((k) => take(c, PART[k]).length > 0);

  // час
  let start: string | undefined;
  let end: string | undefined;
  const T = '(\\d{1,2})(?:[:.](\\d{2}))?';
  const range = take(c, new RegExp(`${L}(?:з|із|зі|від)?\\s*${T}\\s*(?:год\\S*\\s*)?(?:до|по|-)\\s*${T}(?:\\s*год\\S*)?${R}`));
  const fix = (h: number, explicitMin: boolean) => {
    if (h >= 13 || h === 0) return h;
    if (part === 'evening' || part === 'day') return h < 12 ? h + 12 : h;
    if (part === 'morning') return h === 12 ? 0 : h;
    if (part === 'night') return h >= 9 && h < 12 ? h + 12 : h;
    // без підказки: 1–6 — найімовірніше вечір чи день («танці з 6 до 8», «о 3»)
    return h >= 1 && h <= 6 && !explicitMin ? h + 12 : h;
  };
  if (range.length) {
    const m = range[0];
    const h1 = Number(m[1]);
    const m1 = Number(m[2] ?? 0);
    const h2 = Number(m[3]);
    const m2 = Number(m[4] ?? 0);
    if (h1 <= 24 && h2 <= 24 && m1 < 60 && m2 < 60) {
      let a = fix(h1, false);
      let b = h2 >= 13 ? h2 : h2 + (a >= 12 && h2 < 12 ? 12 : 0);
      if (b * 60 + m2 <= a * 60 + m1) b = Math.min(23, b + 12);
      if (b * 60 + m2 <= a * 60 + m1) b = a + 1;
      a = Math.min(a, 23);
      start = hhmm(a, m1);
      end = hhmm(Math.min(b, 23), b > 23 ? 59 : m2);
    }
  } else {
    const one =
      take(c, new RegExp(`${L}(?:о|об|в|у|на)\\s+${T}(?:\\s*год\\S*)?${R}`))[0] ??
      take(c, new RegExp(`${L}(\\d{1,2})[:](\\d{2})${R}`))[0];
    if (one) {
      const h = Number(one[1]);
      const mm = Number(one[2] ?? 0);
      if (h <= 24 && mm < 60) start = hhmm(Math.min(fix(h, !!one[2] && h >= 7), 23), mm);
    }
  }
  if (!start && take(c, new RegExp(`${L}опівдні${R}`)).length) start = '12:00';
  if (!start && part) start = part === 'morning' ? '09:00' : part === 'day' ? '13:00' : part === 'evening' ? '19:00' : '22:00';
  if (!start && module === 'food') {
    if (/сніданок|сніданку/.test(raw)) start = '08:00';
    else if (/обід/.test(raw)) start = '13:00';
    else if (/вечер/.test(raw)) start = '19:00';
    else if (/перекус/.test(raw)) start = '16:00';
  }

  // назва — те, що лишилося; шматки між вирізаним чистимо від службових слів на краях
  const pieces = c.text
    .split('|')
    .map((p) => {
      const w = p.replace(/[,.;:!?]+/g, ' ').split(' ').filter(Boolean);
      while (w.length && STOP.has(w[0])) w.shift();
      while (w.length && STOP.has(w[w.length - 1])) w.pop();
      return w.join(' ');
    })
    .filter(Boolean);
  let title = pieces.join(' ').replace(/\s+/g, ' ').trim();
  if (forRemove) title = title.replace(new RegExp(`${L}(?:всі|усі|все|подію|події|зустріч)${R}`, 'g'), ' ').trim();

  return { title, module, dates, weekdays, repeat, until, start, end, durMin, nextWeek };
}

// ---------- з розібраного — події ----------

function buildItems(p: Parsed, ctx: ParseCtx): NewItem[] {
  const today = new Date(ctx.today.getFullYear(), ctx.today.getMonth(), ctx.today.getDate());
  let module = p.module;
  let title = capitalize(p.title);
  let source: string | undefined;

  // страва з бібліотеки — привʼязуємо до картки
  if (ctx.dishes?.length && p.title) {
    const t = p.title.toLowerCase();
    const dish = ctx.dishes.find((d) => d.name.trim().length > 2 && (t === d.name.toLowerCase() || t.includes(d.name.toLowerCase())));
    if (dish) {
      module = 'food';
      source = `dish:${dish.id}`;
      if (t === dish.name.toLowerCase()) title = dish.name;
    }
  }

  // час з клітинки, на якій відкрили асистента, — лише якщо у фразі немає ні дня, ні часу
  const start = p.start ?? (ctx.start && ctx.date && !p.dates.length && !p.weekdays.length ? ctx.start : undefined);
  const allDay = !start;
  const defDur = 60; // і страва, і решта подій — 1 година (16.11, 19:27)
  const end = start ? p.end ?? fromMinutes(Math.min(toMinutes(start) + (p.durMin ?? defDur), 24 * 60 - 1)) : undefined;
  const base = { title, module, allDay, start, end, source } as const;

  const nextWeekMonday = (() => {
    const mon = addDays(today, -weekdayIndex(today));
    return addDays(mon, 7);
  })();
  const anchor = ctx.date ? fromISO(ctx.date) : today;

  // повтор щотижня з днями — одна серія
  if (p.repeat === 'weekly') {
    const days = p.weekdays.length ? p.weekdays : [weekdayIndex(p.dates[0] ? fromISO(p.dates[0]) : anchor)];
    const from = p.dates[0] ? fromISO(p.dates[0]) : anchor;
    const first = days.map((d) => nextOn(from, d)).sort((a, b) => +a - +b)[0];
    return [{ ...base, date: toISO(first), repeat: { freq: 'weekly', days, until: p.until } }];
  }
  if (p.repeat) {
    let date = p.dates[0] ?? toISO(anchor);
    if (p.weekdays.length && !p.dates.length) date = toISO(nextOn(anchor, p.weekdays[0]));
    return [{ ...base, date, repeat: { freq: p.repeat, until: p.until } }];
  }

  // разові події: кожна дата й кожен день тижня — окрема подія
  const dates = new Set<string>(p.dates);
  for (const wd of p.weekdays) {
    const d = p.nextWeek ? addDays(nextWeekMonday, wd) : nextOn(anchor < today ? today : anchor, wd);
    dates.add(toISO(d));
  }
  if (!dates.size) dates.add(toISO(anchor));
  return [...dates].sort().map((date) => ({ ...base, date }));
}

/** Ділить повідомлення на окремі фрази: рядки, «;», крапка з пробілом. */
function clauses(text: string): string[] {
  return text
    .split(/\n|;|\.\s+(?=\S)/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function parsePhrase(text: string, ctx: ParseCtx): Plan[] {
  const parts = clauses(normalize(text));
  const original = text;
  if (!parts.length) return [{ kind: 'unknown', reason: 'empty' }];
  return parts.map((raw): Plan => {
    if (REMOVE_RE.test(raw)) {
      const p = extract(raw.replace(REMOVE_RE, ' '), ctx, true);
      const today = new Date(ctx.today.getFullYear(), ctx.today.getMonth(), ctx.today.getDate());
      const words = p.title.split(' ').filter((w) => w.length >= 3);
      if (!words.length) return { kind: 'unknown', reason: 'no-title' };
      const nextWeek = p.nextWeek;
      const mon = addDays(today, -weekdayIndex(today) + (nextWeek ? 7 : 0));
      // для «прибери танці в середу» шукаємо найближчу середу
      const dates = [...p.dates];
      if (!p.repeat) for (const wd of p.weekdays) dates.push(toISO(nextWeek ? addDays(mon, wd) : nextOn(today, wd)));
      return { kind: 'remove', query: { words, dates, weekdays: p.weekdays } };
    }
    const p = extract(raw, ctx);
    if (!p.title) return { kind: 'unknown', reason: 'no-title' };
    p.title = restoreCase(p.title, original);
    // дні народження й річниці — щороку
    if (!p.repeat && /день народження|днюха|річниця/i.test(p.title) && !p.weekdays.length) p.repeat = 'yearly';
    return { kind: 'add', items: buildItems(p, ctx) };
  });
}
