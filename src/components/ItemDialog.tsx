import { useEffect, useRef, useState } from 'react';
import { MODULES, MODULE_ORDER, type CalendarItem, type ModuleId, type NewItem, type Repeat } from '../types';
import { fromISO, fromMinutes, toMinutes, weekdayIndex } from '../lib/dates';
import { describeRepeat } from '../lib/repeat';
import { ICONS, Icon } from './Icon';
import { DishFormFields, useDishForm } from '../food/DishForm';
import type { NewDish } from '../food/dishes';

/** Короткі підписи вкладок */
const TAB_LABELS: Record<ModuleId, string> = { food: 'їжа', fop: 'ФОП', hobby: 'хобі', pet: 'улюбленець', other: 'інше' };

export interface DialogState {
  item?: CalendarItem;
  draft?: Partial<NewItem>;
}

interface Props {
  state: DialogState;
  onClose: () => void;
  onSave: (data: NewItem, id?: string) => void;
  onDelete: (id: string) => void;
  /** нова страва з вкладки «харчування»: зберегти в бібліотеку й поставити в календар */
  onSaveDish: (d: NewDish, date: string, start?: string) => void;
}

export function ItemDialog({ state, onClose, onSave, onDelete, onSaveDish }: Props) {
  const base = state.item ?? state.draft ?? {};
  const [title, setTitle] = useState(base.title ?? '');
  const [module, setModule] = useState<ModuleId>(base.module ?? (state.item ? 'other' : 'food'));
  const [date, setDate] = useState(base.date ?? '');
  const baseRepeat = base.repeat;
  const isSimple = (r?: Repeat) => !r || ((r.interval ?? 1) === 1 && (r.freq !== 'weekly' || (r.days?.length ?? 0) <= 1));
  const [repeatKind, setRepeatKind] = useState<string>(baseRepeat ? (isSimple(baseRepeat) ? baseRepeat.freq : 'keep') : 'none');
  const [until, setUntil] = useState(baseRepeat?.until ?? '');
  const [allDay, setAllDay] = useState(base.allDay ?? false);
  const [start, setStart] = useState(base.start ?? '09:00');
  const [end, setEnd] = useState(base.end ?? fromMinutes(toMinutes(base.start ?? '09:00') + 60));
  const [note, setNote] = useState(base.note ?? '');
  const [error, setError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);
  const dishForm = useDishForm();
  // Нова подія: модуль обирають вкладками вгорі, поля залежать від модуля (зараз окремі поля лише в «харчування»).
  // Наявну подію редагуємо звичайними полями.
  const isNew = !state.item;
  const foodTab = isNew && module === 'food';

  useEffect(() => {
    if (!foodTab) titleRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, foodTab]);

  const changeStart = (v: string) => {
    // Зберігаємо тривалість, коли рухаємо початок
    if (v && start && end) {
      const dur = toMinutes(end) - toMinutes(start);
      if (dur > 0) setEnd(fromMinutes(toMinutes(v) + dur));
    }
    setStart(v);
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (foodTab) {
      const d = dishForm.build();
      if (d) onSaveDish(d, date, allDay ? undefined : start);
      return;
    }
    if (!title.trim()) return setError('Вкажіть назву події.');
    if (!date) return setError('Вкажіть дату.');
    if (!allDay) {
      if (!start) return setError('Вкажіть час початку.');
      if (end && toMinutes(end) <= toMinutes(start)) return setError('Кінець має бути пізніше за початок.');
    }
    let repeat: Repeat | undefined;
    if (repeatKind === 'keep' && baseRepeat) repeat = { ...baseRepeat, until: until || undefined };
    else if (repeatKind === 'weekly') repeat = { freq: 'weekly', days: [weekdayIndex(fromISO(date))], until: until || undefined };
    else if (repeatKind !== 'none') repeat = { freq: repeatKind as Repeat['freq'], until: until || undefined };
    if (repeat?.until && repeat.until < date) return setError('Дата завершення повторів має бути пізніше за початок.');
    onSave(
      {
        title: title.trim(),
        module,
        date,
        allDay,
        start: allDay ? undefined : start,
        end: allDay ? undefined : end || undefined,
        note: note.trim() || undefined,
        repeat,
        source: state.item?.source,
      },
      state.item?.id,
    );
  };

  return (
    <div className="overlay dish-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form className="dialog dish-dialog event-dialog" onSubmit={submit} aria-labelledby="dlg-title">
        <div className="dialog-head">
          <h2 id="dlg-title" className="head-font">
            {state.item ? 'подія' : 'нова подія'}
          </h2>
          <button type="button" className="round-btn" aria-label="Закрити" onClick={onClose}>
            <Icon d={ICONS.close} size={12} />
          </button>
        </div>

        {isNew && (
          <div className="seg fill event-tabs" role="tablist" aria-label="Модуль">
            {MODULE_ORDER.map((id) => {
              const on = module === id;
              return (
                <button type="button" role="tab" key={id} className={on ? 'on' : ''} aria-selected={on} onClick={() => setModule(id)}>
                  {TAB_LABELS[id]}
                </button>
              );
            })}
          </div>
        )}

        {foodTab ? (
          <DishFormFields f={dishForm} />
        ) : (
          <>
            <label className="field">
              <span>назва</span>
              <input ref={titleRef} maxLength={300} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Наприклад, біг у парку" />
            </label>


    {!isNew && (
            <fieldset className="field">
              <legend>модуль</legend>
              <div className="chips">
                {MODULE_ORDER.map((id) => {
                  const m = MODULES[id];
                  const on = module === id;
                  return (
                    <button
                      type="button"
                      key={id}
                      className={'chip' + (on ? ' on' : '')}
                      aria-pressed={on}
                      onClick={() => setModule(id)}
                    >
                      <span className="chip-tile" style={{ background: m.color, color: m.text }}>
                        <Icon d={m.icon} size={12} />
                      </span>
                      {m.name}
                    </button>
                  );
                })}
              </div>
            </fieldset>
    )}

            <div className="row">
              <label className="field grow">
                <span>дата</span>
                <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              </label>
              <label className="check">
                <input type="checkbox" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} />
                весь день
              </label>
            </div>

            {!allDay && (
              <div className="row">
                <label className="field grow">
                  <span>початок</span>
                  <input type="time" value={start} onChange={(e) => changeStart(e.target.value)} />
                </label>
                <label className="field grow">
                  <span>кінець</span>
                  <input type="time" value={end} onChange={(e) => setEnd(e.target.value)} />
                </label>
              </div>
            )}

            <div className="row">
              <label className="field grow">
                <span>повторення</span>
                <select value={repeatKind} onChange={(e) => setRepeatKind(e.target.value)}>
                  <option value="none">не повторюється</option>
                  {baseRepeat && !isSimple(baseRepeat) && <option value="keep">{describeRepeat({ ...baseRepeat, until: undefined })}</option>}
                  <option value="daily">щодня</option>
                  <option value="weekly">щотижня</option>
                  <option value="monthly">щомісяця</option>
                  <option value="yearly">щороку</option>
                </select>
              </label>
              {repeatKind !== 'none' && (
                <label className="field grow">
                  <span>до <span className="field-opt">необовʼязково</span></span>
                  <input type="date" value={until} onChange={(e) => setUntil(e.target.value)} />
                </label>
              )}
            </div>
            {state.item?.repeat && <p className="hint small">Зміни застосуються до всіх повторів цієї події.</p>}

            <label className="field">
              <span>нотатка</span>
              <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
            </label>
          </>
        )}

        {error && !foodTab && (
          <p className="error" role="alert">
            {error}
          </p>
        )}

        <div className="actions">
          {state.item &&
            (confirmDelete ? (
              <button type="button" className="btn danger" onClick={() => onDelete(state.item!.id)}>
                Видалити остаточно
              </button>
            ) : (
              <button type="button" className="text-danger" onClick={() => setConfirmDelete(true)}>
                Видалити
              </button>
            ))}
          <span className="spacer" />
          <button type="button" className="btn secondary" onClick={onClose}>
            Скасувати
          </button>
          <button type="submit" className="btn primary" disabled={foodTab && dishForm.busy}>
            Зберегти
          </button>
        </div>
      </form>
    </div>
  );
}
