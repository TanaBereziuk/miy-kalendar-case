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
  /** all — усі майбутні, next — лише найближчу; немає — асистент питає, якщо збігів кілька (25.11) */
  scope?: 'all' | 'next';
}

export type Plan =
  /** say — рядок для відповіді («Час уже минув…», «кінець — 23:59») */
  | { kind: 'add'; items: NewItem[]; say?: string }
  | { kind: 'remove'; query: RemoveQuery }
  /** задача (26.11): справа-дія без часу; item — та сама справа подією, якщо таблиці задач немає */
  | { kind: 'task'; title: string; due?: string; item: NewItem }
  /** «що в мене завтра?» (26.11) — показати заплановане з from до to */
  | { kind: 'list'; from: string; to: string }
  /** відповідь без змін у календарі: подяка, привітання, питання не про плани */
  | { kind: 'reply'; text: string }
  | { kind: 'unknown'; reason: 'empty' | 'no-title' | 'bad-date' };

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
  day: new RegExp(`${L}(?:дня|вдень|удень|по обіді|після обіду)${R}`, 'g'),
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
  /** «кожні два тижні» — 2 (26.11) */
  interval?: number;
  until?: string;
  start?: string;
  end?: string;
  durMin?: number;
  nextWeek: boolean;
  /** «о 12 ночі», «опівночі» — 00:00 наступного дня */
  midnight?: boolean;
  /** «з 20 по 27 грудня» — кілька днів поспіль: щодня на весь день до останнього дня */
  span?: boolean;
  /** названо дату, якої немає («30 лютого») */
  badDate?: boolean;
  /** кінець після півночі обрізано до 23:59 */
  clipped?: boolean;
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
  let interval: number | undefined;
  // «кожні два тижні», «раз на три дні», «щодругого дня» (26.11)
  const NUM: Record<string, number> = { два: 2, дві: 2, три: 3, чотири: 4 };
  for (const m of take(c, new RegExp(`${L}(?:кожн(?:і|их)|раз на)\\s+(\\d+|два|дві|три|чотири)\\s+(тиж\\S*|дн\\S*|місяц\\S*)${R}`))) {
    interval = NUM[m[1]] ?? Number(m[1]);
    repeat = /^тиж/.test(m[2]) ? 'weekly' : /^дн/.test(m[2]) ? 'daily' : 'monthly';
  }
  if (take(c, new RegExp(`${L}(?:щодругого дня|кожного другого дня|кожен другий день)${R}`)).length) {
    repeat = 'daily';
    interval = 2;
  }
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
  let badDate = false;
  const mkDate = (d: number, mo: number, y?: number) => {
    let year = y ?? today.getFullYear();
    if (year < 100) year += 2000;
    let dt = new Date(year, mo, d);
    if (dt.getMonth() !== mo || d < 1) {
      // «30 лютого» — такої дати немає (26.11): не ставимо мовчки на сьогодні
      badDate = true;
      return undefined;
    }
    if (!y && dt < today) dt = new Date(year + 1, mo, d);
    return toISO(dt);
  };
  // «з 20 по 27 грудня», «з 28 грудня до 3 січня» — кілька днів поспіль (26.11)
  let span = false;
  for (const m of take(c, new RegExp(`${L}з\\s+(\\d{1,2})(?:\\s+(${MONTH_RE}))?\\s+(?:по|до)\\s+(\\d{1,2})\\s+(${MONTH_RE})${R}`))) {
    const mo2 = MONTHS.find(([re]) => re.test(m[4]))?.[1];
    let mo1 = m[2] ? MONTHS.find(([re]) => re.test(m[2]))?.[1] : mo2;
    if (mo1 === undefined || mo2 === undefined) continue;
    if (!m[2] && Number(m[1]) > Number(m[3])) mo1 = (mo2 + 11) % 12;
    const a = mkDate(Number(m[1]), mo1);
    let b = mkDate(Number(m[3]), mo2);
    if (!a || !b) continue;
    if (b < a) b = mkDate(Number(m[3]), mo2, fromISO(a).getFullYear() + 1);
    if (!b) continue;
    dates.push(a);
    if (b > a) {
      repeat = 'daily';
      interval = undefined;
      until = b;
    }
    span = true;
  }
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
  let clipped = false;
  const T ='(\\d{1,2})(?:[:.](\\d{2}))?';
  const range = take(c, new RegExp(`${L}(?:з|із|зі|від)?\\s*${T}\\s*(?:год\\S*\\s*)?(?:до|по|-)\\s*${T}(?:\\s*год\\S*)?${R}`));
  const fix = (h: number, explicitMin: boolean) => {
    if (h >= 13 || h === 0) return h;
    if (part === 'evening' || part === 'day') return h < 12 ? h + 12 : h;
    if (part === 'morning') return h === 12 ? 0 : h;
    // «о 12 ночі» — північ (00:00 наступного дня), «о 11 вночі» — 23:00
    if (part === 'night') return h === 12 ? 0 : h >= 9 && h < 12 ? h + 12 : h;
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
      // «з 23 до 1» — кінець після півночі: подія закінчується о 23:59 цього дня (26.11)
      if (b * 60 + m2 <= a * 60 + m1) {
        b = 24;
        clipped = a >= 20;
        if (!clipped) b = a + 1;
      }
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
  let midnight = start === '00:00' && part === 'night';
  if (!start && take(c, new RegExp(`${L}опівночі${R}`)).length) {
    start = '00:00';
    midnight = true;
  }
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

  return { title, module, dates, weekdays, repeat, interval, until, start, end, durMin, nextWeek, midnight, span, badDate, clipped };
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
  const start = p.span ? undefined : p.start ?? (ctx.start && ctx.date && !p.dates.length && !p.weekdays.length ? ctx.start : undefined);
  const allDay = !start;
  // і страва, і решта подій — 1 година (16.11, 19:27); ліки — 15 хв (25.11, правила асистента)
  const defDur = isMeds(p.title) ? 15 : 60;
  const end = start ? p.end ?? fromMinutes(Math.min(toMinutes(start) + (p.durMin ?? defDur), 24 * 60 - 1)) : undefined;
  const base = { title, module, allDay, start, end, source } as const;
  const rep = (freq: Repeat['freq'], extra: Partial<Repeat> = {}): Repeat => ({
    freq,
    ...(p.interval && p.interval > 1 ? { interval: p.interval } : {}),
    ...(p.until ? { until: p.until } : {}),
    ...extra,
  });
  // «о 12 ночі» — північ, тобто початок наступного дня
  const shift = (iso: string) => (p.midnight ? toISO(addDays(fromISO(iso), 1)) : iso);

  const nextWeekMonday = (() => {
    const mon = addDays(today, -weekdayIndex(today));
    return addDays(mon, 7);
  })();
  const anchor = ctx.date ? fromISO(ctx.date) : today;

  // повтор щотижня з днями — одна серія
  if (p.repeat === 'weekly') {
    const days = p.weekdays.length ? p.weekdays : [weekdayIndex(p.dates[0] ? fromISO(p.dates[0]) : anchor)];
    const from = p.dates[0] ? fromISO(p.dates[0]) : p.nextWeek ? nextWeekMonday : anchor;
    const first = days.map((d) => nextOn(from, d)).sort((a, b) => +a - +b)[0];
    return [{ ...base, date: shift(toISO(first)), repeat: rep('weekly', { days }) }];
  }
  if (p.repeat) {
    let date = p.dates[0] ?? toISO(anchor);
    if (p.weekdays.length && !p.dates.length) date = toISO(nextOn(anchor, p.weekdays[0]));
    return [{ ...base, date: shift(date), repeat: rep(p.repeat) }];
  }

  // разові події: кожна дата й кожен день тижня — окрема подія
  const dates = new Set<string>(p.dates);
  for (const wd of p.weekdays) {
    const d = p.nextWeek ? addDays(nextWeekMonday, wd) : nextOn(anchor < today ? today : anchor, wd);
    dates.add(toISO(d));
  }
  if (!dates.size) dates.add(toISO(p.nextWeek ? nextWeekMonday : anchor));
  return [...dates].sort().map((date) => ({ ...base, date: shift(date) }));
}

const isMeds = (title: string) => /(?:^|\s)(?:ліки|ліків|таблет\S*|пігулк\S*|крапл\S*|вітамін\S*)/i.test(title);

// ---------- розділення повідомлення на справи (26.11, правила асистента, розділ 2) ----------

/** Ділить повідомлення на окремі фрази: рядки, «;», крапка з пробілом. */
function clauses(text: string): string[] {
  return text
    .split(/\n|;|\.\s+(?=\S)/)
    .map((s) => s.trim().replace(/[.!]+$/, ''))
    .filter(Boolean);
}

const DAY_RE = new RegExp(
  `${L}(?:сьогодні|завтра|післязавтра|через\\s+\\S+\\s+дн\\S*|через тиждень|будні\\S*|вихідн\\S*|понеділ\\S*|вівтор\\S*|середу|середи|середа|середах|четвер\\S*|пʼ?ятниц\\S*|субот\\S*|неділ\\S*|пн|вт|ср|чт|пт|сб|нд|\\d{1,2}[./]\\d{1,2}|\\d{1,2}\\s+${MONTH_RE}|наступного тижня)${R}`,
);
const TIME_RE = new RegExp(`${L}(?:(?:о|об|з|із|від)\\s+\\d{1,2}|\\d{1,2}:\\d{2}|вранці|зранку|ввечері|увечері|вдень|опівдні|опівночі)${R}`);
/** справа-дія: неозначена форма дієслова на початку («купити», «записатися») */
const VERB_RE = /^(?:\S+(?:ти|тися|тись))(?=\s|$)/;
const hasModuleWord = (s: string) => MODULE_WORDS.some(([, re]) => new RegExp(re.source).test(' ' + s + ' '));
const stripCmd = (s: string) => s.replace(COMMAND_RE, ' ').replace(/\s+/g, ' ').trim();

/** «а», «а потім», «а ще», «потім», «також» — завжди нова справа */
const STRONG = /\s*,?\s+(?:а ще|а потім|а також|потім|також|а)\s+/;
/** кома, «і», «й», «та» — нова справа, лише якщо далі своя справа (див. needSplit) */
const WEAK = /(\s*,\s*|\s+(?:і|й|та)\s+)/;

function needSplit(left: string, right: string, forRemove: boolean, ctx: ParseCtx): boolean {
  const r = stripCmd(right);
  if (!r) return false;
  // «танці в пн і ср з 6 до 8» — далі лише день чи час тієї самої справи, без своєї назви
  if (!extract(r, ctx, forRemove).title) return false;
  if (forRemove) return hasModuleWord(r) || DAY_RE.test(r);
  return TIME_RE.test(r) || DAY_RE.test(r) || VERB_RE.test(r) || (TIME_RE.test(left) && hasModuleWord(r));
}

/** Частини однієї групи; note — деталь після коми, що не є окремою справою («кафе на Подолі»). */
function splitWeak(group: string, forRemove: boolean, ctx: ParseCtx): { text: string; note?: string }[] {
  const t = group.split(WEAK);
  const out: { text: string; note?: string }[] = [{ text: t[0] }];
  for (let i = 1; i < t.length; i += 2) {
    const sep = t[i];
    const seg = t[i + 1] ?? '';
    const cur = out[out.length - 1];
    if (needSplit(cur.text, seg, forRemove, ctx)) out.push({ text: seg });
    else if (!forRemove && sep.includes(',') && TIME_RE.test(cur.text)) cur.note = cur.note ? `${cur.note}, ${seg}` : seg;
    else cur.text += sep + seg;
  }
  return out.filter((x) => x.text.trim());
}

const hasDay = (p: Parsed) => p.dates.length > 0 || p.weekdays.length > 0 || p.nextWeek;
const inherit = (p: Parsed, from?: Parsed) => {
  if (!from || hasDay(p) || !hasDay(from)) return;
  p.dates = [...from.dates];
  p.weekdays = [...from.weekdays];
  p.nextWeek = from.nextWeek;
};

// ---------- відповіді без змін у календарі (26.11) ----------

const THANKS = /^(?:дякую|дяки|дяка|спасибі|дякс|дякуємо)(?:\s+\S+)?[\s.!)]*$/;
const OKAY = /^(?:ок|окей|ok|добре|гаразд|чудово|супер|клас|зрозуміло|ясно|так)[\s.!)]*$/;
const HELLO = /^(?:привіт|вітаю|хай|hello|hi|добр(?:ий|ого)\s+(?:день|ранок|ранку|вечір|вечора|дня))[\s.!,)]*$/;
const MOVE = /^(?:перенеси\S*|пересунь\S*|посунь\S*|зміни\S*|зсунь\S*|переймен\S*|познач\S*|відміт\S*)(?:\s|$)/;
const LIST =
  /^(?:що|які|чи є|покажи)(?:\s|$).*(?:в мене|у мене|заплановано|запланован\S*|плани|планах|в календарі|у календарі|розклад)|^(?:що|які плани)\s+(?:на|в|у)\s+/;

export const REPLIES = {
  thanks: 'Будь ласка. Що ще запланувати?',
  okay: 'Що ще запланувати?',
  hello: 'Вітаю. Що запланувати?',
  move: 'Переносити й змінювати події поки можна лише в календарі. Що запланувати?',
  other: 'Я допомагаю лише з планами. Що запланувати?',
};

function replyFor(whole: string, ctx: ParseCtx): Plan | undefined {
  const t = whole.trim();
  if (THANKS.test(t)) return { kind: 'reply', text: REPLIES.thanks };
  if (OKAY.test(t)) return { kind: 'reply', text: REPLIES.okay };
  if (HELLO.test(t)) return { kind: 'reply', text: REPLIES.hello };
  if (MOVE.test(t)) return { kind: 'reply', text: REPLIES.move };
  if (LIST.test(t)) {
    const today = new Date(ctx.today.getFullYear(), ctx.today.getMonth(), ctx.today.getDate());
    const p = extract(t.replace(/\?/g, ' '), ctx);
    const next = p.nextWeek || /наступн\S* тиж/.test(t);
    if (/тиж/.test(t)) {
      const mon = addDays(today, -weekdayIndex(today) + (next ? 7 : 0));
      return { kind: 'list', from: toISO(next ? mon : today), to: toISO(addDays(mon, 6)) };
    }
    const d = p.dates[0] ?? (p.weekdays.length ? toISO(nextOn(today, p.weekdays[0])) : toISO(today));
    return { kind: 'list', from: d, to: d };
  }
  // будь-яке інше питання — не про планування
  if (/\?\s*$/.test(t)) return { kind: 'reply', text: REPLIES.other };
  return undefined;
}

// ---------- час словами (26.11) ----------

const ORD = ['перш', 'друг', 'трет', 'четверт', 'пʼят', 'шост', 'сьом', 'восьм', 'девʼят', 'десят', 'одинадцят', 'дванадцят'];
const ORD_RE = `(?:${ORD.join('|')})(?:ій|ої|ьої|у|ю)`;
const ordNum = (w: string) => ORD.findIndex((s) => w.startsWith(s)) + 1;
const half = (h: number) => `о ${h - 1 || 12}:30`;

/** «о восьмій» → «о 8», «о пів на сьому» → «о 6:30», «пів восьмої» → «о 7:30», «з восьмої до десятої» → «з 8 до 10» */
function timeWords(s: string): string {
  return s
    .replace(new RegExp(`${L}(?:о\\s+|об\\s+)?пів\\s+на\\s+(\\d{1,2}|${ORD_RE})${R}`, 'g'), (_m, x: string) => half(/\d/.test(x) ? Number(x) : ordNum(x)))
    .replace(new RegExp(`${L}(?:о\\s+|об\\s+)?пів\\s*(${ORD_RE})${R}`, 'g'), (_m, x: string) => half(ordNum(x)))
    .replace(new RegExp(`${L}(о|об|з|із|від|до)\\s+(${ORD_RE})${R}`, 'g'), (_m, pre: string, x: string) => `${pre === 'об' ? 'о' : pre} ${ordNum(x)}`);
}

// ---------- розбір повідомлення ----------

function removePlan(seg: string, ctx: ParseCtx, from?: Parsed): Plan {
  const p = extract(seg, ctx, true);
  inherit(p, from);
  const today = new Date(ctx.today.getFullYear(), ctx.today.getMonth(), ctx.today.getDate());
  const words = p.title.split(' ').filter((w) => w.length >= 3);
  if (!words.length) return { kind: 'unknown', reason: 'no-title' };
  const mon = addDays(today, -weekdayIndex(today) + (p.nextWeek ? 7 : 0));
  // «прибери танці в середу» — лише найближча середа; «по середах» — середа з розкладу (26.11)
  const dates = [...p.dates];
  if (!p.repeat) for (const wd of p.weekdays) dates.push(toISO(p.nextWeek ? addDays(mon, wd) : nextOn(today, wd)));
  // правила без ШІ не питають — прибирають усі майбутні, як і раніше
  return { kind: 'remove', query: { words, dates, weekdays: p.repeat ? p.weekdays : [], scope: 'all' } };
}

function toPlan(p: Parsed, note: string | undefined, ctx: ParseCtx, original: string): Plan {
  if (p.badDate && !hasDay(p)) return { kind: 'unknown', reason: 'bad-date' };
  if (!p.title) return { kind: 'unknown', reason: 'no-title' };
  p.title = restoreCase(p.title, original);
  // ліки й процедури улюбленця — «Імʼя: назва» («Мурчику ліки» → «Мурчик: ліки»)
  for (const name of ctx.petNames ?? []) {
    const nm = normalize(name);
    const stemN = nm.slice(0, Math.max(3, nm.length - 1));
    const [w0, ...rest] = p.title.split(' ');
    if (rest.length && w0.toLowerCase().startsWith(stemN)) {
      p.title = `${name}: ${rest.join(' ')}`;
      p.module = 'pet';
      break;
    }
  }
  // дні народження й річниці — щороку
  if (!p.repeat && /день народження|днюха|річниця/i.test(p.title) && !p.weekdays.length) p.repeat = 'yearly';
  const items = buildItems(p, ctx);
  if (note) items.forEach((i) => (i.note = restoreCase(note, original)));
  const fromCell = !!(ctx.date && !hasDay(p));
  // справа-дія без часу («купити хліб») — задача; ФОП без часу — подія на весь день (розділ 3)
  if (!p.start && !p.repeat && !p.span && p.module !== 'fop' && !(fromCell && ctx.start) && VERB_RE.test(p.title.toLowerCase())) {
    return { kind: 'task', title: capitalize(p.title), due: hasDay(p) || fromCell ? items[0].date : undefined, item: items[0] };
  }
  const say: string[] = [];
  // день не названо, а час сьогодні вже минув — на завтра (правила без ШІ не питають)
  const now = ctx.today;
  const today = toISO(now);
  const hm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  if (!hasDay(p) && !ctx.date && !p.repeat && items.length === 1 && items[0].start && items[0].date === today && items[0].start < hm) {
    items[0].date = toISO(addDays(fromISO(today), 1));
    say.push(`${items[0].start} уже минуло, тому «${items[0].title}» — на завтра.`);
  }
  if (p.clipped) say.push(`Подія не переходить через північ: «${items[0].title}» закінчується о 23:59.`);
  return { kind: 'add', items, say: say.join(' ') || undefined };
}

function parseClause(raw: string, ctx: ParseCtx, original: string, lead?: Parsed): { plans: Plan[]; lead?: Parsed } {
  if (REMOVE_RE.test(raw)) {
    const segs = splitWeak(raw.replace(REMOVE_RE, ' '), true, ctx);
    if (!segs.length) return { plans: [{ kind: 'unknown', reason: 'no-title' }] };
    const first = extract(segs[0].text, ctx, true);
    return { plans: segs.map((s) => removePlan(s.text, ctx, hasDay(first) ? first : lead)) };
  }
  // день на початку повідомлення стосується всіх справ без свого дня
  const plain = stripCmd(raw);
  const m = DAY_RE.exec(plain);
  const groups = raw.split(STRONG).filter((g) => g.trim());
  const plans: Plan[] = [];
  let leadOut = lead;
  groups.forEach((g, gi) => {
    const segs = splitWeak(g, false, ctx);
    const ps = segs.map((s) => ({ p: extract(s.text, ctx), note: s.note }));
    if (gi === 0 && m && m.index <= 3 && hasDay(ps[0].p)) leadOut = ps[0].p;
    // у групі: день першої справи — для всіх; інакше день останньої — для всіх (перелік одним рядом)
    const src = hasDay(ps[0].p) ? ps[0].p : hasDay(ps[ps.length - 1].p) ? ps[ps.length - 1].p : leadOut;
    for (const x of ps) {
      inherit(x.p, src);
      plans.push(toPlan(x.p, x.note, ctx, original));
    }
  });
  return { plans, lead: leadOut };
}

export function parsePhrase(text: string, ctx: ParseCtx): Plan[] {
  const whole = timeWords(normalize(text));
  if (!whole) return [{ kind: 'unknown', reason: 'empty' }];
  const special = replyFor(whole, ctx);
  if (special) return [special];
  const parts = clauses(whole);
  if (!parts.length) return [{ kind: 'unknown', reason: 'empty' }];
  const out: Plan[] = [];
  let lead: Parsed | undefined;
  for (const raw of parts) {
    const r = parseClause(raw, ctx, text, lead);
    out.push(...r.plans);
    lead = r.lead;
  }
  return out;
}
