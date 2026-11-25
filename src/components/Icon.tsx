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
  // етап 1 (18.11): задачі й підвʼязка до події
  /** квадрат з галочкою — задачі */
  tasks: 'M3 3h18v18H3zM6 6v12h12V6zM7.5 11.5 9.5 9.5l2 2 4-4 2 2-6 6z',
  /** галочка */
  check: 'M3 12.5 5.5 10l4 4 9-9L21 7.5 9.5 19z',
  /** ланка — підвʼязати до події */
  link: 'M1 7h10v3.5H4.5v3H11V17H1zM13 7h10v10H13v-3.5h6.5v-3H13zM7 10.5h10v3H7z',
  /** «…» — ще дії */
  // 25.11: історія — квадратний годинник (рамка і стрілки прямими кутами)
  history: 'M3 3h18v18H3zM6 6v12h12V6zM10.5 7.5h3v4h3v3h-6z',
  dots: 'M3 10h4v4H3zM10 10h4v4h-4zM17 10h4v4h-4z',
  /** квадрат із «+» — зробити подією */
  makeEvent: 'M3 3h18v18H3zM6 6v12h12V6zM10.5 8h3v2.5H16v3h-2.5V16h-3v-2.5H8v-3h2.5z',
  /** календар з днем — змінити день */
  day: 'M3 5h18v16H3zM6 10v8h12v-8zM7 2h3v4H7zM14 2h3v4h-3zM8 12h4v4H8z',
  trash: 'M9 2h6v2h6v3H3V4h6zM5 9h14v13H5zM9 12v7h2v-7zM13 12v7h2v-7z',
  /** наліпка з загнутим кутом — стікер у клітинці (23.11) */
  sticker: 'M3 3h18v10h-8v8H3zM15 15h6l-6 6z',
  /** подарунок — тип «вітання» (23.11) */
  gift: 'M3 8h18v4H3zM5 13h14v8H5zM10.5 8h3v13h-3zM6 3h5v4H6zM13 3h5v4h-5z',
};

export function Icon({ d, size = 14, className }: { d: string; size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" fillRule="evenodd" aria-hidden="true" className={className}>
      <path d={d} />
    </svg>
  );
}
