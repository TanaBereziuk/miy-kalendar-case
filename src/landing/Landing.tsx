// Промо-сторінка демоверсії (25.11). Стиль — дизайн-система «мій календар»:
// bg #f5f5f7, білі картки радіус 24, e-UkraineHead для заголовків, чорна кнопка одна.
// Скриншоти — public/promo/*.png, зняті з цієї ж демоверсії.
import './landing.css';

const DEMO = '/demo';
const SETUP = '/demo?start=setup';

// Іконки з дизайн-системи (бруталістичні, 24 × 24, evenodd)
const I = {
  food: 'M3 3h2v5h1V3h2v5h1V3h2v8H8v10H6V11H3zM15 3h4v18h-3v-7h-1z',
  fop: 'M5 2h10l5 5v15H5zM8 11h9v2H8zM8 15h9v2H8z',
  hobby: 'M1 9h2V7h4v10H3v-2H1zM23 9h-2V7h-4v10h4v-2h2zM7 11h10v2H7z',
  pet: 'M2 10h4v4H2zM7 5h4v4H7zM13 5h4v4h-4zM18 10h4v4h-4zM12 12l7 5v4H5v-4z',
  plus: 'M10 3h4v7h7v4h-7v7h-4v-7H3v-4h7z',
  tasks: 'M3 3h18v18H3zM6 6v12h12V6zM7.5 11.5 9.5 9.5l2 2 4-4 2 2-6 6z',
  day: 'M3 5h18v16H3zM6 10v8h12v-8zM7 2h3v4H7zM14 2h3v4h-3zM8 12h4v4H8z',
  gift: 'M3 8h18v4H3zM5 13h14v8H5zM10.5 8h3v13h-3zM6 3h5v4H6zM13 3h5v4h-5z',
  chat: 'M3 4h18v13H10l-5 4v-4H3z',
  arrow: 'M8.5 3.5 17 12l-8.5 8.5-2.5-2.5 6-6-6-6z',
};

function Icon({ d, size = 16 }: { d: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path d={d} fill="currentColor" fillRule="evenodd" />
    </svg>
  );
}

const MODULES = [
  { name: 'харчування', color: '#a3c6a0', icon: I.food, text: 'Бібліотека страв з фото. Страву перетягують у день — на годину, у смугу ранку чи на весь вечір.' },
  { name: 'звітність ФОП', color: '#e99a7d', icon: I.fop, text: 'Декларації й сплати єдиного податку та ЄСВ рахуються самі з групи й ставки.' },
  { name: 'хобі та спорт', color: '#b5a5dd', icon: I.hobby, text: 'Заняття за розкладом або «2 рази на тиждень» — тоді вони чекають у рядку «цього тижня».' },
  { name: 'улюбленець', color: '#95bfb9', icon: I.pet, text: 'Ліки, щеплення й візити до ветеринара з нагадуваннями й історією процедур.' },
];

const NEW = [
  {
    icon: I.plus,
    tile: '#1d1d1f',
    title: 'нова подія у два кроки',
    text: 'Клік по клітинці відкриває перелік «що створити», далі — коротка форма з полями «підпис — значення».',
    shot: '/promo/quick.png',
  },
  {
    icon: I.tasks,
    tile: '#e5e5ea',
    dark: true,
    title: 'задачі й нагадування',
    text: 'Нагадування ФОП і улюбленця — угорі на кольоровій підкладці, задачі — за днями від сьогодні. Задачу можна підвʼязати до події.',
    shot: '/promo/left.png',
  },
  {
    icon: I.food,
    tile: '#a3c6a0',
    dark: true,
    title: 'страва на весь період',
    text: 'Страви на весь ранок, день чи вечір — стопкою фото з назвами на смузі періоду, а сам період лишається вільним. На весь період можна покласти й будь-яку іншу подію.',
    shot: '/promo/dish.png',
  },
  {
    icon: I.gift,
    tile: '#1340b8',
    title: 'дні народження й стікери',
    text: 'Імена на синій підкладці у «весь день», а на шапці дня — коти у святкових ковпачках.',
    shot: '/promo/bday.png',
  },
];

const TRY = [
  'Клікніть по порожній клітинці й оберіть «інша подія».',
  'Відкрийте праве меню «Асистент» і напишіть «басейн у четвер о 18».',
  'Перетягніть чип з рядка «цього тижня» в будь-який день.',
  'Перетягніть страву з бібліотеки чи будь-яку подію й відпустіть на смузі «весь період».',
  'Натисніть на назву дня в шапці й додайте стікер.',
];

export function Landing() {
  return (
    <div className="pr">
      <header className="pr-top">
        <span className="head-font pr-logo">мій календар</span>
        <a className="pr-btn pr-btn-fill pr-btn-small" href={DEMO}>
          Відкрити демо
        </a>
      </header>

      <section className="pr-hero">
        <p className="pr-eyebrow">особистий веб-календар</p>
        <h1 className="head-font pr-h1">Тиждень, який планується сам.</h1>
        <p className="pr-lead">
          Страви, звітність ФОП, заняття й турбота про улюбленця — в одній сітці тижня. Налаштуйте модулі один раз, і
          календар заповниться сам.
        </p>
        <div className="pr-actions">
          <a className="pr-btn pr-btn-ink" href={DEMO}>
            Спробувати демо
          </a>
          <a className="pr-btn pr-btn-fill" href={SETUP}>
            Почати з налаштування
          </a>
        </div>
        <p className="pr-note">
          Без входу й реєстрації. У демо нічого не зберігається: після перезавантаження сторінки тиждень повертається до
          прикладу.
        </p>
      </section>

      <figure className="pr-shot pr-shot-main">
        <img src="/promo/week.png" alt="Сітка тижня з подіями всіх модулів, лівою панеллю «задачі» і рядком «цього тижня»" width={1440} height={900} />
      </figure>

      <section className="pr-section">
        <h2 className="head-font pr-h2">що нового</h2>
        <p className="pr-sub">Останні зміни, листопад 2026.</p>
        <div className="pr-new">
          {NEW.map((n) => (
            <article key={n.title} className="pr-card pr-new-card">
              <div className="pr-shot-crop">
                <img src={n.shot} alt="" loading="lazy" />
              </div>
              <div className="pr-card-body">
                <span className="pr-tile" style={{ background: n.tile, color: n.dark ? '#1d1d1f' : '#fff' }}>
                  <Icon d={n.icon} size={13} />
                </span>
                <h3 className="pr-h3">{n.title}</h3>
                <p className="pr-text">{n.text}</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="pr-section">
        <h2 className="head-font pr-h2">чотири модулі</h2>
        <p className="pr-sub">Вмикаються галочками в налаштуванні. Кожен питає лише те, що потрібно для розрахунку подій.</p>
        <div className="pr-grouped">
          {MODULES.map((m) => (
            <div key={m.name} className="pr-row">
              <span className="pr-tile pr-tile-30" style={{ background: m.color }}>
                <Icon d={m.icon} size={16} />
              </span>
              <div>
                <h3 className="pr-h3">{m.name}</h3>
                <p className="pr-text">{m.text}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="pr-section pr-split">
        <div>
          <h2 className="head-font pr-h2">що спробувати</h2>
          <p className="pr-sub">Пʼять речей на дві хвилини.</p>
          <ol className="pr-try">
            {TRY.map((t, i) => (
              <li key={t}>
                <span className="pr-num">{i + 1}</span>
                <span>{t}</span>
              </li>
            ))}
          </ol>
          <div className="pr-actions">
            <a className="pr-btn pr-btn-ink" href={DEMO}>
              Спробувати демо
            </a>
          </div>
        </div>
        <figure className="pr-shot pr-shot-phone">
          <img src="/promo/phone.png" alt="День на телефоні: групи ранок, день, вечір" width={390} height={844} />
        </figure>
      </section>

      <footer className="pr-foot">
        <p>
          мій календар — особистий некомерційний проєкт. Шрифт e-Ukraine © Fedoriv / Мінцифри, CC BY 4.0. Фото страв —
          Unsplash.
        </p>
      </footer>
    </div>
  );
}
