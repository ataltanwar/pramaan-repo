/* ==========================================================================
   PRAMAAN View — New Test Capture & Color Analysis
   ========================================================================== */

import { S } from '../state.js';
import { CONFIG, DISCLAIMER } from '../config.js';
import { ic } from '../icons.js';
import { esc } from '../utils.js';
import { pageHead } from './topbar.js';

export function vNewTest() {
  const n = S.newTest;
  const img = n.imageDataUrl;
  const analysis = n.analysisReady;
  const invalid = n.captureStatus === 'INVALID';
  const resColor = n.result === 'POSITIVE' ? 'var(--pos)' : n.result === 'NEGATIVE' ? 'var(--neg)' : 'var(--inc)';

  return `
  ${pageHead('New Field Test', analysis ? 'Review the presumptive result before saving the secure digital record' : 'Capture the field-test evidence and prepare it for analysis')}
  <div class="wrap">
    ${S.newMsg ? `<div class="notice" style="border-color:${S.newMsg.startsWith('Save failed') || S.newMsg.startsWith('Analysis failed') || invalid ? 'var(--pos)' : 'var(--teal)'};color:${S.newMsg.startsWith('Save failed') || S.newMsg.startsWith('Analysis failed') || invalid ? '#fca5a5' : '#99f6e4'};background:${S.newMsg.startsWith('Save failed') || S.newMsg.startsWith('Analysis failed') || invalid ? 'rgba(239,68,68,.12)' : 'rgba(15,150,136,.12)'}"><b>${esc(S.newMsg)}</b></div>` : ''}
    <div class="card" style="padding:18px;margin-bottom:18px">
      <div class="lbl">1 · Case Information</div>
      <div class="formgrid">
        <div class="fieldbox"><label for="new-case">Case ID *</label><input id="new-case" value="${esc(n.caseId)}" placeholder="NCB/2026/MH/0044"></div>
        <div class="fieldbox"><label for="new-sample">Sample ID</label><input id="new-sample" value="${esc(n.sampleId || '')}" placeholder="SAMPLE-001"></div>
        <div class="fieldbox full"><label for="new-testtype">Test Type (Substance) *</label><select id="new-testtype">${CONFIG.testTypes.map(t => `<option ${n.testType === t ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select></div>
      </div>

      <div class="lbl">2 · Capture Test Evidence</div>
      <div class="image-stage">
        ${img ? `<img class="image-preview" src="${img}" alt="Captured field-test sample">` : `<div class="empty" style="padding:28px">Capture or upload a clear image of the reacted test kit and reference colour card.</div>`}
        <div class="actionrow" style="margin-top:12px;gap:8px;flex-wrap:wrap">
          <button class="btn plain" data-act="new-pick">${ic('upload')}Upload image</button>
          ${S.newScanning ? `<button class="btn primary" data-act="new-capture">${ic('camera')}Capture photo</button>` : `<button class="btn primary" data-act="new-startcam">${ic('camera')}Use camera</button>`}
          <button class="btn plain" data-act="load-sample-strip" title="Load calibrated test cassette with 6-patch card">${ic('flask')}Demo sample strip</button>
        </div>
        ${S.newScanning ? `
          <div style="position:relative;margin-top:12px;border-radius:14px;overflow:hidden;border:2px solid var(--border);background:#000">
            <video class="cam" id="newcam" playsinline muted style="width:100%;display:block;max-height:360px;object-fit:cover"></video>
            <!-- Dual-zone in-frame calibration viewfinder overlay -->
            <div style="position:absolute;inset:0;pointer-events:none;display:flex;flex-direction:column;justify-content:space-between;padding:12px">
              <div style="border:2px dashed rgba(20,184,166,0.9);border-radius:10px;height:56%;display:flex;align-items:center;justify-content:center;background:rgba(15,150,136,0.08)">
                <span style="background:rgba(10,22,40,0.88);color:#99f6e4;padding:4px 12px;border-radius:6px;font-size:12px;font-weight:700;border:1px solid rgba(20,184,166,0.5)">1. Align Test Reaction Well Here</span>
              </div>
              <div style="border:2px dashed rgba(245,158,11,0.9);border-radius:10px;height:36%;margin-top:8px;display:flex;align-items:center;justify-content:center;background:rgba(245,158,11,0.08)">
                <span style="background:rgba(10,22,40,0.88);color:#fde68a;padding:4px 12px;border-radius:6px;font-size:12px;font-weight:700;border:1px solid rgba(245,158,11,0.5)">2. Keep 6-Patch Reference Card in Frame (Lighting Calibration)</span>
              </div>
            </div>
          </div>
          <div class="actionrow" style="margin-top:10px;gap:8px;flex-wrap:wrap">
            <button class="btn plain" data-act="flip-camera">${ic('refresh')}Flip camera</button>
            <button class="btn plain" data-act="toggle-autocard" style="font-size:13px;border-color:${S.autoEmbedCard !== false ? 'var(--teal-2)' : 'var(--border)'}">
              ${S.autoEmbedCard !== false ? '✓ Inbuilt Reference Card: ON' : '○ Inbuilt Reference Card: OFF'}
            </button>
            <button class="btn plain" data-act="show-digital-card" style="font-size:13px">${ic('grid')}View Reference Card</button>
            <button class="btn plain" data-act="new-stopcam">Stop camera</button>
          </div>` : ''}
        <input type="file" id="new-img" accept="image/*" hidden>
      </div>

      <div class="lbl">3 · Colour Analysis</div>
      ${S.analysisRunning ? `
        <div class="card" style="padding:18px;margin-bottom:14px;background:rgba(15,150,136,.07);border:1px solid rgba(15,150,136,.35)">
          <div class="lbl" style="margin-top:0">Analyzing image…</div>
          ${S.analysisSteps.map(step => `
            <div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--border)">
              <span style="color:${step.done ? 'var(--neg)' : 'var(--muted)'}">${step.done ? ic('ok') : ic('dash')}</span>
              <span style="color:${step.done ? 'var(--text)' : 'var(--muted)'}">${esc(step.label)}</span>
            </div>`).join('')}
        </div>` : ''}
      ${analysis ? `<div class="card" style="margin-bottom:14px;padding:18px;background:${invalid ? 'rgba(239,68,68,.07)' : 'rgba(15,150,136,.07)'};border:2px solid ${invalid ? 'var(--pos)' : resColor}">
        <div class="lbl" style="margin-top:0">PRESUMPTIVE FIELD-TEST RESULT</div>
        <div style="display:flex;align-items:center;gap:16px;flex-wrap:wrap">
          <div style="font-size:28px;font-weight:800;color:${invalid ? '#fca5a5' : resColor}">${esc(n.result)}</div>
          ${!invalid ? `<div style="text-align:left">
            <div class="mini">Algorithmic confidence</div>
            <div style="font-size:22px;font-weight:800">${esc(n.confidence)}%</div>
          </div>
          <div style="text-align:left">
            <div class="mini">Colour Difference (ΔE)</div>
            <div style="font-size:22px;font-weight:800">${esc(n.deltaE)}</div>
          </div>
          <div style="display:flex;align-items:center;gap:8px;margin-left:auto">
            <div style="width:32px;height:32px;border-radius:8px;background:${esc(n.sampleColor || '#808080')};border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.3)" title="Sample Reaction Colour"></div>
            <div class="mini mono">${esc(n.sampleColor || '')}</div>
          </div>` : ''}
        </div>
        ${!invalid ? `
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:14px">
          <span class="pill ok">${ic('ok', 'style="width:14px;height:14px"')} Reference Card Calibrated</span>
          <span class="pill ok">${ic('ok', 'style="width:14px;height:14px"')} Lighting Scale: ${n.lightingFactor ? n.lightingFactor.toFixed(3) : '1.000'}×</span>
          ${n.drugHypothesis && n.drugHypothesis !== 'unknown' ? `<span class="pill ok">${ic('flask', 'style="width:14px;height:14px"')} Signature: ${esc(n.drugHypothesis.toUpperCase())} (${esc(n.drugConfidence)}%)</span>` : ''}
          <span class="pill wait">${ic('shield', 'style="width:14px;height:14px"')} ${esc(n.classificationMethod || 'ML_Colorimetric_Model_v1')}</span>
        </div>` : ''}
        <div class="notice" style="margin-top:12px;margin-bottom:0">⚠ <b>IMPORTANT:</b> ${esc(DISCLAIMER)}</div>
      </div>` : ''}
      ${!analysis && !S.analysisRunning ? `<div class="fieldbox" style="margin-bottom:14px">
        <div style="display:flex;gap:12px;align-items:flex-start">
          <div style="width:42px;height:42px;border-radius:10px;background:#0f9688;display:grid;place-items:center;color:#fff;font-weight:800;flex:none">3</div>
          <div><b>Standardised colour interpretation</b><div class="mini">PRAMAAN sends the captured evidence to the analysis service. Reference card calibration is applied. The result is presumptive and must not be treated as laboratory confirmation.</div></div>
        </div>
      </div>` : ''}
      <button class="btn primary" data-act="analyse-new" ${img && !S.analysisRunning ? '' : 'disabled'} style="margin-top:4px">${ic('search')}${S.analysisRunning ? 'Analysing…' : 'Analyse Test Image'}</button>

      <div class="lbl" style="margin-top:18px">4 · GPS Location</div>
      <div class="fieldbox" style="margin-bottom:18px"><div style="display:flex;align-items:center;gap:12px;justify-content:space-between"><div><b>${n.gps ? 'GPS captured' : 'GPS not captured'}</b><div class="mini">${n.gps ? `${n.gps.lat.toFixed(6)}, ${n.gps.lon.toFixed(6)} · ±${n.gps.accuracy} m` : 'Optional. Browser permission required. Location data will be recorded in the digital record.'}</div></div><button class="btn plain" style="width:auto;min-height:48px;padding:0 16px;font-size:14px" data-act="new-gps">${ic('pin')}Capture GPS</button></div></div>

      <button class="btn primary" id="save-btn" data-act="save-new" ${img && analysis && !invalid ? '' : 'disabled'}>${ic('shield')}Save Digital Record</button>
      <div class="notice" style="margin-top:18px;margin-bottom:0">${esc(DISCLAIMER)}</div>
    </div>
  </div>`;
}
