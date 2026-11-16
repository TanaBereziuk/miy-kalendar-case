// Картка страви (модуль «харчування», правка 16.11): на ноутбуці — панель праворуч, притиснута до краю, без затемнення
// (календар лишається доступним); на телефоні — вікно знизу. Поля — у DishForm.tsx (спільні з вкладкою «харчування»
// у вікні нової події): фото, «джерело», «назва», «опис», інгредієнти з опису. Необовʼязкових полів і кроків немає.
import { useEffect, useState } from 'react';
import { ICONS, Icon } from '../components/Icon';
import type { Dish, NewDish } from './dishes';
import { DishFormFields, useDishForm } from './DishForm';

interface Props {
  dish?: Dish;
  onClose: () => void;
  onSave: (d: NewDish, id?: string) => void;
  onDelete?: (id: string) => void;
}

export function DishDialog({ dish, onClose, onSave, onDelete }: Props) {
  const f = useDishForm(dish);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const d = f.build();
    if (d) onSave(d, dish?.id);
  };

  return (
    <div className="overlay dish-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form className="dialog dish-dialog" onSubmit={submit} aria-labelledby="dish-title">
        <div className="dialog-head">
          <h2 id="dish-title" className="head-font">
            {dish ? 'страва' : 'нова страва'}
          </h2>
          <button type="button" className="round-btn" aria-label="Закрити" onClick={onClose}>
            <Icon d={ICONS.close} size={12} />
          </button>
        </div>

        <DishFormFields f={f} />

        <div className="actions">
          {dish &&
            onDelete &&
            (confirmDelete ? (
              <button type="button" className="btn danger" onClick={() => onDelete(dish.id)}>
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
          <button type="submit" className="btn primary" disabled={f.busy}>
            Зберегти
          </button>
        </div>
      </form>
    </div>
  );
}
