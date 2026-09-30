/* ==========================================================================
   PRAMAAN View Component — Topbar Header
   ========================================================================== */

import { S } from '../state.js';
import { ic } from '../icons.js';
import { esc } from '../utils.js';

export function topbar() {
  const u = S.user;
  if (!u) return '';

  return `<header class="topbar"><div class="wrap">
    <div class="brand" data-act="nav" data-to="home" style="cursor:pointer" title="PRAMAAN Home">
      <img src="PRAMAAN%20Logo.png" alt="PRAMAAN Logo" class="brand-logo">
      <div class="brand-info">
        <div class="brand-title">
          <span>PRAMAAN</span>
          <span class="prototype-badge">Prototype</span>
        </div>
        <div class="brand-sub">Presumptive Result Authentication &amp; Metadata Assurance Network</div>
      </div>
    </div><div class="spacer"></div>

    <div class="net ${S.online ? '' : 'off'}">${ic(S.online ? 'wifi' : 'wifiOff', 'style="width:16px;height:16px"')}${S.online ? 'Online' : 'Offline'}</div>
    <div class="net ${S.backendOnline ? '' : 'off'}" title="PRAMAAN API">${ic(S.backendOnline ? 'ok' : 'alert', 'style="width:16px;height:16px"')}${S.backendOnline ? 'API' : 'API offline'}</div>
    <div class="who">${esc(u.name || u.operator_id || u.id)}<br><span class="role">${esc(u.role || 'Officer')}</span></div>
    <button class="iconbtn" data-act="logout" aria-label="Log out">${ic('logout')}</button>
  </div></header>`;
}

export function pageHead(title, sub) {
  return `<div class="pagehead"><div class="wrap">
    <button class="iconbtn" data-act="nav" data-to="home" aria-label="Back">${ic('back')}</button>
    <div><h1>${title}</h1>${sub ? `<p>${sub}</p>` : ''}</div></div></div>`;
}
