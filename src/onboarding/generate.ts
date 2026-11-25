import type { NewItem, Repeat } from '../types';
import type { Answers, Pet } from './answers';
import { fopDeadlines } from './fop';
import { addDays, fromISO, fromMinutes, toISO, toMinutes, weekdayIndex } from '../lib/dates';

const addMonths = (iso: string, n: number) => {
  const d = fromISO(iso);
  const day = d.getDate();
  const r = new Date(d.getFullYear(), d.getMonth() + n, 1);
  const last = new Date(r.getFullYear(), r.getMonth() + 1, 0).getDate();
  r.setDate(Math.min(day, last));
  return toISO(r);
};

/** Наступна дата після last з кроком iv місяців, не раніше сьогодні. */
export function nextDue(last: string, iv: number, today: string): string {
  let d = addMonths(last, iv);
  while (d < today) d = addMonths(d, iv);
  return d;
}

const petName = (p: Pet, i: number, total: number) => p.name.trim() || (total > 1 ? `Тварина ${i + 1}` : 'Улюбленець');

/** Події, які онбординг додає в календар. */
export function generateItems(a: Answers, today = new Date()): NewItem[] {
  const out: NewItem[] = [];
  const todayIso = toISO(today);
  const on = (k: keyof Answers['modules']) => a.modules[k] && !a.skipped[k];

  // ---------- ФОП ----------
  if (on('fop')) {
    for (const d of fopDeadlines(a.fop, today)) {
      out.push({ title: d.title, module: 'fop', date: d.date, allDay: true, source: 'onb:fop' });
    }
  }

  // ---------- Хобі: фіксовані дні й час ----------
  if (on('hobby')) {
    for (const act of a.hobby.acts) {
      if (act.mode !== 'fixed') continue;
      const days = act.days.map((v, i) => (v ? i : -1)).filter((i) => i >= 0);
      if (!days.length || !act.time) continue;
      // перший раз — найближчий обраний день, починаючи з сьогодні
      let first = today;
      while (!days.includes(weekdayIndex(first))) first = addDays(first, 1);
      out.push({
        title: act.name.trim() || 'Заняття',
        module: 'hobby',
        date: toISO(first),
        allDay: false,
        start: act.time,
        end: fromMinutes(toMinutes(act.time) + act.dur),
        repeat: { freq: 'weekly', days },
        source: 'onb:hobby',
      });
    }
  }

  // ---------- Улюбленець ----------
  if (on('pet')) {
    a.pet.pets.forEach((p, pi) => {
      const nm = petName(p, pi, a.pet.pets.length);

      if (p.medOn) {
        for (const m of p.meds) {
          if (!m.name.trim()) continue;
          const start = m.start || todayIso;
          const days = Number(m.days);
          const until = m.course === 'course' && days > 0 ? toISO(addDays(fromISO(start), days - 1)) : undefined;
          const repeat: Repeat =
            m.freq === 'daily'
              ? { freq: 'daily', until }
              : m.freq === 'alt'
                ? { freq: 'daily', interval: 2, until }
                : { freq: 'weekly', days: [m.wday ?? weekdayIndex(fromISO(start))], until };
          const times = m.freq === 'daily' ? m.t.slice(0, m.perDay) : m.t.slice(0, 1);
          for (const t of times) {
            if (!t) continue;
            out.push({
              title: `${nm}: ${m.name.trim()}`,
              module: 'pet',
              date: start,
              allDay: false,
              start: t,
              end: fromMinutes(toMinutes(t) + 15),
              note: m.dose.trim() || undefined,
              repeat,
              source: 'onb:pet:med',
            });
          }
        }
      }

      if (p.vaccOn) {
        const keys = p.kind === 'cat' || p.kind === 'dog' ? (['complex', 'rabies'] as const) : (['generic'] as const);
        const names = { complex: 'комплексне щеплення', rabies: 'щеплення від сказу', generic: 'щеплення' };
        for (const k of keys) {
          const v = p.vaccs[k];
          if (!v.last) continue; // «щеплення без дати пропустимо»
          out.push({
            title: `${nm}: ${names[k]}`,
            module: 'pet',
            date: nextDue(v.last, v.iv, todayIso),
            allDay: true,
            note: 'Записатися заздалегідь, приблизно за 7 днів.',
            repeat: { freq: 'monthly', interval: v.iv },
            source: 'onb:pet:vacc',
          });
        }
      }

      if (p.vetOn) {
        // Ветеринар (14.11, 21:51): два варіанти.
        // «запланований» — візит у вказану дату/час; якщо «повторювати» — кожні 6 / 12 міс від цієї дати.
        // «повторюваний» — лише останній візит + інтервал: наступний = останній + інтервал, далі повтор.
        if (p.vetMode === 'regular') {
          if (p.vetLast) {
            out.push({
              title: `${nm}: плановий огляд`,
              module: 'pet',
              date: nextDue(p.vetLast, p.vetIv, todayIso),
              allDay: true,
              repeat: { freq: 'monthly', interval: p.vetIv },
              source: 'onb:pet:vet',
            });
          }
        } else if (p.vetDate && p.vetDate >= todayIso) {
          out.push({
            title: `${nm}: ветеринар`,
            module: 'pet',
            date: p.vetDate,
            allDay: !p.vetTime,
            start: p.vetTime || undefined,
            end: p.vetTime ? fromMinutes(toMinutes(p.vetTime) + 60) : undefined,
            repeat: p.vetReg ? { freq: 'monthly', interval: p.vetIv } : undefined,
            source: 'onb:pet:vet',
          });
        }
      }

      if (p.procOn) {
        for (const pr of p.procs) {
          if (!pr.name.trim() || !pr.last) continue;
          const iv = Number(pr.iv) || 3;
          out.push({
            title: `${nm}: ${pr.name.trim()}`,
            module: 'pet',
            date: nextDue(pr.last, iv, todayIso),
            allDay: true,
            repeat: iv === 12 ? { freq: 'yearly' } : { freq: 'monthly', interval: iv },
            source: 'onb:pet:proc',
          });
        }
      }
    });
  }

  return out;
}
