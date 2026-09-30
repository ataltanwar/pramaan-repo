/* ==========================================================================
   PRAMAAN View — Test Log & History
   ========================================================================== */

import { S } from '../state.js';
import { CONFIG } from '../config.js';
import { ic, RES_ICON, RES_LABEL } from '../icons.js';
import { esc, fmtLog } from '../utils.js';
import { pageHead } from './topbar.js';

export function filtered() {
  const f = S.filters;
  const q = f.q.trim().toLowerCase();

  return S.records.filter(r => {
    // Normalize: backend records use test_type, local records may use kit
    const testType = r.test_type || r.testType || r.kit || '';
    const operatorId = r.operator_id || r.operator || '';

    if (q && !(r.case_id || r.caseId || '').toLowerCase().includes(q)
          && !(operatorId).toLowerCase().includes(q)
          && !(testType).toLowerCase().includes(q)
          && !(r.record_id || r.recordId || '').toLowerCase().includes(q)) return false;

    if (f.result && r.result !== f.result) return false;
    if (f.testType && testType !== f.testType) return false;
    if (f.gps === 'yes' && !r.gps) return false;
    if (f.gps === 'no' && r.gps) return false;

    const t = new Date(r.timestamp);
    if (f.from && t < new Date(f.from + 'T00:00:00')) return false;
    if (f.to && t > new Date(f.to + 'T23:59:59')) return false;

    return true;
  });
}

export function logList() {
  const rows = filtered();

  return `<div class="count" style="display:flex;justify-content:space-between;align-items:center">
    <span>${rows.length} record${rows.length === 1 ? '' : 's'}</span>
    ${rows.length ? `<button class="link" data-act="clear-all-logs" style="color:#fca5a5;font-size:13px;display:inline-flex;align-items:center;gap:5px">${ic('trash', 'style="width:14px;height:14px"')}Clear all logs</button>` : ''}
  </div>` + (rows.length ? rows.map(r => {
    const caseId = r.case_id || r.caseId || '';
    const testType = r.test_type || r.testType || r.kit || '';
    const recordHash = r.record_hash || r.recordHash || '';
    const recordId = r.record_id || r.recordId || '';
    const sampleColor = r.sample_color || r.sampleColor || '#888';
    const conf = r.confidence || 0;

    return `
    <div class="rec-item">
      <button class="rec" data-act="open" data-id="${recordHash}">
        <span class="sw" style="background:${esc(sampleColor)}"></span>
        <span class="meta">
          <span class="l1"><span class="cid">${esc(caseId)}</span><span class="tag ${r.result}">${ic(RES_ICON[r.result] || 'dash')}${esc(r.result)}</span></span>
          <span class="l2" style="display:block">${esc(testType)}</span>
          <span class="l3">${fmtLog(r.timestamp)}${r.gps ? ` · <span style="display:inline-flex;align-items:center;gap:3px">${ic('pin', 'style="width:13px;height:13px"')}GPS</span>` : ''}</span>
        </span>
        <span class="conf">${esc(conf)}%${ic('chev')}</span>
      </button>
      <button class="del-btn" data-act="delete-log" data-id="${recordHash}" data-rid="${recordId}" data-case="${esc(caseId)}" title="Delete Log Record ${esc(caseId)}" aria-label="Delete log record">
        ${ic('trash')}
      </button>
    </div>`;
  }).join('') : '<div class="empty">No records match these filters.</div>');
}

export function vLog() {
  const f = S.filters;
  const active = ['result', 'testType', 'from', 'to', 'gps'].filter(k => f[k]).length;

  return `
  ${pageHead('Test Log', 'Searchable test history — all records from backend')}
  <div class="wrap" style="padding-bottom:8px">
    <div class="search">
      <label class="box">${ic('search')}<input id="q" placeholder="Search case ID, record ID, operator, test type…" value="${esc(f.q)}" aria-label="Search"></label>
      <button class="fbtn ${S.showFilters || active ? 'on' : ''}" data-act="togglefilters" aria-label="Filters">${ic('filter')}</button>
    </div>
    ${S.showFilters ? `<div class="card filters">
      <div><label for="fr">Result</label><select id="fr" data-f="result"><option value="">All</option>${['POSITIVE', 'NEGATIVE', 'INCONCLUSIVE'].map(x => `<option ${f.result === x ? 'selected' : ''} value="${x}">${x}</option>`).join('')}</select></div>
      <div><label for="fk">Test type</label><select id="fk" data-f="testType"><option value="">All</option>${CONFIG.testTypes.map(x => `<option ${f.testType === x ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select></div>
      <div><label for="ff">From</label><input id="ff" type="date" data-f="from" value="${f.from}"></div>
      <div><label for="ft">To</label><input id="ft" type="date" data-f="to" value="${f.to}"></div>
      <div><label for="fg">Location</label><select id="fg" data-f="gps"><option value="">Any</option><option value="yes" ${f.gps === 'yes' ? 'selected' : ''}>With GPS</option><option value="no" ${f.gps === 'no' ? 'selected' : ''}>No GPS</option></select></div>
      <div style="display:flex;align-items:flex-end"><button class="btn plain" style="min-height:48px;font-size:15px" data-act="clearfilters">Clear all</button></div>
    </div>` : ''}
    <div id="loglist">${logList()}</div>
  </div>
  <div class="exportbar"><div class="in">
    <button class="btn primary" data-act="export-pdf">${ic('file')}Export PDF Report</button>
    <button class="btn plain" data-act="export-json">${ic('json')}Export JSON</button>
  </div></div>`;
}
