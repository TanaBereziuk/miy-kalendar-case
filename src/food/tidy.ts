// Упорядкування інгредієнтів через ШІ (26.11): /api/ingredients повертає назви в називному відмінку й обʼєднує дублі.
// Результат — рядки «кисломолочний сир — 500 г» (без кількості — лише назва). Уже впорядковані переліки памʼятаємо
// в localStorage, щоб не питати ШІ щоразу. Немає ключа, ліміт чи інтернету — повертаємо null, лишається як записано.
import { supabase } from '../lib/supabase';

const KEY = 'miy-kalendar:ingr-tidy';

function hash(s: string) {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}
function load(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || '[]');
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}
/** Цей перелік уже впорядковано (або ШІ лишив його як є) */
export function isTidy(lines: string[]) {
  return load().includes(hash(lines.join('\n')));
}
export function markTidy(...lists: string[][]) {
  try {
    const set = load().filter((h) => !lists.some((l) => hash(l.join('\n')) === h));
    set.push(...lists.map((l) => hash(l.join('\n'))));
    localStorage.setItem(KEY, JSON.stringify(set.slice(-500)));
  } catch {
    /* сховище недоступне — просто спитаємо ще раз */
  }
}

export async function tidyIngredients(lines: string[], dish: string): Promise<string[] | null> {
  try {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    // Демоверсія: серверних функцій немає — лише запасне правило
    if (!token || token === 'demo') return null;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 20000);
    const r = await fetch('/api/ingredients', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ lines, dish }),
      signal: ctrl.signal,
    }).finally(() => clearTimeout(timer));
    if (!r.ok) return null;
    const body = await r.json();
    if (!Array.isArray(body?.items) || !body.items.length) return null;
    return body.items
      .map((x: { name?: string; amount?: string }) => {
        const name = String(x.name || '').trim();
        const amount = String(x.amount || '').trim();
        return name ? (amount ? `${name} — ${amount}` : name) : '';
      })
      .filter(Boolean);
  } catch {
    return null;
  }
}
