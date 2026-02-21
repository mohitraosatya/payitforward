import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchData } from '../api/client';
import type { ApiData } from '../types';

export default function Home() {
  const [data, setData] = useState<ApiData | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchData()
      .then(setData)
      .catch((e: Error) => setError(e.message));
  }, []);

  const totalRequests = data?.requests.length ?? 0;
  const totalHelped = data?.requests.filter((r) => r.status === 'helped').length ?? 0;
  const totalActs = data?.acts.length ?? 0;
  const openRequests = data?.requests.filter((r) => r.status === 'open').length ?? 0;

  return (
    <div className="page">
      <section className="hero">
        <h1>One request. Three helpers. A forest of kindness.</h1>
        <p className="hero-sub">
          When someone helps you, you don't pay them back — you pay it forward to{' '}
          <strong>3 other people</strong>. Watch the tree grow.
        </p>
        <div className="hero-actions">
          <Link to="/request" className="btn btn-primary">
            I Need Help
          </Link>
          <Link to="/help" className="btn btn-secondary">
            I'll Help 3 People
          </Link>
          <Link to="/tree" className="btn btn-outline">
            View the Tree
          </Link>
        </div>
      </section>

      {error && <div className="alert alert-error">{error}</div>}

      <section className="stats-grid">
        <div className="stat-card">
          <span className="stat-number">{totalRequests}</span>
          <span className="stat-label">Total Requests</span>
        </div>
        <div className="stat-card stat-card--green">
          <span className="stat-number">{totalHelped}</span>
          <span className="stat-label">People Helped</span>
        </div>
        <div className="stat-card stat-card--purple">
          <span className="stat-number">{totalActs}</span>
          <span className="stat-label">Acts of Kindness</span>
        </div>
        <div className="stat-card stat-card--orange">
          <span className="stat-number">{openRequests}</span>
          <span className="stat-label">Open Requests</span>
        </div>
      </section>

      <section className="how-it-works">
        <h2>How It Works</h2>
        <ol className="steps">
          <li>
            <div className="step-icon">1</div>
            <div>
              <strong>Request Help</strong> — post what you need (public) with your contact info
              (private). Requests are approved by a human before they appear publicly.
            </div>
          </li>
          <li>
            <div className="step-icon">2</div>
            <div>
              <strong>Someone Helps You</strong> — a helper picks your request (among 3 others) and
              helps however they can.
            </div>
          </li>
          <li>
            <div className="step-icon">3</div>
            <div>
              <strong>Pay It Forward</strong> — when you're ready, help 3 people yourself. The tree
              grows.
            </div>
          </li>
        </ol>
      </section>

      {data && data.requests.filter((r) => r.status === 'open').length > 0 && (
        <section className="open-requests-preview">
          <h2>Open Requests</h2>
          <div className="request-cards">
            {data.requests
              .filter((r) => r.status === 'open')
              .slice(0, 3)
              .map((r) => (
                <div key={r.request_id} className="request-card">
                  <div className="request-card-header">
                    <span className="request-name">{r.display_name}</span>
                    <span className="badge">{r.category}</span>
                  </div>
                  <p className="request-desc">{r.description_public}</p>
                  {r.amount_requested > 0 && (
                    <p className="request-amount">Requesting: ${r.amount_requested}</p>
                  )}
                </div>
              ))}
          </div>
          {data.requests.filter((r) => r.status === 'open').length > 3 && (
            <Link to="/help" className="btn btn-outline" style={{ marginTop: '1rem' }}>
              See all {data.requests.filter((r) => r.status === 'open').length} open requests →
            </Link>
          )}
        </section>
      )}
    </div>
  );
}
