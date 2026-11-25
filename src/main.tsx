import React, { Suspense, lazy } from 'react';
import ReactDOM from 'react-dom/client';
import './styles.css';
import { Landing } from './landing/Landing';

// Демоверсія: «/» — промо-сторінка, «/demo» — сам календар (з прикладом тижня в памʼяті сторінки).
const App = lazy(() => import('./App'));
const isDemo = window.location.pathname.replace(/\/+$/, '') === '/demo';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {isDemo ? (
      <Suspense fallback={<div className="splash" aria-busy="true" />}>
        <App />
      </Suspense>
    ) : (
      <Landing />
    )}
  </React.StrictMode>,
);
