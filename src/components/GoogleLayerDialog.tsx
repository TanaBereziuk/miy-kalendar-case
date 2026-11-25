// Налаштування шару Google Календаря (18.11): секретна адреса у форматі iCal і перемикач «показувати».
// Відкривається з меню акаунта («Google Календар») і з останнього кроку онбордингу.
import { useEffect, useState } from 'react';
import { validIcalUrl } from '../lib/google';
import { Switch } from '../onboarding/ui';
import { ICONS, Icon } from './Icon';

/** Короткі кроки, де взяти адресу (спільні з онбордингом) */
export function IcalSteps() {
  return (
    <ol className="ical-steps">
      <li>
        Відкрийте Google Календар на компʼютері, праворуч угорі — <b>Налаштування</b>.
      </li>
      <li>
        Ліворуч у розділі <b>Налаштування моїх календарів</b> оберіть свій календар.
      </li>
      <li>
        У блоці <b>Інтеграція календаря</b> скопіюйте <b>Секретна адреса у форматі iCal</b> і вставте нижче.
      </li>
    </ol>
  );
}

interface Props {
  url?: string;
  show: boolean;
  phone: boolean;
  onSave: (url: string | undefined, show: boolean) => void;
  onClose: () => void;
}

export function GoogleLayerDialog({ url, show, phone, onSave, onClose }: Props) {
  const [value, setValue] = useState(url ?? '');
  const [on, setOn] = useState(url ? show : true);
  const [error, setError] = useState('');

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const save = (e: React.FormEvent) => {
    e.preventDefault();
    const v = value.trim();
    if (!v) return onSave(undefined, false);
    if (!validIcalUrl(v)) return setError('Це не схоже на секретну адресу iCal: вона починається з https://calendar.google.com/calendar/ical/ і закінчується на .ics');
    onSave(v.replace(/^webcal:/i, 'https:'), on);
  };

  return (
    <div className={'event-view-overlay' + (phone ? ' phone' : '')} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form className="event-view google-dialog" role="dialog" aria-labelledby="g-title" onSubmit={save}>
        <div className="quick-head">
          <div className="event-view-text">
            <h2 id="g-title">Google Календар</h2>
            <p>робочі події пунктиром поверх ваших справ, лише перегляд</p>
          </div>
          <button type="button" className="round-btn" aria-label="Закрити" onClick={onClose}>
            <Icon d={ICONS.close} size={12} />
          </button>
        </div>
        <IcalSteps />
        <label className="field">
          <span>секретна адреса у форматі iCal</span>
          <input
            type="url"
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              setError('');
            }}
            placeholder="https://calendar.google.com/calendar/ical/…/basic.ics"
            autoComplete="off"
            spellCheck={false}
          />
        </label>
        <p className="hint small">Адреса дає змогу лише читати календар. Її бачите тільки ви; у Google її можна будь-коли скинути.</p>
        {value.trim() && (
          <div className="google-switch">
            <span>показувати в календарі</span>
            <Switch on={on} onChange={setOn} label="Показувати Google Календар" />
          </div>
        )}
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <div className="actions">
          {url && (
            <button type="button" className="text-danger" onClick={() => onSave(undefined, false)}>
              Відʼєднати
            </button>
          )}
          <span className="spacer" />
          <button type="button" className="btn secondary" onClick={onClose}>
            Скасувати
          </button>
          <button type="submit" className="btn primary">
            Зберегти
          </button>
        </div>
      </form>
    </div>
  );
}
