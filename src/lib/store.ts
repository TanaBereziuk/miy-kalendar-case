import { useCallback, useEffect, useRef, useState } from 'react';
import type { CalendarItem, ModuleId, NewItem, Repeat } from '../types';
import { supabase } from './supabase';
import { flushOutbox, overlay, pushOp, readOutbox, type Op } from './outbox';

/**
 * Події в базі Supabase (таблиця public.items).
 * Зміни показуємо одразу, а в базу пишемо у фоні; інші пристрої
 * отримують їх через realtime і під час повернення на вкладку.
 */

interface Row {
  id: string;
  title: string;
  module: ModuleId;
  date: string;
  all_day: boolean;
  start_time: string | null;
  end_time: string | null;
  note: string | null;
  repeat: Repeat | null;
  source: string | null;
  created_at: string;
  updated_at: string;
}

const hhmm = (t: string | null) => (t ? t.slice(0, 5) : undefined);

function fromRow(r: Row): CalendarItem {
  return {
    id: r.id,
    title: r.title,
    module: r.module,
    date: r.date,
    allDay: r.all_day,
    start: hhmm(r.start_time),
    end: hhmm(r.end_time),
    note: r.note ?? undefined,
    repeat: r.repeat ?? undefined,
    source: r.source ?? undefined,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function toRow(d: NewItem) {
  return {
    title: d.title.slice(0, 300),
    module: d.module,
    date: d.date,
    all_day: d.allDay,
    start_time: d.allDay ? null : d.start ?? null,
    end_time: d.allDay ? null : d.end ?? null,
    note: d.note ?? null,
    repeat: d.repeat ?? null,
    source: d.source ?? null,
  };
}

export const uid = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
      });

// Події, створені на етапі 1 (лише в браузері). Переносимо їх у базу один раз.
const LEGACY_KEY = 'miy-kalendar:items:v1';

async function migrateLegacy(): Promise<number> {
  let legacy: CalendarItem[] = [];
  try {
    legacy = JSON.parse(localStorage.getItem(LEGACY_KEY) ?? '[]');
  } catch {
    return 0;
  }
  if (!Array.isArray(legacy) || legacy.length === 0) return 0;
  const rows = legacy.map((it) => ({ ...toRow(it), id: /^[0-9a-f-]{36}$/i.test(it.id) ? it.id : uid() }));
  const { error } = await supabase.from('items').upsert(rows, { onConflict: 'id', ignoreDuplicates: true });
  if (error) return 0;
  localStorage.removeItem(LEGACY_KEY);
  return rows.length;
}

/** offline — є зміни, які чекають на інтернет */
export type SyncState = 'loading' | 'ok' | 'offline' | 'error';

/** Скільки рядків просимо за раз; база може віддавати й менше («Max rows»). */
const PAGE = 1000;
/** Як часто пробуємо надіслати відкладені зміни, мс */
const RETRY_MS = 20000;

export function useItems(userId: string) {
  const [items, setItems] = useState<CalendarItem[]>([]);
  const [sync, setSync] = useState<SyncState>('loading');
  const [rejected, setRejected] = useState(false);
  const [migrated, setMigrated] = useState(0);
  const loadingRef = useRef(false);

  /** Надсилає чергу; повертає, скільки змін ще чекає */
  const flush = useCallback(async () => {
    const r = await flushOutbox(userId, 'items');
    if (r.rejected) setRejected(true);
    return r;
  }, [userId]);

  const load = useCallback(async () => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    try {
      const { left } = await flush();
      // Завантажуємо сторінками: інакше після ~1000 подій найновіші перестали б показуватися
      const rows: Row[] = [];
      for (;;) {
        const { data, error } = await supabase
          .from('items')
          .select('*')
          .order('date')
          .order('start_time', { nullsFirst: true })
          .order('id')
          .range(rows.length, rows.length + PAGE - 1);
        if (error) {
          setSync(left ? 'offline' : 'error');
          return;
        }
        // Порожня сторінка — кінець (так працює за будь-якого ліміту рядків у Supabase)
        if (!data.length) break;
        rows.push(...(data as Row[]));
      }
      const ops = readOutbox(userId, 'items');
      setItems(overlay(rows.map(fromRow), ops));
      setSync(ops.length ? 'offline' : 'ok');
    } finally {
      loadingRef.current = false;
    }
  }, [userId, flush]);

  useEffect(() => {
    let alive = true;
    // Показуємо відкладені зміни одразу, ще до відповіді бази
    setItems(overlay([], readOutbox(userId, 'items')));
    (async () => {
      const n = await migrateLegacy();
      if (alive && n) setMigrated(n);
      await load();
    })();

    const channel = supabase
      .channel('items-' + userId)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'items', filter: `user_id=eq.${userId}` }, (p) => {
        if (p.eventType === 'DELETE') {
          const id = (p.old as Partial<Row>).id;
          setItems((prev) => prev.filter((i) => i.id !== id));
        } else {
          const it = fromRow(p.new as Row);
          setItems((prev) => (prev.some((i) => i.id === it.id) ? prev.map((i) => (i.id === it.id ? it : i)) : [...prev, it]));
        }
      })
      .subscribe();

    const onVisible = () => document.visibilityState === 'visible' && load();
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', load);
    const timer = window.setInterval(() => {
      if (readOutbox(userId, 'items').length) load();
    }, RETRY_MS);

    return () => {
      alive = false;
      supabase.removeChannel(channel);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', load);
      window.clearInterval(timer);
    };
  }, [userId, load]);

  const write = useCallback(
    async (op: Op) => {
      pushOp(userId, 'items', op);
      const r = await flush();
      if (r.rejected) load(); // повертаємо те, що насправді лежить у базі
      else setSync(r.left ? 'offline' : 'ok');
    },
    [userId, flush, load],
  );

  /** Додає подію й повертає її id. withId — щоб повернути прибрану подію з тим самим id (скасування в асистенті). */
  const add = useCallback(
    (data: NewItem, withId?: string) => {
      const now = new Date().toISOString();
      const id = withId ?? uid();
      const obj: CalendarItem = { ...data, id, createdAt: now, updatedAt: now };
      setItems((prev) => [...prev.filter((i) => i.id !== id), obj]);
      write({ kind: 'upsert', id, row: toRow(data), obj });
      return id;
    },
    [write],
  );

  const update = useCallback(
    (id: string, data: NewItem) => {
      const now = new Date().toISOString();
      setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...data, updatedAt: now } : it)));
      write({ kind: 'update', id, row: toRow(data), obj: { ...data, updatedAt: now } });
    },
    [write],
  );

  const remove = useCallback(
    (id: string) => {
      setItems((prev) => prev.filter((it) => it.id !== id));
      write({ kind: 'delete', id });
    },
    [write],
  );

  /** Замінює всі події, створені онбордингом, новим набором. */
  const replaceGenerated = useCallback(
    async (fresh: NewItem[]) => {
      const now = new Date().toISOString();
      const withIds = fresh.map((d) => ({ ...d, id: uid() }));
      setItems((prev) => [
        ...prev.filter((i) => !i.source?.startsWith('onb:')),
        ...withIds.map((d) => ({ ...d, createdAt: now, updatedAt: now })),
      ]);
      const del = await supabase.from('items').delete().like('source', 'onb:%');
      if (del.error) {
        setSync('error');
        return false;
      }
      if (withIds.length) {
        const ins = await supabase.from('items').insert(withIds.map((d) => ({ ...toRow(d), id: d.id })));
        if (ins.error) {
          setSync('error');
          load();
          return false;
        }
      }
      setSync('ok');
      return true;
    },
    [load],
  );

  return { items, sync, rejected, dismissRejected: () => setRejected(false), migrated, add, update, remove, replaceGenerated, reload: load };
}
