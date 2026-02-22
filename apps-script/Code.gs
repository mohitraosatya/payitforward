/**
 * Pay-It-Forward — Google Apps Script Web App  v3
 *
 * Deploy: Execute as Me · Who has access: Anyone
 *
 * Request status lifecycle:
 *   pending_approval  → newly submitted, invisible to helpers
 *   open              → approved by admin, helpers can pick it
 *   helped            → a helper submitted an act
 *   closed            → withdrawn by requester / admin
 *
 * Requests columns:
 *   request_id | display_name | contact_private | category |
 *   description_public | amount_requested | status | created_at |
 *   reserved_by | reserved_until
 *
 * Acts columns:
 *   act_id | helper_name | helper_contact_private | request_id |
 *   help_type | amount | public_story | created_at | confirm_token | confirmed
 *
 * To approve a request: change its "status" column from pending_approval → open.
 */

var SPREADSHEET_ID = 'YOUR_SPREADSHEET_ID_HERE'; // ← replace
var REQUESTS_SHEET  = 'Requests';
var ACTS_SHEET      = 'Acts';

var RESERVE_MINUTES = 30;

// Per-fingerprint rate limits
var FP_MAX_REQUESTS_PER_HOUR  = 3;
var FP_MAX_ACTS_PER_6H        = 5;
var FP_MAX_RESERVES_PER_HOUR  = 15;
var GLOBAL_MAX_WRITES_PER_MIN = 40;

var VALID_CATEGORIES = ['Financial','Emotional Support','Practical Help','Skills / Knowledge','Other'];
var VALID_HELP_TYPES = ['Financial','Time / Labor','Resources','Emotional Support','Skills / Knowledge','Other'];

// Statuses visible to the public (excludes pending_approval and closed)
var PUBLIC_STATUSES = ['open', 'helped'];

// ─── Router ───────────────────────────────────────────────────────────────────

function doGet(e) {
  var action = (e.parameter && e.parameter.action) || 'data';
  try {
    if (action === 'data') return jsonOut(getData());
    return jsonOut({ error: 'Unknown GET action' });
  } catch (err) {
    return jsonOut({ error: err.message });
  }
}

function doPost(e) {
  var action = (e.parameter && e.parameter.action) || '';
  try {
    if (!checkGlobalRateLimit()) {
      return jsonOut({ error: 'Server busy — try again in a moment.' });
    }

    var data = JSON.parse(e.postData.contents);

    // Honeypot: non-empty = bot, return fake success
    if (data.website && data.website !== '') {
      return jsonOut({ success: true, request_id: 'fake_' + Utilities.getUuid() });
    }

    if (action === 'request') return jsonOut(handleRequest(data));
    if (action === 'reserve')  return jsonOut(handleReserve(data));
    if (action === 'act')      return jsonOut(handleAct(data));
    if (action === 'confirm')  return jsonOut(handleConfirm(data));

    return jsonOut({ error: 'Unknown POST action' });
  } catch (err) {
    return jsonOut({ error: err.message });
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function jsonOut(data) {
  var out = ContentService.createTextOutput(JSON.stringify(data));
  out.setMimeType(ContentService.MimeType.JSON);
  return out;
}

function openSheet(name) {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sh = ss.getSheetByName(name);
  if (!sh) throw new Error('Sheet "' + name + '" not found. Run setupSheets() first.');
  return sh;
}

function sheetToObjects(name, privateColumns, filter) {
  var sh     = openSheet(name);
  var values = sh.getDataRange().getValues();
  if (values.length < 2) return [];
  var headers = values[0];
  var rows = values.slice(1).map(function(row) {
    var obj = {};
    headers.forEach(function(h, i) {
      if (privateColumns.indexOf(h) !== -1) return;
      var v = row[i];
      obj[h] = v instanceof Date ? v.toISOString() : v;
    });
    return obj;
  }).filter(function(obj) { return !!obj.request_id || !!obj.act_id; });
  return filter ? rows.filter(filter) : rows;
}

function colMap(headers) {
  var m = {};
  headers.forEach(function(h, i) { m[h] = i; });
  return m;
}

// ─── GET /data ────────────────────────────────────────────────────────────────

function getData() {
  // Only expose requests with a public status; strip private + internal columns
  var requests = sheetToObjects(
    REQUESTS_SHEET,
    ['contact_private', 'reserved_by'],
    function(r) { return PUBLIC_STATUSES.indexOf(r.status) !== -1; }
  ).map(function(r) {
    r.amount_requested = parseFloat(r.amount_requested) || 0;
    return r;
  });

  // Strip confirm_token (private — only given to the helper); keep confirmed (public)
  var acts = sheetToObjects(
    ACTS_SHEET,
    ['helper_contact_private', 'confirm_token']
  ).map(function(a) {
    a.amount    = parseFloat(a.amount) || 0;
    a.confirmed = a.confirmed === true || a.confirmed === 'TRUE';
    return a;
  });

  return { requests: requests, acts: acts };
}

// ─── POST /request ────────────────────────────────────────────────────────────

function handleRequest(data) {
  var fp = validateFingerprint(data.fingerprint);
  if (!checkFingerprintLimit('req', fp)) {
    throw new Error('You have submitted too many requests recently. Try again later.');
  }

  var name    = requireStr(data.display_name,       'display_name',       60);
  var contact = requireStr(data.contact_private,     'contact_private',    300);
  var desc    = requireStr(data.description_public,  'description_public', 1000);
  var cat     = sanitizeEnum(data.category, VALID_CATEGORIES, 'Other');
  var amount  = Math.max(0, parseFloat(data.amount_requested) || 0);

  var sheet      = openSheet(REQUESTS_SHEET);
  var request_id = 'req_' + Utilities.getUuid();
  var created_at = new Date().toISOString();

  sheet.appendRow([
    request_id, name, contact, cat, desc, amount,
    'pending_approval', // status — admin changes to 'open' in the sheet to approve
    created_at,
    '',  // reserved_by
    ''   // reserved_until
  ]);

  return { success: true, request_id: request_id };
}

// ─── POST /reserve ────────────────────────────────────────────────────────────

function handleReserve(data) {
  var fp = validateFingerprint(data.fingerprint);
  if (!checkFingerprintLimit('res', fp)) {
    throw new Error('Too many reservation attempts. Try again later.');
  }
  if (!data.request_ids || data.request_ids.length < 1) {
    throw new Error('At least 1 request_id is required.');
  }

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(12000)) throw new Error('Server busy — try again.');

  try {
    var sheet  = openSheet(REQUESTS_SHEET);
    var values = sheet.getDataRange().getValues();
    var H      = colMap(values[0]);

    var now      = new Date();
    var expiry   = new Date(now.getTime() + RESERVE_MINUTES * 60 * 1000);
    var expiryISO = expiry.toISOString();

    var rowIndices = {};
    data.request_ids.forEach(function(rid) {
      rid = rid.toString();
      var found = false;
      for (var i = 1; i < values.length; i++) {
        if (values[i][H.request_id].toString() !== rid) continue;
        found = true;

        var status           = values[i][H.status].toString();
        var reservedBy       = (values[i][H.reserved_by]    || '').toString();
        var reservedUntilStr = (values[i][H.reserved_until] || '').toString();

        if (status !== 'open') {
          throw new Error('Request "' + rid + '" is no longer available (status: ' + status + ').');
        }
        var reservedUntilDate   = reservedUntilStr ? new Date(reservedUntilStr) : null;
        var isActiveReservation = reservedUntilDate && reservedUntilDate > now;
        var isOwn               = reservedBy === fp;

        if (isActiveReservation && !isOwn) {
          throw new Error('One of your selections is temporarily reserved. Please pick a different request.');
        }
        rowIndices[rid] = i;
        break;
      }
      if (!found) throw new Error('Request "' + rid + '" not found.');
    });

    data.request_ids.forEach(function(rid) {
      var row = rowIndices[rid.toString()];
      sheet.getRange(row + 1, H.reserved_by    + 1).setValue(fp);
      sheet.getRange(row + 1, H.reserved_until + 1).setValue(expiryISO);
    });

    return { success: true, reserved_until: expiryISO };
  } finally {
    lock.releaseLock();
  }
}

// ─── POST /act ────────────────────────────────────────────────────────────────

function handleAct(data) {
  var fp = validateFingerprint(data.fingerprint);
  if (!checkFingerprintLimit('act', fp)) {
    throw new Error('You have submitted too many acts recently. Thank you — slow down!');
  }

  var helperName    = requireStr(data.helper_name,            'helper_name',            60);
  var helperContact = requireStr(data.helper_contact_private, 'helper_contact_private', 300);

  if (!data.selections || data.selections.length < 1) {
    throw new Error('At least 1 selection is required.');
  }
  data.selections.forEach(function(s, i) {
    requireStr(s.request_id,   'selections[' + i + '].request_id',   200);
    requireStr(s.public_story, 'selections[' + i + '].public_story', 500);
  });

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(12000)) throw new Error('Server busy — try again.');

  try {
    var reqSheet  = openSheet(REQUESTS_SHEET);
    var actSheet  = openSheet(ACTS_SHEET);
    var reqValues = reqSheet.getDataRange().getValues();
    var H         = colMap(reqValues[0]);
    var now       = new Date();

    // --- Verify all requests before writing anything ---
    var rowMap = {};
    data.selections.forEach(function(sel) {
      var rid   = sel.request_id.toString();
      var found = false;
      for (var i = 1; i < reqValues.length; i++) {
        if (reqValues[i][H.request_id].toString() !== rid) continue;
        found = true;

        var status          = reqValues[i][H.status].toString();
        var reservedBy      = (reqValues[i][H.reserved_by]    || '').toString();
        var reservedUntilStr= (reqValues[i][H.reserved_until] || '').toString();

        if (status !== 'open') {
          throw new Error('Request "' + rid + '" was already fulfilled — please re-select.');
        }
        var reservedUntilDate   = reservedUntilStr ? new Date(reservedUntilStr) : null;
        var isActiveReservation = reservedUntilDate && reservedUntilDate > now;
        var isOwn               = reservedBy === fp;

        if (isActiveReservation && !isOwn) {
          throw new Error('Request "' + rid + '" is reserved by another helper — please re-select.');
        }
        rowMap[rid] = i;
        break;
      }
      if (!found) throw new Error('Request "' + rid + '" not found.');
    });

    // --- All checks passed — write acts ---
    var created_at = new Date().toISOString();
    var act_ids    = [];
    var confirms   = [];  // returned to the helper to share with recipients

    data.selections.forEach(function(sel) {
      var rid           = sel.request_id.toString();
      var act_id        = 'act_' + Utilities.getUuid();
      var confirm_token = Utilities.getUuid();
      var helpType      = sanitizeEnum(sel.help_type, VALID_HELP_TYPES, 'Other');
      var amount        = Math.max(0, parseFloat(sel.amount) || 0);
      var story         = sel.public_story.toString().trim().slice(0, 500);

      // Display name of the person being helped (for the confirm-link label)
      var displayName = reqValues[rowMap[rid]][H.display_name].toString();

      act_ids.push(act_id);
      confirms.push({ request_display_name: displayName, confirm_token: confirm_token });

      actSheet.appendRow([
        act_id, helperName, helperContact, rid,
        helpType, amount, story, created_at,
        confirm_token,  // private — returned to helper only
        false           // confirmed
      ]);

      // Update request status and clear reservation fields
      reqSheet.getRange(rowMap[rid] + 1, H.status         + 1).setValue('helped');
      reqSheet.getRange(rowMap[rid] + 1, H.reserved_by    + 1).setValue('');
      reqSheet.getRange(rowMap[rid] + 1, H.reserved_until + 1).setValue('');
    });

    return { success: true, act_ids: act_ids, confirms: confirms };
  } finally {
    lock.releaseLock();
  }
}

// ─── POST /confirm ────────────────────────────────────────────────────────────

function handleConfirm(data) {
  if (!data.token || typeof data.token !== 'string' || data.token.trim().length < 10) {
    return { success: false, error: 'Invalid confirmation token.' };
  }
  var token = data.token.trim();

  var sheet  = openSheet(ACTS_SHEET);
  var values = sheet.getDataRange().getValues();
  var H      = colMap(values[0]);

  if (!('confirm_token' in H) || !('confirmed' in H)) {
    return { success: false, error: 'Confirmation columns missing — run setupSheets() and re-deploy.' };
  }

  for (var i = 1; i < values.length; i++) {
    var rowToken = (values[i][H.confirm_token] || '').toString();
    if (rowToken !== token) continue;

    if (values[i][H.confirmed] === true || values[i][H.confirmed] === 'TRUE') {
      return { success: true, already_confirmed: true };
    }
    sheet.getRange(i + 1, H.confirmed + 1).setValue(true);
    return { success: true, already_confirmed: false };
  }

  return { success: false, error: 'Token not found. Make sure you copied the full link.' };
}

// ─── Rate limiting ────────────────────────────────────────────────────────────

function checkGlobalRateLimit() {
  var cache  = CacheService.getScriptCache();
  var bucket = 'global_' + Math.floor(Date.now() / 60000);
  var count  = parseInt(cache.get(bucket) || '0', 10);
  if (count >= GLOBAL_MAX_WRITES_PER_MIN) return false;
  cache.put(bucket, String(count + 1), 90);
  return true;
}

function checkFingerprintLimit(kind, fp) {
  var cache = CacheService.getScriptCache();
  var key, max, ttl;

  if (kind === 'req') {
    key = 'fp_req_' + fp + '_' + Math.floor(Date.now() / 3600000);
    max = FP_MAX_REQUESTS_PER_HOUR; ttl = 3700;
  } else if (kind === 'act') {
    key = 'fp_act_' + fp + '_' + Math.floor(Date.now() / 21600000);
    max = FP_MAX_ACTS_PER_6H; ttl = 21700;
  } else { // 'res'
    key = 'fp_res_' + fp + '_' + Math.floor(Date.now() / 3600000);
    max = FP_MAX_RESERVES_PER_HOUR; ttl = 3700;
  }

  var count = parseInt(cache.get(key) || '0', 10);
  if (count >= max) return false;
  cache.put(key, String(count + 1), ttl);
  return true;
}

// ─── Validation ───────────────────────────────────────────────────────────────

function validateFingerprint(fp) {
  if (!fp || typeof fp !== 'string' || fp.trim().length < 10 || fp.length > 128) {
    throw new Error('Invalid or missing fingerprint.');
  }
  if (!/^[a-zA-Z0-9\-_]+$/.test(fp.trim())) throw new Error('Invalid fingerprint format.');
  return fp.trim();
}

function requireStr(val, field, maxLen) {
  if (!val || typeof val !== 'string' || !val.trim()) throw new Error(field + ' is required.');
  return val.trim().slice(0, maxLen);
}

function sanitizeEnum(val, valid, fallback) {
  if (!val) return fallback;
  var s = val.toString().trim();
  return valid.indexOf(s) !== -1 ? s : fallback;
}

// ─── One-time setup ───────────────────────────────────────────────────────────

/**
 * Run ONCE from the Apps Script editor after pasting this code.
 * Then change status from "pending_approval" to "open" in the sheet to approve requests.
 */
function setupSheets() {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);

  function ensureSheet(name, headers) {
    var sh = ss.getSheetByName(name) || ss.insertSheet(name);
    if (sh.getLastRow() === 0) {
      sh.appendRow(headers);
      sh.setFrozenRows(1);
      sh.getRange(1, 1, 1, headers.length).setFontWeight('bold');
      Logger.log('Created sheet: ' + name);
    } else {
      var existing = sh.getRange(1, 1, 1, headers.length).getValues()[0];
      headers.forEach(function(h, i) {
        if (existing[i] !== h) {
          Logger.log('WARNING: "' + name + '" col ' + (i+1) + ' = "' + existing[i] + '", expected "' + h + '"');
        }
      });
    }
    return sh;
  }

  ensureSheet(REQUESTS_SHEET, [
    'request_id', 'display_name', 'contact_private', 'category',
    'description_public', 'amount_requested', 'status', 'created_at',
    'reserved_by', 'reserved_until'
    // To approve: change status from "pending_approval" → "open"
    // To close:   change status to "closed"
  ]);

  ensureSheet(ACTS_SHEET, [
    'act_id', 'helper_name', 'helper_contact_private', 'request_id',
    'help_type', 'amount', 'public_story', 'created_at',
    'confirm_token',  // private — send to recipient via helper
    'confirmed'       // boolean — set to TRUE when recipient clicks confirm link
  ]);

  Logger.log('✅ Done. Approve requests by changing their status to "open" in the Requests sheet.');
}
