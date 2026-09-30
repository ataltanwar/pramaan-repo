/* ==========================================================================
   PRAMAAN View — Home Landing
   ========================================================================== */

import { S } from '../state.js';
import { DISCLAIMER } from '../config.js';
import { ic } from '../icons.js';
import { esc, fmtHome } from '../utils.js';
import { topbar } from './topbar.js';

export function vHome() {
  const recent = S.records.slice(0, 3);
  const canDash = S.user && (S.user.role === 'Supervisor' || S.user.role === 'Demo');

  return `
  ${S.user && S.user.demo ? `<div class="demo-strip">🎭 Demo Mode active <button data-act="logout">← Back to Login</button></div>` : ''}
  ${topbar()}
  <div class="wrap">
    <button class="cta" data-act="nav" data-to="new">
      <span class="ico">${ic('camera')}</span>
      <span style="flex:1"><h2>New Test</h2><p>Start a new field test</p></span>${ic('chev')}
    </button>
    <div class="tiles">
      <button class="card tile" data-act="nav" data-to="log"><span class="ico">${ic('clip')}</span>Test Log</button>
      <button class="card tile" data-act="nav" data-to="verify"><span class="ico">${ic('shield')}</span>Verify Record</button>
    </div>
    <div class="sec-head"><h3>Recent Tests</h3><button class="link" data-act="nav" data-to="log">View All</button></div>
    <div class="card list">
      ${recent.length ? recent.map(r => {
        const caseId = r.case_id || r.caseId || '';
        const testType = r.test_type || r.testType || r.kit || '';
        const recordHash = r.record_hash || r.recordHash || '';
        const resLabel = r.result || 'INCONCLUSIVE';
        return `<button class="row" data-act="open" data-id="${recordHash}">
          <span class="ico">${ic('flask')}</span>
          <span class="meta"><div class="title">${esc(caseId)}</div><div class="sub">${esc(testType)}</div></span>
          <span class="right"><span class="badge ${resLabel}">${esc(resLabel)}</span><span style="display:flex;gap:5px;align-items:center">${ic('clock', 'style="width:13px;height:13px"')}${fmtHome(r.timestamp)}</span></span>
        </button>`;
      }).join('') : '<div class="empty">No tests yet.</div>'}
    </div>
    ${canDash ? `<button class="card dash" data-act="nav" data-to="dash"><span class="ico" style="width:42px;height:42px;border-radius:10px;background:rgba(15,150,136,.22);color:var(--teal-2);display:grid;place-items:center">${ic('grid')}</span><span style="flex:1"><b>Supervisor Dashboard</b><span>Stats, map, and team overview</span></span>${ic('chev')}</button>` : ''}
    <div class="notice">${esc(DISCLAIMER)}</div>
  </div>`;
}
