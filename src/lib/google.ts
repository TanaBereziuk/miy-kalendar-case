// Шар Google Календаря (18.11, аудит, п. 17): лише перегляд. Події бере серверна функція /api/google-ics
// за секретною адресою у форматі iCal; оновлюються при відкритті тижня, поверненні на вкладку й кожні 15 хв.
import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from './supabase';
import type { CalendarItem } from '../types';

export const GOOGLE_SOURCE = 'google';
export const isGoogle = (i: { source?: string }) => i.source === GOOGLE_SOURCE;

interface GEvent {
  id: string;
  title: string;
  date: string;
  allDay: boolean;
  start?: string;
  end?: string;
}

/** Перевірка адреси ще до відправлення: лише https://calendar.google.com/calendar/ical/…/….ics */
export function validIcalUrl(raw: string): boolean {
  try {
    const u = new URL(raw.trim().replace(/^webcal:/i, 'https:'));
    return u.protocol === 'https:' && u.hostname === 'calendar.google.com' && u.pathname.startsWith('/calendar/ical/') && u.pathname.endsWith('.ics');
  } catch {
    return false;
  }
}

export type GoogleState = 'off' | 'loading' | 'ok' | 'error';

export function useGoogleLayer(url: string | undefined, on: boolean, from: string, to: string) {
  const [items, setItems] = useState<CalendarItem[]>([]);
  const [state, setState] = useState<GoogleState>('off');
  const [error, setError] = useState('');
  const cache = useRef(new Map<string, { at: number; items: CalendarItem[] }>());
  const key = `${url}|${from}|${to}`;

  const load = useCallback(
    async (force = false) => {
      if (!url || !on) {
        setItems([]);
        setState('off');
        return;
      }
      const hit = cache.current.get(key);
      if (hit) setItems(hit.items);
      if (hit && !force && Date.now() - hit.at < 15 * 60 * 1000) return setState('ok');
      setState('loading');
      try {
        // демоверсія: серверної функції немає
        if (url) throw new Error('У демоверсії Google Календар не підключається.');
        const { data } = await supabase.auth.getSession();
        const token = data.session?.access_token;
        const res = await fetch('/api/google-ics', {
          method: 'POST',
          headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
          body: JSON.stringify({ url, from, to, tz: Intl.DateTimeFormat().resolvedOptions().timeZone }),
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body.error || 'Не вдалося показати Google Календар.');
        const now = new Date().toISOString();
        const list: CalendarItem[] = (body.events as GEvent[]).map((e) => ({
          id: `g:${e.id}`,
          title: e.title,
          module: 'other',
          date: e.date,
          allDay: e.allDay,
          start: e.start,
          end: e.end,
          source: GOOGLE_SOURCE,
          createdAt: now,
          updatedAt: now,
        }));
        cache.current.set(key, { at: Date.now(), items: list });
        setItems(list);
        setState('ok');
        setError('');
      } catch (e) {
        setState('error');
        setError(e instanceof Error ? e.message : 'Не вдалося показати Google Календар.');
      }
    },
    [url, on, from, to, key],
  );

  useEffect(() => {
    void load();
    const t = window.setInterval(() => void load(true), 15 * 60 * 1000);
    const vis = () => document.visibilityState === 'visible' && void load();
    document.addEventListener('visibilitychange', vis);
    return () => {
      window.clearInterval(t);
      document.removeEventListener('visibilitychange', vis);
    };
  }, [load]);

  return { items, state, error, reload: () => load(true) };
}
