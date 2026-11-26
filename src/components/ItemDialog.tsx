import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { bdayName, bdaySource, bdayYear, isBirthday } from '../lib/birthday';
import { QUICK_TYPE_ORDER, dayLabel, durLabel, quickTypeMeta, usePopoverPos, type QuickType } from './QuickAdd';
import { DateProp, PropInput, QfRow, TimeSelect } from './QuickFields';
import type { Anchor } from './EventView';
import { MODULES, MODULE_ORDER, type CalendarItem, type ModuleId, type NewItem, type NewTask, type Repeat } from '../types';
import { fromISO, fromMinutes, toISO, toMinutes, weekdayIndex } from '../lib/dates';
import { EventPicker, type EventRef } from './Tasks';
import { describeRepeat } from '../lib/repeat';
import { SCOPE_LABELS, type Scope } from '../lib/series';
import { ICONS, Icon } from './Icon';
import { DishFormFields, useDishForm } from '../food/DishForm';
import { DeleteButton } from './DeleteButton';
import { dishIdOf, type Dish, type NewDish } from '../food/dishes';
import { DishRow } from '../food/DishRow';
import { DishAddBlock, DishSearch, filterDishes } from '../food/FoodPanel';
import { HobbyFormFields, HobbyQuickFields, useHobbyForm, type HobbyDur } from './HobbyForm';
import { PetFormFields, PetQuickFields, usePetForm } from './PetForm';
import { FopFields } from '../onboarding/steps';
import { FopQuickFields, FopReminderFields, useFopReminderForm } from './FopReminderForm';
import type { FopAnswers } from '../onboarding/answers';
import { Switch } from '../onboarding/ui';

/** Ширина компактного вікна швидкого додавання (18.11) */
const QUICK_WIDTH = 400;


export interface DialogState {
  item?: CalendarItem;
  /** повторювана подія (18.11): дата показу, з якого відкрили вікно */
  occ?: string;
  draft?: Partial<NewItem>;
  /** відкрито з переліку швидкого додавання (18.11): де стояв перелік і з якими днем і годиною */
  quick?: { anchor?: Anchor; draft: Partial<NewItem>; type?: QuickType; /** питання онбордингу модуля вже показано (23.11) */ onbDone?: boolean; /** «+» у шапці (23.11): та сама форма, але бічною панеллю */ panel?: boolean };
  /** справу без дати ставлять у календар (етап 1, 18.11): «без дати» вимкнено, день і час — з draft */
  schedule?: boolean;
  /** подію роблять із задачі («Зробити подією»): після збереження задачу прибираємо */
  fromTask?: string;
  /** швидке вікно: виділену клітинку сховано («без дати» чи «задача») */
  hideCell?: boolean;
}

interface Props {
  state: DialogState;
  onClose: () => void;
  /** scope — для повторюваної події: лише цю, цю й наступні чи всі (18.11) */
  onSave: (data: NewItem, id?: string, scope?: Scope) => void;
  onDelete: (id: string, scope?: Scope) => void;
  /** нова страва з вкладки «харчування»: зберегти в бібліотеку й поставити в календар */
  onSaveDish: (d: NewDish, date: string, start?: string) => void;
  /** страви бібліотеки: подія, привʼязана до страви, редагується тими самими полями, що й нова страва */
  dishes: Dish[];
  /** зберегти зміни страви разом із датою й часом події */
  onUpdateDish: (dish: Dish, d: NewDish, item: CalendarItem, date: string, start: string) => void;
  /** нове заняття «N разів на тиждень» з вкладки «хобі»: ляже в рядок «без дня» */
  onSaveHobbyN: (a: { name: string; n: number; dur: HobbyDur }) => void;
  /** імена улюбленців з налаштувань (для вкладки «улюбленець») */
  petNames: string[];
  /** кілька подій одразу (ліки з кількома прийомами на день) */
  onSaveMany: (items: NewItem[]) => void;
  /** профіль ФОП з налаштувань (для вкладки «ФОП») */
  fop: FopAnswers;
  /** чи є вже в календарі дедлайни ФОП, поставлені автоматично */
  hasFopDeadlines: boolean;
  /** профіль ФОП уже налаштовано (крок ФОП не пропущено): вкладка показує нагадування, а не поля онбордингу */
  fopSetUp: boolean;
  /** зберегти профіль ФОП і замінити автоматичні дедлайни */
  onSaveFop: (v: FopAnswers) => void;
  /**
   * Швидке додавання з клітинки (18.11): компактне вікно поруч із клітинкою (на телефоні — знизу) без табів,
   * модуль уже обрано; угорі «назад» до переліку, назва модуля й день з годиною.
   */
  quick?: {
    anchor?: Anchor;
    /** «+» у шапці (23.11): та сама форма, але бічною панеллю праворуч (на телефоні — знизу), з «без дати» */
    panel?: boolean;
    phone: boolean;
    modules: ModuleId[];
    /** тип, обраний на першому кроці (23.11) */
    type: QuickType;
    /** типи для випадного списку вгорі */
    types: QuickType[];
    /** змінити тип: вікно перебудовується з тими самими днем, часом і назвою */
    onType: (t: QuickType, title: string) => void;
  };
  /** поставити в календар страву з бібліотеки (вкладка «їжа», 18.11 — щоб не плодити однакові страви) */
  onPlaceDish: (d: Dish, date: string, start?: string) => void;
  /** назви занять з налаштувань — підказки під назвою нової події */
  hobbyActs: string[];
  /** обраний модуль (швидке додавання) — щоб виділена клітинка була його кольору */
  onModuleChange?: (m: ModuleId) => void;
  /** тип «задача» у швидкому вікні (етап 1, 18.11): події для поля «подія» і збереження задачі */
  events?: { options: CalendarItem[]; items: CalendarItem[] };
  onSaveTask?: (t: NewTask) => void;
  /** «без дати» чи «задача» (18.11): виділена клітинка в тижні зникає */
  onCellHidden?: (hidden: boolean) => void;
  /** «додати ще одного» улюбленця (23.11): нове імʼя — у налаштування */
  onAddPet?: (name: string) => void;
  /** вікно закривається (23.11): відіграє анімація закриття, натискання вже не працюють */
  closing?: boolean;
}


export function ItemDialog({ state, onClose, onSave, onDelete, onSaveDish, dishes, onUpdateDish, onSaveHobbyN, petNames, onSaveMany, fop, fopSetUp, hasFopDeadlines, onSaveFop, quick, onPlaceDish, hobbyActs, onModuleChange, events, onSaveTask, onCellHidden, onAddPet, closing }: Props) {
  // справу без дати ставлять у календар (18.11): поля наявної події, день і час — з клітинки чи сьогоднішнього дня
  const base: Partial<CalendarItem> = state.item ? { ...state.item, ...(state.schedule ? state.draft : {}) } : state.draft ?? {};
  // Етап 1 (18.11): «без дати» — справа без дня й часу лежить у «цього тижня»; «задача» — тип у швидкому вікні
  const [undated, setUndated] = useState(!!state.item?.undated && !state.schedule);
  const [kind] = useState<'event' | 'task'>(quick?.type === 'task' ? 'task' : 'event');
  const [taskDue, setTaskDue] = useState(base.date ?? '');
  const [taskEvent, setTaskEvent] = useState<EventRef | undefined>(undefined);
  const isTask = !!quick && kind === 'task';
  const [title, setTitle] = useState(state.item && isBirthday(state.item) ? bdayName(state.item) : base.title ?? '');
  const [module, setModuleState] = useState<ModuleId>(
    quick && quick.type !== 'task' && quick.type !== 'bday' ? quick.type : base.module ?? (state.item || quick ? 'other' : 'food'),
  );
  const setModule = (m: ModuleId) => {
    setModuleState(m);
    onModuleChange?.(m);
  };
  // Вкладка «їжа» нової події (18.11): спершу бібліотека — обрати наявну страву; «Додати страву» — поля нової
  const [foodPick, setFoodPick] = useState(!state.item && dishes.length > 0);
  const [dishQ, setDishQ] = useState('');
  const pickList = useMemo(() => filterDishes(dishes, dishQ), [dishes, dishQ]);
  // Підказки під назвою (18.11): страви з бібліотеки й заняття з налаштувань
  const [suggestOff, setSuggestOff] = useState(false);
  // Повторювана подія (18.11): угорі вибір «лише цю / цю й наступні / усі»; дата — показу або (для «усі») початку серії
  const occ = state.item?.repeat ? state.occ : undefined;
  const [scope, setScope] = useState<Scope>('one');
  const [date, setDate] = useState(occ ?? base.date ?? '');
  const pickScope = (v: Scope) => {
    setScope(v);
    if (occ) setDate(v === 'all' ? (state.item?.date ?? date) : occ);
  };
  const baseRepeat = base.repeat;
  const isSimple = (r?: Repeat) => !r || ((r.interval ?? 1) === 1 && (r.freq !== 'weekly' || (r.days?.length ?? 0) <= 1));
  const [repeatKind, setRepeatKind] = useState<string>(baseRepeat ? (isSimple(baseRepeat) ? baseRepeat.freq : 'keep') : 'none');
  const [until, setUntil] = useState(baseRepeat?.until ?? '');
  const [allDay, setAllDay] = useState(base.allDay ?? false);
  const [start, setStart] = useState(base.start ?? '09:00');
  const [end, setEnd] = useState(base.end ?? fromMinutes(toMinutes(base.start ?? '09:00') + 60));
  const [note, setNote] = useState(base.note ?? '');
  // День народження (22.11): перемикач у «інше» — ім'я, дата, рік (необовʼязково); щороку, на весь день, source 'bday[:рік]'
  const [bday, setBday] = useState((!!state.item && isBirthday(state.item)) || quick?.type === 'bday');
  // нотатка у формі швидкого вікна (23.11): «додати нотатку» розгортається в поле
  const [noteOpen, setNoteOpen] = useState(!!base.note);
  const [bdayDate, setBdayDate] = useState(state.item ? state.item.date : base.date ?? '');
  const [bYear, setBYear] = useState(state.item ? String(bdayYear(state.item) ?? '') : '');
  const [error, setError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const titleRef = useRef<HTMLInputElement & HTMLTextAreaElement>(null);
  // Назва у швидкому вікні (23.11) — поле в кілька рядків, що росте разом із текстом; Enter — «Зберегти»
  const titleKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      e.currentTarget.form?.requestSubmit();
    }
  };
  useLayoutEffect(() => {
    const el = titleRef.current;
    if (!el || el.tagName !== 'TEXTAREA') return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  });
  const linkedDish = state.item ? dishes.find((x) => x.id === dishIdOf(state.item!.source)) : undefined;
  const dishForm = useDishForm(linkedDish);
  // Час страви (16.11, 19:37): поля «час» для страви немає — лише «дата». Нова страва стає на час клітинки,
  // з якої відкрили вікно (або на обід, 13:00); наявна зберігає свій час. Тривалість — MEAL_MIN (1 година).
  const foodStart = base.start ?? '13:00';
  // Нова подія: модуль обирають вкладками вгорі, поля залежать від модуля (зараз окремі поля лише в «харчування»).
  // Наявну подію редагуємо звичайними полями; якщо це страва з бібліотеки — полями картки страви.
  const isNew = !state.item;
  const foodTab = (isNew && module === 'food') || !!linkedDish;
  // 26.11: страва з бібліотеки в календарі — кошик у заголовку замість «Видалити» внизу
  const dishHeadDelete = !!state.item && !!linkedDish;
  // Вкладка «хобі» (нова подія) — поля заняття з онбордингу
  const hobbyForm = useHobbyForm(base.date ?? '', base.allDay ? undefined : base.start, base.allDay ? undefined : base.end);
  const hobbyTab = isNew && module === 'hobby';
  // Вкладка «улюбленець» (нова подія) — поля кроку «улюбленець» з онбордингу, тип запису — випадним списком
  const petForm = usePetForm(petNames, base.date ?? '', base.allDay ? undefined : base.start);
  const petTab = isNew && module === 'pet';
  // Вкладка «ФОП» (нова подія, 17.11) — поля кроку ФОП з онбордингу; «Зберегти» оновлює профіль і ставить дедлайни
  const [fopValue, setFopValue] = useState<FopAnswers>(fop);
  const fopTab = isNew && module === 'fop';
  // Профіль ФОП налаштовано (17.11, 22:29) — перелік нагадувань за профілем і «своє нагадування» з назвою, датою й часом
  const fopRemind = useFopReminderForm(fop, base.date ?? '', base.allDay ? undefined : base.start, !!quick);
  // Страва у швидкому вікні (23.11): час обирають у полі «час», опис розгортається, як нотатка
  const [foodTime, setFoodTime] = useState(foodStart);
  const [dishNoteOpen, setDishNoteOpen] = useState(false);
  // Назва, набрана до зміни типу (капсула вгорі), переходить у назву нового типу
  useEffect(() => {
    if (!quick || !base.title) return;
    if (quick.type === 'hobby') hobbyForm.setName(base.title);
    else if (quick.type === 'pet') petForm.setTitle(base.title);
    else if (quick.type === 'fop') {
      fopRemind.setChecked([-1]);
      fopRemind.setName(base.title);
    }
    else if (quick.type === 'food') dishForm.setName(base.title);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [formEl, setFormEl] = useState<HTMLFormElement | null>(null);
  const quickStyle = usePopoverPos({ current: formEl }, quick?.anchor, !quick || quick.phone, QUICK_WIDTH, [formEl]);
  const panel = !!quick?.panel;
  const popover = !!quick && !quick.phone && !panel;
  // «без дати» (18.11): не для задачі, нового нагадування ФОП (у дедлайну завжди є дата) і повторюваних подій
  // 23.11: у швидкому вікні перемикача «без дати» немає
  // 23.11: у бічній панелі («+») «без дати» — позначка в рядку з капсулою типу
  const canUndated = (!quick || panel) && !isTask && !fopTab && quick?.type !== 'bday' && !(state.item && bday) && !occ && !state.item?.repeat && !(state.item && foodTab);
  const undatedOn = undated && canUndated;
  const bdayOn = bday && module === 'other' && !isTask && !undatedOn && !(state.item && foodTab);
  // Назва поточного типу — переходить у «назву справи», коли вмикають «без дати»
  const typedName = quick?.type === 'hobby' ? hobbyForm.name : quick?.type === 'pet' ? petForm.title : quick?.type === 'food' ? dishForm.name : title;
  // Вікно «подія» (редагування, 23.11): капсула типу замість чипів модулів; страву з бібліотеки не перетворюють
  const editTypes: QuickType[] = [...MODULE_ORDER.filter((m) => m !== 'other'), 'bday', 'other'];
  const pickEditType = (t: QuickType) => {
    setError('');
    if (t === 'task') return;
    if (t === 'bday') {
      setModule('other');
      setBday(true);
      if (!bdayDate) setBdayDate(date);
      return;
    }
    setBday(false);
    setModule(t);
  };
  useEffect(() => {
    if (quick) onCellHidden?.(undatedOn || isTask);
  }, [quick, undatedOn, isTask, onCellHidden]);
  const q = title.trim().toLowerCase();
  const suggestions =
    isNew && !suggestOff && q.length >= 2
      ? [
          ...dishes.filter((d) => d.name.toLowerCase().includes(q)).slice(0, 4).map((d) => ({ kind: 'dish' as const, name: d.name, dish: d })),
          ...hobbyActs.filter((a) => a.toLowerCase().includes(q)).slice(0, 3).map((a) => ({ kind: 'act' as const, name: a })),
        ].filter((x) => x.name.toLowerCase() !== q || x.kind === 'dish')
      : [];

  useEffect(() => {
    // вікно поруч із клітинкою спершу невидиме (поки рахуємо місце) — фокус ставимо, коли воно вже показане
    const t = window.setTimeout(() => {
      // страва (23.11, ніч): курсор — у посиланні на рецепт, воно перше
      if (quick && module === 'food' && !undated) return formEl?.querySelector<HTMLInputElement>('input[aria-label="Посилання на рецепт"]')?.focus();
      if (quick || (!foodTab && !hobbyTab && !petTab && !fopTab) || isTask || undated) titleRef.current?.focus();
    }, 40);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose, foodTab, hobbyTab, petTab, fopTab, isTask, undated, formEl]);

  const changeStart = (v: string) => {
    // Зберігаємо тривалість, коли рухаємо початок
    if (v && start && end) {
      const dur = toMinutes(end) - toMinutes(start);
      if (dur > 0) setEnd(fromMinutes(toMinutes(v) + dur));
    }
    setStart(v);
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isTask) {
      if (!title.trim()) return setError('Вкажіть задачу.');
      return onSaveTask?.({ title: title.trim(), due: taskDue || undefined, itemId: taskEvent?.itemId, itemDate: taskEvent?.itemDate });
    }
    if (undatedOn) {
      if (!title.trim()) return setError('Вкажіть назву.');
      return onSave(
        {
          title: title.trim(),
          module,
          date: state.item?.undated ? state.item.date : toISO(new Date()),
          allDay: true,
          note: state.item?.note,
          source: state.item?.source,
          undated: true,
        },
        state.item?.id,
      );
    }
    if (foodTab) {
      if (!date) return setError('Вкажіть дату.');
      const d = dishForm.build();
      if (!d) return;
      if (linkedDish && state.item) onUpdateDish(linkedDish, d, state.item, date, foodStart);
      else onSaveDish(d, date, quick ? foodTime : foodStart);
      return;
    }
    if (hobbyTab) {
      const r = hobbyForm.build(date);
      if ('error' in r) return setError(r.error);
      if ('n' in r) return onSaveHobbyN(r.n);
      return onSave(r.fixed);
    }
    if (fopTab && fopSetUp && quick) {
      const r = fopRemind.buildMany();
      if ('error' in r) return setError(r.error);
      return onSaveMany(r.items);
    }
    if (fopTab && fopSetUp) {
      const r = fopRemind.build();
      if ('error' in r) return setError(r.error);
      return onSave(r.item);
    }
    if (fopTab) return onSaveFop(fopValue);
    if (petTab) {
      const r = petForm.build();
      if ('error' in r) return setError(r.error);
      if (petForm.adding) onAddPet?.(petForm.newName.trim());
      return onSaveMany(r.items);
    }
    if (bdayOn) {
      if (!title.trim()) return setError('Вкажіть імʼя.');
      if (!bdayDate) return setError('Вкажіть дату.');
      const y = bYear.trim() ? Number(bYear) : undefined;
      if (y !== undefined && (!Number.isInteger(y) || y < 1900 || y > new Date().getFullYear())) return setError('Рік — чотири цифри, наприклад 1971.');
      return onSave(
        { title: title.trim(), module: 'other', date: bdayDate, allDay: true, repeat: { freq: 'yearly' }, note: note.trim() || undefined, source: bdaySource(y) },
        state.item?.id,
        occ ? 'all' : undefined,
      );
    }
    if (!title.trim()) return setError('Вкажіть назву події.');
    if (!date) return setError('Вкажіть дату.');
    if (!allDay) {
      if (!start) return setError('Вкажіть час початку.');
      if (end && toMinutes(end) <= toMinutes(start)) return setError('Кінець має бути пізніше за початок.');
    }
    let repeat: Repeat | undefined;
    if (repeatKind === 'keep' && baseRepeat) repeat = { ...baseRepeat, until: until || undefined };
    else if (repeatKind === 'weekly') repeat = { freq: 'weekly', days: [weekdayIndex(fromISO(date))], until: until || undefined };
    else if (repeatKind !== 'none') repeat = { freq: repeatKind as Repeat['freq'], until: until || undefined };
    if (occ && scope === 'one') repeat = undefined;
    if (repeat?.until && repeat.until < date) return setError('Дата завершення повторів має бути пізніше за початок.');
    onSave(
      {
        title: title.trim(),
        module,
        date,
        allDay,
        start: allDay ? undefined : start,
        end: allDay ? undefined : end || undefined,
        note: note.trim() || undefined,
        repeat,
        source: state.item?.source,
        // справу без дати поставили в календар (18.11)
        undated: state.item?.undated ? false : undefined,
      },
      state.item?.id,
      occ ? scope : undefined,
    );
  };

  // Страва у швидкому вікні: збіги з бібліотекою за назвою; поки назва порожня — перші 4 страви (улюблені вгорі)
  const fq = dishForm.name.trim().toLowerCase();
  const foodSuggest =
    quick && module === 'food' && !suggestOff
      ? (fq ? dishes.filter((d) => d.name.toLowerCase().includes(fq) && d.name.toLowerCase() !== fq) : [...dishes].sort((a, b) => Number(b.fav) - Number(a.fav))).slice(0, 4)
      : [];
  const suggestionList = suggestions.length > 0 && (
              <div className="suggest" role="listbox" aria-label="Підказки">
                {suggestions.map((x) => {
                  const m = MODULES[x.kind === 'dish' ? 'food' : 'hobby'];
                  return (
                    <button
                      type="button"
                      role="option"
                      aria-selected={false}
                      key={x.kind + x.name}
                      className="suggest-row"
                      onClick={() => {
                        if (x.kind === 'dish') return onPlaceDish(x.dish, date, allDay ? undefined : start);
                        // заняття з налаштувань — вкладка «заняття», «один раз», з назвою
                        hobbyForm.setName(x.name);
                        hobbyForm.setMode('once');
                        if (!allDay) hobbyForm.setTime(start);
                        setSuggestOff(true);
                        setModule('hobby');
                      }}
                    >
                      <span className="suggest-tile" style={{ background: m.color, color: m.text }}>
                        <Icon d={m.icon} size={12} />
                      </span>
                      <span className="suggest-name">{x.name}</span>
                      <span className="suggest-kind">{x.kind === 'dish' ? 'страва з бібліотеки' : 'заняття'}</span>
                    </button>
                  );
                })}
              </div>
            );

  const moduleChips = (
            <fieldset className="field">
              <legend>модуль</legend>
              <div className="chips">
                {MODULE_ORDER.map((id) => {
                  const m = MODULES[id];
                  const on = module === id;
                  return (
                    <button
                      type="button"
                      key={id}
                      className={'chip' + (on ? ' on' : '')}
                      aria-pressed={on}
                      onClick={() => setModule(id)}
                    >
                      <span className="chip-tile" style={{ background: m.color, color: m.text }}>
                        <Icon d={m.icon} size={12} />
                      </span>
                      {m.name}
                    </button>
                  );
                })}
              </div>
            </fieldset>
  );

  return (
    <div
      className={(popover ? 'event-view-overlay quick-overlay' : 'overlay dish-overlay') + (closing ? ' closing' : '')}
      aria-hidden={closing || undefined}
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <form
        ref={setFormEl}
        className={'dialog dish-dialog event-dialog' + (quick ? ' quick-dialog' : '') + (popover ? '' : ' panel-dialog')}
        style={popover ? quickStyle : undefined}
        onSubmit={submit}
        aria-label={state.item ? 'Подія' : 'Нова подія'}
      >
        {/* 23.11: угорі завжди капсула типу — у швидкому вікні, бічній панелі («+») і вікні «подія»;
            у бічній панелі й «подія» праворуч від неї — «без дати» (позначка 14, як «весь день») */}
        <div className="qf-head">
          <TypeSelect
            value={isTask ? 'task' : bdayOn ? 'bday' : module}
            types={quick ? quick.types : editTypes}
            onChange={(t) => (quick ? quick.onType(t, undatedOn ? title : typedName) : pickEditType(t))}
            locked={!!linkedDish}
          />
          {canUndated && (
            <label className="qf-check qf-head-check">
              <input
                type="checkbox"
                checked={undated}
                onChange={(e) => {
                  if (e.target.checked && !title.trim()) setTitle(typedName);
                  setUndated(e.target.checked);
                }}
              />
              <span className="qf-box" aria-hidden="true">
                <Icon d={ICONS.check} size={10} />
              </span>
              без дати
            </label>
          )}
          {/* 26.11: у страви з календаря «Видалити» — кошиком у заголовку, поруч із «×» */}
          {dishHeadDelete && (
            <DeleteButton
              onDelete={() => onDelete(state.item!.id, occ ? scope : undefined)}
              confirmLabel={occ ? (scope === 'one' ? 'Видалити лише цю' : scope === 'following' ? 'Видалити цю й наступні' : 'Видалити всі повтори') : undefined}
            />
          )}
          <button type="button" className="round-btn" aria-label="Закрити" onClick={onClose}>
            <Icon d={ICONS.close} size={12} />
          </button>
        </div>

        {occ && !foodTab && !bdayOn && (
          <div className="scope-pick">
            <span className="scope-pick-label">змінити</span>
            <div className="seg fill event-tabs" role="radiogroup" aria-label="Які події змінити">
              {(['one', 'following', 'all'] as Scope[]).map((v) => (
                <button type="button" role="radio" key={v} className={scope === v ? 'on' : ''} aria-checked={scope === v} onClick={() => pickScope(v)}>
                  {SCOPE_LABELS[v]}
                </button>
              ))}
            </div>
          </div>
        )}

        {quick && isTask ? (
          <>
            <textarea
              ref={titleRef}
              className="qf-title"
              rows={1}
              onKeyDown={titleKey}
              maxLength={300}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="що зробити"
              aria-label="Задача"
              autoComplete="off"
            />
            <div className="qf-grid">
              <span className="qf-k">день</span>
              <span className="qf-v">
                <DateProp value={taskDue} onChange={setTaskDue} placeholder="без дня" label="День задачі" />
                {taskDue && (
                  <button type="button" className="x20" aria-label="Прибрати день" onClick={() => setTaskDue('')}>
                    <Icon d={ICONS.close} size={8} />
                  </button>
                )}
              </span>
              {events && (
                <>
                  <span className="qf-k">подія</span>
                  <div className="qf-v qf-picker">
                    <EventPicker options={events.options} items={events.items} value={taskEvent} onChange={setTaskEvent} />
                  </div>
                </>
              )}
            </div>
          </>
        ) : undatedOn ? (
          <>
            <textarea
              ref={titleRef}
              className="qf-title"
              rows={1}
              onKeyDown={titleKey}
              maxLength={300}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="назва справи"
              aria-label="Назва"
              autoComplete="off"
            />
            <p className="qf-hint">Справа лежатиме в рядку «цього тижня» і переходитиме на наступний тиждень, доки ви не поставите її в календар.</p>
          </>
        ) : quick && module === 'hobby' ? (
          <>
            <textarea
              ref={titleRef}
              className="qf-title"
              rows={1}
              onKeyDown={titleKey}
              maxLength={300}
              value={hobbyForm.name}
              onChange={(e) => hobbyForm.setName(e.target.value)}
              placeholder="назва заняття"
              aria-label="Назва заняття"
              autoComplete="off"
            />
            <HobbyQuickFields f={hobbyForm} />
          </>
        ) : quick && module === 'pet' ? (
          <>
            <textarea
              ref={titleRef}
              className="qf-title"
              rows={1}
              onKeyDown={titleKey}
              maxLength={200}
              value={petForm.title}
              onChange={(e) => petForm.setTitle(e.target.value)}
              placeholder={petForm.titleHint}
              aria-label="Назва"
              autoComplete="off"
            />
            <PetQuickFields f={petForm} />
          </>
        ) : quick && module === 'fop' && fopSetUp ? (
          <FopQuickFields f={fopRemind} when={`${dayLabel(fopRemind.day)} о ${fopRemind.time}`} />
        ) : quick && module === 'food' ? (
          <>
            {/* 23.11 (ніч): спершу посилання на рецепт — воно заповнює назву й опис; поля «день» немає —
                страва стає на день клітинки (з «+» — на день, з якого відкрито панель) */}
            <div className="qf-grid">
              <QfRow k="рецепт">
                <PropInput value={dishForm.source} onChange={dishForm.setSource} placeholder="вставте посилання" label="Посилання на рецепт" inputMode="url" noEnter />
              </QfRow>
              {(dishForm.busy || dishForm.info) && <p className="qf-hint">{dishForm.busy ? 'Читаю рецепт за посиланням…' : dishForm.info}</p>}
            </div>
            <textarea
              className="qf-title"
              rows={1}
              onKeyDown={titleKey}
              maxLength={200}
              value={dishForm.name}
              onChange={(e) => {
                dishForm.setName(e.target.value);
                setSuggestOff(false);
              }}
              placeholder="назва страви"
              aria-label="Назва страви"
              autoComplete="off"
            />
            {foodSuggest.length > 0 && (
              <div className="suggest" role="listbox" aria-label="Страви з бібліотеки">
                {foodSuggest.map((d) => (
                  <button type="button" role="option" aria-selected={false} key={d.id} className="suggest-row" onClick={() => onPlaceDish(d, date, foodTime)}>
                    <span className="suggest-tile" style={{ background: MODULES.food.color, color: MODULES.food.text }}>
                      <Icon d={MODULES.food.icon} size={12} />
                    </span>
                    <span className="suggest-name">{d.name}</span>
                    <span className="suggest-kind">з бібліотеки</span>
                  </button>
                ))}
              </div>
            )}
            <div className="qf-grid">
              <QfRow k="час">
                <TimeSelect value={foodTime} onChange={setFoodTime} label="Час" />
              </QfRow>
              <QfRow k="опис">
                {dishNoteOpen || dishForm.note ? (
                  <textarea
                    className="qf-prop qf-note"
                    rows={2}
                    value={dishForm.note}
                    autoFocus={!dishForm.note}
                    onChange={(e) => dishForm.setNote(e.target.value)}
                    onBlur={() => !dishForm.note.trim() && setDishNoteOpen(false)}
                    aria-label="Опис"
                  />
                ) : (
                  <button type="button" className="qf-prop empty" onClick={() => setDishNoteOpen(true)}>
                    додати опис
                  </button>
                )}
              </QfRow>
            </div>
            {dishForm.error && (
              <p className="error" role="alert">
                {dishForm.error}
              </p>
            )}
          </>
        ) : (quick && module === 'other') || (!!state.item && !foodTab) ? (
          <>
            <textarea
              ref={titleRef}
              className="qf-title"
              rows={1}
              onKeyDown={titleKey}
              maxLength={bdayOn ? 60 : 300}
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                setSuggestOff(false);
              }}
              placeholder={bdayOn ? 'тема вітання' : 'назва події'}
              aria-label={bdayOn ? 'Імʼя' : 'Назва'}
              autoComplete="off"
            />
            {!bdayOn && suggestionList}
            <div className="qf-grid">
              <span className="qf-k">день</span>
              <span className="qf-v">
                <DateProp
                  value={bdayOn ? bdayDate : date}
                  onChange={(v) => (bdayOn ? setBdayDate(v) : setDate(v))}
                  placeholder="оберіть день"
                  label="День"
                />
              </span>
              <span />
              <label className={'qf-check' + (bdayOn ? ' locked' : '')}>
                <input type="checkbox" checked={bdayOn || allDay} disabled={bdayOn} onChange={(e) => setAllDay(e.target.checked)} />
                <span className="qf-box" aria-hidden="true">
                  <Icon d={ICONS.check} size={10} />
                </span>
                весь день
              </label>
              {!bdayOn && !allDay && (
                <>
                  <span className="qf-k">час</span>
                  <span className="qf-v">
                    <TimeSelect value={start} onChange={changeStart} label="Початок" />
                    <span className="qf-arrow" aria-hidden="true">→</span>
                    <TimeSelect value={end} onChange={setEnd} label="Кінець" />
                    {durLabel(start, end) && <span className="qf-dur">{durLabel(start, end)}</span>}
                  </span>
                </>
              )}
              {bdayOn && (
                <>
                  <span className="qf-k">рік народження</span>
                  <span className="qf-v">
                    <input
                      className="qf-prop qf-year"
                      inputMode="numeric"
                      maxLength={4}
                      value={bYear}
                      onChange={(e) => setBYear(e.target.value.replace(/\D/g, ''))}
                      placeholder="необовʼязково"
                      aria-label="Рік народження"
                    />
                  </span>
                </>
              )}
              {!(occ && scope === 'one' && !bdayOn) && (
              <>
              <span className="qf-k">повторення</span>
              <span className="qf-v">
                {bdayOn ? (
                  <span className="qf-prop qf-static">щороку</span>
                ) : (
                  <select className={'qf-prop qf-select' + (repeatKind === 'none' ? ' empty' : '')} value={repeatKind} onChange={(e) => setRepeatKind(e.target.value)} aria-label="Повторення">
                    <option value="none">не повторюється</option>
                    {baseRepeat && !isSimple(baseRepeat) && <option value="keep">{describeRepeat({ ...baseRepeat, until: undefined })}</option>}
                    <option value="daily">щодня</option>
                    <option value="weekly">щотижня</option>
                    <option value="monthly">щомісяця</option>
                    <option value="yearly">щороку</option>
                  </select>
                )}
              </span>
              </>
              )}
              {!bdayOn && repeatKind !== 'none' && !(occ && scope === 'one') && (
                <>
                  <span className="qf-k">до</span>
                  <span className="qf-v">
                    <DateProp value={until} onChange={setUntil} placeholder="без кінця" label="Повторювати до" />
                    {until && (
                      <button type="button" className="x20" aria-label="Прибрати кінець повторів" onClick={() => setUntil('')}>
                        <Icon d={ICONS.close} size={8} />
                      </button>
                    )}
                  </span>
                </>
              )}
              <span className="qf-k">нотатка</span>
              <span className="qf-v">
                {noteOpen ? (
                  <textarea
                    className="qf-prop qf-note"
                    rows={2}
                    value={note}
                    autoFocus={!base.note}
                    onChange={(e) => setNote(e.target.value)}
                    onBlur={() => !note.trim() && setNoteOpen(false)}
                    aria-label="Нотатка"
                  />
                ) : (
                  <button type="button" className="qf-prop empty" onClick={() => setNoteOpen(true)}>
                    додати нотатку
                  </button>
                )}
              </span>
            </div>
            {!bdayOn && occ && (
              <p className="qf-hint">
                {scope === 'one' ? 'Зміниться лише ця подія, інші повтори лишаться як були.' : scope === 'following' ? 'Зміняться ця й наступні події, попередні лишаться як були.' : 'Зміняться всі повтори цієї події.'}
              </p>
            )}
            {state.item?.repeat && (!occ || bdayOn) && <p className="qf-hint">Зміни застосуються до всіх повторів цієї події.</p>}
          </>
        ) : isTask ? (
          <>
            <label className="field">
              <span>задача</span>
              <input
                ref={titleRef}
                maxLength={300}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Наприклад, подзвонити в банк"
                autoComplete="off"
              />
            </label>
            <div className="field">
              <span>
                день <span className="field-opt">необовʼязково</span>
              </span>
              <div className="field-x">
                <input type="date" value={taskDue} onChange={(e) => setTaskDue(e.target.value)} aria-label="День задачі" />
                {taskDue && (
                  <button type="button" className="x20" aria-label="Прибрати день" onClick={() => setTaskDue('')}>
                    <Icon d={ICONS.close} size={8} />
                  </button>
                )}
              </div>
            </div>
            {events && (
              <div className="field">
                <span>
                  подія <span className="field-opt">необовʼязково</span>
                </span>
                <EventPicker options={events.options} items={events.items} value={taskEvent} onChange={setTaskEvent} />
              </div>
            )}
          </>
        ) : undatedOn ? (
          <>
            <label className="field">
              <span>назва</span>
              <input
                ref={titleRef}
                maxLength={300}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Наприклад, купити подарунок мамі"
                autoComplete="off"
              />
            </label>
            {!isNew && moduleChips}
          </>
        ) : foodTab && isNew && foodPick ? (
          <div className="dish-pick">
            <DishSearch value={dishQ} onChange={setDishQ} />
            <div className="food-list">
              <DishAddBlock onClick={() => setFoodPick(false)} />
              {pickList.length === 0 && <p className="muted-text food-empty">Нічого не знайдено.</p>}
              {pickList.map((d) => (
                <DishRow key={d.id} dish={d} onClick={() => onPlaceDish(d, date, foodStart)} />
              ))}
            </div>
            <p className="hint small">Натисніть страву, щоб поставити її в календар.</p>
          </div>
        ) : foodTab ? (
          <>
            {isNew && dishes.length > 0 && (
              <button type="button" className="text-add back-to-list" onClick={() => setFoodPick(true)}>
                <Icon d={ICONS.prev} size={10} />
                Обрати з бібліотеки
              </button>
            )}
            {/* 26.11: картка страви в новому стилі; дата — рядок «день» серед полів */}
            <DishFormFields
              f={dishForm}
              rows={
                <QfRow k="день">
                  <DateProp value={date} onChange={setDate} label="День" />
                </QfRow>
              }
            />
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
          </>
        ) : hobbyTab ? (
          <HobbyFormFields f={hobbyForm} />
        ) : petTab ? (
          <PetFormFields f={petForm} />
        ) : fopTab && fopSetUp ? (
          <FopReminderFields f={fopRemind} />
        ) : fopTab ? (
          <div className="fop-tab">
            <FopFields
              value={fopValue}
              onChange={setFopValue}
              extraNote={hasFopDeadlines ? 'Дедлайни, поставлені раніше, оновляться за цими параметрами.' : undefined}
            />
          </div>
        ) : bdayOn ? (
          <>
            <div className="undated-line">
              <div className="switch-row">
                <span className="row-label">день народження</span>
                <Switch on={bday} onChange={setBday} label="день народження" />
              </div>
            </div>
            <label className="field">
              <span>імʼя</span>
              <input ref={titleRef} maxLength={60} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Наприклад, мама" autoComplete="off" />
            </label>
            <div className="row">
              <label className="field grow">
                <span>дата</span>
                <input type="date" value={bdayDate} onChange={(e) => setBdayDate(e.target.value)} />
              </label>
              <label className="field grow">
                <span>рік народження <span className="field-opt">необовʼязково</span></span>
                <input inputMode="numeric" maxLength={4} value={bYear} onChange={(e) => setBYear(e.target.value.replace(/\D/g, ''))} placeholder="1971" />
              </label>
            </div>
            <p className="hint small">Повторюється щороку. У календарі — стікер з імʼям{bYear.length === 4 ? ' і віком' : ''}.</p>
            <label className="field">
              <span>нотатка</span>
              <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
            </label>
          </>
        ) : (
          <>
            {module === 'other' && !isTask && (
              <div className="undated-line">
                <div className="switch-row">
                  <span className="row-label">день народження</span>
                  <Switch on={bday} onChange={(v) => { setBday(v); if (v && !bdayDate) setBdayDate(date); }} label="день народження" />
                </div>
              </div>
            )}
            <label className="field">
              <span>назва</span>
              <input
                ref={titleRef}
                maxLength={300}
                value={title}
                onChange={(e) => {
                  setTitle(e.target.value);
                  setSuggestOff(false);
                }}
                placeholder="Наприклад, зустріч з друзями"
                autoComplete="off"
              />
            </label>
            {suggestionList}


            {!isNew && moduleChips}

            <div className="row">
              <label className="field grow">
                <span>дата</span>
                <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              </label>
              <label className="check">
                <input type="checkbox" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} />
                весь день
              </label>
            </div>

            {!allDay && (
              <div className="row">
                <label className="field grow">
                  <span>початок</span>
                  <input type="time" value={start} onChange={(e) => changeStart(e.target.value)} />
                </label>
                <label className="field grow">
                  <span>кінець</span>
                  <input type="time" value={end} onChange={(e) => setEnd(e.target.value)} />
                </label>
              </div>
            )}

            {!(occ && scope === 'one') && (
            <div className="row">
              <label className="field grow">
                <span>повторення</span>
                <select value={repeatKind} onChange={(e) => setRepeatKind(e.target.value)}>
                  <option value="none">не повторюється</option>
                  {baseRepeat && !isSimple(baseRepeat) && <option value="keep">{describeRepeat({ ...baseRepeat, until: undefined })}</option>}
                  <option value="daily">щодня</option>
                  <option value="weekly">щотижня</option>
                  <option value="monthly">щомісяця</option>
                  <option value="yearly">щороку</option>
                </select>
              </label>
              {repeatKind !== 'none' && (
                <label className="field grow">
                  <span>до <span className="field-opt">необовʼязково</span></span>
                  <input type="date" value={until} onChange={(e) => setUntil(e.target.value)} />
                </label>
              )}
            </div>
            )}
            {occ && <p className="hint small">{scope === 'one' ? 'Зміниться лише ця подія, інші повтори лишаться як були.' : scope === 'following' ? 'Зміняться ця й наступні події, попередні лишаться як були.' : 'Зміняться всі повтори цієї події.'}</p>}
            {state.item?.repeat && !occ && <p className="hint small">Зміни застосуються до всіх повторів цієї події.</p>}

            <label className="field">
              <span>нотатка</span>
              <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
            </label>
          </>
        )}

        {error && (!foodTab || isTask || undatedOn) && (
          <p className="error" role="alert">
            {error}
          </p>
        )}

        <div className="actions">
          {state.item &&
            !dishHeadDelete &&
            (confirmDelete ? (
              <button type="button" className="btn danger" onClick={() => onDelete(state.item!.id, occ ? (bdayOn ? 'all' : scope) : undefined)}>
                Видалити остаточно
              </button>
            ) : (
              <button type="button" className="text-danger" onClick={() => setConfirmDelete(true)}>
                {occ && !bdayOn ? (scope === 'one' ? 'Видалити лише цю' : scope === 'following' ? 'Видалити цю й наступні' : 'Видалити всі повтори') : 'Видалити'}
              </button>
            ))}
          <span className="spacer" />
          <button type="button" className="btn secondary" onClick={onClose}>
            Скасувати
          </button>
          {(isTask || undatedOn || !!quick || !(foodTab && isNew && foodPick)) && (
            <button type="submit" className="btn primary" disabled={foodTab && dishForm.busy}>
              Зберегти
            </button>
          )}
        </div>
      </form>
    </div>
  );
}

/** Капсула типу вгорі швидкого вікна (23.11): плитка з іконкою, назва, стрілка; натискання — список типів */
function TypeSelect({ value, types, onChange, locked }: { value: QuickType; types: QuickType[]; onChange: (t: QuickType) => void; locked?: boolean }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const off = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', off);
    return () => document.removeEventListener('mousedown', off);
  }, [open]);
  const cur = quickTypeMeta(value);
  const list = QUICK_TYPE_ORDER.filter((t) => types.includes(t));
  // страва з бібліотеки (23.11): тип не змінюється — капсула без стрілки й списку
  if (locked)
    return (
      <span className="qf-type locked">
        <span className="qf-tile sm" style={{ background: cur.bg, color: cur.fg }}>
          <Icon d={cur.icon} size={11} />
        </span>
        {cur.label}
      </span>
    );
  return (
    <div className="qf-type-wrap" ref={ref}>
      <button type="button" className={'qf-type' + (open ? ' open' : '')} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <span className="qf-tile sm" style={{ background: cur.bg, color: cur.fg }}>
          <Icon d={cur.icon} size={11} />
        </span>
        {cur.label}
        <Icon d={ICONS.down} size={12} className="qf-chev" />
      </button>
      {open && (
        <div className="qf-menu" role="menu" aria-label="Тип">
          {list.map((t) => {
            const m = quickTypeMeta(t);
            const on = t === value;
            return (
              <button
                type="button"
                role="menuitemradio"
                aria-checked={on}
                key={t}
                className={'qf-menu-row' + (on ? ' on' : '')}
                onClick={() => {
                  setOpen(false);
                  if (!on) onChange(t);
                }}
              >
                <span className="qf-tile" style={{ background: m.bg, color: m.fg }}>
                  <Icon d={m.icon} size={13} />
                </span>
                {m.label}
                {on && <Icon d={ICONS.check} size={14} className="qf-menu-check" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

