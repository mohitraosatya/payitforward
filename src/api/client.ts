import type {
  ApiData,
  RequestFormData,
  ActFormData,
  ActResult,
  ReserveResult,
  ConfirmResult,
} from '../types';

const API_BASE = import.meta.env.VITE_API_BASE_URL as string | undefined;

function getBase(): string {
  if (!API_BASE) {
    throw new Error(
      'VITE_API_BASE_URL is not set. Add it to your .env file or GitHub Actions secret.'
    );
  }
  return API_BASE;
}

// ─── Fingerprint ──────────────────────────────────────────────────────────────

/**
 * Stable UUID-v4 for this browser, stored in localStorage.
 * Used for per-client rate limiting on the backend (best-effort — not auth).
 */
export function getFingerprint(): string {
  const key = 'pif_fp';
  let fp = localStorage.getItem(key);
  if (!fp) {
    fp = crypto.randomUUID();
    localStorage.setItem(key, fp);
  }
  return fp;
}

// ─── Shared POST helper ───────────────────────────────────────────────────────

// Content-Type: text/plain avoids CORS preflight — required for Apps Script.
async function post<T>(action: string, body: unknown): Promise<T> {
  const res = await fetch(`${getBase()}?action=${action}`, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Server error ${res.status}`);
  const json = await res.json();
  if (json.error) throw new Error(json.error);
  return json as T;
}

// ─── API calls ────────────────────────────────────────────────────────────────

/**
 * GET ?action=data
 * Returns all public requests (status=open|helped) + acts.
 * Private fields (contact_private, confirm_token, reserved_by) are stripped server-side.
 */
export async function fetchData(): Promise<ApiData> {
  const res = await fetch(`${getBase()}?action=data`);
  if (!res.ok) throw new Error(`Server error ${res.status}`);
  const json = await res.json();
  if (json.error) throw new Error(json.error);
  return json as ApiData;
}

/**
 * POST ?action=request
 * Submits a new help request. New requests start at status=pending_approval;
 * the site admin changes it to "open" in the Google Sheet to make it visible.
 */
export async function submitRequest(
  data: RequestFormData
): Promise<{ success: boolean; request_id: string }> {
  return post('request', data);
}

/**
 * POST ?action=reserve
 * Atomically reserves 3 open requests for 30 minutes (LockService on backend).
 * Must be called before submitAct to prevent two helpers picking the same request.
 */
export async function reserveRequests(
  request_ids: string[],
  fingerprint: string
): Promise<ReserveResult> {
  return post('reserve', { request_ids, fingerprint });
}

/**
 * POST ?action=act
 * Records a helper's 3 acts of kindness.
 * Returns `confirms` — private confirmation tokens to forward to each recipient.
 * Backend verifies the reservation before writing.
 */
export async function submitAct(data: ActFormData): Promise<ActResult> {
  return post('act', data);
}

/**
 * POST ?action=confirm
 * Called by the Confirm page when a recipient clicks their private link.
 * Sets confirmed=true on the act row. Idempotent — safe to call twice.
 */
export async function confirmAct(token: string): Promise<ConfirmResult> {
  return post('confirm', { token });
}
