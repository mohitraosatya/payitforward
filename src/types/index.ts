// ─── Public data returned by GET /data ───────────────────────────────────────

/**
 * Request status lifecycle (admin-controlled in the sheet):
 *   pending_approval → open → helped
 *                           → closed
 *
 * The public API only returns 'open' and 'helped' requests.
 * The frontend will only ever see those two values.
 */
export type RequestStatus = 'pending_approval' | 'open' | 'helped' | 'closed';

export interface Request {
  request_id: string;
  display_name: string;
  category: string;
  description_public: string;
  amount_requested: number;
  status: 'open' | 'helped'; // backend filters — only these two reach the frontend
  created_at: string;
  // Present when the request is temporarily reserved by someone.
  // Empty string / absent = not reserved.
  reserved_until?: string;
}

export interface Act {
  act_id: string;
  helper_name: string;
  request_id: string;
  help_type: string;
  amount: number;
  public_story: string;
  created_at: string;
  confirmed: boolean; // true after the recipient clicks their confirmation link
}

export interface ApiData {
  requests: Request[];
  acts: Act[];
}

// ─── POST form payloads ───────────────────────────────────────────────────────

export interface RequestFormData {
  display_name: string;
  contact_private: string;
  category: string;
  description_public: string;
  amount_requested: number;
  fingerprint: string;
  website: string; // honeypot — must be empty
}

export interface HelpSelection {
  request_id: string;
  help_type: string;
  amount: number;
  public_story: string;
}

export interface ActFormData {
  helper_name: string;
  helper_contact_private: string;
  selections: HelpSelection[];
  fingerprint: string;
  website: string; // honeypot
}

// ─── API response shapes ──────────────────────────────────────────────────────

export interface ReserveResult {
  success: boolean;
  reserved_until: string; // ISO timestamp
}

/** Returned by POST /act. `confirms` are private — send each token to the recipient only. */
export interface ActResult {
  success: boolean;
  act_ids: string[];
  confirms: ConfirmLink[];
}

export interface ConfirmLink {
  request_display_name: string;
  confirm_token: string;
}

export interface ConfirmResult {
  success: boolean;
  already_confirmed?: boolean;
  error?: string;
}

// ─── Enums ────────────────────────────────────────────────────────────────────

export const CATEGORIES = [
  'Financial',
  'Emotional Support',
  'Practical Help',
  'Skills / Knowledge',
  'Other',
] as const;

export const HELP_TYPES = [
  'Financial',
  'Time / Labor',
  'Resources',
  'Emotional Support',
  'Skills / Knowledge',
  'Other',
] as const;

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** True when this request is reserved by someone else right now. */
export function isReservedByOther(req: Request): boolean {
  if (!req.reserved_until) return false;
  return new Date(req.reserved_until) > new Date();
}

/**
 * Build a confirmation link for HashRouter-based GitHub Pages.
 * e.g.  https://user.github.io/payitforward/#/confirm?token=uuid
 */
export function buildConfirmUrl(token: string): string {
  const base = window.location.href.split('#')[0];
  return `${base}#/confirm?token=${encodeURIComponent(token)}`;
}
