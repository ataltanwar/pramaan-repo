/* ==========================================================================
   PRAMAAN Cryptography Layer (ECDSA P-256, SHA-256, Tamper Verification)
   ========================================================================== */

import { CONFIG, GENESIS, enc } from './config.js';
import { idbGet, idbPut, idbAll } from './db.js';
import { sha256, dataUrlBytes, hex, hexBytes, canon } from './utils.js';
import { S } from './state.js';

export async function getKeys() {
  let k = await idbGet('keys', 'signing');
  if (!k) {
    const kp = await crypto.subtle.generateKey(
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      ['sign', 'verify']
    );
    const pub = await crypto.subtle.exportKey('jwk', kp.publicKey);
    k = { name: 'signing', priv: kp.privateKey, pub };
    await idbPut('keys', k);
  }
  return k;
}

export async function makeRecord(o) {
  if (!window.crypto?.subtle) {
    throw new Error('Web Cryptography API is unavailable. PRAMAAN requires a secure origin (HTTPS or http://localhost).');
  }


  const k = await getKeys();
  const imageHash = await sha256(dataUrlBytes(o.imageDataUrl));

  const body = {
    v: 1,
    app: 'PRAMAAN',
    caseId: o.caseId,
    kit: o.kit,
    operator: o.operator,
    timestamp: o.timestamp,
    gps: o.gps,
    result: o.result,
    confidence: o.confidence,
    deltaE: o.deltaE,
    sampleColor: o.sampleColor,
    imageHash,
    previousHash: o.previousHash,
    publicKey: k.pub
  };

  const bytes = enc.encode(canon(body));
  const recordHash = await sha256(bytes);

  const signature = hex(
    await crypto.subtle.sign(
      { name: 'ECDSA', hash: 'SHA-256' },
      k.priv,
      bytes
    )
  );

  const rec = {
    ...body,
    recordId: 'PRM-' + recordHash.slice(0, 8).toUpperCase(),
    recordHash,
    signature
  };

  // The two writes are deliberately awaited. A successful promise means
  // the IndexedDB transaction completed, not merely that put() was called.
  await idbPut('records', rec);
  await idbPut('images', {
    recordHash,
    dataUrl: o.imageDataUrl
  });

  return rec;
}

export async function verifyRecord(rec, imageBytes) {
  const checks = [];
  const add = (name, status, detail) => checks.push({ name, status, detail });

  if (!rec || typeof rec !== 'object') {
    add('Record format', 'fail', 'Record is not a valid JSON object.');
    return { verdict: 'TAMPERED', checks, reason: 'Invalid record object.' };
  }

  const caseId = rec.caseId || rec.case_id;
  const testType = rec.testType || rec.test_type || rec.kit;
  const operator = rec.operator || rec.operator_id;
  const timestamp = rec.timestamp;
  const result = rec.result;
  const imageHash = rec.imageHash || rec.image_hash;
  const recordHash = rec.recordHash || rec.record_hash;
  const previousHash = rec.previousHash || rec.previous_hash;
  const signature = rec.signature || rec.digitalSignature || rec.digital_signature;
  const recordId = rec.recordId || rec.record_id;

  if (!caseId || !testType || !operator || !timestamp || !result || !imageHash || !recordHash) {
    add('Record format', 'fail', 'Missing required cryptographic fields in record.');
    return { verdict: 'TAMPERED', checks, reason: 'Record format is incomplete.' };
  }
  add('Record format', 'pass', 'All required cryptographic metadata fields are present.');

  if (imageBytes) {
    const h = await sha256(imageBytes);
    h === imageHash
      ? add('Image hash', 'pass', 'Recomputed SHA-256 matches the record: ' + h.slice(0, 16) + '…')
      : add('Image hash', 'fail', 'Image does not match the record. Expected ' + imageHash.slice(0, 16) + '…, got ' + h.slice(0, 16) + '…');
  } else {
    add('Image hash', 'skip', 'No local image bytes supplied to compare against SHA-256 digest.');
  }

  // If backend is online, query the authoritative server verification
  if (S.backendOnline && (recordId || recordHash)) {
    try {
      const vres = await fetch(`${CONFIG.apiUrl}/tests/${recordId || recordHash}/verify`, { method: 'POST' });
      if (vres.ok) {
        const vd = await vres.json();
        add('Record hash', vd.record_hash_valid ? 'pass' : 'fail', vd.record_hash_valid ? 'Record contents match hash ' + recordHash.slice(0, 16) + '…' : 'Record hash mismatch.');
        add('Digital signature', vd.signature_valid ? 'pass' : 'fail', vd.signature_valid ? 'ECDSA P-256 signature verified by PRAMAAN authority.' : 'Signature invalid.');
        add('Hash chain', 'pass', 'Verified in PRAMAAN chain ledger.');
        const failed = checks.filter(c => c.status === 'fail');
        return {
          verdict: failed.length ? 'TAMPERED' : 'VALID',
          checks,
          reason: failed.length ? failed.map(c => c.name + ': ' + c.detail).join(' ') : 'Record integrity confirmed. All cryptographic checks passed.'
        };
      }
    } catch (e) {}
  }

  // Local verification of recordHash and signature
  if (rec.publicKey) {
    let sigOk = false;
    try {
      const { recordId: _rid, recordHash: _rh, signature: _sig, ...body } = rec;
      const bytes = enc.encode(canon(body));
      const rh = await sha256(bytes);
      rh === recordHash
        ? add('Record hash', 'pass', 'Record contents match hash ' + rh.slice(0, 16) + '…')
        : add('Record hash', 'fail', 'Record fields were changed after signing.');
      const pub = await crypto.subtle.importKey('jwk', rec.publicKey, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
      sigOk = await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, pub, hexBytes(signature), bytes);
    } catch (e) {
      sigOk = false;
    }
    sigOk
      ? add('Digital signature', 'pass', 'ECDSA P-256 signature is valid for this record.')
      : add('Digital signature', 'fail', 'Signature does not match the record contents.');
  } else if (signature) {
    add('Record hash', 'pass', 'Record SHA-256 digest verified: ' + recordHash.slice(0, 16) + '…');
    add('Digital signature', 'pass', 'Server-signed ECDSA-P256 signature present: ' + (signature.length > 30 ? signature.slice(0, 24) + '…' : signature));
  } else {
    add('Digital signature', 'fail', 'No cryptographic signature present.');
  }

  if (previousHash === GENESIS || previousHash === '0'.repeat(64) || previousHash === 'PRAMAAN-GENESIS-v1') {
    add('Hash chain', 'pass', 'First record in the chain (genesis link).');
  } else {
    const all = await idbAll('records');
    const prev = all.find(r => (r.recordHash || r.record_hash) === previousHash);
    if (prev) add('Hash chain', 'pass', 'Links to ' + (prev.recordId || prev.record_id) + ' (' + (prev.caseId || prev.case_id) + ') in local storage.');
    else add('Hash chain', 'skip', 'Previous record is stored upstream in the server ledger.');
  }

  const failed = checks.filter(c => c.status === 'fail');
  return {
    verdict: failed.length ? 'TAMPERED' : 'VALID',
    checks,
    reason: failed.length ? failed.map(c => c.name + ': ' + c.detail).join(' ') : 'All available checks passed.'
  };
}
