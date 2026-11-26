// Кошик у заголовку вікна (26.11, прохання власниці — у модалці страви «Видалити» переїхало в заголовок іконкою).
// Кругла fill 30 з кошиком 14, як у короткому перегляді. Перше натискання — капсула 30 «Видалити» (підтвердження)
// (danger-text 12/600) на тому самому місці; друге — видаляє. Клік деінде чи Esc — повертає кошик.
import { useEffect, useRef, useState } from 'react';
import { ICONS, Icon } from './Icon';

export function DeleteButton({ onDelete, confirmLabel = 'Видалити', label = 'Видалити' }: { onDelete: () => void; confirmLabel?: string; label?: string }) {
  const [armed, setArmed] = useState(false);
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!armed) return;
    const off = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setArmed(false);
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setArmed(false);
      }
    };
    document.addEventListener('mousedown', off);
    window.addEventListener('keydown', key, true);
    return () => {
      document.removeEventListener('mousedown', off);
      window.removeEventListener('keydown', key, true);
    };
  }, [armed]);
  return (
    <button
      ref={ref}
      type="button"
      className={'round-btn head-delete' + (armed ? ' armed' : '')}
      aria-label={armed ? confirmLabel : label}
      title={armed ? undefined : label}
      onClick={() => (armed ? onDelete() : setArmed(true))}
    >
      <Icon d={ICONS.trash} size={14} />
      {armed && <span>{confirmLabel}</span>}
    </button>
  );
}
