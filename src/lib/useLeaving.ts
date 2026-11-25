import { useEffect, useState } from 'react';

/**
 * Анімація закриття (23.11): коли значення стає порожнім, ще `ms` повертаємо останнє непорожнє й позначку «закривається» —
 * вікно чи панель лишаються на екрані, поки відіграє анімація, і лише потім зникають.
 * Якщо в системі вимкнено анімації — закривається одразу.
 */
export function useLeaving<T>(value: T | null | undefined, ms = 200): [T | null, boolean] {
  const [kept, setKept] = useState<T | null>(value ?? null);
  useEffect(() => {
    if (value) {
      setKept(value);
      return;
    }
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const t = window.setTimeout(() => setKept(null), reduce ? 0 : ms);
    return () => window.clearTimeout(t);
  }, [value, ms]);
  if (value) return [value, false];
  return [kept, !!kept];
}
