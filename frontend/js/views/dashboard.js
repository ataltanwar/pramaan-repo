/* ==========================================================================
   PRAMAAN View — Supervisor Dashboard
   ========================================================================== */

import { S } from '../state.js';
import { ic } from '../icons.js';
import { esc, fmtLog } from '../utils.js';
import { pageHead } from './topbar.js';

export function vDash() {
  const rows = S.records;
  const getOperator = r => r.operator_id || r.operator || '';
  const getCaseId = r => r.case_id || r.caseId || '';
  const getTestType = r => r.test_type || r.testType || r.kit || '';
  const getRecordHash = r => r.record_hash || r.recordHash || '';
  const getPrevHash = r => r.previous_hash || r.previousHash || '';
  const getCurHash = r => r.record_hash || r.recordHash || '';

  const total = rows.length;
  const pos = rows.filter(r => r.result === 'POSITIVE').length;
  const neg = rows.filter(r => r.result === 'NEGATIVE').length;
  const inc = rows.filter(r => r.result === 'INCONCLUSIVE').length;
  const gps = rows.filter(r => r.gps).length;
  const ops = [...new Set(rows.map(getOperator))];
  const chain = rows.length ? rows.slice().sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp)) : [];
  const broken = [];
  for (let i = 1; i < chain.length; i++) {
    if (getPrevHash(chain[i]) !== getCurHash(chain[i - 1])) {
      broken.push(chain[i]);
    }
  }

  return `
  ${pageHead('Supervisor Dashboard', 'Operational overview of field testing records')}
  <div class="wrap">
    <div class="statgrid">
      <div class="card stat"><div class="num">${total}</div><div class="lab">Total records</div></div>
      <div class="card stat"><div class="num">${pos}</div><div class="lab">Positive</div></div>
      <div class="card stat"><div class="num">${neg}</div><div class="lab">Negative</div></div>
      <div class="card stat"><div class="num">${inc}</div><div class="lab">Inconclusive</div></div>
    </div>
    <div class="supgrid">
      <div>
        <div class="sec-head"><h3>Team activity</h3><span class="mini">${ops.length} operator${ops.length === 1 ? '' : 's'}</span></div>
        <div class="card tablewrap"><table class="stable"><thead><tr><th>Operator</th><th>Tests</th><th>Positive</th><th>GPS</th></tr></thead><tbody>
        ${ops.length ? ops.map(op => {
          const rs = rows.filter(r => getOperator(r) === op);
          return `<tr><td class="mono">${esc(op)}</td><td>${rs.length}</td><td>${rs.filter(r => r.result === 'POSITIVE').length}</td><td>${rs.filter(r => r.gps).length}</td></tr>`;
        }).join('') : '<tr><td colspan="4">No records</td></tr>'}
        </tbody></table></div>
      </div>
      <div>
        <div class="sec-head"><h3>Integrity health</h3></div>
        <div class="card" style="padding:18px">
          <div class="notice" style="margin:0 0 12px;border-color:${broken.length ? 'var(--pos)' : 'var(--teal)'};color:${broken.length ? '#fca5a5' : '#99f6e4'};background:${broken.length ? 'rgba(239,68,68,.1)' : 'rgba(15,150,136,.1)'}">${broken.length ? `${broken.length} chain link issue${broken.length === 1 ? '' : 's'} detected.` : 'Hash-chain links are consistent.'}</div>
          <div class="kv" style="padding:0"><dt>GPS coverage</dt><dd>${total ? Math.round(gps / total * 100) : 0}% (${gps}/${total})</dd><dt>Operators</dt><dd>${ops.length}</dd><dt>Chain</dt><dd>${broken.length ? 'Review required' : 'Healthy'}</dd></div>
        </div>
      </div>
    </div>
    <div class="sec-head" style="margin-top:26px"><h3>Latest records</h3><button class="link" data-act="nav" data-to="log">Open Test Log</button></div>
    <div class="card list">${rows.slice(0, 8).map(r => `<button class="row" data-act="open" data-id="${getRecordHash(r)}"><span class="ico">${ic('flask')}</span><span class="meta"><div class="title">${esc(getCaseId(r))}</div><div class="sub">${esc(getOperator(r))} · ${esc(getTestType(r))}</div></span><span class="right"><span class="badge ${r.result}">${esc(r.result)}</span><span>${fmtLog(r.timestamp)}</span></span></button>`).join('') || '<div class="empty">No records yet.</div>'}</div>
    <div class="actionrow" style="margin-top:18px"><button class="btn primary" data-act="verify-all">${ic('shield')}Verify all records</button><button class="btn plain" data-act="export-json">${ic('json')}Export all JSON</button></div>
  </div>`;
}
