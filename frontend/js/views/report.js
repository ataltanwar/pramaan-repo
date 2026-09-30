/* ==========================================================================
   PRAMAAN View Component — Printable Official Field Test Report
   ========================================================================== */

import { DISCLAIMER } from '../config.js';
import { esc, fmtLog, qrSvg } from '../utils.js';
import { idbGet } from '../db.js';

export async function reportHtml(recs) {
  let rows = '';

  for (const r of recs) {
    const recordHash = r.record_hash || r.recordHash || '';
    const recordId = r.record_id || r.recordId || '';
    const caseId = r.case_id || r.caseId || '';
    const kit = r.test_type || r.testType || r.kit || '';
    const operator = r.operator_id || r.operator || '';
    const imageHash = r.image_hash || r.imageHash || '';
    const previousHash = r.previous_hash || r.previousHash || '';
    const signature = r.digital_signature || r.digitalSignature || r.signature || '';

    const i = await idbGet('images', recordHash);
    const imgSrc = r.image_data_url || r.imageDataUrl || (i ? i.dataUrl : '');

    rows += `<section><div class="h"><img src="${imgSrc || ''}" alt=""><div><h2>${esc(caseId)} — ${r.result}</h2>
      <p>${esc(kit)} · ${fmtLog(r.timestamp)} · Confidence ${esc(r.confidence)}% (ΔE ${esc(r.delta_e || r.deltaE || 0)})</p>
      <p>Operator ${esc(operator)} · ${r.gps ? `GPS ${r.gps.lat.toFixed(5)}, ${r.gps.lon.toFixed(5)} (±${r.gps.accuracy} m)` : 'No GPS'}</p></div>
      ${recs.length === 1 ? `<div class="q">${qrSvg(JSON.stringify(r))}</div>` : ''}</div>
      <table><tr><td>Record ID</td><td>${esc(recordId)}</td></tr><tr><td>Image SHA-256</td><td>${imageHash}</td></tr>
      <tr><td>Record SHA-256</td><td>${recordHash}</td></tr><tr><td>Previous hash</td><td>${previousHash}</td></tr>
      <tr><td>Signature (ECDSA P-256)</td><td>${signature}</td></tr></table></section>`;
  }

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>PRAMAAN Report</title><style>
    body{font-family:Arial,sans-serif;color:#111;margin:24px}h1{color:#0a1e3c;margin:0}
    .top{border-bottom:3px solid #0f9688;padding-bottom:8px;margin-bottom:14px}
    .n{border:2px solid #b45309;background:#fffbeb;padding:10px 12px;font-weight:bold;margin:12px 0}
    section{border:1px solid #ccc;border-radius:8px;padding:12px;margin-bottom:14px;page-break-inside:avoid}
    .h{display:flex;gap:14px;align-items:flex-start}.h img{width:130px;border-radius:6px}.h h2{margin:0 0 4px;font-size:17px}.h p{margin:2px 0;font-size:12px}
    .q{width:110px;margin-left:auto}.q svg{width:100%}
    table{width:100%;border-collapse:collapse;font-size:10px;margin-top:8px}td{border:1px solid #ddd;padding:4px;word-break:break-all}td:first-child{width:24%;font-weight:bold;background:#f3f6fa}
    </style></head><body><div class="top"><h1>PRAMAAN — Field Test Report</h1><div style="font-size:12px">Digital Companion for Field Drug Testing · Generated ${fmtLog(new Date().toISOString())} · ${recs.length} record(s)</div></div>
    <div class="n">${esc(DISCLAIMER)}</div>${rows}<div class="n">${esc(DISCLAIMER)}</div></body></html>`;
}
