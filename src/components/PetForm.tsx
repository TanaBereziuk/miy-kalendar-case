import { useState } from 'react';
import { Segmented, Switch } from '../onboarding/ui';
import { fromISO, fromMinutes, toISO, toMinutes, weekdayIndex } from '../lib/dates';
import { nextDue } from '../onboarding/generate';
import type { NewItem, Repeat } from '../types';
import { DateProp, PropInput, PropSelect, QfRow, TimeSelect } from './QuickFields';
import { ICONS, Icon } from './Icon';

const DOW = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Нд'];
const MED_TIMES: Record<number, string[]> = { 1: ['08:30'], 2: ['08:30', '20:30'], 3: ['08:00', '14:00', '20:00'] };
const PROC_OPTS: [string, string][] = [
  ['1', 'щомісяця'],
  ['2', 'кожні 2 міс'],
  ['3', 'кожні 3 міс'],
  ['6', 'кожні 6 міс'],
  ['12', 'щороку'],
];

export type PetKind = 'med' | 'vacc-complex' | 'vacc-rabies' | 'vacc-other' | 'vet' | 'proc';
const KIND_OPTS: [PetKind, string][] = [
  ['med', 'ліки'],
  ['vacc-complex', 'комплексне щеплення'],
  ['vacc-rabies', 'щеплення від сказу'],
  ['vacc-other', 'інше щеплення'],
  ['vet', 'візит до ветеринара'],
  ['proc', 'інша процедура'],
];
const VACC_NAME = { 'vacc-complex': 'комплексне щеплення', 'vacc-rabies': 'щеплення від сказу', 'vacc-other': 'щеплення' } as const;

/** Поля запису про улюбленця — ті самі, що на кроці «улюбленець» в онбордингу; тип запису обирають у випадному списку. */
export function usePetForm(petsIn: string[], date: string, start?: string) {
  const pets = petsIn.length ? petsIn : ['Улюбленець'];
  const todayIso = toISO(new Date());
  const [kind, setKind] = useState<PetKind>('med');
  const [pet, setPet] = useState(pets[0] ?? '');
  // ліки
  const [medName, setMedName] = useState('');
  const [dose, setDose] = useState('1 таблетка');
  const [freq, setFreq] = useState<'daily' | 'alt' | 'week'>('daily');
  const [perDay, setPerDay] = useState<1 | 2 | 3>(1);
  const [times, setTimes] = useState<string[]>(start ? [start] : MED_TIMES[1].slice());
  const [medStart, setMedStart] = useState(date || todayIso);
  const [wday, setWday] = useState<number>(weekdayIndex(fromISO(date || todayIso)));
  const [course, setCourse] = useState<'always' | 'course'>('always');
  const [courseDays, setCourseDays] = useState('');
  // щеплення
  const [vaccLast, setVaccLast] = useState('');
  const [vaccIv, setVaccIv] = useState<6 | 12 | 36>(12);
  // ветеринар
  const [vetMode, setVetMode] = useState<'planned' | 'regular'>('planned');
  const [vetDate, setVetDate] = useState(date || '');
  const [vetTime, setVetTime] = useState(start ?? '10:00');
  const [vetReg, setVetReg] = useState(false);
  const [vetLast, setVetLast] = useState('');
  const [vetIv, setVetIv] = useState<6 | 12>(12);
  // процедура
  const [procName, setProcName] = useState('');
  const [procLast, setProcLast] = useState('');
  const [procIv, setProcIv] = useState('3');

  // 23.11: у швидкому вікні назва над полями — для ліків і процедур це їхня назва, для щеплень і ветеринара — необовʼязкова
  const [ownTitle, setOwnTitle] = useState('');
  const title = kind === 'med' ? medName : kind === 'proc' ? procName : ownTitle;
  const setTitle = kind === 'med' ? setMedName : kind === 'proc' ? setProcName : setOwnTitle;
  const titleHint = kind === 'med' ? 'назва препарату' : kind === 'proc' ? 'назва процедури' : KIND_OPTS.find(([v]) => v === kind)![1];

  // 23.11: «додати ще одного» — нове імʼя зберігається в налаштуваннях і далі обирається зі списку
  const ADD = '__add';
  const adding = pet === ADD;
  const [newName, setNewName] = useState('');
  const prefix = adding ? newName.trim() : pet || pets[0];

  const build = (): { error: string } | { items: NewItem[] } => {
    if (adding && !newName.trim()) return { error: 'Вкажіть імʼя улюбленця.' };
    const nm = prefix;
    if (kind === 'med') {
      if (!medName.trim()) return { error: 'Вкажіть назву препарату.' };
      const start0 = medStart || todayIso;
      const n = Number(courseDays);
      if (course === 'course' && !(n > 0)) return { error: 'Вкажіть, скільки днів триває курс.' };
      const ts = (freq === 'daily' ? times.slice(0, perDay) : times.slice(0, 1)).filter(Boolean);
      if (!ts.length) return { error: 'Вкажіть час прийому.' };
      const d0 = fromISO(start0);
      const until = course === 'course' ? toISO(new Date(d0.getFullYear(), d0.getMonth(), d0.getDate() + n - 1)) : undefined;
      const repeat: Repeat =
        freq === 'daily' ? { freq: 'daily', until } : freq === 'alt' ? { freq: 'daily', interval: 2, until } : { freq: 'weekly', days: [wday], until };
      return {
        items: ts.map((t) => ({
          title: `${nm}: ${medName.trim()}`,
          module: 'pet' as const,
          date: start0,
          allDay: false,
          start: t,
          end: fromMinutes(toMinutes(t) + 15),
          note: dose.trim() || undefined,
          repeat,
        })),
      };
    }
    if (kind === 'vet') {
      if (vetMode === 'regular') {
        if (!vetLast) return { error: 'Вкажіть дату останнього візиту.' };
        return {
          items: [
            { title: `${nm}: ${ownTitle.trim() || 'плановий огляд'}`, module: 'pet', date: nextDue(vetLast, vetIv, todayIso), allDay: true, repeat: { freq: 'monthly', interval: vetIv }, source: 'onb:pet:vet' },
          ],
        };
      }
      if (!vetDate) return { error: 'Вкажіть дату візиту.' };
      return {
        items: [
          {
            title: `${nm}: ${ownTitle.trim() || 'ветеринар'}`,
            module: 'pet',
            date: vetDate,
            allDay: !vetTime,
            start: vetTime || undefined,
            end: vetTime ? fromMinutes(toMinutes(vetTime) + 60) : undefined,
            repeat: vetReg ? { freq: 'monthly', interval: vetIv } : undefined,
          },
        ],
      };
    }
    if (kind === 'proc') {
      if (!procName.trim()) return { error: 'Вкажіть назву процедури.' };
      if (!procLast) return { error: 'Вкажіть дату останньої процедури.' };
      const iv = Number(procIv) || 3;
      return {
        items: [
          {
            title: `${nm}: ${procName.trim()}`,
            module: 'pet',
            date: nextDue(procLast, iv, todayIso),
            allDay: true,
            repeat: iv === 12 ? { freq: 'yearly' } : { freq: 'monthly', interval: iv },
          },
        ],
      };
    }
    if (!vaccLast) return { error: 'Вкажіть дату останнього щеплення.' };
    return {
      items: [
        {
          title: `${nm}: ${ownTitle.trim() || VACC_NAME[kind]}`,
          module: 'pet',
          date: nextDue(vaccLast, vaccIv, todayIso),
          allDay: true,
          note: 'Записатися заздалегідь, приблизно за 7 днів.',
          repeat: { freq: 'monthly', interval: vaccIv },
        },
      ],
    };
  };

  return {
    pets, pet, setPet, kind, setKind, title, setTitle, titleHint, ADD, adding, newName, setNewName,
    medName, setMedName, dose, setDose, freq, setFreq, perDay, setPerDay, times, setTimes, medStart, setMedStart,
    wday, setWday, course, setCourse, courseDays, setCourseDays,
    vaccLast, setVaccLast, vaccIv, setVaccIv,
    vetMode, setVetMode, vetDate, setVetDate, vetTime, setVetTime, vetReg, setVetReg, vetLast, setVetLast, vetIv, setVetIv,
    procName, setProcName, procLast, setProcLast, procIv, setProcIv,
    build,
  };
}

export type PetForm = ReturnType<typeof usePetForm>;

function Row({ label, children, input }: { label: string; children: React.ReactNode; input?: boolean }) {
  return input ? (
    <label className="act-row">
      <span className="act-label">{label}</span>
      {children}
    </label>
  ) : (
    <div className="act-row">
      <span className="act-label">{label}</span>
      {children}
    </div>
  );
}

export function PetFormFields({ f }: { f: PetForm }) {
  return (
    <div className="pet-step">
      <div className="pet-form">
        <div className="row pet-pick">
          <label className="field grow">
            <span>тварина</span>
            <select value={f.pet} onChange={(e) => f.setPet(e.target.value)}>
              {f.pets.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </label>
          <label className="field grow">
            <span>тип</span>
            <select value={f.kind} onChange={(e) => f.setKind(e.target.value as PetKind)}>
              {KIND_OPTS.map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </label>
        </div>

        {f.kind === 'med' && (
          <>
            <div className="med-fields">
              <input type="text" className="pet-input" aria-label="Назва препарату" maxLength={200} value={f.medName} onChange={(e) => f.setMedName(e.target.value)} placeholder="назва препарату" />
              {!f.medName.trim() && (
                <div className="often">
                  часто додають:
                  <button type="button" className="chip-btn" onClick={() => f.setMedName('Антигістамінне')}>
                    Антигістамінне
                  </button>
                </div>
              )}
            </div>
            <Row label="доза">
              <Segmented
                label="Доза"
                value={f.dose}
                onChange={f.setDose}
                options={[
                  { v: '1/4 таблетки', l: '1/4' },
                  { v: '1/2 таблетки', l: '1/2' },
                  { v: '1 таблетка', l: '1 ціла' },
                ]}
              />
            </Row>
            <Row label="як часто">
              <Segmented
                label="Як часто"
                value={f.freq}
                onChange={f.setFreq}
                options={[
                  { v: 'daily', l: 'щодня' },
                  { v: 'alt', l: 'через день' },
                  { v: 'week', l: 'раз на тиждень' },
                ]}
              />
            </Row>
            {f.freq === 'week' && (
              <div className="act-row">
                <span className="act-label">бажаний день</span>
                <div className="act-days" role="group" aria-label="Бажаний день">
                  {DOW.map((d, i) => (
                    <button type="button" key={d} aria-pressed={f.wday === i} className={'day-pill' + (f.wday === i ? ' on' : '')} onClick={() => f.setWday(i)}>
                      {d}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {f.freq === 'daily' && (
              <Row label="разів на день">
                <Segmented
                  label="Разів на день"
                  value={f.perDay}
                  onChange={(n) => {
                    f.setPerDay(n);
                    f.setTimes(MED_TIMES[n].slice());
                  }}
                  options={[
                    { v: 1, l: '1' },
                    { v: 2, l: '2' },
                    { v: 3, l: '3' },
                  ]}
                />
              </Row>
            )}
            {Array.from({ length: f.freq === 'daily' ? f.perDay : 1 }, (_, i) => (
              <Row key={i} label={(f.freq === 'daily' ? f.perDay : 1) === 1 ? 'час прийому' : `прийом ${i + 1}`} input>
                <input
                  type="time"
                  className="act-time"
                  value={f.times[i] ?? ''}
                  onChange={(e) => {
                    const t = f.times.slice();
                    t[i] = e.target.value;
                    f.setTimes(t);
                  }}
                />
              </Row>
            ))}
            <Row label="з якої дати" input>
              <input type="date" className="act-time" value={f.medStart} onChange={(e) => f.setMedStart(e.target.value)} />
            </Row>
            <Row label="тривалість">
              <Segmented
                label="Тривалість прийому"
                value={f.course}
                onChange={f.setCourse}
                options={[
                  { v: 'always', l: 'постійно' },
                  { v: 'course', l: 'курсом' },
                ]}
              />
            </Row>
            {f.course === 'course' && (
              <Row label="днів курсу" input>
                <input type="number" min={1} className="act-time num" value={f.courseDays} onChange={(e) => f.setCourseDays(e.target.value)} />
              </Row>
            )}
          </>
        )}

        {(f.kind === 'vacc-complex' || f.kind === 'vacc-rabies' || f.kind === 'vacc-other') && (
          <>
            <Row label={f.kind === 'vacc-complex' ? 'останнє комплексне' : f.kind === 'vacc-rabies' ? 'останнє від сказу' : 'останнє щеплення'} input>
              <input type="date" className="act-time" value={f.vaccLast} onChange={(e) => f.setVaccLast(e.target.value)} />
            </Row>
            <Row label="інтервал">
              <Segmented
                label="Інтервал щеплень"
                value={f.vaccIv}
                onChange={f.setVaccIv}
                options={[
                  { v: 6, l: '6 міс' },
                  { v: 12, l: '12 міс' },
                  { v: 36, l: '36 міс' },
                ]}
              />
            </Row>
            <p className="hint small">Нагадаємо записатися за 7 днів до терміну. Інтервали — стартові, уточніть їх у ветеринара.</p>
          </>
        )}

        {f.kind === 'vet' && (
          <>
            <Segmented
              label="Тип візиту"
              fill
              value={f.vetMode}
              onChange={f.setVetMode}
              options={[
                { v: 'planned', l: 'запланований' },
                { v: 'regular', l: 'повторюваний' },
              ]}
            />
            {f.vetMode === 'regular' ? (
              <>
                <Row label="останній візит" input>
                  <input type="date" className="act-time" value={f.vetLast} onChange={(e) => f.setVetLast(e.target.value)} />
                </Row>
                <Row label="інтервал">
                  <Segmented
                    label="Інтервал візитів"
                    value={f.vetIv}
                    onChange={f.setVetIv}
                    options={[
                      { v: 6, l: '6 міс' },
                      { v: 12, l: '12 міс' },
                    ]}
                  />
                </Row>
              </>
            ) : (
              <>
                <Row label="дата і час" input>
                  <input
                    type="datetime-local"
                    className="act-time act-datetime"
                    value={f.vetDate ? `${f.vetDate}T${f.vetTime || '10:00'}` : ''}
                    onChange={(e) => {
                      const [d, t] = e.target.value.split('T');
                      f.setVetDate(d || '');
                      f.setVetTime(d ? t || '' : '');
                    }}
                  />
                </Row>
                <div className="act-row">
                  <span className="act-label">повторювати</span>
                  <Switch on={f.vetReg} label="повторювати" onChange={f.setVetReg} />
                </div>
                {f.vetReg && (
                  <Row label="інтервал">
                    <Segmented
                      label="Інтервал візитів"
                      value={f.vetIv}
                      onChange={f.setVetIv}
                      options={[
                        { v: 6, l: '6 міс' },
                        { v: 12, l: '12 міс' },
                      ]}
                    />
                  </Row>
                )}
              </>
            )}
            <p className="hint small">Нагадаємо за 1 день до візиту.</p>
          </>
        )}

        {f.kind === 'proc' && (
          <>
            <input type="text" className="pet-input" aria-label="Назва процедури" maxLength={200} value={f.procName} onChange={(e) => f.setProcName(e.target.value)} placeholder="назва, напр. обробка від бліх" />
            <Row label="дата останньої" input>
              <input type="date" className="act-time" value={f.procLast} onChange={(e) => f.setProcLast(e.target.value)} />
            </Row>
            <Row label="інтервал" input>
              <select className="row-select" value={f.procIv} onChange={(e) => f.setProcIv(e.target.value)}>
                {PROC_OPTS.map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            </Row>
          </>
        )}
      </div>
    </div>
  );
}


const VET_REPEAT: [string, string][] = [
  ['no', 'не повторюється'],
  ['6', 'кожні 6 міс'],
  ['12', 'щороку'],
];

/** Улюбленець у швидкому вікні (23.11): ті самі дані, поля «підпис — значення» в стилі Notion; назва — над полями (ItemDialog) */
export function PetQuickFields({ f }: { f: PetForm }) {
  const nTimes = f.freq === 'daily' ? f.perDay : 1;
  return (
    <div className="qf-grid">
      <QfRow k="улюбленець">
        {f.adding ? (
          <>
            <input
              className="qf-prop qf-input qf-input-edit"
              autoFocus
              maxLength={60}
              value={f.newName}
              onChange={(e) => f.setNewName(e.target.value)}
              placeholder="імʼя нового улюбленця"
              aria-label="Імʼя нового улюбленця"
              autoComplete="off"
            />
            <button type="button" className="x20" aria-label="Обрати зі збережених" onClick={() => f.setPet(f.pets[0])}>
              <Icon d={ICONS.close} size={8} />
            </button>
          </>
        ) : (
          <PropSelect
            label="Улюбленець"
            value={f.pet}
            onChange={f.setPet}
            options={[...f.pets.map((p) => [p, p] as [string, string]), [f.ADD, 'додати ще одного']]}
          />
        )}
      </QfRow>
      <QfRow k="що">
        <PropSelect label="Що" value={f.kind} onChange={f.setKind} options={KIND_OPTS} />
      </QfRow>

      {f.kind === 'med' && (
        <>
          <QfRow k="доза">
            <PropSelect
              label="Доза"
              value={f.dose}
              onChange={f.setDose}
              options={[
                ['1/4 таблетки', '1/4 таблетки'],
                ['1/2 таблетки', '1/2 таблетки'],
                ['1 таблетка', '1 таблетка'],
              ]}
            />
          </QfRow>
          <QfRow k="як часто">
            <PropSelect
              label="Як часто"
              value={f.freq}
              onChange={f.setFreq}
              options={[
                ['daily', 'щодня'],
                ['alt', 'через день'],
                ['week', 'раз на тиждень'],
              ]}
            />
          </QfRow>
          {f.freq === 'week' && (
            <QfRow k="день тижня">
              <PropSelect label="День тижня" value={f.wday} onChange={f.setWday} options={DOW.map((d, i) => [i, d.toLowerCase()] as [number, string])} />
            </QfRow>
          )}
          {f.freq === 'daily' && (
            <QfRow k="разів на день">
              <PropSelect
                label="Разів на день"
                value={f.perDay}
                onChange={(n) => {
                  f.setPerDay(n);
                  f.setTimes(MED_TIMES[n].slice());
                }}
                options={[
                  [1, '1 раз'],
                  [2, '2 рази'],
                  [3, '3 рази'],
                ]}
              />
            </QfRow>
          )}
          <QfRow k={nTimes === 1 ? 'час' : 'час прийомів'}>
            {Array.from({ length: nTimes }, (_, i) => (
              <TimeSelect
                key={i}
                label={`Прийом ${i + 1}`}
                value={f.times[i] ?? ''}
                onChange={(v) => {
                  const t = f.times.slice();
                  t[i] = v;
                  f.setTimes(t);
                }}
              />
            ))}
          </QfRow>
          <QfRow k="з якого дня">
            <DateProp value={f.medStart} onChange={f.setMedStart} label="З якого дня" />
          </QfRow>
          <QfRow k="тривалість">
            <PropSelect
              label="Тривалість прийому"
              value={f.course}
              onChange={f.setCourse}
              options={[
                ['always', 'постійно'],
                ['course', 'курсом'],
              ]}
            />
          </QfRow>
          {f.course === 'course' && (
            <QfRow k="днів курсу">
              <PropInput value={f.courseDays} onChange={(v) => f.setCourseDays(v.replace(/\D/g, ''))} placeholder="наприклад, 10" label="Днів курсу" width={140} inputMode="numeric" />
            </QfRow>
          )}
        </>
      )}

      {(f.kind === 'vacc-complex' || f.kind === 'vacc-rabies' || f.kind === 'vacc-other') && (
        <>
          <QfRow k="останнє">
            <DateProp value={f.vaccLast} onChange={f.setVaccLast} label="Дата останнього щеплення" />
          </QfRow>
          <QfRow k="інтервал">
            <PropSelect
              label="Інтервал щеплень"
              value={f.vaccIv}
              onChange={f.setVaccIv}
              options={[
                [6, '6 міс'],
                [12, '12 міс'],
                [36, '36 міс'],
              ]}
            />
          </QfRow>
        </>
      )}

      {f.kind === 'vet' && (
        <>
          <QfRow k="візит">
            <PropSelect
              label="Тип візиту"
              value={f.vetMode}
              onChange={f.setVetMode}
              options={[
                ['planned', 'запланований'],
                ['regular', 'плановий огляд'],
              ]}
            />
          </QfRow>
          {f.vetMode === 'regular' ? (
            <>
              <QfRow k="останній візит">
                <DateProp value={f.vetLast} onChange={f.setVetLast} label="Останній візит" />
              </QfRow>
              <QfRow k="інтервал">
                <PropSelect
                  label="Інтервал візитів"
                  value={f.vetIv}
                  onChange={f.setVetIv}
                  options={[
                    [6, 'кожні 6 міс'],
                    [12, 'щороку'],
                  ]}
                />
              </QfRow>
            </>
          ) : (
            <>
              <QfRow k="день">
                <DateProp value={f.vetDate} onChange={f.setVetDate} label="День візиту" />
              </QfRow>
              <QfRow k="час">
                <TimeSelect value={f.vetTime} onChange={f.setVetTime} label="Час візиту" empty="без часу" />
              </QfRow>
              <QfRow k="повторення">
                <PropSelect
                  label="Повторення"
                  value={f.vetReg ? String(f.vetIv) : 'no'}
                  muted={!f.vetReg}
                  onChange={(v) => {
                    f.setVetReg(v !== 'no');
                    if (v !== 'no') f.setVetIv(Number(v) as 6 | 12);
                  }}
                  options={VET_REPEAT}
                />
              </QfRow>
            </>
          )}
        </>
      )}

      {f.kind === 'proc' && (
        <>
          <QfRow k="остання">
            <DateProp value={f.procLast} onChange={f.setProcLast} label="Дата останньої процедури" />
          </QfRow>
          <QfRow k="інтервал">
            <PropSelect label="Інтервал" value={f.procIv} onChange={f.setProcIv} options={PROC_OPTS} />
          </QfRow>
        </>
      )}
    </div>
  );
}
