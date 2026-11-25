// Дні народження (22.11): у «весь день» — імена на синій підкладці; день не фарбується, у шапці дня — мемний тортик (Stickers.tsx).
import type { CalendarItem } from '../types';
import { bdayName, bdaySub } from '../lib/birthday';

/** Підпис у «весь день»: імена на синій підкладці; кожне ім'я відкриває свою подію */
export function BdayNames({ items, date, onOpen }: { items: CalendarItem[]; date: string; onOpen: (it: CalendarItem) => void }) {
  return (
    <div className="bday-names">
      {items.map((it) => (
        <button key={it.id} type="button" className="bday-name" onClick={() => onOpen(it)} title={bdaySub(it, date)}>
          {bdayName(it)}
          {items.length === 1 && <small>{bdaySub(it, date)}</small>}
        </button>
      ))}
    </div>
  );
}
