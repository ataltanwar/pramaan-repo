/* ==========================================================================
   PRAMAAN Configuration & Constants
   ========================================================================== */

export const DISCLAIMER = 'This is a presumptive field-test result and supporting digital record. It does not replace laboratory confirmatory testing. Laboratory confirmation is required for definitive identification.';

export const GENESIS = '0'.repeat(64);

export const enc = new TextEncoder();

/**
 * Production Render API URL placeholder.
 * Update this with your deployed Render Web Service URL (e.g. 'https://pramaan-backend.onrender.com/api/v1').
 * Runtime overrides (without editing code):
 *   1. window.PRAMAAN_API_URL (set before app loads)
 *   2. URL query parameter: ?api_url=https://<your-render-url>/api/v1
 *   3. localStorage: localStorage.setItem('PRAMAAN_API_URL', 'https://<your-render-url>/api/v1')
 */
export const DEFAULT_PRODUCTION_API_URL = 'https://pramaan-app.onrender.com/api/v1';

export function getResolvedApiUrl() {
  // 1. Explicit window override
  if (typeof window !== 'undefined' && window.PRAMAAN_API_URL) {
    return window.PRAMAAN_API_URL.replace(/\/+$/, '');
  }

  // 2. Query parameter override (persisted into localStorage for convenience)
  if (typeof window !== 'undefined' && window.location) {
    try {
      const params = new URLSearchParams(window.location.search);
      const queryApi = params.get('api_url') || params.get('api');
      if (queryApi) {
        const cleaned = queryApi.replace(/\/+$/, '');
        window.localStorage.setItem('PRAMAAN_API_URL', cleaned);
        return cleaned;
      }
    } catch (_) {}
  }

  // 3. LocalStorage override
  if (typeof window !== 'undefined' && window.localStorage) {
    const stored = window.localStorage.getItem('PRAMAAN_API_URL');
    if (stored) return stored.replace(/\/+$/, '');
  }

  // 4. Local development auto-detection (localhost or 127.0.0.1)
  if (typeof window !== 'undefined' && window.location) {
    const host = window.location.hostname;
    if (host === 'localhost' || host === '127.0.0.1') {
      if (window.location.port === '8000') {
        return `${window.location.origin}/api/v1`;
      }
      return 'http://localhost:8000/api/v1';
    }
  }

  // 5. Default production backend URL
  return DEFAULT_PRODUCTION_API_URL;
}

export const CONFIG = {
  apiUrl: getResolvedApiUrl(),
  testTypes: [
    'Opium',
    'Morphine',
    'Codeine',
    'Heroin',
    'Amphetamines',
    'Mescaline',
    'Marijuana',
    'Hashish',
    'Hashish Oil',
    'Cocaine',
    'Methaqualone'
  ],
  profiles: []
};
