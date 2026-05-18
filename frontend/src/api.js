export function csrfHeaders() {
  const token = document.cookie
    .split('; ')
    .find((c) => c.startsWith('ttb_csrf='))
    ?.split('=')[1] ?? '';
  return token ? { 'X-CSRF-Token': token } : {};
}

function prepareAppData(appData) {
  const { bottler_city, bottler_state, bottler_zip, ...rest } = appData;
  const parts = [bottler_city, bottler_state, bottler_zip].filter(Boolean);
  return { ...rest, bottler_address: parts.join(', ') };
}

export async function verifyLabel(imageFile, appData, deep = false) {
  const form = new FormData();
  form.append('image', imageFile);
  form.append('application_data', JSON.stringify(prepareAppData(appData)));
  const url = deep ? '/api/verify/?deep=true' : '/api/verify/';
  const res = await fetch(url, { method: 'POST', body: form, headers: csrfHeaders(), signal: AbortSignal.timeout(35000) });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(_formatDetail(body?.detail, res.status));
  }
  return res.json();
}

function _formatDetail(detail, status) {
  if (!detail) return `Server error ${status}`;
  if (Array.isArray(detail)) return detail.map((e) => e.msg ?? JSON.stringify(e)).join('; ');
  return String(detail);
}

export async function prefillLabel(imageFile) {
  const form = new FormData();
  form.append('image', imageFile);
  const res = await fetch('/api/verify/prefill', { method: 'POST', body: form, headers: csrfHeaders(), signal: AbortSignal.timeout(15000) });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(_formatDetail(body?.detail, res.status));
  }
  return res.json();
}

export async function finalizeLabel(filename, appData, result, overrides = {}, batchId = null) {
  const confirmedOverrides = Object.fromEntries(
    Object.entries(overrides).filter(([, v]) => v?.disposition)
  );
  const body = { filename, application_data: prepareAppData(appData), result, overrides: confirmedOverrides };
  if (batchId) body.batch_id = batchId;
  const res = await fetch('/api/verify/finalize', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...csrfHeaders() },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new Error(_formatDetail(data?.detail, res.status));
  }
  return res.json();
}
