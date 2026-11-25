// Поля швидкого вікна в стилі Notion (23.11): значення виглядають як текст 14/500, наведення — тло rgba(118,118,128,.08),
// редагування — біле з обводкою 1 ink. Спільні для всіх типів: інша подія, вітання, задача, страва, заняття, улюбленець, ФОП.
import { fromMinutes } from '../lib/dates';
import { dayLabel } from './QuickAdd';

/** Підпис і значення в сітці «підпис — значення» (128 + решта) */
export function QfRow({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <>
      <span className="qf-k">{k}</span>
      <span className="qf-v">{children}</span>
    </>
  );
}

/**
 * День: виглядає як текст «сб, 21 листопада»; під ним — прозоре поле дати на весь розмір,
 * тож натискання відкриває системний календар (на ноутбуці — через showPicker).
 */
export function DateProp({ value, onChange, placeholder = 'оберіть день', label }: { value: string; onChange: (v: string) => void; placeholder?: string; label: string }) {
  return (
    <span className={'qf-prop qf-date' + (value ? '' : ' empty')}>
      {value ? dayLabel(value) : placeholder}
      <input
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onClick={(e) => {
          try {
            (e.currentTarget as HTMLInputElement & { showPicker?: () => void }).showPicker?.();
          } catch {
            /* без showPicker — звичайне поле дати */
          }
        }}
        aria-label={label}
      />
    </span>
  );
}

/** Час: випадний список через 15 хв, виглядає як текст «09:00»; завжди 24 години */
const TIMES = Array.from({ length: 96 }, (_, i) => fromMinutes(i * 15));
export function TimeSelect({ value, onChange, label, empty }: { value: string; onChange: (v: string) => void; label: string; empty?: string }) {
  const list = value && !TIMES.includes(value) ? [...TIMES, value].sort() : TIMES;
  return (
    <select className={'qf-prop qf-select qf-time' + (!value ? ' empty' : '')} value={value} onChange={(e) => onChange(e.target.value)} aria-label={label}>
      {empty !== undefined && <option value="">{empty}</option>}
      {list.map((t) => (
        <option key={t} value={t}>
          {t}
        </option>
      ))}
    </select>
  );
}

/** Вибір зі списку, що виглядає як текст; muted — коли обрано значення «за замовчуванням» */
export function PropSelect<T extends string | number>({
  value,
  onChange,
  options,
  label,
  muted,
}: {
  value: T;
  onChange: (v: T) => void;
  options: [T, string][];
  label: string;
  muted?: boolean;
}) {
  return (
    <select
      className={'qf-prop qf-select' + (muted ? ' empty' : '')}
      value={String(value)}
      onChange={(e) => {
        const hit = options.find(([v]) => String(v) === e.target.value);
        if (hit) onChange(hit[0]);
      }}
      aria-label={label}
    >
      {options.map(([v, l]) => (
        <option key={String(v)} value={String(v)}>
          {l}
        </option>
      ))}
    </select>
  );
}

/** Текстове значення без рамки (порожнє — сіра підказка) */
export function PropInput({ value, onChange, placeholder, label, width, inputMode, noEnter }: { value: string; onChange: (v: string) => void; placeholder: string; label: string; width?: number; inputMode?: 'numeric' | 'url'; /** Enter не надсилає форму (посилання на рецепт) */ noEnter?: boolean }) {
  return (
    <input
      onKeyDown={noEnter ? (e) => e.key === 'Enter' && e.preventDefault() : undefined}
      className="qf-prop qf-input"
      style={width ? { width } : undefined}
      value={value}
      inputMode={inputMode}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      aria-label={label}
      autoComplete="off"
    />
  );
}

/** Дні тижня — кружки 28 (12/600), обрані — ink */
const DOW = ['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'нд'];
export function DaysProp({ value, onChange, single }: { value: number[]; onChange: (v: number[]) => void; single?: boolean }) {
  return (
    <span className="qf-days" role="group" aria-label="Дні тижня">
      {DOW.map((d, i) => (
        <button
          type="button"
          key={d}
          aria-pressed={!!value[i]}
          className={'qf-day' + (value[i] ? ' on' : '')}
          onClick={() => onChange(single ? value.map((_, j) => (j === i ? 1 : 0)) : value.map((x, j) => (j === i ? (x ? 0 : 1) : x)))}
        >
          {d}
        </button>
      ))}
    </span>
  );
}
