const FIELD_LABELS = {
  brand_name: 'Brand Name',
  class_type: 'Class / Type',
  abv: 'Alcohol Content (ABV)',
  net_contents: 'Net Contents',
  bottler_name: 'Bottler Name',
  bottler_address: 'Bottler Address',
  country_of_origin: 'Country of Origin',
  government_warning: 'Government Warning',
  age_statement: 'Statement of Age',
  state_of_distillation: 'State of Distillation',
  error: 'Processing Error',
};

const OVERALL = {
  pass: { text: '✓ PASS — All fields verified', cls: 'overall-pass' },
  fail: { text: '✗ FAIL — One or more fields did not match', cls: 'overall-fail' },
  review: { text: '⚠ NEEDS REVIEW — Some fields require manual check', cls: 'overall-review' },
};

const BADGE = {
  pass: { text: '✓ PASS', cls: 'badge-pass' },
  fail: { text: '✗ FAIL', cls: 'badge-fail' },
  review: { text: '? REVIEW', cls: 'badge-review' },
  pending: { text: '⊘ PENDING', cls: 'badge-review' },
};

const REVIEW_DISPOSITIONS = [
  { value: 'accept', label: 'Accept', cls: 'disp-accept' },
  { value: 'fail', label: 'Fail', cls: 'disp-fail' },
  { value: 'request_new_image', label: 'Need New Image', cls: 'disp-new-image' },
];

const FORM_FIELDS = new Set([
  'brand_name', 'class_type', 'abv', 'net_contents', 'bottler_name', 'bottler_address', 'country_of_origin',
  'age_statement', 'state_of_distillation',
]);

function effectiveResult(aiResult, disposition) {
  if (!disposition) return aiResult;
  if (aiResult === 'review') {
    if (disposition === 'accept') return 'pass';
    if (disposition === 'fail') return 'fail';
    if (disposition === 'request_new_image') return 'pending';
  }
  if (aiResult === 'fail' && disposition === 'accept') return 'pass';
  if (aiResult === 'pass' && disposition === 'fail') return 'fail';
  return aiResult;
}

function computeEffectiveOverall(fields, overrides) {
  let hasFail = false;
  let hasReview = false;
  for (const f of fields) {
    const eff = effectiveResult(f.result, overrides?.[f.field]?.disposition);
    if (eff === 'fail') hasFail = true;
    if (eff === 'review' || eff === 'pending') hasReview = true;
  }
  if (hasFail) return 'fail';
  if (hasReview) return 'review';
  return 'pass';
}

function ReviewActionCard({ f, override, onOverrideChange }) {
  const fieldLabel = FIELD_LABELS[f.field] ?? f.field;
  const isResolved = !!override.disposition;
  const isGovWarning = f.field === 'government_warning';

  return (
    <div className={`action-card${isResolved ? ' action-card-resolved' : ''}`}>
      <div className="action-card-header">
        <span className="font-semibold text-slate-800">{fieldLabel}</span>
        <span className="text-xs text-amber-700">AI couldn&apos;t read this field from the image</span>
      </div>
      {f.note && <div className="text-xs text-slate-500 italic mt-0.5">{f.note}</div>}

      <div className="text-xs text-slate-500 mt-1 flex gap-3 flex-wrap">
        {f.extracted && <span>AI read: <span className="font-mono font-medium text-slate-700">{f.extracted}</span></span>}
        {f.submitted && <span>Submitted: <span className="font-mono font-medium text-slate-700">{f.submitted}</span></span>}
      </div>

      {isGovWarning && (
        <div className="mt-2 text-xs font-semibold text-amber-800 bg-amber-50 border border-amber-200 rounded px-2 py-1.5">
          Recommendation: Need New Image — exact match cannot be confirmed without a clear read.
        </div>
      )}

      <div className="mt-3">
        <span className="font-semibold text-sm mr-2">Decision:</span>
        <div className="disp-group" role="group" aria-label={`Decision for ${fieldLabel}`}>
          {REVIEW_DISPOSITIONS.map((d) => (
            <button
              key={d.value}
              type="button"
              className={`disp-btn ${d.cls}${override.disposition === d.value ? ' selected' : ''}`}
              onClick={() => onOverrideChange({ ...override, disposition: d.value })}
              aria-pressed={override.disposition === d.value}
            >
              {d.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function PassFailOverrideCard({ f, override, onOverrideChange, onCancel }) {
  const fieldLabel = FIELD_LABELS[f.field] ?? f.field;
  const isConfirmed = !!override.disposition;
  const isPassField = f.result === 'pass';
  const confirmLabel = isPassField ? 'Mark as Failed' : 'Mark as Passed';
  const confirmedLabel = isPassField ? 'Overridden to FAIL' : 'Overridden to PASS';
  const confirmedIsFail = isPassField;

  const handleConfirm = () => {
    onOverrideChange({ ...override, disposition: isPassField ? 'fail' : 'accept' });
  };

  const handleUndo = () => {
    onOverrideChange({ note: override.note ?? '' });
  };

  return (
    <div className={`action-card${isConfirmed ? ` action-card-override-confirmed${confirmedIsFail ? ' is-fail' : ''}` : ''}`}>
      <div className="action-card-header">
        <span className="font-semibold text-slate-800">{fieldLabel}</span>
        <span className={`text-xs font-semibold ${f.result === 'fail' ? 'text-red-600' : 'text-green-700'}`}>
          AI result: {f.result.toUpperCase()}
        </span>
      </div>

      <div className="text-xs text-slate-500 mt-0.5 flex gap-3 flex-wrap">
        {f.extracted && <span>AI read: <span className="font-mono font-medium text-slate-700">{f.extracted}</span></span>}
        {f.submitted && <span>Submitted: <span className="font-mono font-medium text-slate-700">{f.submitted}</span></span>}
      </div>

      {!isConfirmed ? (
        <>
          <div className="mt-3">
            <label className="block text-xs font-semibold text-slate-500 tracking-wide mb-1.5">
              Override reason:
            </label>
            <input
              type="text"
              value={override.note ?? ''}
              onChange={(e) => onOverrideChange({ ...override, note: e.target.value })}
              placeholder="Briefly explain why the AI result is incorrect…"
              aria-label={`Override reason for ${fieldLabel}`}
              className="input input-sm w-full"
            />
          </div>
          <div className="flex items-center gap-2 mt-3">
            <button
              type="button"
              className="btn btn-sm btn-primary"
              onClick={handleConfirm}
              disabled={!override.note?.trim()}
            >
              {confirmLabel}
            </button>
            <button
              type="button"
              className="btn btn-sm btn-ghost"
              onClick={onCancel}
            >
              Cancel
            </button>
          </div>
        </>
      ) : (
        <div className="mt-2 flex items-center justify-between gap-3 flex-wrap">
          <div className="text-sm">
            <span className={`font-semibold ${confirmedIsFail ? 'text-red-700' : 'text-green-700'}`}>
              {confirmedLabel}
            </span>
            {override.note && (
              <span className="text-slate-500 ml-2">— {override.note}</span>
            )}
          </div>
          <button
            type="button"
            className="btn btn-xs btn-ghost"
            onClick={handleUndo}
          >
            Undo
          </button>
        </div>
      )}
    </div>
  );
}

// overrides: { [fieldName]: { disposition, note } } — when provided, action controls are shown
// onOverrideChange: (fieldName, { disposition, note }) => void
// onEditField: (fieldName) => void — scrolls the form field into view and focuses it
// openOverrides: Set<fieldName> — which PASS/FAIL fields have override panels open
// onToggleOverride: (fieldName) => void — opens/closes a PASS/FAIL override panel
export default function ResultCard({ result, overrides, onOverrideChange, onEditField, openOverrides, onToggleOverride }) {
  const effectiveOverall = overrides !== undefined
    ? computeEffectiveOverall(result.fields, overrides)
    : result.overall;
  const overall = OVERALL[effectiveOverall] ?? OVERALL.review;

  const canOverride = overrides !== undefined && !!onToggleOverride;

  const actionFields = result.fields.filter((f) => {
    if (f.result === 'review') return true;
    if ((f.result === 'pass' || f.result === 'fail') && openOverrides?.has(f.field)) return true;
    return false;
  });

  return (
    <>
      <div className={`overall-banner ${overall.cls}`} role="status" aria-live="polite">
        {overall.text}
      </div>

      <div className="overflow-x-auto">
        <table className="table table-zebra w-full text-sm" aria-label="Field-by-field verification results">
          <thead>
            <tr>
              <th scope="col">Field</th>
              <th scope="col">Extracted from Label</th>
              <th scope="col">Application Data</th>
              <th scope="col">Result</th>
            </tr>
          </thead>
          <tbody>
            {result.fields.map((f, i) => {
              const override = overrides?.[f.field];
              const effResult = effectiveResult(f.result, override?.disposition);
              const badge = BADGE[effResult] ?? BADGE.review;
              const showOverrideBtn = canOverride
                && (f.result === 'pass' || f.result === 'fail')
                && !(f.field === 'government_warning' && f.result === 'fail')
                && !openOverrides?.has(f.field);

              return (
                <tr key={i}>
                  <td>
                    <span className="font-semibold text-slate-800 whitespace-nowrap">
                      {FIELD_LABELS[f.field] ?? f.field}
                    </span>
                  </td>
                  <td>
                    <span className="font-mono text-xs text-slate-500 break-words block max-w-[220px]">
                      {f.extracted ?? '—'}
                    </span>
                  </td>
                  <td>
                    <span className="font-mono text-xs text-slate-500 break-words block max-w-[220px]">
                      {f.submitted ?? '—'}
                    </span>
                    {onEditField && FORM_FIELDS.has(f.field) && (f.result === 'fail' || f.result === 'review') && (
                      <button type="button" className="fix-entry-btn" onClick={() => onEditField(f.field)}>
                        Fix my entry
                      </button>
                    )}
                  </td>
                  <td>
                    <span className={`badge ${badge.cls}`}>{badge.text}</span>
                    {f.result === 'review' && !override?.disposition && (
                      <div className="text-xs text-amber-700 mt-1">↓ Resolve below</div>
                    )}
                    {showOverrideBtn && (
                      <button
                        type="button"
                        className="override-btn"
                        onClick={() => onToggleOverride(f.field)}
                        aria-label={`Override ${FIELD_LABELS[f.field] ?? f.field} result`}
                      >
                        Override
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {actionFields.length > 0 && overrides !== undefined && (
        <div className="mt-5">
          <p className="actions-section-title">Actions Required</p>
          <div className="flex flex-col gap-3">
            {actionFields.map((f) => {
              const override = overrides[f.field] ?? {};
              if (f.result === 'review') {
                return (
                  <ReviewActionCard
                    key={f.field}
                    f={f}
                    override={override}
                    onOverrideChange={(val) => onOverrideChange(f.field, val)}
                  />
                );
              }
              return (
                <PassFailOverrideCard
                  key={f.field}
                  f={f}
                  override={override}
                  onOverrideChange={(val) => onOverrideChange(f.field, val)}
                  onCancel={() => onToggleOverride(f.field)}
                />
              );
            })}
          </div>
        </div>
      )}
    </>
  );
}
