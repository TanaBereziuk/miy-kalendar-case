import { useMemo, useState } from 'react';
import type { FopAnswers } from '../onboarding/answers';
import { fopDeadlines, type FopDeadline } from '../onboarding/fop';
import { fromMinutes, toMinutes } from '../lib/dates';
import type { NewItem } from '../types';
import { ICONS, Icon } from './Icon';

/** Вид дедлайну за назвою — щоб у переліку був один (найближчий) рядок на кожен вид. */
function kindOf(title: string): string {
  if (title.startsWith('Подати декларацію з ПДВ')) return 'vat-decl';
  if (title.startsWith('Сплатити ПДВ')) return 'vat-pay';
  if (title.startsWith('Подати звіт за працівників')) return 'staff';
  if (title.startsWith('Подати')) return 'decl';
  if (title.startsWith('Сплатити ЄП')) return 'ep';
  if (title.startsWith('Сплатити ЄСВ')) return 'esv';
  return title;
}

const fmt = (iso: string) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}`;

/**
 * Вкладка «ФОП», коли профіль ФОП уже налаштовано (17.11, 22:29): перелік нагадувань за обраними параметрами
 * (найближчий дедлайн кожного виду) і «своє нагадування» з назвою. Для обраного — дата й час нагадування.
 */
/** keepDate — швидке додавання з клітинки (18.11): дата лишається днем клітинки, а не датою дедлайну */
export function useFopReminderForm(fop: FopAnswers, date: string, start?: string, keepDate = false) {
  const rows: FopDeadline[] = useMemo(() => {
    const seen = new Set<string>();
    return fopDeadlines(fop).filter((d) => {
      const k = kindOf(d.title);
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  }, [fop]);
  const [pick, setPick] = useState<number>(rows.length ? 0 : -1); // -1 — своє нагадування
  // 23.11: назва — назва обраного дедлайну (у швидкому вікні її можна змінити); «своє нагадування» — порожня
  const [name, setName] = useState(rows.length ? rows[0].title : '');
  const [day, setDay] = useState(rows.length && !keepDate ? rows[0].date : date);
  const [time, setTime] = useState(start ?? '10:00');

  const choose = (i: number) => {
    setPick(i);
    setName(i >= 0 ? rows[i].title : '');
    if (!keepDate) setDay(i >= 0 ? rows[i].date : date);
  };

  const build = (): { error: string } | { item: NewItem } => {
    const title = name.trim() || (pick >= 0 ? rows[pick].title : '');
    if (!title) return { error: 'Вкажіть назву нагадування.' };
    if (!day) return { error: 'Вкажіть дату.' };
    if (!time) return { error: 'Вкажіть час.' };
    return {
      item: { title, module: 'fop', date: day, allDay: false, start: time, end: fromMinutes(Math.min(toMinutes(time) + 30, 24 * 60 - 1)) },
    };
  };

  // 23.11: у швидкому вікні можна позначити кілька дедлайнів (і своє нагадування) — кожен стане окремим нагадуванням
  const [checked, setChecked] = useState<number[]>(rows.length ? [0] : [-1]);
  const toggle = (i: number) => {
    // своє нагадування вмикають — поле порожнє (а не з назвою дедлайну, що лишилася від першого рядка)
    if (i === -1 && !checked.includes(-1) && rows.some((r) => r.title === name)) setName('');
    setChecked((c) => (c.includes(i) ? c.filter((x) => x !== i) : [...c, i]));
  };
  const buildMany = (): { error: string } | { items: NewItem[] } => {
    if (!checked.length) return { error: 'Оберіть хоча б одне нагадування.' };
    if (checked.includes(-1) && !name.trim()) return { error: 'Вкажіть назву свого нагадування.' };
    if (!day) return { error: 'Вкажіть дату.' };
    if (!time) return { error: 'Вкажіть час.' };
    const end = fromMinutes(Math.min(toMinutes(time) + 30, 24 * 60 - 1));
    const order = [...rows.keys()].filter((i) => checked.includes(i)).concat(checked.includes(-1) ? [-1] : []);
    return {
      items: order.map((i) => ({ title: i >= 0 ? rows[i].title : name.trim(), module: 'fop' as const, date: day, allDay: false, start: time, end })),
    };
  };

  return { rows, pick, choose, name, setName, day, setDay, time, setTime, build, checked, setChecked, toggle, buildMany };
}

export type FopReminderForm = ReturnType<typeof useFopReminderForm>;

export function FopReminderFields({ f }: { f: FopReminderForm }) {
  return (
    <div className="fop-tab">
      <section className="fop-remind">
        <h3 className="fop-q" id="fop-remind-title">
          нагадування
        </h3>
        <div role="radiogroup" aria-labelledby="fop-remind-title" className="grouped fop-remind-list">
          {f.rows.map((r, i) => {
            const on = f.pick === i;
            return (
              <label key={r.title} className="plain-radio fop-remind-row">
                <input type="radio" name="fop-remind" className="radio-input" checked={on} onChange={() => f.choose(i)} />
                <span className={'radio-dot' + (on ? ' on' : '')} aria-hidden="true" />
                <span className="fop-remind-text">
                  <span>{r.title}</span>
                  <span className="fop-remind-date">до {fmt(r.date)}</span>
                </span>
              </label>
            );
          })}
          <label className="plain-radio fop-remind-row">
            <input type="radio" name="fop-remind" className="radio-input" checked={f.pick === -1} onChange={() => f.choose(-1)} />
            <span className={'radio-dot' + (f.pick === -1 ? ' on' : '')} aria-hidden="true" />
            <span className="fop-remind-text">
              <span>своє нагадування</span>
            </span>
          </label>
        </div>
        {!f.rows.length && <p className="hint fop-note">Для загальної системи дедлайнів за профілем немає — додайте своє нагадування.</p>}
      </section>

      {f.pick === -1 && (
        <label className="field">
          <span>назва</span>
          <input type="text" maxLength={300} autoFocus value={f.name} onChange={(e) => f.setName(e.target.value)} placeholder="Наприклад, зустріч з бухгалтером" />
        </label>
      )}

      <div className="row">
        <label className="field grow">
          <span>дата</span>
          <input type="date" value={f.day} onChange={(e) => f.setDay(e.target.value)} />
        </label>
        <label className="field grow">
          <span>час</span>
          <input type="time" value={f.time} onChange={(e) => f.setTime(e.target.value)} />
        </label>
      </div>
      <p className="hint fop-note">Нагадування стане в календар окремою подією в обраний день і час.</p>
    </div>
  );
}

/**
 * Нагадування ФОП у швидкому вікні (23.11, правки власниці): профіль ФОП визначено — лише перелік найближчих дедлайнів
 * (по одному кожного виду) і «своє нагадування»; можна позначити кілька — кожне стане окремим нагадуванням на день і час
 * клітинки. Позначки — вгорі рядка (назви бувають у два рядки).
 */
export function FopQuickFields({ f, when }: { f: FopReminderForm; when: string }) {
  const own = f.checked.includes(-1);
  return (
    <>
      <div role="group" aria-label="Нагадування" className="qf-list">
        {f.rows.map((r, i) => {
          const on = f.checked.includes(i);
          return (
            <label key={r.title} className={'qf-list-row' + (on ? ' on' : '')}>
              <input type="checkbox" className="radio-input" checked={on} onChange={() => f.toggle(i)} />
              <span className="qf-box qf-box-18" aria-hidden="true">
                <Icon d={ICONS.check} size={12} />
              </span>
              <span className="qf-list-text">
                <span>{r.title}</span>
                <span className="qf-list-sub">до {fmt(r.date)}</span>
              </span>
            </label>
          );
        })}
        <label className={'qf-list-row' + (own ? ' on' : '')}>
          <input type="checkbox" className="radio-input" checked={own} onChange={() => f.toggle(-1)} />
          <span className="qf-box qf-box-18" aria-hidden="true">
            <Icon d={ICONS.check} size={12} />
          </span>
          {own ? (
            <input
              className="qf-list-input"
              autoFocus
              maxLength={300}
              value={f.name}
              onChange={(e) => f.setName(e.target.value)}
              placeholder="своє нагадування"
              aria-label="Своє нагадування"
            />
          ) : (
            <span className="qf-list-text qf-list-muted">своє нагадування</span>
          )}
        </label>
      </div>
      <p className="qf-hint">
        {f.checked.length > 1 ? `Нагадування (${f.checked.length}) стануть` : 'Нагадування стане'} на {when}.
      </p>
    </>
  );
}
