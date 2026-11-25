// Картка страви в бібліотеці (16.11, 17:18; варіант B з артборду): сіра підкладка bg радіус 16, відступ 8;
// фото 72 радіус 12 (без фото — плитка кольору харчування з іконкою 24); назва 14/600 до двох рядків,
// у улюблених — зірочка ліворуч; під назвою продукти (або опис) 12 muted до двох рядків. Часу й категорії немає.
import type { DragEvent } from 'react';
import { MODULES } from '../types';
import { Icon } from '../components/Icon';
import { dishSubtitle, type Dish } from './dishes';

interface Props {
  dish: Dish;
  onClick: () => void;
  draggable?: boolean;
  onDragStart?: (e: DragEvent<HTMLButtonElement>) => void;
  title?: string;
}

export function DishRow({ dish: d, onClick, draggable, onDragStart, title }: Props) {
  const m = MODULES.food;
  const sub = dishSubtitle(d);
  return (
    <button type="button" className="food-row card" draggable={draggable} onDragStart={onDragStart} onClick={onClick} title={title}>
      {d.photoUrl ? (
        <img className="food-thumb" src={d.photoUrl} alt="" loading="lazy" />
      ) : (
        <span className="food-thumb" style={{ background: m.color, color: m.text }}>
          <Icon d={m.icon} size={24} />
        </span>
      )}
      <span className="food-text">
        <span className="food-name">
          {d.fav && (
            <span className="food-fav" role="img" aria-label="улюблена">
              <Icon d={MODULES.other.icon} size={10} />
            </span>
          )}
          <span className="food-name-t">{d.name}</span>
        </span>
        {sub && <span className="food-sub">{sub}</span>}
      </span>
    </button>
  );
}
