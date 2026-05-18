import { useState } from 'react';

// Inline Google "G" SVG — avoids any external asset dependency
function GoogleIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true" focusable="false">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
    </svg>
  );
}

export default function LoginPage({ onLogin, googleConfigured }) {
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleDemo = async (e) => {
    e.preventDefault();
    if (!code.trim()) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/auth/demo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: code.trim() }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.detail ?? 'Invalid access code');
      }
      const me = await fetch('/api/auth/me').then((r) => r.json());
      onLogin(me);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-wrap">
      <header className="site-header">
        <svg width="36" height="36" viewBox="0 0 36 36" aria-hidden="true" focusable="false">
          <rect width="36" height="36" rx="5" fill="rgba(255,255,255,0.15)" />
          <path d="M18 8 L28 26 H8 Z" fill="white" />
        </svg>
        <div>
          <h1>TTB Label Verification</h1>
          <p>Alcohol Beverage Label Compliance Tool</p>
        </div>
      </header>

      <div className="login-body">
        <div
          role="note"
          aria-label="U.S. Government system warning"
          className="alert alert-warning text-xs leading-relaxed max-w-[440px] w-full mb-5"
        >
          <strong>WARNING:</strong> This is a U.S. Government computer system. Unauthorized use is
          prohibited and may result in criminal or civil penalties under federal law, including
          the Computer Fraud and Abuse Act (18 U.S.C. § 1030). By continuing, you acknowledge
          that you have no reasonable expectation of privacy and consent to monitoring.
        </div>

        <div className="card bg-base-100 shadow border border-base-200 w-full max-w-[420px] p-9">
          <h2 className="text-[1.35rem] font-bold mb-1 tracking-tight">Sign In</h2>
          <p className="text-sm text-slate-500 mb-7">Access is restricted to authorized TTB personnel.</p>

          {googleConfigured ? (
            <a href="/api/auth/login/google" className="btn-google">
              <GoogleIcon />
              Sign in with Google
            </a>
          ) : (
            <>
              <button
                type="button"
                className="btn-google"
                disabled
                title="Google OAuth is not configured in this environment"
              >
                <GoogleIcon />
                Sign in with Google
              </button>
              <p className="text-xs text-center mt-2 text-slate-400">
                Google sign-in is not available in this environment.
              </p>
            </>
          )}

          <div className="divider text-xs">or use demo access</div>

          <form onSubmit={handleDemo}>
            <div className="form-group mb-3">
              <label htmlFor="demo-code">Demo Access Code</label>
              <input
                type="password"
                id="demo-code"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="Enter the code provided by your reviewer"
                autoComplete="off"
              />
            </div>
            {error && <div className="alert alert-error text-sm font-medium mb-3" role="alert">{error}</div>}
            <button
              type="submit"
              className="btn btn-primary w-full"
              disabled={loading || !code.trim()}
              aria-busy={loading}
            >
              {loading ? 'Signing in…' : 'Continue with Demo Code'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
