import { useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { confirmAct } from '../api/client';

type Phase = 'prompt' | 'confirming' | 'done' | 'already' | 'error';

export default function Confirm() {
  const [params] = useSearchParams();
  const token = params.get('token');

  const [phase, setPhase] = useState<Phase>('prompt');
  const [error, setError] = useState('');

  // No token in URL — bad link
  if (!token) {
    return (
      <div className="page page--narrow">
        <div className="confirm-card">
          <div className="confirm-icon confirm-icon--error">✕</div>
          <h1>Invalid link</h1>
          <p>This confirmation link is missing its token. Make sure you copied the full URL.</p>
          <Link to="/" className="btn btn-outline" style={{ marginTop: '1.5rem' }}>
            Go home
          </Link>
        </div>
      </div>
    );
  }

  async function handleConfirm() {
    setPhase('confirming');
    try {
      const res = await confirmAct(token!);
      if (!res.success) {
        setError(res.error ?? 'Confirmation failed.');
        setPhase('error');
      } else {
        setPhase(res.already_confirmed ? 'already' : 'done');
      }
    } catch (e) {
      setError((e as Error).message);
      setPhase('error');
    }
  }

  // ── Prompt ──────────────────────────────────────────────────────────────────
  if (phase === 'prompt') {
    return (
      <div className="page page--narrow">
        <div className="confirm-card">
          <div className="confirm-icon confirm-icon--prompt">🤝</div>
          <h1>Confirm You Were Helped</h1>
          <p>
            Someone paid it forward to you! Clicking the button below marks their act as{' '}
            <strong>confirmed ✅</strong> in the public tree — it helps verify that real help
            happened.
          </p>
          <p className="field-hint" style={{ marginTop: '0.5rem' }}>
            This is entirely optional. The helper already submitted their act; this is just for
            public trust.
          </p>
          <button
            className="btn btn-primary btn-full"
            style={{ marginTop: '1.5rem' }}
            onClick={handleConfirm}
          >
            Yes, I was helped — confirm it
          </button>
          <Link to="/" className="btn btn-outline btn-full" style={{ marginTop: '0.75rem' }}>
            Maybe later
          </Link>
        </div>
      </div>
    );
  }

  // ── Confirming ───────────────────────────────────────────────────────────────
  if (phase === 'confirming') {
    return (
      <div className="page page--narrow">
        <div className="confirm-card">
          <div className="confirm-icon confirm-icon--prompt">⏳</div>
          <h1>Confirming…</h1>
          <p>Marking the act as confirmed in the tree.</p>
        </div>
      </div>
    );
  }

  // ── Done ─────────────────────────────────────────────────────────────────────
  if (phase === 'done') {
    return (
      <div className="page page--narrow">
        <div className="confirm-card">
          <div className="confirm-icon confirm-icon--success">✅</div>
          <h1>Confirmed!</h1>
          <p>
            Your helper's act is now marked as <strong>confirmed ✅</strong> in the pay-it-forward
            tree. The community can see that real help happened.
          </p>
          <p style={{ marginTop: '0.75rem' }}>
            When you're ready, pay it forward yourself — help 3 other people.
          </p>
          <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.5rem', flexWrap: 'wrap' }}>
            <Link to="/tree" className="btn btn-primary">
              View the Tree
            </Link>
            <Link to="/help" className="btn btn-outline">
              Help 3 People
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // ── Already confirmed ─────────────────────────────────────────────────────────
  if (phase === 'already') {
    return (
      <div className="page page--narrow">
        <div className="confirm-card">
          <div className="confirm-icon confirm-icon--success">✅</div>
          <h1>Already Confirmed</h1>
          <p>This act was already confirmed. Thank you for being part of the tree!</p>
          <Link to="/tree" className="btn btn-primary" style={{ marginTop: '1.5rem' }}>
            View the Tree
          </Link>
        </div>
      </div>
    );
  }

  // ── Error ─────────────────────────────────────────────────────────────────────
  return (
    <div className="page page--narrow">
      <div className="confirm-card">
        <div className="confirm-icon confirm-icon--error">✕</div>
        <h1>Confirmation Failed</h1>
        <div className="alert alert-error">{error}</div>
        <Link to="/" className="btn btn-outline" style={{ marginTop: '1rem' }}>
          Go home
        </Link>
      </div>
    </div>
  );
}
