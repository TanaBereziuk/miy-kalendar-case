import { Fragment, useRef, type ReactNode } from 'react';
import { MODULES, type CalendarItem } from '../types';
import type { CellSel } from './QuickAdd';
import { DAYS_SHORT, sameDay, toISO, toMinutes } from '../lib/dates';
import { groupOf, isPast, pad2, sortByTime } from '../lib/layout';
import { useNow } from '../lib/useNow';
import { Icon } from './Icon';
import type { PendingAct } from '../App';
import { isSlot } from '../food/dishes';
import { isGoogle } from '../lib/google';
import { PendingChips } from './PendingChips';
import { bdayName, bdaySub, isBirthday } from '../lib/birthday';
import { Sticker } from './Stickers';

interface Props {
  day: Date;
  days: Date[];
  items: CalendarItem[];
  pending: PendingAct[];
  onPlan: (p: PendingAct) => void;
  /** справи без дати (етап 1, 18.11) */
  undated: CalendarItem[];
  onOpenUndated: (item: CalendarItem) => void;
  onPickDay: (d: Date) => void;
  onOpen: (item: CalendarItem) => void;
  onCreate: (date: string, start?: string) => void;
  /** свайп (18.11): по списку — ±1 день, по смузі днів — ±7 */
  onSwipe?: (days: number) => void;
  /** клітинка, з якої зараз додають подію (швидке додавання) — виділена */
  selected?: CellSel | null;
  /** етап 2 (21.11): блок «сьогодні» над списком дня */
  top?: ReactNode;
}

const SECTIONS = [
  { id: 'morning', name: 'ранок', range: '06:00–12:00', start: '08:00' },
  { id: 'day', name: 'день', range: '12:00–18:00', start: '13:00' },
  { id: 'evening', name: 'вечір', range: '18:00–22:00', start: '19:00' },
  { id: 'night', name: 'ніч', range: '22:00–06:00', start: '22:00' },
];

export function TodayView({ day, days, items, pending, onPlan, undated, onOpenUndated, onPickDay, onOpen, onCreate, onSwipe, selected, top }: Props) {
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

  // Свайп ліворуч / праворуч (18.11, аудит, п. 8): горизонтальний рух від 60 px і помітно більший за вертикальний
  const touch = useRef<{ x: number; y: number } | null>(null);
  const swipeProps = (step: number) => ({
    onTouchStart: (e: React.TouchEvent) => {
      const t = e.touches[0];
      touch.current = { x: t.clientX, y: t.clientY };
    },
    onTouchEnd: (e: React.TouchEvent) => {
      const s0 = touch.current;
      touch.current = null;
      if (!s0 || !onSwipe) return;
      // смуга днів гортає тижні сама — список дня її рух не враховує
      if (step === 1 && (e.target as Element).closest?.('.day-strip')) return;
      const t = e.changedTouches[0];
      const dx = t.clientX - s0.x;
      const dy = t.clientY - s0.y;
      if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
      onSwipe(dx < 0 ? step : -step);
    },
  });

  return (
    <div className="today-view" {...swipeProps(1)}>
      <div className="day-strip" role="tablist" aria-label="Дні тижня" {...swipeProps(7)}>
        {days.map((d, i) => {
          const on = sameDay(d, day);
          // 18.11: крапки кольору модулів (до 3), щоденні повтори не рахуються — інакше крапка стоїть під кожним днем
          const mods = Array.from(
            new Set(items.filter((it) => it.date === toISO(d) && it.repeat?.freq !== 'daily' && !isGoogle(it)).map((it) => it.module)),
          ).slice(0, 3);
          // день з подією на весь день — у колір її модуля (17.11)
          const whole = items.find((it) => it.date === toISO(d) && it.allDay && !isGoogle(it) && !isBirthday(it));
          return (
            <button
              type="button"
              role="tab"
              aria-selected={on}
              key={toISO(d)}
              className={'strip-day' + (on ? ' on' : '') + (sameDay(d, now) ? ' is-today' : '') + (whole ? ' day-tint' : '')}
              style={whole ? ({ ['--day-tint' as string]: MODULES[whole.module].color, ['--day-tint-pct' as string]: whole.module === 'other' ? '10%' : '30%' } as React.CSSProperties) : undefined}
              onClick={() => onPickDay(d)}
            >
              <span className="dow">{DAYS_SHORT[i]}</span>
              <span className="num">{d.getDate()}</span>
              <span className="marks" aria-hidden="true">
                {mods.map((m) => (
                  <span key={m} className="mark has" style={{ background: MODULES[m].dot }} />
                ))}
              </span>
            </button>
          );
        })}
      </div>

      {top}

      {(pending.length > 0 || undated.length > 0) && (
        <section className="group-card">
          <h2 className="group-card-title">
            цього тижня <span className="group-card-range">натисніть, щоб поставити на цей день</span>
          </h2>
          <div className="chips-wrap">
            <PendingChips acts={pending} undated={undated} onPlan={onPlan} onOpenUndated={onOpenUndated} />
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
              <button
                type="button"
                className={'text-add' + (selected?.date === iso && selected.start === s.start ? ' cell-selected' : '')}
                onClick={() => onCreate(iso, s.start)}
              >
                <Icon d="M10 3h4v7h7v4h-7v7h-4v-7H3v-4h7z" size={12} />
                Додати
              </button>
            </div>
            {list.length > 0 ? (
              <div className="list">
                {list.map((it, i) => {
                  // 18.11: позначка «зараз» між подіями сьогодні — перед першою, що ще не почалась
                  const nowMin = now.getHours() * 60 + now.getMinutes();
                  const startsLater = (x: CalendarItem) => !!x.start && toMinutes(x.start) > nowMin;
                  const g = SECTION_RANGE[s.id];
                  const inGroup = s.id === 'night' ? nowMin >= 22 * 60 || nowMin < 6 * 60 : nowMin >= g[0] * 60 && nowMin < g[1] * 60;
                  const marker =
                    isToday && inGroup && startsLater(it) && (i === 0 || !startsLater(list[i - 1]));
                  return (
                    <Fragment key={it.id}>
                      {marker && <NowRow now={now} />}
                      <Row item={it} onOpen={onOpen} past={isPast(it, now)} />
                    </Fragment>
                  );
                })}
                {isToday && list.length > 0 && !list.some((x) => !!x.start && toMinutes(x.start) > now.getHours() * 60 + now.getMinutes()) &&
                  (() => {
                    const nowMin = now.getHours() * 60 + now.getMinutes();
                    const g = SECTION_RANGE[s.id];
                    return s.id !== 'night' && nowMin >= g[0] * 60 && nowMin < g[1] * 60 ? <NowRow now={now} /> : null;
                  })()}
              </div>
            ) : (
              <button
                type="button"
                className={'empty-add' + (selected?.date === iso && selected.start === s.start ? ' cell-selected' : '')}
                onClick={() => onCreate(iso, s.start)}
              >
                Додати подію
              </button>
            )}
          </section>
        );
      })}
    </div>
  );
}

const SECTION_RANGE: Record<string, [number, number]> = { morning: [6, 12], day: [12, 18], evening: [18, 22], night: [22, 30] };

function NowRow({ now }: { now: Date }) {
  return (
    <div className="now-row" aria-label="зараз">
      <span>{`${pad2(now.getHours())}:${pad2(now.getMinutes())}`}</span>
    </div>
  );
}

function Row({ item, onOpen, past }: { item: CalendarItem; onOpen: (i: CalendarItem) => void; past?: boolean }) {
  const m = MODULES[item.module];
  return (
    <button type="button" className={'row-item' + (past ? ' past' : '') + (isGoogle(item) ? ' google-row' : '')} onClick={() => onOpen(item)}>
      {isBirthday(item) ? (
        <span className="row-tile cake-tile"><Sticker id="cake" size={44} /></span>
      ) : isGoogle(item) ? (
        <span className="row-tile google-tile" aria-hidden="true">
          G
        </span>
      ) : (
        <span className="row-tile" style={{ background: m.color, color: m.text }}>
          <Icon d={m.icon} size={16} />
        </span>
      )}
      <span className="row-main">
        <span className="row-title">{isBirthday(item) ? bdayName(item) : item.title}</span>
        <span className="row-sub">
          {isBirthday(item) ? bdaySub(item, item.date) : item.allDay ? 'весь день' : isSlot(item.source) ? 'без точного часу' : `${item.start}${item.end ? `–${item.end}` : ''}`}
          {isGoogle(item) ? ' · Google' : ''}
        </span>
      </span>
    </button>
  );
}
