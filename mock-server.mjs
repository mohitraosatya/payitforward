/**
 * Local mock of the Google Apps Script backend.
 * Run with:  node mock-server.mjs
 * Then set:  VITE_API_BASE_URL=http://localhost:3001
 *
 * Stores data in-memory (resets on restart).
 * Supports all endpoints: data, request, reserve, act, confirm.
 */

import http from 'http';
import crypto from 'crypto';

// ─── In-memory store ──────────────────────────────────────────────────────────

const requests = [];
const acts     = [];

// Seed with a couple of open requests so the UI isn't empty
requests.push(
  {
    request_id: 'req_seed_1',
    display_name: 'Alex M.',
    category: 'Financial',
    description_public: 'Need help covering rent this month — lost my job last week.',
    amount_requested: 400,
    status: 'open',
    created_at: new Date().toISOString(),
    reserved_by: '',
    reserved_until: '',
  },
  {
    request_id: 'req_seed_2',
    display_name: 'Jordan K.',
    category: 'Emotional Support',
    description_public: 'Going through a rough patch — would love someone to talk to.',
    amount_requested: 0,
    status: 'open',
    created_at: new Date().toISOString(),
    reserved_by: '',
    reserved_until: '',
  },
  {
    request_id: 'req_seed_3',
    display_name: 'Sam L.',
    category: 'Skills / Knowledge',
    description_public: 'Need help setting up a basic website for my small business.',
    amount_requested: 0,
    status: 'open',
    created_at: new Date().toISOString(),
    reserved_by: '',
    reserved_until: '',
  }
);

// ─── Helpers ──────────────────────────────────────────────────────────────────

function uuid() { return crypto.randomUUID(); }

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function json(res, data, status = 200) {
  cors(res);
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try { resolve(JSON.parse(body || '{}')); }
      catch (e) { reject(e); }
    });
  });
}

function parseQuery(url) {
  const u = new URL(url, 'http://localhost');
  return Object.fromEntries(u.searchParams);
}

// ─── Handlers ─────────────────────────────────────────────────────────────────

function handleData() {
  const PUBLIC_STATUSES = ['open', 'helped'];
  return {
    requests: requests
      .filter(r => PUBLIC_STATUSES.includes(r.status))
      .map(({ contact_private: _cp, reserved_by: _rb, ...rest }) => rest),
    acts: acts
      .map(({ helper_contact_private: _hcp, confirm_token: _ct, ...rest }) => rest),
  };
}

function handleRequest(data) {
  if (!data.display_name || !data.contact_private || !data.description_public) {
    return { error: 'Missing required fields.' };
  }
  const req = {
    request_id: 'req_' + uuid(),
    display_name: data.display_name.trim(),
    contact_private: data.contact_private.trim(),
    category: data.category || 'Other',
    description_public: data.description_public.trim(),
    amount_requested: parseFloat(data.amount_requested) || 0,
    status: 'pending_approval', // change to 'open' in the log below to simulate approval
    created_at: new Date().toISOString(),
    reserved_by: '',
    reserved_until: '',
  };
  requests.push(req);
  console.log(`[request] New: ${req.request_id} | status=pending_approval`);
  console.log(`  → To approve: change status to 'open' manually (in production: edit the sheet)`);
  console.log(`  → Mock shortcut: set status='open' in the in-memory array and restart\n`);
  // For local testing convenience, auto-approve after 2 seconds
  setTimeout(() => {
    const r = requests.find(r => r.request_id === req.request_id);
    if (r) { r.status = 'open'; console.log(`[mock] Auto-approved ${req.request_id}`); }
  }, 2000);
  return { success: true, request_id: req.request_id };
}

function handleReserve(data) {
  if (!data.request_ids || data.request_ids.length < 1) {
    return { error: 'At least 1 request_id required.' };
  }
  const fp     = data.fingerprint || 'anon';
  const now    = new Date();
  const expiry = new Date(now.getTime() + 30 * 60 * 1000);

  for (const rid of data.request_ids) {
    const req = requests.find(r => r.request_id === rid);
    if (!req)                   return { error: `Request ${rid} not found.` };
    if (req.status !== 'open')  return { error: `Request ${rid} is not open.` };
    const exp = req.reserved_until ? new Date(req.reserved_until) : null;
    if (exp && exp > now && req.reserved_by !== fp) {
      return { error: 'One of your selections is temporarily reserved.' };
    }
  }
  for (const rid of data.request_ids) {
    const req = requests.find(r => r.request_id === rid);
    req.reserved_by    = fp;
    req.reserved_until = expiry.toISOString();
  }
  console.log(`[reserve] fp=${fp.slice(0,8)}… reserved ${data.request_ids.join(', ')}`);
  return { success: true, reserved_until: expiry.toISOString() };
}

function handleAct(data) {
  if (!data.helper_name || !data.helper_contact_private) return { error: 'Missing helper info.' };
  if (!data.selections || data.selections.length < 1)     return { error: 'Need at least 1 selection.' };

  const fp  = data.fingerprint || 'anon';
  const now = new Date();
  const confirms = [];

  for (const sel of data.selections) {
    const req = requests.find(r => r.request_id === sel.request_id);
    if (!req)                  return { error: `Request ${sel.request_id} not found.` };
    if (req.status !== 'open') return { error: `Request ${sel.request_id} already helped.` };
    const exp = req.reserved_until ? new Date(req.reserved_until) : null;
    if (exp && exp > now && req.reserved_by !== fp) {
      return { error: `Request ${sel.request_id} reserved by someone else.` };
    }
  }

  const act_ids = [];
  for (const sel of data.selections) {
    const req           = requests.find(r => r.request_id === sel.request_id);
    const act_id        = 'act_' + uuid();
    const confirm_token = uuid();
    act_ids.push(act_id);
    confirms.push({ request_display_name: req.display_name, confirm_token });
    acts.push({
      act_id,
      helper_name: data.helper_name.trim(),
      helper_contact_private: data.helper_contact_private.trim(),
      request_id: sel.request_id,
      help_type: sel.help_type || 'Other',
      amount: parseFloat(sel.amount) || 0,
      public_story: sel.public_story,
      created_at: now.toISOString(),
      confirm_token,
      confirmed: false,
    });
    req.status         = 'helped';
    req.reserved_by    = '';
    req.reserved_until = '';
  }
  console.log(`[act] ${data.helper_name} helped ${act_ids.length} people`);
  confirms.forEach(c => {
    const url = `http://localhost:5173/payitforward/#/confirm?token=${c.confirm_token}`;
    console.log(`  → Confirm link for ${c.request_display_name}: ${url}`);
  });
  return { success: true, act_ids, confirms };
}

function handleConfirm(data) {
  if (!data.token) return { success: false, error: 'Missing token.' };
  const act = acts.find(a => a.confirm_token === data.token);
  if (!act) return { success: false, error: 'Token not found.' };
  if (act.confirmed) return { success: true, already_confirmed: true };
  act.confirmed = true;
  console.log(`[confirm] act ${act.act_id} confirmed by recipient`);
  return { success: true, already_confirmed: false };
}

// ─── Server ────────────────────────────────────────────────────────────────────

const server = http.createServer(async (req, res) => {
  // CORS preflight
  if (req.method === 'OPTIONS') { cors(res); res.writeHead(204); res.end(); return; }

  const q = parseQuery(req.url);
  const action = q.action || 'data';

  if (req.method === 'GET') {
    if (action === 'data') return json(res, handleData());
    return json(res, { error: 'Unknown GET action' });
  }

  if (req.method === 'POST') {
    const body = await parseBody(req).catch(() => ({}));
    // Honeypot
    if (body.website) return json(res, { success: true, request_id: 'fake' });
    if (action === 'request') return json(res, handleRequest(body));
    if (action === 'reserve')  return json(res, handleReserve(body));
    if (action === 'act')      return json(res, handleAct(body));
    if (action === 'confirm')  return json(res, handleConfirm(body));
    return json(res, { error: 'Unknown POST action' });
  }

  json(res, { error: 'Method not allowed' }, 405);
});

server.listen(3001, () => {
  console.log('Mock server running at http://localhost:3001');
  console.log('Set VITE_API_BASE_URL=http://localhost:3001 in your .env\n');
  console.log('Seeded with 3 open requests (auto-approves new submissions after 2s).\n');
});
