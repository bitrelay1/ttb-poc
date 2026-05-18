import { useState, useRef, useEffect } from 'react';
import AppForm, { EMPTY_APP_DATA } from './AppForm.jsx';
import ResultCard from './ResultCard.jsx';
import { verifyLabel, finalizeLabel, prefillLabel } from '../api.js';
import { validateAppData, isValid } from '../validateAppData.js';

const CONCURRENCY = 5;

export default function BatchPage() {
  const [items, setItems] = useState([]);
  const [results, setResults] = useState({});
  const [running, setRunning] = useState(false);
  const [forceErrors, setForceErrors] = useState(false);
  const [itemOverrides, setItemOverrides] = useState({});
  const [itemOpenOverrides, setItemOpenOverrides] = useState({});
  const [deepRunning, setDeepRunning] = useState({});
  const [deepUsed, setDeepUsed] = useState({});
  const [prefillRunning, setPrefillRunning] = useState({});
  const [prefillNotes, setPrefillNotes] = useState({});
  const [reverifying, setReverifying] = useState({});
  const [itemFinalizeResults, setItemFinalizeResults] = useState({});
  const [itemFinalizeErrors, setItemFinalizeErrors] = useState({});
  const [itemFinalizing, setItemFinalizing] = useState({});
  const inputRef = useRef();
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const batchFieldRefs = useRef(new Map());

  const getFieldRefs = (itemId) => {
    if (!batchFieldRefs.current.has(itemId)) batchFieldRefs.current.set(itemId, {});
    return batchFieldRefs.current.get(itemId);
  };

  useEffect(() => {
    return () => {
      itemsRef.current.forEach((item) => URL.revokeObjectURL(item.preview));
    };
  }, []);

  const addFiles = (files) => {
    const next = Array.from(files).map((f) => ({
      id: crypto.randomUUID(),
      file: f,
      preview: URL.createObjectURL(f),
      appData: { ...EMPTY_APP_DATA },
    }));
    setItems((prev) => [...prev, ...next]);
  };

  const updateAppData = (id, data) => {
    setItems((prev) => prev.map((item) => (item.id === id ? { ...item, appData: data } : item)));
  };

  const handleToggleItemOverride = (itemId, field) => {
    const isOpen = (itemOpenOverrides[itemId] ?? new Set()).has(field);
    setItemOpenOverrides((prev) => {
      const prevSet = prev[itemId] ?? new Set();
      const next = new Set(prevSet);
      if (isOpen) next.delete(field);
      else next.add(field);
      return { ...prev, [itemId]: next };
    });
    if (isOpen) {
      setItemOverrides((prev) => {
        const prevItem = prev[itemId] ?? {};
        const { [field]: _, ...rest } = prevItem;
        return { ...prev, [itemId]: rest };
      });
    }
  };

  const removeItem = (id) => {
    const item = items.find((it) => it.id === id);
    if (item) URL.revokeObjectURL(item.preview);
    batchFieldRefs.current.delete(id);
    setItems((prev) => prev.filter((it) => it.id !== id));
    const drop = (prev) => { const n = { ...prev }; delete n[id]; return n; };
    setResults(drop);
    setItemOverrides(drop);
    setItemOpenOverrides(drop);
    setItemFinalizeResults(drop);
    setItemFinalizeErrors(drop);
    setDeepUsed(drop);
    setDeepRunning(drop);
    setReverifying(drop);
    setItemFinalizing(drop);
    setPrefillRunning(drop);
    setPrefillNotes(drop);
  };

  const handleVerifyAll = async () => {
    if (!items.length) return;
    // Skip items already submitted — don't wipe their records
    const toVerify = items.filter((item) => !itemFinalizeResults[item.id]);
    if (!toVerify.length) return;
    const invalidCount = toVerify.filter((item) => !isValid(validateAppData(item.appData))).length;
    if (invalidCount > 0) { setForceErrors(true); return; }
    setForceErrors(false);
    setRunning(true);
    const clearIds = new Set(toVerify.map((it) => it.id));
    const dropIds = (prev) => Object.fromEntries(Object.entries(prev).filter(([k]) => !clearIds.has(k)));
    setResults(dropIds);
    setItemOverrides(dropIds);
    setItemOpenOverrides(dropIds);
    setItemFinalizeErrors(dropIds);
    setDeepUsed(dropIds);
    const queue = [...toVerify];
    async function worker() {
      while (queue.length > 0) {
        const item = queue.shift();
        if (!item) return;
        try {
          const data = await verifyLabel(item.file, item.appData);
          setResults((prev) => ({ ...prev, [item.id]: { ok: true, data } }));
        } catch (err) {
          setResults((prev) => ({ ...prev, [item.id]: { ok: false, error: err.message } }));
        }
      }
    }
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, toVerify.length) }, worker));
    setRunning(false);
  };

  const handleDeepItem = async (id) => {
    const item = items.find((it) => it.id === id);
    if (!item) return;
    setDeepRunning((prev) => ({ ...prev, [id]: true }));
    setItemOverrides((prev) => ({ ...prev, [id]: {} }));
    setItemOpenOverrides((prev) => { const n = { ...prev }; delete n[id]; return n; });
    const drop = (prev) => { const n = { ...prev }; delete n[id]; return n; };
    setItemFinalizeResults(drop);
    setItemFinalizeErrors(drop);
    try {
      const data = await verifyLabel(item.file, item.appData, true);
      setDeepUsed((prev) => ({ ...prev, [id]: true }));
      setResults((prev) => ({ ...prev, [id]: { ok: true, data } }));
    } catch (err) {
      setResults((prev) => ({ ...prev, [id]: { ok: false, error: err.message } }));
    } finally {
      setDeepRunning((prev) => { const n = { ...prev }; delete n[id]; return n; });
    }
  };

  const handleReverifyItem = async (id) => {
    const item = items.find((it) => it.id === id);
    if (!item) return;
    setReverifying((prev) => ({ ...prev, [id]: true }));
    const drop = (prev) => { const n = { ...prev }; delete n[id]; return n; };
    setResults(drop);
    setDeepUsed(drop);
    setItemOverrides((prev) => ({ ...prev, [id]: {} }));
    setItemOpenOverrides((prev) => { const n = { ...prev }; delete n[id]; return n; });
    setItemFinalizeResults(drop);
    setItemFinalizeErrors(drop);
    try {
      const data = await verifyLabel(item.file, item.appData, false);
      setResults((prev) => ({ ...prev, [id]: { ok: true, data } }));
    } catch (err) {
      setResults((prev) => ({ ...prev, [id]: { ok: false, error: err.message } }));
    } finally {
      setReverifying((prev) => { const n = { ...prev }; delete n[id]; return n; });
    }
  };

  const handlePrefillItem = async (id) => {
    const item = items.find((it) => it.id === id);
    if (!item) return;
    setPrefillRunning((prev) => ({ ...prev, [id]: true }));
    setPrefillNotes((prev) => ({ ...prev, [id]: null }));
    try {
      const data = await prefillLabel(item.file);
      const updates = Object.fromEntries(
        Object.entries(data).filter(([, v]) => v !== null && v !== undefined && v !== '')
      );
      const filled = Object.keys(updates).length;
      updateAppData(id, { ...item.appData, ...updates });
      setPrefillNotes((prev) => ({
        ...prev,
        [id]: filled > 0
          ? `${filled} field${filled > 1 ? 's' : ''} filled — review before verifying.`
          : 'No fields could be read with confidence.',
      }));
    } catch {
      setPrefillNotes((prev) => ({ ...prev, [id]: 'Prefill failed — fill in manually.' }));
    } finally {
      setPrefillRunning((prev) => { const n = { ...prev }; delete n[id]; return n; });
    }
  };

  const handleFinalizeItem = async (id) => {
    const item = items.find((it) => it.id === id);
    if (!item || !results[id]?.ok) return;
    setItemFinalizing((prev) => ({ ...prev, [id]: true }));
    setItemFinalizeErrors((prev) => { const n = { ...prev }; delete n[id]; return n; });
    try {
      const data = await finalizeLabel(item.file.name, item.appData, results[id].data, itemOverrides[id] ?? {});
      setItemFinalizeResults((prev) => ({ ...prev, [id]: data }));
    } catch (err) {
      setItemFinalizeErrors((prev) => ({ ...prev, [id]: err.message }));
    } finally {
      setItemFinalizing((prev) => { const n = { ...prev }; delete n[id]; return n; });
    }
  };

  const handleSubmitAllReady = async () => {
    setRunning(true);
    const readyItems = items.filter((item) => {
      const res = results[item.id];
      if (!res?.ok || itemFinalizeResults[item.id]) return false;
      const reviewFields = res.data.fields.filter((f) => f.result === 'review');
      return reviewFields.every((f) => !!itemOverrides[item.id]?.[f.field]?.disposition);
    });
    for (const item of readyItems) {
      try {
        const data = await finalizeLabel(item.file.name, item.appData, results[item.id].data, itemOverrides[item.id] ?? {});
        setItemFinalizeResults((prev) => ({ ...prev, [item.id]: data }));
      } catch (err) {
        setItemFinalizeErrors((prev) => ({ ...prev, [item.id]: err.message }));
      }
    }
    setRunning(false);
  };

  const toVerifyCount = items.filter((item) => !itemFinalizeResults[item.id]).length;
  const doneCount = items.filter((item) => !itemFinalizeResults[item.id] && !!results[item.id]).length;
  const invalidIds = forceErrors
    ? new Set(items.filter((item) => !itemFinalizeResults[item.id] && !isValid(validateAppData(item.appData))).map((item) => item.id))
    : new Set();
  const readyToSubmitCount = items.filter((item) => {
    const res = results[item.id];
    if (!res?.ok || itemFinalizeResults[item.id]) return false;
    const reviewFields = res.data.fields.filter((f) => f.result === 'review');
    return reviewFields.every((f) => !!itemOverrides[item.id]?.[f.field]?.disposition);
  }).length;
  const needsReviewCount = items.filter((item) => {
    const res = results[item.id];
    if (!res?.ok || itemFinalizeResults[item.id]) return false;
    const reviewFields = res.data.fields.filter((f) => f.result === 'review');
    return reviewFields.some((f) => !itemOverrides[item.id]?.[f.field]?.disposition);
  }).length;

  return (
    <>
      <div className="card bg-base-100 shadow border border-base-200 p-7 mb-5 flex-row items-center justify-between flex-wrap gap-4">
        <div>
          <h2 className="card-title mb-1">Batch Label Verification</h2>
          <p className="text-sm text-gray-500">
            Add images, fill in application data for each, then click <strong>Verify All</strong>.
            Results appear as each label completes.
          </p>
        </div>
        <button type="button" className="btn btn-secondary" onClick={() => inputRef.current.click()} disabled={running}>
          + Add Images
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          multiple
          style={{ display: 'none' }}
          aria-hidden="true"
          onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }}
        />
      </div>

      {items.length === 0 ? (
        <div className="card bg-base-100 shadow border border-base-200 text-center text-slate-400 py-14 px-4">
          <p>No labels added yet.</p>
          <p className="mt-2 text-sm">
            Click <strong>+ Add Images</strong> above to select one or more label images.
          </p>
        </div>
      ) : (
        <>
          {items.map((item, i) => {
            const res = results[item.id];
            const isFinalized = !!itemFinalizeResults[item.id];
            const isDeepRunning = !!deepRunning[item.id];
            const isReverifying = !!reverifying[item.id];
            const isFinalizing = !!itemFinalizing[item.id];
            const isItemBusy = running || isDeepRunning || isReverifying || isFinalizing;
            const pending = (running || isReverifying) && res === undefined;
            const overrides = itemOverrides[item.id] ?? {};
            const reviewFields = res?.ok ? res.data.fields.filter((f) => f.result === 'review') : [];
            const hasReview = reviewFields.length > 0;
            const unresolvedCount = reviewFields.filter((f) => !overrides[f.field]?.disposition).length;
            const hasPendingField = reviewFields.some((f) => overrides[f.field]?.disposition === 'request_new_image');
            const canSubmit = res?.ok && unresolvedCount === 0 && !isFinalized && !isFinalizing;
            const finalizeResult = itemFinalizeResults[item.id];
            const finalizeError = itemFinalizeErrors[item.id];

            return (
              <div key={item.id} className="card bg-base-100 border border-base-200 mb-4 shadow-sm">
                <div className="flex items-center justify-between gap-3 bg-slate-50 border-b border-slate-200 px-4 py-2.5 font-semibold text-sm text-slate-600">
                  <span>#{i + 1} &mdash; {item.file.name}</span>
                  <div className="flex items-center gap-2">
                    {invalidIds.has(item.id) && !res && (
                      <span className="badge badge-fail">FIX REQUIRED</span>
                    )}
                    {res && (
                      <span className={`badge badge-${res.ok ? (isFinalized ? 'pass' : res.data.overall) : 'review'}`}>
                        {res.ok ? (isFinalized ? 'SUBMITTED' : res.data.overall.toUpperCase()) : 'ERROR'}
                      </span>
                    )}
                    {!isItemBusy && !isFinalized && (
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm btn-circle text-xl text-slate-400 hover:text-error"
                        onClick={() => removeItem(item.id)}
                        aria-label={`Remove ${item.file.name}`}
                      >
                        &times;
                      </button>
                    )}
                  </div>
                </div>

                <div className="p-4">
                  <div className="flex gap-5 flex-wrap mb-4">
                    <div className="thumb-col">
                      <div className="thumb-wrap">
                        <img src={item.preview} alt={`Label ${i + 1} thumbnail`} className="batch-thumb" />
                      </div>
                      <button
                        type="button"
                        className="btn btn-ghost btn-xs"
                        onClick={() => window.open(item.preview, '_blank', 'noopener,noreferrer,width=960,height=720,resizable,scrollbars')}
                        aria-label={`Open label ${i + 1} in a new window`}
                        title="Open full image in a new window"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" width="12" height="12" aria-hidden="true">
                          <path fillRule="evenodd" d="M4.25 5.5a.75.75 0 0 0-.75.75v8.5c0 .414.336.75.75.75h8.5a.75.75 0 0 0 .75-.75v-4a.75.75 0 0 1 1.5 0v4A2.25 2.25 0 0 1 12.75 17h-8.5A2.25 2.25 0 0 1 2 14.75v-8.5A2.25 2.25 0 0 1 4.25 4h5a.75.75 0 0 1 0 1.5h-5Z" clipRule="evenodd" />
                          <path fillRule="evenodd" d="M6.194 12.753a.75.75 0 0 0 1.06.053L16.5 4.44v2.81a.75.75 0 0 0 1.5 0v-4.5a.75.75 0 0 0-.75-.75h-4.5a.75.75 0 0 0 0 1.5h2.553l-9.056 8.194a.75.75 0 0 0-.053 1.06Z" clipRule="evenodd" />
                        </svg>
                        Open
                      </button>
                    </div>
                    <div className="flex-1 min-w-[240px]">
                      <div className="flex items-center justify-between mb-2 gap-3 flex-wrap">
                        <button
                          type="button"
                          className="btn btn-outline btn-xs"
                          onClick={() => handlePrefillItem(item.id)}
                          disabled={isItemBusy || !!prefillRunning[item.id] || isFinalized}
                          aria-busy={!!prefillRunning[item.id]}
                        >
                          {prefillRunning[item.id] ? (
                            <><span className="loading loading-spinner loading-xs" aria-hidden="true" /> Reading…</>
                          ) : (
                            'Prefill from Image'
                          )}
                        </button>
                        {prefillNotes[item.id] && (
                          <span className="text-xs text-gray-500 italic">{prefillNotes[item.id]}</span>
                        )}
                      </div>
                      <AppForm
                        value={item.appData}
                        onChange={(data) => updateAppData(item.id, data)}
                        idPrefix={`b${item.id}-`}
                        forceShowErrors={forceErrors}
                        fieldRefs={getFieldRefs(item.id)}
                      />
                    </div>
                  </div>

                  {pending && (
                    <div className="flex justify-center mt-4">
                      <span className="loading loading-spinner loading-md text-primary" role="status" aria-label={`Verifying label ${i + 1}…`} />
                    </div>
                  )}

                  {res && (
                    <div className="mt-3">
                      {res.ok ? (
                        <>
                          {!isFinalized && hasReview && (
                            <>
                              <div className="alert alert-warning mb-3" role="status">
                                <strong>
                                  {reviewFields.length} field{reviewFields.length > 1 ? 's' : ''} could not be read from the image.
                                </strong>
                                <span className="text-sm">
                                  {' '}Try a deeper scan, or scroll up and enter what you can read for each field.
                                </span>
                              </div>
                              {!isDeepRunning && !deepUsed[item.id] && (
                                <button
                                  type="button"
                                  className="btn btn-reanalyze w-full mb-4"
                                  onClick={() => handleDeepItem(item.id)}
                                  disabled={isItemBusy}
                                >
                                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" width="18" height="18" aria-hidden="true">
                                    <path fillRule="evenodd" d="M15.312 11.424a5.5 5.5 0 0 1-9.201 2.466l-.312-.311h2.433a.75.75 0 0 0 0-1.5H3.989a.75.75 0 0 0-.75.75v4.242a.75.75 0 0 0 1.5 0v-2.43l.31.31a7 7 0 0 0 11.712-3.138.75.75 0 0 0-1.449-.39Zm1.23-3.723a.75.75 0 0 0 .219-.53V2.929a.75.75 0 0 0-1.5 0V5.36l-.31-.31A7 7 0 0 0 3.239 8.188a.75.75 0 1 0 1.448.389A5.5 5.5 0 0 1 13.89 6.11l.311.31h-2.432a.75.75 0 0 0 0 1.5h4.243a.75.75 0 0 0 .53-.219Z" clipRule="evenodd" />
                                  </svg>
                                  Re-analyze (deeper scan)
                                </button>
                              )}
                              {isDeepRunning && (
                                <div className="text-center mb-4">
                                  <span className="loading loading-spinner loading-md text-primary" role="status" aria-label="Deep analysis in progress" />
                                  <p className="text-sm mt-1 text-slate-500">
                                    Deep analysis in progress — examining image more carefully…
                                  </p>
                                </div>
                              )}
                            </>
                          )}

                          <ResultCard
                            result={res.data}
                            overrides={isFinalized ? undefined : overrides}
                            onOverrideChange={isFinalized ? undefined : (field, val) =>
                              setItemOverrides((prev) => ({
                                ...prev,
                                [item.id]: { ...(prev[item.id] ?? {}), [field]: val },
                              }))
                            }
                            onEditField={isFinalized ? undefined : (fieldName) => {
                              const el = getFieldRefs(item.id)[fieldName];
                              if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); el.focus(); }
                            }}
                            openOverrides={isFinalized ? undefined : (itemOpenOverrides[item.id] ?? new Set())}
                            onToggleOverride={isFinalized ? undefined : (field) => handleToggleItemOverride(item.id, field)}
                          />

                          {!isFinalized && (
                            <div className="mt-4">
                              {res.data.overall !== 'pass' && !isItemBusy && (
                                <button
                                  type="button"
                                  className="btn btn-ghost btn-sm mb-3"
                                  onClick={() => handleReverifyItem(item.id)}
                                >
                                  Re-verify this label
                                </button>
                              )}
                              <div className="flex items-center gap-4 flex-wrap">
                                <button
                                  type="button"
                                  className="btn btn-primary btn-sm"
                                  onClick={() => handleFinalizeItem(item.id)}
                                  disabled={!canSubmit}
                                  aria-busy={isFinalizing}
                                >
                                  {isFinalizing ? 'Submitting…' : 'Submit Record'}
                                </button>
                                {unresolvedCount > 0
                                  ? <span className="field-hint">Select Accept, Fail, or Need New Image for each ? REVIEW field.</span>
                                  : <span className="field-hint">{hasPendingField ? 'Logs a pending record with a case ID.' : 'Saves this verification to the audit log.'}</span>
                                }
                              </div>
                              {finalizeError && (
                                <div className="alert alert-error text-sm font-medium mt-3" role="alert">{finalizeError}</div>
                              )}
                            </div>
                          )}

                          {isFinalized && finalizeResult?.status === 'pending' && (
                            <div className="mt-4">
                              <div className="overall-banner overall-review" role="status">
                                ⚠ Pending — Case <strong>{finalizeResult.case_id}</strong>
                              </div>
                              <p className="text-sm mt-2 text-amber-800">
                                New image required for: <strong>{finalizeResult.pending_fields?.join(', ')}</strong>.
                                Share case <strong>{finalizeResult.case_id}</strong> with the applicant.
                              </p>
                            </div>
                          )}

                          {isFinalized && finalizeResult?.status !== 'pending' && (
                            <div className="mt-4">
                              <div className="overall-banner overall-pass" role="status">
                                ✓ Record saved — Case {finalizeResult?.case_id}
                              </div>
                            </div>
                          )}
                        </>
                      ) : (
                        <>
                          <div className="alert alert-error text-sm font-medium" role="alert">{res.error}</div>
                          {!isItemBusy && (
                            <button
                              type="button"
                              className="btn btn-ghost btn-sm mt-3"
                              onClick={() => handleReverifyItem(item.id)}
                            >
                              Re-verify this label
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          {forceErrors && invalidIds.size > 0 && (
            <div className="alert alert-error text-sm font-medium mb-4" role="alert">
              {invalidIds.size} {invalidIds.size === 1 ? 'item has' : 'items have'} missing or invalid fields — fix the highlighted fields before verifying.
            </div>
          )}

          <div className="flex items-center gap-4 flex-wrap mt-6">
            <button
              type="button"
              className="btn btn-primary px-8 py-3"
              onClick={handleVerifyAll}
              disabled={running || toVerifyCount === 0}
              aria-busy={running}
            >
              {running && doneCount < toVerifyCount ? `Verifying… (${doneCount} / ${toVerifyCount} done)` : 'Verify All'}
            </button>
            {!running && readyToSubmitCount > 0 && (
              <button
                type="button"
                className="btn btn-primary px-8 py-3"
                onClick={handleSubmitAllReady}
              >
                Submit All Ready ({readyToSubmitCount})
              </button>
            )}
            {!running && needsReviewCount > 0 && (
              <span className="text-amber-700 text-sm font-medium">
                {needsReviewCount} {needsReviewCount === 1 ? 'label needs' : 'labels need'} review before submitting.
              </span>
            )}
            {!running && doneCount > 0 && doneCount < toVerifyCount && (
              <span className="text-slate-500 text-sm">{doneCount} of {toVerifyCount} verified</span>
            )}
          </div>
        </>
      )}
    </>
  );
}
