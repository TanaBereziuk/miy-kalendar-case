import { supabase } from './supabase';

/**
 * Черга змін, які ще не дійшли до бази (16.11, після ревʼю коду).
 * Кожна зміна спершу записується сюди (localStorage), потім надсилається.
 * Немає звʼязку — зміна лишається в черзі й надсилається пізніше,
 * а на екрані її видно одразу (overlay). Якщо база зміну відхилила
 * (наприклад, назва задовга), зміну прибираємо й показуємо попередження.
 */

export type Table = 'items' | 'dishes';

export type Op =
  /** створити або повністю замінити рядок (повтор безпечний) */
  | { kind: 'upsert'; id: string; row: Record<string, unknown>; obj: unknown }
  | { kind: 'update'; id: string; row: Record<string, unknown>; obj: unknown }
  | { kind: 'delete'; id: string };

export interface FlushResult {
  /** скільки змін ще чекає на звʼязок */
  left: number;
  /** скільки змін база відхилила (їх прибрано з черги) */
  rejected: number;
}

const key = (userId: string, t: Table) => `miy-kalendar:outbox:${t}:${userId}`;

export function readOutbox(userId: string, t: Table): Op[] {
  try {
    const v = JSON.parse(localStorage.getItem(key(userId, t)) ?? '[]');
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

function save(userId: string, t: Table, ops: Op[]) {
  try {
    if (ops.length) localStorage.setItem(key(userId, t), JSON.stringify(ops));
    else localStorage.removeItem(key(userId, t));
  } catch {
    // переповнене сховище — черга житиме лише до перезавантаження
  }
}

export function pushOp(userId: string, t: Table, op: Op) {
  save(userId, t, [...readOutbox(userId, t), op]);
}

/** Тимчасові збої: немає мережі (0), сервер зайнятий, сесія оновлюється. Їх повторюємо. */
const transient = (status: number) => status === 0 || status === 401 || status === 408 || status === 429 || status >= 500;

function run(t: Table, op: Op) {
  const q = supabase.from(t);
  if (op.kind === 'upsert') return q.upsert({ ...op.row, id: op.id }, { onConflict: 'id' });
  if (op.kind === 'update') return q.update(op.row).eq('id', op.id);
  return q.delete().eq('id', op.id);
}

const running = new Map<string, Promise<FlushResult>>();

/** Надсилає зміни з черги по черзі; зупиняється на першому тимчасовому збої. */
export function flushOutbox(userId: string, t: Table): Promise<FlushResult> {
  const k = key(userId, t);
  const cur = running.get(k);
  if (cur) return cur;
  const p = (async () => {
    let rejected = 0;
    for (;;) {
      const ops = readOutbox(userId, t);
      if (!ops.length) return { left: 0, rejected };
      let status = 0;
      let failed = true;
      try {
        const res = await run(t, ops[0]);
        status = res.status;
        failed = !!res.error;
      } catch {
        status = 0;
      }
      if (failed && transient(status)) return { left: ops.length, rejected };
      if (failed) rejected++;
      // нові зміни лише дописуються в кінець, тож перша — та сама
      save(userId, t, readOutbox(userId, t).slice(1));
    }
  })().finally(() => running.delete(k));
  running.set(k, p);
  return p;
}

/** Накладає ще не надіслані зміни на те, що прийшло з бази. */
export function overlay<T extends { id: string }>(list: T[], ops: Op[]): T[] {
  let out = list;
  for (const op of ops) {
    if (op.kind === 'delete') out = out.filter((x) => x.id !== op.id);
    else if (op.kind === 'update') out = out.map((x) => (x.id === op.id ? { ...x, ...(op.obj as Partial<T>) } : x));
    else {
      const obj = op.obj as T;
      out = out.some((x) => x.id === op.id) ? out.map((x) => (x.id === op.id ? obj : x)) : [...out, obj];
    }
  }
  return out;
}
