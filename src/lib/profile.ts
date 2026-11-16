import { useCallback, useEffect, useState } from 'react';
import { supabase } from './supabase';
import { withDefaults, type Answers } from '../onboarding/answers';

/** Профіль користувача: відповіді онбордингу й налаштування (таблиця public.profiles). */
export type ProfileState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; answers: Answers; onboarded: boolean };

export function useProfile(userId: string) {
  const [state, setState] = useState<ProfileState>({ status: 'loading' });

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from('profiles')
      .select('settings, onboarded_at')
      .eq('user_id', userId)
      .maybeSingle();
    if (error) {
      setState({ status: 'error' });
      return;
    }
    setState({
      status: 'ready',
      answers: withDefaults(data?.settings as Partial<Answers> | undefined),
      onboarded: !!data?.onboarded_at,
    });
  }, [userId]);

  useEffect(() => {
    load();
  }, [load]);

  /** Зберігає відповіді; finished = позначити онбординг пройденим. */
  const save = useCallback(
    async (answers: Answers, finished: boolean) => {
      const row: Record<string, unknown> = { user_id: userId, settings: answers };
      if (finished) row.onboarded_at = new Date().toISOString();
      const { error } = await supabase.from('profiles').upsert(row, { onConflict: 'user_id' });
      if (!error) {
        setState((s) => ({
          status: 'ready',
          answers,
          onboarded: finished || (s.status === 'ready' && s.onboarded),
        }));
      }
      return !error;
    },
    [userId],
  );

  return { state, save, reload: load };
}
