import { useEffect, useMemo, useRef, useState } from 'react';
import { MOD_KEYS, type Answers, type ModKey } from './answers';
import { generateItems } from './generate';
import { FoodStep, FopStep, GoogleStep, HobbyStep, ModulesStep, NotifyStep, PetStep, SummaryStep, type StepNavProps } from './steps';

type StepId = 'modules' | ModKey | 'notify' | 'summary' | 'google';

// Підпис основної кнопки — «Налаштувати» + назва наступного розділу
const NEXT_LABEL: Partial<Record<StepId, string>> = {
  food: 'Налаштувати харчування',
  fop: 'Налаштувати ФОП',
  hobby: 'Налаштувати хобі',
  pet: 'Налаштувати улюбленця',
  notify: 'Налаштувати нагадування',
  summary: 'Переглянути підсумок',
};

interface Props {
  initial: Answers;
  /** Зберегти чернетку (без генерації подій) */
  onDraft: (a: Answers) => void;
  /** Завершити: зберегти й заповнити календар */
  onFinish: (a: Answers) => Promise<boolean>;
  /** Закрити без змін (лише при повторному налаштуванні) */
  onClose?: () => void;
}

export function Onboarding({ initial, onDraft, onFinish, onClose }: Props) {
  const [a, setA] = useState<Answers>(initial);
  const [step, setStep] = useState<StepId>('modules');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const top = useRef<HTMLDivElement>(null);

  const modSteps = MOD_KEYS.filter((k) => a.modules[k]);
  // 14.11, 21:53: крок «нагадування» (push і дайджест) поки прибрано з онбордингу; код NotifyStep лишається
  const seq: StepId[] = ['modules', ...modSteps, 'summary', 'google'];
  const idx = Math.max(0, seq.indexOf(step));

  // Чернетка зберігається, щоб не загубити відповіді при перезавантаженні
  const draftTimer = useRef<number>();
  useEffect(() => {
    window.clearTimeout(draftTimer.current);
    draftTimer.current = window.setTimeout(() => onDraft(a), 800);
    return () => window.clearTimeout(draftTimer.current);
  }, [a, onDraft]);

  useEffect(() => {
    top.current?.scrollIntoView({ block: 'start' });
    window.scrollTo({ top: 0 });
  }, [step]);

  const go = (d: number) => setStep(seq[Math.max(0, Math.min(seq.length - 1, idx + d))]);
  const set = <K extends keyof Answers>(k: K, v: Answers[K]) => setA((prev) => ({ ...prev, [k]: v }));
  const markSkipped = (k: ModKey, v: boolean) => setA((prev) => ({ ...prev, skipped: { ...prev.skipped, [k]: v } }));

  const nav = (k: ModKey): StepNavProps => ({
    steps: modSteps,
    onBack: () => go(-1),
    onNext: () => {
      markSkipped(k, false);
      go(1);
    },
    onSkip: () => {
      markSkipped(k, true);
      go(1);
    },
    nextLabel: NEXT_LABEL[seq[idx + 1]] ?? 'Далі',
  });

  const eventCount = useMemo(() => (step === 'summary' ? generateItems(a).length : 0), [a, step]);

  const finish = async () => {
    setBusy(true);
    setError('');
    const ok = await onFinish(a);
    if (!ok) {
      setBusy(false);
      setError('Не вдалося зберегти налаштування. Перевірте інтернет і спробуйте ще раз.');
    }
  };

  return (
    <div className="onb" ref={top}>
      <header className="onb-top">
        <span className="head-font onb-brand">мій календар</span>
        {onClose && (
          <button type="button" className="btn tinted small" onClick={onClose}>
            Закрити
          </button>
        )}
      </header>
      <main className="onb-card">
        {step === 'modules' && (
          <ModulesStep
            value={a.modules}
            onChange={(v) => set('modules', v)}
            onNext={() => go(1)}
            nextLabel={NEXT_LABEL[seq[1]] ?? 'Далі'}
          />
        )}
        {step === 'food' && <FoodStep value={a.food} onChange={(v) => set('food', v)} nav={nav('food')} />}
        {step === 'fop' && <FopStep value={a.fop} onChange={(v) => set('fop', v)} nav={nav('fop')} />}
        {step === 'hobby' && <HobbyStep value={a.hobby} onChange={(v) => set('hobby', v)} nav={nav('hobby')} />}
        {step === 'pet' && <PetStep value={a.pet} onChange={(v) => set('pet', v)} nav={nav('pet')} />}
        {step === 'notify' && <NotifyStep value={a.notify} onChange={(v) => set('notify', v)} onBack={() => go(-1)} onNext={() => go(1)} />}
        {step === 'summary' && (
          <SummaryStep answers={a} eventCount={eventCount} onEdit={(k) => setStep(k)} onBack={() => go(-1)} onNext={() => go(1)} />
        )}
        {step === 'google' && (
          <>
            <GoogleStep onBack={() => go(-1)} onFinish={finish} onWant={() => set('google', { wanted: true })} busy={busy} />
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
          </>
        )}
      </main>
    </div>
  );
}
