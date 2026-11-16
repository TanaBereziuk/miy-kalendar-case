import type { ReactNode } from 'react';
import { Icon } from '../components/Icon';

export const OI = {
  back: 'M15.5 3.5 7 12l8.5 8.5 2.5-2.5-6-6 6-6z',
  plus: 'M10 4h4v6h6v4h-6v6h-4v-6H4v-4h6z',
  minus: 'M4 10h16v4H4z',
  x: 'M5.6 3.8 12 10.2l6.4-6.4 1.8 1.8L13.8 12l6.4 6.4-1.8 1.8L12 13.8l-6.4 6.4-1.8-1.8L10.2 12 3.8 5.6z',
  chevronDown: 'M3.5 8.5 6 6l6 6 6-6 2.5 2.5L12 17z',
  warn: 'M3 3h18v18H3zM11 7h2v6h-2zM11 15h2v2h-2z',
  check: 'M3 12.5 5.5 10l4 4 9-9L21 7.5 9.5 19z',
  bell: 'M10 2h4v2.5l4 3V15l3 3v2H3v-2l3-3V7.5l4-3zM9 21h6v2H9z',
  cal: 'M7 2h3v3h4V2h3v3h4v16H3V5h4zM5 11v8h14v-8z',
  arrow: 'M3 10h11V5l8 7-8 7v-5H3z',
  edit: 'M14.5 3 21 9.5 9.5 21H3v-6.5zM5 15.3V19h3.7z',
};

// Кольори модулів в онбордингу (як у прототипі — трохи насиченіші за сітку)
export const ONB_MOD = {
  food: { bg: '#8DC88A', name: 'Харчування', icon: 'M3 3h2v5h1V3h2v5h1V3h2v8H8v10H6V11H3zM15 3h4v18h-3v-7h-1z' },
  fop: { bg: '#FF7A4D', name: 'Звітність ФОП', icon: 'M5 2h10l5 5v15H5zM8 11h9v2H8zM8 15h9v2H8z' },
  hobby: { bg: '#A98BEB', name: 'Хобі та спорт', icon: 'M1 9h2V7h4v10H3v-2H1zM23 9h-2V7h-4v10h4v-2h2zM7 11h10v2H7z' },
  pet: { bg: '#7DBDB5', name: 'Улюбленець', icon: 'M2 10h4v4H2zM7 5h4v4H7zM13 5h4v4h-4zM18 10h4v4h-4zM12 12l7 5v4H5v-4z' },
};

export function Switch({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} className={'ios-switch' + (on ? ' on' : '')} onClick={() => onChange(!on)}>
      <span />
    </button>
  );
}

export function Segmented<T extends string | number>({
  value,
  options,
  onChange,
  label,
  fill,
  dark,
}: {
  value: T;
  options: { v: T; l: ReactNode }[];
  onChange: (v: T) => void;
  label: string;
  fill?: boolean;
  /** обраний сегмент — чорний (ink) з білим текстом */
  dark?: boolean;
}) {
  return (
    <div role="group" aria-label={label} className={'seg' + (fill ? ' fill' : '') + (dark ? ' dark' : '')}>
      {options.map((o) => (
        <button type="button" key={String(o.v)} aria-pressed={o.v === value} className={o.v === value ? 'on' : ''} onClick={() => onChange(o.v)}>
          {o.l}
        </button>
      ))}
    </div>
  );
}

export function ModTile({ k, size = 44 }: { k: keyof typeof ONB_MOD; size?: number }) {
  return (
    <span className="mod-tile" style={{ width: size, height: size, borderRadius: Math.round(size * 0.27), background: ONB_MOD[k].bg }}>
      <Icon d={ONB_MOD[k].icon} size={Math.round(size * 0.55)} />
    </span>
  );
}

const STEP_NAMES = { food: 'харчування', fop: 'ФОП', hobby: 'хобі', pet: 'улюбленець' };

export function ModStepper({ steps, current }: { steps: (keyof typeof STEP_NAMES)[]; current: keyof typeof STEP_NAMES }) {
  const idx = Math.max(0, steps.indexOf(current));
  return (
    <nav aria-label="налаштування модулів" className="mod-stepper">
      <div className="mod-stepper-top">
        <span>налаштування модулів</span>
        <span className="num">
          крок {idx + 1} з {steps.length}
        </span>
      </div>
      <div className="mod-stepper-bars">
        {steps.map((k, i) => (
          <div key={k} aria-current={i === idx ? 'step' : undefined} className={'bar-item' + (i === idx ? ' cur' : '')}>
            <span className={'bar' + (i <= idx ? ' done' : '')} />
            <span className="bar-label">{STEP_NAMES[k]}</span>
          </div>
        ))}
      </div>
    </nav>
  );
}

export function StepHead({ mod, title, sub }: { mod?: keyof typeof ONB_MOD; title: string; sub?: ReactNode }) {
  return (
    <div className="step-head">
      <div className="step-title-row">
        {mod && <ModTile k={mod} size={30} />}
        <h1>{title}</h1>
      </div>
      {sub && <p className="step-sub">{sub}</p>}
    </div>
  );
}

export function StepNav({
  onBack,
  onSkip,
  skipLabel = 'Пропустити',
  onNext,
  nextLabel,
  nextIcon,
  busy,
  nextDisabled,
}: {
  onBack?: () => void;
  onSkip?: () => void;
  skipLabel?: string;
  onNext: () => void;
  nextLabel: string;
  nextIcon?: string;
  busy?: boolean;
  nextDisabled?: boolean;
}) {
  return (
    <div className="step-nav">
      {onBack && (
        <button type="button" className="nav-back" onClick={onBack} aria-label="Назад" title="Назад">
          <Icon d={OI.back} size={18} />
        </button>
      )}
      <span className="spacer" />
      {onSkip && (
        <button type="button" className="nav-skip" onClick={onSkip}>
          {skipLabel}
        </button>
      )}
      <button type="button" className={'nav-next' + (nextDisabled ? ' off' : '')} onClick={onNext} disabled={busy || nextDisabled}>
        {/* Ноутбук — повний підпис; телефон — «Далі» (або стан «Створюємо календар…») */}
        <span className="lbl-long">
          {nextIcon && <Icon d={nextIcon} size={18} />}
          {nextLabel}
        </span>
        <span className="lbl-short">{busy ? nextLabel : 'Далі'}</span>
      </button>
    </div>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="o-field">
      <span>{label}</span>
      {children}
    </label>
  );
}
