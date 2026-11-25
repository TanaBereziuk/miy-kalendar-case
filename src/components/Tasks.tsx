// Задачі (етап 1 плану, 18.11; макети TaskRow, EventChecklist, LinkToEvent у дизайн-системі):
// список задач у бічному меню (на телефоні — вікно знизу), чекліст у короткому перегляді події
// і вибір події випадним списком (подію обирають лише так, без перетягування — рішення 18.11).
import { useEffect, useMemo, useRef, useState } from 'react';
import { MODULES, type CalendarItem, type NewTask, type Task } from '../types';
import { DAYS_SHORT, MONTHS_GEN, addDays, fromISO, toISO, weekdayIndex } from '../lib/dates';
import { isVisibleTask, toNewTask, type TaskSync } from '../lib/tasks';
import { ICONS, Icon } from './Icon';
import { SEARCH_ICON, dayLabel } from './SearchPanel';

export interface EventRef {
  itemId: string;
  itemDate?: string;
}

/** Подія, до якої підвʼязано задачу: назва, модуль, дата й час показу. Подію видалено — null. */
export function linkedEvent(ref: EventRef | undefined, items: CalendarItem[]) {
  if (!ref) return null;
  const base = items.find((i) => i.id === ref.itemId);
  if (!base || base.undated) return null;
  return { item: base, date: ref.itemDate ?? base.date };
}

/** «сьогодні», «завтра», «пт», або «20 листопада»; з часом — «пт, 11:00» */
export function shortWhen(date: string, start?: string): string {
  const today = new Date();
  const d = fromISO(date);
  let day: string;
  if (date === toISO(today)) day = 'сьогодні';
  else if (date === toISO(addDays(today, 1))) day = 'завтра';
  else if (date > toISO(today) && date < toISO(addDays(today, 7))) day = DAYS_SHORT[weekdayIndex(d)].toLowerCase();
  else day = `${d.getDate()} ${MONTHS_GEN[d.getMonth()]}`;
  return start ? `${day}, ${start}` : day;
}

/** День задачі: «сьогодні», «завтра», «вчора, 17 листопада», «пт, 20 листопада» */
export function dueLabel(iso: string): string {
  const d = fromISO(iso);
  const dm = `${d.getDate()} ${MONTHS_GEN[d.getMonth()]}`;
  const today = new Date();
  if (iso === toISO(today)) return 'сьогодні';
  if (iso === toISO(addDays(today, 1))) return 'завтра';
  if (iso === toISO(addDays(today, -1))) return `вчора, ${dm}`;
  return `${DAYS_SHORT[weekdayIndex(d)].toLowerCase()}, ${dm}`;
}

function ModTile({ item, size }: { item: CalendarItem; size: number }) {
  const m = MODULES[item.module];
  return (
    <span className={'ev-tile s' + size} style={{ background: m.color, color: m.text }} aria-hidden="true">
      <Icon d={m.icon} size={size === 16 ? 10 : 13} />
    </span>
  );
}

export function Check({ on, onClick, label }: { on: boolean; onClick?: () => void; label: string }) {
  return (
    <button type="button" className={'task-check' + (on ? ' on' : '')} role="checkbox" aria-checked={on} aria-label={label} onClick={onClick}>
      {on && <Icon d={ICONS.check} size={12} />}
    </button>
  );
}

// ---------- Вибір події: випадний список ----------

interface PickerProps {
  /** покази подій на 60 днів від сьогодні (повторювані розгорнуто), без подій Google */
  options: CalendarItem[];
  value?: EventRef;
  items: CalendarItem[];
  onChange: (v?: EventRef) => void;
  /** лише відкритий список (меню рядка задачі): без поля, закривається після вибору */
  listOnly?: boolean;
  onClose?: () => void;
}

const NEAR_DAYS = 14;

export function EventPicker({ options, value, items, onChange, listOnly, onClose }: PickerProps) {
  const [open, setOpen] = useState(!!listOnly);
  const [q, setQ] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);
  const linked = linkedEvent(value, items);

  useEffect(() => {
    if (open) window.setTimeout(() => searchRef.current?.focus(), 20);
  }, [open]);

  const groups = useMemo(() => {
    const s = q.trim().toLowerCase();
    const limit = toISO(addDays(new Date(), NEAR_DAYS));
    const list = s ? options.filter((o) => o.title.toLowerCase().includes(s)) : options.filter((o) => o.date < limit && o.repeat?.freq !== 'daily');
    const out: { date: string; list: CalendarItem[] }[] = [];
    for (const o of list.slice(0, 40)) {
      const g = out[out.length - 1];
      if (g && g.date === o.date) g.list.push(o);
      else out.push({ date: o.date, list: [o] });
    }
    return out;
  }, [options, q]);

  const close = () => {
    setOpen(false);
    setQ('');
    onClose?.();
  };
  const pick = (o: CalendarItem) => {
    onChange({ itemId: o.seriesId ?? o.id, itemDate: o.seriesId ? o.date : undefined });
    close();
  };
  const isOn = (o: CalendarItem) => !!value && (o.seriesId ?? o.id) === value.itemId && (!o.seriesId || o.date === value.itemDate);

  const list = open && (
    <div className="ev-picker-list" role="listbox" aria-label="Події">
      <div className="food-search-wrap ev-picker-search">
        <Icon d={SEARCH_ICON} size={18} />
        <input
          ref={searchRef}
          className="food-search"
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.preventDefault();
              e.stopPropagation();
              close();
            }
          }}
          placeholder="пошук події"
          aria-label="Пошук події"
        />
      </div>
      {groups.length === 0 && <p className="ev-picker-empty">{q.trim() ? 'Не знайдено таких подій. Перевірте назву.' : 'На найближчі два тижні подій немає.'}</p>}
      {groups.map((g) => (
        <section key={g.date} className="search-day">
          <h3>{dayLabel(g.date)}</h3>
          {g.list.map((o) => (
            <button type="button" role="option" aria-selected={isOn(o)} key={o.id} className={'search-row' + (isOn(o) ? ' on' : '')} onClick={() => pick(o)}>
              <ModTile item={o} size={24} />
              <span className="search-title">{o.title}</span>
              <span className="search-time">{o.allDay ? 'весь день' : o.start}</span>
            </button>
          ))}
        </section>
      ))}
    </div>
  );

  if (listOnly) return list || null;
  return (
    <div className="ev-picker">
      <button
        type="button"
        className={'ev-picker-field' + (open ? ' open' : '') + (linked ? ' filled' : '')}
        aria-expanded={open}
        aria-haspopup="listbox"
        onClick={() => (open ? close() : setOpen(true))}
      >
        {linked ? (
          <>
            <ModTile item={linked.item} size={24} />
            <b>{linked.item.title}</b>
            <small>{shortWhen(linked.date, linked.item.allDay ? undefined : linked.item.start)}</small>
          </>
        ) : (
          <span className="ev-picker-ph">оберіть подію</span>
        )}
        <Icon d={ICONS.down} size={12} className="ev-picker-chev" />
      </button>
      {linked && !open && (
        <button type="button" className="x20 ev-picker-clear" aria-label="Прибрати подію" onClick={() => onChange(undefined)}>
          <Icon d={ICONS.close} size={8} />
        </button>
      )}
      {list}
    </div>
  );
}

// ---------- Список задач ----------

interface ListProps {
  tasks: Task[];
  items: CalendarItem[];
  options: CalendarItem[];
  sync: TaskSync;
  /** 23.11: день і подія нової задачі можна обрати іконками праворуч, поки вводите назву */
  onAdd: (title: string, extra?: { due?: string; itemId?: string; itemDate?: string }) => void;
  onChange: (t: Task, next: NewTask, text?: string) => void;
  onRemove: (t: Task) => void;
  onMakeEvent: (t: Task) => void;
}

/** День задачі для порядку: свій день або день підвʼязаної події */
function taskDay(t: Task, items: CalendarItem[]): string | undefined {
  return t.due ?? linkedEvent(t.itemId ? { itemId: t.itemId, itemDate: t.itemDate } : undefined, items)?.date;
}

export function TaskList({ tasks, items, options, sync, onAdd, onChange, onRemove, onMakeEvent }: ListProps) {
  const [text, setText] = useState('');
  const [menu, setMenu] = useState<string | null>(null);
  const [mode, setMode] = useState<{ id: string; kind: 'link' | 'day' | 'title' } | null>(null);
  const [draft, setDraft] = useState('');
  const today = toISO(new Date());

  useEffect(() => {
    if (!menu) return;
    const onDown = (e: MouseEvent) => {
      if (!(e.target as Element).closest?.('.task-menu, .task-more')) setMenu(null);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setMenu(null);
    document.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [menu]);

  const shown = useMemo(() => {
    const vis = tasks.filter((t) => isVisibleTask(t, today));
    const open = vis.filter((t) => !t.doneAt);
    const withDay = open.filter((t) => taskDay(t, items)).sort((a, b) => taskDay(a, items)!.localeCompare(taskDay(b, items)!));
    const noDay = open.filter((t) => !taskDay(t, items)).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const done = vis.filter((t) => t.doneAt).sort((a, b) => (b.doneAt ?? '').localeCompare(a.doneAt ?? ''));
    return [...withDay, ...noDay, ...done];
  }, [tasks, items, today]);

  const [newDue, setNewDue] = useState('');
  const [newEv, setNewEv] = useState<EventRef | undefined>(undefined);
  const [newPick, setNewPick] = useState(false);
  const dueRef = useRef<HTMLInputElement>(null);
  const submit = () => {
    const t = text.trim();
    if (!t) return;
    onAdd(t, { due: newDue || undefined, itemId: newEv?.itemId, itemDate: newEv?.itemDate });
    setText('');
    setNewDue('');
    setNewEv(undefined);
    setNewPick(false);
  };
  const newLinked = linkedEvent(newEv, items);
  const set = (t: Task, patch: Partial<NewTask>, msg?: string) => onChange(t, { ...toNewTask(t), ...patch }, msg);

  return (
    <div className="tasks">
      {sync === 'missing' ? (
        <p className="notice warn tasks-missing">
          Щоб задачі запрацювали, оновіть базу: запустіть новий шматок SQL (його надіслано в чаті, файл supabase/schema.sql).
        </p>
      ) : (
        // 23.11: нова задача — як незаповнений рядок задачі: порожня позначка 18 і поле 14/600 з підказкою; Enter — додати
        <div className="task-row task-new">
          <span className="task-check ghost" aria-hidden="true" />
          <div className="task-text">
            <input
              className="task-new-input"
              value={text}
              maxLength={300}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  submit();
                }
              }}
              placeholder="нова задача"
              aria-label="Нова задача — Enter, щоб додати"
            />
            {(newDue || newLinked) && (
              <span className="task-new-meta">
                {newDue && (
                  <span className="task-new-chip">
                    {dueLabel(newDue)}
                    <button type="button" className="x20" aria-label="Прибрати день" onClick={() => setNewDue('')}>
                      <Icon d={ICONS.close} size={8} />
                    </button>
                  </span>
                )}
                {newLinked && (
                  <span className="task-new-chip">
                    <ModTile item={newLinked.item} size={16} />
                    <span className="task-meta-t">
                      {newLinked.item.title} · {shortWhen(newLinked.date, newLinked.item.allDay ? undefined : newLinked.item.start)}
                    </span>
                    <button type="button" className="x20" aria-label="Відвʼязати від події" onClick={() => setNewEv(undefined)}>
                      <Icon d={ICONS.close} size={8} />
                    </button>
                  </span>
                )}
              </span>
            )}
            {newPick && (
              <EventPicker
                listOnly
                options={options}
                items={items}
                value={newEv}
                onChange={(v) => {
                  setNewEv(v);
                  setNewPick(false);
                }}
                onClose={() => setNewPick(false)}
              />
            )}
          </div>
          {/* Поки вводите назву — праворуч іконки: день (системний календар) і підвʼязати до події (список подій) */}
          {(text.trim() || newDue || newEv) && (
            <span className="task-new-tools">
              <span className="task-new-tool date-tool" title="Обрати день">
                <Icon d={ICONS.day} size={14} />
                <input
                  ref={dueRef}
                  type="date"
                  value={newDue}
                  aria-label="День задачі"
                  onChange={(e) => setNewDue(e.target.value)}
                  onClick={(e) => {
                    try {
                      (e.currentTarget as HTMLInputElement & { showPicker?: () => void }).showPicker?.();
                    } catch {
                      /* без showPicker — звичайне поле дати */
                    }
                  }}
                />
              </span>
              <button type="button" className={'task-new-tool' + (newPick ? ' on' : '')} title="Підвʼязати до події" aria-label="Підвʼязати до події" onClick={() => setNewPick((v) => !v)}>
                <Icon d={ICONS.link} size={14} />
              </button>
            </span>
          )}
        </div>
      )}
      {sync !== 'missing' && shown.length === 0 && (
        <p className="tasks-empty">Тут будуть справи, які треба зробити, але не обовʼязково в певний час. Задачу можна підвʼязати до події — тоді вона зʼявиться в ній чеклістом.</p>
      )}
      <ul className="task-list">
        {shown.map((t) => {
          const ev = linkedEvent(t.itemId ? { itemId: t.itemId, itemDate: t.itemDate } : undefined, items);
          const late = !t.doneAt && !!t.due && t.due < today;
          const editing = mode?.id === t.id ? mode.kind : null;
          return (
            <li key={t.id} className={'task-row' + (t.doneAt ? ' done' : '') + (menu === t.id ? ' menu-open' : '')}>
              <Check on={!!t.doneAt} label={t.title} onClick={() => set(t, { doneAt: t.doneAt ? undefined : new Date().toISOString() })} />
              <div className="task-text">
                {editing === 'title' ? (
                  <input
                    className="task-title-input"
                    autoFocus
                    value={draft}
                    maxLength={300}
                    onChange={(e) => setDraft(e.target.value)}
                    onBlur={() => {
                      if (draft.trim() && draft.trim() !== t.title) set(t, { title: draft.trim() }, 'Зміни збережено');
                      setMode(null);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                      if (e.key === 'Escape') {
                        e.stopPropagation();
                        setMode(null);
                      }
                    }}
                  />
                ) : (
                  <button
                    type="button"
                    className="task-title"
                    onClick={() => {
                      if (t.doneAt) return;
                      setDraft(t.title);
                      setMode({ id: t.id, kind: 'title' });
                    }}
                  >
                    {t.title}
                  </button>
                )}
                {ev ? (
                  <span className="task-meta">
                    <ModTile item={ev.item} size={16} />
                    <span className="task-meta-t">
                      {ev.item.title} · {shortWhen(ev.date, ev.item.allDay ? undefined : ev.item.start)}
                    </span>
                  </span>
                ) : t.due ? (
                  <span className={'task-meta' + (late ? ' late' : '')}>{dueLabel(t.due)}</span>
                ) : null}
                {editing === 'day' && (
                  <div className="task-day-edit">
                    <input
                      type="date"
                      autoFocus
                      defaultValue={t.due ?? today}
                      aria-label="День задачі"
                      onChange={(e) => e.target.value && set(t, { due: e.target.value }, 'День змінено')}
                    />
                    <button type="button" className="text-add" onClick={() => setMode(null)}>
                      Готово
                    </button>
                    {t.due && (
                      <button
                        type="button"
                        className="text-add"
                        onClick={() => {
                          set(t, { due: undefined }, 'День прибрано');
                          setMode(null);
                        }}
                      >
                        Без дня
                      </button>
                    )}
                  </div>
                )}
                {editing === 'link' && (
                  <EventPicker
                    listOnly
                    options={options}
                    items={items}
                    value={t.itemId ? { itemId: t.itemId, itemDate: t.itemDate } : undefined}
                    onChange={(v) => v && set(t, { itemId: v.itemId, itemDate: v.itemDate }, 'Задачу підвʼязано')}
                    onClose={() => setMode(null)}
                  />
                )}
              </div>
              {!t.doneAt && (
                <button
                  type="button"
                  className="round-btn task-more"
                  aria-label="Ще дії"
                  aria-expanded={menu === t.id}
                  onClick={() => setMenu(menu === t.id ? null : t.id)}
                >
                  <Icon d={ICONS.dots} size={12} />
                </button>
              )}
              {t.doneAt && (
                <button type="button" className="round-btn task-more" aria-label="Видалити" onClick={() => onRemove(t)}>
                  <Icon d={ICONS.close} size={10} />
                </button>
              )}
              {menu === t.id && (
                <div className="task-menu" role="menu">
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setMenu(null);
                      setMode({ id: t.id, kind: 'link' });
                    }}
                  >
                    <Icon d={ICONS.link} size={14} />
                    {ev ? 'Підвʼязати до іншої події' : 'Підвʼязати до події'}
                  </button>
                  {ev && (
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setMenu(null);
                        set(t, { itemId: undefined, itemDate: undefined }, 'Задачу відвʼязано');
                      }}
                    >
                      <Icon d={ICONS.close} size={14} />
                      Відвʼязати від події
                    </button>
                  )}
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setMenu(null);
                      onMakeEvent(t);
                    }}
                  >
                    <Icon d={ICONS.makeEvent} size={14} />
                    Зробити подією
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setMenu(null);
                      setMode({ id: t.id, kind: 'day' });
                    }}
                  >
                    <Icon d={ICONS.day} size={14} />
                    {t.due ? 'Змінити день' : 'Додати день'}
                  </button>
                  <hr />
                  <button
                    type="button"
                    role="menuitem"
                    className="danger"
                    onClick={() => {
                      setMenu(null);
                      onRemove(t);
                    }}
                  >
                    <Icon d={ICONS.trash} size={14} />
                    Видалити
                  </button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// ---------- Чекліст у короткому перегляді події ----------

interface ChecklistProps {
  tasks: Task[];
  onToggle: (t: Task) => void;
  onUnlink: (t: Task) => void;
  onAdd: (title: string) => void;
  /** таблиці задач ще немає в базі — кнопки не показуємо */
  disabled?: boolean;
}

export function Checklist({ tasks, onToggle, onUnlink, onAdd, disabled }: ChecklistProps) {
  const [adding, setAdding] = useState(false);
  const [text, setText] = useState('');
  if (disabled) return null;
  const add = (
    <>
      {adding ? (
        <div className="cl-row">
          <span className="task-check ghost" aria-hidden="true" />
          <input
            className="cl-input"
            autoFocus
            value={text}
            maxLength={300}
            placeholder="нова задача"
            aria-label="Нова задача"
            onChange={(e) => setText(e.target.value)}
            onBlur={() => {
              if (!text.trim()) setAdding(false);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                e.preventDefault();
                if (text.trim()) onAdd(text.trim());
                setText('');
              }
              if (e.key === 'Escape') {
                e.stopPropagation();
                setText('');
                setAdding(false);
              }
            }}
          />
        </div>
      ) : (
        <button type="button" className="text-add cl-add" onClick={() => setAdding(true)}>
          <Icon d={ICONS.plus} size={12} />
          Додати задачу
        </button>
      )}
    </>
  );
  if (!tasks.length) return <div className="checklist empty">{add}</div>;
  return (
    <div className="checklist">
      <h3>задачі</h3>
      {tasks.map((t) => (
        <div key={t.id} className={'cl-row' + (t.doneAt ? ' done' : '')}>
          <Check on={!!t.doneAt} label={t.title} onClick={() => onToggle(t)} />
          <span className="cl-text">{t.title}</span>
          <button type="button" className="x20 cl-unlink" aria-label="Відвʼязати від події" title="Відвʼязати від події" onClick={() => onUnlink(t)}>
            <Icon d={ICONS.close} size={8} />
          </button>
        </div>
      ))}
      {add}
    </div>
  );
}
