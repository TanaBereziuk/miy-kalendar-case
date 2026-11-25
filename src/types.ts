export type ModuleId = 'food' | 'fop' | 'hobby' | 'pet' | 'other';

export interface ModuleInfo {
  id: ModuleId;
  name: string;
  /** фон події */
  color: string;
  /** текст на фоні події */
  text: string;
  /** насиченіша крапка/смужка */
  dot: string;
  /** іконка модуля: суцільна заливка, прямі краї (evenodd) */
  icon: string;
}

// Кольори й іконки — з прототипу «UI · Тиждень — стиль Apple»
export const MODULES: Record<ModuleId, ModuleInfo> = {
  food: {
    id: 'food',
    name: 'Харчування',
    color: '#A3C6A0',
    text: '#1D1D1F',
    dot: '#7AA876',
    icon: 'M3 3h2v5h1V3h2v5h1V3h2v8H8v10H6V11H3zM15 3h4v18h-3v-7h-1z',
  },
  fop: {
    id: 'fop',
    name: 'Звітність ФОП',
    color: '#E99A7D',
    text: '#1D1D1F',
    dot: '#D47E5E',
    icon: 'M5 2h10l5 5v15H5zM8 11h9v2H8zM8 15h9v2H8z',
  },
  hobby: {
    id: 'hobby',
    name: 'Хобі та спорт',
    color: '#B5A5DD',
    text: '#1D1D1F',
    dot: '#8E7CC4',
    icon: 'M1 9h2V7h4v10H3v-2H1zM23 9h-2V7h-4v10h4v-2h2zM7 11h10v2H7z',
  },
  pet: {
    id: 'pet',
    name: 'Улюбленець',
    color: '#95BFB9',
    text: '#1D1D1F',
    dot: '#6A9F98',
    icon: 'M2 10h4v4H2zM7 5h4v4H7zM13 5h4v4h-4zM18 10h4v4h-4zM12 12l7 5v4H5v-4z',
  },
  other: {
    id: 'other',
    name: 'Без модуля',
    color: '#1D1D1F',
    text: '#FFFFFF',
    dot: '#1D1D1F',
    icon: 'M12 2l3 7h7l-5.5 4.5 2 7.5-6.5-4.5L5.5 21l2-7.5L2 9h7z',
  },
};

export const MODULE_ORDER: ModuleId[] = ['food', 'fop', 'hobby', 'pet', 'other'];

/** Повторення події. days — дні тижня для weekly (0 = понеділок). */
export interface Repeat {
  freq: 'daily' | 'weekly' | 'monthly' | 'yearly';
  interval?: number;
  days?: number[];
  until?: string;
  /** дати ('YYYY-MM-DD'), на які повтор пропущено: змінено чи прибрано лише цю подію (18.11) */
  skip?: string[];
}

/** Одна справа в календарі. Дати — 'YYYY-MM-DD', час — 'HH:MM'. */
export interface CalendarItem {
  id: string;
  title: string;
  module: ModuleId;
  /** дата першого (або єдиного) разу */
  date: string;
  allDay: boolean;
  start?: string;
  end?: string;
  note?: string;
  repeat?: Repeat;
  /** звідки подія: 'onb:…' — створена онбордингом, порожньо — вручну */
  source?: string;
  /** справа без дати (етап 1, 18.11): лежить у «цього тижня», доки її не поставлять у календар; date — день, коли її додали */
  undated?: boolean;
  /** для повторюваної події: id серії, з якої зроблено цей показ */
  seriesId?: string;
  createdAt: string;
  updatedAt: string;
}

export type NewItem = Omit<CalendarItem, 'id' | 'createdAt' | 'updatedAt' | 'seriesId'>;

/** Задача (етап 1, 18.11): окремий список; необовʼязковий день; можна підвʼязати до події. */
export interface Task {
  id: string;
  title: string;
  /** день без часу ('YYYY-MM-DD') */
  due?: string;
  /** подія, до якої підвʼязано (для повторюваної — id серії) */
  itemId?: string;
  /** для повторюваної події — дата показу */
  itemDate?: string;
  /** коли позначено «зроблено» (ISO); виконана видно до кінця дня */
  doneAt?: string;
  createdAt: string;
  updatedAt: string;
}

export type NewTask = Omit<Task, 'id' | 'createdAt' | 'updatedAt'>;
