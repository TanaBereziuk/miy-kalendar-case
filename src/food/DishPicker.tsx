// Телефон (14.11): замість перетягування — натиснути «+ страва» в групі дня й обрати страву зі списку.
import { useEffect, useMemo, useState } from 'react';
import { MODULES } from '../types';
import { ICONS, Icon } from '../components/Icon';
import type { Dish, DishSync } from './dishes';
import { dishMeta, filterDishes } from './FoodPanel';

interface Props {
  title: string;
  dishes: Dish[];
  sync: DishSync;
  onPick: (d: Dish) => void;
  onNew: () => void;
  onClose: () => void;
}

export function DishPicker({ title, dishes, sync, onPick, onNew, onClose }: Props) {
  const [q, setQ] = useState('');
  const list = useMemo(() => filterDishes(dishes, q), [dishes, q]);
  const m = MODULES.food;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="dialog dish-picker" role="dialog" aria-labelledby="pick-title">
        <div className="dialog-head">
          <h2 id="pick-title" className="head-font">
            {title}
          </h2>
          <button type="button" className="round-btn" aria-label="Закрити" onClick={onClose}>
            <Icon d={ICONS.close} size={12} />
          </button>
        </div>
        {sync === 'missing' ? (
          <p className="notice warn">Щоб зберігати страви, запустіть у Supabase новий SQL зі сховища (файл supabase/schema.sql, розділ 6).</p>
        ) : (
          <>
            <input className="food-search" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="пошук страви або тегу" aria-label="Пошук страви" />
            <div className="food-list">
              {list.length === 0 && <p className="muted-text food-empty">{dishes.length ? 'Нічого не знайдено.' : 'Бібліотека порожня.'}</p>}
              {list.map((d) => (
                <button type="button" key={d.id} className="food-row" onClick={() => onPick(d)}>
                  {d.photoUrl ? (
                    <img className="food-thumb" src={d.photoUrl} alt="" loading="lazy" />
                  ) : (
                    <span className="food-thumb" style={{ background: m.color, color: m.text }}>
                      <Icon d={m.icon} size={14} />
                    </span>
                  )}
                  <span className="food-text">
                    <span className="food-name">{d.name}</span>
                    {dishMeta(d) && <span className="food-meta">{dishMeta(d)}</span>}
                  </span>
                </button>
              ))}
            </div>
            <button type="button" className="add-act-btn food-add" onClick={onNew}>
              <Icon d={ICONS.plus} size={12} />
              Додати нову страву
            </button>
          </>
        )}
      </div>
    </div>
  );
}
