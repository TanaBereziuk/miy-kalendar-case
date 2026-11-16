// Demo build: no sign-in. The production app signs in with Google (Supabase Auth)
// and checks the visitor against an allow-list before showing the calendar.
import { demoSession, resetDemo } from './supabase';

export type AuthState = { status: 'ready'; session: typeof demoSession };

export function useAuth(): AuthState {
  return { status: 'ready', session: demoSession };
}

/** In the demo, "sign out" resets the sandbox to the sample week. */
export function signOut() {
  resetDemo();
  window.location.reload();
}
