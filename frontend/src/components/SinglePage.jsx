import { useState, useRef, useEffect } from 'react';
import AppForm, { EMPTY_APP_DATA } from './AppForm.jsx';
import ResultCard from './ResultCard.jsx';
import { verifyLabel, finalizeLabel, prefillLabel } from '../api.js';
import { validateAppData, isValid } from '../validateAppData.js';

export default function SinglePage() {
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [appData, setAppData] = useState({ ...EMPTY_APP_DATA });
  const [loading, setLoading] = useState(false);
  const [deepLoading, setDeepLoading] = useState(false);
  const [usedDeep, setUsedDeep] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [forceShowErrors, setForceShowErrors] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [overrides, setOverrides] = useState({});
  const [openOverrides, setOpenOverrides] = useState(new Set());
  const [finalizeResult, setFinalizeResult] = useState(null);
  const [finalizeError, setFinalizeError] = useState(null);
  const [prefillLoading, setPrefillLoading] = useState(false);
  const [prefillNote, setPrefillNote] = useState(null);
  const inputRef = useRef();
  const resultRef = useRef();
  const formFieldRefs = useRef({});

  const handleToggleOverride = (field) => {
    const isOpen = openOverrides.has(field);
    setOpenOverrides((prev) => {
      const next = new Set(prev);
      if (isOpen) next.delete(field);
      else next.add(field);
      return next;
    });
    if (isOpen) {
      setOverrides((prev) => { const { [field]: _, ...rest } = prev; return rest; });
    }
  };

  const onEditField = (fieldName) => {
    const el = formFieldRefs.current[fieldName];
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.focus();
  };

  // Revoke the object URL whenever preview changes or the component unmounts
  useEffect(() => {
    return () => { if (preview) URL.revokeObjectURL(preview); };
  }, [preview]);

  const pickFile = (f) => {
    if (!f) return;
    setFile(f);
    setPreview(URL.createObjectURL(f));
    setResult(null);
    setError(null);
    setOverrides({});
    setOpenOverrides(new Set());
    setFinalizeResult(null);
    setFinalizeError(null);
    setUsedDeep(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    pickFile(e.dataTransfer.files[0]);
  };

  const handleReset = () => {
    if (preview) URL.revokeObjectURL(preview);
    setFile(null);
    setPreview(null);
    setAppData({ ...EMPTY_APP_DATA });
    setResult(null);
    setError(null);
    setForceShowErrors(false);
    setOverrides({});
    setOpenOverrides(new Set());
    setFinalizeResult(null);
    setFinalizeError(null);
    setUsedDeep(false);
    setPrefillNote(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!file) { setError('Please select a label image before submitting.'); return; }

    const errors = validateAppData(appData);
    if (!isValid(errors)) {
      setForceShowErrors(true);
      setError('Please fix the highlighted fields before submitting.');
      return;
    }

    setForceShowErrors(false);
    setLoading(true);
    setError(null);
    setResult(null);
    setOverrides({});
    setOpenOverrides(new Set());
    setFinalizeResult(null);
    setFinalizeError(null);
    try {
      const data = await verifyLabel(file, appData, usedDeep);
      setResult(data);
      // Move focus to results so keyboard/screen reader users land there
      setTimeout(() => resultRef.current?.focus(), 50);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDeepAnalyze = async () => {
    setDeepLoading(true);
    setError(null);
    setOverrides({});
    setOpenOverrides(new Set());
    setFinalizeResult(null);
    setFinalizeError(null);
    try {
      const data = await verifyLabel(file, appData, true);
      setUsedDeep(true);
      setResult(data);
      setTimeout(() => resultRef.current?.focus(), 50);
    } catch (err) {
      setError(err.message);
    } finally {
      setDeepLoading(false);
    }
  };

  const handlePrefill = async () => {
    setPrefillLoading(true);
    setPrefillNote(null);
    setError(null);
    try {
      const data = await prefillLabel(file);
      const updates = Object.fromEntries(
        Object.entries(data).filter(([, v]) => v !== null && v !== undefined && v !== '')
      );
      const filled = Object.keys(updates).length;
      setAppData((prev) => ({ ...prev, ...updates }));
      setPrefillNote(
        filled > 0
          ? `${filled} field${filled > 1 ? 's' : ''} filled from image — review and correct before verifying.`
          : 'No fields could be read with confidence — please fill in the form manually.'
      );
    } catch (err) {
      setError(`Prefill failed: ${err.message}`);
    } finally {
      setPrefillLoading(false);
    }
  };

  const handleFinalize = async () => {
    setFinalizeError(null);
    try {
      const data = await finalizeLabel(file.name, appData, result, overrides);
      setFinalizeResult(data);
    } catch (err) {
      setFinalizeError(err.message);
    }
  };

  const finalized = finalizeResult !== null;
  const reviewFields = result ? result.fields.filter((f) => f.result === 'review') : [];
  const unresolvedReviewCount = reviewFields.filter((f) => !overrides[f.field]?.disposition).length;
  const flaggedReviewCount = reviewFields.filter((f) => overrides[f.field]?.disposition === 'request_new_image').length;
  const canFinalize = unresolvedReviewCount === 0;

  return (
    <form onSubmit={handleSubmit} noValidate>
      <div className="card bg-base-100 shadow border border-base-200 p-7 mb-5">
        <h2 className="card-title mb-5">Step 1 — Upload Label Image</h2>
        <div
          className={`upload-zone${dragOver ? ' drag-over' : ''}`}
          onClick={() => inputRef.current.click()}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          role="button"
          tabIndex={0}
          aria-label={file ? `Label image selected: ${file.name}. Click to change.` : 'Upload label image — click or drag and drop'}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); inputRef.current.click(); } }}
        >
          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            style={{ display: 'none' }}
            onChange={(e) => pickFile(e.target.files[0])}
            aria-hidden="true"
          />
          {preview ? (
            <>
              <img src={preview} alt="Selected label" className="preview-img" />
              <p className="file-name">{file.name}</p>
            </>
          ) : (
            <>
              <div className="zone-icon" aria-hidden="true">&#128194;</div>
              <p className="font-semibold">Click or drag a label image here</p>
              <p className="zone-hint">JPEG, PNG, WebP, or GIF &mdash; up to 10 MB</p>
            </>
          )}
        </div>
        {preview && (
          <div className="flex justify-end mt-2">
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={(e) => { e.stopPropagation(); if (preview && new URL(preview).protocol === 'blob:') window.open(preview, '_blank', 'noopener,noreferrer,width=960,height=720,resizable,scrollbars'); }}
              aria-label="Open label image in a new window"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" width="15" height="15" aria-hidden="true">
                <path fillRule="evenodd" d="M4.25 5.5a.75.75 0 0 0-.75.75v8.5c0 .414.336.75.75.75h8.5a.75.75 0 0 0 .75-.75v-4a.75.75 0 0 1 1.5 0v4A2.25 2.25 0 0 1 12.75 17h-8.5A2.25 2.25 0 0 1 2 14.75v-8.5A2.25 2.25 0 0 1 4.25 4h5a.75.75 0 0 1 0 1.5h-5Z" clipRule="evenodd" />
                <path fillRule="evenodd" d="M6.194 12.753a.75.75 0 0 0 1.06.053L16.5 4.44v2.81a.75.75 0 0 0 1.5 0v-4.5a.75.75 0 0 0-.75-.75h-4.5a.75.75 0 0 0 0 1.5h2.553l-9.056 8.194a.75.75 0 0 0-.053 1.06Z" clipRule="evenodd" />
              </svg>
              Open in window
            </button>
          </div>
        )}
      </div>

      <div className="card bg-base-100 shadow border border-base-200 p-7 mb-5">
        <div className="flex items-center justify-between mb-5 gap-4 flex-wrap">
          <h2 className="card-title">Step 2 — Enter Application Data</h2>
          <button
            type="button"
            className="btn btn-outline btn-sm"
            onClick={handlePrefill}
            disabled={!file || prefillLoading || loading || deepLoading}
            aria-busy={prefillLoading}
          >
            {prefillLoading ? (
              <><span className="loading loading-spinner loading-xs" aria-hidden="true" /> Reading image…</>
            ) : (
              'Prefill from Image'
            )}
          </button>
        </div>
        <p className="mb-1 text-sm text-gray-500">
          Enter the values from the COLA application. The government health warning is checked automatically against the canonical TTB text.
        </p>
        <p className="mb-4 text-xs text-gray-400">
          <em>POC note: "Prefill from Image" reads the label to pre-populate fields with high-confidence values — in production this would be automated from the submitted COLA application data.</em>
        </p>
        {prefillNote && (
          <div className="alert alert-info text-sm mb-4" role="status">{prefillNote}</div>
        )}
        <AppForm value={appData} onChange={setAppData} idPrefix="s-" forceShowErrors={forceShowErrors} fieldRefs={formFieldRefs.current} />
      </div>

      {error && (
        <div className="alert alert-error text-sm font-medium mb-4" role="alert">{error}</div>
      )}

      {result && !finalized && (
        <p className="text-sm text-center mb-2 text-slate-500">
          Re-verifying will clear your current results and any decisions you have entered.
          {usedDeep && ' Deeper scan will be used automatically.'}
        </p>
      )}

      <button
        type="submit"
        className="btn w-full text-lg py-4 btn-verify"
        disabled={loading || !file}
        aria-busy={loading}
      >
        {loading ? (
          'Verifying…'
        ) : (
          <>
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" width="22" height="22" aria-hidden="true">
              <path fillRule="evenodd" d="M9 3.5a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11ZM2 9a7 7 0 1 1 12.452 4.391l3.328 3.329a.75.75 0 1 1-1.06 1.06l-3.329-3.328A7 7 0 0 1 2 9Z" clipRule="evenodd" />
            </svg>
            Verify Label
          </>
        )}
      </button>

      {loading && (
        <div className="flex justify-center mt-6">
          <span className="loading loading-spinner loading-md text-primary" role="status" aria-label="Verifying label, please wait" />
        </div>
      )}

      {deepLoading && (
        <div className="text-center mt-4">
          <span className="loading loading-spinner loading-md text-primary" role="status" aria-label="Deep analysis in progress" />
          <p className="text-sm mt-1 text-slate-500">
            Deep analysis in progress — examining image more carefully, may take a few extra seconds&hellip;
          </p>
        </div>
      )}

      {result && (
        <div className="card bg-base-100 shadow border border-base-200 p-7 mt-6 mb-5" tabIndex={-1} ref={resultRef}>
          <h2 className="card-title mb-5">Verification Results &mdash; {result.filename}</h2>

          {!finalized && reviewFields.length > 0 && (
            <>
              <div className="alert alert-warning mb-3" role="status">
                <strong>
                  {reviewFields.length} field{reviewFields.length > 1 ? 's' : ''} could not be read from the image.
                </strong>
                <span className="text-sm">
                  {' '}Try a deeper scan, or scroll down and enter what you can read for each field.
                </span>
              </div>
              {!deepLoading && (
                <button
                  type="button"
                  className="btn btn-reanalyze w-full mb-4"
                  onClick={handleDeepAnalyze}
                  disabled={loading || deepLoading}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" width="18" height="18" aria-hidden="true">
                    <path fillRule="evenodd" d="M15.312 11.424a5.5 5.5 0 0 1-9.201 2.466l-.312-.311h2.433a.75.75 0 0 0 0-1.5H3.989a.75.75 0 0 0-.75.75v4.242a.75.75 0 0 0 1.5 0v-2.43l.31.31a7 7 0 0 0 11.712-3.138.75.75 0 0 0-1.449-.39Zm1.23-3.723a.75.75 0 0 0 .219-.53V2.929a.75.75 0 0 0-1.5 0V5.36l-.31-.31A7 7 0 0 0 3.239 8.188a.75.75 0 1 0 1.448.389A5.5 5.5 0 0 1 13.89 6.11l.311.31h-2.432a.75.75 0 0 0 0 1.5h4.243a.75.75 0 0 0 .53-.219Z" clipRule="evenodd" />
                  </svg>
                  Re-analyze (deeper scan)
                </button>
              )}
            </>
          )}

          <ResultCard
            result={result}
            overrides={finalized ? undefined : overrides}
            onOverrideChange={(field, val) => setOverrides((prev) => ({ ...prev, [field]: val }))}
            onEditField={finalized ? undefined : onEditField}
            openOverrides={finalized ? undefined : openOverrides}
            onToggleOverride={finalized ? undefined : handleToggleOverride}
          />

          {!finalized ? (
            <div className="mt-5">
              {flaggedReviewCount > 0 && unresolvedReviewCount === 0 && (
                <p className="text-sm mb-3 text-amber-800">
                  Submitting will create a <strong>pending</strong> record — a case reference ID will be generated so you can request a new image from the applicant.
                </p>
              )}
              <div className="flex items-center gap-4 flex-wrap mt-6">
                <button type="button" className="btn btn-primary" onClick={handleFinalize} disabled={!canFinalize}>
                  Submit Record
                </button>
                {unresolvedReviewCount > 0
                  ? <span className="field-hint">Select Accept, Fail, or Need New Image for each highlighted field.</span>
                  : <span className="field-hint">{flaggedReviewCount > 0 ? 'Logs a pending record with a case ID.' : 'Saves this verification to the audit log.'}</span>
                }
              </div>
              {finalizeError && (
                <div className="alert alert-error text-sm font-medium mt-3" role="alert">{finalizeError}</div>
              )}
            </div>
          ) : finalizeResult?.status === 'pending' ? (
            <div className="mt-5">
              <div className="overall-banner overall-review" role="status">
                ⚠ Verification pending — Case <strong>{finalizeResult.case_id}</strong>
              </div>
              <p className="text-sm mt-3 text-amber-800">
                New image required for: <strong>{finalizeResult.pending_fields?.join(', ')}</strong>.
                Provide case <strong>{finalizeResult.case_id}</strong> to the applicant when requesting resubmission.
              </p>
              <button type="button" className="btn btn-outline mt-3" onClick={handleReset}>
                Verify Another Label
              </button>
            </div>
          ) : (
            <div className="mt-5">
              <div className="overall-banner overall-pass" role="status">
                ✓ Record saved to audit log — Case {finalizeResult?.case_id}
              </div>
              <button type="button" className="btn btn-outline mt-3" onClick={handleReset}>
                Verify Another Label
              </button>
            </div>
          )}
        </div>
      )}
    </form>
  );
}
