// Відповіді онбордингу. Зберігаються в profiles.settings (jsonb).

export type ModKey = 'food' | 'fop' | 'hobby' | 'pet';
export const MOD_KEYS: ModKey[] = ['food', 'fop', 'hobby', 'pet'];

export interface FoodAnswers {
  meals: { b: boolean; l: boolean; d: boolean; s: boolean };
  dishes: string[];
}

/** Як людина визначає групу на кроці ФОП (14.11): за тим, як працює, вручну, загальна система або «не знаю». */
export type FopHow = 'company' | 'people' | 'manual' | 'general' | 'unknown';
/** Кому ФОП платить: нікому, іншим ФОП (звітів не додає) або людям за договором (звіти за працівників). */
export type FopPay = 'no' | 'fop' | 'people';

export interface FopAnswers {
  how: FopHow;
  grp: 1 | 2 | 3; // використовується, коли how = 'manual'
  vat: boolean;
  pay: FopPay; // стара відповідь (до 14.11, правка 11), тепер — payTo
  emp: boolean; // = є працівники або виконавці за договором; лишено для старих збережених відповідей
  /** Сплата ЄСВ за себе: сплачую / маю звільнення (без нагадувань про ЄСВ за себе) / не знаю (нагадування лишаються) */
  esv: 'pay' | 'exempt' | 'unknown';
  /** Кому ФОП платить (можна кілька); усі false — «ні, нікому» */
  payTo: { staff: boolean; contract: boolean; fop: boolean };
  lead: 7 | 14 | 21;
  d3: boolean;
  d0: boolean;
}

export interface Activity {
  id: string;
  name: string;
  icon: string;
  mode: 'fixed' | 'n';
  days: number[]; // 7 значень 0/1, 0 = понеділок
  time: string;
  n: number;
  dur: 30 | 45 | 60 | 90;
}

export interface HobbyAnswers {
  acts: Activity[];
}

export interface Med {
  id: string;
  name: string;
  dose: string;
  freq: 'daily' | 'alt' | 'week';
  perDay: 1 | 2 | 3;
  t: string[];
  start: string;
  course: 'always' | 'course';
  days: string;
  /** «раз на тиждень» — бажаний день (0 = пн … 6 = нд); порожньо — день дати початку */
  wday?: number;
}

export interface Proc {
  id: string;
  name: string;
  last: string;
  iv: string; // місяців
}

export interface Vacc {
  last: string;
  iv: 6 | 12 | 36;
}

export interface Pet {
  id: string;
  name: string;
  kind: 'cat' | 'dog' | 'other';
  medOn: boolean;
  meds: Med[];
  vaccOn: boolean;
  vaccs: { complex: Vacc; rabies: Vacc; generic: Vacc };
  vetOn: boolean;
  /** 14.11, 21:51: «запланований» (дата й час, можна повторювати) або «повторюваний» (останній візит + інтервал) */
  vetMode: 'planned' | 'regular';
  vetBook: boolean;
  vetDate: string;
  vetTime: string;
  vetReg: boolean;
  vetLast: string;
  vetIv: 6 | 12;
  procOn: boolean;
  procs: Proc[];
}

export interface PetAnswers {
  pets: Pet[];
}

export interface NotifyAnswers {
  push: boolean;
  digestTime: string;
}

export interface GoogleAnswers {
  wanted: boolean;
}

export interface Answers {
  modules: Record<ModKey, boolean>;
  food: FoodAnswers;
  fop: FopAnswers;
  hobby: HobbyAnswers;
  pet: PetAnswers;
  notify: NotifyAnswers;
  google: GoogleAnswers;
  skipped: Partial<Record<ModKey, boolean>>;
}

let seq = 0;
export const newId = (p: string) => `${p}${Date.now().toString(36)}${(seq++).toString(36)}`;

export const newMed = (): Med => ({
  id: newId('m'),
  name: '',
  dose: '1 таблетка',
  freq: 'daily',
  perDay: 1,
  t: ['08:30'],
  start: '',
  course: 'always',
  days: '',
});

export const newProc = (): Proc => ({ id: newId('p'), name: '', last: '', iv: '3' });

export const newPet = (): Pet => ({
  id: newId('a'),
  name: '',
  kind: 'cat',
  medOn: false, // 14.11: усі розділи вимкнені — людина сама обирає, що додати
  meds: [newMed()],
  vaccOn: false,
  vaccs: { complex: { last: '', iv: 12 }, rabies: { last: '', iv: 12 }, generic: { last: '', iv: 12 } },
  vetOn: false,
  vetMode: 'planned',
  vetBook: false,
  vetDate: '',
  vetTime: '',
  vetReg: false,
  vetLast: '',
  vetIv: 12,
  procOn: false,
  procs: [newProc()],
});

export function defaultAnswers(): Answers {
  return {
    modules: { food: true, fop: true, hobby: true, pet: true },
    food: { meals: { b: true, l: true, d: true, s: true }, dishes: [] },
    fop: { how: 'manual', grp: 3, vat: false, pay: 'no', emp: false, esv: 'pay', payTo: { staff: false, contract: false, fop: false }, lead: 14, d3: true, d0: true },
    hobby: { acts: [] },
    pet: { pets: [newPet()] },
    notify: { push: false, digestTime: '08:00' },
    google: { wanted: false },
    skipped: {},
  };
}

/** Зливає збережені відповіді зі значеннями за замовчуванням (на випадок нових полів). */
export function withDefaults(saved: Partial<Answers> | null | undefined): Answers {
  const d = defaultAnswers();
  if (!saved) return d;
  return {
    modules: { ...d.modules, ...saved.modules },
    food: { ...d.food, ...saved.food, meals: { ...d.food.meals, ...saved.food?.meals } },
    fop: {
      ...d.fop,
      ...saved.fop,
      // старі відповіді (до 14.11) мали лише групу й «є працівники»
      // пункт «не знаю групу» прибрано 14.11 — такі відповіді стають «на компанію»
      how:
        saved.fop?.how && saved.fop.how !== 'unknown'
          ? saved.fop.how
          : saved.fop?.grp === 2 && !saved.fop?.how
            ? 'people'
            : saved.fop?.grp === 1 && !saved.fop?.how
              ? 'manual'
              : 'company',
      pay: saved.fop?.pay ?? (saved.fop?.emp ? 'people' : 'no'),
      esv: saved.fop?.esv ?? 'pay',
      payTo: saved.fop?.payTo ?? {
        staff: saved.fop?.pay === 'people' || (!saved.fop?.pay && !!saved.fop?.emp),
        contract: false,
        fop: saved.fop?.pay === 'fop',
      },
    },
    hobby: { ...d.hobby, ...saved.hobby },
    pet: saved.pet?.pets?.length ? { pets: saved.pet.pets.map((p) => closeEmpty({ ...newPet(), ...p })) } : d.pet,
    notify: { ...d.notify, ...saved.notify },
    google: { ...d.google, ...saved.google },
    skipped: { ...saved.skipped },
  };
}

/** 14.11, 22:15: розділи улюбленця, у яких нічого не заповнено, відкриваються закритими */
function closeEmpty(p: Pet): Pet {
  return {
    ...p,
    medOn: p.medOn && p.meds.some((m) => m.name.trim()),
    vaccOn: p.vaccOn && Object.values(p.vaccs).some((v) => v.last),
    vetOn: p.vetOn && !!(p.vetDate || p.vetLast),
    procOn: p.procOn && p.procs.some((x) => x.name.trim() || x.last),
  };
}
