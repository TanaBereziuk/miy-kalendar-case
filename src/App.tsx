import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  MODULES,
  MODULE_ORDER,
  type CalendarItem,
  type ModuleId,
  type NewItem,
  type NewTask,
  type Task,
} from "./types";
import {
  DAYS_FULL,
  MONTHS_GEN,
  weekdayIndex,
  addDays,
  fromISO,
  fromMinutes,
  startOfWeek,
  toISO,
  toMinutes,
  weekDays,
} from "./lib/dates";
import { useItems } from "./lib/store";
import { useAuth, signOut } from "./lib/auth";
import { useMedia } from "./lib/useMedia";
import { WeekView } from "./components/WeekView";
import { TodayView } from "./components/TodayView";
import { ItemDialog, type DialogState } from "./components/ItemDialog";
import { QuickPicker } from "./components/QuickPicker";
import { QuickOnboarding } from "./components/QuickOnboarding";
import { QUICK_TYPE_ORDER, type QuickType } from "./components/QuickAdd";
import { EventView, type Anchor } from "./components/EventView";
import { GROUPS, HOUR_PX } from "./lib/layout";
import { ICONS, Icon } from "./components/Icon";
import { useProfile } from "./lib/profile";
import { expandForDays } from "./lib/repeat";
import { deleteOccurrence, editOccurrence, splitOccurrenceId, toNew, type Scope, type SeriesOps } from "./lib/series";
import { Onboarding } from "./onboarding/Onboarding";
import { generateItems } from "./onboarding/generate";
import { newPet, withDefaults, type Answers, type ModKey } from "./onboarding/answers";
import { fopDeadlines } from "./onboarding/fop";
import {
  MEAL_CATS,
  MEAL_MIN,
  useDishes,
  type Dish,
  type NewDish,
  dishSource,
  isPeriod,
  type DishPlace,
  dishIdOf,
} from "./food/dishes";
import { FoodPanel, FoodHeadActions } from "./food/FoodPanel";
import { DishDialog, DishPanelForm } from "./food/DishDialog";
import { AssistantPanel } from "./assistant/AssistantPanel";
import { MonthPicker } from "./components/MonthPicker";
import { SEARCH_ICON, SearchPanel } from "./components/SearchPanel";
import { occursOn } from "./lib/repeat";
import { isGoogle, useGoogleLayer } from "./lib/google";
import { GoogleLayerDialog } from "./components/GoogleLayerDialog";
import { useAssistant } from "./assistant/useAssistant";
import { isVisibleTask, toNewTask, useTasks } from "./lib/tasks";
import { Checklist, TaskList } from "./components/Tasks";
import { HistoryList, LeftPanel, PanelHead, ReminderList, TodayList, type LeftTab } from "./components/LeftPanel";
import { canBeDone, doneKey, nextAfter, todayEvents, todayTasks } from "./lib/today";
import { useLeaving } from "./lib/useLeaving";
import type { DoneEntry } from "./onboarding/answers";

/** Заняття «N разів на тиждень», які ще треба поставити на цьому тижні */
export interface PendingAct {
  name: string;
  done: number;
  total: number;
  dur: number;
}

const NIGHT_KEY = "miy-kalendar:show-night";
const COLLAPSED_KEY = "miy-kalendar:collapsed-groups";
type SidePanel = "chat" | "food" | "tasks" | null;
const SIDE_KEY = "miy-kalendar:side-panel";
const LEFT_KEY = "miy-kalendar:left-panel";
// старі ключі (до 12:19) — лише щоб відкрити ту саму панель, що й раніше
const ASST_TAB_KEY = "miy-kalendar:assistant-tab";
const ASST_KEY = "miy-kalendar:assistant-collapsed";

function readSet(key: string): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(key) ?? "[]"));
  } catch {
    return new Set();
  }
}

export default function App() {
  const auth = useAuth();
  return (
    <Calendar
      userId={auth.session.user.id}
      email={auth.session.user.email ?? ""}
    />
  );
}

function Calendar({ userId, email }: { userId: string; email: string }) {
  const {
    items,
    sync,
    rejected,
    dismissRejected,
    migrated,
    add,
    update,
    remove,
    replaceGenerated,
    reload,
  } = useItems(userId);
  const profile = useProfile(userId);
  // Задачі (етап 1, 18.11)
  const {
    tasks,
    sync: taskSync,
    rejected: taskRejected,
    dismissRejected: dismissTaskRejected,
    addTask,
    updateTask,
    removeTask,
    reload: reloadTasks,
  } = useTasks(userId);
  const tasksOn = taskSync !== "missing";
  const [onbOpen, setOnbOpen] = useState(false);
  const isPhone = useMedia("(max-width: 760px)");
  const [day, setDay] = useState(() => new Date());
  const [showNight, setShowNightState] = useState(
    () => localStorage.getItem(NIGHT_KEY) === "1",
  );
  const [collapsed, setCollapsed] = useState<Set<string>>(() =>
    readSet(COLLAPSED_KEY),
  );
  const [dialog, setDialog] = useState<DialogState | null>(null);
  // Харчування (14.11)
  const [dishDlg, setDishDlg] = useState<{
    dish?: Dish;
    then?: (id: string, d: NewDish) => void;
  } | null>(null);
  // Асистент (16.11, 11:56): на ноутбуці завжди відкритий справа, згортається вправо (стан запамʼятовується);
  // на телефоні відкривається кнопкою біля «+» вікном знизу
  // Бічне меню (16.11, 12:19) — як у Google Календарі: праворуч вузька смуга з іконками «Асистент» і «Страви»;
  // натискання відкриває панель поруч, повторне — закриває. Відкрита панель запамʼятовується.
  const [side, setSideState] = useState<SidePanel>(() => {
    const v = localStorage.getItem(SIDE_KEY);
    if (v === "chat" || v === "food") return v;
    if (v === "tasks") return null;
    if (v === "none" || localStorage.getItem(ASST_KEY) === "1") return null;
    if (localStorage.getItem(ASST_KEY) === "0")
      return localStorage.getItem(ASST_TAB_KEY) === "food" ? "food" : "chat";
    return window.innerWidth < 1200 ? null : "chat";
  });
  const [asstFocus, setAsstFocus] = useState(0);
  // телефон: асистент відкривається кнопкою біля «+» вікном знизу
  const [asstPhoneOpen, setAsstPhoneOpen] = useState(false);
  // телефон: задачі (етап 1, 18.11) — кнопкою поруч з асистентом, вікном знизу
  const [tasksPhoneOpen, setTasksPhoneOpen] = useState(false);
  // Ліва панель (етап 2, 21.11; 25.11 — «задачі» з нагадуваннями вгорі і «історія»); стан — localStorage
  // ('tasks' | 'history' | 'none'; збережене раніше 'today' стає 'tasks')
  const [left, setLeftState] = useState<LeftTab | null>(() => {
    const v = localStorage.getItem(LEFT_KEY);
    return v === "history" ? "history" : v === "none" ? null : "tasks";
  });
  const [leftLast, setLeftLast] = useState<LeftTab>(() => left ?? "tasks");
  const setLeft = (v: LeftTab | null) => {
    setLeftState(v);
    if (v) setLeftLast(v);
    localStorage.setItem(LEFT_KEY, v ?? "none");
  };
  const [phoneTab, setPhoneTab] = useState<"tasks" | "history">("tasks");
  const [phoneTodayOpen, setPhoneTodayOpen] = useState(() => localStorage.getItem(LEFT_KEY + ":phone") !== "closed");
  const setSide = (v: SidePanel) => {
    setSideState(v);
    localStorage.setItem(SIDE_KEY, v ?? "none");
    if (v === "chat") setAsstFocus((n) => n + 1);
  };
  const toggleSide = (v: Exclude<SidePanel, null>) =>
    setSide(side === v ? null : v);
  // Шапка календаря — на всю ширину; бічне меню й панель починаються на рівні сітки тижня, під шапкою (12:25).
  // Їхня верхня межа (--side-top) іде за низом шапки, поки сторінку прокручують, і зупиняється біля верху екрана.
  const headRef = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    if (isPhone) return;
    let raf = 0;
    const update = () => {
      raf = 0;
      const el = headRef.current;
      if (!el) return;
      const top = Math.max(
        16,
        Math.round(el.getBoundingClientRect().bottom + 16),
      );
      document.documentElement.style.setProperty("--side-top", top + "px");
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    document.fonts?.ready.then(update);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  });

  const monday = startOfWeek(day);
  const days = weekDays(monday);
  const sunday = days[6];

  // Заголовок — дати тижня: «16–22 листопада» (або «30 листопада – 6 грудня»)
  const weekRange =
    monday.getMonth() === sunday.getMonth()
      ? `${monday.getDate()}–${sunday.getDate()} ${MONTHS_GEN[sunday.getMonth()]}`
      : `${monday.getDate()} ${MONTHS_GEN[monday.getMonth()]} – ${sunday.getDate()} ${MONTHS_GEN[sunday.getMonth()]}`;
  const thisWeek = toISO(startOfWeek(new Date())) === toISO(monday);
  // Телефон (18.11, аудит, п. 8): у шапці — день («сьогодні» або день тижня) і дата; дати тижня — у смузі днів
  const isTodayShown = toISO(day) === toISO(new Date());
  const phoneTitle = isTodayShown ? "сьогодні" : DAYS_FULL[weekdayIndex(day)];

  const setShowNight = (v: boolean) => {
    setShowNightState(v);
    localStorage.setItem(NIGHT_KEY, v ? "1" : "0");
  };
  const toggleGroup = (id: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      localStorage.setItem(COLLAPSED_KEY, JSON.stringify([...next]));
      return next;
    });
  };

  // Клік по події (16.11): спершу короткий перегляд, змінити — бічна панель
  // occ — дата показу, на який натиснули (для повторюваної події item — уся серія)
  const [view, setView] = useState<{ item: CalendarItem; occ?: string; anchor?: Anchor } | null>(null);
  const lastClick = useRef<Anchor | undefined>(undefined);
  // Перехід до дати, пошук і перелік клавіш (18.11, аудит, п. 7, 10, 12)
  const [pickerOpen, setPickerOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [googleOpen, setGoogleOpen] = useState(false);
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const el = (e.target as Element | null)?.closest?.("button, .event, .row-item");
      const r = el?.getBoundingClientRect();
      lastClick.current = r ? { left: r.left, right: r.right, top: r.top, bottom: r.bottom } : undefined;
      // Клік по порожньому місцю тижня (18.11): вікно швидкого додавання стає біля години, на яку натиснули
      const col = !el ? (e.target as Element | null)?.closest?.(".day-col") : null;
      if (col) {
        const c = col.getBoundingClientRect();
        const top = c.top + Math.floor((e.clientY - c.top) / HOUR_PX) * HOUR_PX;
        lastClick.current = { left: c.left, right: c.right, top, bottom: top + HOUR_PX };
      }
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);
  const openItem = useCallback(
    (item: CalendarItem) =>
      setView({
        item: item.seriesId
          ? (items.find((i) => i.id === item.seriesId) ?? item)
          : item,
        occ: item.seriesId ? item.date : undefined,
        anchor: lastClick.current,
      }),
    [items],
  );
  // Нова подія вручну («+» і клік по порожньому місцю) — вікно з табами модулів
  const create = useCallback(
    (
      date: string,
      start?: string,
      extra?: Partial<NewItem> & { dur?: number },
    ) => {
      // 23.11: «+» відкриває ту саму форму, що й швидке вікно (капсула типу, поля «підпис — значення»), але бічною панеллю
      const { dur: d0, ...rest } = extra ?? {};
      const dur = d0 ?? 60;
      const draft: Partial<NewItem> = start
        ? { date, allDay: false, start, end: fromMinutes(toMinutes(start) + dur), ...rest }
        : { date, allDay: true, ...rest };
      setDialog({ draft: { ...draft, module: rest.module ?? "other" }, quick: { draft, type: rest.module ?? "other", panel: true } });
    },
    [],
  );
  const close = useCallback(() => setDialog(null), []);
  const hideCell = useCallback((v: boolean) => setDialog((d) => (d && !!d.hideCell !== v ? { ...d, hideCell: v } : d)), []);

  // Швидке додавання з клітинки (18.11, після аудиту): одразу компактне вікно поруч із клітинкою —
  // «нова подія» з назвою й типами (інша подія, страва, заняття, улюбленець, ФОП); клітинка виділена, поки вікно відкрите
  const quickDraft = dialog?.quick && !dialog.hideCell && !dialog.quick.panel ? dialog.quick.draft : undefined;
  const cellSel = quickDraft?.date
    ? {
        date: quickDraft.date,
        start: quickDraft.allDay ? undefined : quickDraft.start,
        end: quickDraft.allDay ? undefined : quickDraft.end,
        // «інша подія» — чорна, тож виділення лишається сірим
        module: dialog?.draft?.module === "other" ? undefined : dialog?.draft?.module,
      }
    : null;
  /** end — якщо діапазон протягнули мишею (18.11) */
  const createQuick = useCallback((date: string, start?: string, end?: string) => {
    const draft: Partial<NewItem> = start
      ? { date, allDay: false, start, end: end ?? fromMinutes(toMinutes(start) + 60) }
      : { date, allDay: true };
    setDialog({ draft: { ...draft, module: "other" }, quick: { anchor: lastClick.current, draft } });
  }, []);
  // Форма у два кроки (23.11): тип з переліку (крок 1) або з капсули вгорі вікна (крок 2) — вікно перебудовується
  // з тими самими днем, часом і назвою; «задача» ховає виділену клітинку
  const setQuickType = useCallback((t: QuickType, title?: string) => {
    setDialog((d) =>
      d?.quick
        ? {
            ...d,
            draft: { ...d.draft, module: t === "task" || t === "bday" ? "other" : t, title: title ?? d.draft?.title },
            quick: { ...d.quick, type: t },
            hideCell: t === "task",
          }
        : d,
    );
  }, []);

  // Повідомлення внизу з «Скасувати» на 5 секунд (16.11 — видалення; 18.11 — ще й перенесення, зміни й нові події).
  // Кожна дія записує зворотні кроки, тож «Скасувати» (і Ctrl+Z) повертає все, що вона змінила.
  const [snack, setSnack] = useState<{ text: string; undo: () => void } | null>(null);
  const snackTimer = useRef<number | undefined>(undefined);
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const showSnack = (text: string, undo: () => void) => {
    window.clearTimeout(snackTimer.current);
    setSnack({ text, undo });
    snackTimer.current = window.setTimeout(() => setSnack(null), 5000);
  };
  /** Виконує зміни подій і показує повідомлення з «Скасувати», що повертає їх назад */
  const runTx = (text: string, fn: (tx: { add: (d: NewItem) => string; update: (id: string, d: NewItem) => void; remove: (id: string) => void }) => void) => {
    const undo: (() => void)[] = [];
    const before = new Map(itemsRef.current.map((i) => [i.id, i]));
    fn({
      add: (d) => {
        const id = add(d);
        undo.push(() => remove(id));
        return id;
      },
      update: (id, d) => {
        const old = before.get(id);
        update(id, d);
        if (old) undo.push(() => update(id, toNew(old)));
      },
      remove: (id) => {
        const old = before.get(id);
        remove(id);
        if (old) undo.push(() => add(toNew(old), id));
      },
    });
    if (text && undo.length)
      showSnack(text, () => {
        undo.reverse().forEach((u) => u());
        window.clearTimeout(snackTimer.current);
        setSnack(null);
      });
  };
  const applyOps = (text: string, ops: SeriesOps) =>
    runTx(text, (tx) => {
      ops.update.forEach((u) => tx.update(u.id, u.data));
      ops.remove.forEach((id) => tx.remove(id));
      ops.add.forEach((d) => tx.add(d));
    });
  const deleteWithUndo = (item: CalendarItem, occ?: string, scope: Scope = "all") => {
    const series = item.seriesId ? (items.find((i) => i.id === item.seriesId) ?? item) : item;
    if (series.repeat && occ) applyOps(scope === "one" ? "Подію видалено" : "Події видалено", deleteOccurrence(series, occ, scope));
    else runTx("Подію видалено", (tx) => tx.remove(series.id));
  };

  const closePhoneAsst = useCallback(() => setAsstPhoneOpen(false), []);

  const save = (data: NewItem, id?: string, scope?: Scope) => {
    // «Зробити подією» (18.11): подію додано — задачу прибираємо; «Скасувати» повертає все як було
    const fromTask = dialog?.fromTask ? tasks.find((t) => t.id === dialog.fromTask) : undefined;
    if (fromTask && !id) {
      const newId = add(data);
      removeTask(fromTask.id);
      snackUndo("Задачу зроблено подією", () => {
        remove(newId);
        addTask(toNewTask(fromTask), fromTask.id);
      });
      setDialog(null);
      return;
    }
    const series = id ? items.find((i) => i.id === id) : undefined;
    const occ = dialog?.occ;
    if (series?.repeat && occ && scope) applyOps("Зміни збережено", editOccurrence(series, occ, data, scope));
    else if (id) runTx(series?.undated && !data.undated ? "Справу поставлено в календар" : "Зміни збережено", (tx) => tx.update(id, data));
    else runTx(data.undated ? "Справу додано в рядок «цього тижня»" : "Подію додано", (tx) => void tx.add(data));
    setDialog(null);
  };

  const shift = (n: number) => setDay((d) => addDays(d, n));
  const step = isPhone ? 1 : 7;

  // Клавіші на ноутбуці (18.11, аудит, п. 10) — як у Google Календарі; за фізичною клавішею (e.code),
  // тож працюють і з українською розкладкою. Поки друкуєте в полі — не спрацьовують.
  const keysRef = useRef<(e: KeyboardEvent) => void>(() => {});
  keysRef.current = (e: KeyboardEvent) => {
    const t = e.target as HTMLElement | null;
    if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
    if ((e.ctrlKey || e.metaKey) && e.code === "KeyZ") {
      if (snack) {
        e.preventDefault();
        snack.undo();
      }
      return;
    }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    // коли відкрито якесь вікно, працюють лише Esc (у самих вікнах), Delete (у перегляді події) і Z
    if (helpOpen && e.key === "Escape") return setHelpOpen(false);
    const busy = !!dialog || pickerOpen || searchOpen || helpOpen || googleOpen;
    if (e.code === "KeyZ" && !busy && snack) return snack.undo();
    if (busy || view) return;
    if (e.key === "?") return setHelpOpen(true);
    switch (e.code) {
      case "KeyC":
      case "KeyN":
        e.preventDefault();
        return create(toISO(isPhone ? day : thisWeek ? new Date() : monday), "09:00");
      case "KeyT":
        return setDay(new Date());
      case "ArrowLeft":
      case "KeyK":
        return shift(-step);
      case "ArrowRight":
      case "KeyJ":
        return shift(step);
      case "KeyG":
        return setPickerOpen(true);
      case "Slash":
        e.preventDefault();
        return setSearchOpen(true);
    }
  };
  useEffect(() => {
    const on = (e: KeyboardEvent) => keysRef.current(e);
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  }, []);

  const answers =
    profile.state.status === "ready" ? profile.state.answers : null;
  const enabled = (m: ModuleId) =>
    m === "other" || !answers || answers.modules[m];
  // Крок онбордингу модуля пропускали — у швидкому вікні спершу його питання (23.11)
  const qt = dialog?.quick?.type;
  const quickOnb: ModKey | null =
    answers && dialog?.quick && !dialog.quick.onbDone && (qt === "food" || qt === "fop" || qt === "hobby" || qt === "pet") && answers.skipped[qt] ? qt : null;
  // Що можна створити з клітинки (23.11): увімкнені модулі, «вітання», «задача» (якщо є таблиця задач) і «інша подія»
  const quickTypes = QUICK_TYPE_ORDER.filter((t) => (t === "bday" || t === "other" ? true : t === "task" ? tasksOn : enabled(t)));

  // Справи без дати (етап 1, 18.11) лежать у «цього тижня», а не в сітці, пошуку й міні-календарі
  const datedItems = useMemo(() => items.filter((i) => !i.undated), [items]);
  // Події тижня: лише увімкнені модулі, повторювані розгорнуто на дні
  const weekItems = useMemo(
    () =>
      expandForDays(
        datedItems.filter((i) => enabled(i.module)),
        days,
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [datedItems, answers, toISO(monday)],
  );

  // Шар Google Календаря (18.11, аудит, п. 17): лише перегляд, пунктиром поверх своїх справ
  const google = useGoogleLayer(
    answers?.google.icalUrl,
    !!answers?.google.icalUrl && answers.google.show !== false,
    toISO(monday),
    toISO(sunday),
  );
  const shownItems = useMemo(() => [...weekItems, ...google.items], [weekItems, google.items]);
  const saveGoogle = (url: string | undefined, show: boolean) => {
    if (answers) void profile.save({ ...answers, google: { ...answers.google, wanted: !!url || answers.google.wanted, icalUrl: url, show } }, false);
    setGoogleOpen(false);
  };

  // ---------- Харчування: бібліотека страв і планування (14.11) ----------
  const foodOn = enabled("food");
  const {
    dishes,
    sync: dishSync,
    rejected: dishRejected,
    dismissRejected: dismissDishRejected,
    addDish,
    updateDish,
    removeDish,
    reload: reloadDishes,
  } = useDishes(userId, answers?.food.dishes ?? []);
  const sideShown: SidePanel = isPhone
    ? null
    : side === "food" && !foodOn
      ? null
      : side;

  // Анімація закриття (23.11): праве меню й вікно події ще 0.2 с лишаються на екрані з позначкою «закривається»
  const [sideContent, sideClosing] = useLeaving(sideShown);
  const [dlg, dlgClosing] = useLeaving(dialog);

  // Картка страви з бічної панелі «страви» відкривається всередині панелі поверх бібліотеки
  const dishInPanel = !isPhone && sideShown === "food" && !!dishDlg;

  // Кінець страви: на весь період (етап 4, 23.11) — до кінця групи, у якій початок; інакше — MEAL_MIN
  const dishEnd = (at: string, slot?: DishPlace) => {
    const m = toMinutes(at);
    const g = slot === "period" ? GROUPS.find((x) => m >= x.from * 60 && m < x.to * 60) : undefined;
    return fromMinutes(Math.min(g ? g.to * 60 : m + MEAL_MIN, 24 * 60 - 1));
  };
  const placeDish = (dish: Dish, date: string, start?: string, slot?: DishPlace) => {
    const at =
      start ?? MEAL_CATS.find((c) => c.v === dish.category)?.start ?? "13:00";
    const base: NewItem = {
      title: dish.name,
      module: "food",
      date,
      allDay: false,
      start: at,
      end: dishEnd(at, slot),
      source: dishSource(dish.id, slot),
    };
    runTx("Страву додано", (tx) => {
      tx.add(base);
      // «на 2 дні» — залишки займають той самий час наступного дня
      if (dish.tags.includes("на 2 дні"))
        tx.add({
          ...base,
          title: `${dish.name} (залишки)`,
          date: toISO(addDays(fromISO(date), 1)),
        });
    });
  };
  // slot (16.11, 17:18): поклали в смугу групи без точного часу / у сітку годин — знімаємо позначку.
  // 18.11: перетягуються всі події; показ повторюваної — переносимо лише цю подію (з «Скасувати»).
  // start = '' — подію поклали в рядок «весь день».
  // slot = 'period' (етап 4, 23.11) — страву поклали на весь період: від початку до кінця групи.
  const moveItem = (id: string, date: string, start: string, slot?: DishPlace) => {
    const occ = splitOccurrenceId(id);
    const it = items.find((i) => i.id === (occ ? occ.seriesId : id));
    if (!it) return;
    const fromDate = occ ? occ.date : it.date;
    const base = toNew(it);
    let next: NewItem;
    if (!start) {
      if (it.allDay && fromDate === date && !it.undated) return;
      next = { ...base, date, allDay: true, start: undefined, end: undefined };
    } else {
      const isDish = !!base.source?.startsWith("dish:");
      // страва з періоду в годину чи смугу — знову звичайна тривалість
      const dur = isPeriod(it.source) ? MEAL_MIN : !it.allDay && it.start && it.end ? toMinutes(it.end) - toMinutes(it.start) : it.module === "food" ? MEAL_MIN : 60;
      next = {
        ...base,
        date,
        allDay: false,
        start,
        end: isDish && slot === "period" ? dishEnd(start, slot) : fromMinutes(Math.min(toMinutes(start) + dur, 24 * 60 - 1)),
        source: isDish ? dishSource(dishIdOf(base.source)!, slot) : base.source,
      };
      if (!it.allDay && fromDate === date && it.start === start && (it.source === next.source)) return;
    }
    // справу без дати (етап 1, 18.11) перетягнули з «цього тижня» — вона стає звичайною подією
    if (it.undated) return runTx("Справу поставлено в календар", (tx) => tx.update(it.id, { ...next, undated: false }));
    if (occ && it.repeat) applyOps("Перенесено лише цю подію", editOccurrence(it, occ.date, { ...next, repeat: undefined }, "one"));
    else runTx("Подію перенесено", (tx) => tx.update(it.id, next));
  };
  // Зміна тривалості нижнім краєм події (18.11)
  const resizeItem = (id: string, end: string) => {
    const occ = splitOccurrenceId(id);
    const it = items.find((i) => i.id === (occ ? occ.seriesId : id));
    if (!it || it.allDay || !it.start || it.end === end) return;
    const next = { ...toNew(it), end };
    if (occ && it.repeat) applyOps("Змінено лише цю подію", editOccurrence(it, occ.date, { ...next, date: occ.date, repeat: undefined }, "one"));
    else runTx("Тривалість змінено", (tx) => tx.update(it.id, next));
  };
  const isFoodPlan = (i: CalendarItem) => i.module === "food" && !i.repeat;
  const inRange = (i: CalendarItem, from: Date) =>
    i.date >= toISO(from) && i.date <= toISO(addDays(from, 6));
  const weekFood = items.filter((i) => isFoodPlan(i) && inRange(i, monday));
  const prevFood = items.filter(
    (i) => isFoodPlan(i) && inRange(i, addDays(monday, -7)),
  );
  const copyLastWeek = () => {
    for (const i of prevFood) {
      const date = toISO(addDays(fromISO(i.date), 7));
      if (
        weekFood.some(
          (w) => w.date === date && w.start === i.start && w.title === i.title,
        )
      )
        continue;
      const {
        id: _id,
        createdAt: _c,
        updatedAt: _u,
        seriesId: _s,
        ...rest
      } = i;
      add({ ...rest, date });
    }
  };
  const clearWeek = () => weekFood.forEach((i) => remove(i.id));
  // «Дублювати на наступний тиждень» (23.11): страви показаного тижня — на ті самі дні й час через 7 днів;
  // однакові (день, час, назва) не повторюємо; з «Скасувати»
  const nextFood = items.filter((i) => isFoodPlan(i) && inRange(i, addDays(monday, 7)));
  const copyToNextWeek = () =>
    runTx("Страви продубльовано на наступний тиждень", (tx) => {
      for (const i of weekFood) {
        const date = toISO(addDays(fromISO(i.date), 7));
        if (nextFood.some((w) => w.date === date && w.start === i.start && w.title === i.title)) continue;
        const { id: _id, createdAt: _c, updatedAt: _u, seriesId: _s, ...rest } = i;
        tx.add({ ...rest, date });
      }
    });
  const saveDish = (d: NewDish, id?: string) => {
    const then = dishDlg?.then;
    if (id) updateDish(id, d);
    else {
      const newId = addDish(d);
      then?.(newId, d);
    }
    setDishDlg(null);
  };

  // Тварини для вкладки «улюбленець» у вікні події: усі з налаштувань; без імені — «Тварина N» / «Улюбленець»
  const dialogPets = useMemo(() => {
    const list = answers?.modules.pet ? (answers.pet.pets ?? []) : [];
    return list.map((p, i) => p.name.trim() || (list.length > 1 ? `Тварина ${i + 1}` : "Улюбленець"));
  }, [answers]);

  // ---------- Асистент ----------
  const petNames = useMemo(
    () =>
      answers?.modules.pet
        ? (answers.pet.pets ?? []).map((p) => p.name).filter(Boolean)
        : [],
    [answers],
  );
  const assistant = useAssistant(
    { items, add, update, remove, addTask: tasksOn ? addTask : undefined, removeTask },
    { dishes, petNames },
  );
  const visibleDays = new Set(isPhone ? [toISO(day)] : days.map(toISO));
  const sendToAssistant = (text: string) => {
    const first = assistant.send(text, {});
    // додане поза видимим тижнем (днем на телефоні) — показуємо його
    if (first && !visibleDays.has(first)) setDay(fromISO(first));
  };

  const pending: PendingAct[] = useMemo(() => {
    if (!answers || !answers.modules.hobby || answers.skipped.hobby) return [];
    return answers.hobby.acts
      .filter((a) => a.mode === "n" && a.name.trim())
      .map((a) => ({
        name: a.name.trim(),
        total: a.n,
        dur: a.dur,
        done: weekItems.filter(
          (i) =>
            i.module === "hobby" &&
            i.title.trim().toLowerCase() === a.name.trim().toLowerCase(),
        ).length,
      }))
      .filter((p) => p.done < p.total);
  }, [answers, weekItems]);

  const planAct = (p: PendingAct) =>
    create(toISO(isPhone ? day : thisWeek ? new Date() : monday), "18:00", {
      title: p.name,
      module: "hobby",
      dur: p.dur,
    });

  // ---------- Етап 1 (18.11): справи без дати й задачі ----------
  const todayISO = toISO(new Date());
  // Справи без дати видно в «цього тижня» поточного й наступних тижнів; непоставлені переходять далі самі
  const undatedList = useMemo(
    () =>
      toISO(sunday) >= toISO(startOfWeek(new Date()))
        ? items.filter((i) => i.undated && enabled(i.module)).sort((a, b) => a.createdAt.localeCompare(b.createdAt))
        : [],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [items, answers, toISO(sunday)],
  );
  /** День, на який ставимо справу з «цього тижня» натисканням */
  const planDay = toISO(isPhone ? day : thisWeek ? new Date() : monday);
  const openUndated = (it: CalendarItem) =>
    setDialog({ item: it, schedule: true, draft: { date: planDay, allDay: false, start: "09:00", end: "10:00" } });
  const dropAct = (name: string, date: string, start: string) => {
    const a = pending.find((p) => p.name === name);
    runTx("Заняття додано", (tx) =>
      void tx.add({
        title: name,
        module: "hobby",
        date,
        allDay: false,
        start,
        end: fromMinutes(Math.min(toMinutes(start) + (a?.dur ?? 60), 24 * 60 - 1)),
      }),
    );
  };

  /** «Скасувати» для задач — та сама чорна капсула внизу */
  const snackUndo = (text: string, undo: () => void) =>
    showSnack(text, () => {
      undo();
      window.clearTimeout(snackTimer.current);
      setSnack(null);
    });
  const addTaskU = (t: NewTask, text = "Задачу додано") => {
    const id = addTask(t);
    snackUndo(text, () => removeTask(id));
    return id;
  };
  const changeTask = (t: Task, next: NewTask, text?: string) => {
    updateTask(t.id, next);
    if (text) snackUndo(text, () => updateTask(t.id, toNewTask(t)));
  };
  const removeTaskU = (t: Task) => {
    removeTask(t.id);
    snackUndo("Задачу видалено", () => addTask(toNewTask(t), t.id));
  };
  const toggleTask = (t: Task) => updateTask(t.id, { ...toNewTask(t), doneAt: t.doneAt ? undefined : new Date().toISOString() });
  const taskToEvent = (t: Task) => {
    setTasksPhoneOpen(false);
    const draft: Partial<NewItem> = { title: t.title, module: "other", date: t.due ?? todayISO, allDay: false, start: "09:00", end: "10:00" };
    setDialog({ draft, quick: { draft, type: "other", panel: true }, fromTask: t.id });
  };
  // Події для поля «подія» в задачі: покази на 60 днів від сьогодні, повторювані розгорнуто
  const upcoming = useMemo(() => {
    const from = new Date();
    const list = Array.from({ length: 60 }, (_, i) => addDays(from, i));
    return expandForDays(
      datedItems.filter((i) => enabled(i.module)),
      list,
    )
      .filter((o) => o.date >= toISO(from))
      .sort((a, b) => a.date.localeCompare(b.date) || (a.allDay ? "" : (a.start ?? "")).localeCompare(b.allDay ? "" : (b.start ?? "")));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [datedItems, answers, todayISO]);
  const renderTaskList = (top?: ReactNode) => (
    <TaskList
      top={top}
      tasks={tasks}
      items={datedItems}
      options={upcoming}
      sync={taskSync}
      onAdd={(title, extra) => addTaskU({ title, ...extra })}
      onChange={changeTask}
      onRemove={removeTaskU}
      onMakeEvent={taskToEvent}
    />
  );

  // «Зроблено» (етап 2, 21.11): запис у профілі settings.done; «Скасувати» прибирає запис
  const doneList: DoneEntry[] = answers?.done ?? [];
  const saveDone = (next: DoneEntry[]) => {
    if (profile.state.status !== "ready") return;
    void profile.save({ ...profile.state.answers, done: next }, false);
  };
  const markDone = (occ: CalendarItem) => {
    if (!answers || !canBeDone(occ)) return;
    const key = doneKey(occ);
    if (doneList.some((d) => d.key === key)) return;
    const prev = doneList;
    saveDone([{ key, title: occ.title, module: occ.module as "fop" | "pet", date: occ.date, at: new Date().toISOString() }, ...prev]);
    showSnack("Позначено як зроблене", () => {
      saveDone(prev);
      setSnack(null);
    });
  };
  const unmarkDone = (key: string) => {
    const prev = doneList;
    saveDone(prev.filter((d) => d.key !== key));
    showSnack("Позначку знято", () => {
      saveDone(prev);
      setSnack(null);
    });
  };
  // Стікери днів (22.11): у профілі settings.stickers; порожній день прибирається з переліку
  const stickers: Record<string, string[]> = answers?.stickers ?? {};
  // 23.11: стікер у будь-якій клітинці — ключ 'рррр-мм-ддTгг:хх' у тому самому settings.stickers; «весь день» — стікер дня
  const cellKey = (d: Partial<NewItem>) => (d.allDay || !d.start ? d.date ?? todayISO : `${d.date}T${d.start}`);
  const setDayStickers = (iso: string, ids: string[]) => {
    if (profile.state.status !== "ready") return;
    const next = { ...stickers };
    if (ids.length) next[iso] = ids;
    else delete next[iso];
    void profile.save({ ...profile.state.answers, stickers: next }, false);
  };
  const todayEv = useMemo(
    () => todayEvents(datedItems.filter((i) => enabled(i.module)), doneList),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [datedItems, doneList, todayISO, answers],
  );
  const todayTk = useMemo(() => (tasksOn ? todayTasks(tasks, datedItems) : []), [tasks, datedItems, tasksOn, todayISO]);
  // «…» у «сьогодні» (23.11): перенести на завтра чи видалити — для повторюваної лише цей показ; з «Скасувати»
  const tomorrowISO = toISO(addDays(new Date(), 1));
  const seriesOf = (occ: CalendarItem) => items.find((i) => i.id === (occ.seriesId ?? occ.id));
  const moveTodayEvent = (occ: CalendarItem) => {
    const series = seriesOf(occ);
    if (!series) return;
    const data = { ...toNew(series), date: tomorrowISO };
    if (series.repeat) applyOps("Подію перенесено на завтра", editOccurrence(series, occ.date, { ...data, repeat: undefined }, "one"));
    else runTx("Подію перенесено на завтра", (tx) => tx.update(series.id, data));
  };
  const deleteTodayEvent = (occ: CalendarItem) => {
    const series = seriesOf(occ);
    if (series) deleteWithUndo(series, series.repeat ? occ.date : undefined, "one");
  };
  const moveTask = (t: Task) => changeTask(t, { ...toNewTask(t), due: tomorrowISO }, "Задачу перенесено на завтра");
  const todayList = (
    <TodayList
      events={todayEv}
      tasks={todayTk}
      onDone={markDone}
      onToggleTask={toggleTask}
      onMoveEvent={moveTodayEvent}
      onDeleteEvent={deleteTodayEvent}
      onMoveTask={moveTask}
      onDeleteTask={removeTaskU}
    />
  );
  const historyList = <HistoryList done={doneList} />;
  // 25.11: нагадування (ФОП, улюбленець — сьогодні й прострочене) вгорі списку задач
  const reminders = (
    <ReminderList events={todayEv} onDone={markDone} onMove={moveTodayEvent} onDelete={deleteTodayEvent} />
  );
  const taskList = tasksOn ? (
    renderTaskList(reminders)
  ) : todayEv.length ? (
    reminders
  ) : (
    <p className="lp-empty">На сьогодні нагадувань немає.</p>
  );

  const saveDraft = useCallback(
    (a: Answers) => void profile.save(a, false),
    [profile.save],
  );
  const finishOnboarding = async (a: Answers) => {
    const ok = await profile.save(a, true);
    if (!ok) return false;
    const done = await replaceGenerated(generateItems(a));
    if (done) setOnbOpen(false);
    return done;
  };

  if (profile.state.status === "loading")
    return <div className="splash" aria-busy="true" />;
  if (
    profile.state.status === "ready" &&
    (!profile.state.onboarded || onbOpen)
  ) {
    return (
      <Onboarding
        initial={profile.state.answers}
        onDraft={saveDraft}
        onFinish={finishOnboarding}
        onClose={profile.state.onboarded ? () => setOnbOpen(false) : undefined}
      />
    );
  }

  return (
    <div
      className={
        "app" + (isPhone ? "" : (sideShown ? " side-open" : " side-closed") + (left ? " left-open" : " left-closed"))
      }
    >
      <header className="top" ref={headRef}>
        <div className="title-block">
          <h1 className="head-font month-title">
            <button
              type="button"
              className="title-btn"
              aria-label={`${isPhone ? `${phoneTitle}, ${day.getDate()} ${MONTHS_GEN[day.getMonth()]}` : weekRange}. Перейти до дати`}
              title="Перейти до дати (G)"
              aria-expanded={pickerOpen}
              onClick={() => setPickerOpen(true)}
            >
              {isPhone ? phoneTitle : weekRange}
              <Icon d={ICONS.down} size={14} />
            </button>
          </h1>
          {isPhone && (
            <span className="phone-date">
              {day.getDate()} {MONTHS_GEN[day.getMonth()]}
              <span className="badge demo-badge">демо</span>
            </span>
          )}
          {!isPhone && thisWeek && <span className="badge">цей тиждень</span>}
          {/* демоверсія: нагадування, що зміни не зберігаються */}
          {!isPhone && (
            <span className="badge demo-badge" title="Після перезавантаження сторінки тиждень повертається до прикладу">
              демо · зміни не зберігаються
            </span>
          )}
        </div>

        {!isPhone && (
          <button
            type="button"
            className="btn primary icon-only"
            aria-label="Додати подію"
            onClick={() =>
              create(toISO(thisWeek ? new Date() : monday), "09:00")
            }
          >
            <Icon d={ICONS.plus} />
          </button>
        )}

        {isPhone ? (
          !isTodayShown && (
            <button type="button" className="pill-btn today-pill" onClick={() => setDay(new Date())}>
              Сьогодні
            </button>
          )
        ) : (
        <div className="pill-group">
          <button
            type="button"
            className="pill-btn icon"
            aria-label={isPhone ? "Попередній день" : "Попередній тиждень"}
            onClick={() => shift(-step)}
          >
            <Icon d={ICONS.prev} />
          </button>
          <button
            type="button"
            className="pill-btn"
            onClick={() => setDay(new Date())}
          >
            Сьогодні
          </button>
          <button
            type="button"
            className="pill-btn icon"
            aria-label={isPhone ? "Наступний день" : "Наступний тиждень"}
            onClick={() => shift(step)}
          >
            <Icon d={ICONS.next} />
          </button>
        </div>
        )}

        <button
          type="button"
          className="pill-btn icon account-btn search-btn"
          aria-label="Пошук подій"
          title="Пошук подій (/)"
          onClick={() => setSearchOpen(true)}
        >
          <Icon d={SEARCH_ICON} size={16} />
        </button>

        <details className="account">
          <summary className="pill-btn icon account-btn" aria-label="Акаунт">
            <Icon d={ICONS.user} size={16} />
          </summary>
          <div className="account-menu">
            <span className="account-email">{email}</span>
            {profile.state.status === "ready" && (
              <button
                type="button"
                className="btn tinted small"
                onClick={() => setOnbOpen(true)}
              >
                Налаштування модулів
              </button>
            )}
            {answers?.google.icalUrl && (
              <label className="account-check">
                <input
                  type="checkbox"
                  checked={answers.google.show !== false}
                  onChange={(e) => saveGoogle(answers.google.icalUrl, e.target.checked)}
                />
                показувати Google Календар
              </label>
            )}
            <button
              type="button"
              className="btn tinted small"
              onClick={() => signOut()}
            >
              Почати демо заново
            </button>
            <a className="btn tinted small" href="/">
              Про застосунок
            </a>
          </div>
        </details>
      </header>

      {(rejected || dishRejected || taskRejected) && (
        <div className="notice warn" role="alert">
          Не вдалося зберегти одну зі змін: база її не прийняла. Перевірте
          останню подію чи страву й спробуйте ще раз.{" "}
          <button
            type="button"
            className="link-btn"
            onClick={() => {
              dismissRejected();
              dismissDishRejected();
              dismissTaskRejected();
            }}
          >
            Закрити
          </button>
        </div>
      )}
      {(sync === "offline" || dishSync === "offline" || taskSync === "offline") && (
        <div className="notice" role="status">
          Немає зʼєднання. Зміни збережено на цьому пристрої — їх буде
          надіслано, щойно зʼявиться інтернет.{" "}
          <button
            type="button"
            className="link-btn"
            onClick={() => {
              reload();
              reloadDishes();
              reloadTasks();
            }}
          >
            Надіслати зараз
          </button>
        </div>
      )}
      {(sync === "error" || dishSync === "error") && (
        <div className="notice warn" role="status">
          Немає зʼєднання з базою, тому на екрані може бути не все.{" "}
          <button
            type="button"
            className="link-btn"
            onClick={() => {
              reload();
              reloadDishes();
            }}
          >
            Спробувати ще раз
          </button>
        </div>
      )}
      {google.state === "error" && (
        <div className="notice warn" role="status">
          {google.error}{" "}
          <button type="button" className="link-btn" onClick={() => void google.reload()}>
            Спробувати ще раз
          </button>{" "}
          <button type="button" className="link-btn" onClick={() => setGoogleOpen(true)}>
            Змінити адресу
          </button>
        </div>
      )}
      {profile.state.status === "error" && (
        <div className="notice warn" role="status">
          Не вдалося завантажити налаштування. Якщо ви ще не оновили базу,
          запустіть новий SQL зі сховища (файл supabase/schema.sql).
        </div>
      )}
      {migrated > 0 && (
        <div className="notice" role="status">
          Події з цього браузера ({migrated}) перенесено в базу. Тепер їх видно
          на всіх ваших пристроях.
        </div>
      )}

      <main>
        {isPhone ? (
          <TodayView
            day={day}
            days={days}
            items={shownItems}
            pending={pending}
            onPlan={planAct}
            undated={undatedList}
            onOpenUndated={openUndated}
            onPickDay={setDay}
            onOpen={openItem}
            onCreate={createQuick}
            selected={cellSel}
            onSwipe={(n) => shift(n)}
            top={
              toISO(day) === todayISO && (todayEv.length > 0 || todayTk.length > 0) ? (
                <section className="group-card ph-today">
                  <button
                    type="button"
                    className="ph-today-head"
                    aria-expanded={phoneTodayOpen}
                    onClick={() => {
                      localStorage.setItem(LEFT_KEY + ":phone", phoneTodayOpen ? "closed" : "open");
                      setPhoneTodayOpen(!phoneTodayOpen);
                    }}
                  >
                    <h2 className="group-card-title">
                      сьогодні <span className="group-card-range">і прострочене</span>
                    </h2>
                    <span className={"ph-today-chev" + (phoneTodayOpen ? " up" : "")}><Icon d={ICONS.down} size={14} /></span>
                  </button>
                  {phoneTodayOpen && <div className="ph-today-list">{todayList}</div>}
                </section>
              ) : undefined
            }
          />
        ) : (
          <WeekView
            onDropDish={(id, date, start, slot) => {
              const d = dishes.find((x) => x.id === id);
              if (d) placeDish(d, date, start, slot);
            }}
            dishes={dishes}
            onMoveItem={moveItem}
            onResizeItem={resizeItem}
            days={days}
            items={shownItems}
            pending={pending}
            onPlan={planAct}
            undated={undatedList}
            onOpenUndated={openUndated}
            onDropAct={dropAct}
            showNight={showNight}
            onShowNight={setShowNight}
            collapsed={collapsed}
            onToggleGroup={toggleGroup}
            onOpen={openItem}
            onCreate={createQuick}
            selected={cellSel}
            stickers={stickers}
            onStickers={setDayStickers}
          />
        )}
      </main>

      {isPhone && (
        <>
          {tasksOn && (
            <button type="button" className="fab-asst fab-tasks" aria-label="Задачі" onClick={() => setTasksPhoneOpen(true)}>
              <Icon d={ICONS.tasks} size={20} />
            </button>
          )}
          <button
            type="button"
            className="fab-asst"
            aria-label="Асистент"
            onClick={() => setAsstPhoneOpen(true)}
          >
            <Icon d={ICONS.chat} size={20} />
          </button>
          <button
            type="button"
            className="fab btn primary icon-only"
            aria-label="Додати подію"
            onClick={() => create(toISO(day), "09:00")}
          >
            <Icon d={ICONS.plus} />
          </button>
        </>
      )}

      {dishDlg && !dishInPanel && (
        <DishDialog
          key={dishDlg.dish?.id ?? "new-dish"}
          dish={dishDlg.dish}
          onClose={() => setDishDlg(null)}
          onSave={saveDish}
          onDelete={(id) => {
            removeDish(id);
            setDishDlg(null);
          }}
        />
      )}
      {isPhone && tasksPhoneOpen && (
        <div className="overlay dish-overlay asst-overlay" onMouseDown={(e) => e.target === e.currentTarget && setTasksPhoneOpen(false)}>
          <div className="dialog dish-dialog assistant-dialog tasks-dialog" role="dialog" aria-labelledby="tasks-title">
            {/* 25.11: як ліва панель — заголовок «задачі», капсула «історія» і «×» в одному рядку */}
            <PanelHead tab={phoneTab} onTab={setPhoneTab} closeLabel="Закрити" closeIcon={ICONS.close} onClose={() => setTasksPhoneOpen(false)} />
            {phoneTab === "tasks" ? taskList : <div className="lp-scroll">{historyList}</div>}
          </div>
        </div>
      )}
      {isPhone
        ? asstPhoneOpen && (
            <AssistantPanel
              mode="sheet"
              messages={assistant.messages}
              onSend={sendToAssistant}
              onUndo={assistant.undo}
              onClose={closePhoneAsst}
            />
          )
        : null}
      {!isPhone && (
        <LeftPanel
          open={!!left}
          tab={left ?? leftLast}
          onTab={setLeft}
          onToggle={() => setLeft(left ? null : leftLast)}
          tasks={taskList}
          history={historyList}
        />
      )}
      {!isPhone && (
        // Бічне меню (16.11, 16:06): одна біла панель — згорнута це смуга з іконками, клік по іконці розширює її вліво
        <div className={"side" + (sideContent ? " open" : "") + (sideClosing ? " closing" : "")}>
          {sideContent === "tasks" && (
            <div className="dialog dish-dialog assistant-dialog assistant-dock tasks-dialog" role="complementary" aria-labelledby="tasks-title">
              <div className="dialog-head">
                <h2 id="tasks-title" className="head-font">задачі</h2>
              </div>
              {taskList}
            </div>
          )}
          {sideContent && sideContent !== "tasks" && (
            <AssistantPanel
              mode="dock"
              focusKey={asstFocus}
              tab={sideContent}
              foodTitle={dishDlg?.dish ? "страва" : "нова страва"}
              onBack={dishInPanel ? () => setDishDlg(null) : undefined}
              foodHead={
                <FoodHeadActions onAdd={() => setDishDlg({})} onDuplicate={copyToNextWeek} weekFoodCount={weekFood.length} />
              }
              food={
                dishInPanel ? (
                  <DishPanelForm
                    key={dishDlg?.dish?.id ?? "new-dish"}
                    dish={dishDlg?.dish}
                    onBack={() => setDishDlg(null)}
                    onSave={saveDish}
                    onDelete={(id) => {
                      removeDish(id);
                      setDishDlg(null);
                    }}
                  />
                ) : foodOn ? (
                  <FoodPanel
                    embedded
                    dishes={dishes}
                    sync={dishSync}
                    onAdd={() => setDishDlg({})}
                    onOpen={(d) => setDishDlg({ dish: d })}
                    onCopyWeek={copyLastWeek}
                    onClearWeek={clearWeek}
                    weekFoodCount={weekFood.length}
                    prevWeekFoodCount={prevFood.length}
                  />
                ) : undefined
              }
              messages={assistant.messages}
              onSend={sendToAssistant}
              onUndo={assistant.undo}
              onClose={() => setSide(null)}
            />
          )}
          <nav className="side-rail" aria-label="Бічне меню">
            <button
              type="button"
              className={"rail-btn" + (sideShown === "chat" ? " on" : "")}
              aria-label="Асистент"
              title="Асистент"
              aria-pressed={sideShown === "chat"}
              onClick={() => toggleSide("chat")}
            >
              <Icon d={ICONS.chat} size={20} />
            </button>
            {foodOn && (
              <button
                type="button"
                className={"rail-btn" + (sideShown === "food" ? " on" : "")}
                aria-label="Страви"
                title="Страви"
                aria-pressed={sideShown === "food"}
                onClick={() => toggleSide("food")}
              >
                <Icon d={MODULES.food.icon} size={20} />
              </button>
            )}
          </nav>
        </div>
      )}

      {snack && (
        <div className="snackbar" role="status" aria-live="polite">
          <span>{snack.text}</span>
          <button type="button" onClick={snack.undo}>
            Скасувати
          </button>
        </div>
      )}

      {view && (
        <EventView
          key={view.item.id}
          item={view.item}
          occ={view.occ}
          readOnly={isGoogle(view.item)}
          anchor={view.anchor}
          phone={isPhone}
          onClose={() => setView(null)}
          onEdit={() => {
            setDialog({ item: view.item, occ: view.occ });
            setView(null);
          }}
          onDelete={(scope) => {
            deleteWithUndo(view.item, view.occ, scope);
            setView(null);
          }}
          extra={
            <>
            {!isGoogle(view.item) && tasksOn ? (
              <Checklist
                tasks={tasks
                  .filter((t) => t.itemId === view.item.id && (!view.item.repeat || !t.itemDate || t.itemDate === (view.occ ?? view.item.date)) && isVisibleTask(t, todayISO))
                  .sort((a, b) => a.createdAt.localeCompare(b.createdAt))}
                onToggle={toggleTask}
                onUnlink={(t) => changeTask(t, { ...toNewTask(t), itemId: undefined, itemDate: undefined }, "Задачу відвʼязано")}
                onAdd={(title) =>
                  addTask({ title, itemId: view.item.id, itemDate: view.item.repeat ? (view.occ ?? view.item.date) : undefined })
                }
              />
            ) : null}
            {!isGoogle(view.item) && canBeDone(view.item) && (() => {
              const date = view.occ ?? view.item.date;
              const key = `${view.item.id}@${date}`;
              const rec = doneList.find((d) => d.key === key);
              const next = nextAfter(view.item, date);
              const nextTxt = next ? `наступне — ${next.slice(8, 10)}.${next.slice(5, 7)}.${next.slice(0, 4)}` : "";
              return (
                <div className="ev-done">
                  {rec ? (
                    <>
                      <span className="ev-done-note">зроблено{nextTxt ? " · " + nextTxt : ""}</span>
                      <button type="button" className="text-add" onClick={() => unmarkDone(key)}>Зняти позначку</button>
                    </>
                  ) : (
                    <>
                      <button type="button" className="lp-done ev-done-btn" onClick={() => markDone({ ...view.item, date, seriesId: view.item.repeat ? view.item.id : undefined })}>
                        <Icon d={ICONS.check} size={12} />
                        Зроблено
                      </button>
                      {nextTxt && <span className="ev-done-note">{nextTxt}</span>}
                    </>
                  )}
                </div>
              );
            })()}
            </>
          }
        />
      )}

      {googleOpen && (
        <GoogleLayerDialog
          url={answers?.google.icalUrl}
          show={answers?.google.show !== false}
          phone={isPhone}
          onSave={saveGoogle}
          onClose={() => setGoogleOpen(false)}
        />
      )}
      {pickerOpen && (
        <MonthPicker
          day={day}
          phone={isPhone}
          weekMode={!isPhone}
          marks={(iso) => {
            const d = fromISO(iso);
            const mods = new Set<ModuleId>();
            for (const it of datedItems) {
              if (!enabled(it.module) || it.repeat?.freq === "daily") continue;
              if (it.repeat ? occursOn(it, d) : it.date === iso) mods.add(it.module);
            }
            return [...mods];
          }}
          onPick={(d) => {
            setDay(d);
            setPickerOpen(false);
          }}
          onClose={() => setPickerOpen(false)}
        />
      )}
      {searchOpen && (
        <SearchPanel
          items={datedItems.filter((i) => enabled(i.module))}
          phone={isPhone}
          onPick={(it, date) => {
            setSearchOpen(false);
            setDay(fromISO(date));
            setView({ item: it, occ: it.repeat ? date : undefined, anchor: undefined });
          }}
          onClose={() => setSearchOpen(false)}
        />
      )}
      {helpOpen && (
        <div className="event-view-overlay" onMouseDown={(e) => e.target === e.currentTarget && setHelpOpen(false)}>
          <div className="event-view keys-help" role="dialog" aria-labelledby="keys-title">
            <div className="quick-head">
              <div className="event-view-text">
                <h2 id="keys-title">клавіші</h2>
              </div>
              <button type="button" className="round-btn" aria-label="Закрити" onClick={() => setHelpOpen(false)}>
                <Icon d={ICONS.close} size={12} />
              </button>
            </div>
            <dl className="keys-list">
              {(
                [
                  [["C"], "нова подія"],
                  [["T"], "сьогодні"],
                  [["←", "→"], "попередній і наступний тиждень"],
                  [["G"], "перейти до дати"],
                  [["/"], "пошук подій"],
                  [["Delete"], "видалити відкриту подію"],
                  [["Ctrl", "Z"], "скасувати останню зміну"],
                  [["Esc"], "закрити вікно"],
                  [["?"], "цей перелік"],
                ] as [string[], string][]
              ).map(([keys, v]) => (
                <div key={v} className="keys-row">
                  <dt>
                    {keys.map((x) => (
                      <kbd key={x}>{x}</kbd>
                    ))}
                  </dt>
                  <dd>{v}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      )}

      {dialog?.quick && !dialog.quick.type && (
        <QuickPicker
          anchor={dialog.quick.anchor}
          phone={isPhone}
          draft={dialog.quick.draft}
          types={quickTypes}
          onPick={(t) => setQuickType(t)}
          stickers={isPhone ? undefined : stickers[cellKey(dialog.quick.draft)] ?? []}
          onStickers={(ids) => setDayStickers(cellKey(dialog.quick!.draft), ids)}
          onQuickAdd={(title) => {
            const d = dialog.quick!.draft;
            save({ title, module: "other", date: d.date ?? todayISO, allDay: !!d.allDay || !d.start, start: d.allDay ? undefined : d.start, end: d.allDay ? undefined : d.end });
          }}
          onClose={close}
        />
      )}
      {quickOnb && answers && dialog?.quick && (
        <QuickOnboarding
          module={quickOnb}
          answers={answers}
          anchor={dialog.quick.anchor}
          phone={isPhone}
          onBack={() => setDialog((d) => (d?.quick ? { ...d, draft: { ...d.draft, module: "other" }, quick: { ...d.quick, type: undefined }, hideCell: false } : d))}
          onSkip={() => setDialog((d) => (d?.quick ? { ...d, quick: { ...d.quick, onbDone: true } } : d))}
          onDone={(next) => {
            // Відповіді модуля — у налаштування, його події онбордингу — заново (лише цього модуля)
            void profile.save(next, false);
            void replaceGenerated(
              generateItems(next).filter((i) => i.source?.startsWith(`onb:${quickOnb}`)),
              `onb:${quickOnb}*`,
            );
            setDialog((d) => (d?.quick ? { ...d, quick: { ...d.quick, onbDone: true } } : d));
          }}
          onClose={close}
        />
      )}
      {dlg && (!dlg.quick || (dlg.quick.type && !quickOnb)) && (
        <ItemDialog
          key={dlg.item?.id ?? (dlg.quick ? `quick-${dlg.quick.type}` : "new")}
          quick={
            dlg.quick?.type
              ? {
                  anchor: dlg.quick.anchor,
                  panel: !!dlg.quick.panel,
                  phone: isPhone,
                  modules: MODULE_ORDER.filter(enabled),
                  type: dlg.quick.type,
                  types: quickTypes,
                  onType: setQuickType,
                }
              : undefined
          }
          onModuleChange={(m) => setDialog((d) => (d ? { ...d, draft: { ...d.draft, module: m } } : d))}
          events={{ options: upcoming, items: datedItems }}
          onCellHidden={hideCell}
          onAddPet={(name) => {
            if (!answers) return;
            void profile.save({ ...answers, modules: { ...answers.modules, pet: true }, pet: { pets: [...answers.pet.pets, { ...newPet(), name }] } }, false);
          }}
          onSaveTask={
            tasksOn
              ? (t) => {
                  addTaskU(t);
                  setDialog(null);
                }
              : undefined
          }
          hobbyActs={answers?.modules.hobby ? answers.hobby.acts.map((a) => a.name.trim()).filter(Boolean) : []}
          onPlaceDish={(d, date, start) => {
            placeDish(d, date, start);
            setDialog(null);
          }}
          state={dlg}
          closing={dlgClosing}
          onClose={close}
          onSave={save}
          onDelete={(id, scope) => {
            const it = items.find((i) => i.id === id);
            if (it) deleteWithUndo(it, dlg.occ, scope);
            else remove(id);
            setDialog(null);
          }}
          dishes={dishes}
          petNames={dialogPets}
          fop={answers?.fop ?? withDefaults(undefined).fop}
          fopSetUp={!!answers && answers.modules.fop && !answers.skipped.fop}
          hasFopDeadlines={items.some((i) => i.source === "onb:fop")}
          onSaveFop={(v) => {
            // Вкладка «ФОП» (17.11): профіль ФОП — у налаштування (модуль увімкнено), автоматичні дедлайни замінюються новими
            const base = answers ?? withDefaults(undefined);
            void profile.save(
              { ...base, modules: { ...base.modules, fop: true }, skipped: { ...base.skipped, fop: false }, fop: v },
              false,
            );
            void replaceGenerated(
              fopDeadlines(v).map((d) => ({ title: d.title, module: "fop" as const, date: d.date, allDay: true, source: "onb:fop" })),
              "onb:fop",
            );
            setDialog(null);
          }}
          onSaveMany={(list) => {
            // 23.11: кілька нагадувань ФОП чи прийомів ліків — одне повідомлення з «Скасувати»
            runTx(list.length > 1 ? `Додано в календар (${list.length})` : "Подію додано", (tx) => list.forEach((d) => tx.add(d)));
            setDialog(null);
          }}
          onSaveHobbyN={(a) => {
            if (answers) {
              const acts = answers.hobby.acts;
              const same = acts.find((x) => x.name.trim().toLowerCase() === a.name.toLowerCase());
              const next = same
                ? acts.map((x) => (x === same ? { ...x, mode: "n" as const, n: a.n, dur: a.dur } : x))
                : [
                    ...acts,
                    { id: `h${Date.now().toString(36)}`, name: a.name, icon: "dumb", mode: "n" as const, days: [0, 0, 0, 0, 0, 0, 0], time: "18:00", n: a.n, dur: a.dur },
                  ];
              void profile.save(
                { ...answers, modules: { ...answers.modules, hobby: true }, skipped: { ...answers.skipped, hobby: false }, hobby: { acts: next } },
                false,
              );
            }
            setDialog(null);
          }}
          onUpdateDish={(dish, d, item, date, start) => {
            updateDish(dish.id, d);
            const { id: _id, createdAt: _c, updatedAt: _u, seriesId: _s, ...rest } = item;
            const dur = item.end && item.start ? toMinutes(item.end) - toMinutes(item.start) : MEAL_MIN;
            update(item.id, {
              ...rest,
              title: item.title.endsWith("(залишки)") ? `${d.name} (залишки)` : d.name,
              date,
              allDay: false,
              start,
              end: fromMinutes(Math.min(toMinutes(start) + dur, 24 * 60 - 1)),
            });
            setDialog(null);
          }}
          onSaveDish={(d, date, start) => {
            const id = addDish(d);
            placeDish({ ...d, id }, date, start);
            setDialog(null);
          }}
        />
      )}
    </div>
  );
}
