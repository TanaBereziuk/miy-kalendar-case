// Приклад тижня для демоверсії. Усі люди, тварини й плани тут вигадані.
// Тиждень будується від сьогоднішнього дня, тож демо завжди відкривається на заповненому тижні.
// Дані живуть лише в памʼяті сторінки (див. src/lib/supabase.ts).
import { defaultAnswers, newMed, newPet, type Answers } from '../onboarding/answers';
import { generateItems } from '../onboarding/generate';
import { addDays, startOfWeek, toISO } from '../lib/dates';
import type { NewItem } from '../types';

const id = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36);

// Фото: Unsplash (безкоштовно за Unsplash License), з CDN Unsplash.
// ?photos=0 — без фото (для скриншотів промо-сторінки там, де CDN недоступний)
const NO_PHOTOS = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('photos') === '0';
const photo = (pid: string) => `https://images.unsplash.com/photo-${pid}?w=720&q=75&auto=format&fit=crop`;

const DISHES: { name: string; prep: number; fav?: boolean; text: string; photo: string }[] = [
  {
    name: 'Сирники зі сметаною',
    prep: 25,
    photo: photo('1597990566967-a0cffc700e1a'),
    fav: true,
    text: 'Інгредієнти:\n- сир 400 г\n- яйце 1 шт\n- борошно 3 ст. л.\n- сметана',
  },
  {
    name: 'Вівсянка з ягодами',
    prep: 10,
    photo: photo('1594490150174-b349c66d93c5'),
    text: 'Інгредієнти:\n- вівсяні пластівці 60 г\n- молоко 200 мл\n- ягоди\n- мед',
  },
  {
    name: 'Борщ',
    prep: 90,
    photo: photo('1780814303735-686588637714'),
    fav: true,
    text: 'Інгредієнти:\n- буряк\n- капуста\n- картопля\n- морква\n- цибуля\n- томатна паста',
  },
  {
    name: 'Запечена курка',
    prep: 80,
    photo: photo('1501200291289-c5a76c232e5f'),
    text: 'Інгредієнти:\n- курка ціла 1,5 кг\n- часник\n- розмарин\n- лимон\n- олія',
  },
  {
    name: 'Пенне з томатним соусом',
    prep: 20,
    photo: photo('1776810250123-119d15036790'),
    text: 'Інгредієнти:\n- пенне 200 г\n- томати в соку\n- часник\n- орегано\n- пармезан',
  },
  {
    name: 'Табуле з булгуром',
    prep: 15,
    photo: photo('1786174044919-c2119725afa1'),
    text: 'Інгредієнти:\n- булгур 100 г\n- огірок\n- помідор\n- петрушка\n- лимон',
  },
];

function demoAnswers(today: Date): Answers {
  const a = defaultAnswers();
  a.food.dishes = DISHES.map((d) => d.name);
  a.fop = { ...a.fop, how: 'manual', grp: 3, vat: false, esv: 'pay' };
  a.hobby.acts = [
    { id: 'act-dance', name: 'Танці', icon: 'music', mode: 'fixed', days: [1, 0, 1, 0, 0, 0, 0], time: '19:00', n: 2, dur: 90 },
    { id: 'act-yoga', name: 'Йога', icon: 'heart', mode: 'fixed', days: [0, 0, 0, 0, 0, 1, 0], time: '10:00', n: 1, dur: 60 },
    { id: 'act-run', name: 'Біг', icon: 'run', mode: 'fixed', days: [0, 1, 0, 1, 0, 0, 0], time: '07:30', n: 2, dur: 45 },
    // «N разів на тиждень» — чип у рядку «цього тижня»
    { id: 'act-pool', name: 'Басейн', icon: 'heart', mode: 'n', days: [0, 0, 0, 0, 0, 0, 0], time: '18:00', n: 2, dur: 60 },
  ];
  const pet = newPet();
  pet.name = 'Мурка';
  pet.kind = 'cat';
  pet.medOn = true;
  pet.meds = [{ ...newMed(), name: 'вітаміни', freq: 'daily', perDay: 1, t: ['07:00'], start: toISO(startOfWeek(today)) }];
  pet.vaccOn = true;
  pet.vaccs.complex = { last: toISO(addDays(today, -350)), iv: 12 };
  pet.vetOn = true;
  pet.vetMode = 'planned';
  pet.vetDate = toISO(addDays(startOfWeek(today), 3));
  pet.vetTime = '17:30';
  pet.vetBook = true;
  a.pet.pets = [pet];

  // Стікери-коти: на сьогоднішньому дні і в одній клітинці
  const monday = startOfWeek(today);
  a.stickers = {
    [toISO(today)]: ['cool'],
    [`${toISO(addDays(monday, 2))}T19:00`]: ['hat'],
  };
  return a;
}

// усім рядкам — однаковий час створення (порядок чипів і задач тримається за ним)
const CREATED = new Date().toISOString();

const itemRow = (d: NewItem & { id?: string }) => ({
  id: d.id ?? id(),
  title: d.title,
  module: d.module,
  date: d.date,
  all_day: d.allDay,
  start_time: d.allDay ? null : d.start ?? null,
  end_time: d.allDay ? null : d.end ?? null,
  note: d.note ?? null,
  repeat: d.repeat ?? null,
  source: d.source ?? null,
  undated: d.undated ?? false,
  user_id: 'demo-user',
  created_at: CREATED,
  updated_at: CREATED,
});

/** empty = порожній календар без профілю: демо відкривається з онбордингу */
export function seedTables(today = new Date(), empty = false): Record<string, Record<string, unknown>[]> {
  if (empty) return { profiles: [], dishes: [], items: [], tasks: [] };

  const answers = demoAnswers(today);
  const monday = startOfWeek(today);
  const day = (i: number) => toISO(addDays(monday, i));

  const dishes = DISHES.map((d) => ({
    id: id(),
    name: d.name,
    category: null,
    photo_url: NO_PHOTOS ? null : d.photo,
    prep_min: d.prep,
    ingredients: null,
    steps: null,
    source_url: null,
    tags: [],
    fav: !!d.fav,
    note: d.text,
    user_id: 'demo-user',
    created_at: CREATED,
    updated_at: CREATED,
  }));
  const dishByName = (n: string) => dishes.find((d) => d.name === n)!;

  const plus60 = (t: string) => `${String(Number(t.slice(0, 2)) + 1).padStart(2, '0')}${t.slice(2)}`;
  // Страви тижня: [день, страва, час]
  const meals: [number, string, string][] = [
    [0, 'Вівсянка з ягодами', '08:00'],
    [0, 'Борщ', '13:00'],
    [1, 'Борщ', '13:00'],
    [2, 'Сирники зі сметаною', '08:30'],
    [2, 'Табуле з булгуром', '13:00'],
    [3, 'Пенне з томатним соусом', '19:30'],
    [5, 'Сирники зі сметаною', '08:30'],
    [6, 'Запечена курка', '14:00'],
  ];
  const mealItems: NewItem[] = meals.map(([i, name, t]) => ({
    title: name,
    module: 'food',
    date: day(i),
    allDay: false,
    start: t,
    end: plus60(t),
    source: `dish:${dishByName(name).id}`,
  }));
  // Дві страви на весь вечір суботи (стопка фото на смузі «вечір», 26.11) і страва в смузі «ранок» пʼятниці
  mealItems.push(
    { title: 'Запечена курка', module: 'food', date: day(5), allDay: false, start: '18:00', end: '22:00', source: `dish:${dishByName('Запечена курка').id}#period` },
    { title: 'Табуле з булгуром', module: 'food', date: day(5), allDay: false, start: '18:00', end: '22:00', source: `dish:${dishByName('Табуле з булгуром').id}#period` },
    { title: 'Вівсянка з ягодами', module: 'food', date: day(4), allDay: false, start: '08:00', end: '09:00', source: `dish:${dishByName('Вівсянка з ягодами').id}#slot` },
  );

  const friendId = id();
  const manual: (NewItem & { id?: string })[] = [
    { id: friendId, title: 'Зустріч з подругою', module: 'other', date: day(4), allDay: false, start: '18:30', end: '20:00' },
    // день народження: імʼя на синій підкладці у «весь день», кіт із тортом у шапці дня
    { title: 'Мама', module: 'other', date: day(6), allDay: true, repeat: { freq: 'yearly' }, source: 'bday:1968' },
    // прострочене нагадування ФОП — угорі лівої панелі на підкладці кольору модуля
    { title: 'Сплатити єдиний податок', module: 'fop', date: toISO(addDays(today, -1)), allDay: true, source: 'demo:fop' },
    // справи без дати — чипи в рядку «цього тижня»
    { title: 'Записатися до стоматолога', module: 'other', date: toISO(today), allDay: false, start: '09:00', end: '10:00', undated: true },
    { title: 'Купити новий килимок для йоги', module: 'hobby', date: toISO(today), allDay: false, start: '09:00', end: '10:00', undated: true },
  ];

  const items = [...generateItems(answers, today), ...mealItems, ...manual].map(itemRow);
  const vet = items.find((r) => r.module === 'pet' && /ветеринар/i.test(r.title));

  const now = new Date().toISOString();
  const task = (title: string, extra: Record<string, unknown> = {}) => ({
    id: id(),
    user_id: 'demo-user',
    title,
    due: null,
    item_id: null,
    item_date: null,
    done_at: null,
    created_at: now,
    updated_at: now,
    ...extra,
  });
  const tasks = [
    task('Подзвонити бухгалтеру', { due: toISO(today) }),
    task('Зібрати документи для декларації', { due: toISO(addDays(today, 1)) }),
    task('Обрати подарунок мамі', { due: day(5) }),
    task('Забронювати столик', { item_id: friendId, item_date: day(4) }),
    ...(vet ? [task('Взяти ветпаспорт', { item_id: vet.id, item_date: vet.date })] : []),
    task('Подивитися новий рецепт супу'),
  ];

  return {
    profiles: [{ user_id: 'demo-user', settings: answers, onboarded_at: now }],
    dishes,
    items,
    tasks,
  };
}
