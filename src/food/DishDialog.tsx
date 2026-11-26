// Картка страви (модуль «харчування»): на ноутбуці — всередині панелі «страви» (DishPanelForm), на телефоні — вікно знизу
// (DishDialog). Поля — у DishForm.tsx. 26.11 (правки власниці): збережена страва відкривається як **перегляд** — без
// «Скасувати» і «Зберегти»; у заголовку олівець («Змінити») і кошик; олівець перемикає в редагування, де й зʼявляються
// «Скасувати» (повертає перегляд, зміни відкидаються) і «Зберегти». Нова страва — одразу редагування.
import { useEffect, useState } from 'react';
import { DeleteButton } from '../components/DeleteButton';
import { ICONS, Icon } from '../components/Icon';
import type { Dish, NewDish } from './dishes';
import { DishFormFields, PENCIL, useDishForm } from './DishForm';
import { isTidy, markTidy, tidyIngredients } from './tidy';

interface Props {
  dish?: Dish;
  onTidy?: (id: string, ingredients: string) => void;
  onClose: () => void;
  onSave: (d: NewDish, id?: string) => void;
  onDelete?: (id: string) => void;
}

/** Олівець 30 у заголовку — перемкнути картку в редагування */
export function EditButton({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" className="round-btn head-edit" aria-label="Змінити" title="Змінити" onClick={onClick}>
      <Icon d={PENCIL} size={14} />
    </button>
  );
}

/** Поля картки й кнопки редагування; key ззовні (id + режим) скидає поля, коли виходимо з редагування */
function DishBody({ dish, editing, onCancel, onSave, onTidy, className }: { dish?: Dish; editing: boolean; onCancel: () => void; onSave: (d: NewDish, id?: string) => void; onTidy?: (id: string, ingredients: string) => void; className: string }) {
  const f = useDishForm(dish);
  // 26.11 (вечір): у перегляді інгредієнти впорядковує ШІ — називний відмінок, без дублів; результат тихо зберігається
  // в страві (onTidy), уже впорядковане не надсилається вдруге (tidy.ts)
  const cur = f.ingredients;
  useEffect(() => {
    if (editing || !dish || !cur.length || isTidy(cur)) return;
    let alive = true;
    void tidyIngredients(cur, f.name).then((res) => {
      if (!res) return;
      markTidy(cur, res);
      if (res.join('\n') === cur.join('\n')) return;
      if (alive) f.setIngredientList(res);
      onTidy?.(dish.id, res.join('\n'));
    });
    return () => {
      alive = false;
    };
    // лише при відкритті перегляду
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing, dish?.id]);
  return (
    <form
      className={className + (editing ? '' : ' dish-viewing')}
      onSubmit={(e) => {
        e.preventDefault();
        if (!editing) return;
        const d = f.build();
        if (d) onSave(d, dish?.id);
      }}
    >
      <DishFormFields f={f} view={!editing} />
      {editing && (
        <div className="actions">
          <span className="spacer" />
          <button type="button" className="btn secondary" onClick={onCancel}>
            Скасувати
          </button>
          <button type="submit" className="btn primary" disabled={f.busy}>
            Зберегти
          </button>
        </div>
      )}
    </form>
  );
}

export function DishDialog({ dish, onClose, onSave, onDelete, onTidy }: Props) {
  const [editing, setEditing] = useState(!dish);
  const cancel = () => (dish ? setEditing(false) : onClose());

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && (editing && dish ? setEditing(false) : onClose());
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, editing, dish]);

  return (
    <div className="overlay dish-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="dialog dish-dialog" role="dialog" aria-labelledby="dish-title">
        <div className="dialog-head">
          <h2 id="dish-title" className="head-font">
            {dish ? 'страва' : 'нова страва'}
          </h2>
          {/* 26.11: олівець (лише в перегляді) і кошик — у заголовку, поруч із «×» */}
          <div className="food-head-actions">
            {dish && !editing && <EditButton onClick={() => setEditing(true)} />}
            {dish && onDelete && <DeleteButton onDelete={() => onDelete(dish.id)} />}
            <button type="button" className="round-btn" aria-label="Закрити" onClick={onClose}>
              <Icon d={ICONS.close} size={12} />
            </button>
          </div>
        </div>
        <DishBody
          key={(dish?.id ?? 'new') + (editing ? ':edit' : ':view')}
          dish={dish}
          editing={editing}
          onCancel={cancel}
          onSave={(d, id) => {
            onSave(d, id);
            if (id) setEditing(false);
          }}
          onTidy={onTidy}
          className="dish-body"
        />
      </div>
    </div>
  );
}

/** Картка страви всередині бічної панелі «страви»: угорі «назад» і заголовок (в AssistantPanel); олівець і кошик App
 *  кладе в заголовок панелі (foodHead), стан «редагування» — теж в App (`editing`, `setEditing`) */
export function DishPanelForm({ dish, onBack, onSave, onTidy, editing, setEditing }: { dish?: Dish; onBack: () => void; onSave: (d: NewDish, id?: string) => void; onTidy?: (id: string, ingredients: string) => void; editing: boolean; setEditing: (v: boolean) => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && (editing && dish ? setEditing(false) : onBack());
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onBack, editing, dish, setEditing]);
  return (
    <DishBody
      key={(dish?.id ?? 'new') + (editing ? ':edit' : ':view')}
      dish={dish}
      editing={editing}
      onCancel={() => (dish ? setEditing(false) : onBack())}
      onSave={onSave}
      onTidy={onTidy}
      className="dish-panel-form"
    />
  );
}
