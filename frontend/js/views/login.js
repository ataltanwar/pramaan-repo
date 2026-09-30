/* ==========================================================================
   PRAMAAN View — Login
   ========================================================================== */

import { S } from '../state.js';
import { esc } from '../utils.js';

export function chakra() {
  let s = '';
  for (let i = 0; i < 24; i++) {
    const a = i * 15 * Math.PI / 180;
    s += `<line x1="100" y1="100" x2="${100 + 90 * Math.cos(a)}" y2="${100 + 90 * Math.sin(a)}"/>`;
  }
  return `<svg class="chakra" viewBox="0 0 200 200" fill="none" stroke="#fff" stroke-width="2"><circle cx="100" cy="100" r="92"/><circle cx="100" cy="100" r="14"/>${s}</svg>`;
}

export function vLogin() {
  return `<div class="login">
    ${chakra()}
    <div class="main">
      <div class="logo"><img src="PRAMAAN%20Logo.png" alt="PRAMAAN Logo" class="login-logo"></div>
      <h1>PRAMAAN</h1>
      <p class="tag2">Digital Companion for Field Drug Testing</p>
      <div class="form">
        ${S.err ? `<div class="err" role="alert">${esc(S.err)}</div>` : ''}
        <label for="opid">OPERATOR ID</label>
        <input id="opid" class="field mono" placeholder="e.g. NCB/FO/2026/001" autocomplete="username" autocapitalize="characters">
        <label for="pin">PIN</label>
        <input id="pin" class="field mono" type="password" inputmode="numeric" placeholder="••••••" autocomplete="current-password">
        <button class="btn primary" data-act="login">Login</button>
        <button class="btn ghost" data-act="demo">Demo Mode</button>
        <p class="hint">Prototype logins: NCB/FO/2026/001 / 123456 (Field Officer) · NCB/SUP/2026/001 / 654321 (Supervisor)</p>
      </div>
    </div>
    <div class="foot">Smart India Hackathon 2026 | MHA – NCB<br><span class="mono">PRAMAAN v2.0.0</span></div>
  </div>`;
}
