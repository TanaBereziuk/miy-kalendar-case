// Модуль «харчування» (14.11): бібліотека страв у таблиці dishes (supabase/schema.sql, розділ 6).
import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { uid } from '../lib/store';
import { flushOutbox, overlay, pushOp, readOutbox, type Op } from '../lib/outbox';

export type MealCat = 'b' | 'l' | 'd' | 's';

export interface Dish {
  id: string;
  name: string;
  category?: MealCat;
  photoUrl?: string;
  prepMin?: number;
  ingredients?: string;
  steps?: string;
  sourceUrl?: string;
  tags: string[];
  fav: boolean;
  note?: string;
}
export type NewDish = Omit<Dish, 'id'>;

export const MEAL_CATS: { v: MealCat; l: string; start: string }[] = [
  { v: 'b', l: 'сніданок', start: '08:00' },
  { v: 'l', l: 'обід', start: '13:00' },
  { v: 'd', l: 'вечеря', start: '19:00' },
  { v: 's', l: 'перекус', start: '16:00' },
];
export const DISH_TAGS = ['швидко', 'пісне', 'на 2 дні'];
/** Тривалість страви в календарі, хв */
/** Стандартна тривалість страви в тижні (16.11, 19:27: 1 година, було 30 хв) */
export const MEAL_MIN = 60;

interface Row {
  id: string;
  name: string;
  category: MealCat | null;
  photo_url: string | null;
  prep_min: number | null;
  ingredients: string | null;
  steps: string | null;
  source_url: string | null;
  tags: string[] | null;
  fav: boolean;
  note: string | null;
}

const fromRow = (r: Row): Dish => ({
  id: r.id,
  name: r.name,
  category: r.category ?? undefined,
  photoUrl: r.photo_url ?? undefined,
  prepMin: r.prep_min ?? undefined,
  ingredients: r.ingredients ?? undefined,
  steps: r.steps ?? undefined,
  sourceUrl: r.source_url ?? undefined,
  tags: r.tags ?? [],
  fav: r.fav,
  note: r.note ?? undefined,
});

/** Обмеження бази: назва до 200 символів, час приготування 0–1440 хв */
const clampMin = (m?: number) => (m == null || !Number.isFinite(m) ? null : Math.min(1440, Math.max(0, Math.round(m))));

const toRow = (d: NewDish) => ({
  name: d.name.slice(0, 200),
  category: d.category ?? null,
  photo_url: d.photoUrl || null,
  prep_min: clampMin(d.prepMin),
  ingredients: d.ingredients || null,
  steps: d.steps || null,
  source_url: d.sourceUrl || null,
  tags: d.tags,
  fav: d.fav,
  note: d.note || null,
});

/** offline — є зміни, які чекають на інтернет */
export type DishSync = 'loading' | 'ok' | 'offline' | 'error' | 'missing';

/** seed — назви страв з онбордингу: додаються один раз, якщо бібліотека порожня */
export function useDishes(userId: string, seed: string[]) {
  const [dishes, setDishes] = useState<Dish[]>([]);
  const [sync, setSync] = useState<DishSync>('loading');
  const [rejected, setRejected] = useState(false);
  const seeded = useRef(false);

  const flush = useCallback(async () => {
    const r = await flushOutbox(userId, 'dishes');
    if (r.rejected) setRejected(true);
    return r;
  }, [userId]);

  const load = useCallback(async () => {
    const { left } = await flush();
    const { data, error } = await supabase.from('dishes').select('*').order('name');
    if (error) {
      // 42P01 — таблиці ще немає: власниця не запустила новий SQL
      const missing = /dishes|42P01|PGRST205/.test(`${error.code} ${error.message}`) && error.code !== '';
      setSync(missing ? 'missing' : left ? 'offline' : 'error');
      return null;
    }
    const list = (data as Row[]).map(fromRow);
    const ops = readOutbox(userId, 'dishes');
    setDishes(overlay(list, ops));
    setSync(ops.length ? 'offline' : 'ok');
    return list;
  }, [userId, flush]);

  useEffect(() => {
    let alive = true;
    (async () => {
      const list = await load();
      if (!alive || !list || seeded.current) return;
      seeded.current = true;
      const names = [...new Set(seed.map((s) => s.trim()).filter(Boolean))];
      if (list.length === 0 && names.length) {
        const rows = names.map((name) => ({ ...toRow({ name, tags: [], fav: false }), id: uid() }));
        const { error } = await supabase.from('dishes').insert(rows);
        if (!error) load();
      }
    })();
    const channel = supabase
      .channel('dishes-' + userId)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'dishes', filter: `user_id=eq.${userId}` }, () => load())
      .subscribe();
    const onBack = () => document.visibilityState === 'visible' && load();
    document.addEventListener('visibilitychange', onBack);
    window.addEventListener('online', load);
    const timer = window.setInterval(() => {
      if (readOutbox(userId, 'dishes').length) load();
    }, 20000);
    return () => {
      alive = false;
      supabase.removeChannel(channel);
      document.removeEventListener('visibilitychange', onBack);
      window.removeEventListener('online', load);
      window.clearInterval(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, load]);

  const write = useCallback(
    async (op: Op) => {
      pushOp(userId, 'dishes', op);
      const r = await flush();
      if (r.rejected) load(); // повертаємо те, що насправді лежить у базі
      else setSync(r.left ? 'offline' : 'ok');
    },
    [userId, flush, load],
  );

  const addDish = useCallback(
    (d: NewDish) => {
      const id = uid();
      const obj = { ...d, id };
      setDishes((prev) => [...prev, obj]);
      write({ kind: 'upsert', id, row: toRow(d), obj });
      return id;
    },
    [write],
  );
  const updateDish = useCallback(
    (id: string, d: NewDish) => {
      const obj = { ...d, id };
      setDishes((prev) => prev.map((x) => (x.id === id ? obj : x)));
      write({ kind: 'upsert', id, row: toRow(d), obj });
    },
    [write],
  );
  const removeDish = useCallback(
    (id: string) => {
      setDishes((prev) => prev.filter((x) => x.id !== id));
      write({ kind: 'delete', id });
    },
    [write],
  );

  return { dishes, sync, rejected, dismissRejected: () => setRejected(false), addDish, updateDish, removeDish, reload: load };
}

/** Імпорт за посиланням: у робочому застосунку серверна функція /api/import-recipe читає розмітку schema.org/Recipe.
 * У демоверсії сервера немає. */
export async function importFromUrl(_url: string): Promise<NewDish> {
  throw new Error('У демоверсії імпорт за посиланням вимкнено. Додайте назву й опис вручну.');
}

/** Страва в тижні (16.11, 17:18): source події — `dish:<id>`; `#slot` — страва лежить у смузі групи
 *  («ранок», «день», «вечір») без точного часу (start — звичний час групи, щоб на телефоні йшла по порядку). */
export const SLOT_MARK = '#slot';
/** `#period` (23.11, етап 4) — страва на весь період («ранок», «день», «вечір»): start–end = межі групи,
 *  у тижні фото фоном на всю висоту періоду під іншими подіями, назва вгорі картки. */
export const PERIOD_MARK = '#period';
/** Куди поклали страву: true — у смугу групи, 'period' — на весь період, інакше — на годину */
export type DishPlace = boolean | 'period';
export const dishIdOf = (source?: string) => (source?.startsWith('dish:') ? source.slice(5).split('#')[0] : undefined);
export const isSlot = (source?: string) => !!source?.startsWith('dish:') && source.endsWith(SLOT_MARK);
export const isPeriod = (source?: string) => !!source?.startsWith('dish:') && source.endsWith(PERIOD_MARK);
export const dishSource = (id: string, slot?: DishPlace) => `dish:${id}${slot === 'period' ? PERIOD_MARK : slot ? SLOT_MARK : ''}`;
/** Підпис під назвою в бібліотеці (16.11, 17:18): продукти через кому, а якщо їх немає — опис */
export const dishSubtitle = (d: Dish) =>
  (d.ingredients ?? '')
    .split(/\n|;/)
    .map((x) => x.replace(/^[-•\s]+/, '').trim())
    .filter(Boolean)
    .join(', ') || (d.note ?? '').replace(/\s+/g, ' ').trim();
