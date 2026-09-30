/* ==========================================================================
   PRAMAAN Backend API Service & Ledger Client
   ========================================================================== */

import { CONFIG } from './config.js';
import { S, setUser } from './state.js';
import { idbAll, idbDel, tx } from './db.js';
import { verifyRecord } from './crypto.js';
import { dataUrlToBlob, parseJson, showToast } from './utils.js';

export async function backendHealth() {
  const isLocal = typeof window !== 'undefined' &&
    (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');

  const candidates = [CONFIG.apiUrl];
  if (isLocal) {
    for (const fallback of ['http://localhost:8000/api/v1', 'http://localhost:8080/api/v1', 'http://localhost:8001/api/v1']) {
      if (!candidates.includes(fallback)) candidates.push(fallback);
    }
  }

  for (const url of candidates) {
    try {
      const response = await fetch(`${url}/health`, {
        method: 'GET',
        cache: 'no-store'
      });
      if (response.ok) {
        const body = await response.json().catch(() => ({}));
        if (body.service === 'PRAMAAN' || body.status === 'ok') {
          CONFIG.apiUrl = url;
          S.backendOnline = true;
          return true;
        }
      }
    } catch (e) {}
  }
  S.backendOnline = false;
  return false;
}


export async function loadProfiles() {
  try {
    const res = await fetch(`${CONFIG.apiUrl}/profiles`, { cache: 'no-store' });
    if (!res.ok) return;
    const data = await res.json();
    CONFIG.profiles = data.profiles || [];
    if (CONFIG.profiles.length) {
      CONFIG.testTypes = CONFIG.profiles.map(p => p.name);
    }
  } catch (e) {
    console.warn('Could not load profiles:', e);
  }
}

export async function loadRecords(params = {}) {
  try {
    const qs = new URLSearchParams();
    if (params.search) qs.set('search', params.search);
    if (params.result) qs.set('result', params.result);
    if (params.test_type) qs.set('test_type', params.test_type);
    if (params.date_from) qs.set('date_from', params.date_from);
    if (params.date_to) qs.set('date_to', params.date_to);
    qs.set('limit', '200');

    const response = await fetch(`${CONFIG.apiUrl}/tests?${qs}`, { cache: 'no-store' });
    if (!response.ok) throw new Error(`Backend returned ${response.status}`);
    const data = await response.json();
    const rows = Array.isArray(data) ? data : (data.records || []);
    S.online = true;
    S.backendOnline = true;
    return rows.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  } catch (error) {
    console.warn('Backend record load failed:', error);
    S.backendOnline = false;
    // Offline fallback: locally cached records remain available.
    return (await idbAll('records')).sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  }
}

export async function login(operatorId, pin) {
  const response = await fetch(`${CONFIG.apiUrl}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ operator_id: operatorId, pin })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.detail || 'Login failed.');
  const user = data.user || {};
  const normalizedUser = {
    ...user,
    id: user.id || user.operator_id || user.operatorId,
    operator_id: user.operator_id || user.id || user.operatorId
  };
  setUser(normalizedUser);
  S.online = true;
  return normalizedUser;
}

export async function demoLogin() {
  const response = await fetch(`${CONFIG.apiUrl}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ operator_id: 'DEMO', pin: '000000' })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.detail || 'Demo login failed.');
  const user = data.user || {};
  const normalizedUser = {
    ...user,
    id: user.id || user.operator_id || user.operatorId,
    operator_id: user.operator_id || user.id || user.operatorId
  };
  setUser(normalizedUser);
  S.online = true;
  return normalizedUser;
}

export async function analyzeTestEvidence(imageDataUrl, testType, operatorId) {
  const imageBlob = await dataUrlToBlob(imageDataUrl);
  const formData = new FormData();
  formData.append('image', imageBlob, 'pramaan-test.jpg');
  formData.append('test_type', testType || 'unknown');
  formData.append('operator_id', operatorId || 'demo-operator');

  const response = await fetch(`${CONFIG.apiUrl}/tests/analyze`, {
    method: 'POST',
    body: formData
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.detail || `Analysis API returned ${response.status}`);
  }
  return data.analysis || data;
}

export async function saveTestRecord(payload) {
  const response = await fetch(`${CONFIG.apiUrl}/tests`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(body.detail || `Backend save failed (${response.status})`);
  }

  const rec = body.record || body;
  S.online = true;
  S.backendOnline = true;

  // Cache locally
  try {
    if (rec.recordHash) {
      await tx('records', 'readwrite', os => os.put(rec));
      await tx('images', 'readwrite', os => os.put({
        recordHash: rec.recordHash,
        dataUrl: payload.image_data_url
      }));
    }
  } catch (cacheError) {
    console.warn('Local cache failed; backend save is still successful.', cacheError);
  }

  return rec;
}

export async function deleteRecord(recordHash, recordId, caseId) {
  const label = caseId || recordId || (recordHash ? recordHash.slice(0, 12) + '…' : 'this record');
  if (!confirm(`Are you sure you want to delete log record for "${label}"?\n\nThis will permanently remove it from both local logs and the backend vault.`)) {
    return false;
  }

  try {
    // 1. Delete from backend if online
    if (S.backendOnline && (recordId || recordHash)) {
      const target = recordId || recordHash;
      try {
        const res = await fetch(`${CONFIG.apiUrl}/tests/${target}`, { method: 'DELETE' });
        if (!res.ok && res.status !== 404) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.detail || `Server returned ${res.status}`);
        }
      } catch (beErr) {
        console.warn('Backend delete error:', beErr);
      }
    }

    // 2. Delete from IndexedDB local storage
    try {
      if (recordHash) {
        await idbDel('records', recordHash);
        await idbDel('images', recordHash);
      }
    } catch (idbErr) {
      console.warn('Local storage delete notice:', idbErr);
    }

    // 3. Remove from in-memory records list
    S.records = S.records.filter(r => (r.record_hash || r.recordHash) !== recordHash && (r.record_id || r.recordId) !== recordId);

    showToast(`Log record "${label}" deleted successfully.`);
    return true;
  } catch (e) {
    console.error('Failed to delete log:', e);
    alert('Failed to delete log record: ' + (e?.message || e));
    return false;
  }
}

export async function clearAllRecords() {
  if (!S.records.length) {
    alert('No log records to delete.');
    return false;
  }
  if (!confirm(`Are you sure you want to delete ALL ${S.records.length} log records?\n\nThis will remove all records from the current ledger.`)) {
    return false;
  }

  try {
    for (const r of [...S.records]) {
      const hash = r.record_hash || r.recordHash;
      const rid = r.record_id || r.recordId;
      if (S.backendOnline && (rid || hash)) {
        try {
          await fetch(`${CONFIG.apiUrl}/tests/${rid || hash}`, { method: 'DELETE' });
        } catch (e) {}
      }
      try {
        if (hash) {
          await idbDel('records', hash);
          await idbDel('images', hash);
        }
      } catch (e) {}
    }
    S.records = [];
    return true;
  } catch (e) {
    console.error('Clear all logs error:', e);
    return false;
  }
}
