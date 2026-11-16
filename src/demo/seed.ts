// Sample data for the public demo. All people, pets and plans here are invented.
// The week is built relative to today, so the demo always opens on a filled week.
import { defaultAnswers, newMed, newPet, type Answers } from '../onboarding/answers';
import { generateItems } from '../onboarding/generate';
import { addDays, startOfWeek, toISO } from '../lib/dates';
import type { NewItem } from '../types';

const id = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36);

const DISHES: { name: string; prep: number; fav?: boolean; text: string }[] = [
  {
    name: 'Сирники зі сметаною',
    prep: 25,
    fav: true,
    text: 'Інгредієнти:\n- сир 400 г\n- яйце 1 шт\n- борошно 3 ст. л.\n- сметана',
  },
  {
    name: 'Вівсянка з ягодами',
    prep: 10,
    text: 'Інгредієнти:\n- вівсяні пластівці 60 г\n- молоко 200 мл\n- ягоди\n- мед',
  },
  {
    name: 'Борщ',
    prep: 90,
    fav: true,
    text: 'Інгредієнти:\n- буряк\n- капуста\n- картопля\n- морква\n- цибуля\n- томатна паста',
  },
  {
    name: 'Курка з овочами в духовці',
    prep: 50,
    text: 'Інгредієнти:\n- куряче філе 500 г\n- кабачок\n- перець\n- цибуля\n- олія',
  },
  {
    name: 'Паста з томатами й базиліком',
    prep: 20,
    text: 'Інгредієнти:\n- паста 200 г\n- томати черрі\n- часник\n- базилік\n- пармезан',
  },
  {
    name: 'Салат з булгуром',
    prep: 15,
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
  ];
  const pet = newPet();
  pet.name = 'Мурка';
  pet.kind = 'cat';
  pet.medOn = true;
  pet.meds = [{ ...newMed(), name: 'вітаміни', freq: 'daily', perDay: 1, t: ['09:00'], start: toISO(startOfWeek(today)) }];
  pet.vaccOn = true;
  pet.vaccs.complex = { last: toISO(addDays(today, -350)), iv: 12 };
  pet.vetOn = true;
  pet.vetMode = 'planned';
  pet.vetDate = toISO(addDays(startOfWeek(today), 3));
  pet.vetTime = '17:30';
  pet.vetBook = true;
  a.pet.pets = [pet];
  return a;
}

const itemRow = (d: NewItem) => ({
  id: id(),
  title: d.title,
  module: d.module,
  date: d.date,
  all_day: d.allDay,
  start_time: d.allDay ? null : d.start ?? null,
  end_time: d.allDay ? null : d.end ?? null,
  note: d.note ?? null,
  repeat: d.repeat ?? null,
  source: d.source ?? null,
});

export function seedTables(today = new Date()) {
  const answers = demoAnswers(today);
  const monday = startOfWeek(today);
  const day = (i: number) => toISO(addDays(monday, i));

  const dishes = DISHES.map((d) => ({
    id: id(),
    name: d.name,
    category: null,
    photo_url: null,
    prep_min: d.prep,
    ingredients: null,
    steps: null,
    source_url: null,
    tags: [],
    fav: !!d.fav,
    note: d.text,
  }));
  const dishByName = (n: string) => dishes.find((d) => d.name === n)!;

  // Meals for this week: [day index, dish, start time]
  const meals: [number, string, string][] = [
    [0, 'Вівсянка з ягодами', '08:00'],
    [0, 'Борщ', '13:00'],
    [1, 'Борщ', '13:00'],
    [1, 'Курка з овочами в духовці', '19:30'],
    [2, 'Сирники зі сметаною', '08:30'],
    [2, 'Салат з булгуром', '13:00'],
    [3, 'Паста з томатами й базиліком', '19:30'],
    [4, 'Вівсянка з ягодами', '08:00'],
    [5, 'Сирники зі сметаною', '09:30'],
    [6, 'Курка з овочами в духовці', '14:00'],
  ];
  const plus30 = (t: string) => {
    const [h, m] = t.split(':').map(Number);
    const x = h * 60 + m + 30;
    return `${String(Math.floor(x / 60)).padStart(2, '0')}:${String(x % 60).padStart(2, '0')}`;
  };
  const mealItems: NewItem[] = meals.map(([i, name, t]) => ({
    title: name,
    module: 'food',
    date: day(i),
    allDay: false,
    start: t,
    end: plus30(t),
    source: `dish:${dishByName(name).id}`,
  }));

  const manual: NewItem[] = [
    { title: 'Зустріч з подругою', module: 'other', date: day(4), allDay: false, start: '18:30', end: '20:00' },
    { title: 'День народження мами', module: 'other', date: day(6), allDay: true, repeat: { freq: 'yearly' } },
  ];

  const items = [...generateItems(answers, today), ...mealItems, ...manual].map(itemRow);

  return {
    profiles: [{ user_id: 'demo-user', settings: answers, onboarded_at: new Date().toISOString() }],
    dishes,
    items,
  };
}
