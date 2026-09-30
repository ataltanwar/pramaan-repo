/* ==========================================================================
   PRAMAAN IndexedDB Storage Layer
   ========================================================================== */

import { GENESIS } from './config.js';
import { sampleImage } from './utils.js';

const DB_NAME = 'pramaan';
const DB_VERSION = 2;
let _db = null;

export function db() {
  return _db || (_db = new Promise((resolve, reject) => {
    if (!window.indexedDB) {
      reject(new Error('IndexedDB is not available in this browser.'));
      return;
    }

    const r = indexedDB.open(DB_NAME, DB_VERSION);

    r.onupgradeneeded = () => {
      const d = r.result;

      if (!d.objectStoreNames.contains('records')) {
        d.createObjectStore('records', { keyPath: 'recordHash' });
      }

      if (!d.objectStoreNames.contains('images')) {
        d.createObjectStore('images', { keyPath: 'recordHash' });
      }

      if (!d.objectStoreNames.contains('keys')) {
        d.createObjectStore('keys', { keyPath: 'name' });
      }
    };

    r.onblocked = () => {
      reject(new Error('PRAMAAN storage is blocked. Close other tabs using this app and reload.'));
    };

    r.onerror = () => {
      reject(r.error || new Error('Could not open PRAMAAN local storage.'));
    };

    r.onsuccess = () => {
      const database = r.result;
      database.onversionchange = () => database.close();
      database.onerror = event => {
        console.error('PRAMAAN IndexedDB error:', event.target?.error);
      };
      resolve(database);
    };
  }));
}

export async function tx(store, mode, fn) {
  const d = await db();

  return new Promise((resolve, reject) => {
    let transaction;
    let request;

    try {
      transaction = d.transaction(store, mode);
      const objectStore = transaction.objectStore(store);
      request = fn(objectStore);

      let requestResult;

      if (request) {
        request.onsuccess = () => {
          requestResult = request.result;
        };

        request.onerror = () => {
          reject(request.error || new Error(`PRAMAAN ${store} request failed.`));
        };
      }

      transaction.oncomplete = () => {
        resolve(requestResult);
      };

      transaction.onerror = () => {
        reject(transaction.error || new Error(`PRAMAAN ${store} transaction failed.`));
      };

      transaction.onabort = () => {
        reject(transaction.error || new Error(`PRAMAAN ${store} transaction was aborted.`));
      };
    } catch (error) {
      reject(error);
    }
  });
}

export const idbGet = (s, k) => tx(s, 'readonly', o => o.get(k));
export const idbAll = s => tx(s, 'readonly', o => o.getAll());
export const idbPut = (s, v) => tx(s, 'readwrite', o => o.put(v));
export const idbDel = (s, k) => tx(s, 'readwrite', o => o.delete(k));

export async function seedIfEmpty(makeRecordFn) {
  const existing = await idbAll('records');
  if (existing.length) return;
  const op = 'NCB/FO/2026/001';
  const rows = [
    ['NCB/2026/MH/0041', 'Marquis', '2026-09-20T21:35:00+05:30', 'POSITIVE', 91, 4.1, '#3d1a5c', { lat: 19.076, lon: 72.8777, accuracy: 8 }],
    ['NCB/2026/MH/0042', 'Cobalt Thiocyanate', '2026-09-22T09:35:00+05:30', 'NEGATIVE', 88, 3.2, '#d9d9d9', { lat: 19.0821, lon: 72.8811, accuracy: 12 }],
    ['NCB/2026/DL/0019', 'Duquenois-Levine', '2026-09-23T21:35:00+05:30', 'POSITIVE', 91, 3.8, '#3b1857', null],
    ['NCB/2026/MH/0043', 'Marquis', '2026-09-25T09:35:00+05:30', 'INCONCLUSIVE', 52, 12.6, '#8b7050', { lat: 19.0176, lon: 72.8562, accuracy: 20 }],
    ['NCB/2026/KA/0007', 'Cobalt Thiocyanate', '2026-09-26T21:35:00+05:30', 'NEGATIVE', 88, 3.4, '#dcdcdc', { lat: 12.9716, lon: 77.5946, accuracy: 10 }]
  ];
  let prev = GENESIS;
  for (const [caseId, kit, timestamp, result, confidence, deltaE, sampleColor, gps] of rows) {
    const rec = await makeRecordFn({
      caseId,
      kit,
      operator: op,
      timestamp,
      gps,
      result,
      confidence,
      deltaE,
      sampleColor,
      imageDataUrl: sampleImage(sampleColor, caseId + ' · ' + kit),
      previousHash: prev
    });
    prev = rec.recordHash;
  }
}
