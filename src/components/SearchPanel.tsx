// Пошук і «найближче» (18.11, аудит, п. 7 і 12): кнопка з лупою в шапці (або клавіша /) відкриває картку пошуку.
// Порожнє поле — найближчі події на 60 днів (без щоденних повторів, щоб ліки не забивали список);
// з текстом — події з такою назвою чи нотаткою: спершу майбутні (найближчий повтор серії), потім минулі.
import { useEffect, useMemo, useRef, useState } from 'react';
import { MODULES, type CalendarItem } from '../types';
import { DAYS_SHORT, MONTHS_GEN, addDays, fromISO, toISO, weekdayIndex } from '../lib/dates';
import { occursOn } from '../lib/repeat';
import { ICONS, Icon } from './Icon';

/** Лупа: суцільна, прямі краї (та сама, що в пошуку страв) */
export const SEARCH_ICON = 'M3 3h12v12H3zM6 6v6h6V6zM13.5 16 16 13.5l5 5-2.5 2.5z';

interface Props {
  items: CalendarItem[];
  phone: boolean;
  onPick: (item: CalendarItem, date: string) => void;
  onClose: () => void;
}

interface Hit {
  item: CalendarItem;
  date: string;
}

const AHEAD = 60;
const SEARCH_AHEAD = 400;

export function dayLabel(iso: string): string {
  const d = fromISO(iso);
  const today = toISO(new Date());
  const tomorrow = toISO(addDays(new Date(), 1));
  const base = `${DAYS_SHORT[weekdayIndex(d)].toLowerCase()}, ${d.getDate()} ${MONTHS_GEN[d.getMonth()]}`;
  if (iso === today) return `сьогодні, ${d.getDate()} ${MONTHS_GEN[d.getMonth()]}`;
  if (iso === tomorrow) return `завтра, ${d.getDate()} ${MONTHS_GEN[d.getMonth()]}`;
  return d.getFullYear() === new Date().getFullYear() ? base : `${base} ${d.getFullYear()}`;
}

/** Найближча дата серії від сьогодні (у межах days днів) */
function nextOccurrence(it: CalendarItem, from: Date, days: number): string | null {
  if (!it.repeat) return null;
  for (let i = 0; i < days; i++) {
    const d = addDays(from, i);
    if (occursOn(it, d)) return toISO(d);
  }
  return null;
}

export function SearchPanel({ items, phone, onPick, onClose }: Props) {
  const [q, setQ] = useState('');
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const t = window.setTimeout(() => input.current?.focus(), 30);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  const hits: Hit[] = useMemo(() => {
    const today = new Date();
    const todayISO = toISO(today);
    const s = q.trim().toLowerCase();
    if (!s) {
      // найближче: усі покази на 60 днів, крім щоденних повторів
      const out: Hit[] = [];
      for (let i = 0; i < AHEAD && out.length < 40; i++) {
        const d = addDays(today, i);
        const iso = toISO(d);
        for (const it of items) {
          if (it.repeat?.freq === 'daily') continue;
          if (it.repeat ? occursOn(it, d) : it.date === iso) out.push({ item: it, date: iso });
        }
      }
      return out
        .sort((a, b) => a.date.localeCompare(b.date) || (a.item.start ?? '').localeCompare(b.item.start ?? ''))
        .slice(0, 40);
    }
    const match = items.filter((it) => it.title.toLowerCase().includes(s) || it.note?.toLowerCase().includes(s));
    const future: Hit[] = [];
    const past: Hit[] = [];
    for (const it of match) {
      if (it.repeat) {
        const next = nextOccurrence(it, today, SEARCH_AHEAD);
        if (next) future.push({ item: it, date: next });
        else past.push({ item: it, date: it.date });
      } else (it.date >= todayISO ? future : past).push({ item: it, date: it.date });
    }
    future.sort((a, b) => a.date.localeCompare(b.date));
    past.sort((a, b) => b.date.localeCompare(a.date));
    return [...future, ...past].slice(0, 40);
  }, [items, q]);

  const groups: { date: string; list: Hit[] }[] = [];
  for (const h of hits) {
    const g = groups[groups.length - 1];
    if (g && g.date === h.date) g.list.push(h);
    else groups.push({ date: h.date, list: [h] });
  }

  return (
    <div className={'event-view-overlay' + (phone ? ' phone' : '')} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="event-view search-panel" role="dialog" aria-label="Пошук подій">
        <div className="search-head">
          <div className="food-search-wrap search-field">
            <Icon d={SEARCH_ICON} size={16} />
            <input
              ref={input}
              className="food-search"
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="пошук подій"
              aria-label="Пошук подій"
            />
          </div>
          <button type="button" className="round-btn" aria-label="Закрити" onClick={onClose}>
            <Icon d={ICONS.close} size={12} />
          </button>
        </div>
        <p className="search-caption">{q.trim() ? (hits.length ? 'знайдено' : 'нічого не знайдено') : 'найближче'}</p>
        <div className="search-list">
          {!q.trim() && hits.length === 0 && <p className="muted-text">На найближчі два місяці подій немає.</p>}
          {groups.map((g) => (
            <section key={g.date} className="search-day">
              <h3>{dayLabel(g.date)}</h3>
              {g.list.map((h) => {
                const m = MODULES[h.item.module];
                return (
                  <button type="button" key={h.item.id + h.date} className="search-row" onClick={() => onPick(h.item, h.date)}>
                    <span className="suggest-tile" style={{ background: m.color, color: m.text }}>
                      <Icon d={m.icon} size={12} />
                    </span>
                    <span className="search-title">{h.item.title}</span>
                    <span className="search-time">{h.item.allDay ? 'весь день' : h.item.start}</span>
                  </button>
                );
              })}
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
