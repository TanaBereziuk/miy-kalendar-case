// Поля картки страви (16.11): місце для фото, «джерело», «назва», «опис», інгредієнти з опису.
// Спільні для картки страви (DishDialog) і вкладки «харчування» у вікні нової події (ItemDialog).
import { useEffect, useMemo, useRef, useState } from 'react';
import { ICONS, Icon } from '../components/Icon';
import { PropInput, QfRow } from '../components/QuickFields';
import { importFromUrl, type Dish, type NewDish } from './dishes';
import { extractIngredients, splitIngredient } from './ingredients';

const isUrl = (s: string) => /^https?:\/\/[^\s/]+\.[^\s]+/i.test(s.trim());
const splitLines = (s?: string) => (s ? s.split(/\r?\n/).map((x) => x.trim()).filter(Boolean) : []);
const CAMERA = 'M3 7h4l2-3h6l2 3h4v13H3zM8 10v7h8v-7z';
const SEND = 'M12 3l8.5 8.5-2.5 2.5-4.25-4.25V21h-3.5V9.75L6 14l-2.5-2.5z';

/** Список покупок (26.11): «покупки: назва», порожній рядок і інгредієнти рядками з «•» */
export function shoppingText(name: string, items: string[]) {
  // 26.11: «• сир — 500 г», без кількості — «• сіль»
  const line = (x: string) => {
    const { name: n, amount } = splitIngredient(x);
    return `• ${n}${amount ? ` — ${amount}` : ''}`;
  };
  return [name.trim() ? `покупки: ${name.trim()}` : 'список покупок', '', ...items.map(line)].join('\n');
}

/** Куди надіслати (26.11, вечір — узагальнено): посилання «поділитися» кожного месенджера, без ботів і ключів.
 *  Telegram — увесь текст у параметрі url (з text на iPhone повідомлення іноді губиться);
 *  WhatsApp — wa.me відкриває застосунок або WhatsApp Web; Viber — лише застосунок (телефон або Viber на компʼютері). */
const SHARE_TARGETS: { name: string; link: (t: string) => string }[] = [
  { name: 'Telegram', link: (t) => `https://t.me/share/url?url=${encodeURIComponent(t)}` },
  { name: 'Viber', link: (t) => `viber://forward?text=${encodeURIComponent(t)}` },
  { name: 'WhatsApp', link: (t) => `https://wa.me/?text=${encodeURIComponent(t)}` },
];

/** Капсула «Надіслати покупки» і меню: Telegram, Viber, WhatsApp, під лінією — «Скопіювати список» */
function ShoppingShare({ name, items }: { name: string; items: string[] }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const off = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', off);
    window.addEventListener('keydown', key, true);
    return () => {
      document.removeEventListener('mousedown', off);
      window.removeEventListener('keydown', key, true);
    };
  }, [open]);
  const text = shoppingText(name, items);
  const send = (link: string) => {
    setOpen(false);
    if (link.startsWith('http')) window.open(link, '_blank', 'noopener');
    else window.location.href = link; // viber:// — відкриває застосунок
  };
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => {
        setCopied(false);
        setOpen(false);
      }, 1200);
    } catch {
      setOpen(false);
    }
  };
  return (
    <div className="share-wrap" ref={ref}>
      <button type="button" className="tg-share" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <Icon d={SEND} size={12} />
        Надіслати покупки
        <Icon d={ICONS.down} size={10} />
      </button>
      {open && (
        <div className="task-menu share-menu" role="menu">
          {SHARE_TARGETS.map((t) => (
            <button type="button" role="menuitem" key={t.name} onClick={() => send(t.link(text))}>
              {t.name}
            </button>
          ))}
          <hr />
          <button type="button" role="menuitem" onClick={copy}>
            {copied ? 'Скопійовано' : 'Скопіювати список'}
          </button>
        </div>
      )}
    </div>
  );
}

/** Фото з пристрою → JPEG до 720 px (≈50–80 КБ), зберігається просто в картці страви */
async function shrinkPhoto(file: File): Promise<string> {
  const bmp = await createImageBitmap(file);
  const k = Math.min(1, 720 / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * k);
  c.height = Math.round(bmp.height * k);
  c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height);
  bmp.close();
  return c.toDataURL('image/jpeg', 0.75);
}

export function useDishForm(dish?: Dish) {
  const [source, setSource] = useState(dish?.sourceUrl ?? '');
  const [name, setName] = useState(dish?.name ?? '');
  const [note, setNote] = useState(dish?.note ?? '');
  const [photo, setPhoto] = useState(dish?.photoUrl ?? '');
  // Інгредієнти, що прийшли з посилання або вже збережені; плюс ті, що система знайде в описі
  const [given, setGiven] = useState<string[]>(splitLines(dish?.ingredients));
  const [removed, setRemoved] = useState<string[]>([]);
  const [prep, setPrep] = useState(dish?.prepMin);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const lastImported = useRef(dish?.sourceUrl?.trim() ?? '');

  const found = useMemo(() => extractIngredients(note), [note]);
  // 26.11 (вечір): записаний перелік — головний; продукти з опису беремо, лише коли переліку ще немає (так немає дублів)
  const ingredients = useMemo(() => {
    const all: string[] = [];
    for (const x of given.length ? given : found) if (!all.some((y) => y.toLowerCase() === x.toLowerCase())) all.push(x);
    return all.filter((x) => !removed.includes(x));
  }, [given, found, removed]);

  // Вставили посилання — за мить читаємо рецепт і заповнюємо поля
  useEffect(() => {
    const url = source.trim();
    if (!isUrl(url) || url === lastImported.current) return;
    let alive = true;
    const t = setTimeout(async () => {
      lastImported.current = url;
      setBusy(true);
      setError('');
      setInfo('');
      try {
        const d = await importFromUrl(url);
        if (!alive) return;
        if (d.name) setName(d.name);
        if (d.note) setNote(d.note);
        if (d.photoUrl) setPhoto((p) => p || d.photoUrl!);
        if (d.prepMin) setPrep(d.prepMin);
        if (d.ingredients) setGiven(splitLines(d.ingredients));
        setInfo('Поля заповнено з посилання. Перевірте їх і збережіть.');
      } catch (e) {
        if (alive) setError((e as Error).message + ' Назву можна вписати вручну.');
      } finally {
        if (alive) setBusy(false);
      }
    }, 500);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [source]);

  const pickPhoto = async (f?: File) => {
    if (!f) return;
    setError('');
    try {
      setPhoto(await shrinkPhoto(f));
    } catch {
      setError('Не вдалося відкрити це фото. Спробуйте інше.');
    }
  };

  /** Готова страва для збереження або null (і текст помилки в полях), якщо щось не заповнено */
  const build = (): NewDish | null => {
    if (busy) return null;
    if (!name.trim()) {
      setError(isUrl(source) ? 'Не вдалося взяти назву з посилання. Вкажіть її вручну.' : 'Вкажіть назву страви або вставте посилання на рецепт.');
      return null;
    }
    return {
      name: name.trim(),
      category: dish?.category,
      prepMin: prep,
      photoUrl: photo || undefined,
      ingredients: ingredients.join('\n') || undefined,
      steps: dish?.steps,
      sourceUrl: source.trim() || undefined,
      tags: dish?.tags ?? [],
      fav: dish?.fav ?? false,
      note: note.trim() || undefined,
    };
  };

  /** Інгредієнти, змінені текстом (26.11): новий перелік стає «своїм», а знайдене в описі поза ним — прибраним */
  const setIngredientList = (list: string[]) => {
    const has = (x: string) => list.some((y) => y.toLowerCase() === x.toLowerCase());
    setGiven(list);
    setRemoved(found.filter((x) => !has(x)));
  };

  return { isNew: !dish, source, setSource, name, setName, note, setNote, photo, setPhoto, ingredients, removed, setRemoved, setIngredientList, busy, error, info, pickPhoto, build };
}

export type DishForm = ReturnType<typeof useDishForm>;

/** Інгредієнти списком (26.11, 13:45): рядок на продукт — назва ліворуч, кількість чи вага праворуч (muted) */
export function IngredientList({ items }: { items: string[] }) {
  return (
    <ul className="ingr-list">
      {items.map((x, i) => {
        const { name, amount } = splitIngredient(x);
        return (
          <li key={x + i}>
            <span className="ingr-name">{name}</span>
            {amount && <span className="ingr-amount">{amount}</span>}
          </li>
        );
      })}
    </ul>
  );
}

/** Інгредієнти в редагуванні: той самий список; натискання — поле, де кожен продукт з нового рядка («сир 500 г»);
 *  Enter — новий рядок, клік деінде — зберегти, Esc — повернути як було */
function IngredientsProp({ f }: { f: DishForm }) {
  const [draft, setDraft] = useState<string | null>(null);
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (draft === null || !ref.current) return;
    const el = ref.current;
    el.style.height = 'auto';
    el.style.height = el.scrollHeight + 2 + 'px';
  }, [draft]);
  if (draft === null)
    return (
      <button type="button" className={'qf-prop qf-text ingr-edit' + (f.ingredients.length ? '' : ' empty')} onClick={() => setDraft(f.ingredients.join('\n'))}>
        {f.ingredients.length ? <IngredientList items={f.ingredients} /> : 'додати інгредієнти'}
      </button>
    );
  const commit = () => {
    let list = draft.split(/[\n;]/).map((x) => x.trim()).filter(Boolean);
    // усе одним рядком через кому — ділимо за комою (крім «1,5 кг»)
    if (list.length === 1 && /,(?!\d)/.test(list[0])) list = list[0].split(/,(?!\d)/).map((x) => x.trim()).filter(Boolean);
    f.setIngredientList(list);
    setDraft(null);
  };
  return (
    <textarea
      ref={ref}
      autoFocus
      rows={3}
      className="qf-prop qf-note qf-text-edit"
      value={draft}
      placeholder={'кожен продукт з нового рядка:\nсир 500 г\nяйця 2 шт'}
      aria-label="Інгредієнти"
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.stopPropagation();
          e.nativeEvent.stopImmediatePropagation();
          setDraft(null);
        }
      }}
    />
  );
}

export const PENCIL = 'M14.5 3 21 9.5 9.5 21H3v-6.5zM5 15.3V19h3.7z';

/** Опис у перегляді (26.11): текст до 4 рядків; довший — обрізано, під ним текстова «Більше» / «Менше» */
function NoteText({ text }: { text: string }) {
  const ref = useRef<HTMLParagraphElement>(null);
  const [open, setOpen] = useState(false);
  const [long, setLong] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (el && !open) setLong(el.scrollHeight > el.clientHeight + 1);
  }, [text, open]);
  return (
    <>
      <p ref={ref} className={'dish-sec-text' + (open ? '' : ' clamp')}>
        {text}
      </p>
      {(long || open) && (
        <button type="button" className="text-add dish-more" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
          {open ? 'Менше' : 'Більше'}
          <Icon d={ICONS.down} size={10} />
        </button>
      )}
    </>
  );
}

/** Розділ «опис» / «інгредієнти» (26.11): заголовок 12/600 muted угорі (праворуч — дія), під ним текст */
function DishSection({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="dish-sec">
      <div className="dish-sec-head">
        <span>{title}</span>
        {action}
      </div>
      {children}
    </section>
  );
}

/**
 * Картка страви (26.11, правки власниці): фото, назва 20/700, «рецепт» (і «день» — `rows`) полями «підпис — значення»,
 * далі розділи «опис» і останнім «інгредієнти» — заголовок угорі, текст під ним; навпроти заголовка «інгредієнти» —
 * «Надіслати покупки». `view` — перегляд без полів (редагування — олівцем у заголовку вікна).
 */
export function DishFormFields({ f, rows, view }: { f: DishForm; rows?: React.ReactNode; view?: boolean }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const titleRef = useRef<HTMLTextAreaElement>(null);
  // назва й опис ростуть під вміст
  const grow = (el: HTMLTextAreaElement | null, extra = 1) => {
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = el.scrollHeight + extra + 'px';
  };
  useEffect(() => grow(titleRef.current), [f.name, view]);
  const share = f.ingredients.length > 0 && <ShoppingShare name={f.name} items={f.ingredients} />;

  if (view)
    return (
      <>
        {f.photo && (
          <div className="dish-photo-box">
            <img className="dish-photo" src={f.photo} alt="" onError={() => f.setPhoto('')} />
          </div>
        )}
        <h3 className="dish-view-title">{f.name}</h3>
        {(f.source.trim() || rows) && (
          <div className="qf-grid dish-grid">
            {f.source.trim() && (
              <QfRow k="рецепт">
                <a className="qf-prop dish-link" href={f.source.trim()} target="_blank" rel="noopener noreferrer">
                  {f.source.trim().replace(/^https?:\/\/(www\.)?/i, '')}
                </a>
              </QfRow>
            )}
            {rows}
          </div>
        )}
        {f.note.trim() && (
          <DishSection title="опис">
            <NoteText text={f.note.trim()} />
          </DishSection>
        )}
        <DishSection title="інгредієнти" action={share}>
          {f.ingredients.length ? <IngredientList items={f.ingredients} /> : <p className="dish-sec-text empty">інгредієнтів ще немає</p>}
        </DishSection>
      </>
    );

  const recipe = (
    <>
      <QfRow k="рецепт">
        <PropInput value={f.source} onChange={f.setSource} placeholder="вставте посилання" label="Посилання на рецепт" inputMode="url" noEnter />
      </QfRow>
      {(f.busy || f.info) && <p className="qf-hint">{f.busy ? 'Читаю рецепт за посиланням…' : f.info}</p>}
    </>
  );
  return (
    <>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          f.pickPhoto(e.target.files?.[0]);
          e.target.value = '';
        }}
      />
      {f.photo ? (
        <div className="dish-photo-box">
          <img className="dish-photo" src={f.photo} alt="" onError={() => f.setPhoto('')} />
          <div className="dish-photo-actions">
            <button type="button" className="dish-photo-btn" onClick={() => fileRef.current?.click()}>
              Замінити фото
            </button>
            <button type="button" className="dish-photo-btn icon" aria-label="Прибрати фото" onClick={() => f.setPhoto('')}>
              <Icon d={ICONS.close} size={10} />
            </button>
          </div>
        </div>
      ) : (
        <button type="button" className="dish-photo-empty" onClick={() => fileRef.current?.click()}>
          <Icon d={CAMERA} size={20} />
          <span>Додати фото</span>
        </button>
      )}

      {f.isNew && <div className="qf-grid dish-grid">{recipe}</div>}

      <textarea
        ref={titleRef}
        className="qf-title dish-title"
        rows={1}
        maxLength={200}
        value={f.name}
        onChange={(e) => f.setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            e.currentTarget.form?.requestSubmit();
          }
        }}
        placeholder="назва страви"
        aria-label="Назва страви"
        autoComplete="off"
      />

      {(!f.isNew || rows) && (
        <div className="qf-grid dish-grid">
          {!f.isNew && recipe}
          {rows}
        </div>
      )}

      <DishSection title="опис">
        <textarea
          ref={(el) => grow(el, 2)}
          className="qf-prop qf-note qf-text-edit dish-sec-edit"
          rows={2}
          value={f.note}
          onChange={(e) => {
            f.setNote(e.target.value);
            grow(e.target, 2);
          }}
          placeholder="з чого й як готуєте — інгредієнти виділимо самі"
          aria-label="Опис"
        />
      </DishSection>

      <DishSection title="інгредієнти" action={share}>
        <IngredientsProp f={f} />
      </DishSection>

      {f.error && (
        <p className="error" role="alert">
          {f.error}
        </p>
      )}
    </>
  );
}
