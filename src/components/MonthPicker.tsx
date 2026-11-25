// Перехід до дати (18.11, аудит, п. 7): натискання на заголовок з датами тижня (або клавіша G) відкриває під ним
// міні-календар місяця. Тиждень, який зараз на екрані, підсвічено; сьогодні — чорне коло. Клік по дню — перехід.
// На телефоні — вікно знизу.
import { useEffect, useState } from 'react';
import { MODULES, type ModuleId } from '../types';
import { DAYS_SHORT, addDays, sameDay, startOfWeek, toISO } from '../lib/dates';
import { ICONS, Icon } from './Icon';

export const MONTHS = ['січень', 'лютий', 'березень', 'квітень', 'травень', 'червень', 'липень', 'серпень', 'вересень', 'жовтень', 'листопад', 'грудень'];

interface Props {
  /** день, який зараз на екрані (на ноутбуці — будь-який день видимого тижня) */
  day: Date;
  phone: boolean;
  /** підсвітити весь тиждень (ноутбук) або лише день (телефон) */
  weekMode: boolean;
  /** модулі подій по днях (ISO → модулі) — крапки під числом */
  marks?: (iso: string) => ModuleId[];
  onPick: (d: Date) => void;
  onClose: () => void;
}

export function MonthPicker({ day, phone, weekMode, marks, onPick, onClose }: Props) {
  const [month, setMonth] = useState(() => new Date(day.getFullYear(), day.getMonth(), 1));
  const today = new Date();
  const first = startOfWeek(month);
  const cells = Array.from({ length: 42 }, (_, i) => addDays(first, i));
  // останній рядок, що повністю з наступного місяця, не показуємо
  const rows = cells[35].getMonth() !== month.getMonth() ? 5 : 6;
  const shownWeek = startOfWeek(day);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const shift = (n: number) => setMonth((m) => new Date(m.getFullYear(), m.getMonth() + n, 1));

  return (
    <div className={'event-view-overlay' + (phone ? ' phone' : '')} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="event-view month-picker" role="dialog" aria-label="Перейти до дати">
        <div className="month-picker-head">
          <h2>
            {MONTHS[month.getMonth()]} {month.getFullYear()}
          </h2>
          <button type="button" className="round-btn" aria-label="Попередній місяць" onClick={() => shift(-1)}>
            <Icon d={ICONS.prev} size={12} />
          </button>
          <button type="button" className="round-btn" aria-label="Наступний місяць" onClick={() => shift(1)}>
            <Icon d={ICONS.next} size={12} />
          </button>
        </div>
        <div className="month-grid" role="grid">
          {DAYS_SHORT.map((d) => (
            <span key={d} className="month-dow" aria-hidden="true">
              {d}
            </span>
          ))}
          {cells.slice(0, rows * 7).map((d) => {
            const inMonth = d.getMonth() === month.getMonth();
            const shown = weekMode ? sameDay(startOfWeek(d), shownWeek) : sameDay(d, day);
            const m = marks?.(toISO(d)) ?? [];
            return (
              <button
                type="button"
                key={toISO(d)}
                className={'month-day' + (inMonth ? '' : ' out') + (shown ? ' shown' : '') + (sameDay(d, today) ? ' today' : '')}
                onClick={() => onPick(d)}
              >
                <span className="month-num">{d.getDate()}</span>
                <span className="month-marks" aria-hidden="true">
                  {m.slice(0, 3).map((id) => (
                    <span key={id} style={{ background: MODULES[id].dot }} />
                  ))}
                </span>
              </button>
            );
          })}
        </div>
        <button
          type="button"
          className="month-today"
          onClick={() => onPick(new Date())}
        >
          Сьогодні
        </button>
      </div>
    </div>
  );
}
