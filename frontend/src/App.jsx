import { useCallback, useEffect, useRef, useState } from 'react';
import { csrfHeaders } from './api.js';
import './styles.css';
import LoginPage from './components/LoginPage.jsx';
import SinglePage from './components/SinglePage.jsx';
import BatchPage from './components/BatchPage.jsx';
import AdminPage from './components/AdminPage.jsx';

const IDLE_MS = 30 * 60 * 1000;   // 30 min before warning
const WARN_MS = 60 * 1000;         // 60 s warning countdown before auto-logout

function useIdleLogout(active, onLogout) {
  const warnTimer  = useRef(null);
  const logoutTimer = useRef(null);
  const [countdown, setCountdown] = useState(null); // null = no warning shown
  const countRef = useRef(null);

  const clearAll = useCallback(() => {
    clearTimeout(warnTimer.current);
    clearTimeout(logoutTimer.current);
    clearInterval(countRef.current);
    setCountdown(null);
  }, []);

  const reset = useCallback(() => {
    if (!active) return;
    clearAll();
    warnTimer.current = setTimeout(() => {
      setCountdown(Math.round(WARN_MS / 1000));
      countRef.current = setInterval(() => {
        setCountdown((n) => {
          if (n <= 1) { clearInterval(countRef.current); return 0; }
          return n - 1;
        });
      }, 1000);
      logoutTimer.current = setTimeout(onLogout, WARN_MS);
    }, IDLE_MS);
  }, [active, clearAll, onLogout]);

  useEffect(() => {
    if (!active) { clearAll(); return; }
    const events = ['mousemove', 'keydown', 'click', 'scroll', 'touchstart'];
    const handle = () => { if (countdown === null) reset(); };
    events.forEach((e) => window.addEventListener(e, handle, { passive: true }));
    reset();
    return () => {
      events.forEach((e) => window.removeEventListener(e, handle));
      clearAll();
    };
  }, [active, reset, clearAll, countdown]);

  return { countdown, staySignedIn: reset };
}

export default function App() {
  // null = still loading, false = not authenticated, object = authenticated user
  const [user, setUser] = useState(null);
  const [googleConfigured, setGoogleConfigured] = useState(false);
  const [mode, setMode] = useState('single');
  const [adminOpen, setAdminOpen] = useState(false);

  useEffect(() => {
    fetch('/api/auth/me')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => setUser(data ?? false))
      .catch(() => setUser(false));

    // Probe whether Google OAuth is configured so login page can reflect that
    fetch('/api/auth/login/google', { method: 'HEAD', redirect: 'manual' })
      .then((r) => setGoogleConfigured(r.status !== 503))
      .catch(() => setGoogleConfigured(false));
  }, []);

  const handleLogout = useCallback(async () => {
    await fetch('/api/auth/logout', { method: 'POST', headers: csrfHeaders() });
    setUser(false);
  }, []);

  const { countdown, staySignedIn } = useIdleLogout(!!user, handleLogout);

  if (user === null) {
    return (
      <div className="page-loader" role="status" aria-label="Loading…">
        <span className="loading loading-spinner loading-lg text-primary" />
      </div>
    );
  }

  if (user === false) {
    return <LoginPage onLogin={setUser} googleConfigured={googleConfigured} />;
  }

  return (
    <>
      <a href="#main-content" className="skip-link">Skip to main content</a>

      <header className="site-header">
        <svg width="36" height="36" viewBox="0 0 36 36" aria-hidden="true" focusable="false">
          <rect width="36" height="36" rx="5" fill="rgba(255,255,255,0.15)" />
          <path d="M18 8 L28 26 H8 Z" fill="white" />
        </svg>
        <div>
          <h1>TTB Label Verification</h1>
          <p>Alcohol Beverage Label Compliance Tool</p>
        </div>
        <div className="header-user">
          <span>{user.name}</span>
          {user.role === 'admin' && (
            <button
              className="btn-admin-link"
              onClick={() => setAdminOpen((v) => !v)}
              aria-pressed={adminOpen}
            >
              {adminOpen ? '← Back' : 'Admin'}
            </button>
          )}
          <button className="btn-signout" onClick={handleLogout}>Sign out</button>
        </div>
      </header>

      {!adminOpen && (
        <div role="tablist" aria-label="Verification mode" className="tabs tabs-border bg-base-100 shadow-sm px-7">
          <button
            id="tab-single"
            role="tab"
            className={`tab tab-lg font-medium${mode === 'single' ? ' tab-active' : ''}`}
            aria-selected={mode === 'single'}
            aria-controls="panel-single"
            onClick={() => setMode('single')}
          >
            Single Label
          </button>
          <button
            id="tab-batch"
            role="tab"
            className={`tab tab-lg font-medium${mode === 'batch' ? ' tab-active' : ''}`}
            aria-selected={mode === 'batch'}
            aria-controls="panel-batch"
            onClick={() => setMode('batch')}
          >
            Batch Upload
          </button>
        </div>
      )}

      <main id="main-content" className="page-wrap">
        {adminOpen ? (
          <>
            <h2 className="text-lg font-bold mb-5 text-gray-900">Admin Panel</h2>
            <AdminPage />
          </>
        ) : (
          <>
            <div
              id="panel-single"
              role="tabpanel"
              aria-labelledby="tab-single"
              hidden={mode !== 'single'}
            >
              <SinglePage />
            </div>
            <div
              id="panel-batch"
              role="tabpanel"
              aria-labelledby="tab-batch"
              hidden={mode !== 'batch'}
            >
              <BatchPage />
            </div>
          </>
        )}
      </main>

      {countdown !== null && (
        <div
          className="modal modal-open"
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="idle-title"
          aria-describedby="idle-desc"
          style={{ zIndex: 9999 }}
        >
          <div className="modal-box text-center max-w-sm">
            <p id="idle-title" className="font-bold text-lg mb-2">Session Expiring</p>
            <p id="idle-desc" className="text-base-content/70 mb-6 text-sm">
              You will be signed out in <strong>{countdown}</strong> second{countdown !== 1 ? 's' : ''} due to inactivity.
            </p>
            <button className="btn btn-primary w-full" onClick={staySignedIn} autoFocus>
              Stay Signed In
            </button>
          </div>
        </div>
      )}
    </>
  );
}
