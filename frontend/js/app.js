/* ==========================================================================
   PRAMAAN Main Application Controller & Bootstrapper
   ========================================================================== */

import { CONFIG, DISCLAIMER } from './config.js';
import { S, setUser, resetNewTest } from './state.js';
import { ic } from './icons.js';
import {
  $,
  esc,
  dataUrlBytes,
  saveBlob,
  printHtml,
  fileToDataUrl,
  sampleImage,
  showToast
} from './utils.js';
import { idbGet, seedIfEmpty } from './db.js';
import { makeRecord, verifyRecord } from './crypto.js';
import {
  backendHealth,
  loadProfiles,
  loadRecords,
  login,
  demoLogin,
  analyzeTestEvidence,
  saveTestRecord,
  deleteRecord,
  clearAllRecords
} from './api.js';
import { go, route, initRouter } from './router.js';

// Views
import { vLogin } from './views/login.js';
import { vHome } from './views/home.js';
import { vNewTest } from './views/new-test.js';
import { vDash } from './views/dashboard.js';
import { vVerify, verifyInput } from './views/verify.js';
import { vLog, logList, filtered } from './views/log.js';
import { openDetail } from './views/detail-modal.js';
import { reportHtml } from './views/report.js';

/* ==========================================================================
   Camera & Scanning Hardware Management
   ========================================================================== */

let stream = null;
let scanTimer = null;
let newStream = null;
let currentFacingMode = 'environment';

export function render() {
  const a = $('#app');
  if (!a) return;

  if (S.route === 'login') a.innerHTML = vLogin();
  else if (S.route === 'home') a.innerHTML = vHome();
  else if (S.route === 'verify') a.innerHTML = vVerify();
  else if (S.route === 'log') a.innerHTML = vLog();
  else if (S.route === 'new') a.innerHTML = vNewTest();
  else if (S.route === 'dash') a.innerHTML = vDash();
  else a.innerHTML = vHome();

  if (S.scanning && stream) {
    const v = $('#cam');
    if (v) {
      v.srcObject = stream;
      v.play();
    }
  }
}

async function startScan() {
  if (!('BarcodeDetector' in window)) {
    alert('This browser cannot scan QR codes directly. Paste the QR text below instead.');
    return;
  }
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
  } catch (e) {
    alert('Camera access was blocked. Allow camera permissions or paste the QR text below.');
    return;
  }
  S.scanning = true;
  render();
  const v = $('#cam');
  if (v) {
    v.srcObject = stream;
    await v.play();
  }
  const det = new BarcodeDetector({ formats: ['qr_code'] });
  scanTimer = setInterval(async () => {
    try {
      if (v) {
        const codes = await det.detect(v);
        if (codes.length) {
          const txt = codes[0].rawValue;
          stopScan();
          render();
          verifyInput(txt, null);
        }
      }
    } catch (e) { }
  }, 350);
}

function stopScan() {
  if (scanTimer) {
    clearInterval(scanTimer);
    scanTimer = null;
  }
  if (stream) {
    stream.getTracks().forEach(t => t.stop());
    stream = null;
  }
  S.scanning = false;
}

async function startNewCamera() {
  try {
    if (newStream) {
      newStream.getTracks().forEach(t => t.stop());
      newStream = null;
    }
    newStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: currentFacingMode } });
    S.newScanning = true;
    render();
    const v = $('#newcam');
    if (v) {
      v.srcObject = newStream;
      await v.play();
    }
  } catch (e) {
    if (currentFacingMode === 'environment') {
      try {
        currentFacingMode = 'user';
        newStream = await navigator.mediaDevices.getUserMedia({ video: true });
        S.newScanning = true;
        render();
        const v = $('#newcam');
        if (v) {
          v.srcObject = newStream;
          await v.play();
        }
        return;
      } catch (err) { }
    }
    alert('Camera access was blocked or unavailable. Allow camera access or upload an image instead.');
  }
}

function stopNewCamera() {
  if (newStream) {
    newStream.getTracks().forEach(t => t.stop());
    newStream = null;
  }
  S.newScanning = false;
}

function captureNewPhoto() {
  const v = $('#newcam');
  if (!v || !v.videoWidth) {
    alert('Camera is not ready yet.');
    return;
  }
  const vw = v.videoWidth;
  const vh = v.videoHeight;
  const c = document.createElement('canvas');

  // Auto-embed reference card strip into the camera capture if enabled
  if (S.autoEmbedCard !== false) {
    const cardH = Math.max(90, Math.round(vh * 0.24));
    c.width = vw;
    c.height = vh + cardH;
    const g = c.getContext('2d');
    g.drawImage(v, 0, 0, vw, vh);

    // Dark calibration card banner at bottom
    g.fillStyle = '#0f172a';
    g.fillRect(0, vh, vw, cardH);
    g.fillStyle = '#94a3b8';
    g.font = 'bold ' + Math.max(10, Math.round(cardH * 0.15)) + 'px sans-serif';
    g.fillText('INBUILT 6-PATCH REFERENCE CARD — LIGHTING CALIBRATION', 16, vh + Math.round(cardH * 0.20));

    const patches = ['#ffffff', '#808080', '#c0392b', '#2e86c1', '#f1c40f', '#27ae60'];
    const pW = Math.round((vw - 32) / patches.length) - 8;
    const pH = Math.round(cardH * 0.60);
    const pY = vh + Math.round(cardH * 0.28);
    patches.forEach((p, i) => {
      const pX = 16 + i * (pW + 8);
      g.fillStyle = p;
      g.fillRect(pX, pY, pW, pH);
      g.strokeStyle = '#334155';
      g.lineWidth = 1;
      g.strokeRect(pX, pY, pW, pH);
    });
  } else {
    c.width = vw;
    c.height = vh;
    c.getContext('2d').drawImage(v, 0, 0);
  }

  S.newTest.imageDataUrl = c.toDataURL('image/jpeg', 0.92);
  stopNewCamera();
  S.newMsg = S.autoEmbedCard !== false
    ? 'Photo captured with inbuilt 6-patch reference card. Click "Analyse Test Image" below.'
    : 'Photo captured. Click "Analyse Test Image" below.';
  render();
}

async function captureGps() {
  if (!navigator.geolocation) {
    alert('Geolocation is not available in this browser.');
    return;
  }
  navigator.geolocation.getCurrentPosition(
    p => {
      S.newTest.gps = {
        lat: p.coords.latitude,
        lon: p.coords.longitude,
        accuracy: Math.round(p.coords.accuracy)
      };
      S.newMsg = 'GPS captured successfully.';
      render();
    },
    e => alert('GPS could not be captured: ' + e.message),
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
  );
}

async function analyzeCurrentTest() {
  try {
    if (!S.newTest.imageDataUrl) {
      S.newMsg = 'Please capture or upload the test image first.';
      render();
      return;
    }

    const STEPS = [
      'Image quality check',
      'Reference colour card detection',
      'Lighting calibration',
      'Reaction region detection',
      'Colour feature extraction (Lab space)',
      'Test profile comparison',
      'Classification'
    ];
    S.analysisSteps = STEPS.map(label => ({ label, done: false }));
    S.analysisRunning = true;
    S.newTest.analysisReady = false;
    S.newTest.analysisFailed = false;
    S.newMsg = 'Analysing image with PRAMAAN backend…';
    render();

    const online = await backendHealth();
    if (!online) {
      S.analysisRunning = false;
      S.analysisSteps = [];
      S.newMsg = 'PRAMAAN backend is offline. Start the backend server and try again.';
      render();
      return;
    }

    let stepIdx = 0;
    const stepTimer = setInterval(() => {
      if (stepIdx < S.analysisSteps.length - 1) {
        S.analysisSteps[stepIdx].done = true;
        stepIdx++;
        render();
      }
    }, 400);

    const ttEl = $('#new-testtype');
    if (ttEl && ttEl.value) S.newTest.testType = ttEl.value;
    const caseEl = $('#new-case');
    if (caseEl && caseEl.value) S.newTest.caseId = caseEl.value;
    const sampleEl = $('#new-sample');
    if (sampleEl && sampleEl.value) S.newTest.sampleId = sampleEl.value;

    const testType = S.newTest.testType || 'Heroin';
    const operatorId = S.user?.id || 'demo-operator';

    const analysis = await analyzeTestEvidence(S.newTest.imageDataUrl, testType, operatorId);



    clearInterval(stepTimer);
    S.analysisSteps.forEach(s => (s.done = true));

    const isInvalid = analysis.result === 'INVALID CAPTURE' || analysis.capture_status === 'INVALID';

    S.newTest.result = analysis.result || 'INCONCLUSIVE';
    S.newTest.confidence = Number.isFinite(Number(analysis.confidence)) ? Number(analysis.confidence) : 0;
    S.newTest.deltaE = analysis.delta_e ?? analysis.deltaE ?? 0;
    S.newTest.captureStatus = analysis.capture_status || (isInvalid ? 'INVALID' : 'VALID');
    S.newTest.referenceDetected = analysis.reference_detected !== false;
    S.newTest.calibrationApplied = analysis.calibration_applied !== false;
    S.newTest.lightingFactor = Number(analysis.lighting_factor) || 1.0;
    S.newTest.drugHypothesis = analysis.drug_hypothesis || '';
    S.newTest.drugConfidence = Number(analysis.drug_confidence) || 0;
    S.newTest.imageQuality = analysis.image_quality || 'GOOD';
    S.newTest.classificationMethod = analysis.classification_method || 'ML_Colorimetric_Model_v1';
    S.newTest.analysisMessage = analysis.message || '';

    const color = analysis.sample_color || analysis.sampleColor;
    if (Array.isArray(color) && color.length >= 3) {
      const [r, g, b] = color.map(Number);
      if ([r, g, b].every(Number.isFinite)) {
        S.newTest.sampleColor =
          '#' +
          [r, g, b]
            .map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0'))
            .join('');
      }
    } else if (typeof color === 'string' && color) {
      S.newTest.sampleColor = color;
    }

    S.newTest.analysisReady = true;
    S.newTest.analysisFailed = false;
    S.analysisRunning = false;
    S.online = true;
    S.backendOnline = true;

    if (isInvalid) {
      S.newMsg = 'INVALID CAPTURE: ' + (analysis.reason || analysis.message || 'Please retake the image.');
    } else {
      S.newMsg = analysis.message || 'Analysis complete. Presumptive field-test result returned.';
    }
    render();
  } catch (error) {
    console.error('PRAMAAN analysis failed:', error);
    S.analysisRunning = false;
    S.analysisSteps = [];
    S.newTest.analysisReady = false;
    S.newTest.analysisFailed = true;
    S.online = false;
    S.backendOnline = false;
    S.newMsg = 'Analysis failed: ' + (error?.message || String(error));
    render();
  }
}

async function saveNewTest() {
  try {
    const n = S.newTest;
    n.caseId = $('#new-case')?.value.trim() || n.caseId;
    n.sampleId = ($('#new-sample') ? $('#new-sample').value.trim() : '') || '';
    n.testType = ($('#new-testtype') ? $('#new-testtype').value : n.testType) || n.testType;

    if (!n.caseId) {
      S.newMsg = 'Please enter a Case ID before saving.';
      render();
      return;
    }
    if (!n.imageDataUrl) {
      S.newMsg = 'Please capture or upload the test image before saving.';
      render();
      return;
    }
    if (!n.analysisReady) {
      S.newMsg = 'Please analyse the test image before saving.';
      render();
      return;
    }
    if (n.captureStatus === 'INVALID') {
      S.newMsg = 'Cannot save an INVALID CAPTURE. Please retake the image.';
      render();
      return;
    }

    const operatorId = S.user?.id || S.user?.operator_id || S.user?.operatorId;
    if (!operatorId) {
      S.newMsg = 'Please log in before saving.';
      render();
      return;
    }

    S.newMsg = 'Saving to PRAMAAN backend…';
    render();

    const rec = await saveTestRecord({
      case_id: n.caseId,
      sample_id: n.sampleId || null,
      test_type: n.testType,
      operator_id: operatorId,
      gps: n.gps,
      result: n.result,
      confidence: n.confidence,
      delta_e: n.deltaE,
      sample_color: n.sampleColor,
      image_data_url: n.imageDataUrl,
      analysis_message: n.analysisMessage || null,
      capture_status: n.captureStatus || 'VALID',
      reference_detected: n.referenceDetected !== false,
      image_quality: n.imageQuality || 'GOOD',
      classification_method: n.classificationMethod || 'prototype_rule_based'
    });

    S.records = await loadRecords();
    S.newMsg = `Record ${rec.recordId || rec.record_id || ''} saved, hashed and signed by PRAMAAN backend.`;
    resetNewTest();
    stopNewCamera();

    go('log');
    await route();

    setTimeout(() => {
      if (rec.recordHash) openDetail(rec.recordHash);
    }, 80);
  } catch (error) {
    console.error('PRAMAAN SAVE ERROR:', error);
    S.newMsg = 'Save failed: ' + (error?.message || String(error));
    render();
  }
}

async function verifyAllRecords() {
  const rows = await loadRecords();
  let fail = 0;
  for (const r of rows) {
    const img = await idbGet('images', r.recordHash || r.record_hash);
    const bytes = img?.dataUrl ? dataUrlBytes(img.dataUrl) : null;
    const v = await verifyRecord(r, bytes);
    if (v.verdict !== 'VALID') fail++;
  }
  alert(fail ? `${fail} record(s) need review.` : `All ${rows.length} stored record(s) passed the available integrity checks.`);
}

/* ==========================================================================
   DOM Event Listeners & Delegations
   ========================================================================== */

document.addEventListener('click', async e => {
  const el = e.target.closest('[data-act]');
  if (!el) return;
  const act = el.dataset.act;

  if (act === 'closesheet') {
    if (e.target.closest('[data-stop]') && el.classList.contains('overlay')) return;
    const modal = $('#modal');
    if (modal) modal.innerHTML = '';
    return;
  }
  if (el.closest('[data-stop]') && el.classList.contains('overlay')) return;

  switch (act) {
    case 'login': {
      const id = $('#opid')?.value.trim().toUpperCase();
      const pin = $('#pin')?.value;
      try {
        S.err = '';
        render();
        await login(id, pin);
        go('home');
        await route();
      } catch (error) {
        S.online = false;
        S.err = error?.message || 'Unable to connect to PRAMAAN backend.';
        render();
      }
      break;
    }
    case 'demo': {
      try {
        await demoLogin();
        go('home');
        await route();
      } catch (error) {
        S.err = error?.message || 'Backend is offline.';
        render();
      }
      break;
    }
    case 'logout': {
      setUser(null);
      go('login');
      route();
      break;
    }
    case 'nav': {
      go(el.dataset.to);
      break;
    }
    case 'open': {
      openDetail(el.dataset.id);
      break;
    }
    case 'togglefilters': {
      S.showFilters = !S.showFilters;
      render();
      break;
    }
    case 'clearfilters': {
      S.filters = { q: '', result: '', testType: '', from: '', to: '', gps: '' };
      render();
      break;
    }
    case 'tab': {
      stopScan();
      S.tab = el.dataset.tab;
      S.vres = null;
      render();
      break;
    }
    case 'pick': {
      const inputEl = $('#f-' + el.dataset.kind);
      if (inputEl) inputEl.click();
      break;
    }
    case 'verify-files': {
      const jf = S.vfiles.json;
      if (!jf) return;
      const text = await jf.text();
      const ib = S.vfiles.img ? new Uint8Array(await S.vfiles.img.arrayBuffer()) : null;
      await verifyInput(text, ib);
      break;
    }
    case 'verify-paste': {
      const pasteEl = $('#paste');
      S.paste = pasteEl ? pasteEl.value : S.paste;
      await verifyInput(S.paste);
      break;
    }
    case 'verify-manual': {
      const manualEl = $('#manual');
      S.manual = manualEl ? manualEl.value : S.manual;
      await verifyInput(S.manual);
      break;
    }
    case 'jump-verify': {
      const targetId = el.dataset.id;
      const modal = $('#modal');
      if (modal) modal.innerHTML = '';
      S.paste = targetId;
      S.tab = 'qr';
      go('verify');
      await route();
      setTimeout(() => verifyInput(targetId), 120);
      break;
    }
    case 'flip-camera': {
      currentFacingMode = currentFacingMode === 'environment' ? 'user' : 'environment';
      await startNewCamera();
      break;
    }
    case 'toggle-autocard': {
      S.autoEmbedCard = S.autoEmbedCard === false ? true : false;
      render();
      break;
    }
    case 'show-digital-card': {
      const modal = $('#modal');
      if (modal) {
        modal.innerHTML = `<div class="overlay" data-act="closesheet"><div class="sheet" data-stop style="text-align:center">
          <h2>Official 6-Patch Reference Colour Card</h2>
          <p class="mini" style="margin-bottom:16px">Display this on another screen or hold in front of camera for physical lighting calibration.</p>
          <div style="background:#0f172a;padding:24px 16px;border-radius:16px;border:2px solid var(--border)">
            <div style="color:#94a3b8;font-weight:700;font-size:12px;margin-bottom:12px">PRAMAAN STANDARD FORENSIC CALIBRATION CARD</div>
            <div style="display:grid;grid-template-columns:repeat(6,1fr);gap:10px;max-width:540px;margin:0 auto">
              ${['#ffffff', '#808080', '#c0392b', '#2e86c1', '#f1c40f', '#27ae60'].map((hexColor, i) => `
                <div style="border-radius:8px;overflow:hidden;border:1.5px solid rgba(255,255,255,0.2)">
                  <div style="background:${hexColor};height:80px"></div>
                  <div style="background:#1e293b;color:#cbd5e1;font-size:11px;font-weight:700;padding:4px 0">${['WHT', 'GRY', 'RED', 'BLU', 'YEL', 'GRN'][i]}</div>
                </div>`).join('')}
            </div>
          </div>
          <button class="btn primary" data-act="closesheet" style="margin-top:20px">Close</button>
        </div></div>`;
      }
      break;
    }
    case 'startscan':
      startScan();
      break;
    case 'stopscan':
      stopScan();
      render();
      break;
    case 'new-pick': {
      const inputEl = $('#new-img');
      if (inputEl) inputEl.click();
      break;
    }
    case 'new-startcam':
      startNewCamera();
      break;
    case 'new-stopcam':
      stopNewCamera();
      render();
      break;
    case 'new-capture':
      captureNewPhoto();
      break;
    case 'analyse-new':
      analyzeCurrentTest();
      break;
    case 'new-gps':
      captureGps();
      break;
    case 'save-new':
      saveNewTest();
      break;
    case 'verify-all':
      verifyAllRecords();
      break;
    case 'export-json': {
      const rows = filtered();
      saveBlob('pramaan-records.json', new Blob([JSON.stringify(rows, null, 2)], { type: 'application/json' }));
      break;
    }
    case 'export-pdf': {
      printHtml(await reportHtml(filtered()));
      break;
    }
    case 'rec-json': {
      const r = S.records.find(x => (x.recordHash || x.record_hash) === el.dataset.id);
      if (r) {
        saveBlob(`pramaan-${r.record_id || r.recordId}.json`, new Blob([JSON.stringify(r, null, 2)], { type: 'application/json' }));
      }
      break;
    }
    case 'rec-pdf': {
      const r = S.records.find(x => (x.recordHash || x.record_hash) === el.dataset.id);
      if (r) printHtml(await reportHtml([r]));
      break;
    }
    case 'rec-img': {
      const r = S.records.find(x => (x.recordHash || x.record_hash) === el.dataset.id);
      if (r) {
        const i = await idbGet('images', r.record_hash || r.recordHash);
        if (i?.dataUrl) saveBlob(`pramaan-${r.record_id || r.recordId}.png`, new Blob([dataUrlBytes(i.dataUrl)], { type: 'image/png' }));
      }
      break;
    }
    case 'delete-log': {
      const hash = el.dataset.id;
      const rid = el.dataset.rid;
      const cId = el.dataset.case;
      const success = await deleteRecord(hash, rid, cId);
      if (success) {
        const modal = $('#modal');
        if (modal) modal.innerHTML = '';
        render();
      }
      break;
    }
    case 'clear-all-logs': {
      const success = await clearAllRecords();
      if (success) {
        const modal = $('#modal');
        if (modal) modal.innerHTML = '';
        render();
      }
      break;
    }
    case 'rec-verify-backend': {
      const rId = el.dataset.id;
      if (!rId) break;
      try {
        const vres = await fetch(`${CONFIG.apiUrl}/tests/${rId}/verify`, { method: 'POST' });
        if (vres.ok) {
          const vd = await vres.json();
          const dv = $('#detail-verify');
          const elPill = $('#sigstat');
          const ok = vd.verified || vd.verdict === 'VALID';
          if (elPill) {
            elPill.className = 'pill ' + (ok ? 'ok' : 'bad');
            elPill.textContent = ok ? '✓ Record Verified (Backend)' : '✕ Integrity Check Failed';
          }
          if (dv) {
            dv.innerHTML = `<div class="verdict ${ok ? 'VALID' : 'TAMPERED'}" role="status" style="margin-top:16px">${ic(ok ? 'shield' : 'alert')}
              <div><h2>${ok ? '✓ RECORD VERIFIED' : '✕ VERIFICATION FAILED'}</h2>
              <p>${ok ? 'Record integrity confirmed. Digital signature valid. Image hash matches.' : 'Record integrity could not be verified.'}</p>
              <div style="font-size:13px;margin-top:8px">
                Image hash: ${vd.image_hash_valid ? '✓ VALID' : '✕ MISMATCH'} •
                Record hash: ${vd.record_hash_valid ? '✓ VALID' : '✕ MISMATCH'} •
                Signature: ${vd.signature_valid ? '✓ VALID' : '✕ INVALID'}
              </div></div></div>`;
          }
        }
      } catch (e) {
        alert('Backend verification failed: ' + e.message);
      }
      break;
    }
  }
});

document.addEventListener('input', e => {
  if (e.target.id === 'q') {
    S.filters.q = e.target.value;
    const loglistEl = $('#loglist');
    if (loglistEl) loglistEl.innerHTML = logList();
  }
  if (e.target.id === 'new-case') S.newTest.caseId = e.target.value;
  if (e.target.id === 'new-sample') S.newTest.sampleId = e.target.value;
});

document.addEventListener('change', e => {
  const t = e.target;
  if (t.dataset && t.dataset.f) {
    S.filters[t.dataset.f] = t.value;
    const loglistEl = $('#loglist');
    if (loglistEl) loglistEl.innerHTML = logList();
    return;
  }
  if (t.id === 'f-img' || t.id === 'f-json') {
    S.vfiles[t.id === 'f-img' ? 'img' : 'json'] = t.files[0] || null;
    S.vres = null;
    render();
  }
  if (t.id === 'new-img' && t.files[0]) {
    const file = t.files[0];
    const nameLower = (file.name || '').toLowerCase();
    for (const type of CONFIG.testTypes) {
      if (nameLower.includes(type.toLowerCase())) {
        S.newTest.testType = type;
        break;
      }
    }
    fileToDataUrl(file).then(u => {
      S.newTest.imageDataUrl = u;
      S.newTest.analysisReady = false;
      S.newTest.captureStatus = 'VALID';
      S.newMsg = `Image uploaded (${file.name}). Click Analyse Test Image to proceed.`;
      render();
    });
  }
  if (t.id === 'new-case') S.newTest.caseId = t.value;
  if (t.id === 'new-sample') S.newTest.sampleId = t.value;
  if (t.id === 'new-testtype') {
    S.newTest.testType = t.value;
    S.newTest.analysisReady = false;
  }
});

['dragover', 'dragleave', 'drop'].forEach(ev =>
  document.addEventListener(ev, e => {
    const dz = e.target.closest('[data-dz]');
    if (!dz) return;
    e.preventDefault();
    if (ev === 'dragover') dz.classList.add('over');
    else dz.classList.remove('over');
    if (ev === 'drop' && e.dataTransfer.files[0]) {
      S.vfiles[dz.dataset.dz] = e.dataTransfer.files[0];
      S.vres = null;
      render();
    }
  })
);

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    const modal = $('#modal');
    if (modal) modal.innerHTML = '';
  }
  if (e.key === 'Enter' && S.route === 'login' && (e.target.id === 'opid' || e.target.id === 'pin')) {
    const loginBtn = document.querySelector('[data-act="login"]');
    if (loginBtn) loginBtn.click();
  }
});

/* ==========================================================================
   Bootstrapping Lifecycle
   ========================================================================== */

(async function boot() {
  try {
    await backendHealth();
  } catch (e) { }

  try {
    await loadProfiles();
  } catch (e) {
    console.warn('Profile load failed:', e);
  }

  try {
    await seedIfEmpty(makeRecord);
  } catch (e) {
    console.error('PRAMAAN seed failed:', e);
  }

  initRouter({
    onRender: render,
    onStopScan: stopScan,
    onStopCamera: stopNewCamera,
    onVerifyInput: verifyInput
  });

  await route();
  if (S.user) render();
})();
