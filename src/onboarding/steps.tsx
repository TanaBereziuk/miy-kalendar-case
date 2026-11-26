import { useEffect, useRef, useState } from "react";
import { Icon } from "../components/Icon";
import {
  MOD_KEYS,
  newId,
  newMed,
  newPet,
  newProc,
  type Activity,
  type Answers,
  type FoodAnswers,
  type FopAnswers,
  type HobbyAnswers,
  type Med,
  type ModKey,
  type NotifyAnswers,
  type Pet,
  type PetAnswers,
  type Proc,
} from "./answers";
import { fopDeadlines, fopGroup, fopHasStaff } from "./fop";
import { addDays, DAYS_SHORT, fromISO, toISO, weekdayIndex } from "../lib/dates";
import { occursOn } from "../lib/repeat";
import { validIcalUrl } from "../lib/google";
import { IcalSteps } from "../components/GoogleLayerDialog";
import { MODULES, type CalendarItem } from "../types";
import { generateItems } from "./generate";
import {
  CheckRow,
  ModStepper,
  ModTile,
  OI,
  OnbSection,
  ONB_MOD,
  StepHead,
  StepNav,
  Switch,
} from "./ui";
import { DateProp, DaysProp, PropInput, PropSelect, QfRow, TimeSelect } from "../components/QuickFields";

export interface StepNavProps {
  steps: ModKey[];
  onBack: () => void;
  onNext: () => void;
  onSkip: () => void;
  nextLabel: string;
}

const fmtDate = (iso: string) => iso.split("-").reverse().join(".");

/* ================= 2 · Модулі ================= */

const MOD_DESC: Record<ModKey, string> = {
  food: "Бібліотека страв, меню на тиждень перетягуванням, імпорт рецептів за посиланням.",
  fop: "Дедлайни декларацій і платежів розраховуються самі; нагадування заздалегідь.",
  hobby:
    "Тренування й творчі заняття з бажаним ритмом — фіксовані дні або «N разів на тиждень».",
  pet: "Ліки, щеплення, візити до ветеринара та історія процедур.",
};

export function ModulesStep({
  value,
  onChange,
  onBack,
  onNext,
  nextLabel,
}: {
  value: Answers["modules"];
  onChange: (v: Answers["modules"]) => void;
  onBack?: () => void;
  onNext: () => void;
  nextLabel: string;
}) {
  return (
    <div className="step modules-step">
      <StepHead
        title="що ви хочете планувати?"
        sub="увімкніть модулі, які календар має планувати. вимкнений модуль не показує подій і не надсилає нагадувань."
      />
      {/* 25.11: рядки як перелік у формі календаря — плитка 30, назва 14/600, опис 12 muted, перемикач праворуч */}
      <div role="group" aria-label="Модулі" className="qf-list onb-list">
        {MOD_KEYS.map((k) => (
          <CheckRow
            key={k}
            tile={k}
            toggle
            on={value[k]}
            onChange={(v) => onChange({ ...value, [k]: v })}
            name={ONB_MOD[k].name.charAt(0).toLowerCase() + ONB_MOD[k].name.slice(1)}
            desc={MOD_DESC[k]}
          />
        ))}
      </div>
      <p className="hint xs">
        Пізніше можуть зʼявитися нові модулі — фінанси, рослини, дні народження.
      </p>
      <StepNav onBack={onBack} onNext={onNext} nextLabel={nextLabel} />
    </div>
  );
}

/* ================= 3 · Харчування ================= */

export function FoodStep({
  value,
  onChange,
  nav,
}: {
  value: FoodAnswers;
  onChange: (v: FoodAnswers) => void;
  nav: StepNavProps;
}) {
  const [dish, setDish] = useState("");
  const meals: [keyof FoodAnswers["meals"], string, string][] = [
    ["b", "сніданок", "група «Ранок» · 06–12"],
    ["l", "обід", "група «День» · 12–18"],
    ["d", "вечеря", "група «Вечір» · 18–22"],
    ["s", "перекус", "у будь-якій групі"],
  ];
  const addDish = () => {
    const v = dish.trim();
    if (!v) return;
    onChange({
      ...value,
      dishes: [...value.dishes, v.length > 40 ? v.slice(0, 40) + "…" : v],
    });
    setDish("");
  };
  return (
    <div className="step">
      <ModStepper steps={nav.steps} current="food" />
      <StepHead
        mod="food"
        title="які прийоми їжі планувати?"
        sub="кожен прийом має свою групу в сітці тижня — туди ви перетягуватимете страви."
      />
      <div role="group" aria-label="Прийоми їжі" className="qf-list onb-list">
        {meals.map(([k, name, desc]) => (
          <CheckRow
            key={k}
            toggle
            on={value.meals[k]}
            onChange={(v) => onChange({ ...value, meals: { ...value.meals, [k]: v } })}
            name={name}
            desc={desc}
          />
        ))}
      </div>
      {/* 25.11: страва — поле «підпис — значення», Enter додає; додані — капсули fill 24 з «×» 20 */}
      <form
        className="qf-grid onb-grid"
        onSubmit={(e) => {
          e.preventDefault();
          addDish();
        }}
      >
        {/* 26.11: поле — лінія на всю ширину, як назва у формі події (без рамки, лише лінія знизу) */}
        <input
          type="text"
          className="qf-title onb-line"
          value={dish}
          onChange={(e) => setDish(e.target.value)}
          aria-label="Посилання на рецепт, текст або назва страви"
          placeholder="додати страву — посилання або назва"
        />
        <p className="qf-hint">
          {dish.trim()
            ? "Enter — додати в бібліотеку"
            : "можна додавати посилання на instagram, tiktok, youtube або текстову статтю"}
        </p>
        {value.dishes.length > 0 && (
          <div className="onb-chips">
            {value.dishes.map((d, i) => (
              <span key={i} className="task-new-chip">
                {d}
                <button
                  type="button"
                  className="x20"
                  aria-label="Прибрати страву"
                  onClick={() => onChange({ ...value, dishes: value.dishes.filter((_, j) => j !== i) })}
                >
                  <Icon d={OI.x} size={8} />
                </button>
              </span>
            ))}
          </div>
        )}
      </form>
      <StepNav
        onBack={nav.onBack}
        onSkip={nav.onSkip}
        onNext={nav.onNext}
        nextLabel={nav.nextLabel}
      />
    </div>
  );
}

/* ================= 4 · ФОП ================= */

// Поля кроку ФОП (14.11, правка 11): група, ставка, ЄСВ за себе, виплати іншим
const FOP_GROUPS: { k: 1 | 2 | 3 | "general"; l: string }[] = [
  { k: 1, l: "1 група" },
  { k: 2, l: "2 група" },
  { k: 3, l: "3 група" },
  { k: "general", l: "загальна" },
];

const FOP_ESV: { v: FopAnswers["esv"]; l: string }[] = [
  { v: "pay", l: "сплачую" },
  { v: "exempt", l: "маю звільнення" },
  { v: "unknown", l: "не знаю" },
];

const FOP_PAY_TO: { k: "staff" | "contract" | "fop"; l: string }[] = [
  { k: "staff", l: "найманим працівникам" },
  { k: "contract", l: "фізособам за договором" },
  { k: "fop", l: "іншим ФОП" },
];

export function FopStep({
  value,
  onChange,
  nav,
}: {
  value: FopAnswers;
  onChange: (v: FopAnswers) => void;
  nav: StepNavProps;
}) {
  return (
    <div className="step">
      <ModStepper steps={nav.steps} current="fop" />
      <StepHead
        mod="fop"
        title="ваш профіль ФОП"
        sub="оберіть параметри — і календар сам поставить дедлайни на поточний і наступний рік."
      />
      <FopFields value={value} onChange={onChange} />
      <StepNav
        onBack={nav.onBack}
        onSkip={nav.onSkip}
        onNext={nav.onNext}
        nextLabel={nav.nextLabel}
      />
    </div>
  );
}

/**
 * Поля профілю ФОП і «що зʼявиться в календарі» — спільні для кроку онбордингу
 * й вкладки «ФОП» у вікні нової події (17.11). extraNote — додаткове речення в примітці під дедлайнами.
 */
export function FopFields({
  value,
  onChange,
  extraNote,
}: {
  value: FopAnswers;
  onChange: (v: FopAnswers) => void;
  extraNote?: string;
}) {
  const [open, setOpen] = useState(false);
  const set = (p: Partial<FopAnswers>) => onChange({ ...value, ...p });
  const grp = fopGroup(value);
  const rows = fopDeadlines(value);
  // у переліку — не більше 10 дедлайнів
  const limited = rows.slice(0, 10);
  const shown = open ? limited : limited.slice(0, 1);
  const nearest = rows[0];
  const daysLeft = nearest
    ? Math.round(
        (new Date(nearest.date).getTime() -
          new Date(new Date().toISOString().slice(0, 10)).getTime()) /
          86400000,
      )
    : 0;
  const when =
    daysLeft <= 0
      ? "сьогодні"
      : daysLeft === 1
        ? "завтра"
        : `через ${daysLeft} дн · ${fmtDate(nearest.date)}`;

  // Вибір групи: 1–3 або загальна система
  const selGroup: 1 | 2 | 3 | "general" = value.how === "general" ? "general" : (grp ?? value.grp);
  const pickGroup = (k: 1 | 2 | 3 | "general") => (k === "general" ? set({ how: "general" }) : set({ how: "manual", grp: k }));
  const payTo = value.payTo;
  const savePay = (next: typeof payTo) =>
    set({ payTo: next, emp: next.staff || next.contract, pay: next.staff || next.contract ? "people" : next.fop ? "fop" : "no" });
  const togglePay = (k: "staff" | "contract" | "fop") => savePay({ ...payTo, [k]: !payTo[k] });
  const remind = `Нагадаємо за ${value.lead}${value.d3 ? " і 3" : ""} дні${value.d0 ? " та в день дедлайну" : ""}.`;

  return (
    <>
      {/* 25.11: поля «підпис — значення», як у формі календаря */}
      <div className="qf-grid onb-grid fop-form">
        <QfRow k="група ФОП">
          <PropSelect
            label="Група ФОП"
            value={String(selGroup)}
            onChange={(v) => pickGroup(v === "general" ? "general" : (Number(v) as 1 | 2 | 3))}
            options={FOP_GROUPS.map((o) => [String(o.k), o.l] as [string, string])}
          />
        </QfRow>
        <p className="qf-hint">
          Не знаєте свою групу? Перегляньте в{" "}
          <a className="text-link" href="https://cabinet.tax.gov.ua" target="_blank" rel="noopener noreferrer">
            Е-кабінеті
          </a>
          .{value.how === "general" ? " Для загальної системи календар поки не ставить дедлайни сам. Їх можна додати як звичайні повторювані події." : ""}
        </p>

        {grp === 3 && (
          <>
            <QfRow k="ставка">
              <PropSelect
                label="Ставка єдиного податку"
                value={value.vat ? 3 : 5}
                onChange={(v) => set({ vat: v === 3 })}
                options={[
                  [5, "5% без ПДВ"],
                  [3, "3% з ПДВ"],
                ]}
              />
            </QfRow>
            {value.vat && <p className="qf-hint">Додамо декларацію й сплату ПДВ щомісяця.</p>}
          </>
        )}

        {grp && (
          <>
            <QfRow k="ЄСВ за себе">
              <PropSelect label="Сплата ЄСВ за себе" value={value.esv} onChange={(esv) => set({ esv })} options={FOP_ESV.map((o) => [o.v, o.l] as [FopAnswers["esv"], string])} />
            </QfRow>
            {value.esv === "exempt" && (
              <p className="qf-hint">Без нагадувань про ЄСВ за себе. Звільнення мають, зокрема, пенсіонери за віком, люди з інвалідністю та мобілізовані.</p>
            )}
            {value.esv === "unknown" && <p className="qf-hint">Нагадування про ЄСВ залишимо — прибрати їх можна будь-коли.</p>}
          </>
        )}

        {grp && grp !== 1 && (
          <>
            <span className="qf-k">виплати іншим</span>
            {/* перемикач праворуч у кожному рядку; нічого не увімкнено — виплат немає */}
            <span className="qf-v onb-switches" role="group" aria-label="Здійснюю виплати іншим">
              {FOP_PAY_TO.map((o) => (
                <label key={o.k} className="onb-switch-row">
                  <span>{o.l}</span>
                  <Switch on={payTo[o.k]} onChange={() => togglePay(o.k)} label={o.l} />
                </label>
              ))}
            </span>
            {(payTo.staff || payTo.contract) && <p className="qf-hint">Додамо податки з кожної виплати й квартальний розрахунок.</p>}
          </>
        )}
      </div>

      {grp && (
        <section className="stack fop-preview">
          <h2 className="sub-title">що зʼявиться в календарі</h2>
          {/* 14.11, 22:15: перелік дедлайнів і «ще N» — у тому самому оранжевому блоці, під лінією */}
          <div className={"deadline-card" + (nearest && daysLeft <= 3 ? " urgent" : "")}>
            {nearest && (
              <div role="status" className="deadline-banner">
                <Icon d={OI.warn} size={20} />
                <span>
                  Найближчий дедлайн — <strong>{when}</strong>
                </span>
              </div>
            )}
            <div className="deadline-list">
              {shown.map((r, i) => (
                <div key={i} className="deadline-row">
                  <span className="dl-text">{r.title}</span>
                  <span className="dl-date">{fmtDate(r.date)}</span>
                </div>
              ))}
              {rows.length > 1 && (
                <button
                  type="button"
                  className="dl-toggle"
                  aria-expanded={open}
                  onClick={() => setOpen(!open)}
                >
                  {open ? "сховати" : `ще ${limited.length - 1}`}
                  <Icon
                    d={OI.chevronDown}
                    size={16}
                    className={open ? "flip" : ""}
                  />
                </button>
              )}
            </div>
          </div>
          <p className="hint small">
            {remind} Календар лише нагадує й не замінює бухгалтера.{extraNote ? ` ${extraNote}` : ""}
          </p>
        </section>
      )}
    </>
  );
}

/* ================= 5 · Хобі та спорт ================= */

const ACT_ICONS = [
  {
    k: "dumb",
    label: "Зал",
    d: "M1 9h2V7h4v10H3v-2H1zM23 9h-2V7h-4v10h4v-2h2zM7 11h10v2H7z",
  },
  {
    k: "run",
    label: "Біг",
    d: "M13 2h4v4h-4zM8 8h8l3 5h-3l-2-3-1 3 3 3v7h-3v-6l-3-2-3 8H4l4-11z",
  },
  {
    k: "bike",
    label: "Велосипед",
    d: "M2 12h8v8H2zM14 12h8v8h-8zM8 5h6l3 7h-3l-2-4H8z",
  },
  { k: "music", label: "Музика", d: "M8 3h13v12h-3V7h-7v11H8zM3 15h7v6H3z" },
  { k: "book", label: "Читання", d: "M3 4h8v16H3zM13 4h8v16h-8z" },
  { k: "pen", label: "Малювання", d: "M16 2l6 6L10 20H4v-6z" },
  { k: "heart", label: "Йога", d: "M12 21 3 12V6h6l3 3 3-3h6v6z" },
  {
    k: "target",
    label: "Ігри",
    d: "M12 2a10 10 0 1 0 .01 0zM12 7a5 5 0 1 1-.01 0z",
  },
];
export const actIcon = (k: string) =>
  (ACT_ICONS.find((x) => x.k === k) ?? ACT_ICONS[0]).d;

const PRESETS: [string, string][] = [
  ["Біг", "run"],
  ["Йога", "heart"],
  ["Зал", "dumb"],
  ["Плавання", "target"],
  ["Велосипед", "bike"],
  ["Піаніно", "music"],
  ["Малювання", "pen"],
  ["Читання", "book"],
];
const DOW = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Нд"];
const timesWord = (n: number) =>
  n % 10 === 1 && n % 100 !== 11 ? "раз" : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? "рази" : "разів";

// Вибір іконки заняття (14.11): плитка 44 + стрілка; по натисканню — набір іконок без підписів (сітка 4 × 2)
function ActIconPicker({ value, onChange }: { value: string; onChange: (k: string) => void }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);
  return (
    <div className="icon-dd" ref={box}>
      <button type="button" className="icon-dd-btn" aria-label="Змінити іконку" aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span className="icon-dd-tile">
          <Icon d={actIcon(value)} size={16} />
        </span>
        <Icon d={OI.chevronDown} size={12} className={open ? "flip" : ""} />
      </button>
      {open && (
        <div className="icon-dd-grid" role="listbox" aria-label="Іконка заняття">
          {ACT_ICONS.map((ic) => (
            <button
              type="button"
              key={ic.k}
              role="option"
              aria-selected={value === ic.k}
              aria-label={ic.label}
              title={ic.label}
              className={value === ic.k ? "on" : ""}
              onClick={() => {
                onChange(ic.k);
                setOpen(false);
              }}
            >
              <Icon d={ic.d} size={18} />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function HobbyStep({
  value,
  onChange,
  nav,
}: {
  value: HobbyAnswers;
  onChange: (v: HobbyAnswers) => void;
  nav: StepNavProps;
}) {
  const setAct = (id: string, p: Partial<Activity>) =>
    onChange({
      acts: value.acts.map((a) => (a.id === id ? { ...a, ...p } : a)),
    });
  const [fresh, setFresh] = useState<string | null>(null);
  const add = (name: string, icon: string, n: number) => {
    const id = newId("h");
    if (!name) setFresh(id);
    onChange({
      acts: [
        ...value.acts,
        {
          id,
          name,
          icon,
          mode: "n",
          days: [0, 0, 0, 0, 0, 0, 0],
          time: "18:00",
          n,
          dur: 45,
        },
      ],
    });
  };

  return (
    <div className="step">
      <ModStepper steps={nav.steps} current="hobby" />
      <StepHead
        mod="hobby"
        title="чим ви займаєтеся і як часто?"
        sub="фіксовані заняття стануть у сітку самі; «N разів на тиждень» чекатимуть у рядку «без дня» — ви оберете зручний день."
      />
      {value.acts.length > 0 && (
        <div className="acts-head">
          <h2 className="sub-title">мої заняття</h2>
          <button type="button" className="btn tinted small acts-add" onClick={() => add("", "dumb", 2)}>
            <Icon d={OI.plus} size={12} />
            Додати ще одне
          </button>
        </div>
      )}
      {/* 25.11: заняття — як форма «заняття» в календарі: плитка-іконка 30 зі стрілкою, назва 20/700 з лінією,
          поля «підпис — значення»; між заняттями лінія */}
      {value.acts.map((a) => (
        <section key={a.id} className="onb-act" aria-label={a.name || "Заняття"}>
          <div className="act-head">
            <ActIconPicker value={a.icon} onChange={(icon) => setAct(a.id, { icon })} />
            <input
              type="text"
              value={a.name}
              onChange={(e) => setAct(a.id, { name: e.target.value })}
              aria-label="Назва заняття"
              placeholder="назва заняття"
              className="qf-title act-title"
              autoFocus={fresh === a.id}
            />
            <button
              type="button"
              className="round-btn"
              aria-label="Прибрати заняття"
              onClick={() => onChange({ acts: value.acts.filter((x) => x.id !== a.id) })}
            >
              <Icon d={OI.x} size={12} />
            </button>
          </div>
          <div className="qf-grid onb-grid">
            <QfRow k="розклад">
              <PropSelect
                label="Розклад"
                value={a.mode}
                onChange={(mode) => setAct(a.id, { mode })}
                options={[
                  ["fixed", "щотижня"],
                  ["n", "N разів на тиждень"],
                ]}
              />
            </QfRow>
            {a.mode === "fixed" ? (
              <>
                <QfRow k="дні">
                  <DaysProp value={a.days} onChange={(days) => setAct(a.id, { days })} />
                </QfRow>
                <QfRow k="час">
                  <TimeSelect value={a.time} onChange={(time) => setAct(a.id, { time })} label="Час заняття" />
                </QfRow>
              </>
            ) : (
              <QfRow k="разів на тиждень">
                <PropSelect
                  label="Разів на тиждень"
                  value={a.n}
                  onChange={(n) => setAct(a.id, { n })}
                  options={Array.from({ length: 14 }, (_, i) => [i + 1, `${i + 1} ${timesWord(i + 1)}`] as [number, string])}
                />
              </QfRow>
            )}
            <QfRow k="тривалість">
              <PropSelect
                label="Тривалість"
                value={a.dur}
                onChange={(dur) => setAct(a.id, { dur })}
                options={[
                  [30, "30 хв"],
                  [45, "45 хв"],
                  [60, "1 год"],
                  [90, "1,5 год"],
                ]}
              />
            </QfRow>
            {a.mode === "n" && (
              <p className="qf-hint">У календарі ви зможете самі перетягнути картки на дні, коли плануєте займатися.</p>
            )}
          </div>
        </section>
      ))}
      {value.acts.length === 0 && (
        <div className="stack small-gap">
          <span className="label-muted">оберіть заняття зі списку</span>
          <div className="chips-wrap">
            {PRESETS.map(([name, icon]) => (
              <button type="button" key={name} className="preset" onClick={() => add(name, icon, 3)}>
                <Icon d={actIcon(icon)} size={16} />
                {name}
              </button>
            ))}
            <button type="button" className="preset" onClick={() => add("", "dumb", 2)}>
              <Icon d={OI.plus} size={16} />
              Інше
            </button>
          </div>
        </div>
      )}
      <StepNav
        onBack={nav.onBack}
        onSkip={nav.onSkip}
        onNext={nav.onNext}
        nextLabel={nav.nextLabel}
      />
    </div>
  );
}

/* ================= 6 · Улюбленець ================= */

const MED_TIMES: Record<number, string[]> = {
  1: ["08:30"],
  2: ["08:30", "20:30"],
  3: ["08:00", "14:00", "20:00"],
};
const PROC_OPTS = [
  ["1", "щомісяця"],
  ["2", "кожні 2 міс"],
  ["3", "кожні 3 міс"],
  ["6", "кожні 6 міс"],
  ["12", "щороку"],
];

const VET_REPEAT: [string, string][] = [
  ["no", "не повторюється"],
  ["6", "кожні 6 міс"],
  ["12", "щороку"],
];

export function PetStep({
  value,
  onChange,
  nav,
}: {
  value: PetAnswers;
  onChange: (v: PetAnswers) => void;
  nav: StepNavProps;
}) {
  const [cur, setCur] = useState(0);
  const pets = value.pets.length ? value.pets : [newPet()];
  const pc = Math.min(cur, pets.length - 1);
  const pet = pets[pc];
  const upd = (p: Partial<Pet>) =>
    onChange({ pets: pets.map((x, i) => (i === pc ? { ...x, ...p } : x)) });
  const updMed = (id: string, p: Partial<Med>) =>
    upd({ meds: pet.meds.map((m) => (m.id === id ? { ...m, ...p } : m)) });
  const updProc = (id: string, p: Partial<Proc>) =>
    upd({ procs: pet.procs.map((x) => (x.id === id ? { ...x, ...p } : x)) });
  const updVacc = (
    k: keyof Pet["vaccs"],
    p: Partial<Pet["vaccs"]["complex"]>,
  ) => upd({ vaccs: { ...pet.vaccs, [k]: { ...pet.vaccs[k], ...p } } });
  const known = pet.kind === "cat" || pet.kind === "dog";

  // Щеплення: дата останнього й інтервал
  const vaccRows = (k: keyof Pet["vaccs"], label: string, name: string) => (
    <>
      <QfRow k={label}>
        <DateProp value={pet.vaccs[k].last} onChange={(last) => updVacc(k, { last })} placeholder="не вказано" label={`Дата: ${name}`} />
      </QfRow>
      <QfRow k="інтервал">
        <PropSelect
          label={`Інтервал: ${name}`}
          value={pet.vaccs[k].iv}
          onChange={(iv) => updVacc(k, { iv })}
          options={[
            [6, "6 міс"],
            [12, "12 міс"],
            [36, "36 міс"],
          ]}
        />
      </QfRow>
    </>
  );

  return (
    <div className="step pet-step">
      <ModStepper steps={nav.steps} current="pet" />
      <StepHead
        mod="pet"
        title="хто ваш улюбленець?"
        sub="позначте те, про що варто нагадувати. досить дати останньої процедури — наступну календар порахує сам."
      />

      <div className="acts-head">
        <h2 className="sub-title">{pets.length > 1 ? "мої улюбленці" : "мій улюбленець"}</h2>
        <button
          type="button"
          className="btn tinted small acts-add"
          aria-label="Додати ще одну тварину"
          onClick={() => {
            onChange({ pets: [...pets, newPet()] });
            setCur(pets.length);
          }}
        >
          <Icon d={OI.plus} size={12} />
          <span>
            Додати ще одну<span className="wide-only"> тварину</span>
          </span>
        </button>
      </div>
      {pets.length > 1 && (
        <div role="group" aria-label="Тварини" className="chips-wrap">
          {pets.map((x, i) => (
            <button type="button" key={x.id} aria-pressed={i === pc} className={"pet-tab" + (i === pc ? " on" : "")} onClick={() => setCur(i)}>
              {x.name.trim() || `Тварина ${i + 1}`}
            </button>
          ))}
        </div>
      )}

      {/* 25.11: як форма «улюбленець» у календарі — поля «підпис — значення»; розділи — позначка 18 замість перемикача */}
      <div className="qf-grid onb-grid">
        <QfRow k="імʼя">
          <PropInput value={pet.name} onChange={(name) => upd({ name })} placeholder="наприклад, Бусинка" label="Імʼя" />
        </QfRow>
        <QfRow k="вид">
          <PropSelect
            label="Вид"
            value={pet.kind}
            onChange={(kind) => upd({ kind })}
            options={[
              ["cat", "кіт"],
              ["dog", "собака"],
              ["other", "інше"],
            ]}
          />
        </QfRow>
      </div>

      <div className="onb-secs">
        <OnbSection title="ліки" sub="кожен прийом зʼявиться в сітці з нагадуванням" on={pet.medOn} onToggle={(medOn) => upd({ medOn })}>
          {pet.meds.map((m) => {
            const nTimes = m.freq === "daily" ? m.perDay : 1;
            return (
              <div key={m.id} className="qf-grid onb-grid onb-item">
                <QfRow k="препарат">
                  <PropInput value={m.name} onChange={(name) => updMed(m.id, { name })} placeholder="назва препарату" label="Назва препарату" />
                </QfRow>
                {!m.name.trim() && (
                  <p className="qf-hint onb-often">
                    часто додають:
                    <button type="button" className="task-new-chip onb-often-chip" onClick={() => updMed(m.id, { name: "Антигістамінне" })}>
                      Антигістамінне
                    </button>
                  </p>
                )}
                <QfRow k="доза">
                  <PropSelect
                    label="Доза"
                    value={m.dose}
                    onChange={(dose) => updMed(m.id, { dose })}
                    options={[
                      ["1/4 таблетки", "1/4 таблетки"],
                      ["1/2 таблетки", "1/2 таблетки"],
                      ["1 таблетка", "1 таблетка"],
                    ]}
                  />
                </QfRow>
                <QfRow k="як часто">
                  <PropSelect
                    label="Як часто"
                    value={m.freq}
                    onChange={(freq) => updMed(m.id, { freq })}
                    options={[
                      ["daily", "щодня"],
                      ["alt", "через день"],
                      ["week", "раз на тиждень"],
                    ]}
                  />
                </QfRow>
                {m.freq === "week" && (
                  <QfRow k="день тижня">
                    <PropSelect
                      label="День тижня"
                      value={m.wday ?? weekdayIndex(fromISO(m.start || toISO(new Date())))}
                      onChange={(wday) => updMed(m.id, { wday })}
                      options={DOW.map((d, i) => [i, d.toLowerCase()] as [number, string])}
                    />
                  </QfRow>
                )}
                {m.freq === "daily" && (
                  <QfRow k="разів на день">
                    <PropSelect
                      label="Разів на день"
                      value={m.perDay}
                      onChange={(perDay) => updMed(m.id, { perDay, t: MED_TIMES[perDay].slice() })}
                      options={[
                        [1, "1 раз"],
                        [2, "2 рази"],
                        [3, "3 рази"],
                      ]}
                    />
                  </QfRow>
                )}
                <QfRow k={nTimes === 1 ? "час" : "час прийомів"}>
                  {Array.from({ length: nTimes }, (_, i) => (
                    <TimeSelect
                      key={i}
                      label={`Прийом ${i + 1}`}
                      value={m.t[i] ?? ""}
                      onChange={(v) => {
                        const t = m.t.slice();
                        t[i] = v;
                        updMed(m.id, { t });
                      }}
                    />
                  ))}
                </QfRow>
                <QfRow k="з якого дня">
                  <DateProp value={m.start} onChange={(start) => updMed(m.id, { start })} placeholder="з сьогодні" label="З якого дня" />
                </QfRow>
                <QfRow k="тривалість">
                  <PropSelect
                    label="Тривалість прийому"
                    value={m.course}
                    onChange={(course) => updMed(m.id, { course })}
                    options={[
                      ["always", "постійно"],
                      ["course", "курсом"],
                    ]}
                  />
                </QfRow>
                {m.course === "course" && (
                  <QfRow k="днів курсу">
                    <PropInput value={String(m.days ?? "")} onChange={(v) => updMed(m.id, { days: v.replace(/\D/g, "") })} placeholder="наприклад, 10" label="Днів курсу" width={140} inputMode="numeric" />
                  </QfRow>
                )}
                {pet.meds.length > 1 && (
                  <button type="button" className="text-danger onb-remove" onClick={() => upd({ meds: pet.meds.filter((q) => q.id !== m.id) })}>
                    Прибрати ці ліки
                  </button>
                )}
              </div>
            );
          })}
          <button type="button" className="text-add" onClick={() => upd({ meds: [...pet.meds, newMed()] })}>
            <Icon d={OI.plus} size={12} />
            Додати ще ліки
          </button>
        </OnbSection>

        <OnbSection title="щеплення" sub="нагадаємо записатися за 7 днів до терміну" on={pet.vaccOn} onToggle={(vaccOn) => upd({ vaccOn })}>
          <div className="qf-grid onb-grid">
            {known ? (
              <>
                {vaccRows("complex", "комплексне", "комплексне щеплення")}
                {vaccRows("rabies", "від сказу", "щеплення від сказу")}
              </>
            ) : (
              vaccRows("generic", "останнє", "щеплення")
            )}
            <p className="qf-hint">Дата — останнього щеплення. Інтервали — стартові, уточніть їх у ветеринара. Щеплення без дати пропустимо.</p>
          </div>
        </OnbSection>

        <OnbSection title="ветеринар" sub="нагадаємо за 1 день до візиту" on={pet.vetOn} onToggle={(vetOn) => upd({ vetOn })}>
          <div className="qf-grid onb-grid">
            <QfRow k="візит">
              <PropSelect
                label="Тип візиту"
                value={pet.vetMode}
                onChange={(vetMode) => upd({ vetMode })}
                options={[
                  ["planned", "запланований"],
                  ["regular", "плановий огляд"],
                ]}
              />
            </QfRow>
            {pet.vetMode === "regular" ? (
              <>
                <QfRow k="останній візит">
                  <DateProp value={pet.vetLast} onChange={(vetLast) => upd({ vetLast })} placeholder="не вказано" label="Останній візит" />
                </QfRow>
                <QfRow k="інтервал">
                  <PropSelect
                    label="Інтервал візитів"
                    value={pet.vetIv}
                    onChange={(vetIv) => upd({ vetIv })}
                    options={[
                      [6, "кожні 6 міс"],
                      [12, "щороку"],
                    ]}
                  />
                </QfRow>
              </>
            ) : (
              <>
                <QfRow k="день">
                  <DateProp
                    value={pet.vetDate}
                    onChange={(d) => upd({ vetDate: d, vetTime: d ? pet.vetTime || "10:00" : "", vetBook: !!d })}
                    label="День візиту"
                  />
                </QfRow>
                {pet.vetDate && (
                  <QfRow k="час">
                    <TimeSelect value={pet.vetTime} onChange={(vetTime) => upd({ vetTime })} label="Час візиту" empty="без часу" />
                  </QfRow>
                )}
                <QfRow k="повторення">
                  <PropSelect
                    label="Повторення"
                    value={pet.vetReg ? String(pet.vetIv) : "no"}
                    muted={!pet.vetReg}
                    onChange={(v) => upd(v === "no" ? { vetReg: false } : { vetReg: true, vetIv: Number(v) as 6 | 12 })}
                    options={VET_REPEAT}
                  />
                </QfRow>
              </>
            )}
          </div>
        </OnbSection>

        <OnbSection title="інші процедури" sub="напр. обробка від бліх чи дегельмінтизація" on={pet.procOn} onToggle={(procOn) => upd({ procOn })}>
          {pet.procs.map((p) => (
            <div key={p.id} className="qf-grid onb-grid onb-item">
              <QfRow k="процедура">
                <PropInput value={p.name} onChange={(name) => updProc(p.id, { name })} placeholder="напр. обробка від бліх" label="Назва процедури" />
              </QfRow>
              <QfRow k="остання">
                <DateProp value={p.last} onChange={(last) => updProc(p.id, { last })} placeholder="не вказано" label="Дата останньої процедури" />
              </QfRow>
              <QfRow k="інтервал">
                <PropSelect label="Інтервал" value={p.iv} onChange={(iv) => updProc(p.id, { iv })} options={PROC_OPTS as [string, string][]} />
              </QfRow>
              {pet.procs.length > 1 && (
                <button type="button" className="text-danger onb-remove" onClick={() => upd({ procs: pet.procs.filter((q) => q.id !== p.id) })}>
                  Прибрати цю процедуру
                </button>
              )}
            </div>
          ))}
          <button type="button" className="text-add" onClick={() => upd({ procs: [...pet.procs, newProc()] })}>
            <Icon d={OI.plus} size={12} />
            Додати ще процедуру
          </button>
        </OnbSection>
      </div>

      {pets.length > 1 && (
        <button
          type="button"
          className="text-danger"
          onClick={() => {
            onChange({ pets: pets.filter((_, i) => i !== pc) });
            setCur(Math.max(0, pc - 1));
          }}
        >
          Прибрати цю тварину
        </button>
      )}
      <StepNav
        onBack={nav.onBack}
        onSkip={nav.onSkip}
        onNext={nav.onNext}
        nextLabel={nav.nextLabel}
      />
    </div>
  );
}

/* ================= 7 · Нагадування ================= */

export function NotifyStep({
  value,
  onChange,
  onBack,
  onNext,
}: {
  value: NotifyAnswers;
  onChange: (v: NotifyAnswers) => void;
  onBack: () => void;
  onNext: () => void;
}) {
  const supported = typeof window !== "undefined" && "Notification" in window;
  const [denied, setDenied] = useState(
    supported && Notification.permission === "denied",
  );

  const toggle = async (on: boolean) => {
    if (!on) return onChange({ ...value, push: false });
    if (!supported) return;
    const res = await Notification.requestPermission();
    if (res === "granted") onChange({ ...value, push: true });
    else setDenied(true);
  };

  return (
    <div className="step">
      <StepHead
        title="як вам нагадувати?"
        sub="без сповіщень легко пропустити таблетку чи дедлайн."
      />
      <section className="soft-card push-card">
        <div className="push-top">
          <span
            className="mod-tile"
            style={{
              width: 44,
              height: 44,
              borderRadius: 12,
              background: ONB_MOD.fop.bg,
            }}
          >
            <Icon d={OI.bell} size={24} />
          </span>
          <span className="row-text">
            <span className="row-name">push-сповіщення</span>
            <span className="row-desc">
              ми будемо відправляти сповіщення про важливі події
            </span>
          </span>
          <Switch on={value.push} label="push-сповіщення" onChange={toggle} />
        </div>
        <div className="row-line full">
          <span>ранковий дайджест о</span>
          <input
            type="time"
            value={value.digestTime}
            onChange={(e) => onChange({ ...value, digestTime: e.target.value })}
            aria-label="Час дайджесту"
          />
        </div>
        {!supported && (
          <p className="hint small full">
            Цей браузер не підтримує сповіщення. На iPhone спершу додайте
            календар на початковий екран.
          </p>
        )}
        {supported && denied && !value.push && (
          <p className="hint small full">
            Сповіщення заблоковано в налаштуваннях браузера. Дозволити їх можна
            там, а потім увімкнути перемикач ще раз.
          </p>
        )}
      </section>
      <section className="example-box">
        <h2 className="sub-title small">строки за замовчуванням</h2>
        <ul>
          <li>ФОП — за 14 днів, за 3 дні й у день дедлайну</li>
          <li>ліки — у час прийому</li>
          <li>щеплення — за 7 днів, щоб встигнути записатися</li>
          <li>ветеринар — за 1 день до візиту</li>
        </ul>
        <p className="hint small">
          Самі сповіщення почнуть надходити, коли запрацює наступний етап.
          Резервні канали (Telegram або email) зʼявляться пізніше.
        </p>
      </section>
      <StepNav
        onBack={onBack}
        onSkip={onNext}
        skipLabel="Не зараз"
        onNext={onNext}
        nextLabel="Переглянути підсумок"
      />
    </div>
  );
}

/* ================= 8 · Підсумок ================= */

/* Превʼю тижня в підсумку (14.11, 22:15): події, які створить онбординг, у сітці пн–нд; можна гортати тижні */
function WeekPreview({ answers }: { answers: Answers }) {
  const [shift, setShift] = useState(0);
  const today = new Date();
  // 7 днів від сьогодні (стрілки — по тижню вперед/назад), щоб превʼю не було порожнім наприкінці тижня
  const start = addDays(new Date(today.getFullYear(), today.getMonth(), today.getDate()), shift * 7);
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  const monday = days[0];
  const items = generateItems(answers, today).map((it, i) => ({ ...it, id: `p${i}` }) as unknown as CalendarItem);
  const byDay = days.map((d) =>
    items
      .filter((it) => occursOn(it, d))
      .sort((a, b) => (a.allDay === b.allDay ? (a.start ?? "").localeCompare(b.start ?? "") : a.allDay ? -1 : 1)),
  );
  const loose = answers.modules.hobby && !answers.skipped.hobby ? answers.hobby.acts.filter((x) => x.mode === "n") : [];
  const sunday = days[6];
  const range =
    monday.getMonth() === sunday.getMonth()
      ? `${monday.getDate()}–${sunday.getDate()} ${MONTHS_GEN_SHORT[monday.getMonth()]}`
      : `${monday.getDate()} ${MONTHS_GEN_SHORT[monday.getMonth()]} – ${sunday.getDate()} ${MONTHS_GEN_SHORT[sunday.getMonth()]}`;
  const todayIso = toISO(today);
  return (
    <section className="wk-preview" aria-label="Превʼю календаря">
      <div className="wk-head">
        <span className="wk-range">{range}</span>
        <span className="wk-arrows">
          <button type="button" aria-label="Попередні 7 днів" onClick={() => setShift(shift - 1)} disabled={shift <= 0}>
            <Icon d={OI.back} size={14} />
          </button>
          <button type="button" aria-label="Наступні 7 днів" onClick={() => setShift(shift + 1)} disabled={shift >= 8}>
            <Icon d="M8.5 3.5 17 12l-8.5 8.5-2.5-2.5 6-6-6-6z" size={14} />
          </button>
        </span>
      </div>
      {loose.length > 0 && (
        <div className="wk-loose">
          <span className="wk-loose-label">без дня</span>
          {loose.map((x) => (
            <span key={x.id} className="wk-ev" style={{ background: MODULES.hobby.color }}>
              {(x.name.trim() || "Заняття") + ` ×${x.n}`}
            </span>
          ))}
        </div>
      )}
      <div className="wk-scroll">
        <div className="wk-grid">
          {days.map((d, i) => (
            <div key={i} className={"wk-col" + (toISO(d) === todayIso ? " today" : "")}>
              <div className="wk-day">
                <span>{DAYS_SHORT[weekdayIndex(d)]}</span>
                <b>{d.getDate()}</b>
              </div>
              <div className="wk-evs">
                {byDay[i].map((it) => (
                  <span
                    key={it.id}
                    className="wk-ev"
                    style={{ background: MODULES[it.module].color, color: MODULES[it.module].text }}
                    title={it.title}
                  >
                    {!it.allDay && it.start && <em>{it.start}</em>}
                    <span className="wk-t">{it.title}</span>
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

const MONTHS_GEN_SHORT = ["січ", "лют", "бер", "квіт", "трав", "черв", "лип", "серп", "вер", "жовт", "лист", "груд"];

export function SummaryStep({
  answers,
  eventCount,
  onEdit,
  onBack,
  onNext,
}: {
  answers: Answers;
  eventCount: number;
  onEdit: (k: ModKey | "notify") => void;
  onBack: () => void;
  onNext: () => void;
}) {
  const A = answers;
  const [openSecs, setOpenSecs] = useState<Record<string, boolean>>({});
  const MEALS: [keyof FoodAnswers["meals"], string][] = [
    ["b", "сніданок"],
    ["l", "обід"],
    ["d", "вечеря"],
    ["s", "перекус"],
  ];
  const secs: { k: ModKey | "notify"; name: string; lines: string[] }[] = [];

  for (const k of MOD_KEYS) {
    if (!A.modules[k]) continue;
    let lines: string[] = [];
    if (A.skipped[k])
      lines = [
        "Крок пропущено — налаштувати можна пізніше в меню акаунта → «Налаштування модулів»",
      ];
    else if (k === "food") {
      const names = MEALS.filter(([m]) => A.food.meals[m]).map(([, n]) => n);
      lines = [
        names.length
          ? "Прийоми їжі: " + names.join(", ")
          : "Прийоми їжі не обрано",
        A.food.dishes.length
          ? "У бібліотеці страв: " + A.food.dishes.length
          : "Бібліотека страв поки порожня — наповните під час недільного планування",
      ];
    } else if (k === "fop") {
      const f = A.fop;
      const rows = fopDeadlines(f);
      const g = fopGroup(f);
      const head = !g
        ? f.how === "general"
          ? "Загальна система — дедлайни поки не ставляться автоматично"
          : "Групу не вказано — дедлайни не поставлено"
        : [
            `${g} група`,
            g === 3 ? (f.vat ? "3%, з ПДВ" : "5%, без ПДВ") : "",
            f.esv === "exempt" ? "без ЄСВ за себе" : "",
            fopHasStaff(f)
              ? "є виплати працівникам чи за договором"
              : g === 1
                ? ""
                : "без виплат працівникам",
          ]
            .filter(Boolean)
            .join(", ");
      lines = [
        head,
        rows.length
          ? `Дедлайни до кінця ${new Date().getFullYear() + 1} року у смузі «весь день»: ${rows.length}; найближчий — ${fmtDate(rows[0].date)}`
          : "Дедлайнів не знайдено",
        `Нагадування за ${f.lead} днів${f.d3 ? ", за 3 дні" : ""}${f.d0 ? ", у день дедлайну" : ""}`,
      ];
      if (!g) lines = [head];
    } else if (k === "hobby") {
      lines = A.hobby.acts.length
        ? A.hobby.acts.map((a) =>
            a.mode === "fixed"
              ? `${a.name || "Заняття"} — ${DOW.filter((_, i) => a.days[i]).join(", ") || "дні не обрано"} о ${a.time}, ${a.dur} хв`
              : `${a.name || "Заняття"} — ${a.n} р/тиждень по ${a.dur} хв, картки в рядку «без дня»`,
          )
        : ["Занять поки немає"];
    } else {
      const FQ = { alt: "через день", week: "раз на тиждень" } as const;
      A.pet.pets.forEach((p, pi) => {
        const nm =
          p.name.trim() ||
          (A.pet.pets.length > 1 ? `Тварина ${pi + 1}` : "Улюбленець");
        const before = lines.length;
        if (p.medOn)
          p.meds
            .filter((m) => m.name.trim())
            .forEach((m) =>
              lines.push(
                `${nm}: ${m.name.trim()} — ${m.freq === "daily" ? m.perDay + " р/день" : FQ[m.freq]}, ${m.course === "course" ? "курсом" + (m.days ? " " + m.days + " дн" : "") : "постійно"}`,
              ),
            );
        if (p.vaccOn) {
          const keys =
            p.kind === "other"
              ? (["generic"] as const)
              : (["complex", "rabies"] as const);
          const dated = keys.filter((vk) => p.vaccs[vk].last).length;
          lines.push(
            `${nm}: щеплення — ${dated ? "наступні дати пораховано, нагадування за 7 днів" : "дати не вказано, можна додати пізніше"}`,
          );
        }
        if (p.vetOn) {
          const parts: string[] = [];
          if (p.vetMode === "regular") {
            parts.push(p.vetLast ? `огляд кожні ${p.vetIv} міс від ${fmtDate(p.vetLast)}` : `огляд кожні ${p.vetIv} міс`);
          } else {
            if (p.vetDate) parts.push(`візит ${fmtDate(p.vetDate)}${p.vetTime ? " о " + p.vetTime : ""}`);
            if (p.vetReg) parts.push(`повторювати кожні ${p.vetIv} міс`);
          }
          lines.push(
            `${nm}: ветеринар — ${parts.length ? parts.join(", ") : "дати не вказано"}, нагадування за 1 день`,
          );
        }
        if (p.procOn) {
          const names = p.procs
            .filter((q) => q.name.trim())
            .map((q) => q.name.trim());
          if (names.length) lines.push(`${nm}: ${names.join(", ")}`);
        }
        if (lines.length === before) lines.push(`${nm}: нагадувань поки немає`);
      });
    }
    secs.push({
      k,
      name: ONB_MOD[k].name.charAt(0).toLowerCase() + ONB_MOD[k].name.slice(1),
      lines,
    });
  }
  // 14.11, 21:53: розділ «нагадування» в підсумку прибрано разом із кроком

  return (
    <div className="step">
      <StepHead
        title="ось що я додам у календар"
        sub={`перевірте і, якщо треба, поправте. подій, які зʼявляться автоматично: ${eventCount}.`}
      />
      <WeekPreview answers={A} />
      <div className="grouped">
        {secs.map((s) => {
          const isOpen = !!openSecs[s.k];
          return (
            <section key={s.k} className={"summary-row" + (isOpen ? " open" : "")}>
              <ModTile k={s.k as ModKey} size={44} />
              <div className="grow">
                <button
                  type="button"
                  className="summary-toggle"
                  aria-expanded={isOpen}
                  onClick={() => setOpenSecs({ ...openSecs, [s.k]: !isOpen })}
                >
                  <h2 className="summary-name">{s.name}</h2>
                </button>
                {isOpen && (
                  <div className="summary-lines">
                    {s.lines.map((l, i) => (
                      <p key={i}>{l}</p>
                    ))}
                  </div>
                )}
              </div>
              {/* 14.11, 22:34: «Редагувати» — іконка олівця; стрілка розгортання — праворуч */}
              <button type="button" className="summary-icon" aria-label={`Редагувати: ${s.name}`} title="Редагувати" onClick={() => onEdit(s.k)}>
                <Icon d={OI.edit} size={16} />
              </button>
              <button
                type="button"
                className="summary-icon plain"
                aria-label={isOpen ? `Згорнути: ${s.name}` : `Розгорнути: ${s.name}`}
                aria-expanded={isOpen}
                onClick={() => setOpenSecs({ ...openSecs, [s.k]: !isOpen })}
              >
                <Icon d={OI.chevronDown} size={14} className={isOpen ? "flip" : ""} />
              </button>
            </section>
          );
        })}
      </div>
      <StepNav
        onBack={onBack}
        onNext={onNext}
        nextLabel="Налаштувати Google Календар"
        nextIcon={OI.cal}
      />
    </div>
  );
}

/* ================= 9 · Google Календар ================= */

export function GoogleStep({
  onBack,
  onFinish,
  onWant,
  url,
  onUrl,
  busy,
}: {
  onBack: () => void;
  onFinish: () => void;
  onWant: () => void;
  /** секретна адреса у форматі iCal (18.11) */
  url?: string;
  onUrl: (url: string | undefined) => void;
  busy: boolean;
}) {
  const [asked, setAsked] = useState(!!url);
  const [value, setValue] = useState(url ?? "");
  const bad = !!value.trim() && !validIcalUrl(value);
  return (
    <div className="step">
      <div className="step-head">
        <h1>показувати робочі події з Google Календаря?</h1>
        <p className="step-sub">
          вони лягають шаром поверх ваших справ, щоб планувати тиждень навколо
          зустрічей.
        </p>
      </div>
      <section aria-label="Як це виглядає" className="preview-card">
        <div className="preview-top">
          <span className="head-font preview-day">вівторок</span>
          <span className="label-muted">так це виглядатиме</span>
        </div>
        <div aria-hidden="true" className="preview-grid">
          <div className="pv-row two">
            <span className="pv-time">07:00</span>
            <div
              className="pv-ev"
              style={{ background: ONB_MOD.hobby.bg, height: 52 }}
            >
              <b>Біг</b>
              <span>07:00–07:45</span>
            </div>
            <div className="pv-ev google" style={{ height: 40 }}>
              <b>Дзвінок</b>
              <span>Google · 07:00</span>
            </div>
          </div>
          <div className="pv-row">
            <span className="pv-time">08:30</span>
            <div className="pv-ev line" style={{ background: ONB_MOD.pet.bg }}>
              <b>Антигістамінне</b>
            </div>
          </div>
          <div className="pv-row">
            <span className="pv-time">13:00</span>
            <div className="pv-ev line google">
              <b>Зустріч з командою</b>
              <span>· Google</span>
            </div>
          </div>
        </div>
        <div className="preview-legend">
          <span>
            <i className="dot-fill" />
            ваші справи — із заливкою
          </span>
          <span>
            <i className="dot-dash" />
            Google — пунктиром
          </span>
        </div>
      </section>
      <div className="stack small-gap muted-lines">
        <p>
          Якщо справи перетинаються, обидва блоки стають поруч зі значком
          перетину.
        </p>
        <p>Оновлюється при відкритті застосунку й кожні ~15 хв.</p>
        <p>Шар вмикається й вимикається в меню акаунта.</p>
      </div>
      <div className="stack small-gap">
        <button
          type="button"
          className="connect-btn"
          onClick={() => {
            setAsked(true);
            onWant();
          }}
        >
          <Icon d={OI.cal} size={18} />
          Підключити Google Календар
        </button>
        {asked ? (
          <div className="stack small-gap">
            <IcalSteps />
            {/* 25.11: адреса — поле «підпис — значення», як у формі календаря */}
            <div className="qf-grid onb-grid">
              <QfRow k="адреса iCal">
                <PropInput
                  value={value}
                  onChange={(v) => {
                    setValue(v);
                    const t = v.trim();
                    onUrl(t && validIcalUrl(t) ? t.replace(/^webcal:/i, "https:") : undefined);
                  }}
                  placeholder="https://calendar.google.com/…/basic.ics"
                  label="Секретна адреса у форматі iCal"
                  inputMode="url"
                />
              </QfRow>
            </div>
            <p className={"hint xs" + (bad ? " error-text" : "")}>
              {bad
                ? "Це не схоже на секретну адресу iCal: вона починається з https://calendar.google.com/calendar/ical/ і закінчується на .ics"
                : "Адреса дає змогу лише читати календар. Її бачите тільки ви; змінити можна потім у меню акаунта."}
            </p>
          </div>
        ) : (
          <p className="hint xs">
            Знадобиться секретна адреса календаря з налаштувань Google — лише для перегляду.
          </p>
        )}
      </div>
      <StepNav
        onBack={onBack}
        onSkip={onFinish}
        onNext={onFinish}
        nextLabel={busy ? "Створюємо календар…" : "Далі"}
        busy={busy}
      />
    </div>
  );
}
