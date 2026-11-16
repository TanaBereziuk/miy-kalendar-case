// Бічна панель бібліотеки страв (ноутбук, 14.11; 15.11 — без категорій): пошук, улюблені зверху;
// страви перетягують у сітку тижня. Унизу — «Скопіювати минулий тиждень» і «Очистити тиждень».
import { useMemo, useState } from 'react';
import { MODULES } from '../types';
import { ICONS, Icon } from '../components/Icon';
import type { Dish, DishSync } from './dishes';

export const DISH_MIME = 'application/x-miy-dish';

interface Props {
  dishes: Dish[];
  sync: DishSync;
  /** у бічній панелі асистента (таб «страви», 16.11) — без власної картки й заголовка */
  embedded?: boolean;
  onClose?: () => void;
  onAdd: () => void;
  onOpen: (d: Dish) => void;
  onCopyWeek: () => void;
  onClearWeek: () => void;
  weekFoodCount: number;
  prevWeekFoodCount: number;
}

export function dishMeta(d: Dish): string {
  return [d.prepMin ? `${d.prepMin} хв` : '', ...d.tags].filter(Boolean).join(' · ');
}

export function filterDishes(dishes: Dish[], q: string) {
  const s = q.trim().toLowerCase();
  return dishes
    .filter((d) => (!s || d.name.toLowerCase().includes(s) || d.tags.some((t) => t.includes(s))))
    .sort((a, b) => Number(b.fav) - Number(a.fav) || a.name.localeCompare(b.name, 'uk'));
}

export function FoodPanel({ dishes, sync, embedded, onClose, onAdd, onOpen, onCopyWeek, onClearWeek, weekFoodCount, prevWeekFoodCount }: Props) {
  const [q, setQ] = useState('');
  const [confirmClear, setConfirmClear] = useState(false);
  const list = useMemo(() => filterDishes(dishes, q), [dishes, q]);
  const m = MODULES.food;

  return (
    <aside className={'food-panel' + (embedded ? ' embedded' : '')} aria-label="Бібліотека страв">
      {!embedded && (
        <div className="food-head">
          <h2>страви</h2>
          <button type="button" className="round-btn" aria-label="Сховати страви" onClick={onClose}>
            <Icon d={ICONS.close} size={12} />
          </button>
        </div>
      )}

      {sync === 'missing' ? (
        <p className="notice warn">
          Щоб зберігати страви, запустіть у Supabase новий SQL зі сховища (файл supabase/schema.sql, розділ 6).
        </p>
      ) : (
        <>
          <input className="food-search" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="пошук страви або тегу" aria-label="Пошук страви" />

          <button type="button" className="add-act-btn food-add" onClick={onAdd}>
            <Icon d={ICONS.plus} size={12} />
            Додати страву
          </button>

          <div className="food-list">
            {list.length === 0 && (
              <p className="muted-text food-empty">{dishes.length ? 'Нічого не знайдено.' : 'Бібліотека порожня. Додайте першу страву — за посиланням на рецепт або вручну.'}</p>
            )}
            {list.map((d) => (
              <button
                type="button"
                key={d.id}
                className="food-row"
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData(DISH_MIME, d.id);
                  e.dataTransfer.setData('text/plain', d.name);
                  e.dataTransfer.effectAllowed = 'copy';
                }}
                onClick={() => onOpen(d)}
                title="Перетягніть у тиждень або натисніть, щоб відкрити"
              >
                {d.photoUrl ? (
                  <img className="food-thumb" src={d.photoUrl} alt="" loading="lazy" />
                ) : (
                  <span className="food-thumb" style={{ background: m.color, color: m.text }}>
                    <Icon d={m.icon} size={14} />
                  </span>
                )}
                <span className="food-text">
                  <span className="food-name">
                    {d.fav && (
                      <span className="food-fav" aria-label="улюблена">
                        <Icon d={MODULES.other.icon} size={10} />
                      </span>
                    )}
                    {d.name}
                  </span>
                  {dishMeta(d) && <span className="food-meta">{dishMeta(d)}</span>}
                </span>
              </button>
            ))}
          </div>
          {dishes.length > 0 && <p className="hint xs">Перетягніть страву на день і час у тижні. На підпис групи — у звичний час прийому їжі.</p>}

          <div className="food-week">
            <button type="button" className="btn tinted small" disabled={prevWeekFoodCount === 0} onClick={onCopyWeek}>
              Скопіювати минулий тиждень
            </button>
            {confirmClear ? (
              <button
                type="button"
                className="btn danger small"
                onClick={() => {
                  onClearWeek();
                  setConfirmClear(false);
                }}
              >
                Прибрати {weekFoodCount} з тижня
              </button>
            ) : (
              <button type="button" className="btn tinted small" disabled={weekFoodCount === 0} onClick={() => setConfirmClear(true)}>
                Очистити тиждень
              </button>
            )}
          </div>
        </>
      )}
    </aside>
  );
}
