// Бічна панель бібліотеки страв (ноутбук, 14.11; 15.11 — без категорій): пошук, улюблені зверху;
// страви перетягують у сітку тижня. Унизу — «Скопіювати минулий тиждень» і «Очистити тиждень».
import { DishRow } from './DishRow';
import { useMemo, useState } from 'react';
import { ICONS, Icon } from '../components/Icon';
import type { Dish, DishSync } from './dishes';
import { MODULES } from '../types';

/** Лупа: суцільна, прямі краї */
const SEARCH = 'M3 3h12v12H3zM6 6v6h6V6zM13.5 16 16 13.5l5 5-2.5 2.5z';

/** Поле пошуку з іконкою лупи (16.11) */
export function DishSearch({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="food-search-wrap">
      <Icon d={SEARCH} size={16} />
      <input className="food-search" type="search" value={value} onChange={(e) => onChange(e.target.value)} placeholder="пошук страви" aria-label="Пошук страви" />
    </div>
  );
}

/** Блок з пунктирною рамкою перед списком страв: швидко додати нову страву */
export function DishAddBlock({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" className="food-add-block" onClick={onClick}>
      <Icon d={MODULES.food.icon} size={20} />
      Додати страву
    </button>
  );
}

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

/** Дублювати (23.11): два квадрати один за одним — суцільні, прямі краї, evenodd */
const DUPLICATE = 'M8 2h14v14H8zM11 5v8h8V5zM2 8h4v3H5v8h8v-1h3v4H2z';

/**
 * Кнопки поруч із заголовком «страви» (23.11 — лише дві): «+» — додати страву;
 * «Дублювати на наступний тиждень» — страви показаного тижня на ті самі дні й час наступного тижня (з «Скасувати»).
 * Меню «…» («Скопіювати минулий тиждень», «Очистити тиждень») прибрано.
 */
export function FoodHeadActions({ onAdd, onDuplicate, weekFoodCount }: { onAdd: () => void; onDuplicate: () => void; weekFoodCount: number }) {
  return (
    <div className="food-head-actions">
      <button type="button" className="round-btn" aria-label="Додати страву" title="Додати страву" onClick={onAdd}>
        <Icon d={ICONS.plus} size={12} />
      </button>
      <button
        type="button"
        className="round-btn"
        aria-label="Дублювати на наступний тиждень"
        title={weekFoodCount ? 'Дублювати на наступний тиждень' : 'На цьому тижні ще немає страв'}
        disabled={weekFoodCount === 0}
        onClick={onDuplicate}
      >
        <Icon d={DUPLICATE} size={14} />
      </button>
    </div>
  );
}

export function FoodPanel({ dishes, sync, embedded, onClose, onAdd, onOpen, onCopyWeek, onClearWeek, weekFoodCount, prevWeekFoodCount }: Props) {
  const [q, setQ] = useState('');
  const [confirmClear, setConfirmClear] = useState(false);
  const list = useMemo(() => filterDishes(dishes, q), [dishes, q]);

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
          <DishSearch value={q} onChange={setQ} />

          {!embedded && (
            <button type="button" className="add-act-btn food-add" onClick={onAdd}>
              <Icon d={ICONS.plus} size={12} />
              Додати страву
            </button>
          )}

          <div className="food-list">
            {embedded && <DishAddBlock onClick={onAdd} />}
            {list.length === 0 && (
              <p className="muted-text food-empty">{dishes.length ? 'Нічого не знайдено.' : 'Бібліотека порожня. Додайте першу страву — за посиланням на рецепт або вручну.'}</p>
            )}
            {list.map((d) => (
              <DishRow
                key={d.id}
                dish={d}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData(DISH_MIME, d.id);
                  e.dataTransfer.setData('text/plain', d.name);
                  e.dataTransfer.effectAllowed = 'copy';
                }}
                onClick={() => onOpen(d)}
                title="Перетягніть у тиждень або натисніть, щоб відкрити"
              />
            ))}
          </div>
          {dishes.length > 0 && <p className="hint xs">Перетягніть страву на день і час у тижні або на смугу «ранок», «день», «вечір», якщо точний час не важливий.</p>}

          {!embedded && (
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
          )}
        </>
      )}
    </aside>
  );
}
