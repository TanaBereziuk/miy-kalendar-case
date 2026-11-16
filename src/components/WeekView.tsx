import { MODULES, type CalendarItem } from '../types';
import { DAYS_SHORT, fromMinutes, sameDay, toISO } from '../lib/dates';
import { HOUR_PX, eventsWord, groupRange, isNight, pad2, placeDay, visibleGroups } from '../lib/layout';
import { useNow } from '../lib/useNow';
import { ICONS, Icon } from './Icon';
import type { PendingAct } from '../App';
import { DISH_MIME } from '../food/FoodPanel';

/** Перетягування в сітці (харчування, 14.11): страва з бібліотеки або вже поставлена страва */
export const ITEM_MIME = 'application/x-miy-item';
const GROUP_MEAL: Record<string, string> = { morning: '08:00', day: '13:00', evening: '19:00' };
const dragKind = (e: React.DragEvent) =>
  e.dataTransfer.types.includes(DISH_MIME) ? 'dish' : e.dataTransfer.types.includes(ITEM_MIME) ? 'item' : null;

interface Props {
  days: Date[];
  items: CalendarItem[];
  pending: PendingAct[];
  onPlan: (p: PendingAct) => void;
  showNight: boolean;
  onShowNight: (v: boolean) => void;
  collapsed: Set<string>;
  onToggleGroup: (id: string) => void;
  onOpen: (item: CalendarItem) => void;
  onCreate: (date: string, start?: string) => void;
  onDropDish?: (dishId: string, date: string, start: string) => void;
  onMoveItem?: (itemId: string, date: string, start: string) => void;
}

export function WeekView({ days, items, pending, onPlan, showNight, onShowNight, collapsed, onToggleGroup, onOpen, onCreate, onDropDish, onMoveItem }: Props) {
  const dropProps = (iso: string, startAt: (e: React.DragEvent<HTMLDivElement>) => string) => ({
    onDragOver: (e: React.DragEvent<HTMLDivElement>) => {
      const k = dragKind(e);
      if (!k) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = k === 'dish' ? 'copy' : 'move';
      e.currentTarget.classList.add('drop-on');
    },
    onDragLeave: (e: React.DragEvent<HTMLDivElement>) => e.currentTarget.classList.remove('drop-on'),
    onDrop: (e: React.DragEvent<HTMLDivElement>) => {
      e.currentTarget.classList.remove('drop-on');
      const dish = e.dataTransfer.getData(DISH_MIME);
      const item = e.dataTransfer.getData(ITEM_MIME);
      if (!dish && !item) return;
      e.preventDefault();
      const start = startAt(e);
      if (dish) onDropDish?.(dish, iso, start);
      else onMoveItem?.(item, iso, start);
    },
  });
  const now = useNow();
  const groups = visibleGroups(showNight);

  const byDay = new Map<string, CalendarItem[]>();
  for (const it of items) {
    const list = byDay.get(it.date) ?? [];
    list.push(it);
    byDay.set(it.date, list);
  }

  const nowMin = now.getHours() * 60 + now.getMinutes();
  const nowLabel = `${pad2(now.getHours())}:${pad2(now.getMinutes())}`;

  const hiddenNight = showNight
    ? 0
    : days.reduce((n, d) => n + (byDay.get(toISO(d)) ?? []).filter(isNight).length, 0);

  return (
    <div className="week">
      <div className="week-row week-head">
        <div />
        {days.map((d, i) => {
          const today = sameDay(d, now);
          return (
            <div key={toISO(d)} className={'day-head' + (today ? ' today' : '')}>
              <div className="dow">{DAYS_SHORT[i]}</div>
              <div className="num-line">
                <span className="num">{d.getDate()}</span>
                {today && <span className="today-badge">сьогодні</span>}
              </div>
            </div>
          );
        })}
      </div>

      <div className="week-row allday-row">
        <div className="side-label">весь день</div>
        {days.map((d) => {
          const iso = toISO(d);
          const list = (byDay.get(iso) ?? []).filter((i) => i.allDay);
          return (
            <div key={iso} className={'allday-cell' + (sameDay(d, now) ? ' today' : '')}>
              {list.map((it) => (
                <button
                  type="button"
                  key={it.id}
                  className="pill"
                  style={{ background: MODULES[it.module].color, color: MODULES[it.module].text }}
                  onClick={() => onOpen(it)}
                >
                  {it.title}
                </button>
              ))}
              <button type="button" className="allday-add" aria-label="Додати подію на весь день" onClick={() => onCreate(iso)} />
            </div>
          );
        })}
      </div>

      {pending.length > 0 && (
        <div className="week-row pending-row">
          <div className="side-label">без дня</div>
          <div className="pending-body">
            <span className="muted-text">Ще цього тижня — натисніть, щоб обрати день і час</span>
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
        </div>
      )}

      {groups.map((g) => {
        const open = !collapsed.has(g.id);
        const hours = Array.from({ length: g.to - g.from }, (_, i) => g.from + i);
        const count = days.reduce(
          (n, d) => n + placeDay(byDay.get(toISO(d)) ?? [], [g.from, g.to]).length,
          0,
        );
        return (
          <section key={g.id} className="week-group" aria-label={`${g.name} ${groupRange(g)}`}>
            <div className="week-row group-head">
              <div className="group-side hatch">
                <button
                  type="button"
                  className="group-toggle"
                  aria-expanded={open}
                  onClick={() => onToggleGroup(g.id)}
                >
                  <Icon d={open ? ICONS.down : ICONS.next} size={8} />
                  {g.name}
                </button>
              </div>
              {days.map((d, i) => (
                <div
                  key={toISO(d)}
                  className={'group-cell hatch' + (sameDay(d, now) ? ' today' : '')}
                  {...dropProps(toISO(d), () => GROUP_MEAL[g.id] ?? fromMinutes(g.from * 60))}
                >
                  {i === 0 && <span className="range-chip">{groupRange(g)}</span>}
                  {i === 1 && !open && count > 0 && (
                    <span className="range-chip muted">
                      {count} {eventsWord(count)}
                    </span>
                  )}
                </div>
              ))}
            </div>

            {open && (
              <div className="week-row group-body">
                <div className="hour-labels">
                  {hours.map((h) => (
                    <div key={h} className="hour-label" style={{ height: HOUR_PX }}>
                      {pad2(h)}:00
                    </div>
                  ))}
                </div>
                {days.map((d) => {
                  const iso = toISO(d);
                  const placed = placeDay(byDay.get(iso) ?? [], [g.from, g.to]);
                  const today = sameDay(d, now);
                  const showNow = today && nowMin >= g.from * 60 && nowMin < g.to * 60;
                  return (
                    <div
                      key={iso}
                      className={'day-col' + (today ? ' today' : '')}
                      style={{ height: hours.length * HOUR_PX }}
                      {...dropProps(iso, (e) => {
                        const y = e.clientY - e.currentTarget.getBoundingClientRect().top;
                        const min = g.from * 60 + Math.floor(((y / HOUR_PX) * 60) / 15) * 15;
                        return fromMinutes(Math.max(g.from * 60, Math.min(g.to * 60 - 15, min)));
                      })}
                      onClick={(e) => {
                        if (e.target !== e.currentTarget) return;
                        const h = g.from + Math.floor(e.nativeEvent.offsetY / HOUR_PX);
                        onCreate(iso, fromMinutes(h * 60));
                      }}
                    >
                      {placed.map(({ item, top, height, lane, lanes }) => {
                        const m = MODULES[item.module];
                        const compact = height < 44;
                        return (
                          <button
                            type="button"
                            key={item.id}
                            className={'event' + (compact ? ' compact' : '')}
                            style={{
                              top: top + 1,
                              height: height - 2,
                              left: `calc(${(lane / lanes) * 100}% + 3px)`,
                              width: `calc(${100 / lanes}% - 6px)`,
                              background: m.color,
                              color: m.text,
                            }}
                            onClick={() => onOpen(item)}
                            draggable={item.module === 'food' && !item.repeat && !item.seriesId}
                            onDragStart={(e) => {
                              e.dataTransfer.setData(ITEM_MIME, item.id);
                              e.dataTransfer.effectAllowed = 'move';
                            }}
                          >
                            {!compact && <span className="ev-title">{item.title}</span>}
                            <span className="ev-time">
                              <span className="ev-time-t">
                                {item.start}
                                {!compact && item.end ? `–${item.end}` : ''}
                              </span>
                              {compact && <span className="ev-title-inline">{item.title}</span>}
                            </span>
                          </button>
                        );
                      })}
                      {showNow && (
                        <div className="now-line" style={{ top: ((nowMin - g.from * 60) / 60) * HOUR_PX }} aria-hidden="true">
                          <span>{nowLabel}</span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        );
      })}

      <div className="week-row night-row">
        <div className="night-side">
          <div className="night-name">ніч</div>
          <div className="night-range">22–06</div>
        </div>
        <div className="night-body">
          {showNight ? (
            <span className="muted-text">Ніч показано зверху і знизу сітки.</span>
          ) : (
            <span className="muted-text">
              Прихована · {hiddenNight > 0 ? `${hiddenNight} ${eventsWord(hiddenNight)} цього тижня` : 'подій немає'}
            </span>
          )}
          <button type="button" className="btn tinted small" onClick={() => onShowNight(!showNight)}>
            {showNight ? 'Сховати ніч' : 'Показати ніч'}
          </button>
        </div>
      </div>
    </div>
  );
}
