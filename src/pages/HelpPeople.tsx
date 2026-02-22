import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchData, reserveRequests, submitAct, getFingerprint } from '../api/client';
import type { ApiData, Request, HelpSelection, ConfirmLink } from '../types';
import { HELP_TYPES, isReservedByOther, buildConfirmUrl } from '../types';

interface SelectionState extends HelpSelection {
  request: Request;
}

interface HelperInfo {
  helper_name: string;
  helper_contact_private: string;
  website: string; // honeypot
}

const EMPTY_HELPER: HelperInfo = {
  helper_name: '',
  helper_contact_private: '',
  website: '',
};

// ─── Countdown hook ───────────────────────────────────────────────────────────

function useCountdown(reservedUntil: Date | null): {
  display: string;
  expired: boolean;
} {
  const [display, setDisplay] = useState('');
  const [expired, setExpired] = useState(false);

  useEffect(() => {
    if (!reservedUntil) {
      setDisplay('');
      setExpired(false);
      return;
    }
    setExpired(false);

    const tick = () => {
      const remaining = Math.max(0, Math.floor((reservedUntil.getTime() - Date.now()) / 1000));
      if (remaining === 0) {
        setDisplay('expired');
        setExpired(true);
      } else {
        const m = Math.floor(remaining / 60);
        const s = remaining % 60;
        setDisplay(`${m}:${s.toString().padStart(2, '0')}`);
      }
    };

    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [reservedUntil]);

  return { display, expired };
}

// ─── Per-selection detail form ────────────────────────────────────────────────

function SelectionDetail({
  sel,
  index,
  onUpdate,
  onRemove,
  disabled,
}: {
  sel: SelectionState;
  index: number;
  onUpdate: (i: number, u: Partial<HelpSelection>) => void;
  onRemove: (i: number) => void;
  disabled: boolean;
}) {
  return (
    <div className={`selection-detail ${disabled ? 'selection-detail--disabled' : ''}`}>
      <div className="selection-detail-header">
        <strong>
          #{index + 1} — {sel.request.display_name}
        </strong>
        {!disabled && (
          <button type="button" className="btn-remove" onClick={() => onRemove(index)} title="Remove">
            ✕
          </button>
        )}
      </div>
      <p className="selection-desc">{sel.request.description_public}</p>
      <div className="selection-fields">
        <div className="field">
          <label>How will you help?</label>
          <select
            value={sel.help_type}
            onChange={(e) => onUpdate(index, { help_type: e.target.value })}
            disabled={disabled}
            required
          >
            {HELP_TYPES.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>Amount (USD, optional)</label>
          <input
            type="number"
            min="0"
            step="0.01"
            placeholder="0.00"
            value={sel.amount || ''}
            onChange={(e) => onUpdate(index, { amount: parseFloat(e.target.value) || 0 })}
            disabled={disabled}
          />
        </div>
        <div className="field field--full">
          <label>
            Your Public Story <span className="required">*</span>
          </label>
          <textarea
            rows={3}
            placeholder="Briefly describe how you'll help — this will appear in the tree."
            value={sel.public_story}
            onChange={(e) => onUpdate(index, { public_story: e.target.value })}
            disabled={disabled}
            required
            maxLength={500}
          />
        </div>
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function HelpPeople() {
  const [data, setData] = useState<ApiData | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const [selections, setSelections] = useState<SelectionState[]>([]);
  const [helper, setHelper] = useState<HelperInfo>(EMPTY_HELPER);
  const [search, setSearch] = useState('');

  // Reservation state
  const [isReserving, setIsReserving] = useState(false);
  const [reserveError, setReserveError] = useState('');
  const [reservedUntil, setReservedUntil] = useState<Date | null>(null);
  const { display: countdown, expired: reservationExpired } = useCountdown(reservedUntil);

  // Submit state
  const [submitError, setSubmitError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // On success: store helper name + confirm links returned by the backend
  const [successState, setSuccessState] = useState<{
    helperName: string;
    confirms: ConfirmLink[];
  } | null>(null);

  // Clipboard state: maps confirm_token → 'copied' (cleared after 2s)
  const [copiedToken, setCopiedToken] = useState('');

  // Scroll to details when reservation is confirmed
  const detailsRef = useRef<HTMLDivElement>(null);

  // ── Load data ──────────────────────────────────────────────────────────────

  useEffect(() => {
    fetchData()
      .then(setData)
      .catch((e: Error) => setLoadError(e.message))
      .finally(() => setLoading(false));
  }, []);

  // ── Handle expired reservation ─────────────────────────────────────────────

  useEffect(() => {
    if (reservationExpired) {
      setReservedUntil(null);
      setSelections([]);
      setReserveError('Your 30-minute reservation expired. Please re-select the people you want to help.');
    }
  }, [reservationExpired]);

  // ── Derived lists ──────────────────────────────────────────────────────────

  const openRequests = data?.requests.filter((r) => r.status === 'open') ?? [];
  const selectedIds  = new Set(selections.map((s) => s.request_id));

  const filteredRequests = openRequests.filter((r) => {
    if (selectedIds.has(r.request_id)) return false; // already in selections panel
    const q = search.toLowerCase();
    return (
      r.display_name.toLowerCase().includes(q) ||
      r.description_public.toLowerCase().includes(q) ||
      r.category.toLowerCase().includes(q)
    );
  });

  // ── Select / deselect ──────────────────────────────────────────────────────

  function selectRequest(req: Request) {
    if (isReservedByOther(req) || reservedUntil) return; // locked once reserved

    const entry: SelectionState = {
      request_id: req.request_id,
      help_type: HELP_TYPES[0],
      amount: 0,
      public_story: '',
      request: req,
    };

    setSelections((prev) => [...prev, entry]);
  }

  function removeSelection(index: number) {
    setSelections((prev) => prev.filter((_, i) => i !== index));
    setReservedUntil(null);
    setReserveError('');
  }

  function updateSelection(index: number, updates: Partial<HelpSelection>) {
    setSelections((prev) => prev.map((s, i) => (i === index ? { ...s, ...updates } : s)));
  }

  // ── Reserve ────────────────────────────────────────────────────────────────

  async function doReserve() {
    if (selections.length === 0) return;
    setIsReserving(true);
    setReserveError('');
    try {
      const fp     = getFingerprint();
      const ids    = selections.map((s) => s.request_id);
      const result = await reserveRequests(ids, fp);
      setReservedUntil(new Date(result.reserved_until));
      setTimeout(() => detailsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
    } catch (err) {
      setReserveError((err as Error).message);
    } finally {
      setIsReserving(false);
    }
  }

  // ── Submit ─────────────────────────────────────────────────────────────────

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitError('');

    if (selections.length < 1) {
      setSubmitError('Please select at least one request.');
      return;
    }
    if (!reservedUntil) {
      setSubmitError('Your selections are not reserved yet. Click "Reserve & Continue" first.');
      return;
    }
    if (!helper.helper_name.trim() || !helper.helper_contact_private.trim()) {
      setSubmitError('Please fill in your name and contact info.');
      return;
    }
    if (selections.some((s) => !s.public_story.trim())) {
      setSubmitError('Please write a public story for each selection.');
      return;
    }

    setSubmitting(true);
    try {
      const result = await submitAct({
        helper_name: helper.helper_name.trim(),
        helper_contact_private: helper.helper_contact_private.trim(),
        fingerprint: getFingerprint(),
        website: helper.website,
        selections: selections.map(({ request_id, help_type, amount, public_story }) => ({
          request_id,
          help_type,
          amount,
          public_story,
        })),
      });
      setSuccessState({ helperName: helper.helper_name.trim(), confirms: result.confirms ?? [] });
      setSelections([]);
      setHelper(EMPTY_HELPER);
      setReservedUntil(null);
    } catch (err) {
      setSubmitError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  // ── Copy-to-clipboard helper ───────────────────────────────────────────────

  async function copyLink(token: string, url: string) {
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      const el = document.createElement('textarea');
      el.value = url;
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
    }
    setCopiedToken(token);
    setTimeout(() => setCopiedToken(''), 2500);
  }

  // ── Success screen ─────────────────────────────────────────────────────────

  if (successState) {
    const n = successState.confirms.length;
    return (
      <div className="page page--narrow">
        <div className="alert alert-success">
          <strong>Thank you, {successState.helperName}!</strong>{' '}
          {n === 1
            ? 'Your act of kindness has been recorded'
            : `Your ${n} acts of kindness have been recorded`}{' '}
          and the tree is growing.
        </div>

        {successState.confirms.length > 0 && (
          <div className="confirm-links-panel">
            <h2>Optional: Send Confirmation Links</h2>
            <p>
              Share each private link with the person you helped. When they click it, their node
              gets a <strong>✅ Confirmed</strong> badge in the tree — visible proof that real help
              happened. It's <em>optional</em> but hugely builds trust.
            </p>
            <ul className="confirm-links-list">
              {successState.confirms.map((cl) => {
                const url    = buildConfirmUrl(cl.confirm_token);
                const copied = copiedToken === cl.confirm_token;
                return (
                  <li key={cl.confirm_token} className="confirm-link-row">
                    <div className="confirm-link-name">
                      For <strong>{cl.request_display_name}</strong>
                    </div>
                    <div className="confirm-link-url">{url}</div>
                    <button
                      type="button"
                      className={`btn ${copied ? 'btn-selected' : 'btn-outline'}`}
                      onClick={() => copyLink(cl.confirm_token, url)}
                    >
                      {copied ? '✓ Copied!' : 'Copy link'}
                    </button>
                  </li>
                );
              })}
            </ul>
            <p className="field-hint">
              These links are private — only share each one with the specific person named above.
            </p>
          </div>
        )}

        <div style={{ display: 'flex', gap: '1rem', marginTop: '1.5rem', flexWrap: 'wrap' }}>
          <button className="btn btn-outline" onClick={() => setSuccessState(null)}>
            Help More People
          </button>
          <Link to="/tree" className="btn btn-primary">
            View the Tree
          </Link>
        </div>
      </div>
    );
  }

  // ── Main render ────────────────────────────────────────────────────────────

  const reservedConfirmed = !!reservedUntil && !reservationExpired;
  const formLocked        = isReserving || !reservedConfirmed;

  return (
    <div className="page">
      <h1>Help People</h1>
      <p className="page-sub">
        Pick anyone you want to help from the open requests below — one person, a few, or as many
        as you like. Click <strong>Reserve &amp; Continue</strong> to lock in your selections for{' '}
        <strong>30 minutes</strong>, then fill in how you'll help each one.
      </p>

      {loadError && <div className="alert alert-error">{loadError}</div>}
      {reserveError && <div className="alert alert-error">{reserveError}</div>}

      <form onSubmit={handleSubmit} noValidate>
        {/* ── Selected request details ──────────────────────────────── */}
        {selections.length > 0 && (
          <section className="selections-section" ref={detailsRef}>
            <h2>
              Your Selections{' '}
              <span className="count-badge">{selections.length}</span>
              {reservedConfirmed && (
                <span className="reserved-badge">🔒 Reserved {countdown}</span>
              )}
              {isReserving && <span className="reserved-badge">Reserving…</span>}
            </h2>

            {selections.map((sel, i) => (
              <SelectionDetail
                key={sel.request_id}
                sel={sel}
                index={i}
                onUpdate={updateSelection}
                onRemove={removeSelection}
                disabled={formLocked}
              />
            ))}

            {/* Reserve button — visible only before reservation is confirmed */}
            {!reservedConfirmed && (
              <button
                type="button"
                className="btn btn-primary"
                style={{ marginTop: '1rem' }}
                onClick={doReserve}
                disabled={isReserving}
              >
                {isReserving
                  ? 'Reserving…'
                  : `Reserve & Continue →`}
              </button>
            )}

            {reservedConfirmed && (
              <p className="field-hint" style={{ marginTop: '0.5rem' }}>
                Spots reserved — submit before{' '}
                <strong className="countdown">{countdown}</strong> runs out.
              </p>
            )}
          </section>
        )}

        {/* ── Browse open requests ──────────────────────────────────── */}
        <section className="browse-section">
          <h2>
            Open Requests{' '}
            <span className="count-badge">{openRequests.length}</span>
          </h2>

          {loading && <p className="loading">Loading requests…</p>}

          {!loading && openRequests.length === 0 && (
            <p className="empty-state">
              No approved requests right now — check back soon, or{' '}
              <Link to="/request">post your own</Link>!
            </p>
          )}

          {!loading && openRequests.length > 0 && (
            <input
              type="search"
              className="search-input"
              placeholder="Search by name, category, or description…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          )}

          <div className="request-cards">
            {filteredRequests.map((req) => {
              const reserved   = isReservedByOther(req);
              const locked     = !!reservedUntil; // selections locked once reserved
              const selectable = !reserved && !locked;

              return (
                <div
                  key={req.request_id}
                  className={`request-card ${reserved ? 'request-card--reserved' : ''} ${locked && !reserved ? 'disabled' : ''}`}
                >
                  <div className="request-card-header">
                    <span className="request-name">{req.display_name}</span>
                    <span className="badge">{req.category}</span>
                    {reserved && (
                      <span className="badge badge--reserved">⏳ Reserved</span>
                    )}
                  </div>
                  <p className="request-desc">{req.description_public}</p>
                  {req.amount_requested > 0 && (
                    <p className="request-amount">Requesting: ${req.amount_requested}</p>
                  )}
                  <p className="request-date">
                    {new Date(req.created_at).toLocaleDateString()}
                  </p>
                  <button
                    type="button"
                    className={`btn ${reserved ? 'btn-reserved' : 'btn-outline'}`}
                    onClick={() => selectable && selectRequest(req)}
                    disabled={!selectable}
                    title={reserved ? 'Temporarily reserved by another helper' : locked ? 'Finalize your current selections first' : undefined}
                  >
                    {reserved ? 'Temporarily reserved' : locked ? 'Reserved — submit first' : 'Select'}
                  </button>
                </div>
              );
            })}

            {filteredRequests.length === 0 && !loading && (
              <p className="empty-state">
                {search
                  ? `No results for "${search}"`
                  : selectedIds.size > 0
                  ? 'All available requests are selected or reserved by others.'
                  : 'All requests are currently reserved by other helpers.'}
              </p>
            )}
          </div>
        </section>

        {/* ── Helper info + submit ──────────────────────────────────── */}
        {reservedConfirmed && (
          <section className="helper-info-section form-card">
            <h2>Your Info</h2>
            <p>
              {selections.length === 1
                ? `Your spot is reserved. Fill in your details and submit before the timer runs out.`
                : `Your ${selections.length} spots are reserved. Fill in your details and submit before the timer runs out.`}
            </p>

            {/* Honeypot — hidden from real users */}
            <div style={{ display: 'none' }} aria-hidden="true">
              <input
                name="website"
                type="text"
                tabIndex={-1}
                autoComplete="off"
                value={helper.website}
                onChange={(e) => setHelper((p) => ({ ...p, website: e.target.value }))}
              />
            </div>

            <div className="field">
              <label htmlFor="helper_name">
                Your Name / Handle <span className="required">*</span>
              </label>
              <input
                id="helper_name"
                type="text"
                placeholder="Jordan K."
                value={helper.helper_name}
                onChange={(e) => setHelper((p) => ({ ...p, helper_name: e.target.value }))}
                disabled={formLocked}
                required
                maxLength={60}
              />
            </div>

            <div className="field">
              <label htmlFor="helper_contact">
                Private Contact Info <span className="required">*</span>
              </label>
              <textarea
                id="helper_contact"
                rows={2}
                placeholder="Email, phone, or Telegram — so recipients can reach you."
                value={helper.helper_contact_private}
                onChange={(e) =>
                  setHelper((p) => ({ ...p, helper_contact_private: e.target.value }))
                }
                disabled={formLocked}
                required
                maxLength={300}
              />
              <span className="field-hint">Never shown publicly.</span>
            </div>

            {submitError && <div className="alert alert-error">{submitError}</div>}

            <button
              type="submit"
              className="btn btn-primary btn-full"
              disabled={submitting || formLocked}
            >
              {submitting
                ? 'Submitting…'
                : selections.length === 1
                ? 'Submit Act of Kindness'
                : `Submit ${selections.length} Acts of Kindness`}
            </button>
          </section>
        )}
      </form>
    </div>
  );
}
