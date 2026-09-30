/* ==========================================================================
   PRAMAAN View Component — Detailed Record Modal Sheet
   ========================================================================== */

import { S } from '../state.js';
import { CONFIG, DISCLAIMER } from '../config.js';
import { ic } from '../icons.js';
import { $, esc, fmtLog, qrSvg } from '../utils.js';
import { idbGet } from '../db.js';
import { loadRecords } from '../api.js';
import { verifyRecord } from '../crypto.js';

export async function openDetail(id) {
  let r = S.records.find(x => (x.recordHash || x.record_hash) === id)
       || (await loadRecords()).find(x => (x.recordHash || x.record_hash) === id);

  // If not found locally, try fetching from backend by hash
  if (!r && S.backendOnline) {
    try {
      const res = await fetch(`${CONFIG.apiUrl}/tests/${id}`);
      if (res.ok) {
        const d = await res.json();
        r = d.record || d;
      }
    } catch (e) {}
  }

  if (!r) return;

  // Normalize field names (backend snake_case vs camelCase)
  const caseId = r.case_id || r.caseId || '';
  const sampleId = r.sample_id || r.sampleId || '';
  const testType = r.test_type || r.testType || r.kit || '';
  const recordId = r.record_id || r.recordId || '';
  const recordHash = r.record_hash || r.recordHash || '';
  const imageHash = r.image_hash || r.imageHash || '';
  const previousHash = r.previous_hash || r.previousHash || '';
  const digitalSignature = r.digital_signature || r.digitalSignature || '';
  const sampleColor = r.sample_color || r.sampleColor || '#888';
  const deltaE = r.delta_e || r.deltaE || 0;
  const operatorId = r.operator_id || r.operator || '';
  const confidence = r.confidence || 0;
  const signatureAlgo = r.signature_algorithm || 'ECDSA-P256-SHA256';

  // Fetch image: try backend first, then local IndexedDB cache
  let imgSrc = r.image_data_url || r.imageDataUrl || null;
  if (!imgSrc) {
    const cached = await idbGet('images', recordHash);
    if (cached?.dataUrl) {
      imgSrc = cached.dataUrl;
    } else if (S.backendOnline && recordHash) {
      imgSrc = `${CONFIG.apiUrl}/tests/${recordHash}/image`;
    }
  }

  const qrPayload = `PRAMAAN://verify/${recordId || recordHash}`;

  const modalEl = $('#modal');
  if (!modalEl) return;

  modalEl.innerHTML = `<div class="overlay" data-act="closesheet"><div class="sheet" role="dialog" aria-modal="true" data-stop>
    <div class="shead"><span class="sw" style="background:${esc(sampleColor)}"></span>
      <div style="flex:1"><h2 class="mono" style="font-size:19px">${esc(caseId)}</h2><span class="badge ${r.result}">${esc(r.result)}</span></div>
      <button class="iconbtn" data-act="closesheet" aria-label="Close">${ic('x')}</button></div>
    ${imgSrc ? `<img class="shot" alt="Captured test image" src="${imgSrc}">` : ''}
    <div class="card" style="margin-bottom:14px"><dl class="kv">
      <dt>Record ID</dt><dd class="mono">${esc(recordId)}</dd>
      <dt>Case ID</dt><dd class="mono">${esc(caseId)}</dd>
      ${sampleId ? `<dt>Sample ID</dt><dd class="mono">${esc(sampleId)}</dd>` : ''}
      <dt>Test Type</dt><dd>${esc(testType)}</dd>
      <dt>Operator</dt><dd class="mono">${esc(operatorId)}</dd>
      <dt>Time</dt><dd>${r.timestamp ? esc(fmtLog(r.timestamp)) : ''}</dd>
      <dt>Confidence</dt><dd>${esc(confidence)}% — Algorithmic confidence (not scientific certainty). ΔE ${esc(deltaE)}</dd>
      <dt>Location</dt><dd>${r.gps ? `${r.gps.lat.toFixed(5)}, ${r.gps.lon.toFixed(5)} (±${r.gps.accuracy} m) — <a class="link" target="_blank" rel="noopener" href="https://www.openstreetmap.org/?mlat=${r.gps.lat}&mlon=${r.gps.lon}#map=16/${r.gps.lat}/${r.gps.lon}">Open map</a>` : 'Not captured'}</dd>
      <dt>Integrity</dt><dd><span id="sigstat" class="pill wait">Checking…</span></dd>
    </dl></div>
    <div class="card" style="margin-bottom:14px"><dl class="kv">
      <dt>Image SHA-256</dt><dd class="hash">${imageHash}</dd>
      <dt>Record SHA-256</dt><dd class="hash">${recordHash}</dd>
      <dt>Previous hash</dt><dd class="hash">${previousHash}</dd>
      <dt>Signature</dt><dd class="hash" style="word-break:break-all">${digitalSignature ? digitalSignature.slice(0, 60) + '…' : 'N/A'}</dd>
      <dt>Algorithm</dt><dd>${signatureAlgo}</dd>
    </dl></div>
    <div class="lbl" style="text-align:center">Verification QR Code</div>
    <div class="qrbox" data-act="jump-verify" data-id="${recordId || recordHash}" style="cursor:pointer" title="Click to verify this QR code">${qrSvg(qrPayload)}</div>
    <div class="mini" style="text-align:center;margin-top:4px;color:var(--muted)">${esc(qrPayload)} <button data-act="jump-verify" data-id="${recordId || recordHash}" style="color:var(--teal-2);text-decoration:underline;margin-left:6px;font-weight:700">Verify Now →</button></div>
    <div class="two">
      <button class="btn primary" data-act="rec-pdf" data-id="${recordHash}">${ic('file')}PDF</button>
      <button class="btn plain" data-act="rec-json" data-id="${recordHash}">${ic('json')}JSON</button>
      <button class="btn plain" data-act="rec-verify-backend" data-id="${recordId || recordHash}" style="grid-column:1/-1">${ic('shield')}Verify Record Integrity</button>
      <button class="btn danger" data-act="delete-log" data-id="${recordHash}" data-rid="${recordId}" data-case="${esc(caseId)}" style="grid-column:1/-1;margin-top:6px">${ic('trash')}Delete This Log Record</button>
    </div>
    <div id="detail-verify"></div>
    <div class="notice" style="margin:18px 0 0">${esc(DISCLAIMER)}</div>
  </div></div>`;

  // Run integrity check
  if (S.backendOnline && recordHash) {
    try {
      const vres = await fetch(`${CONFIG.apiUrl}/tests/${recordHash}/verify`, { method: 'POST' });
      if (vres.ok) {
        const vd = await vres.json();
        const el = $('#sigstat');
        if (el) {
          const ok = vd.verified || vd.verdict === 'VALID';
          el.className = 'pill ' + (ok ? 'ok' : 'bad');
          el.textContent = ok ? '✓ Record Verified (Backend)' : '✗ Integrity Check Failed';
        }
        return;
      }
    } catch (e) {}
  }

  // Fallback: local ECDSA verify
  const v = await verifyRecord(r, null);
  const sig = v.checks.find(c => c.name === 'Digital signature');
  const rh = v.checks.find(c => c.name === 'Record hash');
  const el = $('#sigstat');
  if (el) {
    const ok = (sig?.status === 'pass') && (rh?.status === 'pass');
    el.className = 'pill ' + (ok ? 'ok' : 'bad');
    el.textContent = ok ? '✓ Record Verified (Local)' : sig?.status === 'skip' ? 'Backend signing — use Verify page' : '✗ Signature invalid';
  }
}
