// Асистент (16.11): ви коротко пишете, що й коли запланувати, події одразу зʼявляються в календарі,
// а під відповіддю є «Скасувати».
// 11:56 — на ноутбуці панель завжди відкрита справа (528, на всю висоту) і згортається вправо кнопкою «›»;
// на телефоні відкривається кнопкою біля «+» вікном знизу. «+» додає подію вручну (ItemDialog з табами).
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { MODULES } from '../types';
import { ICONS, Icon } from '../components/Icon';
import type { Msg } from './useAssistant';

const EXAMPLES = [
  'танці в пн, вт і ср з 6 до 8',
  'вечеря з друзями в пʼятницю о 19',
  'щеплення коту 3 грудня',
  'щотижня в суботу йога о 10',
  'сплатити ЄСВ 20 січня',
];

/** Стрілка вгору — надіслати */
const SEND = 'M12 3l8.5 8.5-2.5 2.5-4.25-4.25V21h-3.5V9.75L6 14l-2.5-2.5z';

interface Props {
  /** dock — постійна панель праворуч на ноутбуці; sheet — вікно знизу на телефоні */
  mode: 'dock' | 'sheet';
  /** змінюється, коли панель розгорнули, — тоді ставимо курсор у поле */
  focusKey?: number;
  messages: Msg[];
  onSend: (text: string) => void;
  onUndo: (id: number) => void;
  /** dock — згорнути вправо; sheet — закрити */
  onClose: () => void;
  /** таб «страви» (16.11, 12:08): бібліотека страв, яку перетягують у тиждень; немає — табів немає */
  food?: ReactNode;
  tab?: 'chat' | 'food';
  /** кнопки поруч із заголовком таба «страви» */
  foodHead?: ReactNode;
  /** картка страви поверх бібліотеки: заголовок і стрілка «назад» замість кнопок біля «страви» */
  foodTitle?: string;
  onBack?: () => void;
  onTab?: (t: 'chat' | 'food') => void;
}

export function AssistantPanel({ mode, focusKey = 0, messages, onSend, onUndo, onClose, food, tab = 'chat', onTab, foodHead, foodTitle, onBack }: Props) {
  const [text, setText] = useState('');
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const dock = mode === 'dock';
  const showFood = !!food && tab === 'food';

  useEffect(() => {
    if (!dock || focusKey > 0) inputRef.current?.focus();
  }, [dock, focusKey, showFood]);

  useEffect(() => {
    if (dock) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [dock, onClose]);

  // нова відповідь — прокручуємо вниз
  useLayoutEffect(() => {
    const el = panelRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length]);

  // поле росте разом з текстом (до 5 рядків)
  useLayoutEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = text ? Math.min(el.scrollHeight + 1, 120) + 'px' : '';
  }, [text]);

  const submit = () => {
    if (!text.trim()) return;
    onSend(text);
    setText('');
    inputRef.current?.focus();
  };

  const panel = (
      <div
        className={'dialog dish-dialog assistant-dialog' + (dock ? ' assistant-dock' : '')}
        ref={panelRef}
        role={dock ? 'complementary' : 'dialog'}
        aria-labelledby="asst-title"
      >
        <div className="dialog-head">
          {showFood && onBack && (
            <button type="button" className="round-btn" aria-label="Назад до страв" onClick={onBack}>
              <Icon d={ICONS.prev} size={12} />
            </button>
          )}
          <h2 id="asst-title" className="head-font">
            {showFood ? (onBack && foodTitle ? foodTitle : 'страви') : 'що запланувати'}
          </h2>
          {showFood && !onBack && foodHead}
          {/* 16:17: у бічній панелі «×» немає — панель ховає повторний клік по її іконці в меню */}
          {!dock && (
            <button type="button" className="round-btn" aria-label="Закрити" onClick={onClose}>
              <Icon d={ICONS.close} size={12} />
            </button>
          )}
        </div>

        {food && onTab && (
          <div className="seg fill event-tabs" role="tablist" aria-label="Панель">
            <button type="button" role="tab" className={showFood ? '' : 'on'} aria-selected={!showFood} onClick={() => onTab?.('chat')}>
              асистент
            </button>
            <button type="button" role="tab" className={showFood ? 'on' : ''} aria-selected={showFood} onClick={() => onTab?.('food')}>
              страви
            </button>
          </div>
        )}

        {showFood ? (
          food
        ) : (
        <>
        <div className="chat" aria-live="polite">
          {messages.length === 0 && (
            <div className="chat-intro">
              <p>Напишіть коротко, що й коли запланувати. Події зʼявляться в календарі одразу, а скасувати їх можна під відповіддю.</p>
              <span className="dish-label">наприклад</span>
              <div className="chips">
                {EXAMPLES.map((ex) => (
                  <button
                    type="button"
                    key={ex}
                    className="chat-example"
                    onClick={() => {
                      setText(ex);
                      inputRef.current?.focus();
                    }}
                  >
                    {ex}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((m) =>
            m.role === 'user' ? (
              <div key={m.id} className="chat-user">
                {m.text}
              </div>
            ) : (
              <div key={m.id} className={'chat-bot' + (m.undone ? ' undone' : '')}>
                {m.text && <p>{m.text}</p>}
                {!!m.shown?.length && (
                  <ul className="chat-items">
                    {m.shown.map((s, i) => {
                      const mod = MODULES[s.module];
                      return (
                        <li key={i}>
                          {s.task ? (
                            <span className="chat-tile task-tile">
                              <Icon d={ICONS.tasks} size={16} />
                            </span>
                          ) : (
                            <span className="chat-tile" style={{ background: mod.color, color: mod.text }}>
                              <Icon d={mod.icon} size={16} />
                            </span>
                          )}
                          <span className="chat-item-text">
                            <b>{s.title}</b>
                            <small>{s.when}</small>
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                )}
                {m.undo &&
                  (m.undone ? (
                    <span className="chat-undone">Скасовано.</span>
                  ) : (
                    <button type="button" className="chat-undo" onClick={() => onUndo(m.id)}>
                      Скасувати
                    </button>
                  ))}
              </div>
            ),
          )}
        </div>

        <form
          className="actions chat-compose"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <div className="chat-row">
            <textarea
              ref={inputRef}
              rows={1}
              value={text}
              placeholder="Що й коли запланувати"
              aria-label="Що запланувати"
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  submit();
                }
              }}
            />
            <button type="submit" className="chat-send" aria-label="Надіслати" disabled={!text.trim()}>
              <Icon d={SEND} size={18} />
            </button>
          </div>
        </form>
        </>
        )}
      </div>
  );

  if (dock) return panel;
  return (
    <div className="overlay dish-overlay asst-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      {panel}
    </div>
  );
}
