// Демоверсія: без входу. Робочий застосунок входить через Google (Supabase Auth)
// і перевіряє адресу за списком дозволених, перш ніж показати календар.
import { demoSession, resetDemo } from './supabase';

export type AuthState = { status: 'ready'; session: typeof demoSession };

export function useAuth(): AuthState {
  return { status: 'ready', session: demoSession };
}

/** У демо «вийти» = почати заново: перезавантаження прибирає всі зміни з памʼяті. */
export function signOut() {
  resetDemo();
  window.location.reload();
}
