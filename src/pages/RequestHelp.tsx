import { useState } from 'react';
import { Link } from 'react-router-dom';
import { submitRequest, getFingerprint } from '../api/client';
import { CATEGORIES } from '../types';

interface FormState {
  display_name: string;
  contact_private: string;
  category: string;
  description_public: string;
  amount_requested: string;
  website: string; // honeypot — must stay empty
}

const EMPTY: FormState = {
  display_name: '',
  contact_private: '',
  category: CATEGORIES[0],
  description_public: '',
  amount_requested: '',
  website: '',
};

export default function RequestHelp() {
  const [form, setForm] = useState<FormState>(EMPTY);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  function handleChange(
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (!form.display_name.trim() || !form.contact_private.trim() || !form.description_public.trim()) {
      setError('Please fill in all required fields.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await submitRequest({
        display_name: form.display_name.trim(),
        contact_private: form.contact_private.trim(),
        category: form.category,
        description_public: form.description_public.trim(),
        amount_requested: parseFloat(form.amount_requested) || 0,
        fingerprint: getFingerprint(),
        website: form.website, // honeypot — non-empty = bot
      });
      setSuccess(
        `Request submitted (ID: ${res.request_id}). It will appear publicly once approved — usually within a few hours. A helper will contact you through the info you provided.`
      );
      setForm(EMPTY);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  if (success) {
    return (
      <div className="page page--narrow">
        <div className="alert alert-success">
          <strong>Done!</strong> {success}
        </div>
        <div style={{ display: 'flex', gap: '1rem', marginTop: '1.5rem' }}>
          <button className="btn btn-outline" onClick={() => setSuccess('')}>
            Submit Another Request
          </button>
          <Link to="/tree" className="btn btn-primary">
            View the Tree
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="page page--narrow">
      <h1>Request Help</h1>
      <p className="page-sub">
        Describe what you need publicly. Your contact info stays <strong>private</strong> and is
        only shared with helpers.
      </p>

      {error && <div className="alert alert-error">{error}</div>}

      <form onSubmit={handleSubmit} className="form-card" noValidate>
        {/* Honeypot — hidden from real users */}
        <div style={{ display: 'none' }} aria-hidden="true">
          <label htmlFor="website">Website</label>
          <input
            id="website"
            name="website"
            type="text"
            tabIndex={-1}
            autoComplete="off"
            value={form.website}
            onChange={handleChange}
          />
        </div>

        <div className="field">
          <label htmlFor="display_name">
            Your Display Name <span className="required">*</span>
          </label>
          <input
            id="display_name"
            name="display_name"
            type="text"
            placeholder="Alex M."
            value={form.display_name}
            onChange={handleChange}
            required
            maxLength={60}
          />
          <span className="field-hint">Shown publicly in the tree.</span>
        </div>

        <div className="field">
          <label htmlFor="contact_private">
            Private Contact Info <span className="required">*</span>
          </label>
          <textarea
            id="contact_private"
            name="contact_private"
            rows={2}
            placeholder="Email, phone, Telegram handle, etc."
            value={form.contact_private}
            onChange={handleChange}
            required
            maxLength={300}
          />
          <span className="field-hint">Never shown publicly — only shared with your helper.</span>
        </div>

        <div className="field">
          <label htmlFor="category">
            Category <span className="required">*</span>
          </label>
          <select
            id="category"
            name="category"
            value={form.category}
            onChange={handleChange}
            required
          >
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <label htmlFor="description_public">
            Description <span className="required">*</span>
          </label>
          <textarea
            id="description_public"
            name="description_public"
            rows={5}
            placeholder="Describe what you need. Be as specific as helpful — this is public."
            value={form.description_public}
            onChange={handleChange}
            required
            maxLength={1000}
          />
        </div>

        <div className="field">
          <label htmlFor="amount_requested">Amount Requested (USD, optional)</label>
          <input
            id="amount_requested"
            name="amount_requested"
            type="number"
            min="0"
            step="0.01"
            placeholder="0.00"
            value={form.amount_requested}
            onChange={handleChange}
          />
          <span className="field-hint">Leave blank or 0 if non-financial.</span>
        </div>

        <button type="submit" className="btn btn-primary btn-full" disabled={submitting}>
          {submitting ? 'Submitting…' : 'Submit Request'}
        </button>
      </form>
    </div>
  );
}
