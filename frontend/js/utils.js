/* ==========================================================================
   PRAMAAN Utility Functions & Formatters
   ========================================================================== */

export const $ = s => document.querySelector(s);

export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;'
}[c]));

export const hex = buf => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');

export const hexBytes = h => new Uint8Array(h.match(/.{1,2}/g).map(b => parseInt(b, 16)));

export const sha256 = async bytes => hex(await crypto.subtle.digest('SHA-256', bytes));

export function sortKeys(v) {
  if (Array.isArray(v)) return v.map(sortKeys);
  if (v && typeof v === 'object') {
    return Object.keys(v).sort().reduce((a, k) => {
      a[k] = sortKeys(v[k]);
      return a;
    }, {});
  }
  return v;
}

export const canon = o => JSON.stringify(sortKeys(o));

export function dataUrlBytes(u) {
  const b = atob(u.split(',')[1]);
  const a = new Uint8Array(b.length);
  for (let i = 0; i < b.length; i++) a[i] = b.charCodeAt(i);
  return a;
}

export async function dataUrlToBlob(dataUrl) {
  const response = await fetch(dataUrl);
  return response.blob();
}

export function fileToDataUrl(file) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result);
    r.onerror = () => rej(r.error);
    r.readAsDataURL(file);
  });
}

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const p2 = n => String(n).padStart(2, '0');

export function fmtHome(iso) {
  const d = new Date(iso);
  return `${d.getDate()} ${MON[d.getMonth()]} ${d.getFullYear()}, ${p2(d.getHours())}:${p2(d.getMinutes())}`;
}

export function fmtLog(iso) {
  const d = new Date(iso);
  let h = d.getHours();
  const ap = h >= 12 ? 'pm' : 'am';
  h = h % 12 || 12;
  return `${d.getDate()} ${d.getMonth() === 8 ? 'Sept' : MON[d.getMonth()]} ${d.getFullYear()} · ${p2(h)}:${p2(d.getMinutes())} ${ap}`;
}

export function saveBlob(name, blob) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1500);
}

export function printHtml(html) {
  const f = document.createElement('iframe');
  f.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0';
  document.body.appendChild(f);
  f.contentDocument.open();
  f.contentDocument.write(html);
  f.contentDocument.close();
  setTimeout(() => {
    f.contentWindow.focus();
    f.contentWindow.print();
    setTimeout(() => f.remove(), 3000);
  }, 400);
}

export function qrSvg(text) {
  try {
    if (typeof window.qrcode === 'function') {
      const q = window.qrcode(0, 'L');
      q.addData(text);
      q.make();
      return q.createSvgTag({ cellSize: 4, margin: 0, scalable: true });
    }
    return '<div style="color:#000;font-size:12px;padding:8px">QR library unavailable</div>';
  } catch (e) {
    return '<div style="color:#000;font-size:12px;padding:8px">QR too large or library unavailable</div>';
  }
}

export function parseJson(text) {
  try {
    let o = JSON.parse(text);
    if (Array.isArray(o)) {
      if (o.length !== 1) throw new Error('This file has ' + o.length + ' records. Export a single record to verify it.');
      o = o[0];
    }
    return o;
  } catch (e) {
    return null;
  }
}

export function sampleImage(color, ref) {
  const c = document.createElement('canvas');
  c.width = 480;
  c.height = 360;
  const g = c.getContext('2d');
  g.fillStyle = '#cbd5e1';
  g.fillRect(0, 0, 480, 360);

  // Test Cassette Body
  g.fillStyle = '#f8fafc';
  g.strokeStyle = '#94a3b8';
  g.lineWidth = 2;
  g.beginPath();
  if (g.roundRect) g.roundRect(130, 20, 220, 195, 14);
  else g.rect(130, 20, 220, 195);
  g.fill();
  g.stroke();

  // Well border & Reaction well
  g.fillStyle = '#e2e8f0';
  g.beginPath();
  g.arc(240, 110, 68, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = color;
  g.beginPath();
  g.arc(240, 110, 56, 0, Math.PI * 2);
  g.fill();

  // Cassette label
  g.fillStyle = '#1e3a5f';
  g.font = 'bold 11px monospace';
  g.textAlign = 'center';
  g.fillText(ref.toUpperCase(), 240, 198);

  // Official 6-Patch Reference Colour Card at bottom (Lighting calibration)
  g.fillStyle = '#0f172a';
  g.beginPath();
  if (g.roundRect) g.roundRect(30, 232, 420, 105, 12);
  else g.rect(30, 232, 420, 105);
  g.fill();

  g.fillStyle = '#94a3b8';
  g.font = 'bold 10px sans-serif';
  g.textAlign = 'left';
  g.fillText('OFFICIAL 6-PATCH REFERENCE CARD — LIGHTING CALIBRATION', 42, 249);

  const patches = ['#ffffff', '#808080', '#c0392b', '#2e86c1', '#f1c40f', '#27ae60'];
  const labels = ['WHT', 'GRY', 'RED', 'BLU', 'YEL', 'GRN'];
  patches.forEach((p, i) => {
    const px = 42 + i * 66;
    g.fillStyle = p;
    g.fillRect(px, 258, 60, 65);
    g.strokeStyle = '#334155';
    g.lineWidth = 1;
    g.strokeRect(px, 258, 60, 65);
    g.fillStyle = i === 0 || i === 4 ? '#000' : '#fff';
    g.font = 'bold 9px monospace';
    g.textAlign = 'center';
    g.fillText(labels[i], px + 30, 296);
  });

  return c.toDataURL('image/png');
}

export function showToast(message, type = 'success') {
  const toast = document.createElement('div');
  const isErr = type === 'error';
  toast.className = 'err';
  toast.style.cssText = `position:fixed;bottom:24px;left:50%;transform:translateX(-50%);z-index:9999;background:${isErr ? 'rgba(239,68,68,.95)' : 'rgba(20,184,166,.95)'};border:1px solid ${isErr ? '#ef4444' : '#14b8a6'};color:#fff;padding:12px 22px;border-radius:12px;font-weight:700;box-shadow:0 6px 20px rgba(0,0,0,.45);font-size:15px`;
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 2500);
}
