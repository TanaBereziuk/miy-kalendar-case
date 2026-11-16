// Бруталістичні іконки з прототипу: суцільна заливка, прямі краї
export const ICONS = {
  prev: 'M15.5 3.5 7 12l8.5 8.5 2.5-2.5-6-6 6-6z',
  next: 'M8.5 3.5 17 12l-8.5 8.5-2.5-2.5 6-6-6-6z',
  down: 'M3.5 8.5 12 17l8.5-8.5-2.5-2.5-6 6-6-6z',
  plus: 'M10 3h4v7h7v4h-7v7h-4v-7H3v-4h7z',
  user: 'M8 3h8v8H8zM3 14h18v7H3z',
  /** хмарка повідомлення — асистент */
  chat: 'M3 4h18v13H10l-5 4v-4H3z',
  close: 'M5.5 3 12 9.5 18.5 3 21 5.5 14.5 12 21 18.5 18.5 21 12 14.5 5.5 21 3 18.5 9.5 12 3 5.5z',
};

export function Icon({ d, size = 14, className }: { d: string; size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" fillRule="evenodd" aria-hidden="true" className={className}>
      <path d={d} />
    </svg>
  );
}
