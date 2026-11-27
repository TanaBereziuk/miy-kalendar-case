import { useEffect, useRef, useState } from 'react';
import { isBirthday } from '../lib/birthday';
import { BdayNames } from './BdaySticker';
import { Sticker, StickerPicker } from './Stickers';
import { MODULES, type CalendarItem, type ModuleId } from '../types';
import { MONTHS_GEN, DAYS_SHORT, fromMinutes, sameDay, toISO, toMinutes } from '../lib/dates';
import { HOUR_PX, eventsWord, groupRange, isNight, isPast, pad2, periodOf, placeDay, visibleGroups } from '../lib/layout';
import { useNow } from '../lib/useNow';
import { ICONS, Icon } from './Icon';
import type { PendingAct } from '../App';
import type { CellSel } from './QuickAdd';
import { DISH_MIME } from '../food/FoodPanel';
import { MEAL_MIN, dishIdOf, isSlot, type Dish, type DishPlace } from '../food/dishes';
import { isGoogle } from '../lib/google';
import { ACT_MIME, PendingChips, pendingDrag } from './PendingChips';

/** Перетягування в сітці (харчування, 14.11): страва з бібліотеки або вже поставлена страва */
export const ITEM_MIME = 'application/x-miy-item';
/** Де саме взяли картку події (відстань від її верху, px): щоб після перетягування верх картки, а не курсор, визначав час (18.11) */
let dragGrab = 0;
/** Страва перетягується з сітки (етап 4, 23.11): тоді видно смугу «весь період» і підсвічено зону; тривалість — для підсвітки години */
let dragDish = false;
let dragDur = MEAL_MIN;
/** Модуль картки, яку тягнуть (26.11): колір прямокутника, куди вона ляже */
let dragModule: ModuleId = 'food';
const GROUP_MEAL: Record<string, string> = { morning: '08:00', day: '13:00', evening: '19:00' };
const dragKind = (e: React.DragEvent) =>
  e.dataTransfer.types.includes(DISH_MIME)
    ? 'dish'
    : e.dataTransfer.types.includes(ITEM_MIME)
      ? 'item'
      : e.dataTransfer.types.includes(ACT_MIME)
        ? 'act'
        : null;
/** Тягнуть страву — з бібліотеки або вже поставлену (етап 4, 23.11) */
const isDishDrag = (e: React.DragEvent) => {
  const k = dragKind(e);
  return k === 'dish' || (k === 'item' && dragDish && !pendingDrag.meta);
};
/** Тягнуть будь-яку картку з тижня чи страву з бібліотеки (26.11): видно смугу «весь період» і прямокутник, куди ляже.
 *  Справи з «цього тижня» — ні (у них свій блок-підказка). */
const isZoneDrag = (e: React.DragEvent) => {
  const k = dragKind(e);
  return k === 'dish' || (k === 'item' && !pendingDrag.meta);
};
/** Куди ляже страва: година, смуга групи чи весь період */
type DropKind = 'hour' | 'slot' | 'period';

interface Props {
  days: Date[];
  items: CalendarItem[];
  pending: PendingAct[];
  onPlan: (p: PendingAct) => void;
  /** справи без дати (етап 1, 18.11) — у рядку «цього тижня» */
  undated: CalendarItem[];
  onOpenUndated: (item: CalendarItem) => void;
  /** заняття «N разів на тиждень» перетягнули з «цього тижня» в день */
  onDropAct: (name: string, date: string, start: string) => void;
  showNight: boolean;
  onShowNight: (v: boolean) => void;
  collapsed: Set<string>;
  onToggleGroup: (id: string) => void;
  onOpen: (item: CalendarItem) => void;
  /** end — якщо діапазон протягнули мишею по сітці (18.11) */
  onCreate: (date: string, start?: string, end?: string) => void;
  /** slot — страву поклали в смугу групи («ранок», «день», «вечір») без точного часу */
  onDropDish?: (dishId: string, date: string, start: string, slot?: DishPlace) => void;
  /** start = '' — подію поклали в рядок «весь день» */
  onMoveItem?: (itemId: string, date: string, start: string, slot?: DishPlace) => void;
  /** нижній край події потягнули — новий кінець (18.11) */
  onResizeItem?: (itemId: string, end: string) => void;
  /** бібліотека страв — фото й «улюблена» для страв у тижні */
  dishes?: Dish[];
  /** клітинка, з якої зараз додають подію (швидке додавання) — виділена */
  selected?: CellSel | null;
  /** стікери днів (22.11) */
  stickers?: Record<string, string[]>;
  onStickers?: (iso: string, ids: string[]) => void;
}

/** Вигляд страви в тижні (16.11, 17:18; варіант E з артборду): фото фоном із затемненням зліва й білою назвою;
 *  без фото — колір харчування з чорною назвою. Улюблена — зірочка ліворуч від назви. */
function dishLook(item: CalendarItem, byId: Map<string, Dish>, period = false) {
  if (item.module !== 'food') return null;
  const id = dishIdOf(item.source);
  const d = id ? byId.get(id) : undefined;
  if (!d) return null;
  const photo = d.photoUrl;
  return {
    fav: d.fav,
    photo: !!photo,
    style: photo
      ? {
          backgroundColor: MODULES.food.color,
          // на весь період (етап 4): затемнення зверху під назвою, нижче — чисте фото
          backgroundImage: period
            ? `linear-gradient(180deg, rgba(0,0,0,.55) 0, rgba(0,0,0,.18) 56px, rgba(0,0,0,0) 45%), url("${photo}")`
            : `linear-gradient(90deg, rgba(0,0,0,.6), rgba(0,0,0,.25)), url("${photo}")`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          color: '#fff',
        }
      : period
        ? { background: `color-mix(in srgb, ${MODULES.food.color} 45%, #fff)`, color: MODULES.food.text }
        : { background: MODULES.food.color, color: MODULES.food.text },
  };
}

function DishTitle({ title, fav }: { title: string; fav: boolean }) {
  return (
    <span className="ev-dish-title">
      {fav && (
        <span className="ev-fav" role="img" aria-label="улюблена">
          <Icon d={MODULES.other.icon} size={9} />
        </span>
      )}
      <span className="ev-dish-t">{title}</span>
    </span>
  );
}

export function WeekView({ days, items: rawItems, pending, onPlan, undated, onOpenUndated, onDropAct, showNight, onShowNight, collapsed, onToggleGroup, onOpen, onCreate, onDropDish, onMoveItem, onResizeItem, dishes = [], selected, stickers = {}, onStickers }: Props) {
  const dishById = new Map(dishes.map((d) => [d.id, d]));
  // Зміна тривалості (18.11): тягнемо нижній край події, крок 15 хв; поки тягнемо — подія вже показана з новим кінцем
  const [resize, setResize] = useState<{ id: string; end: string } | null>(null);
  const resizing = useRef(false);
  const justResized = useRef(false);
  const items = resize ? rawItems.map((i) => (i.id === resize.id ? { ...i, end: resize.end } : i)) : rawItems;
  const startResize = (e: React.PointerEvent<HTMLSpanElement>, item: CalendarItem) => {
    if (!item.start) return;
    e.preventDefault();
    e.stopPropagation();
    const el = e.currentTarget;
    el.setPointerCapture(e.pointerId);
    resizing.current = true;
    const y0 = e.clientY;
    const s = toMinutes(item.start);
    const e0 = item.end ? toMinutes(item.end) : s + 60;
    let end = item.end ?? fromMinutes(e0);
    const move = (ev: PointerEvent) => {
      const delta = Math.round(((ev.clientY - y0) / HOUR_PX) * 4) * 15;
      end = fromMinutes(Math.min(Math.max(e0 + delta, s + 15), 24 * 60 - 1));
      setResize({ id: item.id, end });
    };
    const up = () => {
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
      resizing.current = false;
      justResized.current = true;
      window.setTimeout(() => (justResized.current = false), 0);
      setResize(null);
      if (end !== item.end) onResizeItem?.(item.id, end);
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
  };
  // Протягнути мишею по порожньому місцю дня (18.11): виділяється діапазон з кроком 15 хв, після відпускання —
  // вікно нової події саме на цей час. Звичайний клік, як і раніше, — година, на яку натиснули.
  const [range, setRange] = useState<{ iso: string; start: string; end: string } | null>(null);
  // стікери дня (22.11): натискання на шапку дня відкриває вибір
  const [stickerDay, setStickerDay] = useState<string | null>(null);
  const rangeDone = useRef<{ iso: string; start: string; end: string } | null>(null);
  const startRange = (e: React.PointerEvent<HTMLDivElement>, iso: string, g: { from: number; to: number }) => {
    if (e.target !== e.currentTarget || e.button !== 0 || e.pointerType === 'touch') return;
    e.preventDefault();
    const col = e.currentTarget;
    const top = col.getBoundingClientRect().top;
    const y0 = e.clientY - top;
    let moved = false;
    let cur: { iso: string; start: string; end: string } | null = null;
    const toMin = (y: number, up: boolean) => {
      const q = (y / HOUR_PX) * 4;
      const m = g.from * 60 + (up ? Math.ceil(q) : Math.floor(q)) * 15;
      return Math.min(Math.max(m, g.from * 60), Math.min(g.to * 60, 24 * 60 - 1));
    };
    const move = (ev: PointerEvent) => {
      const y = ev.clientY - top;
      if (!moved && Math.abs(y - y0) < 6) return;
      moved = true;
      const a = toMin(Math.min(y0, y), false);
      const b = Math.max(toMin(Math.max(y0, y), true), a + 15);
      cur = { iso, start: fromMinutes(a), end: fromMinutes(Math.min(b, 24 * 60 - 1)) };
      setRange(cur);
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      setRange(null);
      if (!moved || !cur) return;
      rangeDone.current = cur;
      // клік по дню (якщо відпустили над ним) відкриє вікно; інакше — відкриваємо тут
      window.setTimeout(() => {
        const r = rangeDone.current;
        if (!r) return;
        rangeDone.current = null;
        onCreate(r.iso, r.start, r.end);
      }, 0);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };
  const openEv = (it: CalendarItem) => {
    if (justResized.current) return;
    onOpen(it);
  };
  // Справу чи заняття тягнуть з «цього тижня» (етап 1, 18.11): у дні — місце на годину кольору модуля
  const [hover, setHover] = useState<{ iso: string; start: string } | null>(null);
  // Наведення на порожню годину (23.11): прямокутник по лініях сітки з тлом fill — видно, куди ляже нова подія
  const [cellHover, setCellHover] = useState<{ iso: string; h: number } | null>(null);
  // Страва (етап 4, 23.11): поки тягнемо — у кожному періоді смуга «весь період» праворуч, а зона, куди ляже страва, підсвічена
  const [dishDrag, setDishDrag] = useState(false);
  const [dropAt, setDropAt] = useState<{ iso: string; kind: DropKind; start: string; mod: ModuleId } | null>(null);
  useEffect(() => {
    // після того, як смуга «весь період» встигла прийняти страву (інакше вона зникає раніше за drop)
    const end = () =>
      window.setTimeout(() => {
        dragDish = false;
        dragModule = 'food';
        setDishDrag(false);
        setDropAt(null);
      }, 0);
    document.addEventListener('dragend', end, true);
    document.addEventListener('drop', end, true);
    return () => {
      document.removeEventListener('dragend', end, true);
      document.removeEventListener('drop', end, true);
    };
  }, []);
  const dropProps = (iso: string, startAt: (e: React.DragEvent<HTMLDivElement>) => string, slot: DishPlace = false, itemsOnly = false, preview = false, kind?: DropKind) => ({
    onDragOver: (e: React.DragEvent<HTMLDivElement>) => {
      const k = dragKind(e);
      if (!k || (itemsOnly && k !== 'item')) return;
      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer.dropEffect = k === 'dish' || k === 'act' ? 'copy' : 'move';
      // 26.11: година й весь період — для будь-якої картки; смуга групи — лише для страви
      if (kind && (kind === 'slot' ? isDishDrag(e) : isZoneDrag(e))) {
        // година й період — точний прямокутник; смуга групи — уся клітинка смуги
        const start = startAt(e);
        const mod: ModuleId = k === 'dish' ? 'food' : dragModule;
        if (!dropAt || dropAt.iso !== iso || dropAt.kind !== kind || dropAt.start !== start || dropAt.mod !== mod) setDropAt({ iso, kind, start, mod });
        if (kind !== 'slot') return;
      }
      e.currentTarget.classList.add('drop-on');
      if (pendingDrag.meta) {
        const start = preview ? startAt(e) : '';
        if (!hover || hover.iso !== iso || hover.start !== start) setHover(preview ? { iso, start } : null);
      }
    },
    onDragLeave: (e: React.DragEvent<HTMLDivElement>) => {
      if (e.relatedTarget instanceof Node && e.currentTarget.contains(e.relatedTarget)) return;
      e.currentTarget.classList.remove('drop-on');
      if (kind && dropAt?.iso === iso && dropAt.kind === kind) setDropAt(null);
    },
    onDrop: (e: React.DragEvent<HTMLDivElement>) => {
      e.currentTarget.classList.remove('drop-on');
      e.stopPropagation();
      setHover(null);
      setDropAt(null);
      const dish = e.dataTransfer.getData(DISH_MIME);
      const item = e.dataTransfer.getData(ITEM_MIME);
      const act = e.dataTransfer.getData(ACT_MIME);
      if (!dish && !item && !act) return;
      e.preventDefault();
      const start = startAt(e);
      pendingDrag.meta = null;
      if (dish) onDropDish?.(dish, iso, start, slot);
      else if (act) onDropAct(act, iso, start || '18:00');
      else onMoveItem?.(item, iso, start, slot);
    },
  });
  const now = useNow();
  const groups = visibleGroups(showNight);

  // страви без точного часу лежать у смузі групи, а не в сітці годин
  const slotsByDay = new Map<string, CalendarItem[]>();
  // страви на весь період (етап 4) — фоном під подіями, не займають місця в розкладці
  const periodsByDay = new Map<string, CalendarItem[]>();
  const byDay = new Map<string, CalendarItem[]>();
  for (const it of items) {
    if (periodOf(it)) {
      const l = periodsByDay.get(it.date) ?? [];
      l.push(it);
      periodsByDay.set(it.date, l);
      continue;
    }
    if (!it.allDay && it.start && isSlot(it.source)) {
      const l = slotsByDay.get(it.date) ?? [];
      l.push(it);
      slotsByDay.set(it.date, l);
      continue;
    }
    const list = byDay.get(it.date) ?? [];
    list.push(it);
    byDay.set(it.date, list);
  }

  // Страви на весь період (26.11, ніч): показуються стопкою фото на смузі групи, а не в сітці годин
  const isMeal = (it: CalendarItem) => it.module === 'food' && !!dishIdOf(it.source);
  const periodItems = (iso: string, gid: string) =>
    (periodsByDay.get(iso) ?? []).filter((it) => periodOf(it)?.id === gid).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const coverDrag = (e: React.DragEvent, it: CalendarItem) => {
    e.stopPropagation();
    dragGrab = 0;
    dragDish = true;
    dragModule = it.module;
    dragDur = MEAL_MIN;
    e.dataTransfer.setData(ITEM_MIME, it.id);
    e.dataTransfer.effectAllowed = 'move';
  };

  // День з подією на весь день фарбується в колір її модуля (17.11): світлий відтінок — у CSS (.day-tint)
  const tint = (d: Date): { className: string; style?: React.CSSProperties } => {
    const first = (byDay.get(toISO(d)) ?? []).find((i) => i.allDay && !isGoogle(i) && !isBirthday(i));
    return first ? { className: ' day-tint', style: { ['--day-tint' as string]: MODULES[first.module].color, ['--day-tint-pct' as string]: first.module === 'other' ? '10%' : '30%' } } : { className: '' };
  };

  const nowMin = now.getHours() * 60 + now.getMinutes();
  // Перетин зі справою з Google Календаря (18.11): своя подія, що накладається на Google, — зі значком перетину
  const clashes = (it: CalendarItem): boolean => {
    if (isGoogle(it) || it.allDay || !it.start) return false;
    const s0 = toMinutes(it.start);
    const e0 = it.end ? toMinutes(it.end) : s0 + 60;
    return (byDay.get(it.date) ?? []).some((g) => {
      if (!isGoogle(g) || g.allDay || !g.start) return false;
      const s1 = toMinutes(g.start);
      const e1 = g.end ? toMinutes(g.end) : s1 + 60;
      return s0 < e1 && s1 < e0;
    });
  };
  const nowLabel = `${pad2(now.getHours())}:${pad2(now.getMinutes())}`;

  const hiddenNight = showNight
    ? 0
    : days.reduce((n, d) => n + (byDay.get(toISO(d)) ?? []).filter(isNight).length, 0);

  return (
    <div
      className={'week' + (dishDrag ? ' dish-dragging' : '')}
      onDragOverCapture={(e) => {
        if (!dishDrag && isZoneDrag(e)) setDishDrag(true);
      }}
    >
      <div className="week-row week-head">
        <div />
        {days.map((d, i) => {
          const today = sameDay(d, now);
          return (
            <div key={toISO(d)} className={'day-head' + (today ? ' today' : '') + tint(d).className} style={tint(d).style}>
              <button
                type="button"
                className="day-head-btn"
                aria-label={`Стікери на ${d.getDate()} ${MONTHS_GEN[d.getMonth()]}`}
                title="Додати стікер"
                onClick={() => setStickerDay(stickerDay === toISO(d) ? null : toISO(d))}
              />
              <div className="dow">{DAYS_SHORT[i]}</div>
              <div className="num-line">
                <span className="num">{d.getDate()}</span>
                {today && <span className="today-badge">сьогодні</span>}
              </div>
              {(() => {
                const own = stickers[toISO(d)] ?? [];
                const ids = (byDay.get(toISO(d)) ?? []).some(isBirthday) && !own.includes('cake') ? ['cake', ...own] : own;
                return ids.length > 0 && (
                  <div className="day-stickers">
                    {ids.map((id, k) => (
                      <Sticker key={id} id={id} size={ids.length > 2 ? 40 : 52} i={k} />
                    ))}
                  </div>
                );
              })()}
              {stickerDay === toISO(d) && (
                <StickerPicker
                  title={`${d.getDate()} ${MONTHS_GEN[d.getMonth()]}`}
                  chosen={stickers[toISO(d)] ?? []}
                  onToggle={(id) => {
                    const cur = stickers[toISO(d)] ?? [];
                    onStickers?.(toISO(d), cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id].slice(-4));
                  }}
                  onClear={() => onStickers?.(toISO(d), [])}
                  onClose={() => setStickerDay(null)}
                />
              )}
            </div>
          );
        })}
      </div>

      <div className="week-row allday-row">
        <div className="side-label">весь день</div>
        {days.map((d) => {
          const iso = toISO(d);
          const list = (byDay.get(iso) ?? []).filter((i) => i.allDay);
          return (
            <div
              key={iso}
              className={'allday-cell' + (sameDay(d, now) ? ' today' : '') + tint(d).className + (selected && !selected.start && selected.date === iso ? ' cell-selected' : '')}
              style={tint(d).style}
              {...dropProps(iso, () => '', false, true)}
            >
              {list.some(isBirthday) && <BdayNames items={list.filter(isBirthday)} date={iso} onOpen={openEv} />}
              {list.filter((i) => !isBirthday(i)).map((it) => (
                <button
                  type="button"
                  key={it.id}
                  className={'pill allday-text' + (isPast(it, now) ? ' past' : '') + (isGoogle(it) ? ' google-pill' : '')}
                  onClick={() => openEv(it)}
                  draggable={!isGoogle(it)}
                  onDragStart={(e) => {
                    dragGrab = 0;
                    dragDish = false;
                    dragModule = it.module;
                    e.dataTransfer.setData(ITEM_MIME, it.id);
                    e.dataTransfer.effectAllowed = 'move';
                  }}
                >
                  <span className="allday-t">{it.title}</span>
                </button>
              ))}
              <button type="button" className="allday-add" aria-label="Додати подію на весь день" onClick={() => onCreate(iso)} />
            </div>
          );
        })}
      </div>

      {(pending.length > 0 || undated.length > 0) && (
        <div className="week-row pending-row">
          <div className="side-label">цього тижня</div>
          <div className="pending-body">
            <span className="muted-text pending-hint">перетягніть у день або натисніть, щоб обрати день і час</span>
            <PendingChips acts={pending} undated={undated} onPlan={onPlan} onOpenUndated={onOpenUndated} draggable onDragEnd={() => setHover(null)} />
          </div>
        </div>
      )}

      {groups.map((g) => {
        const open = !collapsed.has(g.id);
        const hours = Array.from({ length: g.to - g.from }, (_, i) => g.from + i);
        const count = days.reduce(
          (n, d) => n + placeDay(byDay.get(toISO(d)) ?? [], [g.from, g.to]).length,
          0,
        );
        return (
          <section key={g.id} className="week-group" aria-label={`${g.name} ${groupRange(g)}`}>
            <div className="week-row group-head">
              <div className="group-side hatch">
                <button
                  type="button"
                  className="group-toggle"
                  aria-expanded={open}
                  onClick={() => onToggleGroup(g.id)}
                >
                  <Icon d={open ? ICONS.down : ICONS.next} size={8} />
                  {g.name}
                </button>
              </div>
              {days.map((d, i) => {
                const inGroup = (it: CalendarItem) => {
                  const h = Number(it.start!.slice(0, 2));
                  return h >= g.from && h < g.to;
                };
                // 27.11 (правка власниці): на смузі групи лише страви — і без точного часу (#slot), і на весь період —
                // однією стопкою фото, що виглядає знизу; окремих карток 22 для страв на смузі більше немає
                const slotMeals = (slotsByDay.get(toISO(d)) ?? []).filter((it) => isMeal(it) && inGroup(it));
                const meals = [...periodItems(toISO(d), g.id).filter(isMeal), ...slotMeals].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
                const slots = [...(slotsByDay.get(toISO(d)) ?? []).filter((it) => !isMeal(it)), ...(open ? [] : (periodsByDay.get(toISO(d)) ?? []).filter((it) => !isMeal(it)))]
                  .filter(inGroup)
                  .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
                return (
                  <div
                    key={toISO(d)}
                    className={'group-cell hatch' + (sameDay(d, now) ? ' today' : '') + (slots.length ? ' has-slots' : '') + (meals.length ? ' has-stack' : '') + tint(d).className + (dropAt?.kind === 'slot' && dropAt.iso === toISO(d) && dropAt.start === (GROUP_MEAL[g.id] ?? fromMinutes(g.from * 60)) ? ' drop-zone-head' : '')}
                    style={tint(d).style}
                    {...dropProps(toISO(d), () => GROUP_MEAL[g.id] ?? fromMinutes(g.from * 60), true, false, false, 'slot')}
                  >
                    {i === 0 && !meals.length && <span className="range-chip">{groupRange(g)}</span>}
                    {meals.length > 0 && (
                      // Страви на весь період (26.11, ніч; ескіз власниці): стопка фото віялом стирчить зі смуги групи,
                      // низ обрізано лінією смуги; натискання на фото відкриває страву, фото можна тягнути
                      <div className={'period-stack n' + Math.min(3, meals.length) + (meals.every((it) => isPast(it, now)) ? ' past' : '')}>
                        {meals.slice(0, 3).map((it) => {
                          const dish = dishById.get(dishIdOf(it.source)!);
                          const photo = dish?.photoUrl;
                          return (
                            <button
                              type="button"
                              key={it.id}
                              className={'stack-cover' + (photo ? '' : ' no-photo')}
                              // 26.11, ніч: назва страви вгорі фото — біла на затемненні зверху (без фото — ink)
                              style={photo ? { backgroundImage: `linear-gradient(180deg, rgba(0,0,0,.55) 0, rgba(0,0,0,0) 75%), url("${photo}")` } : undefined}
                              title={`${it.title} · ${g.name}, ${isSlot(it.source) ? 'без точного часу' : groupRange(g)}`}
                              aria-label={`${it.title}, ${g.name}`}
                              onClick={() => openEv(it)}
                              draggable
                              onDragStart={(e) => coverDrag(e, it)}
                            >
                              <span className="stack-title">
                                {dish?.fav && (
                                  <span className="ev-fav" role="img" aria-label="улюблена">
                                    <Icon d={MODULES.other.icon} size={9} />
                                  </span>
                                )}
                                <span className="stack-title-t">{it.title}</span>
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                    {i === 1 && !open && count > 0 && (
                      <span className="range-chip muted">
                        {count} {eventsWord(count)}
                      </span>
                    )}
                    {slots.map((it) => {
                      const look = dishLook(it, dishById);
                      return (
                        <button
                          type="button"
                          key={it.id}
                          className={'event slot-event' + (isPast(it, now) ? ' past' : '')}
                          style={look?.style ?? { background: MODULES[it.module].color, color: MODULES[it.module].text }}
                          onClick={() => openEv(it)}
                          draggable
                          onDragStart={(e) => {
                            dragGrab = 0; // мала картка зі смуги групи: час — за годиною під курсором
                            dragDish = !!look;
                            dragModule = it.module;
                            dragDur = look ? MEAL_MIN : 60;
                            e.dataTransfer.setData(ITEM_MIME, it.id);
                            e.dataTransfer.effectAllowed = 'move';
                          }}
                        >
                          <DishTitle title={it.title} fav={!!look?.fav} />
                        </button>
                      );
                    })}
                  </div>
                );
              })}
            </div>

            {open && (
              <div className="week-row group-body">
                <div className="hour-labels">
                  {hours.map((h) => (
                    <div key={h} className="hour-label" style={{ height: HOUR_PX }}>
                      {pad2(h)}:00
                    </div>
                  ))}
                </div>
                {days.map((d) => {
                  const iso = toISO(d);
                  const placed = placeDay(byDay.get(iso) ?? [], [g.from, g.to]);
                  const today = sameDay(d, now);
                  const showNow = today && nowMin >= g.from * 60 && nowMin < g.to * 60;
                  return (
                    <div
                      key={iso}
                      className={'day-col' + (today ? ' today' : '') + tint(d).className}
                      style={{ height: hours.length * HOUR_PX, ...tint(d).style }}
                      {...dropProps(iso, (e) => {
                        // 18.11: картка стає на початок години — подія за найближчою годиною до свого верху
                        // (з урахуванням місця, за яке її взяли), страва з бібліотеки й справа з «цього тижня» — на годину під курсором
                        const y = e.clientY - e.currentTarget.getBoundingClientRect().top;
                        const isItem = e.dataTransfer.types.includes(ITEM_MIME) && !pendingDrag.meta;
                        const h = isItem ? Math.round((y - dragGrab) / HOUR_PX) : Math.floor(y / HOUR_PX);
                        const min = (g.from + Math.max(0, Math.min(hours.length - 1, h))) * 60;
                        return fromMinutes(min);
                      }, false, false, true, 'hour')}
                      onPointerDown={(e) => startRange(e, iso, g)}
                      onMouseMove={(e) => {
                        const h = e.target === e.currentTarget && !e.buttons ? g.from + Math.floor(e.nativeEvent.offsetY / HOUR_PX) : null;
                        if (h === null) return cellHover && setCellHover(null);
                        if (!cellHover || cellHover.iso !== iso || cellHover.h !== h) setCellHover({ iso, h });
                      }}
                      onMouseLeave={() => setCellHover(null)}
                      onClick={(e) => {
                        if (e.target !== e.currentTarget) return;
                        const r = rangeDone.current;
                        if (r) {
                          rangeDone.current = null;
                          return onCreate(r.iso, r.start, r.end);
                        }
                        const h = g.from + Math.floor(e.nativeEvent.offsetY / HOUR_PX);
                        onCreate(iso, fromMinutes(h * 60));
                      }}
                    >
                      {(() => {
                        // Весь період «ранок / день / вечір» (26.11): будь-яка подія, крім страв, — картка кольору модуля
                        // на всю висоту періоду під іншими подіями; кліки проходять крізь неї — натискати й тягнути за назву.
                        // Страви на весь період — стопкою фото на смузі групи (див. вище).
                        const others = periodItems(iso, g.id).filter((it) => !isMeal(it));
                        if (!others.length) return null;
                        const lanes = others.length;
                        const pos = (k: number): React.CSSProperties => ({
                          top: 1,
                          height: (g.to - g.from) * HOUR_PX - 2,
                          left: `calc(${(k / lanes) * 100}% + 3px)`,
                          width: `calc(${100 / lanes}% - 6px)`,
                        });
                        const startDrag = (e: React.DragEvent, it: CalendarItem) => {
                          e.stopPropagation();
                          dragGrab = 0;
                          dragDish = false;
                          dragModule = it.module;
                          dragDur = 60;
                          e.dataTransfer.setData(ITEM_MIME, it.id);
                          e.dataTransfer.effectAllowed = 'move';
                        };
                        const out: React.ReactNode[] = [];
                        others.forEach((it, k) => {
                          const m = MODULES[it.module];
                          out.push(
                            <div
                              key={it.id}
                              className={'period-card period-event' + (isPast(it, now) ? ' past' : '')}
                              style={{ ...pos(k), ['--pc' as string]: m.color, ['--pc-pct' as string]: it.module === 'other' ? '10%' : '30%' }}
                            >
                              <button type="button" className="period-head" onClick={() => openEv(it)} draggable={!isGoogle(it)} onDragStart={(e) => startDrag(e, it)}>
                                <span className="period-title">{it.title}</span>
                                <span className="period-sub">
                                  {it.start}–{it.end}
                                </span>
                              </button>
                            </div>,
                          );
                        });
                        return out;
                      })()}
                      {placed.map(({ item, top, height, lane, lanes, short }) => {
                        const m = MODULES[item.module];
                        const compact = height < 44 && !short;
                        const look = dishLook(item, dishById);
                        return (
                          <button
                            type="button"
                            key={item.id}
                            className={'event' + (compact ? ' compact' : '') + (short ? ' short' : '') + (look ? ' dish-event' : '') + (isPast(item, now) ? ' past' : '') + (resize?.id === item.id ? ' resizing' : '') + (isGoogle(item) ? ' google-event' : '') + (clashes(item) ? ' clash' : '')}
                            style={{
                              top: top + 1,
                              height: height - 2,
                              left: `calc(${(lane / lanes) * 100}% + 3px)`,
                              width: `calc(${100 / lanes}% - 6px)`,
                              ...(isGoogle(item) ? {} : look?.style ?? { background: m.color, color: m.text }),
                            }}
                            onClick={() => openEv(item)}
                            draggable={!isGoogle(item)}
                            onDragStart={(e) => {
                              if (resizing.current) return e.preventDefault();
                              dragGrab = e.clientY - e.currentTarget.getBoundingClientRect().top;
                              dragDish = !!look;
                              dragModule = item.module;
                              dragDur = item.end ? Math.max(15, toMinutes(item.end) - toMinutes(item.start!)) : MEAL_MIN;
                              e.dataTransfer.setData(ITEM_MIME, item.id);
                              e.dataTransfer.effectAllowed = 'move';
                            }}
                          >
                            {look ? (
                              <DishTitle title={item.title} fav={look.fav} />
                            ) : (
                              <>
                            {!compact && !short && <span className="ev-title">{item.title}</span>}
                            <span className="ev-time">
                              <span className="ev-time-t">
                                {item.start}
                                {!compact && !short && item.end ? `–${item.end}` : ''}
                              </span>
                              {(compact || short) && <span className="ev-title-inline">{item.title}</span>}
                            </span>
                              </>
                            )}
                            {clashes(item) && <span className="ev-clash" role="img" aria-label="перетинається з Google Календарем" title="Перетинається з подією з Google Календаря" />}
                            {onResizeItem && !isGoogle(item) && (
                              <span
                                className="ev-resize"
                                aria-hidden="true"
                                onPointerDown={(e) => startResize(e, item)}
                                onMouseDown={(e) => e.preventDefault()}
                                onClick={(e) => e.stopPropagation()}
                              />
                            )}
                          </button>
                        );
                      })}
                      {range && range.iso === iso && (() => {
                        const a = toMinutes(range.start);
                        const b = toMinutes(range.end);
                        if (a < g.from * 60 || a >= g.to * 60) return null;
                        return (
                          <div
                            className="cell-selected-block cell-rect range-block"
                            style={{ top: ((a - g.from * 60) / 60) * HOUR_PX, height: ((b - a) / 60) * HOUR_PX + 1 }}
                            aria-hidden="true"
                          >
                            <span>{range.start}–{range.end}</span>
                          </div>
                        );
                      })()}
                      {Object.entries(stickers)
                        .filter(([k, ids]) => k.startsWith(iso + 'T') && ids.length)
                        .map(([k, ids]) => {
                          // Стікери клітинки (23.11): праворуч угорі години, 36 (два — накладаються на −10), поверх подій, не заважають клікам
                          const m = toMinutes(k.slice(11));
                          if (m < g.from * 60 || m >= g.to * 60) return null;
                          return (
                            <div key={k} className="cell-stickers" style={{ top: ((m - g.from * 60) / 60) * HOUR_PX + 4 }}>
                              {ids.map((id, n) => (
                                <Sticker key={id} id={id} size={36} i={n + 1} />
                              ))}
                            </div>
                          );
                        })}
                      {!range && cellHover && cellHover.iso === iso && cellHover.h >= g.from && cellHover.h < g.to &&
                        !(selected?.start && selected.date === iso && toMinutes(selected.start) === cellHover.h * 60) && (
                          <div className="cell-hover" style={{ top: (cellHover.h - g.from) * HOUR_PX, height: HOUR_PX + 1 }} aria-hidden="true" />
                        )}
                      {!range && selected?.start && selected.date === iso && (() => {
                        // Виділена клітинка (18.11, 10:20): блок на місці майбутньої події — сірий, після вибору модуля — його кольором
                        const s = toMinutes(selected.start);
                        const e = selected.end ? toMinutes(selected.end) : s + 60;
                        if (s < g.from * 60 || s >= g.to * 60) return null;
                        const top = ((s - g.from * 60) / 60) * HOUR_PX;
                        const height = (Math.max(15, Math.min(e, g.to * 60) - s) / 60) * HOUR_PX;
                        const m = selected.module ? MODULES[selected.module] : null;
                        return (
                          <div
                            className={'cell-selected-block cell-rect' + (m ? ' with-module' : '')}
                            style={{ top, height: height + 1, ...(m ? { background: m.color } : {}) }}
                            aria-hidden="true"
                          />
                        );
                      })()}
                      {hover && hover.iso === iso && pendingDrag.meta && (() => {
                        // Куди ляже справа з «цього тижня» (етап 1): блок кольору модуля з обводкою 1.5 ink
                        const meta = pendingDrag.meta;
                        const s = toMinutes(hover.start);
                        if (s < g.from * 60 || s >= g.to * 60) return null;
                        const m = MODULES[meta.module];
                        const e2 = Math.min(s + meta.dur, g.to * 60);
                        return (
                          <div
                            className="cell-selected-block with-module drop-preview"
                            style={{ top: ((s - g.from * 60) / 60) * HOUR_PX + 1, height: ((e2 - s) / 60) * HOUR_PX - 2, background: m.color, color: m.text }}
                            aria-hidden="true"
                          >
                            <b>{meta.title}</b>
                            <span>
                              {hover.start}–{fromMinutes(Math.min(s + meta.dur, 24 * 60 - 1))}
                            </span>
                          </div>
                        );
                      })()}
                      {dropAt && dropAt.iso === iso && dropAt.kind !== 'slot' && (() => {
                        // Куди ляже страва (етап 4): година — прямокутник на тривалість страви, період — уся висота періоду
                        const s0 = toMinutes(dropAt.start);
                        if (s0 < g.from * 60 || s0 >= g.to * 60) return null;
                        const e0 = dropAt.kind === 'period' ? g.to * 60 : Math.min(s0 + dragDur, g.to * 60);
                        return (
                          <div
                            className={'cell-rect drop-zone' + (dropAt.kind === 'period' ? ' period' : '') + (dropAt.mod === 'other' ? ' neutral' : '')}
                            style={{ top: ((s0 - g.from * 60) / 60) * HOUR_PX, height: ((e0 - s0) / 60) * HOUR_PX + 1, ['--zone' as string]: MODULES[dropAt.mod].color }}
                            aria-hidden="true"
                          >
                            <span>{dropAt.kind === 'period' ? `${g.name} · ${groupRange(g)}` : `${dropAt.start}–${fromMinutes(Math.min(s0 + dragDur, 24 * 60 - 1))}`}</span>
                          </div>
                        );
                      })()}
                      {dishDrag && (
                        <div
                          className={'period-drop' + (dropAt?.kind === 'period' && dropAt.iso === iso && toMinutes(dropAt.start) === g.from * 60 ? ' on' : '')}
                          {...dropProps(iso, () => fromMinutes(g.from * 60), 'period', false, false, 'period')}
                        >
                          <span>весь період</span>
                        </div>
                      )}
                      {showNow && (
                        <div className="now-line" style={{ top: ((nowMin - g.from * 60) / 60) * HOUR_PX }} aria-hidden="true">
                          <span>{nowLabel}</span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        );
      })}

      <div className="week-row night-row">
        <div className="night-side">
          <div className="night-name">ніч</div>
          <div className="night-range">22–06</div>
        </div>
        <div className="night-body">
          {showNight ? (
            <span className="muted-text">Ніч показано зверху і знизу сітки.</span>
          ) : (
            <span className="muted-text">
              Прихована · {hiddenNight > 0 ? `${hiddenNight} ${eventsWord(hiddenNight)} цього тижня` : 'подій немає'}
            </span>
          )}
          <button type="button" className="btn tinted small" onClick={() => onShowNight(!showNight)}>
            {showNight ? 'Сховати ніч' : 'Показати ніч'}
          </button>
        </div>
      </div>
    </div>
  );
}
