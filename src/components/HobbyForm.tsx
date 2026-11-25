import { useState } from 'react';
import { Segmented } from '../onboarding/ui';
import { Icon } from './Icon';
import { addDays, fromISO, fromMinutes, toISO, toMinutes, weekdayIndex } from '../lib/dates';
import type { NewItem } from '../types';
import { DateProp, DaysProp, PropSelect, QfRow, TimeSelect } from './QuickFields';

const DOW = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Нд'];
const MINUS = 'M4 10h16v4H4z';
const PLUS = 'M10 4h4v6h6v4h-6v6h-4v-6H4v-4h6z';

export type HobbyDur = 30 | 45 | 60 | 90;

/** Поля заняття — ті самі, що на кроці «хобі» в онбордингу: назва, розклад, дні, час, разів на тиждень, тривалість. */
export function useHobbyForm(date: string, start?: string, end?: string) {
  const dur0 = start && end ? toMinutes(end) - toMinutes(start) : 45;
  const [name, setName] = useState('');
  // 18.11: «один раз» — одне заняття на дату й час (за замовчуванням, бо вікно відкривають з конкретної клітинки)
  const [mode, setMode] = useState<'once' | 'fixed' | 'n'>('once');
  const [onceDate, setOnceDate] = useState(date || toISO(new Date()));
  const [days, setDays] = useState<number[]>(() => {
    const d = [0, 0, 0, 0, 0, 0, 0];
    if (date) d[weekdayIndex(fromISO(date))] = 1;
    return d;
  });
  const [time, setTime] = useState(start ?? '18:00');
  const [n, setN] = useState(3);
  const [dur, setDur] = useState<HobbyDur>(([30, 45, 60, 90] as number[]).includes(dur0) ? (dur0 as HobbyDur) : 45);

  /** Помилка або готові дані: фіксований розклад — подія, що повторюється щотижня; «N разів» — заняття в рядок «без дня». */
  const build = (fromDate: string): { error: string } | { fixed: NewItem } | { n: { name: string; n: number; dur: HobbyDur } } => {
    if (!name.trim()) return { error: 'Вкажіть назву заняття.' };
    if (mode === 'n') return { n: { name: name.trim(), n, dur } };
    if (mode === 'once') {
      if (!onceDate) return { error: 'Вкажіть дату.' };
      if (!time) return { error: 'Вкажіть час.' };
      return {
        fixed: {
          title: name.trim(),
          module: 'hobby',
          date: onceDate,
          allDay: false,
          start: time,
          end: fromMinutes(Math.min(toMinutes(time) + dur, 24 * 60 - 1)),
        },
      };
    }
    const picked = days.map((v, i) => (v ? i : -1)).filter((i) => i >= 0);
    if (!picked.length) return { error: 'Оберіть хоча б один день.' };
    if (!time) return { error: 'Вкажіть час.' };
    // перший раз — найближчий обраний день, починаючи з дати вікна (або з сьогодні)
    let first = fromISO(fromDate || toISO(new Date()));
    while (!picked.includes(weekdayIndex(first))) first = addDays(first, 1);
    return {
      fixed: {
        title: name.trim(),
        module: 'hobby',
        date: toISO(first),
        allDay: false,
        start: time,
        end: fromMinutes(Math.min(toMinutes(time) + dur, 24 * 60 - 1)),
        repeat: { freq: 'weekly', days: picked },
      },
    };
  };

  return { name, setName, mode, setMode, onceDate, setOnceDate, days, setDays, time, setTime, n, setN, dur, setDur, build };
}

export type HobbyForm = ReturnType<typeof useHobbyForm>;

export function HobbyFormFields({ f }: { f: HobbyForm }) {
  return (
    <div className="hobby-form">
      <label className="field">
        <span>назва заняття</span>
        <input type="text" maxLength={300} autoFocus value={f.name} onChange={(e) => f.setName(e.target.value)} placeholder="Наприклад, біг у парку" />
      </label>

      <Segmented
        label="Розклад"
        fill
        value={f.mode}
        onChange={f.setMode}
        options={[
          { v: 'once', l: 'Один раз' },
          { v: 'fixed', l: 'Щотижня' },
          { v: 'n', l: 'N разів на тиждень' },
        ]}
      />

      {f.mode === 'once' ? (
        <>
          <label className="hobby-row">
            <span className="hobby-label">дата</span>
            <input type="date" className="hobby-time hobby-date" value={f.onceDate} onChange={(e) => f.setOnceDate(e.target.value)} />
          </label>
          <label className="hobby-row">
            <span className="hobby-label">час</span>
            <input type="time" className="hobby-time" value={f.time} onChange={(e) => f.setTime(e.target.value)} />
          </label>
        </>
      ) : f.mode === 'fixed' ? (
        <>
          <div className="hobby-row">
            <span className="hobby-label">дні</span>
            <div className="hobby-days" role="group" aria-label="Дні тижня">
              {DOW.map((d, i) => (
                <button
                  type="button"
                  key={d}
                  aria-pressed={!!f.days[i]}
                  className={'day-pill' + (f.days[i] ? ' on' : '')}
                  onClick={() => f.setDays(f.days.map((x, j) => (j === i ? (x ? 0 : 1) : x)))}
                >
                  {d}
                </button>
              ))}
            </div>
          </div>
          <label className="hobby-row">
            <span className="hobby-label">час</span>
            <input type="time" className="hobby-time" value={f.time} onChange={(e) => f.setTime(e.target.value)} />
          </label>
        </>
      ) : (
        <div className="hobby-row">
          <span className="hobby-label">разів на тиждень</span>
          <div className="stepper-pill">
            <button type="button" aria-label="Менше" onClick={() => f.setN(Math.max(1, f.n - 1))}>
              <Icon d={MINUS} size={14} />
            </button>
            <span className="num">{f.n}</span>
            <button type="button" aria-label="Більше" onClick={() => f.setN(Math.min(14, f.n + 1))}>
              <Icon d={PLUS} size={14} />
            </button>
          </div>
        </div>
      )}

      <div className="hobby-row">
        <span className="hobby-label">тривалість</span>
        <Segmented
          label="Тривалість"
          value={f.dur}
          onChange={f.setDur}
          options={[
            { v: 30, l: '30 хв' },
            { v: 45, l: '45 хв' },
            { v: 60, l: '1 год' },
            { v: 90, l: '1,5 год' },
          ]}
        />
      </div>

      <p className="hint hobby-note">
        {f.mode === 'n'
          ? 'Заняття зʼявиться в рядку «без дня» над тижнем — у календарі ви самі оберете зручні дні.'
          : f.mode === 'once'
            ? 'Одне заняття на цю дату й час, без повторів.'
            : 'Заняття повторюватиметься щотижня в обрані дні, починаючи з найближчого.'}
      </p>
    </div>
  );
}

const DUR_OPTS: [HobbyDur, string][] = [
  [30, '30 хв'],
  [45, '45 хв'],
  [60, '1 год'],
  [90, '1,5 год'],
];
const timesWord = (n: number) => (n % 10 === 1 && n % 100 !== 11 ? 'раз' : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? 'рази' : 'разів');

/** Заняття у швидкому вікні (23.11): ті самі дані, поля «підпис — значення» в стилі Notion; назва — над полями (ItemDialog) */
export function HobbyQuickFields({ f }: { f: HobbyForm }) {
  return (
    <div className="qf-grid">
      <QfRow k="розклад">
        <PropSelect
          label="Розклад"
          value={f.mode}
          onChange={f.setMode}
          options={[
            ['once', 'один раз'],
            ['fixed', 'щотижня'],
            ['n', 'N разів на тиждень'],
          ]}
        />
      </QfRow>
      {f.mode === 'once' && (
        <QfRow k="день">
          <DateProp value={f.onceDate} onChange={f.setOnceDate} label="День заняття" />
        </QfRow>
      )}
      {f.mode === 'fixed' && (
        <QfRow k="дні">
          <DaysProp value={f.days} onChange={f.setDays} />
        </QfRow>
      )}
      {f.mode === 'n' ? (
        <QfRow k="разів на тиждень">
          <PropSelect
            label="Разів на тиждень"
            value={f.n}
            onChange={f.setN}
            options={Array.from({ length: 14 }, (_, i) => [i + 1, `${i + 1} ${timesWord(i + 1)}`] as [number, string])}
          />
        </QfRow>
      ) : (
        <QfRow k="час">
          <TimeSelect value={f.time} onChange={f.setTime} label="Час заняття" />
        </QfRow>
      )}
      <QfRow k="тривалість">
        <PropSelect label="Тривалість" value={f.dur} onChange={f.setDur} options={DUR_OPTS} />
      </QfRow>
      {f.mode === 'n' && <p className="qf-hint">Заняття лежатиме в рядку «цього тижня» — дні оберете самі.</p>}
    </div>
  );
}
