import { useEffect, useState } from 'react';

import { api, getToken, onAuthLost, setToken } from './api';
import Analytics from './pages/Analytics';
import Evaluation from './pages/Evaluation';
import Forecast from './pages/Forecast';
import Fleet from './pages/Fleet';
import LiveMap from './pages/LiveMap';
import Login from './pages/Login';
import Overview from './pages/Overview';
import Requests from './pages/Requests';
import RoutesPage from './pages/Routes';
import Users from './pages/Users';
import { Icon } from './ui';

const PAGES = [
  { key: 'overview', label: 'Overview', short: 'Home', icon: 'overview', C: Overview },
  { key: 'live', label: 'Live map & planning', short: 'Map', icon: 'map', C: LiveMap },
  { key: 'requests', label: 'Requests', short: 'Requests', icon: 'list', C: Requests },
  { key: 'routes', label: 'Routes', short: 'Routes', icon: 'route', C: RoutesPage },
  { key: 'fleet', label: 'Fleet', short: 'Fleet', icon: 'truck', C: Fleet },
  { key: 'users', label: 'Users', short: 'Users', icon: 'users', C: Users },
  { key: 'analytics', label: 'Analytics', short: 'Stats', icon: 'chart', C: Analytics },
  { key: 'forecast', label: 'Forecast', short: 'Forecast', icon: 'forecast', C: Forecast },
  { key: 'evaluation', label: 'Evaluation', short: 'Results', icon: 'compare', C: Evaluation },
];

// Chrome/Edge fire this when the dashboard can be installed as an app
interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
}

export interface Me {
  id: number;
  name: string;
  email: string;
  role: string;
}

function currentPage() {
  const k = window.location.hash.replace('#/', '');
  return PAGES.some((p) => p.key === k) ? k : 'overview';
}

export default function App() {
  const [me, setMe] = useState<Me | null>(null);
  const [checking, setChecking] = useState(!!getToken());
  const [page, setPage] = useState(currentPage());
  const [installEvt, setInstallEvt] = useState<InstallPromptEvent | null>(null);

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setInstallEvt(e as InstallPromptEvent);
    };
    const onInstalled = () => setInstallEvt(null);
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  useEffect(() => {
    onAuthLost(() => {
      setToken(null);
      setMe(null);
    });
    if (getToken()) {
      api
        .get<Me>('/auth/me')
        .then((u) => (u.role === 'admin' ? setMe(u) : setToken(null)))
        .catch(() => setToken(null))
        .finally(() => setChecking(false));
    }
    const h = () => setPage(currentPage());
    window.addEventListener('hashchange', h);
    return () => window.removeEventListener('hashchange', h);
  }, []);

  if (checking) return null;
  if (!me) return <Login onLogin={setMe} />;

  const Page = PAGES.find((p) => p.key === page)!.C;
  return (
    <div className="shell">
      <aside className="side">
        <div className="brand">
          <div className="brand-mark">SR</div>
          <div>
            <div style={{ fontWeight: 800 }}>SmartRoute</div>
            <small>Control room</small>
          </div>
        </div>
        {PAGES.map((p) => (
          <button key={p.key} className={`nav-item ${p.key === page ? 'active' : ''}`} onClick={() => (window.location.hash = `#/${p.key}`)}>
            <Icon name={p.icon} />
            <span className="nav-long">{p.label}</span>
            <span className="nav-short">{p.short}</span>
          </button>
        ))}
        {installEvt && (
          <button
            className="btn small install-btn"
            onClick={async () => {
              await installEvt.prompt();
              setInstallEvt(null);
            }}
          >
            Install as app
          </button>
        )}
        <div className="side-foot">
          <div style={{ color: '#fff', fontWeight: 600 }}>{me.name}</div>
          <div>{me.email}</div>
          <button
            className="btn small ghost-dark"
            onClick={() => {
              setToken(null);
              setMe(null);
            }}
          >
            Log out
          </button>
        </div>
      </aside>
      <main className="main">
        <div className="mobile-top">
          <div className="brand-mark">SR</div>
          <b>SmartRoute Control</b>
          <button
            className="btn small"
            style={{ marginLeft: 'auto' }}
            onClick={() => {
              setToken(null);
              setMe(null);
            }}
          >
            Log out
          </button>
        </div>
        <Page />
      </main>
    </div>
  );
}
