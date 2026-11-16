import { MODULES, type CalendarItem } from '../types';
import { DAYS_FULL, DAYS_SHORT, MONTHS_GEN, sameDay, toISO, weekdayIndex } from '../lib/dates';
import { groupOf, sortByTime } from '../lib/layout';
import { useNow } from '../lib/useNow';
import { Icon } from './Icon';
import type { PendingAct } from '../App';

interface Props {
  day: Date;
  days: Date[];
  items: CalendarItem[];
  pending: PendingAct[];
  onPlan: (p: PendingAct) => void;
  onPickDay: (d: Date) => void;
  onOpen: (item: CalendarItem) => void;
  onCreate: (date: string, start?: string) => void;
  /** Харчування (14.11): «+ страва» в групі дня → вибір страви */
  onAddDish?: (sectionId: string, start: string) => void;
}

const SECTIONS = [
  { id: 'morning', name: 'ранок', range: '06:00–12:00', start: '08:00' },
  { id: 'day', name: 'день', range: '12:00–18:00', start: '13:00' },
  { id: 'evening', name: 'вечір', range: '18:00–22:00', start: '19:00' },
  { id: 'night', name: 'ніч', range: '22:00–06:00', start: '22:00' },
];

export function TodayView({ day, days, items, pending, onPlan, onPickDay, onOpen, onCreate, onAddDish }: Props) {
  const now = useNow();
  const iso = toISO(day);
  const dayItems = items.filter((i) => i.date === iso);
  const allDay = dayItems.filter((i) => i.allDay);
  const timed = sortByTime(dayItems.filter((i) => !i.allDay));

  const listFor = (id: string) =>
    timed.filter((i) => {
      const g = groupOf(i);
      return id === 'night' ? g?.night : g?.id === id;
    });

  const isToday = sameDay(day, now);

  return (
    <div className="today-view">
      <div className="day-strip" role="tablist" aria-label="Дні тижня">
        {days.map((d, i) => {
          const on = sameDay(d, day);
          const has = items.some((it) => it.date === toISO(d));
          return (
            <button
              type="button"
              role="tab"
              aria-selected={on}
              key={toISO(d)}
              className={'strip-day' + (on ? ' on' : '') + (sameDay(d, now) ? ' is-today' : '')}
              onClick={() => onPickDay(d)}
            >
              <span className="dow">{DAYS_SHORT[i]}</span>
              <span className="num">{d.getDate()}</span>
              <span className={'mark' + (has ? ' has' : '')} aria-hidden="true" />
            </button>
          );
        })}
      </div>

      <div className="today-title">
        <h1 className="head-font">{isToday ? 'сьогодні' : DAYS_FULL[weekdayIndex(day)]}</h1>
        <span className="today-date">
          {day.getDate()} {MONTHS_GEN[day.getMonth()]}
        </span>
      </div>

      {pending.length > 0 && (
        <section className="group-card">
          <h2 className="group-card-title">
            ще цього тижня <span className="group-card-range">натисніть, щоб поставити на цей день</span>
          </h2>
          <div className="chips-wrap">
            {pending.map((p) => (
              <button type="button" key={p.name} className="pending-chip" onClick={() => onPlan(p)}>
                <span className="pending-tile" style={{ background: MODULES.hobby.color }}>
                  <Icon d={MODULES.hobby.icon} size={12} />
                </span>
                {p.name}
                <span className="pending-count">
                  {p.done} з {p.total}
                </span>
              </button>
            ))}
          </div>
        </section>
      )}

      {allDay.length > 0 && (
        <section className="group-card">
          <h2 className="group-card-title">весь день</h2>
          <div className="list">
            {allDay.map((it) => (
              <Row key={it.id} item={it} onOpen={onOpen} />
            ))}
          </div>
        </section>
      )}

      {SECTIONS.map((s) => {
        const list = listFor(s.id);
        if (s.id === 'night' && list.length === 0) return null;
        return (
          <section key={s.id} className="group-card">
            <div className="group-card-head">
              <h2 className="group-card-title">
                {s.name} <span className="group-card-range">{s.range}</span>
              </h2>
              {onAddDish && s.id !== 'night' && (
                <button type="button" className="text-add" onClick={() => onAddDish(s.id, s.start)}>
                  <Icon d="M10 3h4v7h7v4h-7v7h-4v-7H3v-4h7z" size={12} />
                  Додати страву
                </button>
              )}
            </div>
            {list.length > 0 ? (
              <div className="list">
                {list.map((it) => (
                  <Row key={it.id} item={it} onOpen={onOpen} />
                ))}
              </div>
            ) : (
              <button type="button" className="empty-add" onClick={() => onCreate(iso, s.start)}>
                Додати подію
              </button>
            )}
          </section>
        );
      })}
    </div>
  );
}

function Row({ item, onOpen }: { item: CalendarItem; onOpen: (i: CalendarItem) => void }) {
  const m = MODULES[item.module];
  return (
    <button type="button" className="row-item" onClick={() => onOpen(item)}>
      <span className="row-tile" style={{ background: m.color, color: m.text }}>
        <Icon d={m.icon} size={16} />
      </span>
      <span className="row-main">
        <span className="row-title">{item.title}</span>
        <span className="row-sub">
          {item.allDay ? 'весь день' : `${item.start}${item.end ? `–${item.end}` : ''}`} · {m.name}
        </span>
      </span>
    </button>
  );
}
