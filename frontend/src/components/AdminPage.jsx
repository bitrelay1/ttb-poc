import { useEffect, useState } from 'react';
import { csrfHeaders } from '../api.js';

const CATEGORIES = [
  {
    label: 'Audit',
    tabs: [
      { label: 'Audit Logs',       id: 'tab-audit',     panelId: 'panel-audit' },
      { label: 'Canonical Values', id: 'tab-canonical', panelId: 'panel-canonical' },
    ],
  },
  {
    label: 'Security',
    tabs: [
      { label: 'Allowed Emails', id: 'tab-allowlist', panelId: 'panel-allowlist' },
      { label: 'Auth Logs',      id: 'tab-authlog',   panelId: 'panel-authlog' },
      { label: 'Data Retention', id: 'tab-retention', panelId: 'panel-retention' },
      { label: 'Users',          id: 'tab-users',     panelId: 'panel-users' },
    ],
  },
];

export default function AdminPage() {
  const [category, setCategory] = useState('Audit');
  const [tab, setTab] = useState('Audit Logs');

  const activeCat = CATEGORIES.find((c) => c.label === category);

  const selectCategory = (catLabel) => {
    const cat = CATEGORIES.find((c) => c.label === catLabel);
    setCategory(catLabel);
    setTab(cat.tabs[0].label);
  };

  return (
    <div>
      <nav className="admin-category-nav" aria-label="Admin categories">
        {CATEGORIES.map((cat) => (
          <button
            key={cat.label}
            className="admin-category-btn"
            aria-current={category === cat.label ? 'true' : undefined}
            onClick={() => selectCategory(cat.label)}
          >
            {cat.label}
          </button>
        ))}
      </nav>
      <div role="tablist" aria-label={`${category} sections`} className="tabs tabs-border mb-6">
        {activeCat.tabs.map((t) => (
          <button
            key={t.label}
            id={t.id}
            role="tab"
            className={`tab font-medium${tab === t.label ? ' tab-active' : ''}`}
            aria-selected={tab === t.label}
            aria-controls={t.panelId}
            onClick={() => setTab(t.label)}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div id="panel-audit" role="tabpanel" aria-labelledby="tab-audit" hidden={tab !== 'Audit Logs'}>
        <AuditLogsTab />
      </div>
      <div id="panel-canonical" role="tabpanel" aria-labelledby="tab-canonical" hidden={tab !== 'Canonical Values'}>
        <CanonicalValuesTab />
      </div>
      <div id="panel-allowlist" role="tabpanel" aria-labelledby="tab-allowlist" hidden={tab !== 'Allowed Emails'}>
        <AllowedEmailsTab />
      </div>
      <div id="panel-authlog" role="tabpanel" aria-labelledby="tab-authlog" hidden={tab !== 'Auth Logs'}>
        <AuthLogsTab />
      </div>
      <div id="panel-retention" role="tabpanel" aria-labelledby="tab-retention" hidden={tab !== 'Data Retention'}>
        <DataRetentionTab />
      </div>
      <div id="panel-users" role="tabpanel" aria-labelledby="tab-users" hidden={tab !== 'Users'}>
        <UsersTab />
      </div>
    </div>
  );
}

// ── Audit Logs ────────────────────────────────────────────────────────────────

function AuditLogsTab() {
  const [logs, setLogs] = useState(null);
  const [total, setTotal] = useState(0);
  const [filterResult, setFilterResult] = useState('');
  const [filterIdentity, setFilterIdentity] = useState('');
  const [offset, setOffset] = useState(0);
  const [error, setError] = useState('');
  const LIMIT = 50;

  const load = async (off = 0) => {
    setLogs(null);
    setError('');
    const params = new URLSearchParams({ limit: LIMIT, offset: off });
    if (filterResult) params.set('result', filterResult);
    if (filterIdentity.trim()) params.set('identity', filterIdentity.trim());
    try {
      const res = await fetch(`/api/admin/audit-logs?${params}`);
      if (!res.ok) throw new Error(`Server error ${res.status}`);
      const data = await res.json();
      setLogs(data.items);
      setTotal(data.total);
      setOffset(off);
    } catch (err) {
      setError(err.message);
      setLogs([]);
    }
  };

  useEffect(() => { load(0); }, [filterResult]);

  const exportUrl = () => {
    const params = new URLSearchParams();
    if (filterResult) params.set('result', filterResult);
    if (filterIdentity.trim()) params.set('identity', filterIdentity.trim());
    return `/api/admin/audit-logs/export?${params}`;
  };

  return (
    <div className="card bg-base-100 shadow border border-base-200 p-7 mb-5">
      <div className="flex items-end justify-between gap-4 flex-wrap mb-5">
        <div className="flex gap-3 flex-wrap items-end">
          <div className="form-group">
            <label htmlFor="filter-result">Result</label>
            <select
              id="filter-result"
              value={filterResult}
              onChange={(e) => { setFilterResult(e.target.value); setOffset(0); }}
              className="select select-bordered"
            >
              <option value="">All</option>
              <option value="pass">Pass</option>
              <option value="fail">Fail</option>
              <option value="review">Review</option>
            </select>
          </div>
          <div className="form-group">
            <label htmlFor="filter-identity">User / Identity</label>
            <input
              id="filter-identity"
              type="text"
              value={filterIdentity}
              onChange={(e) => setFilterIdentity(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && load(0)}
              placeholder="email or demo-user"
              className="input input-bordered w-56"
            />
          </div>
          <button className="btn btn-secondary self-end" onClick={() => load(0)}>
            Search
          </button>
        </div>
        <a href={exportUrl()} className="btn btn-secondary" download>
          Export CSV
        </a>
      </div>

      {error && <div className="alert alert-error text-sm font-medium">{error}</div>}

      {logs === null ? (
        <div className="flex justify-center py-8"><span className="loading loading-spinner loading-md text-primary" role="status" aria-label="Loading…" /></div>
      ) : logs.length === 0 ? (
        <p className="text-slate-400 text-center py-8">No audit log entries found.</p>
      ) : (
        <>
          <p className="text-sm mb-3 text-slate-500">
            Showing {offset + 1}–{Math.min(offset + logs.length, total)} of {total}
          </p>
          <div className="overflow-x-auto">
            <table className="table table-zebra w-full text-sm">
              <thead>
                <tr>
                  <th>Timestamp</th>
                  <th>User / Identity</th>
                  <th>Label</th>
                  <th>Result</th>
                  <th>Batch</th>
                  <th>Fields</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <AuditRow key={log.id} log={log} />
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex gap-4 mt-4 justify-end">
            <button
              className="btn btn-secondary"
              disabled={offset === 0}
              onClick={() => load(Math.max(0, offset - LIMIT))}
            >
              ← Previous
            </button>
            <button
              className="btn btn-secondary"
              disabled={offset + logs.length >= total}
              onClick={() => load(offset + LIMIT)}
            >
              Next →
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function AuditRow({ log }) {
  const [expanded, setExpanded] = useState(false);
  const ts = log.created_at ? new Date(log.created_at).toLocaleString() : '—';
  const badgeClass = log.overall_result === 'pass' ? 'badge-pass' : log.overall_result === 'fail' ? 'badge-fail' : 'badge-review';
  const icon = log.overall_result === 'pass' ? '✓' : log.overall_result === 'fail' ? '✗' : '?';

  return (
    <>
      <tr>
        <td className="text-xs whitespace-nowrap">{ts}</td>
        <td className="text-sm">{log.session_identity}</td>
        <td className="text-sm break-all">{log.label_filename}</td>
        <td><span className={`badge ${badgeClass}`}>{icon} {log.overall_result.toUpperCase()}</span></td>
        <td className="text-xs text-slate-400">{log.batch_id ? log.batch_id.slice(0, 8) + '…' : '—'}</td>
        <td>
          <button
            className="btn btn-secondary btn-xs"
            onClick={() => setExpanded((v) => !v)}
            aria-expanded={expanded}
          >
            {expanded ? 'Hide' : 'Details'}
          </button>
        </td>
      </tr>
      {expanded && (
        <tr>
          <td colSpan={6} className="bg-gray-50 p-4">
            <table className="table table-zebra w-full text-xs">
              <thead>
                <tr>
                  <th>Field</th>
                  <th>Extracted</th>
                  <th>Submitted</th>
                  <th>Result</th>
                  <th>Note</th>
                </tr>
              </thead>
              <tbody>
                {(log.field_results || []).map((f, i) => {
                  const fc = f.result === 'pass' ? 'badge-pass' : f.result === 'fail' ? 'badge-fail' : 'badge-review';
                  return (
                    <tr key={i}>
                      <td className="font-semibold text-slate-800 whitespace-nowrap">{f.field}</td>
                      <td className="font-mono text-xs text-slate-500 break-words max-w-[220px]">{f.extracted ?? '—'}</td>
                      <td className="font-mono text-xs text-slate-500 break-words max-w-[220px]">{f.submitted ?? '—'}</td>
                      <td><span className={`badge ${fc}`}>{f.result}</span></td>
                      <td className="text-xs text-slate-500">{f.note ?? ''}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </td>
        </tr>
      )}
    </>
  );
}

// ── Auth Logs ─────────────────────────────────────────────────────────────────

const EVENT_LABELS = {
  login_success: { label: 'Login', cls: 'badge-pass' },
  login_failure: { label: 'Failed login', cls: 'badge-fail' },
  logout:        { label: 'Logout', cls: 'badge-review' },
};

function AuthLogsTab() {
  const [logs, setLogs] = useState(null);
  const [total, setTotal] = useState(0);
  const [filterEvent, setFilterEvent] = useState('');
  const [filterIdentity, setFilterIdentity] = useState('');
  const [offset, setOffset] = useState(0);
  const [error, setError] = useState('');
  const LIMIT = 50;

  const load = async (off = 0) => {
    setLogs(null);
    setError('');
    const params = new URLSearchParams({ limit: LIMIT, offset: off });
    if (filterEvent) params.set('event', filterEvent);
    if (filterIdentity.trim()) params.set('identity', filterIdentity.trim());
    try {
      const res = await fetch(`/api/admin/auth-logs?${params}`);
      if (!res.ok) throw new Error(`Server error ${res.status}`);
      const data = await res.json();
      setLogs(data.items);
      setTotal(data.total);
      setOffset(off);
    } catch (err) {
      setError(err.message);
      setLogs([]);
    }
  };

  useEffect(() => { load(0); }, [filterEvent]);

  const exportUrl = () => {
    const params = new URLSearchParams();
    if (filterEvent) params.set('event', filterEvent);
    if (filterIdentity.trim()) params.set('identity', filterIdentity.trim());
    return `/api/admin/auth-logs/export?${params}`;
  };

  return (
    <div className="card bg-base-100 shadow border border-base-200 p-7 mb-5">
      <div className="flex items-end justify-between gap-4 flex-wrap mb-5">
        <div className="flex gap-3 flex-wrap items-end">
          <div className="form-group">
            <label htmlFor="filter-event">Event</label>
            <select
              id="filter-event"
              value={filterEvent}
              onChange={(e) => { setFilterEvent(e.target.value); setOffset(0); }}
              className="select select-bordered"
            >
              <option value="">All</option>
              <option value="login_success">Login</option>
              <option value="login_failure">Failed login</option>
              <option value="logout">Logout</option>
            </select>
          </div>
          <div className="form-group">
            <label htmlFor="filter-auth-identity">User / Identity</label>
            <input
              id="filter-auth-identity"
              type="text"
              value={filterIdentity}
              onChange={(e) => setFilterIdentity(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && load(0)}
              placeholder="email or demo-user"
              className="input input-bordered w-56"
            />
          </div>
          <button className="btn btn-secondary self-end" onClick={() => load(0)}>
            Search
          </button>
        </div>
        <a href={exportUrl()} className="btn btn-secondary" download>
          Export CSV
        </a>
      </div>

      {error && <div className="alert alert-error text-sm font-medium">{error}</div>}

      {logs === null ? (
        <div className="flex justify-center py-8"><span className="loading loading-spinner loading-md text-primary" role="status" aria-label="Loading…" /></div>
      ) : logs.length === 0 ? (
        <p className="text-slate-400 text-center py-8">No auth log entries found.</p>
      ) : (
        <>
          <p className="text-sm mb-3 text-slate-500">
            Showing {offset + 1}–{Math.min(offset + logs.length, total)} of {total}
          </p>
          <div className="overflow-x-auto">
            <table className="table table-zebra w-full text-sm">
              <thead>
                <tr>
                  <th>Timestamp</th>
                  <th>Event</th>
                  <th>Identity</th>
                  <th>Provider</th>
                  <th>IP Address</th>
                  <th>Reason</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => {
                  const ev = EVENT_LABELS[log.event] ?? { label: log.event, cls: 'badge-review' };
                  return (
                    <tr key={log.id}>
                      <td className="text-xs whitespace-nowrap">
                        {log.created_at ? new Date(log.created_at).toLocaleString() : '—'}
                      </td>
                      <td><span className={`badge ${ev.cls}`}>{ev.label}</span></td>
                      <td className="text-sm">{log.session_identity}</td>
                      <td className="text-sm text-slate-500">{log.provider}</td>
                      <td className="text-xs text-slate-400 font-mono">{log.ip_address || '—'}</td>
                      <td className="text-xs text-red-700">{log.failure_reason || ''}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="flex gap-4 mt-4 justify-end">
            <button
              className="btn btn-secondary"
              disabled={offset === 0}
              onClick={() => load(Math.max(0, offset - LIMIT))}
            >
              ← Previous
            </button>
            <button
              className="btn btn-secondary"
              disabled={offset + logs.length >= total}
              onClick={() => load(offset + LIMIT)}
            >
              Next →
            </button>
          </div>
        </>
      )}
    </div>
  );
}


// ── Canonical Values ───────────────────────────────────────────────────────────

function CanonicalValuesTab() {
  const [values, setValues] = useState(null);
  const [editing, setEditing] = useState({});
  const [saving, setSaving] = useState({});
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/admin/canonical-values')
      .then((r) => r.json())
      .then((data) => {
        setValues(data);
        const initial = {};
        data.forEach((v) => { initial[v.key] = v.value; });
        setEditing(initial);
      })
      .catch((err) => setError(err.message));
  }, []);

  const save = async (key) => {
    setSaving((s) => ({ ...s, [key]: true }));
    setError('');
    try {
      const res = await fetch(`/api/admin/canonical-values/${key}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...csrfHeaders() },
        body: JSON.stringify({ value: editing[key] }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.detail ?? `Server error ${res.status}`);
      }
      const updated = await res.json();
      setValues((prev) => prev.map((v) => (v.key === key ? updated : v)));
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving((s) => ({ ...s, [key]: false }));
    }
  };

  return (
    <div className="card bg-base-100 shadow border border-base-200 p-7 mb-5">
      <h3 className="card-title mb-5">Canonical Values</h3>
      <p className="text-sm mb-5 text-slate-500">
        Edit the reference text used during label verification. Changes take effect on the next verification request.
      </p>
      {error && <div className="alert alert-error text-sm font-medium">{error}</div>}
      {values === null ? (
        <div className="flex justify-center py-8"><span className="loading loading-spinner loading-md text-primary" role="status" aria-label="Loading…" /></div>
      ) : (
        values.filter((v) => v.key !== 'retention_days').map((v) => (
          <div key={v.key} className="mb-6">
            <div className="flex items-baseline justify-between mb-2">
              <label htmlFor={`cv-${v.key}`} className="font-bold text-sm">{v.key}</label>
              {v.updated_at && (
                <span className="text-xs text-slate-400">
                  Last updated: {new Date(v.updated_at).toLocaleString()}
                </span>
              )}
            </div>
            <textarea
              id={`cv-${v.key}`}
              rows={4}
              className="textarea textarea-bordered w-full resize-y text-sm"
              value={editing[v.key] ?? v.value}
              onChange={(e) => setEditing((prev) => ({ ...prev, [v.key]: e.target.value }))}
            />
            <div className="flex justify-end mt-2">
              <button
                className="btn btn-primary"
                disabled={saving[v.key] || editing[v.key] === v.value}
                onClick={() => save(v.key)}
                aria-busy={saving[v.key]}
              >
                {saving[v.key] ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        ))
      )}
    </div>
  );
}

// ── Data Retention ────────────────────────────────────────────────────────────

function DataRetentionTab() {
  const [days, setDays] = useState('');
  const [savedDays, setSavedDays] = useState(null);
  const [saving, setSaving] = useState(false);
  const [purging, setPurging] = useState(false);
  const [purgeResult, setPurgeResult] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/admin/canonical-values')
      .then((r) => r.json())
      .then((data) => {
        const row = data.find((v) => v.key === 'retention_days');
        if (row) { setDays(row.value); setSavedDays(row.value); }
      })
      .catch((err) => setError(err.message));
  }, []);

  const savePolicy = async () => {
    const n = parseInt(days, 10);
    if (!n || n < 1) { setError('Retention period must be a whole number of days.'); return; }
    setSaving(true);
    setError('');
    try {
      const res = await fetch('/api/admin/canonical-values/retention_days', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...csrfHeaders() },
        body: JSON.stringify({ value: String(n) }),
      });
      if (!res.ok) { const b = await res.json().catch(() => null); throw new Error(b?.detail ?? `Error ${res.status}`); }
      setSavedDays(String(n));
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const purgeNow = async () => {
    setPurging(true);
    setPurgeResult(null);
    setError('');
    try {
      const res = await fetch('/api/admin/purge-logs', { method: 'POST', headers: csrfHeaders() });
      if (!res.ok) { const b = await res.json().catch(() => null); throw new Error(b?.detail ?? `Error ${res.status}`); }
      setPurgeResult(await res.json());
    } catch (err) {
      setError(err.message);
    } finally {
      setPurging(false);
    }
  };

  const years = savedDays ? (parseInt(savedDays, 10) / 365).toFixed(1) : null;

  return (
    <div className="card bg-base-100 shadow border border-base-200 p-7 mb-5">
      <h3 className="card-title mb-5">Data Retention Policy</h3>
      <p className="text-sm leading-relaxed mb-6 text-slate-600">
        Audit and auth logs older than the retention period are automatically deleted daily.
        The default of <strong>2,555 days (~7 years)</strong> aligns with the NARA baseline for
        administrative records. Adjust only after consulting your agency records officer.
      </p>

      {error && <div className="alert alert-error text-sm font-medium mb-4">{error}</div>}

      <div className="flex items-end gap-4 mb-6 flex-wrap">
        <div className="form-group">
          <label htmlFor="retention-days">Retention period (days)</label>
          <input
            id="retention-days"
            type="number"
            min="1"
            step="1"
            value={days}
            onChange={(e) => setDays(e.target.value)}
            className="input input-bordered w-36"
          />
        </div>
        <button
          className="btn btn-primary"
          disabled={saving || days === savedDays}
          onClick={savePolicy}
          aria-busy={saving}
        >
          {saving ? 'Saving…' : 'Save Policy'}
        </button>
      </div>

      {savedDays && (
        <p className="text-sm mb-6 text-slate-600">
          Current policy: logs older than <strong>{parseInt(savedDays, 10).toLocaleString()} days ({years} years)</strong> will be purged.
        </p>
      )}

      <hr className="my-6 border-slate-200" />

      <h4 className="font-bold text-base mb-2">Manual Purge</h4>
      <p className="text-sm mb-4 text-slate-500">
        Immediately delete all log entries that exceed the current retention period. This action cannot be undone.
      </p>
      <button
        className={`btn btn-secondary${purgeResult ? ' mb-4' : ''}`}
        disabled={purging}
        onClick={purgeNow}
        aria-busy={purging}
      >
        {purging ? 'Purging…' : 'Purge Logs Now'}
      </button>

      {purgeResult && (
        <div className="alert alert-success mt-4 text-sm">
          Purge complete — <strong>{purgeResult.audit_logs_deleted}</strong> audit log(s) and{' '}
          <strong>{purgeResult.auth_logs_deleted}</strong> auth log(s) deleted.
          Cutoff: {new Date(purgeResult.cutoff).toLocaleString()}.
        </div>
      )}
    </div>
  );
}


// ── Allowed Emails ────────────────────────────────────────────────────────────

function AllowedEmailsTab() {
  const [entries, setEntries] = useState(null);
  const [error, setError] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newRole, setNewRole] = useState('agent');
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState({});
  const [updatingRole, setUpdatingRole] = useState({});

  const load = () => {
    fetch('/api/admin/allowed-emails')
      .then((r) => r.json())
      .then(setEntries)
      .catch((err) => setError(err.message));
  };

  useEffect(() => { load(); }, []);

  const add = async () => {
    const email = newEmail.trim().toLowerCase();
    if (!email) { setError('Enter an email address.'); return; }
    setAdding(true);
    setError('');
    try {
      const res = await fetch('/api/admin/allowed-emails', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...csrfHeaders() },
        body: JSON.stringify({ email, role: newRole }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.detail ?? `Server error ${res.status}`);
      }
      setNewEmail('');
      setNewRole('agent');
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setAdding(false);
    }
  };

  const remove = async (entry) => {
    setRemoving((s) => ({ ...s, [entry.id]: true }));
    setError('');
    try {
      const res = await fetch(`/api/admin/allowed-emails/${entry.id}`, { method: 'DELETE', headers: csrfHeaders() });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.detail ?? `Server error ${res.status}`);
      }
      setEntries((prev) => prev.filter((e) => e.id !== entry.id));
    } catch (err) {
      setError(err.message);
    } finally {
      setRemoving((s) => ({ ...s, [entry.id]: false }));
    }
  };

  const changeRole = async (entry, role) => {
    setUpdatingRole((s) => ({ ...s, [entry.id]: true }));
    setError('');
    try {
      const res = await fetch(`/api/admin/allowed-emails/${entry.id}/role`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...csrfHeaders() },
        body: JSON.stringify({ role }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.detail ?? `Server error ${res.status}`);
      }
      const updated = await res.json();
      setEntries((prev) => prev.map((e) => (e.id === entry.id ? updated : e)));
    } catch (err) {
      setError(err.message);
    } finally {
      setUpdatingRole((s) => ({ ...s, [entry.id]: false }));
    }
  };

  return (
    <div className="card bg-base-100 shadow border border-base-200 p-7 mb-5">
      <h3 className="card-title mb-2">Allowed Emails</h3>
      <p className="text-sm mb-5 text-slate-500">
        Only email addresses on this list can sign in with Google. Add an email and role before the
        user logs in. Role changes take effect at their next login.
      </p>

      <div className="flex items-end gap-3 flex-wrap mb-6">
        <div className="form-group">
          <label htmlFor="new-email">Email address</label>
          <input
            id="new-email"
            type="email"
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && add()}
            placeholder="agent@agency.gov"
            className="input input-bordered w-64"
          />
        </div>
        <div className="form-group">
          <label htmlFor="new-role">Role</label>
          <select
            id="new-role"
            value={newRole}
            onChange={(e) => setNewRole(e.target.value)}
            className="select select-bordered"
          >
            <option value="agent">Agent</option>
            <option value="admin">Admin</option>
          </select>
        </div>
        <button
          className="btn btn-primary self-end"
          disabled={adding}
          onClick={add}
          aria-busy={adding}
        >
          {adding ? 'Adding…' : 'Add'}
        </button>
      </div>

      {error && <div className="alert alert-error text-sm font-medium mb-4">{error}</div>}

      {entries === null ? (
        <div className="flex justify-center py-8"><span className="loading loading-spinner loading-md text-primary" role="status" aria-label="Loading…" /></div>
      ) : entries.length === 0 ? (
        <p className="text-slate-400 text-center py-8">No allowed emails yet. Add one above.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="table table-zebra w-full text-sm">
            <thead>
              <tr>
                <th>Email</th>
                <th>Role</th>
                <th>Added</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <tr key={entry.id}>
                  <td className="font-mono text-sm">{entry.email}</td>
                  <td>
                    <select
                      value={entry.role}
                      disabled={updatingRole[entry.id]}
                      onChange={(e) => changeRole(entry, e.target.value)}
                      className="select select-bordered select-sm"
                      aria-label={`Role for ${entry.email}`}
                    >
                      <option value="agent">Agent</option>
                      <option value="admin">Admin</option>
                    </select>
                  </td>
                  <td className="text-xs text-slate-400">
                    {entry.added_at ? new Date(entry.added_at).toLocaleDateString() : '—'}
                  </td>
                  <td>
                    <button
                      className="btn btn-error btn-sm"
                      disabled={removing[entry.id]}
                      onClick={() => remove(entry)}
                      aria-busy={removing[entry.id]}
                    >
                      {removing[entry.id] ? 'Removing…' : 'Remove'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}


// ── Users ──────────────────────────────────────────────────────────────────────

function UsersTab() {
  const [entries, setEntries] = useState(null);
  const [usersByEmail, setUsersByEmail] = useState({});
  const [error, setError] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newRole, setNewRole] = useState('agent');
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState({});
  const [updatingRole, setUpdatingRole] = useState({});

  const load = async () => {
    setError('');
    try {
      const [allowRes, userRes] = await Promise.all([
        fetch('/api/admin/allowed-emails'),
        fetch('/api/admin/users'),
      ]);
      if (!allowRes.ok) throw new Error(`Server error ${allowRes.status}`);
      if (!userRes.ok) throw new Error(`Server error ${userRes.status}`);
      const [allowList, users] = await Promise.all([allowRes.json(), userRes.json()]);
      setEntries(allowList);
      const byEmail = {};
      users.forEach((u) => { byEmail[u.email] = u; });
      setUsersByEmail(byEmail);
    } catch (err) {
      setError(err.message);
      setEntries([]);
    }
  };

  useEffect(() => { load(); }, []);

  const addUser = async () => {
    const email = newEmail.trim().toLowerCase();
    if (!email) { setError('Enter an email address.'); return; }
    setAdding(true);
    setError('');
    try {
      const res = await fetch('/api/admin/allowed-emails', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...csrfHeaders() },
        body: JSON.stringify({ email, role: newRole }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.detail ?? `Server error ${res.status}`);
      }
      setNewEmail('');
      setNewRole('agent');
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setAdding(false);
    }
  };

  const changeRole = async (entry, role) => {
    setUpdatingRole((s) => ({ ...s, [entry.id]: true }));
    setError('');
    try {
      const res = await fetch(`/api/admin/allowed-emails/${entry.id}/role`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...csrfHeaders() },
        body: JSON.stringify({ role }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.detail ?? `Server error ${res.status}`);
      }
      const updated = await res.json();
      setEntries((prev) => prev.map((e) => (e.id === entry.id ? updated : e)));
    } catch (err) {
      setError(err.message);
    } finally {
      setUpdatingRole((s) => ({ ...s, [entry.id]: false }));
    }
  };

  const remove = async (entry) => {
    setRemoving((s) => ({ ...s, [entry.id]: true }));
    setError('');
    try {
      const res = await fetch(`/api/admin/allowed-emails/${entry.id}`, { method: 'DELETE', headers: csrfHeaders() });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.detail ?? `Server error ${res.status}`);
      }
      setEntries((prev) => prev.filter((e) => e.id !== entry.id));
    } catch (err) {
      setError(err.message);
    } finally {
      setRemoving((s) => ({ ...s, [entry.id]: false }));
    }
  };

  return (
    <div className="card bg-base-100 shadow border border-base-200 p-7 mb-5">
      <h3 className="card-title mb-2">Users</h3>
      <p className="text-sm mb-5 text-slate-500">
        Add an email address and role before the user logs in with Google. Only addresses on this list can sign in.
      </p>

      <div className="flex items-end gap-3 flex-wrap mb-6">
        <div className="form-group">
          <label htmlFor="users-new-email">Email address</label>
          <input
            id="users-new-email"
            type="email"
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addUser()}
            placeholder="agent@agency.gov"
            className="input input-bordered w-64"
          />
        </div>
        <div className="form-group">
          <label htmlFor="users-new-role">Role</label>
          <select
            id="users-new-role"
            value={newRole}
            onChange={(e) => setNewRole(e.target.value)}
            className="select select-bordered"
          >
            <option value="agent">Agent</option>
            <option value="admin">Admin</option>
          </select>
        </div>
        <button
          className="btn btn-primary self-end"
          disabled={adding}
          onClick={addUser}
          aria-busy={adding}
        >
          {adding ? 'Adding…' : 'Add User'}
        </button>
      </div>

      {error && <div className="alert alert-error text-sm font-medium mb-4">{error}</div>}

      {entries === null ? (
        <div className="flex justify-center py-8"><span className="loading loading-spinner loading-md text-primary" role="status" aria-label="Loading…" /></div>
      ) : entries.length === 0 ? (
        <p className="text-slate-400 text-center py-8">No users added yet. Use the form above to add one.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="table table-zebra w-full text-sm">
            <thead>
              <tr>
                <th>Email</th>
                <th>Name</th>
                <th>Role</th>
                <th>Status</th>
                <th>Last Login</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => {
                const u = usersByEmail[entry.email];
                return (
                  <tr key={entry.id}>
                    <td className="font-mono text-sm">{entry.email}</td>
                    <td className="text-sm text-slate-600">{u ? u.name : '—'}</td>
                    <td>
                      <select
                        value={entry.role}
                        disabled={updatingRole[entry.id]}
                        onChange={(e) => changeRole(entry, e.target.value)}
                        className="select select-bordered select-sm"
                        aria-label={`Role for ${entry.email}`}
                      >
                        <option value="agent">Agent</option>
                        <option value="admin">Admin</option>
                      </select>
                    </td>
                    <td>
                      {u
                        ? <span className="badge badge-pass">Active</span>
                        : <span className="badge badge-review">Pending</span>}
                    </td>
                    <td className="text-xs text-slate-400">
                      {u?.last_login ? new Date(u.last_login).toLocaleString() : 'Never'}
                    </td>
                    <td>
                      <button
                        className="btn btn-error btn-sm"
                        disabled={removing[entry.id]}
                        onClick={() => remove(entry)}
                        aria-busy={removing[entry.id]}
                      >
                        {removing[entry.id] ? 'Removing…' : 'Remove'}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
