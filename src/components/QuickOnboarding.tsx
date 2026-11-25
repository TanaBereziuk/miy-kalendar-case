// Швидке вікно (23.11, правка власниці): форма модуля відкривається, якщо його крок онбордингу вже пройдено.
// Якщо крок пропускали — спершу ті самі питання онбордингу для цього модуля (картка 520 поруч із клітинкою,
// на телефоні — знизу). «Далі» зберігає відповіді й ставить події модуля в календар, потім — звичайна форма;
// «Пропустити» — одразу форма; «Назад» — до переліку «що створити».
import { useEffect, useState } from 'react';
import type { Anchor } from './EventView';
import type { Answers, ModKey } from '../onboarding/answers';
import { FoodStep, FopStep, HobbyStep, PetStep, type StepNavProps } from '../onboarding/steps';
import { ICONS, Icon } from './Icon';
import { usePopoverPos } from './QuickAdd';

const WIDTH = 520;

interface Props {
  module: ModKey;
  answers: Answers;
  anchor?: Anchor;
  phone: boolean;
  onBack: () => void;
  onSkip: () => void;
  onDone: (a: Answers) => void;
  onClose: () => void;
}

export function QuickOnboarding({ module, answers, anchor, phone, onBack, onSkip, onDone, onClose }: Props) {
  const [a, setA] = useState<Answers>(answers);
  const [el, setEl] = useState<HTMLDivElement | null>(null);
  const style = usePopoverPos({ current: el }, anchor, phone, WIDTH, [el]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const nav: StepNavProps = {
    steps: [module],
    onBack,
    onSkip,
    onNext: () => onDone({ ...a, modules: { ...a.modules, [module]: true }, skipped: { ...a.skipped, [module]: false } }),
    nextLabel: 'Далі',
  };
  const set = <K extends keyof Answers>(k: K, v: Answers[K]) => setA((p) => ({ ...p, [k]: v }));

  return (
    <div className={'event-view-overlay quick-overlay' + (phone ? ' phone' : '')} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={setEl} className="event-view quick-onb" style={style} role="dialog" aria-label="Налаштування модуля">
        <button type="button" className="round-btn quick-onb-close" aria-label="Закрити" onClick={onClose}>
          <Icon d={ICONS.close} size={12} />
        </button>
        {module === 'food' && <FoodStep value={a.food} onChange={(v) => set('food', v)} nav={nav} />}
        {module === 'fop' && <FopStep value={a.fop} onChange={(v) => set('fop', v)} nav={nav} />}
        {module === 'hobby' && <HobbyStep value={a.hobby} onChange={(v) => set('hobby', v)} nav={nav} />}
        {module === 'pet' && <PetStep value={a.pet} onChange={(v) => set('pet', v)} nav={nav} />}
      </div>
    </div>
  );
}
