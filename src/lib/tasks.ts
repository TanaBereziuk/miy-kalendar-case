// Задачі (етап 1 плану, 18.11): окремий список у таблиці tasks (supabase/schema.sql, розділ 7).
// Задача — не подія: без часу, з необовʼязковим днем; її можна підвʼязати до події (тоді вона — у чеклісті події).
// Зміни, як і для подій, ідуть через чергу outbox: без інтернету видно одразу, надсилаються пізніше.
import { useCallback, useEffect, useState } from 'react';
import type { NewTask, Task } from '../types';
import { supabase } from './supabase';
import { flushOutbox, overlay, pushOp, readOutbox, type Op } from './outbox';
import { uid } from './store';
import { toISO } from './dates';

interface Row {
  id: string;
  title: string;
  due: string | null;
  item_id: string | null;
  item_date: string | null;
  done_at: string | null;
  created_at: string;
  updated_at: string;
}

const fromRow = (r: Row): Task => ({
  id: r.id,
  title: r.title,
  due: r.due ?? undefined,
  itemId: r.item_id ?? undefined,
  itemDate: r.item_date ?? undefined,
  doneAt: r.done_at ?? undefined,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

const toRow = (t: NewTask) => ({
  title: t.title.trim().slice(0, 300),
  due: t.due ?? null,
  item_id: t.itemId ?? null,
  item_date: t.itemDate ?? null,
  done_at: t.doneAt ?? null,
});

export const toNewTask = (t: Task): NewTask => {
  const { id: _i, createdAt: _c, updatedAt: _u, ...rest } = t;
  return rest;
};

/** missing — таблиці ще немає: новий SQL не запущено */
export type TaskSync = 'loading' | 'ok' | 'offline' | 'error' | 'missing';

/** Виконана задача видно до кінця дня, коли її позначили; потім вона зникає зі списку (в історію не йде). */
export const isVisibleTask = (t: Task, today = toISO(new Date())) => !t.doneAt || toISO(new Date(t.doneAt)) >= today;

export function useTasks(userId: string) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [sync, setSync] = useState<TaskSync>('loading');
  const [rejected, setRejected] = useState(false);

  const flush = useCallback(async () => {
    const r = await flushOutbox(userId, 'tasks');
    if (r.rejected) setRejected(true);
    return r;
  }, [userId]);

  const load = useCallback(async () => {
    const { left } = await flush();
    const { data, error } = await supabase.from('tasks').select('*').order('created_at');
    if (error) {
      const missing = /tasks|42P01|PGRST205/.test(`${error.code} ${error.message}`) && error.code !== '';
      setSync(missing ? 'missing' : left ? 'offline' : 'error');
      return;
    }
    const ops = readOutbox(userId, 'tasks');
    setTasks(overlay((data as Row[]).map(fromRow), ops));
    setSync(ops.length ? 'offline' : 'ok');
  }, [userId, flush]);

  useEffect(() => {
    setTasks(overlay([], readOutbox(userId, 'tasks')));
    load();
    const channel = supabase
      .channel('tasks-' + userId)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks', filter: `user_id=eq.${userId}` }, () => load())
      .subscribe();
    const onBack = () => document.visibilityState === 'visible' && load();
    document.addEventListener('visibilitychange', onBack);
    window.addEventListener('online', load);
    const timer = window.setInterval(() => {
      if (readOutbox(userId, 'tasks').length) load();
    }, 20000);
    return () => {
      supabase.removeChannel(channel);
      document.removeEventListener('visibilitychange', onBack);
      window.removeEventListener('online', load);
      window.clearInterval(timer);
    };
  }, [userId, load]);

  const write = useCallback(
    async (op: Op) => {
      pushOp(userId, 'tasks', op);
      const r = await flush();
      if (r.rejected) load();
      else setSync(r.left ? 'offline' : 'ok');
    },
    [userId, flush, load],
  );

  /** withId — повернути видалену задачу з тим самим id («Скасувати») */
  const addTask = useCallback(
    (t: NewTask, withId?: string) => {
      const now = new Date().toISOString();
      const id = withId ?? uid();
      const obj: Task = { ...t, id, createdAt: now, updatedAt: now };
      setTasks((prev) => [...prev.filter((x) => x.id !== id), obj]);
      write({ kind: 'upsert', id, row: toRow(t), obj });
      return id;
    },
    [write],
  );

  const updateTask = useCallback(
    (id: string, t: NewTask) => {
      const now = new Date().toISOString();
      setTasks((prev) => prev.map((x) => (x.id === id ? { ...x, ...t, due: t.due, itemId: t.itemId, itemDate: t.itemDate, doneAt: t.doneAt, updatedAt: now } : x)));
      write({ kind: 'update', id, row: toRow(t), obj: { ...t, updatedAt: now } });
    },
    [write],
  );

  const removeTask = useCallback(
    (id: string) => {
      setTasks((prev) => prev.filter((x) => x.id !== id));
      write({ kind: 'delete', id });
    },
    [write],
  );

  return { tasks, sync, rejected, dismissRejected: () => setRejected(false), addTask, updateTask, removeTask, reload: load };
}
