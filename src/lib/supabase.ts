// Demo build: there is no backend. This file replaces the real Supabase client
// with a tiny in-browser stand-in that implements only the calls the app makes.
// Everything is stored in localStorage of the visitor, so each visitor gets
// their own sandbox and nothing leaves the browser.
//
// In the production app this module exports `createClient(URL, KEY)` from
// @supabase/supabase-js; the rest of the data layer (store.ts, dishes.ts,
// profile.ts, outbox.ts) is the same code as in production.

import { seedTables } from '../demo/seed';

type Row = Record<string, unknown>;
type DbError = { message: string; code: string };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Result = { data: any; error: DbError | null; status: number };

export const DEMO_USER_ID = 'demo-user';
const PREFIX = 'miy-kalendar-demo:table:';
const SEEDED = 'miy-kalendar-demo:seeded';

function ensureSeeded() {
  try {
    if (localStorage.getItem(SEEDED)) return;
    const tables = seedTables();
    for (const [name, rows] of Object.entries(tables)) {
      localStorage.setItem(PREFIX + name, JSON.stringify(rows));
    }
    localStorage.setItem(SEEDED, new Date().toISOString());
  } catch {
    /* storage unavailable — the app still works for the session */
  }
}

const memory: Record<string, Row[]> = {};

function readTable(name: string): Row[] {
  ensureSeeded();
  try {
    const raw = localStorage.getItem(PREFIX + name);
    if (raw) return JSON.parse(raw);
  } catch {
    /* fall through */
  }
  return memory[name] ?? [];
}

function writeTable(name: string, rows: Row[]) {
  memory[name] = rows;
  try {
    localStorage.setItem(PREFIX + name, JSON.stringify(rows));
  } catch {
    /* quota or private mode — keep in memory */
  }
}

/** Clears the sandbox; the next load seeds a fresh demo week. */
export function resetDemo() {
  try {
    Object.keys(localStorage)
      .filter((k) => k.startsWith('miy-kalendar'))
      .forEach((k) => localStorage.removeItem(k));
  } catch {
    /* ignore */
  }
}

type Filter = (r: Row) => boolean;
type Order = { col: string; asc: boolean; nullsFirst: boolean };

const likeToRegExp = (pattern: string) =>
  new RegExp('^' + pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/%/g, '.*').replace(/_/g, '.') + '$');

class Query implements PromiseLike<Result> {
  private filters: Filter[] = [];
  private orders: Order[] = [];
  private from?: number;
  private to?: number;
  private single = false;
  private action: 'select' | 'insert' | 'upsert' | 'update' | 'delete' = 'select';
  private payload: Row[] = [];
  private patch: Row = {};
  private onConflict = 'id';
  private ignoreDuplicates = false;

  constructor(private table: string) {}

  select(_cols?: string) {
    return this;
  }
  insert(rows: Row | Row[]) {
    this.action = 'insert';
    this.payload = Array.isArray(rows) ? rows : [rows];
    return this;
  }
  upsert(rows: Row | Row[], opts?: { onConflict?: string; ignoreDuplicates?: boolean }) {
    this.action = 'upsert';
    this.payload = Array.isArray(rows) ? rows : [rows];
    this.onConflict = opts?.onConflict ?? 'id';
    this.ignoreDuplicates = !!opts?.ignoreDuplicates;
    return this;
  }
  update(patch: Row) {
    this.action = 'update';
    this.patch = patch;
    return this;
  }
  delete() {
    this.action = 'delete';
    return this;
  }
  eq(col: string, value: unknown) {
    this.filters.push((r) => r[col] === value);
    return this;
  }
  like(col: string, pattern: string) {
    const re = likeToRegExp(pattern);
    this.filters.push((r) => typeof r[col] === 'string' && re.test(r[col] as string));
    return this;
  }
  order(col: string, opts?: { ascending?: boolean; nullsFirst?: boolean }) {
    this.orders.push({ col, asc: opts?.ascending ?? true, nullsFirst: !!opts?.nullsFirst });
    return this;
  }
  range(from: number, to: number) {
    this.from = from;
    this.to = to;
    return this;
  }
  maybeSingle() {
    this.single = true;
    return this;
  }

  private matches(r: Row) {
    return this.filters.every((f) => f(r));
  }

  private run(): Result {
    const now = new Date().toISOString();
    const rows = readTable(this.table);

    if (this.action === 'select') {
      let out = rows.filter((r) => this.matches(r));
      if (this.orders.length) {
        out = [...out].sort((a, b) => {
          for (const o of this.orders) {
            const x = a[o.col] as string | number | null | undefined;
            const y = b[o.col] as string | number | null | undefined;
            if (x === y) continue;
            if (x == null) return o.nullsFirst ? -1 : 1;
            if (y == null) return o.nullsFirst ? 1 : -1;
            const c = x < y ? -1 : 1;
            return o.asc ? c : -c;
          }
          return 0;
        });
      }
      if (this.from != null) out = out.slice(this.from, (this.to ?? out.length - 1) + 1);
      return { data: this.single ? out[0] ?? null : out, error: null, status: 200 };
    }

    if (this.action === 'insert' || this.action === 'upsert') {
      const next = [...rows];
      for (const p of this.payload) {
        const key = this.onConflict;
        const i = next.findIndex((r) => r[key] === p[key]);
        const base = { user_id: DEMO_USER_ID, created_at: now, updated_at: now };
        if (i >= 0) {
          if (this.action === 'insert' || this.ignoreDuplicates) continue;
          next[i] = { ...next[i], ...p, updated_at: now };
        } else {
          next.push({ ...base, ...p });
        }
      }
      writeTable(this.table, next);
      return { data: null, error: null, status: 200 };
    }

    if (this.action === 'update') {
      writeTable(
        this.table,
        rows.map((r) => (this.matches(r) ? { ...r, ...this.patch, updated_at: now } : r)),
      );
      return { data: null, error: null, status: 200 };
    }

    writeTable(
      this.table,
      rows.filter((r) => !this.matches(r)),
    );
    return { data: null, error: null, status: 200 };
  }

  then<A = Result, B = never>(
    onfulfilled?: ((value: Result) => A | PromiseLike<A>) | null,
    onrejected?: ((reason: unknown) => B | PromiseLike<B>) | null,
  ): PromiseLike<A | B> {
    return Promise.resolve()
      .then(() => this.run())
      .then(onfulfilled, onrejected);
  }
}

const channel = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  on(_event: string, _filter: unknown, _cb: (payload: any) => void) {
    return channel;
  },
  subscribe() {
    return channel;
  },
};

const session = { access_token: 'demo', user: { id: DEMO_USER_ID, email: 'демоверсія' } };

export const supabase = {
  from: (table: string) => new Query(table),
  channel: (_name: string) => channel,
  removeChannel: (_c: unknown) => undefined,
  auth: {
    getSession: async () => ({ data: { session }, error: null }),
  },
};

export const demoSession = session;
