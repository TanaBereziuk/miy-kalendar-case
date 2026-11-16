import type { CalendarItem } from '../types';
import { toMinutes } from './dates';

export const HOUR_PX = 56;
export const MIN_EVENT_MIN = 30;

export interface Group {
  id: string;
  name: string;
  from: number;
  to: number;
  night?: boolean;
}

export const GROUPS: Group[] = [
  { id: 'night-early', name: 'ніч', from: 0, to: 6, night: true },
  { id: 'morning', name: 'ранок', from: 6, to: 12 },
  { id: 'day', name: 'день', from: 12, to: 18 },
  { id: 'evening', name: 'вечір', from: 18, to: 22 },
  { id: 'night-late', name: 'ніч', from: 22, to: 24, night: true },
];

export function visibleGroups(showNight: boolean): Group[] {
  return GROUPS.filter((g) => showNight || !g.night);
}

export function groupOf(item: CalendarItem): Group | null {
  if (item.allDay || !item.start) return null;
  const h = toMinutes(item.start) / 60;
  return GROUPS.find((g) => h >= g.from && h < g.to) ?? null;
}

export function isNight(item: CalendarItem): boolean {
  return !!groupOf(item)?.night;
}

export const pad2 = (n: number) => String(n).padStart(2, '0');
export const groupRange = (g: Group) => `${pad2(g.from)}:00–${pad2(g.to % 24)}:00`;

export interface Placed {
  item: CalendarItem;
  top: number;
  height: number;
  lane: number;
  lanes: number;
}

/** Розкладає справи одного дня в межах години from–to, щоб ті, що перетинаються, стояли поруч. */
export function placeDay(items: CalendarItem[], range: [number, number]): Placed[] {
  const [fromH, toH] = range;
  const timed = items
    .filter((i) => !i.allDay && i.start)
    .map((i) => {
      const s = toMinutes(i.start!);
      let e = i.end ? toMinutes(i.end) : s + 60;
      if (e <= s) e = s + 60;
      return { item: i, s, e: Math.max(e, s + MIN_EVENT_MIN) };
    })
    // справа належить групі, в якій починається
    .filter((x) => x.s >= fromH * 60 && x.s < toH * 60)
    .sort((a, b) => a.s - b.s || b.e - a.e);

  const out: Placed[] = [];
  let cluster: { x: (typeof timed)[number]; lane: number }[] = [];
  let clusterEnd = -1;
  let laneEnds: number[] = [];

  const flush = () => {
    const lanes = laneEnds.length || 1;
    for (const c of cluster) {
      const s = c.x.s;
      const e = Math.min(c.x.e, toH * 60);
      out.push({
        item: c.x.item,
        top: ((s - fromH * 60) / 60) * HOUR_PX,
        height: Math.max(((e - s) / 60) * HOUR_PX, 24),
        lane: c.lane,
        lanes,
      });
    }
    cluster = [];
    laneEnds = [];
  };

  for (const x of timed) {
    if (x.s >= clusterEnd && cluster.length) flush();
    let lane = laneEnds.findIndex((end) => end <= x.s);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(x.e);
    } else {
      laneEnds[lane] = x.e;
    }
    cluster.push({ x, lane });
    clusterEnd = Math.max(clusterEnd, x.e);
  }
  if (cluster.length) flush();
  return out;
}

export function sortByTime(items: CalendarItem[]): CalendarItem[] {
  return [...items].sort((a, b) => (a.start ?? '').localeCompare(b.start ?? '') || a.title.localeCompare(b.title));
}

/** «подія / події / подій» */
export function eventsWord(n: number): string {
  const a = n % 10;
  const b = n % 100;
  if (a === 1 && b !== 11) return 'подія';
  if (a >= 2 && a <= 4 && (b < 12 || b > 14)) return 'події';
  return 'подій';
}
