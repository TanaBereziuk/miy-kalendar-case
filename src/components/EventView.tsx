// Короткий перегляд події (16.11): клік по події в календарі відкриває невелику картку з записом
// і двома діями — «Змінити» (відкриває бічну панель, як при створенні) та «Видалити».
// На ноутбуці картка стоїть поруч із подією, на телефоні — вікно знизу.
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { MODULES, type CalendarItem } from '../types';
import { DAYS_FULL, MONTHS_GEN, fromISO, weekdayIndex } from '../lib/dates';
import { describeRepeat } from '../lib/repeat';
import type { Scope } from '../lib/series';
import { ICONS, Icon } from './Icon';

export interface Anchor {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

interface Props {
  item: CalendarItem;
  /** дата показу повторюваної події, на який натиснули (18.11): її й показуємо, з неї й рахуємо «лише цю» */
  occ?: string;
  /** подія з Google Календаря (18.11): лише перегляд, без олівця й кошика */
  readOnly?: boolean;
  anchor?: Anchor;
  phone: boolean;
  onClose: () => void;
  onEdit: () => void;
  onDelete: (scope?: Scope) => void;
  /** задачі події — чекліст (етап 1, 18.11) */
  extra?: ReactNode;
}

/** Олівець (редагувати) і кошик (видалити): суцільні, прямі краї */
const PENCIL = 'M14.5 3 21 9.5 9.5 21H3v-6.5zM5 15.3V19h3.7z';
const TRASH = 'M9 2h6v2h6v3H3V4h6zM5 9h14v13H5zM9 12v7h2v-7zM13 12v7h2v-7z';
const WIDTH = 320;
const GAP = 8;

function dateLine(item: CalendarItem, occ?: string): string {
  const d = fromISO(occ ?? item.date);
  const day = `${DAYS_FULL[weekdayIndex(d)]}, ${d.getDate()} ${MONTHS_GEN[d.getMonth()]}`;
  if (item.allDay) return `${day} · весь день`;
  // страва (16.11, 19:37): час для неї не встановлюють — лише дата
  if (item.module === 'food' && item.source?.startsWith('dish:')) return day;
  return `${day} · ${item.start}${item.end ? `–${item.end}` : ''}`;
}

export function EventView({ item, occ, readOnly, anchor, phone, onClose, onEdit, onDelete, extra }: Props) {
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  // Повторювана подія (18.11): кошик спершу питає, що прибрати — лише цю, цю й наступні чи всі
  const [askDelete, setAskDelete] = useState(false);
  const series = !!item.repeat && !!occ;
  const ref = useRef<HTMLDivElement>(null);
  const m = MODULES[item.module];

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // у полі (нова задача в чеклісті) клавіші — для тексту, а не для вікна
      const t = e.target as HTMLElement | null;
      if (t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return;
      if (e.key === 'Escape') onClose();
      // Delete / Backspace (18.11) — як кошик: повторювана спершу питає, що прибрати
      if ((e.key === 'Delete' || e.key === 'Backspace') && !readOnly) {
        e.preventDefault();
        if (series) setAskDelete(true);
        else onDelete();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, onDelete, series, readOnly]);

  // Ставимо картку праворуч від події, а якщо не вміщається — ліворуч; не виходимо за межі екрана
  useLayoutEffect(() => {
    if (phone || !ref.current) return;
    const h = ref.current.offsetHeight;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    if (!anchor) return setPos({ left: Math.max(16, (vw - WIDTH) / 2), top: Math.max(16, (vh - h) / 2) });
    let left = anchor.right + GAP;
    if (left + WIDTH > vw - 16) left = anchor.left - GAP - WIDTH;
    left = Math.min(Math.max(16, left), vw - WIDTH - 16);
    const top = Math.min(Math.max(16, anchor.top), vh - h - 16);
    setPos({ left, top });
  }, [anchor, phone]);

  const style = phone ? undefined : { left: pos?.left ?? 0, top: pos?.top ?? 0, visibility: pos ? ('visible' as const) : ('hidden' as const) };

  return (
    <div className={'event-view-overlay' + (phone ? ' phone' : '')} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} className="event-view" style={style} role="dialog" aria-labelledby="ev-title">
        <div className="event-view-tools">
          {!readOnly && (
          <>
          <button type="button" className="round-btn" aria-label="Змінити" title="Змінити" onClick={onEdit}>
            <Icon d={PENCIL} size={14} />
          </button>
          <button
            type="button"
            className={'round-btn' + (askDelete ? ' on' : '')}
            aria-label="Видалити"
            title="Видалити"
            aria-expanded={series ? askDelete : undefined}
            onClick={() => (series ? setAskDelete((v) => !v) : onDelete())}
          >
            <Icon d={TRASH} size={14} />
          </button>
          </>
          )}
          <button type="button" className="round-btn" aria-label="Закрити" title="Закрити" onClick={onClose}>
            <Icon d={ICONS.close} size={12} />
          </button>
        </div>

        <div className="event-view-head">
          {readOnly ? (
            <span className="event-view-tile google-tile" aria-hidden="true">
              G
            </span>
          ) : (
            <span className="event-view-tile" style={{ background: m.color, color: m.text }}>
              <Icon d={m.icon} size={16} />
            </span>
          )}
          <div className="event-view-text">
            <h2 id="ev-title">{item.title}</h2>
            <p>{dateLine(item, occ)}</p>
          </div>
        </div>

        {readOnly && <p className="event-view-row muted-row">з Google Календаря · лише перегляд</p>}
        {(item.repeat || item.note) && (
          <div className="event-view-body">
            {item.repeat && <p className="event-view-row">{'повторюється: ' + describeRepeat(item.repeat)}</p>}
            {item.note && <p className="event-view-row">{item.note}</p>}
          </div>
        )}

        {extra}

        {askDelete && (
          <div className="scope-ask" role="group" aria-label="Що видалити">
            <p className="scope-ask-title">видалити повторювану подію</p>
            {(['one', 'following', 'all'] as Scope[]).map((s) => (
              <button type="button" key={s} className="scope-ask-btn" onClick={() => onDelete(s)}>
                {s === 'one' ? 'Лише цю' : s === 'following' ? 'Цю й наступні' : 'Усі повтори'}
              </button>
            ))}
          </div>
        )}

      </div>
    </div>
  );
}
