import type { FopAnswers } from './answers';
import { addDays, toISO } from '../lib/dates';

/**
 * Дедлайни ФОП на спрощеній системі.
 * Джерела правил: ПКУ ст. 294–296 (строки декларацій і сплати ЄП та ВЗ), закон про ЄСВ ст. 9.
 * - 3 група: декларація за квартал — 40 днів після кварталу, сплата ЄП + ВЗ — ще 10 днів;
 *   річна (за IV квартал) — так само, з Додатком 1 (ЄСВ). ЄСВ за себе — щокварталу до 20 числа.
 * - 1–2 групи: ЄП і ВЗ авансом щомісяця до 20 числа, річна декларація — 60 днів після року.
 * - ПДВ: декларація щомісяця до 20 числа, сплата — 10 днів після строку подання.
 * - Наймані працівники: єдиний квартальний звіт (ПДФО, ВЗ, ЄСВ) — 40 днів після кварталу.
 * Строки подання з вихідних переносяться на наступний робочий день (п. 49.20 ПКУ),
 * строки сплати ставимо на попередній робочий день, щоб не прострочити.
 */

export interface FopDeadline {
  date: string;
  title: string;
}

const isWeekend = (d: Date) => d.getDay() === 0 || d.getDay() === 6;

function nextWorkday(d: Date): Date {
  let r = d;
  while (isWeekend(r)) r = addDays(r, 1);
  return r;
}
function prevWorkday(d: Date): Date {
  let r = d;
  while (isWeekend(r)) r = addDays(r, -1);
  return r;
}

const QUARTER_ROMAN = ['I', 'II', 'III', 'IV'];
const QUARTER_WORDS = ['I квартал', 'півріччя', '9 місяців', 'рік'];
const MONTHS_LOC = [
  'січень', 'лютий', 'березень', 'квітень', 'травень', 'червень',
  'липень', 'серпень', 'вересень', 'жовтень', 'листопад', 'грудень',
];

/** Група з відповіді «як ви працюєте»: компанії → III, люди → II, вручну — обрана; загальна система й «не знаю» — без групи. */
export function fopGroup(a: FopAnswers): 1 | 2 | 3 | null {
  if (a.how === 'company') return 3;
  if (a.how === 'people') return 2;
  if (a.how === 'manual') return a.grp;
  return null;
}

/** Чи є звіти за працівників: лише якщо платять людям за договором (на I групі працівників не буває). */
export function fopHasStaff(a: FopAnswers): boolean {
  if (fopGroup(a) === 1) return false;
  if (a.payTo) return a.payTo.staff || a.payTo.contract;
  return a.pay ? a.pay === 'people' : a.emp;
}

/** Усі дедлайни від сьогодні до кінця наступного року. */
export function fopDeadlines(answers: FopAnswers, today = new Date()): FopDeadline[] {
  const grp = fopGroup(answers);
  if (!grp) return [];
  const a = { grp, vat: grp === 3 && answers.vat, emp: fopHasStaff(answers) };
  const from = toISO(today);
  const lastYear = today.getFullYear() + 1;
  const out: FopDeadline[] = [];
  const push = (d: Date, title: string, kind: 'file' | 'pay') => {
    const date = toISO(kind === 'file' ? nextWorkday(d) : prevWorkday(d));
    if (date >= from && Number(date.slice(0, 4)) <= lastYear) out.push({ date, title });
  };

  // Квартали, що закінчуються від минулого року до кінця lastYear
  for (let y = today.getFullYear() - 1; y <= lastYear; y++) {
    for (let q = 0; q < 4; q++) {
      const qEnd = new Date(y, q * 3 + 3, 0); // останній день кварталу
      const decl = addDays(qEnd, 40);
      const nextMonth20 = new Date(y, q * 3 + 3, 19); // «до 20 числа» = останній день 19-те

      if (a.grp === 3) {
        if (q < 3) {
          push(decl, `Подати декларацію за ${QUARTER_WORDS[q]} ${y}`, 'file');
        } else {
          push(decl, `Подати річну декларацію за ${y} + Додаток 1 (ЄСВ)`, 'file');
        }
        push(addDays(decl, 10), `Сплатити ЄП + ВЗ за ${QUARTER_ROMAN[q]} квартал ${y}`, 'pay');
      }
      // ЄСВ за себе — якщо немає звільнення (за «не знаю» нагадування лишаються)
      if (answers.esv !== 'exempt') push(nextMonth20, `Сплатити ЄСВ за ${QUARTER_ROMAN[q]} квартал ${y}`, 'pay');
      if (a.emp) push(decl, `Подати звіт за працівників (ПДФО, ВЗ, ЄСВ) за ${QUARTER_ROMAN[q]} квартал ${y}`, 'file');
    }

    if (a.grp !== 3) {
      // річна декларація за попередній рік: 60 днів після 31 грудня
      push(addDays(new Date(y - 1, 11, 31), 60), `Подати річну декларацію за ${y - 1} + Додаток 1 (ЄСВ)`, 'file');
      for (let m = 0; m < 12; m++) {
        push(new Date(y, m, 20), `Сплатити ЄП + ВЗ (аванс за ${MONTHS_LOC[m]})`, 'pay');
      }
    }

    if (a.vat) {
      for (let m = 0; m < 12; m++) {
        const declDay = new Date(y, m + 1, 20); // за місяць m — до 20 числа наступного
        push(declDay, `Подати декларацію з ПДВ за ${MONTHS_LOC[m]} ${y}`, 'file');
        push(new Date(y, m + 1, 30), `Сплатити ПДВ за ${MONTHS_LOC[m]} ${y}`, 'pay');
      }
    }
  }

  return out.sort((x, z) => x.date.localeCompare(z.date) || x.title.localeCompare(z.title));
}
