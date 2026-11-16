import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  MODULES,
  type CalendarItem,
  type ModuleId,
  type NewItem,
} from "./types";
import {
  MONTHS_GEN,
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
import { ICONS, Icon } from "./components/Icon";
import { useProfile } from "./lib/profile";
import { expandForDays } from "./lib/repeat";
import { Onboarding } from "./onboarding/Onboarding";
import { generateItems } from "./onboarding/generate";
import type { Answers } from "./onboarding/answers";
import {
  MEAL_CATS,
  MEAL_MIN,
  useDishes,
  type Dish,
  type NewDish,
} from "./food/dishes";
import { FoodPanel } from "./food/FoodPanel";
import { DishDialog } from "./food/DishDialog";
import { DishPicker } from "./food/DishPicker";
import { AssistantPanel } from "./assistant/AssistantPanel";
import { useAssistant } from "./assistant/useAssistant";

/** Заняття «N разів на тиждень», які ще треба поставити на цьому тижні */
export interface PendingAct {
  name: string;
  done: number;
  total: number;
  dur: number;
}

const NIGHT_KEY = "miy-kalendar:show-night";
const COLLAPSED_KEY = "miy-kalendar:collapsed-groups";
type SidePanel = "chat" | "food" | null;
const SIDE_KEY = "miy-kalendar:side-panel";
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
  const [picker, setPicker] = useState<{ start: string } | null>(null);
  // Асистент (16.11, 11:56): на ноутбуці завжди відкритий справа, згортається вправо (стан запамʼятовується);
  // на телефоні відкривається кнопкою біля «+» вікном знизу
  // Бічне меню (16.11, 12:19) — як у Google Календарі: праворуч вузька смуга з іконками «Асистент» і «Страви»;
  // натискання відкриває панель поруч, повторне — закриває. Відкрита панель запамʼятовується.
  const [side, setSideState] = useState<SidePanel>(() => {
    const v = localStorage.getItem(SIDE_KEY);
    if (v === "chat" || v === "food") return v;
    if (v === "none" || localStorage.getItem(ASST_KEY) === "1") return null;
    if (localStorage.getItem(ASST_KEY) === "0")
      return localStorage.getItem(ASST_TAB_KEY) === "food" ? "food" : "chat";
    return window.innerWidth < 1200 ? null : "chat";
  });
  const [asstFocus, setAsstFocus] = useState(0);
  // телефон: асистент відкривається кнопкою біля «+» вікном знизу
  const [asstPhoneOpen, setAsstPhoneOpen] = useState(false);
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

  const openItem = useCallback(
    (item: CalendarItem) =>
      setDialog({
        item: item.seriesId
          ? (items.find((i) => i.id === item.seriesId) ?? item)
          : item,
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
      const dur = extra?.dur ?? 60;
      setDialog({
        draft: start
          ? {
              date,
              allDay: false,
              start,
              end: fromMinutes(toMinutes(start) + dur),
              ...extra,
            }
          : { date, allDay: true, ...extra },
      });
    },
    [],
  );
  const close = useCallback(() => setDialog(null), []);

  const closePhoneAsst = useCallback(() => setAsstPhoneOpen(false), []);

  const save = (data: NewItem, id?: string) => {
    if (id) update(id, data);
    else add(data);
    setDialog(null);
  };

  const shift = (n: number) => setDay((d) => addDays(d, n));
  const step = isPhone ? 1 : 7;

  const answers =
    profile.state.status === "ready" ? profile.state.answers : null;
  const enabled = (m: ModuleId) =>
    m === "other" || !answers || answers.modules[m];

  // Події тижня: лише увімкнені модулі, повторювані розгорнуто на дні
  const weekItems = useMemo(
    () =>
      expandForDays(
        items.filter((i) => enabled(i.module)),
        days,
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [items, answers, toISO(monday)],
  );

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

  const placeDish = (dish: Dish, date: string, start?: string) => {
    const at =
      start ?? MEAL_CATS.find((c) => c.v === dish.category)?.start ?? "13:00";
    const base: NewItem = {
      title: dish.name,
      module: "food",
      date,
      allDay: false,
      start: at,
      end: fromMinutes(Math.min(toMinutes(at) + MEAL_MIN, 24 * 60 - 1)),
      source: `dish:${dish.id}`,
    };
    add(base);
    // «на 2 дні» — залишки займають той самий час наступного дня
    if (dish.tags.includes("на 2 дні"))
      add({
        ...base,
        title: `${dish.name} (залишки)`,
        date: toISO(addDays(fromISO(date), 1)),
      });
  };
  const moveItem = (id: string, date: string, start: string) => {
    const it = items.find((i) => i.id === id);
    if (!it || it.allDay || !it.start) return;
    const dur = it.end ? toMinutes(it.end) - toMinutes(it.start) : MEAL_MIN;
    const { id: _id, createdAt: _c, updatedAt: _u, seriesId: _s, ...rest } = it;
    update(id, {
      ...rest,
      date,
      start,
      end: fromMinutes(Math.min(toMinutes(start) + dur, 24 * 60 - 1)),
    });
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
  const saveDish = (d: NewDish, id?: string) => {
    const then = dishDlg?.then;
    if (id) updateDish(id, d);
    else {
      const newId = addDish(d);
      then?.(newId, d);
    }
    setDishDlg(null);
  };

  // ---------- Асистент ----------
  const petNames = useMemo(
    () =>
      answers?.modules.pet
        ? (answers.pet.pets ?? []).map((p) => p.name).filter(Boolean)
        : [],
    [answers],
  );
  const assistant = useAssistant(
    { items, add, update, remove },
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
        "app" + (isPhone ? "" : sideShown ? " side-open" : " side-closed")
      }
    >
      <header className="top" ref={headRef}>
        <div className="title-block">
          <h1 className="head-font month-title">{weekRange}</h1>
          {!isPhone && thisWeek && <span className="badge">цей тиждень</span>}
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
            <button
              type="button"
              className="btn tinted small"
              onClick={() => signOut()}
            >
              Почати демо заново
            </button>
          </div>
        </details>
      </header>

      {(rejected || dishRejected) && (
        <div className="notice warn" role="alert">
          Не вдалося зберегти одну зі змін: база її не прийняла. Перевірте
          останню подію чи страву й спробуйте ще раз.{" "}
          <button
            type="button"
            className="link-btn"
            onClick={() => {
              dismissRejected();
              dismissDishRejected();
            }}
          >
            Закрити
          </button>
        </div>
      )}
      {(sync === "offline" || dishSync === "offline") && (
        <div className="notice" role="status">
          Немає зʼєднання. Зміни збережено на цьому пристрої — їх буде
          надіслано, щойно зʼявиться інтернет.{" "}
          <button
            type="button"
            className="link-btn"
            onClick={() => {
              reload();
              reloadDishes();
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
            items={weekItems}
            pending={pending}
            onPlan={planAct}
            onPickDay={setDay}
            onOpen={openItem}
            onCreate={create}
            onAddDish={
              foodOn ? (_sec, start) => setPicker({ start }) : undefined
            }
          />
        ) : (
          <WeekView
            onDropDish={(id, date, start) => {
              const d = dishes.find((x) => x.id === id);
              if (d) placeDish(d, date, start);
            }}
            onMoveItem={moveItem}
            days={days}
            items={weekItems}
            pending={pending}
            onPlan={planAct}
            showNight={showNight}
            onShowNight={setShowNight}
            collapsed={collapsed}
            onToggleGroup={toggleGroup}
            onOpen={openItem}
            onCreate={create}
          />
        )}
      </main>

      {isPhone && (
        <>
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

      {dishDlg && (
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
      {picker && !dishDlg && (
        <DishPicker
          title="додати страву"
          dishes={dishes}
          sync={dishSync}
          onClose={() => setPicker(null)}
          onPick={(d) => {
            placeDish(d, toISO(day), picker.start);
            setPicker(null);
          }}
          onNew={() => {
            const p = picker;
            setDishDlg({
              then: (id, d) => placeDish({ ...d, id }, toISO(day), p.start),
            });
            setPicker(null);
          }}
        />
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
        // Бічне меню (16.11, 16:06): одна біла панель — згорнута це смуга з іконками, клік по іконці розширює її вліво
        <div className={"side" + (sideShown ? " open" : "")}>
          {sideShown && (
            <AssistantPanel
              mode="dock"
              focusKey={asstFocus}
              tab={sideShown}
              food={
                foodOn ? (
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
                <span
                  className="rail-tile"
                  style={{
                    background: MODULES.food.color,
                    color: MODULES.food.text,
                  }}
                >
                  <Icon d={MODULES.food.icon} size={14} />
                </span>
              </button>
            )}
          </nav>
        </div>
      )}

      {dialog && (
        <ItemDialog
          key={dialog.item?.id ?? "new"}
          state={dialog}
          onClose={close}
          onSave={save}
          onDelete={(id) => {
            remove(id);
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
