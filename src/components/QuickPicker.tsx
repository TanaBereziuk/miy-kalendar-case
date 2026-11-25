// Форма додавання з календаря у два кроки (23.11, макет погоджено в чаті).
// Крок 1 — цей перелік поруч із клітинкою: що створити (страва, заняття, улюбленець, нагадування ФОП, вітання, задача,
// інша подія) і внизу поле «швидке нагадування»: назва + Enter — одразу подія «інше» на час клітинки.
// Вибір пункту відкриває крок 2 — ItemDialog у режимі quick з цим типом (тип можна змінити капсулою вгорі).
import { useEffect, useRef, useState } from 'react';
import type { Anchor } from './EventView';
import type { NewItem } from '../types';
import { ICONS, Icon } from './Icon';
import { dayLabel, quickTypeMeta, usePopoverPos, type QuickType } from './QuickAdd';
import { STICKERS, STICKER_IDS, Sticker } from './Stickers';

const PICK_WIDTH = 300;

interface Props {
  anchor?: Anchor;
  phone: boolean;
  draft: Partial<NewItem>;
  types: QuickType[];
  onPick: (t: QuickType) => void;
  /** швидке нагадування: подія «інше» з цією назвою на час клітинки */
  onQuickAdd: (title: string) => void;
  onClose: () => void;
  /** стікери цієї клітинки (23.11): ключ 'рррр-мм-ддTгг:хх' у settings.stickers; без них рядка «стікер» немає */
  stickers?: string[];
  onStickers?: (ids: string[]) => void;
}

export function QuickPicker({ anchor, phone, draft, types, onPick, onQuickAdd, onClose, stickers, onStickers }: Props) {
  const [stickerMode, setStickerMode] = useState(false);
  const [el, setEl] = useState<HTMLDivElement | null>(null);
  const style = usePopoverPos({ current: el }, anchor, phone, PICK_WIDTH, [el]);
  const [title, setTitle] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const when = draft.allDay || !draft.start ? 'весь день' : `${draft.start} – ${draft.end ?? ''}`;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className={'event-view-overlay quick-overlay' + (phone ? ' phone' : '')} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={setEl} className="event-view quick-pick" style={style} role="dialog" aria-labelledby="qp-title">
        <div className="quick-pick-head">
          <div className="event-view-text">
            <h2 id="qp-title">{dayLabel(draft.date ?? '')}</h2>
            <p>{when}</p>
          </div>
          <button type="button" className="round-btn" aria-label="Закрити" onClick={onClose}>
            <Icon d={ICONS.close} size={12} />
          </button>
        </div>
        {stickerMode && stickers && onStickers ? (
          <div className="quick-pick-stickers">
            <div className="sticker-grid">
              {STICKER_IDS.map((id) => {
                const on = stickers.includes(id);
                return (
                  <button
                    key={id}
                    type="button"
                    className={'sticker-opt' + (on ? ' on' : '')}
                    aria-pressed={on}
                    title={STICKERS[id].name}
                    onClick={() => onStickers(on ? stickers.filter((x) => x !== id) : [...stickers, id].slice(-2))}
                  >
                    <Sticker id={id} size={44} />
                  </button>
                );
              })}
            </div>
            <div className="quick-pick-sticker-foot">
              <button type="button" className="text-add" onClick={() => setStickerMode(false)}>
                <Icon d={ICONS.prev} size={10} />
                Назад
              </button>
              {stickers.length > 0 && (
                <button type="button" className="text-add sticker-clear" onClick={() => onStickers([])}>
                  Прибрати всі
                </button>
              )}
            </div>
          </div>
        ) : (
        <>
        <div className="quick-pick-list" role="menu" aria-label="Що створити">
          {types.map((t) => {
            const m = quickTypeMeta(t);
            return (
              <button type="button" role="menuitem" key={t} className="quick-pick-row" onClick={() => onPick(t)}>
                <span className="qf-tile" style={{ background: m.bg, color: m.fg }}>
                  <Icon d={m.icon} size={13} />
                </span>
                {m.label}
              </button>
            );
          })}
        </div>
        <div className="quick-pick-sep" />
        {stickers && onStickers && (
          <button type="button" className="quick-pick-row" onClick={() => setStickerMode(true)}>
            <span className="qf-tile fill">
              <Icon d={ICONS.sticker} size={12} />
            </span>
            стікер
            {stickers.length > 0 && (
              <span className="quick-pick-chosen" aria-hidden="true">
                {stickers.map((id, i) => (
                  <Sticker key={id} id={id} size={24} i={i} />
                ))}
              </span>
            )}
          </button>
        )}
        <div className={'quick-pick-fast' + (title ? ' on' : '')} onClick={() => inputRef.current?.focus()}>
          <span className="qf-tile fill">
            <Icon d={ICONS.plus} size={12} />
          </span>
          <input
            ref={inputRef}
            value={title}
            maxLength={300}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && title.trim()) {
                e.preventDefault();
                onQuickAdd(title.trim());
              }
            }}
            placeholder="швидке нагадування"
            aria-label="Швидке нагадування"
            autoComplete="off"
          />
        </div>
        {title.trim() && <p className="quick-pick-hint">Enter — додати {draft.allDay || !draft.start ? 'на весь день' : `на ${draft.start}`}</p>}
        </>
        )}
      </div>
    </div>
  );
}
