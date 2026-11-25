// «цього тижня» (етап 1 плану, 18.11; макет PendingRow): заняття «N разів на тиждень» і справи без дати
// з будь-якого модуля. Чип — біла капсула з пунктиром кольору модуля і плиткою з іконкою.
// На ноутбуці чип перетягують у день або натискають (вікно з днем і часом); на телефоні — натискають.
import { MODULES, type CalendarItem, type ModuleId } from '../types';
import type { PendingAct } from '../App';
import { timesWord } from '../lib/layout';
import { ICONS, Icon } from './Icon';

/** Перетягування заняття «N разів на тиждень» з рядка «цього тижня» */
export const ACT_MIME = 'application/x-miy-act';
/** Перетягування справи без дати (те саме, що й події: ITEM_MIME у WeekView) */
export const UNDATED_ITEM_MIME = 'application/x-miy-item';

/** Що зараз тягнуть із «цього тижня»: модуль і тривалість — щоб у дні показати місце, куди воно ляже */
export const pendingDrag: { meta: { module: ModuleId; dur: number; title: string } | null } = { meta: null };

interface Props {
  acts: PendingAct[];
  undated: CalendarItem[];
  onPlan: (p: PendingAct) => void;
  onOpenUndated: (item: CalendarItem) => void;
  /** ноутбук — чипи можна перетягувати */
  draggable?: boolean;
  onAdd?: () => void;
  onDragEnd?: () => void;
}

function Chip({ module, children, onClick, drag, onDragEnd }: { module: ModuleId; children: React.ReactNode; onClick: () => void; drag?: (e: React.DragEvent) => void; onDragEnd?: () => void }) {
  const m = MODULES[module];
  return (
    <button
      type="button"
      className="pending-chip"
      style={{ borderColor: m.dot }}
      onClick={onClick}
      draggable={!!drag}
      onDragStart={(e) => {
        drag?.(e);
        e.currentTarget.classList.add('dragging');
      }}
      onDragEnd={(e) => {
        e.currentTarget.classList.remove('dragging');
        pendingDrag.meta = null;
        onDragEnd?.();
      }}
    >
      <span className="pending-tile" style={{ background: m.color, color: m.text }}>
        <Icon d={m.icon} size={12} />
      </span>
      {children}
    </button>
  );
}

export function PendingChips({ acts, undated, onPlan, onOpenUndated, draggable, onAdd, onDragEnd }: Props) {
  return (
    <>
      {acts.map((p) => (
        <Chip
          key={'act-' + p.name}
          module="hobby"
          onClick={() => onPlan(p)}
          onDragEnd={onDragEnd}
          drag={
            draggable
              ? (e) => {
                  pendingDrag.meta = { module: 'hobby', dur: p.dur, title: p.name };
                  e.dataTransfer.setData(ACT_MIME, p.name);
                  e.dataTransfer.effectAllowed = 'copy';
                }
              : undefined
          }
        >
          {p.name}
          <span className="pending-count">
            ще {p.total - p.done} {timesWord(p.total - p.done)}
          </span>
        </Chip>
      ))}
      {undated.map((it) => (
        <Chip
          key={it.id}
          module={it.module}
          onClick={() => onOpenUndated(it)}
          onDragEnd={onDragEnd}
          drag={
            draggable
              ? (e) => {
                  pendingDrag.meta = { module: it.module, dur: 60, title: it.title };
                  e.dataTransfer.setData(UNDATED_ITEM_MIME, it.id);
                  e.dataTransfer.effectAllowed = 'move';
                }
              : undefined
          }
        >
          <span className="pending-name">{it.title}</span>
        </Chip>
      ))}
      {onAdd && (
        <button type="button" className="text-add pending-add" onClick={onAdd}>
          <Icon d={ICONS.plus} size={12} />
          Додати
        </button>
      )}
    </>
  );
}
