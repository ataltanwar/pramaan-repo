/* ==========================================================================
   PRAMAAN Global State Management
   ========================================================================== */

import { CONFIG } from './config.js';

export const S = {
  user: null,
  route: 'login',
  online: navigator.onLine,
  backendOnline: false,
  records: [],
  filters: { q: '', result: '', testType: '', from: '', to: '', gps: '' },
  showFilters: false,
  tab: 'upload',
  vfiles: { img: null, json: null },
  vres: null,
  manual: '',
  paste: '',
  scanning: false,
  err: '',
  verifySearch: '',
  verifySearchResult: null,
  analysisSteps: [],
  analysisRunning: false,
  autoEmbedCard: true,
  newTest: {
    caseId: '',
    sampleId: '',
    testType: 'Opium',
    result: 'POSITIVE',
    confidence: 85,
    deltaE: 5,
    sampleColor: '#7b4aa8',
    imageDataUrl: null,
    gps: null,
    analysisReady: false,
    analysisFailed: false,
    captureStatus: 'VALID'
  },
  newScanning: false,
  newMsg: ''
};

// Restore user session from sessionStorage
try {
  S.user = JSON.parse(sessionStorage.getItem('pramaan_user') || 'null');
  if (S.user) {
    S.user.id = S.user.id || S.user.operator_id || S.user.operatorId;
    S.user.operator_id = S.user.operator_id || S.user.id;
    sessionStorage.setItem('pramaan_user', JSON.stringify(S.user));
  }
} catch (e) {
  console.warn('Could not restore user session:', e);
}

export function setUser(u) {
  S.user = u;
  try {
    if (u) {
      sessionStorage.setItem('pramaan_user', JSON.stringify(u));
    } else {
      sessionStorage.removeItem('pramaan_user');
    }
  } catch (e) {}
}

export function resetNewTest() {
  S.newTest = {
    caseId: '',
    sampleId: '',
    testType: CONFIG.testTypes[0] || 'Opium',
    result: 'POSITIVE',
    confidence: 85,
    deltaE: 5,
    sampleColor: '#7b4aa8',
    imageDataUrl: null,
    gps: null,
    analysisReady: false,
    analysisFailed: false,
    captureStatus: 'VALID'
  };
}
