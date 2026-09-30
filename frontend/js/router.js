/* ==========================================================================
   PRAMAAN Client-Side Hash Router
   ========================================================================== */

import { S } from './state.js';
import { loadRecords } from './api.js';

let _renderCallback = null;
let _stopScanCallback = null;
let _stopCameraCallback = null;
let _verifyInputCallback = null;

export function go(r) {
  location.hash = '#/' + r;
}

export function currentRoute() {
  return location.hash.replace('#/', '') || (S.user ? 'home' : 'login');
}

export function setRouterHooks({ onRender, onStopScan, onStopCamera, onVerifyInput }) {
  _renderCallback = onRender;
  _stopScanCallback = onStopScan;
  _stopCameraCallback = onStopCamera;
  _verifyInputCallback = onVerifyInput;
}

export async function route() {
  if (_stopScanCallback) _stopScanCallback();
  if (_stopCameraCallback) _stopCameraCallback();

  let r = currentRoute();
  if (!S.user && r !== 'login') r = 'login';
  if (S.user && r === 'login') r = 'home';
  if (S.user && r === 'dash' && !['Supervisor', 'Demo'].includes(S.user.role)) r = 'home';

  let verifyTargetId = null;
  if (r.startsWith('verify')) {
    const qIdx = location.hash.indexOf('?id=');
    if (qIdx !== -1) {
      verifyTargetId = decodeURIComponent(location.hash.substring(qIdx + 4).split('&')[0]);
      r = 'verify';
    }
  }

  S.route = r;
  S.vres = null;
  S.err = '';

  if (r === 'home' || r === 'log' || r === 'dash' || r === 'new') {
    S.records = await loadRecords();
  }

  if (_renderCallback) _renderCallback();

  if (verifyTargetId) {
    S.tab = 'qr';
    S.paste = verifyTargetId;
    if (_renderCallback) _renderCallback();
    if (_verifyInputCallback) {
      setTimeout(() => _verifyInputCallback(verifyTargetId), 120);
    }
  }
}

export function initRouter(hooks) {
  setRouterHooks(hooks);
  window.addEventListener('hashchange', route);
  window.addEventListener('online', () => {
    S.online = true;
    if (S.user && _renderCallback) _renderCallback();
  });
  window.addEventListener('offline', () => {
    S.online = false;
    if (S.user && _renderCallback) _renderCallback();
  });
}
