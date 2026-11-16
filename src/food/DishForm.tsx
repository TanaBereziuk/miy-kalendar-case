// Поля картки страви (16.11): місце для фото, «джерело», «назва», «опис», інгредієнти з опису.
// Спільні для картки страви (DishDialog) і вкладки «харчування» у вікні нової події (ItemDialog).
import { useEffect, useMemo, useRef, useState } from 'react';
import { ICONS, Icon } from '../components/Icon';
import { importFromUrl, type Dish, type NewDish } from './dishes';
import { extractIngredients } from './ingredients';

const isUrl = (s: string) => /^https?:\/\/[^\s/]+\.[^\s]+/i.test(s.trim());
const splitLines = (s?: string) => (s ? s.split(/\r?\n/).map((x) => x.trim()).filter(Boolean) : []);
const CAMERA = 'M3 7h4l2-3h6l2 3h4v13H3zM8 10v7h8v-7z';

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
  const ingredients = useMemo(() => {
    const all: string[] = [];
    for (const x of [...given, ...found]) if (!all.some((y) => y.toLowerCase() === x.toLowerCase())) all.push(x);
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

  return { source, setSource, name, setName, note, setNote, photo, setPhoto, ingredients, removed, setRemoved, busy, error, info, pickPhoto, build };
}

export type DishForm = ReturnType<typeof useDishForm>;

export function DishFormFields({ f }: { f: DishForm }) {
  const fileRef = useRef<HTMLInputElement>(null);
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

      <div className="field-wrap">
        <label className="field">
          <span>
            джерело <span className="field-opt">необовʼязково</span>
          </span>
          <input type="url" inputMode="url" value={f.source} onChange={(e) => f.setSource(e.target.value)} placeholder="посилання на рецепт" />
        </label>
        <p className="hint small" role="status">
          {f.busy ? 'Читаємо рецепт…' : f.info || 'Якщо є посилання на рецепт — вставте його, решту полів заповнимо самі.'}
        </p>
      </div>

      <label className="field">
        <span>назва</span>
        <input maxLength={200} value={f.name} onChange={(e) => f.setName(e.target.value)} placeholder="напр. сирники" />
      </label>
      <label className="field dish-note">
        <span>опис</span>
        <textarea rows={4} value={f.note} onChange={(e) => f.setNote(e.target.value)} placeholder="з чого й як готуєте — інгредієнти виділимо самі" />
      </label>

      {f.ingredients.length > 0 && (
        <div className="field-wrap">
          <span className="dish-label">інгредієнти</span>
          <div className="chips">
            {f.ingredients.map((x) => (
              <span key={x} className="ingr-chip">
                {x}
                <button type="button" aria-label={`Прибрати «${x}»`} onClick={() => f.setRemoved([...f.removed, x])}>
                  <Icon d={ICONS.close} size={8} />
                </button>
              </span>
            ))}
          </div>
          <p className="hint small">Виділено з опису автоматично. Зайве можна прибрати.</p>
        </div>
      )}

      {f.error && (
        <p className="error" role="alert">
          {f.error}
        </p>
      )}
    </>
  );
}
