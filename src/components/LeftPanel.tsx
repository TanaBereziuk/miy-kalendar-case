// Ліва панель (етап 2 плану, 21.11; 25.11 — правки власниці): заголовок «задачі», праворуч від нього капсула «історія»
// і кругла «‹» (згорнути в язичок «задачі» біля лівого краю). Угорі списку задач — нагадування (дедлайни ФОП і процедури
// улюбленця на сьогодні й прострочені) на тлі кольору модуля з позначкою «нагадування». На телефоні — те саме у вікні задач;
// блок «сьогодні і прострочене» над списком дня лишився (TodayList).
import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { MODULES, type CalendarItem, type Task } from '../types';
import type { DoneEntry } from '../onboarding/answers';
import { MONTHS_GEN, fromISO, toISO } from '../lib/dates';
import type { TodayEvent } from '../lib/today';
import { Check, dueLabel } from './Tasks';
import { ICONS, Icon } from './Icon';

export type LeftTab = 'tasks' | 'history';
const MONTHS_NOM = ['січень', 'лютий', 'березень', 'квітень', 'травень', 'червень', 'липень', 'серпень', 'вересень', 'жовтень', 'листопад', 'грудень'];

function Tile({ module }: { module: CalendarItem['module'] }) {
  const m = MODULES[module];
  return (
    <span className="lp-tile" style={{ background: m.color, color: m.text }} aria-hidden="true">
      <Icon d={m.icon} size={13} />
    </span>
  );
}

const dm = (iso: string) => {
  const d = fromISO(iso);
  return `${d.getDate()} ${MONTHS_GEN[d.getMonth()]}`;
};

export interface TodayTask {
  task: Task;
  day?: string;
  overdue: boolean;
}

interface TodayProps {
  events: TodayEvent[];
  tasks: TodayTask[];
  onDone: (item: CalendarItem) => void;
  onToggleTask: (t: Task) => void;
  /** «…» на рядку (23.11): перенести на наступний день або видалити */
  onMoveEvent: (item: CalendarItem) => void;
  onDeleteEvent: (item: CalendarItem) => void;
  onMoveTask: (t: Task) => void;
  onDeleteTask: (t: Task) => void;
}

/** «…» 30 праворуч рядка (видно під курсором) і меню 220: «Перенести на наступний день», «Видалити» */
function RowMenu({ open, onOpen, onClose, onMove, onDelete }: { open: boolean; onOpen: () => void; onClose: () => void; onMove: () => void; onDelete: () => void }) {
  useEffect(() => {
    if (!open) return;
    const off = (e: MouseEvent) => {
      if (!(e.target as Element).closest?.('.task-menu, .task-more')) onClose();
    };
    const key = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('mousedown', off);
    window.addEventListener('keydown', key);
    return () => {
      document.removeEventListener('mousedown', off);
      window.removeEventListener('keydown', key);
    };
  }, [open, onClose]);
  return (
    <>
      <button type="button" className="round-btn task-more" aria-label="Ще дії" aria-expanded={open} onClick={open ? onClose : onOpen}>
        <Icon d={ICONS.dots} size={12} />
      </button>
      {open && (
        <div className="task-menu" role="menu">
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              onClose();
              onMove();
            }}
          >
            <Icon d={ICONS.day} size={14} />
            Перенести на наступний день
          </button>
          <button
            type="button"
            role="menuitem"
            className="danger"
            onClick={() => {
              onClose();
              onDelete();
            }}
          >
            <Icon d={ICONS.trash} size={14} />
            Видалити
          </button>
        </div>
      )}
    </>
  );
}

/**
 * Список «сьогодні»: прострочене, потім сьогоднішнє. 23.11 (правки власниці): «Зроблено» — позначка-галочка ліворуч,
 * усе вирівняно по верху рядка, модуль — плитка 16 у рядку з часом; під курсором «…» з «Перенести на наступний день» і «Видалити».
 */
export function TodayList({ events, tasks, onDone, onToggleTask, onMoveEvent, onDeleteEvent, onMoveTask, onDeleteTask }: TodayProps) {
  const [menu, setMenu] = useState<string | null>(null);
  const close = () => setMenu(null);
  const ev = (e: TodayEvent) => {
    const k = 'e' + e.item.id + e.item.date;
    const m = MODULES[e.item.module];
    return (
      <div key={k} className={'lp-row' + (menu === k ? ' menu-open' : '')}>
        <Check on={false} onClick={() => onDone(e.item)} label={`Зроблено: ${e.item.title}`} />
        <span className="lp-t">
          <b>{e.item.title}</b>
          <span className={'lp-meta' + (e.overdue ? ' late' : '')}>
            <span className="lp-tile sm" style={{ background: m.color, color: m.text }} aria-hidden="true">
              <Icon d={m.icon} size={10} />
            </span>
            {(e.overdue ? dueLabel(e.item.date) : '') + (e.item.allDay ? (e.overdue ? '' : 'весь день') : (e.overdue ? ', ' : '') + (e.item.start ?? ''))}
          </span>
        </span>
        <RowMenu open={menu === k} onOpen={() => setMenu(k)} onClose={close} onMove={() => onMoveEvent(e.item)} onDelete={() => onDeleteEvent(e.item)} />
      </div>
    );
  };
  const tk = (x: TodayTask) => {
    const k = 't' + x.task.id;
    return (
      <div key={k} className={'lp-row' + (x.task.doneAt ? ' done' : '') + (menu === k ? ' menu-open' : '')}>
        <Check on={!!x.task.doneAt} onClick={() => onToggleTask(x.task)} label={x.task.title} />
        <span className="lp-t">
          <b>{x.task.title}</b>
          <span className={'lp-meta' + (x.overdue ? ' late' : '')}>{x.overdue ? dueLabel(x.day!) : 'задача'}</span>
        </span>
        {!x.task.doneAt && (
          <RowMenu open={menu === k} onOpen={() => setMenu(k)} onClose={close} onMove={() => onMoveTask(x.task)} onDelete={() => onDeleteTask(x.task)} />
        )}
      </div>
    );
  };
  const late = [...events.filter((e) => e.overdue).map(ev), ...tasks.filter((t) => t.overdue).map(tk)];
  const now = [...events.filter((e) => !e.overdue).map(ev), ...tasks.filter((t) => !t.overdue).map(tk)];
  if (!late.length && !now.length) return <p className="lp-empty">На сьогодні нічого термінового.</p>;
  return (
    <>
      {late.length > 0 && (
        <section className="lp-sec">
          <h3 className="lp-h">прострочене</h3>
          {late}
        </section>
      )}
      {now.length > 0 && (
        <section className="lp-sec">
          <h3 className="lp-h">сьогодні, {dm(toISO(new Date()))}</h3>
          {now}
        </section>
      )}
    </>
  );
}

interface ReminderProps {
  events: TodayEvent[];
  onDone: (item: CalendarItem) => void;
  onMove: (item: CalendarItem) => void;
  onDelete: (item: CalendarItem) => void;
}

/**
 * Нагадування вгорі списку задач (25.11): дедлайни ФОП і процедури улюбленця на сьогодні й прострочені, ще не «Зроблено».
 * Рядок — тло кольору модуля (30 % з білим), радіус 12; позначка 18 ліворуч — «Зроблено»; під назвою капсула «нагадування»
 * з іконкою модуля і день (прострочене — колір now-text). «…» — перенести на наступний день або видалити.
 */
export function ReminderList({ events, onDone, onMove, onDelete }: ReminderProps) {
  const [menu, setMenu] = useState<string | null>(null);
  if (!events.length) return null;
  return (
    <section className="lp-sec lp-remind-sec" aria-label="Нагадування">
      {events.map((e) => {
        const k = e.item.id + e.item.date;
        const m = MODULES[e.item.module];
        const when = dueLabel(e.item.date) + (e.item.allDay || !e.item.start ? '' : ', ' + e.item.start);
        return (
          <div
            key={k}
            className={'lp-row lp-remind' + (menu === k ? ' menu-open' : '')}
            style={{ '--mod': m.color } as CSSProperties}
          >
            <Check on={false} onClick={() => onDone(e.item)} label={`Зроблено: ${e.item.title}`} />
            <span className="lp-t">
              <b>{e.item.title}</b>
              <span className="lp-meta">
                <span className="lp-label">
                  <Icon d={m.icon} size={10} />
                  нагадування
                </span>
                <span className={e.overdue ? 'late' : ''}>{when}</span>
              </span>
            </span>
            <RowMenu open={menu === k} onOpen={() => setMenu(k)} onClose={() => setMenu(null)} onMove={() => onMove(e.item)} onDelete={() => onDelete(e.item)} />
          </div>
        );
      })}
    </section>
  );
}

/** Історія: зроблені дедлайни ФОП і процедури улюбленця, нові зверху, за місяцями. Без лічильників. */
export function HistoryList({ done }: { done: DoneEntry[] }) {
  if (!done.length)
    return <p className="lp-empty">Тут зʼявляться дедлайни ФОП і процедури улюбленця, позначені «Зроблено».</p>;
  const sorted = [...done].sort((a, b) => b.date.localeCompare(a.date) || b.at.localeCompare(a.at));
  const out: ReactNode[] = [];
  let month = '';
  for (const d of sorted) {
    const dt = fromISO(d.date);
    const m = `${MONTHS_NOM[dt.getMonth()]} ${dt.getFullYear()}`;
    if (m !== month) {
      month = m;
      out.push(<h3 key={'m' + m} className="lp-h lp-month">{m}</h3>);
    }
    out.push(
      <div key={d.key} className="lp-row">
        <Tile module={d.module} />
        <span className="lp-t">
          <b>{d.title}</b>
          <span>{dm(d.date)}</span>
        </span>
      </div>,
    );
  }
  return <section className="lp-sec">{out}</section>;
}

interface PanelProps {
  open: boolean;
  tab: LeftTab;
  onTab: (t: LeftTab) => void;
  onToggle: () => void;
  /** список задач з нагадуваннями вгорі */
  tasks: ReactNode;
  history: ReactNode;
}

/** Шапка панелі (25.11): заголовок 26 («задачі» / «історія»), праворуч круглі fill 30 — «історія» (годинник; в історії
 * натиснута, повторне натискання повертає до задач) і «‹» / «×» */
export function PanelHead({ tab, onTab, closeLabel, closeIcon, onClose }: { tab: LeftTab; onTab: (t: LeftTab) => void; closeLabel: string; closeIcon: string; onClose: () => void }) {
  const hist = tab === 'history';
  return (
    <div className="lp-top">
      <h2 id="tasks-title" className="head-font lp-title">{hist ? 'історія' : 'задачі'}</h2>
      <button
        type="button"
        className={'round-btn lp-hist' + (hist ? ' on' : '')}
        aria-label={hist ? 'Повернутися до задач' : 'Історія'}
        aria-pressed={hist}
        title={hist ? 'Повернутися до задач' : 'Історія'}
        onClick={() => onTab(hist ? 'tasks' : 'history')}
      >
        <Icon d={ICONS.history} size={14} />
      </button>
      <button type="button" className="round-btn" aria-label={closeLabel} title={closeLabel} onClick={onClose}>
        <Icon d={closeIcon} size={12} />
      </button>
    </div>
  );
}

export function LeftPanel({ open, tab, onTab, onToggle, tasks, history }: PanelProps) {
  if (!open)
    return (
      <button type="button" className="lp-tab" onClick={onToggle} aria-label="Відкрити панель «задачі»" title="Відкрити панель">
        <Icon d={ICONS.next} size={12} />
        <span className="lp-vt">задачі</span>
      </button>
    );
  return (
    <aside className="lp" aria-labelledby="tasks-title">
      <PanelHead tab={tab} onTab={onTab} closeLabel="Згорнути панель" closeIcon={ICONS.prev} onClose={onToggle} />
      <div className="lp-scroll">{tab === 'history' ? history : tasks}</div>
    </aside>
  );
}
