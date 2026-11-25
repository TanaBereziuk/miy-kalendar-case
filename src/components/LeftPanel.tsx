// Ліва панель (етап 2 плану, 21.11; макети погоджено в чаті): таби «сьогодні / задачі / історія» вгорі,
// кругла «‹» згортає панель у вузький язичок «сьогодні» біля лівого краю. На телефоні ті самі списки —
// блок «сьогодні» над списком дня і вкладка «історія» у вікні задач.
import { useEffect, useState, type ReactNode } from 'react';
import { MODULES, type CalendarItem, type Task } from '../types';
import type { DoneEntry } from '../onboarding/answers';
import { MONTHS_GEN, fromISO, toISO } from '../lib/dates';
import type { TodayEvent } from '../lib/today';
import { Check, dueLabel } from './Tasks';
import { ICONS, Icon } from './Icon';

export type LeftTab = 'today' | 'tasks' | 'history';
const TABS: { id: LeftTab; name: string }[] = [
  { id: 'today', name: 'сьогодні' },
  { id: 'tasks', name: 'задачі' },
  { id: 'history', name: 'історія' },
];
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
  tasksOn: boolean;
  today: ReactNode;
  tasks: ReactNode;
  history: ReactNode;
}

export function LeftPanel({ open, tab, onTab, onToggle, tasksOn, today, tasks, history }: PanelProps) {
  if (!open)
    return (
      <button type="button" className="lp-tab" onClick={onToggle} aria-label="Відкрити панель «сьогодні»" title="Відкрити панель">
        <Icon d={ICONS.next} size={12} />
        <span className="lp-vt">сьогодні</span>
      </button>
    );
  const tabs = TABS.filter((t) => t.id !== 'tasks' || tasksOn);
  return (
    <aside className="lp" aria-label="Сьогодні, задачі, історія">
      <div className="lp-top">
        <div className="seg fill lp-seg" role="tablist">
          {tabs.map((t) => (
            <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} className={tab === t.id ? 'on' : ''} onClick={() => onTab(t.id)}>
              {t.name}
            </button>
          ))}
        </div>
        <button type="button" className="round-btn" aria-label="Згорнути панель" title="Згорнути" onClick={onToggle}>
          <Icon d={ICONS.prev} size={12} />
        </button>
      </div>
      <div className="lp-scroll">{tab === 'today' ? today : tab === 'tasks' ? tasks : history}</div>
    </aside>
  );
}
