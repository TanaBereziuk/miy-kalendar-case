// Стікери дня (22.11, від власниці; 23.11 — коти з колажу власниці): наліпки з білою обводкою, без тіні.
// День народження автоматично отримує тортик; будь-який день можна прикрасити — натиснути на шапку дня й обрати стікер.
// Зберігаються в профілі: settings.stickers = { 'рррр-мм-дд': ['cake', 'sun'] } — без SQL.
import { useEffect, useRef } from 'react';

/** Набір (23.11): коти у святкових ковпачках — картинки, які надала власниця (вирізано з її колажу), 160 px */
export const STICKERS: Record<string, { name: string }> = {
  cake: { name: 'кіт із тортом' },
  kitten: { name: 'кошеня з кексом' },
  lick: { name: 'кіт облизується' },
  grumpy: { name: 'серйозний кіт' },
  cool: { name: 'кіт в окулярах' },
  scream: { name: 'кіт кричить' },
  smug: { name: 'задоволений кіт' },
  cupcake: { name: 'кекс-кіт' },
  hat: { name: 'ковпачок-кіт' },
};
export const STICKER_IDS = Object.keys(STICKERS);

const tilt = (id: string, i: number) => ((id.charCodeAt(0) + i * 7) % 15) - 7;

export function Sticker({ id, size = 40, i = 0 }: { id: string; size?: number; i?: number }) {
  const st = STICKERS[id];
  if (!st) return null;
  return (
    <span className="sticker" style={{ width: size, height: size, transform: `rotate(${tilt(id, i)}deg)` }} role="img" aria-label={st.name}>
      <img src={`/stickers/${id}.png`} alt="" draggable={false} />
    </span>
  );
}

/** Вибір стікерів для дня: сітка 5 × 2, обрані — з обводкою; «Прибрати всі» — якщо є свої */
export function StickerPicker({ chosen, onToggle, onClear, onClose, title }: {
  chosen: string[];
  onToggle: (id: string) => void;
  onClear: () => void;
  onClose: () => void;
  title: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const down = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && onClose();
    const key = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    const t = window.setTimeout(() => document.addEventListener('mousedown', down), 0);
    window.addEventListener('keydown', key);
    return () => {
      window.clearTimeout(t);
      document.removeEventListener('mousedown', down);
      window.removeEventListener('keydown', key);
    };
  }, [onClose]);
  return (
    <div ref={ref} className="sticker-pop" role="dialog" aria-label={`Стікери: ${title}`}>
      <p className="sticker-pop-title">стікери · {title}</p>
      <div className="sticker-grid">
        {STICKER_IDS.map((id) => (
          <button key={id} type="button" className={'sticker-opt' + (chosen.includes(id) ? ' on' : '')} aria-pressed={chosen.includes(id)} title={STICKERS[id].name} onClick={() => onToggle(id)}>
            <Sticker id={id} size={44} />
          </button>
        ))}
      </div>
      {chosen.length > 0 && (
        <button type="button" className="text-add sticker-clear" onClick={onClear}>
          Прибрати всі
        </button>
      )}
    </div>
  );
}
