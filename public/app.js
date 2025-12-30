// Customer Care PWA - client-side only
// Excel parsing via SheetJS (xlsx). Data stays local (no upload).

import * as XLSX from 'xlsx';
import QRCode from 'qrcode';

const el = {
  // Auth
  userSelect: document.getElementById('userSelect'),
  username: document.getElementById('username'),
  pin: document.getElementById('pin'),
  loginBtn: document.getElementById('loginBtn'),
  bootstrapAdminBtn: document.getElementById('bootstrapAdminBtn'),
  authCard: document.getElementById('authCard'),
  activeUser: document.getElementById('activeUser'),
  routeTitleCard: document.getElementById('routeTitleCard'),
  routeTitle: document.getElementById('routeTitle'),

  // Navigation
  navItems: Array.from(document.querySelectorAll('.nav-item')),

  // Clients
  viewClients: document.getElementById('view-clients'),
  clientsTable: document.getElementById('clientsTable'),
  clientSearch: document.getElementById('clientSearch'),
  newClientBtn: document.getElementById('newClientBtn'),

  // Appointments
  apptScope: document.getElementById('apptScope'),
  apptSearch: document.getElementById('apptSearch'),
  newApptBtn: document.getElementById('newApptBtn'),
  apptsTable: document.getElementById('apptsTable'),

  // Interactions
  intScope: document.getElementById('intScope'),
  intSearch: document.getElementById('intSearch'),
  newIntBtn: document.getElementById('newIntBtn'),
  intsTable: document.getElementById('intsTable'),

  // Insights
  insScope: document.getElementById('insScope'),
  insSearch: document.getElementById('insSearch'),
  insightsTable: document.getElementById('insightsTable'),

  // Other views
  viewAppointments: document.getElementById('view-appointments'),
  viewInteractions: document.getElementById('view-interactions'),
  viewInsights: document.getElementById('view-insights'),
  viewSettings: document.getElementById('view-settings'),

  // Settings
  exportBtn: document.getElementById('exportBtn'),
  importInput: document.getElementById('importInput'),
  resetBtn: document.getElementById('resetBtn'),

  // Share backup
  shareMyBackupBtn: document.getElementById('shareMyBackupBtn'),
  shareAllBackupBtn: document.getElementById('shareAllBackupBtn'),
  backupEmailTo: document.getElementById('backupEmailTo'),

  // Sync PC ↔ Telefono (QR)
  qrSyncExportMyBtn: document.getElementById('qrSyncExportMyBtn'),
  qrSyncExportAllBtn: document.getElementById('qrSyncExportAllBtn'),
  qrSyncStatus: document.getElementById('qrSyncStatus'),
  qrSyncCanvas: document.getElementById('qrSyncCanvas'),
  qrSyncChunkLabel: document.getElementById('qrSyncChunkLabel'),
  qrSyncPrevBtn: document.getElementById('qrSyncPrevBtn'),
  qrSyncNextBtn: document.getElementById('qrSyncNextBtn'),
  qrSyncCopyChunkBtn: document.getElementById('qrSyncCopyChunkBtn'),
  qrSyncScanStartBtn: document.getElementById('qrSyncScanStartBtn'),
  qrSyncScanStopBtn: document.getElementById('qrSyncScanStopBtn'),
  qrSyncVideo: document.getElementById('qrSyncVideo'),
  qrSyncPaste: document.getElementById('qrSyncPaste'),
  qrSyncAddChunkBtn: document.getElementById('qrSyncAddChunkBtn'),

  // Admin user management (Settings)
  adminUsersPanel: document.getElementById('adminUsersPanel'),
  usersTable: document.getElementById('usersTable'),
  impersonateSelect: document.getElementById('impersonateSelect'),
  stopImpersonateBtn: document.getElementById('stopImpersonateBtn'),
  newUserName: document.getElementById('newUserName'),
  newUserRole: document.getElementById('newUserRole'),
  newUserPin: document.getElementById('newUserPin'),
  createUserBtn: document.getElementById('createUserBtn'),

  // Shared users directory (org-mode)
  orgUsersImportInput: document.getElementById('orgUsersImportInput'),
  orgUsersImportAuthInput: document.getElementById('orgUsersImportAuthInput'),
  orgUsersExportBtn: document.getElementById('orgUsersExportBtn'),
  orgUsersStatus: document.getElementById('orgUsersStatus'),
  orgMasterPin: document.getElementById('orgMasterPin'),
  orgSetMasterBtn: document.getElementById('orgSetMasterBtn'),

  // Legacy Excel import (inside Settings)
  fileInput: document.getElementById('fileInput'),
  dropzone: document.getElementById('dropzone'),
  sheetSelect: document.getElementById('sheetSelect'),
  searchInput: document.getElementById('searchInput'),
  downloadCsvBtn: document.getElementById('downloadCsvBtn'),
  status: document.getElementById('status'),
  table: document.getElementById('table'),
  thead: document.querySelector('#table thead'),
  tbody: document.querySelector('#table tbody'),
  count: document.getElementById('count'),
  reloadBtn: document.getElementById('reloadBtn'),
  installBtn: document.getElementById('installBtn')
};

function setStatus(message, tone = 'muted') {
  el.status.className = `status ${tone}`;
  el.status.textContent = message;
}

function setQrSyncStatus(message) {
  if (!el.qrSyncStatus) return;
  el.qrSyncStatus.value = message;
}

// -----------------------------
// QR Sync (PC ↔ Telefono) — chunked QR export/import
// -----------------------------

const QR_SYNC_PREFIX = 'CCSYNC1|';
// Conservative chunk size to make scanning reliable.
const QR_SYNC_CHUNK_SIZE = 900;

let qrSyncExportChunks = [];
let qrSyncExportIndex = 0;

let qrSyncScanStream = null;
let qrSyncScanTimer = null;
let qrSyncScanned = { total: 0, parts: new Map() };

function base64EncodeUtf8(str) {
  return btoa(unescape(encodeURIComponent(str)));
}

function base64DecodeUtf8(b64) {
  return decodeURIComponent(escape(atob(b64)));
}

function chunkString(s, size) {
  const out = [];
  for (let i = 0; i < s.length; i += size) out.push(s.slice(i, i + size));
  return out;
}

function makeQrChunkEnvelope(payloadStr, idx, total) {
  const b64 = base64EncodeUtf8(payloadStr);
  return `${QR_SYNC_PREFIX}${idx}/${total}|${b64}`;
}

function parseQrChunkEnvelope(text) {
  const t = String(text ?? '').trim();
  if (!t.startsWith(QR_SYNC_PREFIX)) return null;
  const rest = t.slice(QR_SYNC_PREFIX.length);
  const pipe = rest.indexOf('|');
  if (pipe < 0) return null;
  const header = rest.slice(0, pipe);
  const b64 = rest.slice(pipe + 1);
  const slash = header.indexOf('/');
  if (slash < 0) return null;
  const idx = Number(header.slice(0, slash));
  const total = Number(header.slice(slash + 1));
  if (!Number.isFinite(idx) || !Number.isFinite(total) || idx < 1 || total < 1 || idx > total) return null;
  const payloadStr = base64DecodeUtf8(b64);
  return { idx, total, payloadStr };
}

async function renderQrToCanvas(text) {
  if (!el.qrSyncCanvas) return;
  await QRCode.toCanvas(el.qrSyncCanvas, text, {
    errorCorrectionLevel: 'M',
    margin: 1,
    scale: 6,
    color: { dark: '#0b1220', light: '#ffffff' }
  });
}

async function showExportChunk(i) {
  if (!qrSyncExportChunks.length) {
    setQrSyncStatus('Nessun QR generato');
    return;
  }
  qrSyncExportIndex = Math.max(0, Math.min(i, qrSyncExportChunks.length - 1));
  const label = `${qrSyncExportIndex + 1}/${qrSyncExportChunks.length}`;
  if (el.qrSyncChunkLabel) el.qrSyncChunkLabel.textContent = `Blocco ${label}`;
  if (el.qrSyncPrevBtn) el.qrSyncPrevBtn.disabled = qrSyncExportIndex === 0;
  if (el.qrSyncNextBtn) el.qrSyncNextBtn.disabled = qrSyncExportIndex === qrSyncExportChunks.length - 1;
  if (el.qrSyncCopyChunkBtn) el.qrSyncCopyChunkBtn.disabled = false;
  setQrSyncStatus(`QR pronto: blocco ${label}`);
  await renderQrToCanvas(qrSyncExportChunks[qrSyncExportIndex]);
}

function resetScanBuffer() {
  qrSyncScanned = { total: 0, parts: new Map() };
}

function getScanProgressText() {
  const total = qrSyncScanned.total;
  const got = qrSyncScanned.parts.size;
  if (!total) return `Ricevuti: ${got} blocchi`;
  return `Ricevuti: ${got}/${total}`;
}

function addScannedChunk(rawText) {
  const parsed = parseQrChunkEnvelope(rawText);
  if (!parsed) {
    setQrSyncStatus('QR non riconosciuto');
    return;
  }
  if (!qrSyncScanned.total) qrSyncScanned.total = parsed.total;
  if (qrSyncScanned.total !== parsed.total) {
    setQrSyncStatus('Blocchi incompatibili (totale diverso). Ricomincia.');
    return;
  }
  if (!qrSyncScanned.parts.has(parsed.idx)) {
    qrSyncScanned.parts.set(parsed.idx, parsed.payloadStr);
  }
  setQrSyncStatus(getScanProgressText());
}

function tryAssembleScannedPayload() {
  const total = qrSyncScanned.total;
  if (!total) return null;
  if (qrSyncScanned.parts.size !== total) return null;
  return Array.from({ length: total }, (_, i) => qrSyncScanned.parts.get(i + 1)).join('');
}

function buildQrExportChunksFromPayload(payload) {
  const json = JSON.stringify(payload);
  const parts = chunkString(json, QR_SYNC_CHUNK_SIZE);
  const total = parts.length;
  return parts.map((p, i) => makeQrChunkEnvelope(p, i + 1, total));
}

async function startQrScan() {
  if (!el.qrSyncVideo) return;
  resetScanBuffer();
  setQrSyncStatus('Avvio fotocamera…');

  if (typeof window.BarcodeDetector === 'undefined') {
    setQrSyncStatus('Scanner non disponibile su questo dispositivo. Usa “Incolla blocco”.');
    return;
  }

  const detector = new window.BarcodeDetector({ formats: ['qr_code'] });
  qrSyncScanStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
  el.qrSyncVideo.srcObject = qrSyncScanStream;
  el.qrSyncVideo.style.display = '';
  await el.qrSyncVideo.play();

  if (el.qrSyncScanStartBtn) el.qrSyncScanStartBtn.disabled = true;
  if (el.qrSyncScanStopBtn) el.qrSyncScanStopBtn.disabled = false;
  setQrSyncStatus('Inquadra il QR…');

  qrSyncScanTimer = setInterval(async () => {
    try {
      const barcodes = await detector.detect(el.qrSyncVideo);
      if (!barcodes?.length) return;
      for (const b of barcodes) {
        if (b?.rawValue) addScannedChunk(b.rawValue);
      }
      const assembled = tryAssembleScannedPayload();
      if (assembled) {
        stopQrScan();
        await importQrPayloadString(assembled);
      }
    } catch {
      // ignore per-frame errors
    }
  }, 350);
}

function stopQrScan() {
  if (qrSyncScanTimer) {
    clearInterval(qrSyncScanTimer);
    qrSyncScanTimer = null;
  }
  if (qrSyncScanStream) {
    for (const t of qrSyncScanStream.getTracks()) t.stop();
    qrSyncScanStream = null;
  }
  if (el.qrSyncVideo) {
    el.qrSyncVideo.pause?.();
    el.qrSyncVideo.srcObject = null;
    el.qrSyncVideo.style.display = 'none';
  }
  if (el.qrSyncScanStartBtn) el.qrSyncScanStartBtn.disabled = false;
  if (el.qrSyncScanStopBtn) el.qrSyncScanStopBtn.disabled = true;
}

async function exportQrMyBackup() {
  if (!isLoggedIn()) {
    setQrSyncStatus('Fai login prima di esportare');
    return;
  }
  const payload = {
    schema: 'cc-backup',
    kind: 'single-user',
    user: activeUser,
    users: ensureUsersInvariant(loadUsers()),
    db: loadDb(activeUser),
    createdAt: nowIso()
  };
  qrSyncExportChunks = buildQrExportChunksFromPayload(payload);
  await showExportChunk(0);
}

async function exportQrAllBackup() {
  if (!isLoggedIn() || !isAdmin()) {
    setQrSyncStatus('Solo Admin');
    return;
  }
  const users = ensureUsersInvariant(loadUsers());
  const all = {};
  for (const u of users) all[u.username] = loadDb(u.username);
  const payload = {
    schema: 'cc-backup',
    kind: 'all-users',
    user: activeUser,
    users,
    all,
    createdAt: nowIso()
  };
  qrSyncExportChunks = buildQrExportChunksFromPayload(payload);
  await showExportChunk(0);
}

async function importQrPayloadString(payloadStr) {
  const payload = JSON.parse(payloadStr);
  if (payload?.schema !== 'cc-backup') throw new Error('Schema non riconosciuto');

  if (payload?.kind === 'all-users' && payload?.all) {
    const users = Array.isArray(payload?.users) ? ensureUsersInvariant(payload.users) : [];
    saveUsers(users);
    for (const [u, userDb] of Object.entries(payload.all)) {
      const username = normalizeUser(u);
      if (!username) continue;
      localStorage.setItem(userKey(username), JSON.stringify(userDb ?? defaultDb()));
    }
    if (activeUser) {
      state.db = loadDb(activeUser);
      renderRoute();
    }
    refreshUserSelect();
    setQrSyncStatus('Import completato ✅ (tutti)');
    setStatus('Sync QR completata: importati tutti gli utenti.', 'ok');
    return;
  }

  // single-user
  const targetUser = normalizeUser(payload?.user);
  if (!targetUser) throw new Error('Backup senza utente');
  localStorage.setItem(userKey(targetUser), JSON.stringify(payload?.db ?? defaultDb()));
  if (payload?.users && Array.isArray(payload.users)) {
    try {
      saveUsers(ensureUsersInvariant(payload.users));
    } catch {
      // ignore
    }
  }
  if (activeUser === targetUser) {
    state.db = loadDb(activeUser);
    renderRoute();
  }
  refreshUserSelect();
  setQrSyncStatus('Import completato ✅');
  setStatus('Sync QR completata: dati importati.', 'ok');
}

function setOrgStatus() {
  if (!el.orgUsersStatus) return;
  const org = loadOrgUsersState();
  const master = loadOrgMaster();
  if (!org.enabled) {
    el.orgUsersStatus.value = 'Directory condivisa: disattiva (usa solo utenti locali)';
    return;
  }
  const usersCount = (org.users ?? []).length;
  const upd = org.updatedAt ? new Date(org.updatedAt).toLocaleString() : 'n/d';
  const masterTxt = master.enabled ? 'PC master: SI' : 'PC master: NO (sola lettura)';
  el.orgUsersStatus.value = `Directory condivisa: attiva • utenti: ${usersCount} • aggiornamento: ${upd} • ${masterTxt}`;
}

function setAdminControlsEnabled(enabled) {
  // Hide/disable admin-only destructive controls when in org-mode and not master.
  const disable = !enabled;
  if (el.bootstrapAdminBtn) el.bootstrapAdminBtn.disabled = disable;
  if (el.createUserBtn) el.createUserBtn.disabled = disable;
  if (el.newUserName) el.newUserName.disabled = disable;
  if (el.newUserRole) el.newUserRole.disabled = disable;
  if (el.newUserPin) el.newUserPin.disabled = disable;
  if (el.impersonateSelect) el.impersonateSelect.disabled = disable;
  if (el.stopImpersonateBtn) el.stopImpersonateBtn.disabled = disable;
  if (el.shareAllBackupBtn) el.shareAllBackupBtn.disabled = disable;
  if (el.orgUsersExportBtn) el.orgUsersExportBtn.disabled = disable;
  if (el.orgSetMasterBtn) el.orgSetMasterBtn.disabled = disable;
  if (el.orgMasterPin) el.orgMasterPin.disabled = disable;
}

async function verifyPinAgainstRecord(username, pin, record) {
  const provided = String(pin ?? '').trim();
  const requiredHash = record?.pinHash ?? null;
  if (!requiredHash) {
    // Backward compat: if no pinHash exists, allow empty pin.
    return provided.length === 0;
  }
  if (!provided) return false;
  const computed = await sha256Hex(`${normalizeUser(username)}:${provided}`);
  return constantTimeEqual(computed, requiredHash);
}

function refreshOrgModeUi() {
  setOrgStatus();
  // If org-mode is enabled and this device is not master, lock user management.
  setAdminControlsEnabled(canManageUsers());
}

// PWA install prompt
let deferredPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  el.installBtn.hidden = false;
});

el.installBtn?.addEventListener('click', async () => {
  if (!deferredPrompt) return;
  deferredPrompt.prompt();
  await deferredPrompt.userChoice;
  deferredPrompt = null;
  el.installBtn.hidden = true;
});

// Register service worker
if ('serviceWorker' in navigator) {
  window.addEventListener('load', async () => {
    try {
      // On GitHub Pages, a stale SW cache is the #1 reason for "works but without styles"
      // (old HTML points to deleted hashed assets => 404).
      // We keep SW for LAN/offline installs, but disable it on github.io.
      const host = String(window.location.hostname || '').toLowerCase();
      const isGitHubPages = host.endsWith('github.io');
      if (isGitHubPages) return;

      await navigator.serviceWorker.register('./sw.js');
    } catch {
      // ignore
    }
  });
}

// -----------------------------
// Mini-CRM model + storage
// -----------------------------

/**
 * Contract dati (versione 1)
 * - user: string
 * - customers: array di customer
 * - appointments/interactions: next step
 */
const STORAGE_PREFIX = 'cc.crm.v1.';
const USERS_KEY = `${STORAGE_PREFIX}users`;
const ORG_USERS_KEY = `${STORAGE_PREFIX}orgUsers`;
const ORG_MASTER_KEY = `${STORAGE_PREFIX}orgMaster`;

function normalizeUser(u) {
  return String(u ?? '').trim().toLowerCase();
}

function userKey(user) {
  return `${STORAGE_PREFIX}${user}`;
}

function loadUsers() {
  const raw = localStorage.getItem(USERS_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function loadOrgUsersState() {
  const raw = localStorage.getItem(ORG_USERS_KEY);
  if (!raw) return { enabled: false, users: [], updatedAt: null };
  try {
    const parsed = JSON.parse(raw);
    return {
      enabled: !!parsed?.enabled,
      updatedAt: parsed?.updatedAt ?? null,
      // users: [{ username, role, pinHash, createdAt }]
      users: Array.isArray(parsed?.users) ? parsed.users : []
    };
  } catch {
    return { enabled: false, users: [], updatedAt: null };
  }
}

function saveOrgUsersState(state) {
  localStorage.setItem(
    ORG_USERS_KEY,
    JSON.stringify({
      enabled: !!state?.enabled,
      updatedAt: state?.updatedAt ?? nowIso(),
      users: Array.isArray(state?.users) ? state.users : []
    })
  );
}

function loadOrgMaster() {
  const raw = localStorage.getItem(ORG_MASTER_KEY);
  if (!raw) return { enabled: false, pinHash: null, enabledAt: null };
  try {
    const parsed = JSON.parse(raw);
    return {
      enabled: !!parsed?.enabled,
      pinHash: parsed?.pinHash ?? null,
      enabledAt: parsed?.enabledAt ?? null
    };
  } catch {
    return { enabled: false, pinHash: null, enabledAt: null };
  }
}

function saveOrgMaster(master) {
  localStorage.setItem(
    ORG_MASTER_KEY,
    JSON.stringify({
      enabled: !!master?.enabled,
      pinHash: master?.pinHash ?? null,
      enabledAt: master?.enabledAt ?? nowIso()
    })
  );
}

function sha256Hex(text) {
  const enc = new TextEncoder().encode(String(text ?? ''));
  return crypto.subtle.digest('SHA-256', enc).then((buf) => {
    const bytes = new Uint8Array(buf);
    return Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  });
}

function constantTimeEqual(a, b) {
  const aa = String(a ?? '');
  const bb = String(b ?? '');
  if (aa.length !== bb.length) return false;
  let out = 0;
  for (let i = 0; i < aa.length; i++) out |= aa.charCodeAt(i) ^ bb.charCodeAt(i);
  return out === 0;
}

function saveUsers(users) {
  localStorage.setItem(USERS_KEY, JSON.stringify(users));
}

function ensureUsersInvariant(users) {
  // Normalize and de-duplicate
  const map = new Map();
  for (const u of users ?? []) {
    const username = normalizeUser(u?.username);
    if (!username) continue;
    map.set(username, {
      username,
      role: u?.role === 'admin' ? 'admin' : 'standard',
      createdAt: u?.createdAt ?? nowIso()
    });
  }
  return Array.from(map.values()).sort((a, b) => a.username.localeCompare(b.username));
}

function ensureOrgUsersInvariant(users) {
  // Like ensureUsersInvariant, but keeps pinHash when present
  const map = new Map();
  for (const u of users ?? []) {
    const username = normalizeUser(u?.username);
    if (!username) continue;
    map.set(username, {
      username,
      role: u?.role === 'admin' ? 'admin' : 'standard',
      pinHash: u?.pinHash ?? null,
      createdAt: u?.createdAt ?? nowIso()
    });
  }
  return Array.from(map.values()).sort((a, b) => a.username.localeCompare(b.username));
}

function getUserRecord(username) {
  const users = loadUsers();
  return users.find((u) => u.username === normalizeUser(username)) ?? null;
}

function getAnyUserRecord(username) {
  const u = normalizeUser(username);
  const org = loadOrgUsersState();
  if (org.enabled) {
    const hit = (org.users ?? []).find((x) => normalizeUser(x?.username) === u);
    if (hit) return hit;
  }
  return getUserRecord(u);
}

function hasAnyAdmin() {
  return loadUsers().some((u) => u.role === 'admin');
}

function orgModeEnabled() {
  return loadOrgUsersState().enabled;
}

function isOrgMasterUnlocked() {
  const org = loadOrgUsersState();
  if (!org.enabled) return true; // if no org-mode, behave as before
  const master = loadOrgMaster();
  return !!master.enabled;
}

function canManageUsers() {
  // If org-mode is enabled, only the PC that enabled master can edit users.
  return isOrgMasterUnlocked();
}

function loadDb(user) {
  const raw = localStorage.getItem(userKey(user));
  if (!raw) {
    return {
      schemaVersion: 1,
      user,
      customers: [],
      appointments: [],
      interactions: []
    };
  }
  try {
    const parsed = JSON.parse(raw);
    return {
      schemaVersion: 1,
      user,
      customers: Array.isArray(parsed.customers) ? parsed.customers : [],
      appointments: Array.isArray(parsed.appointments) ? parsed.appointments : [],
      interactions: Array.isArray(parsed.interactions) ? parsed.interactions : []
    };
  } catch {
    return {
      schemaVersion: 1,
      user,
      customers: [],
      appointments: [],
      interactions: []
    };
  }
}

function saveDb(db) {
  localStorage.setItem(userKey(db.user), JSON.stringify(db));
}

function loadDbForUser(user) {
  return loadDb(normalizeUser(user));
}

function nowIso() {
  return new Date().toISOString();
}

function isoDate() {
  return new Date().toISOString().slice(0, 10);
}

function uid(prefix = 'id') {
  return `${prefix}_${Math.random().toString(16).slice(2)}_${Date.now().toString(16)}`;
}

// Auth state
let activeUser = null;
let db = null;
let activeRole = 'standard';

// Admin impersonation
let adminUser = null; // who logged in as admin
let effectiveUser = null; // whose dataset is currently loaded

function isLoggedIn() {
  return !!activeUser;
}

function setActiveUser(user) {
  activeUser = user;
  activeRole = getUserRecord(activeUser)?.role ?? 'standard';

  // If admin logs in, default effective dataset = admin itself
  if (activeRole === 'admin') {
    adminUser = activeUser;
    effectiveUser = activeUser;
  } else {
    adminUser = null;
    effectiveUser = activeUser;
  }

  db = loadDb(effectiveUser);
  refreshActiveUserLabel();
  el.authCard.hidden = true;
  el.routeTitleCard.hidden = false;
  // default route
  navigate('clients');
  renderClients();
  refreshAdminPanel();
  refreshSettingsControls();
}

function refreshActiveUserLabel() {
  if (!isLoggedIn()) {
    el.activeUser.textContent = '';
    return;
  }
  if (activeRole === 'admin') {
    const suffix = effectiveUser !== adminUser ? ` (admin → ${effectiveUser})` : ' (admin)';
    el.activeUser.textContent = `Utente: ${adminUser}${suffix}`;
  } else {
    el.activeUser.textContent = `Utente: ${activeUser}`;
  }
}

function isAdmin() {
  return activeRole === 'admin';
}

function setEffectiveUser(user) {
  if (!isLoggedIn() || !isAdmin()) return;
  const u = normalizeUser(user);
  if (!u) return;
  const users = ensureUsersInvariant(loadUsers());
  if (!users.some((x) => x.username === u)) {
    throw new Error('Utente non trovato');
  }
  effectiveUser = u;
  db = loadDb(effectiveUser);
  refreshActiveUserLabel();
  // refresh current view
  renderClients();
  renderAppointments();
  setStatus(`Ora stai operando sui dati di: ${effectiveUser}`);
}

function stopImpersonation() {
  if (!isLoggedIn() || !isAdmin()) return;
  effectiveUser = adminUser;
  db = loadDb(effectiveUser);
  refreshActiveUserLabel();
  renderClients();
  renderAppointments();
  setStatus('Tornato ai dati Admin.');
}

// Basic PIN storage (optional). Note: obfuscation only.
function pinKey(user) {
  return `${STORAGE_PREFIX}pin.${user}`;
}

function setUserPin(user, pin) {
  if (!pin) {
    localStorage.removeItem(pinKey(user));
    return;
  }
  // lightweight obfuscation: not cryptographic
  const b64 = btoa(unescape(encodeURIComponent(pin)));
  localStorage.setItem(pinKey(user), b64);
}

function getUserPin(user) {
  const v = localStorage.getItem(pinKey(user));
  if (!v) return null;
  try {
    return decodeURIComponent(escape(atob(v)));
  } catch {
    return null;
  }
}

function checkPin(user, pin) {
  const expected = getUserPin(user);
  if (!expected) return true; // no pin set
  return String(pin ?? '') === expected;
}

function refreshUserSelect() {
  if (!el.userSelect) return;
  // In org-mode, user list comes from a shared directory snapshot (read-only)
  if (orgModeEnabled()) {
    const org = loadOrgUsersState();
    const users = ensureOrgUsersInvariant(org.users);
    el.userSelect.innerHTML = '';
    const opt0 = document.createElement('option');
    opt0.value = '';
    opt0.textContent = users.length ? '— seleziona —' : '— nessun utente —';
    el.userSelect.appendChild(opt0);
    for (const u of users) {
      const opt = document.createElement('option');
      opt.value = u.username;
      opt.textContent = `${u.username}${u.role === 'admin' ? ' (admin)' : ''}`;
      el.userSelect.appendChild(opt);
    }
    return;
  }

  const users = ensureUsersInvariant(loadUsers());
  // Persist normalized version
  saveUsers(users);

  el.userSelect.innerHTML = '';
  const opt0 = document.createElement('option');
  opt0.value = '';
  opt0.textContent = users.length ? '— seleziona —' : '— nessun utente —';
  el.userSelect.appendChild(opt0);
  for (const u of users) {
    const opt = document.createElement('option');
    opt.value = u.username;
    opt.textContent = `${u.username}${u.role === 'admin' ? ' (admin)' : ''}`;
    el.userSelect.appendChild(opt);
  }
}

function createUser({ username, role = 'standard', pin = '' }) {
  if (orgModeEnabled() && !canManageUsers()) throw new Error('Directory condivisa attiva: utenti in sola lettura su questo PC');
  const u = normalizeUser(username);
  if (!u) throw new Error('Username vuoto');
  const users = ensureUsersInvariant(loadUsers());
  if (users.some((x) => x.username === u)) throw new Error('Utente già esistente');
  const record = { username: u, role: role === 'admin' ? 'admin' : 'standard', createdAt: nowIso() };
  users.push(record);
  saveUsers(ensureUsersInvariant(users));
  if (pin) setUserPin(u, pin);
  refreshUserSelect();
  return record;
}

function deleteUser(username) {
  if (orgModeEnabled() && !canManageUsers()) throw new Error('Directory condivisa attiva: utenti in sola lettura su questo PC');
  const u = normalizeUser(username);
  if (!u) return;
  if (u === activeUser) throw new Error('Non puoi eliminare l’utente attivo');

  const users = ensureUsersInvariant(loadUsers());
  const target = users.find((x) => x.username === u);
  if (!target) return;

  if (target.role === 'admin') {
    const remainingAdmins = users.filter((x) => x.role === 'admin' && x.username !== u);
    if (remainingAdmins.length === 0) throw new Error('Non puoi eliminare l’ultimo Admin');
  }

  saveUsers(users.filter((x) => x.username !== u));
  localStorage.removeItem(userKey(u));
  localStorage.removeItem(pinKey(u));
  refreshUserSelect();
}

function resetUserPin(username) {
  if (orgModeEnabled() && !canManageUsers()) throw new Error('Directory condivisa attiva: utenti in sola lettura su questo PC');
  const u = normalizeUser(username);
  if (!u) return;
  localStorage.removeItem(pinKey(u));
}

function refreshAdminPanel() {
  if (!el.adminUsersPanel || !el.usersTable) return;
  const visible = isLoggedIn() && isAdmin();
  el.adminUsersPanel.style.display = visible ? '' : 'none';
  if (!visible) return;

  refreshOrgModeUi();

  // Impersonation select
  if (el.impersonateSelect) {
    const users = orgModeEnabled()
      ? ensureOrgUsersInvariant(loadOrgUsersState().users)
      : ensureUsersInvariant(loadUsers());
    el.impersonateSelect.innerHTML = '';
    for (const u of users) {
      const opt = document.createElement('option');
      opt.value = u.username;
      opt.textContent = `${u.username}${u.role === 'admin' ? ' (admin)' : ''}`;
      el.impersonateSelect.appendChild(opt);
    }
    el.impersonateSelect.value = effectiveUser ?? adminUser ?? '';
  }

  const users = ensureUsersInvariant(loadUsers());
  const thead = el.usersTable.querySelector('thead');
  const tbody = el.usersTable.querySelector('tbody');
  thead.innerHTML = '';
  tbody.innerHTML = '';

  const trH = document.createElement('tr');
  ['Utente', 'Ruolo', 'Creato', 'Azioni'].forEach((h) => {
    const th = document.createElement('th');
    th.textContent = h;
    trH.appendChild(th);
  });
  thead.appendChild(trH);

  const frag = document.createDocumentFragment();
  for (const u of users) {
    const tr = document.createElement('tr');
    const tdU = document.createElement('td');
    tdU.textContent = u.username;
    tr.appendChild(tdU);

    const tdR = document.createElement('td');
    tdR.textContent = u.role;
    tr.appendChild(tdR);

    const tdC = document.createElement('td');
    tdC.textContent = u.createdAt ? new Date(u.createdAt).toLocaleString() : '';
    tr.appendChild(tdC);

    const tdA = document.createElement('td');
    const resetBtn = document.createElement('button');
    resetBtn.className = 'btn';
    resetBtn.textContent = 'Reset PIN';
    resetBtn.addEventListener('click', () => {
      if (!confirm(`Reset PIN per ${u.username}?`)) return;
      resetUserPin(u.username);
      setStatus('PIN resettato.');
    });

    const delBtn = document.createElement('button');
    delBtn.className = 'btn';
    delBtn.style.marginLeft = '8px';
    delBtn.textContent = 'Elimina';
    // don't allow deleting currently authenticated admin account
    delBtn.disabled = u.username === activeUser;
    delBtn.addEventListener('click', () => {
      if (!confirm(`Eliminare utente ${u.username}?\n(Questo cancella anche i suoi dati locali)`)) return;
      try {
        deleteUser(u.username);
        setStatus('Utente eliminato.');
        refreshAdminPanel();
      } catch (e) {
        setStatus(e?.message ?? String(e), 'muted');
      }
    });

    tdA.appendChild(resetBtn);
    tdA.appendChild(delBtn);
    tr.appendChild(tdA);
    frag.appendChild(tr);
  }
  tbody.appendChild(frag);
}
// QR sync UI wiring
el.qrSyncExportMyBtn?.addEventListener('click', () => {
  exportQrMyBackup().catch(() => setQrSyncStatus('Errore export'));
});
el.qrSyncExportAllBtn?.addEventListener('click', () => {
  exportQrAllBackup().catch(() => setQrSyncStatus('Errore export'));
});
el.qrSyncPrevBtn?.addEventListener('click', () => {
  showExportChunk(qrSyncExportIndex - 1);
});
el.qrSyncNextBtn?.addEventListener('click', () => {
  showExportChunk(qrSyncExportIndex + 1);
});
el.qrSyncCopyChunkBtn?.addEventListener('click', async () => {
  const txt = qrSyncExportChunks[qrSyncExportIndex] ?? '';
  try {
    await navigator.clipboard.writeText(txt);
    setQrSyncStatus(`Copiato: ${qrSyncExportIndex + 1}/${qrSyncExportChunks.length}`);
  } catch {
    setQrSyncStatus('Impossibile copiare (permessi)');
  }
});
el.qrSyncScanStartBtn?.addEventListener('click', () => {
  startQrScan().catch(() => setQrSyncStatus('Impossibile avviare scanner (permessi fotocamera?)'));
});
el.qrSyncScanStopBtn?.addEventListener('click', () => {
  stopQrScan();
  setQrSyncStatus('Scanner fermato');
});
el.qrSyncAddChunkBtn?.addEventListener('click', () => {
  const txt = String(el.qrSyncPaste?.value ?? '').trim();
  if (!txt) {
    setQrSyncStatus('Incolla un blocco');
    return;
  }
  const lines = txt.split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
  for (const line of lines) addScannedChunk(line);
  const assembled = tryAssembleScannedPayload();
  if (assembled) {
    importQrPayloadString(assembled).catch(() => setQrSyncStatus('Errore import'));
    resetScanBuffer();
  }
  if (el.qrSyncPaste) el.qrSyncPaste.value = '';
});

function refreshSettingsControls() {
  if (el.shareAllBackupBtn) {
    el.shareAllBackupBtn.disabled = !(isLoggedIn() && isAdmin());
  }
}

// -----------------------------
// Routing + views
// -----------------------------

const ROUTES = {
  clients: { title: 'Clienti', el: () => el.viewClients },
  appointments: { title: 'Appuntamenti', el: () => el.viewAppointments },
  interactions: { title: 'Interazioni', el: () => el.viewInteractions },
  insights: { title: 'Insight', el: () => el.viewInsights },
  settings: { title: 'Impostazioni', el: () => el.viewSettings }
};

function hideAllViews() {
  el.viewClients.hidden = true;
  el.viewAppointments.hidden = true;
  el.viewInteractions.hidden = true;
  el.viewInsights.hidden = true;
  el.viewSettings.hidden = true;
}

function navigate(route) {
  if (!isLoggedIn()) return;
  const r = ROUTES[route] ?? ROUTES.clients;
  hideAllViews();
  r.el().hidden = false;
  el.routeTitle.textContent = r.title;
  for (const b of el.navItems) {
    b.setAttribute('aria-current', b.dataset.route === route ? 'page' : 'false');
  }

  // route-specific refresh
  if (route === 'clients') renderClients();
  if (route === 'appointments') renderAppointments();
  if (route === 'interactions') renderInteractions();
  if (route === 'insights') renderInsights();
  if (route === 'settings') refreshAdminPanel();
  if (route === 'settings') refreshSettingsControls();
}

for (const b of el.navItems) {
  b.addEventListener('click', () => navigate(b.dataset.route));
}

// -----------------------------
// Customers CRUD (MVP)
// -----------------------------

let clientsSort = { key: null, dir: 'asc' };

function compareMaybeNumber(a, b) {
  const aa = String(a ?? '').trim();
  const bb = String(b ?? '').trim();
  const na = Number(aa.replace(',', '.'));
  const nb = Number(bb.replace(',', '.'));
  const isNum = !Number.isNaN(na) && !Number.isNaN(nb) && aa !== '' && bb !== '';
  if (isNum) return na - nb;
  return aa.localeCompare(bb, 'it', { sensitivity: 'base' });
}

function sortCustomers(list) {
  if (!clientsSort.key) return list;
  const dirMul = clientsSort.dir === 'desc' ? -1 : 1;
  const key = clientsSort.key;

  const getVal = (c) => {
    if (key === 'name') return c.name ?? '';
    if (key === 'contact') return [c.email, c.phone].filter(Boolean).join(' • ');
    if (key === 'status') return c.status ?? '';
    if (key === 'notes') return c.notes ?? '';
    if (key === 'createdAt') return c.createdAt ?? '';
    return '';
  };

  return list.slice().sort((a, b) => dirMul * compareMaybeNumber(getVal(a), getVal(b)));
}

function customersFiltered() {
  const q = (el.clientSearch?.value ?? '').trim().toLowerCase();
  const list = db?.customers ?? [];
  if (!q) return list;
  return list.filter((c) => {
    const hay = [c.name, c.email, c.phone, c.status, c.notes].map((x) => String(x ?? '').toLowerCase()).join(' | ');
    return hay.includes(q);
  });
}

function renderClients() {
  if (!isLoggedIn()) return;
  const columns = [
    { label: 'Nome', key: 'name', sortable: true },
    { label: 'Contatto', key: 'contact', sortable: true },
    { label: 'Stato', key: 'status', sortable: true },
    { label: 'Note', key: 'notes', sortable: true },
    { label: 'Azioni', key: null, sortable: false }
  ];

  const rows = sortCustomers(customersFiltered());

  const thead = el.clientsTable.querySelector('thead');
  const tbody = el.clientsTable.querySelector('tbody');
  thead.innerHTML = '';
  tbody.innerHTML = '';

  const trH = document.createElement('tr');
  for (const col of columns) {
    const th = document.createElement('th');
    th.textContent = col.label;
    if (col.sortable && col.key) {
      th.style.cursor = 'pointer';
      th.title = 'Clicca per ordinare';
      const isActive = clientsSort.key === col.key;
      if (isActive) {
        th.textContent = `${col.label} ${clientsSort.dir === 'asc' ? '▲' : '▼'}`;
      }
      th.addEventListener('click', () => {
        if (clientsSort.key === col.key) {
          clientsSort.dir = clientsSort.dir === 'asc' ? 'desc' : 'asc';
        } else {
          clientsSort.key = col.key;
          clientsSort.dir = 'asc';
        }
        renderClients();
      });
    }
    trH.appendChild(th);
  }
  thead.appendChild(trH);

  const frag = document.createDocumentFragment();
  for (const c of rows) {
    const tr = document.createElement('tr');
    const tdName = document.createElement('td');
    tdName.textContent = c.name ?? '';
    tr.appendChild(tdName);

    const tdContact = document.createElement('td');
    tdContact.textContent = [c.email, c.phone].filter(Boolean).join(' • ');
    tr.appendChild(tdContact);

    const tdStatus = document.createElement('td');
    tdStatus.textContent = c.status ?? '';
    tr.appendChild(tdStatus);

    const tdNotes = document.createElement('td');
    tdNotes.textContent = (c.notes ?? '').slice(0, 140);
    tr.appendChild(tdNotes);

    const tdActions = document.createElement('td');
    const editBtn = document.createElement('button');
    editBtn.className = 'btn';
    editBtn.textContent = 'Modifica';
    editBtn.addEventListener('click', () => editCustomer(c.id));
    const delBtn = document.createElement('button');
    delBtn.className = 'btn';
    delBtn.style.marginLeft = '8px';
    delBtn.textContent = 'Elimina';
    delBtn.addEventListener('click', () => deleteCustomer(c.id));
    tdActions.appendChild(editBtn);
    tdActions.appendChild(delBtn);
    tr.appendChild(tdActions);

    frag.appendChild(tr);
  }
  tbody.appendChild(frag);
}

function createCustomer() {
  const name = prompt('Nome cliente?');
  if (!name) return;
  const email = prompt('Email (opzionale)?') ?? '';
  const phone = prompt('Telefono (opzionale)?') ?? '';
  const status = prompt('Stato commerciale (es. caldo/tiepido/freddo)?') ?? '';
  const notes = prompt('Note (opzionale)?') ?? '';

  db.customers.unshift({
    id: uid('cust'),
    name,
    email,
    phone,
    status,
    notes,
    createdAt: nowIso(),
    updatedAt: nowIso()
  });
  saveDb(db);
  renderClients();
}

function editCustomer(id) {
  const c = db.customers.find((x) => x.id === id);
  if (!c) return;
  const name = prompt('Nome cliente:', c.name ?? '') ?? c.name;
  if (!name) return;
  const email = prompt('Email:', c.email ?? '') ?? c.email;
  const phone = prompt('Telefono:', c.phone ?? '') ?? c.phone;
  const status = prompt('Stato commerciale:', c.status ?? '') ?? c.status;
  const notes = prompt('Note:', c.notes ?? '') ?? c.notes;
  Object.assign(c, { name, email, phone, status, notes, updatedAt: nowIso() });
  saveDb(db);
  renderClients();
}

function deleteCustomer(id) {
  const c = db.customers.find((x) => x.id === id);
  if (!c) return;
  if (!confirm(`Eliminare cliente "${c.name}"?`)) return;
  db.customers = db.customers.filter((x) => x.id !== id);
  // Cascade soft cleanup: remove linked appointments/interactions (MVP)
  db.appointments = (db.appointments ?? []).filter((a) => a.customerId !== id);
  db.interactions = (db.interactions ?? []).filter((i) => i.customerId !== id);
  saveDb(db);
  renderClients();
}

// -----------------------------
// Google Calendar (Option A: open prefilled event link)
// -----------------------------

function formatGoogleCalDate(iso) {
  // Google Calendar wants UTC: YYYYMMDDTHHMMSSZ
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const pad = (n) => String(n).padStart(2, '0');
  const y = d.getUTCFullYear();
  const m = pad(d.getUTCMonth() + 1);
  const day = pad(d.getUTCDate());
  const hh = pad(d.getUTCHours());
  const mm = pad(d.getUTCMinutes());
  const ss = pad(d.getUTCSeconds());
  return `${y}${m}${day}T${hh}${mm}${ss}Z`;
}

function addMinutes(iso, minutes) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  d.setMinutes(d.getMinutes() + minutes);
  return d.toISOString();
}

function buildGoogleCalendarUrlFromAppointment(appt, customer) {
  const startIso = appt?.when ?? null;
  if (!startIso) return null;
  const endIso = addMinutes(startIso, 60) ?? startIso;

  const start = formatGoogleCalDate(startIso);
  const end = formatGoogleCalDate(endIso);
  if (!start || !end) return null;

  const customerName = customer?.name ?? '';
  const titleParts = [appt?.type, customerName].filter(Boolean);
  const text = titleParts.length ? titleParts.join(' - ') : 'Appuntamento';

  const details = [
    customerName ? `Cliente: ${customerName}` : null,
    appt?.topic ? `Argomento: ${appt.topic}` : null,
    appt?.outcome ? `Esito: ${appt.outcome}` : null,
    appt?.nextActions ? `Azioni successive: ${appt.nextActions}` : null,
    appt?.notes ? `Note: ${appt.notes}` : null
  ]
    .filter(Boolean)
    .join('\n');

  const location = [customer?.email, customer?.phone].filter(Boolean).join(' • ');

  const url = new URL('https://calendar.google.com/calendar/render');
  url.searchParams.set('action', 'TEMPLATE');
  url.searchParams.set('text', text);
  url.searchParams.set('dates', `${start}/${end}`);
  if (details) url.searchParams.set('details', details);
  if (location) url.searchParams.set('location', location);
  return url.toString();
}

// -----------------------------
// Appointments (MVP)
// -----------------------------

function toLocalInputValue(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  const yyyy = d.getFullYear();
  const mm = pad(d.getMonth() + 1);
  const dd = pad(d.getDate());
  const hh = pad(d.getHours());
  const mi = pad(d.getMinutes());
  return `${yyyy}-${mm}-${dd}T${hh}:${mi}`;
}

function parseLocalInputValue(v) {
  if (!v) return null;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

async function pickDateTimeIso({ title, initialIso } = {}) {
  // Uses a native datetime-local picker when <dialog> is supported; fallback to prompt.
  const init = initialIso ? toLocalInputValue(initialIso) : toLocalInputValue(nowIso());

  if (!('HTMLDialogElement' in window)) {
    const whenStr = prompt(title || 'Data/Ora:', initialIso ? new Date(initialIso).toLocaleString() : new Date().toLocaleString());
    if (whenStr == null) return null;
    const d = new Date(whenStr);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }

  const dlg = document.createElement('dialog');
  dlg.style.maxWidth = '520px';
  dlg.style.width = 'calc(100% - 24px)';
  dlg.innerHTML = `
    <div class="cc-dialog">
      <form method="dialog" style="display:flex; flex-direction:column; gap:12px;">
        <h3 style="margin:0;">${(title || 'Seleziona data e ora').replace(/</g, '&lt;')}</h3>
        <label class="muted" for="cc-dt">Data e ora</label>
        <input id="cc-dt" class="control" type="datetime-local" required />
        <div style="display:flex; gap:10px; justify-content:flex-end;">
          <button value="cancel" class="btn">Annulla</button>
          <button value="ok" class="btn btn-primary">OK</button>
        </div>
      </form>
    </div>
  `;
  document.body.appendChild(dlg);

  const input = dlg.querySelector('#cc-dt');
  if (input) input.value = init;

  const result = await new Promise((resolve) => {
    dlg.addEventListener('close', () => resolve(dlg.returnValue), { once: true });
    dlg.showModal();
  });

  const selected = input?.value ?? '';
  dlg.remove();

  if (result !== 'ok') return null;
  return parseLocalInputValue(selected);
}

function isFuture(iso) {
  if (!iso) return false;
  return new Date(iso).getTime() >= Date.now();
}

function apptsFiltered() {
  const scope = el.apptScope?.value ?? 'future';
  const q = (el.apptSearch?.value ?? '').trim().toLowerCase();
  const list = db?.appointments ?? [];

  const scoped = list.filter((a) => {
    if (scope === 'all') return true;
    const fut = isFuture(a.when);
    return scope === 'future' ? fut : !fut;
  });

  if (!q) return scoped;
  return scoped.filter((a) => {
    const cust = db.customers.find((c) => c.id === a.customerId);
    const hay = [
      cust?.name,
      a.type,
      a.outcome,
      a.nextActions,
      a.topic,
      a.notes
    ]
      .map((x) => String(x ?? '').toLowerCase())
      .join(' | ');
    return hay.includes(q);
  });
}

function renderAppointments() {
  if (!isLoggedIn()) return;
  if (!el.apptsTable) return;

  const headers = ['Quando', 'Cliente', 'Tipo', 'Esito', 'Azioni'];
  const rows = apptsFiltered()
    .slice()
    .sort((a, b) => (a.when ?? '').localeCompare(b.when ?? ''));

  const thead = el.apptsTable.querySelector('thead');
  const tbody = el.apptsTable.querySelector('tbody');
  thead.innerHTML = '';
  tbody.innerHTML = '';

  const trH = document.createElement('tr');
  for (const h of headers) {
    const th = document.createElement('th');
    th.textContent = h;
    trH.appendChild(th);
  }
  thead.appendChild(trH);

  const frag = document.createDocumentFragment();
  for (const a of rows) {
    const tr = document.createElement('tr');
    const cust = db.customers.find((c) => c.id === a.customerId);

    const tdWhen = document.createElement('td');
    tdWhen.textContent = a.when ? new Date(a.when).toLocaleString() : '';
    tr.appendChild(tdWhen);

    const tdCust = document.createElement('td');
    tdCust.textContent = cust?.name ?? '(cliente mancante)';
    tr.appendChild(tdCust);

    const tdType = document.createElement('td');
    tdType.textContent = a.type ?? '';
    tr.appendChild(tdType);

    const tdOutcome = document.createElement('td');
    tdOutcome.textContent = a.outcome ?? '';
    tr.appendChild(tdOutcome);

    const tdActions = document.createElement('td');
    const editBtn = document.createElement('button');
    editBtn.className = 'btn';
    editBtn.textContent = 'Modifica';
    editBtn.addEventListener('click', () => editAppointment(a.id));

    const gcalBtn = document.createElement('button');
    gcalBtn.className = 'btn';
    gcalBtn.style.marginLeft = '8px';
    gcalBtn.textContent = 'Google Calendar';
    gcalBtn.title = 'Aggiungi evento a Google Calendar';
    gcalBtn.addEventListener('click', () => {
      const url = buildGoogleCalendarUrlFromAppointment(a, cust);
      if (!url) {
        setStatus('Impossibile creare il link calendario per questo appuntamento.', 'muted');
        return;
      }
      window.open(url, '_blank', 'noopener,noreferrer');
    });

    const delBtn = document.createElement('button');
    delBtn.className = 'btn';
    delBtn.style.marginLeft = '8px';
    delBtn.textContent = 'Elimina';
    delBtn.addEventListener('click', () => deleteAppointment(a.id));
    tdActions.appendChild(editBtn);
    tdActions.appendChild(gcalBtn);
    tdActions.appendChild(delBtn);
    tr.appendChild(tdActions);

    frag.appendChild(tr);
  }
  tbody.appendChild(frag);
}

function pickCustomerId(defaultId = null) {
  const customers = db.customers ?? [];
  if (customers.length === 0) {
    alert('Prima crea almeno un cliente.');
    return null;
  }

  const list = customers.map((c, idx) => `${idx + 1}) ${c.name}`).join('\n');
  const defIndex = defaultId ? Math.max(0, customers.findIndex((c) => c.id === defaultId)) : 0;
  const choice = prompt(`Seleziona cliente (numero):\n${list}`, String(defIndex + 1));
  const n = Number(choice);
  if (!Number.isFinite(n) || n < 1 || n > customers.length) return null;
  return customers[n - 1].id;
}

async function createAppointment() {
  const customerId = pickCustomerId();
  if (!customerId) return;

  // Date/time via picker (not free text)
  const parsedWhen = await pickDateTimeIso({ title: 'Data e ora appuntamento', initialIso: nowIso() });
  if (!parsedWhen) return;
  const type = prompt('Tipo (chiamata/visita/follow-up):', 'chiamata') ?? '';
  const topic = prompt('Argomento (opzionale):', '') ?? '';
  const outcome = prompt('Esito (opzionale):', '') ?? '';
  const nextActions = prompt('Azioni successive (opzionale):', '') ?? '';
  const notes = prompt('Note (opzionale):', '') ?? '';

  db.appointments.unshift({
    id: uid('appt'),
    customerId,
    when: parsedWhen,
    type,
    topic,
    outcome,
    nextActions,
    notes,
    createdAt: nowIso(),
    updatedAt: nowIso()
  });
  saveDb(db);
  renderAppointments();
}

async function editAppointment(id) {
  const a = (db.appointments ?? []).find((x) => x.id === id);
  if (!a) return;

  const customerId = pickCustomerId(a.customerId);
  if (!customerId) return;

  const parsedWhen = await pickDateTimeIso({ title: 'Data e ora appuntamento', initialIso: a.when ?? null });
  if (!parsedWhen) return;
  const type = prompt('Tipo:', a.type ?? '') ?? a.type;
  const topic = prompt('Argomento:', a.topic ?? '') ?? a.topic;
  const outcome = prompt('Esito:', a.outcome ?? '') ?? a.outcome;
  const nextActions = prompt('Azioni successive:', a.nextActions ?? '') ?? a.nextActions;
  const notes = prompt('Note:', a.notes ?? '') ?? a.notes;

  Object.assign(a, {
    customerId,
    when: parsedWhen,
    type,
    topic,
    outcome,
    nextActions,
    notes,
    updatedAt: nowIso()
  });
  saveDb(db);
  renderAppointments();
}

function deleteAppointment(id) {
  const a = (db.appointments ?? []).find((x) => x.id === id);
  if (!a) return;
  if (!confirm('Eliminare questo appuntamento?')) return;
  db.appointments = (db.appointments ?? []).filter((x) => x.id !== id);
  saveDb(db);
  renderAppointments();
}

// -----------------------------
// Interactions (MVP)
// -----------------------------

function intScopeWindowDays() {
  const scope = el.intScope?.value ?? 'recent';
  if (scope === 'all') return null;
  // "recent" = ultimi 30 gg (semplice, modificabile)
  return 30;
}

function interactionsFiltered() {
  const q = (el.intSearch?.value ?? '').trim().toLowerCase();
  const list = db?.interactions ?? [];

  const days = intScopeWindowDays();
  const minTs = days == null ? null : Date.now() - days * 24 * 60 * 60 * 1000;

  const scoped = list.filter((i) => {
    if (minTs == null) return true;
    const t = i.at ? new Date(i.at).getTime() : NaN;
    if (Number.isNaN(t)) return true;
    return t >= minTs;
  });

  if (!q) return scoped;
  return scoped.filter((i) => {
    const cust = (db.customers ?? []).find((c) => c.id === i.customerId);
    const hay = [
      cust?.name,
      cust?.email,
      cust?.phone,
      i.channel,
      i.outcome,
      i.tags,
      i.notes,
      i.nextActions
    ]
      .map((x) => String(x ?? '').toLowerCase())
      .join(' | ');
    return hay.includes(q);
  });
}

function renderInteractions() {
  if (!isLoggedIn()) return;
  if (!el.intsTable) return;

  const headers = ['Quando', 'Cliente', 'Canale', 'Esito', 'Tag', 'Note', 'Azioni'];
  const rows = interactionsFiltered()
    .slice()
    .sort((a, b) => (b.at ?? '').localeCompare(a.at ?? ''));

  const thead = el.intsTable.querySelector('thead');
  const tbody = el.intsTable.querySelector('tbody');
  thead.innerHTML = '';
  tbody.innerHTML = '';

  const trH = document.createElement('tr');
  for (const h of headers) {
    const th = document.createElement('th');
    th.textContent = h;
    trH.appendChild(th);
  }
  thead.appendChild(trH);

  const frag = document.createDocumentFragment();
  for (const i of rows) {
    const tr = document.createElement('tr');
    const cust = (db.customers ?? []).find((c) => c.id === i.customerId);

    const tdAt = document.createElement('td');
    tdAt.textContent = i.at ? new Date(i.at).toLocaleString() : '';
    tr.appendChild(tdAt);

    const tdCust = document.createElement('td');
    tdCust.textContent = cust?.name ?? '(cliente mancante)';
    tr.appendChild(tdCust);

    const tdCh = document.createElement('td');
    tdCh.textContent = i.channel ?? '';
    tr.appendChild(tdCh);

    const tdOut = document.createElement('td');
    tdOut.textContent = i.outcome ?? '';
    tr.appendChild(tdOut);

    const tdTags = document.createElement('td');
    tdTags.textContent = (i.tags ?? '').slice(0, 80);
    tr.appendChild(tdTags);

    const tdNotes = document.createElement('td');
    tdNotes.textContent = (i.notes ?? '').slice(0, 140);
    tr.appendChild(tdNotes);

    const tdActions = document.createElement('td');
    const editBtn = document.createElement('button');
    editBtn.className = 'btn';
    editBtn.textContent = 'Modifica';
    editBtn.addEventListener('click', () => editInteraction(i.id));
    const delBtn = document.createElement('button');
    delBtn.className = 'btn';
    delBtn.style.marginLeft = '8px';
    delBtn.textContent = 'Elimina';
    delBtn.addEventListener('click', () => deleteInteraction(i.id));
    tdActions.appendChild(editBtn);
    tdActions.appendChild(delBtn);
    tr.appendChild(tdActions);

    frag.appendChild(tr);
  }
  tbody.appendChild(frag);
}

function createInteraction() {
  const customerId = pickCustomerId();
  if (!customerId) return;

  const channel = prompt('Canale (chiamata/email/whatsapp/visita/altro):', 'chiamata') ?? '';
  const outcome = prompt('Esito (es. ok / da richiamare / preventivo):', '') ?? '';
  const tags = prompt('Tag / interessi (separati da virgola):', '') ?? '';
  const nextActions = prompt('Azioni successive (opzionale):', '') ?? '';
  const notes = prompt('Note (opzionale):', '') ?? '';

  db.interactions = db.interactions ?? [];
  db.interactions.unshift({
    id: uid('int'),
    customerId,
    at: nowIso(),
    channel,
    outcome,
    tags,
    nextActions,
    notes,
    createdAt: nowIso(),
    updatedAt: nowIso()
  });
  saveDb(db);
  renderInteractions();
}

function editInteraction(id) {
  const i = (db.interactions ?? []).find((x) => x.id === id);
  if (!i) return;

  const customerId = pickCustomerId(i.customerId);
  if (!customerId) return;

  const at = prompt('Quando (stringa interpretabile):', i.at ? new Date(i.at).toLocaleString() : '') ?? '';
  const parsedAt = (() => {
    const d = new Date(at);
    return Number.isNaN(d.getTime()) ? i.at : d.toISOString();
  })();

  const channel = prompt('Canale:', i.channel ?? '') ?? i.channel;
  const outcome = prompt('Esito:', i.outcome ?? '') ?? i.outcome;
  const tags = prompt('Tag/interessi (virgole):', i.tags ?? '') ?? i.tags;
  const nextActions = prompt('Azioni successive:', i.nextActions ?? '') ?? i.nextActions;
  const notes = prompt('Note:', i.notes ?? '') ?? i.notes;

  Object.assign(i, {
    customerId,
    at: parsedAt,
    channel,
    outcome,
    tags,
    nextActions,
    notes,
    updatedAt: nowIso()
  });
  saveDb(db);
  renderInteractions();
}

function deleteInteraction(id) {
  const i = (db.interactions ?? []).find((x) => x.id === id);
  if (!i) return;
  if (!confirm('Eliminare questa interazione?')) return;
  db.interactions = (db.interactions ?? []).filter((x) => x.id !== id);
  saveDb(db);
  renderInteractions();
}

// -----------------------------
// Insights (derived)
// -----------------------------

function parseTags(tagsString) {
  return String(tagsString ?? '')
    .split(',')
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean);
}

function bucketHour(h) {
  if (!Number.isFinite(h)) return '';
  if (h < 9) return 'prima delle 09';
  if (h < 12) return '09-12';
  if (h < 14) return '12-14';
  if (h < 18) return '14-18';
  return 'dopo le 18';
}

function bestOfCountMap(map) {
  let bestK = '';
  let bestV = -1;
  for (const [k, v] of map.entries()) {
    if (v > bestV) {
      bestV = v;
      bestK = k;
    }
  }
  return bestK;
}

function classifyHeat(lastAtIso) {
  if (!lastAtIso) return 'freddo';
  const t = new Date(lastAtIso).getTime();
  if (Number.isNaN(t)) return 'freddo';
  const days = (Date.now() - t) / (24 * 60 * 60 * 1000);
  if (days <= 14) return 'caldo';
  if (days <= 45) return 'tiepido';
  return 'freddo';
}

function insightsWindowDays() {
  const v = el.insScope?.value ?? '30';
  if (v === 'all') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : 30;
}

function computeCustomerInsight(customer) {
  const allInts = db?.interactions ?? [];
  const days = insightsWindowDays();
  const minTs = days == null ? null : Date.now() - days * 24 * 60 * 60 * 1000;

  const ints = allInts
    .filter((i) => i.customerId === customer.id)
    .filter((i) => {
      if (minTs == null) return true;
      const t = i.at ? new Date(i.at).getTime() : NaN;
      if (Number.isNaN(t)) return true;
      return t >= minTs;
    })
    .slice()
    .sort((a, b) => (b.at ?? '').localeCompare(a.at ?? ''));

  const last = ints[0] ?? null;
  const lastAt = last?.at ?? null;
  const count = ints.length;

  const dayCounts = new Map();
  const hourCounts = new Map();
  const tagCounts = new Map();

  for (const i of ints) {
    const d = i.at ? new Date(i.at) : null;
    if (d && !Number.isNaN(d.getTime())) {
      const dow = d.toLocaleDateString(undefined, { weekday: 'long' }).toLowerCase();
      dayCounts.set(dow, (dayCounts.get(dow) ?? 0) + 1);
      const bucket = bucketHour(d.getHours());
      hourCounts.set(bucket, (hourCounts.get(bucket) ?? 0) + 1);
    }
    for (const t of parseTags(i.tags)) {
      tagCounts.set(t, (tagCounts.get(t) ?? 0) + 1);
    }
  }

  const topDay = bestOfCountMap(dayCounts);
  const topSlot = bestOfCountMap(hourCounts);
  const topTag = bestOfCountMap(tagCounts);
  const heat = classifyHeat(lastAt);

  return {
    customerId: customer.id,
    heat,
    lastAt,
    interactions: count,
    topDay,
    topSlot,
    topTag
  };
}

function customersForInsightsFiltered() {
  const q = (el.insSearch?.value ?? '').trim().toLowerCase();
  const list = db?.customers ?? [];
  if (!q) return list;
  return list.filter((c) => {
    const hay = [c.name, c.email, c.phone, c.status, c.notes].map((x) => String(x ?? '').toLowerCase()).join(' | ');
    return hay.includes(q);
  });
}

function renderInsights() {
  if (!isLoggedIn()) return;
  if (!el.insightsTable) return;

  const headers = ['Cliente', 'Stato', 'Ultima interazione', 'Interazioni', 'Giorno tipico', 'Fascia tipica', 'Interesse top'];
  const rows = customersForInsightsFiltered().map((c) => ({
    customer: c,
    ins: computeCustomerInsight(c)
  }));

  const order = { caldo: 0, tiepido: 1, freddo: 2 };
  rows.sort((a, b) => {
    const ha = order[a.ins.heat] ?? 9;
    const hb = order[b.ins.heat] ?? 9;
    if (ha !== hb) return ha - hb;
    return (b.ins.lastAt ?? '').localeCompare(a.ins.lastAt ?? '');
  });

  const thead = el.insightsTable.querySelector('thead');
  const tbody = el.insightsTable.querySelector('tbody');
  thead.innerHTML = '';
  tbody.innerHTML = '';

  const trH = document.createElement('tr');
  for (const h of headers) {
    const th = document.createElement('th');
    th.textContent = h;
    trH.appendChild(th);
  }
  thead.appendChild(trH);

  const frag = document.createDocumentFragment();
  for (const r of rows) {
    const tr = document.createElement('tr');

    const tdName = document.createElement('td');
    tdName.textContent = r.customer.name ?? '';
    tr.appendChild(tdName);

    const tdHeat = document.createElement('td');
    tdHeat.textContent = r.ins.heat;
    tr.appendChild(tdHeat);

    const tdLast = document.createElement('td');
    tdLast.textContent = r.ins.lastAt ? new Date(r.ins.lastAt).toLocaleString() : '';
    tr.appendChild(tdLast);

    const tdCnt = document.createElement('td');
    tdCnt.textContent = String(r.ins.interactions ?? 0);
    tr.appendChild(tdCnt);

    const tdDay = document.createElement('td');
    tdDay.textContent = r.ins.topDay ?? '';
    tr.appendChild(tdDay);

    const tdSlot = document.createElement('td');
    tdSlot.textContent = r.ins.topSlot ?? '';
    tr.appendChild(tdSlot);

    const tdTag = document.createElement('td');
    tdTag.textContent = r.ins.topTag ?? '';
    tr.appendChild(tdTag);

    frag.appendChild(tr);
  }
  tbody.appendChild(frag);
}

function preventDefaults(e) {
  e.preventDefault();
  e.stopPropagation();
}

['dragenter', 'dragover', 'dragleave', 'drop'].forEach((eventName) => {
  el.dropzone.addEventListener(eventName, preventDefaults, false);
});

['dragenter', 'dragover'].forEach((eventName) => {
  el.dropzone.addEventListener(eventName, () => el.dropzone.classList.add('dragover'), false);
});
['dragleave', 'drop'].forEach((eventName) => {
  el.dropzone.addEventListener(eventName, () => el.dropzone.classList.remove('dragover'), false);
});

el.dropzone.addEventListener('drop', (e) => {
  const file = e.dataTransfer?.files?.[0];
  if (file) {
    el.fileInput.files = e.dataTransfer.files;
    onFileSelected(file);
  }
});

el.fileInput.addEventListener('change', () => {
  const file = el.fileInput.files?.[0];
  if (file) onFileSelected(file);
});

el.reloadBtn.addEventListener('click', () => location.reload());

function clearTable() {
  el.thead.innerHTML = '';
  el.tbody.innerHTML = '';
  el.count.textContent = '';
}

function onFileSelected(file) {
  clearTable();

  setStatus(`Caricamento: ${file.name}…`);

  readWorkbook(file)
    .then((wb) => {
      initFromWorkbook(wb, file.name);
      setStatus(`OK: ${file.name}`);
    })
    .catch((err) => {
      console.error(err);
      setStatus(`Errore lettura Excel: ${err?.message ?? String(err)}`, 'muted');
    });
}

async function readWorkbook(file) {
  const data = await file.arrayBuffer();
  return XLSX.read(data, { type: 'array', cellDates: true });
}

let currentRows = [];
let currentHeaders = [];
let currentFileName = '';

function initFromWorkbook(wb, fileName) {
  currentFileName = fileName;
  const sheets = wb.SheetNames ?? [];
  el.sheetSelect.innerHTML = '';
  for (const name of sheets) {
    const opt = document.createElement('option');
    opt.value = name;
    opt.textContent = name;
    el.sheetSelect.appendChild(opt);
  }

  el.sheetSelect.disabled = sheets.length === 0;
  el.searchInput.disabled = sheets.length === 0;
  el.downloadCsvBtn.disabled = sheets.length === 0;

  const preferred = sheets.find((s) => /data|dati|sheet1/i.test(s)) ?? sheets[0];
  if (preferred) el.sheetSelect.value = preferred;

  const renderSelected = () => {
    const sheetName = el.sheetSelect.value;
    const ws = wb.Sheets[sheetName];
    if (!ws) return;

    // Convert to JSON array. defval keeps empty cells.
    const json = XLSX.utils.sheet_to_json(ws, {
      defval: '',
      raw: false
    });

    currentRows = Array.isArray(json) ? json : [];
    currentHeaders = collectHeaders(currentRows);
    renderTable(applySearch(currentRows, el.searchInput.value), currentHeaders);
  };

  el.sheetSelect.onchange = renderSelected;
  el.searchInput.oninput = () => {
    renderTable(applySearch(currentRows, el.searchInput.value), currentHeaders);
  };

  el.downloadCsvBtn.onclick = () => downloadCsv(applySearch(currentRows, el.searchInput.value));

  renderSelected();
}

function collectHeaders(rows) {
  const set = new Set();
  for (const r of rows) {
    if (r && typeof r === 'object') {
      Object.keys(r).forEach((k) => set.add(k));
    }
  }
  return Array.from(set);
}

function applySearch(rows, query) {
  const q = (query ?? '').trim().toLowerCase();
  if (!q) return rows;

  return rows.filter((r) => {
    for (const v of Object.values(r ?? {})) {
      const s = String(v ?? '').toLowerCase();
      if (s.includes(q)) return true;
    }
    return false;
  });
}

function renderTable(rows, headers) {
  clearTable();
  if (!rows || rows.length === 0) {
    el.count.textContent = '0 righe';
    return;
  }

  // Header
  const trH = document.createElement('tr');
  for (const h of headers) {
    const th = document.createElement('th');
    th.textContent = h;
    trH.appendChild(th);
  }
  el.thead.appendChild(trH);

  // Rows (simple render; can be virtualized later)
  const frag = document.createDocumentFragment();
  for (const r of rows) {
    const tr = document.createElement('tr');
    for (const h of headers) {
      const td = document.createElement('td');
      const v = r?.[h];
      td.textContent = v == null ? '' : String(v);
      tr.appendChild(td);
    }
    frag.appendChild(tr);
  }
  el.tbody.appendChild(frag);

  el.count.textContent = `${rows.length} righe`;
}

function downloadCsv(rows) {
  const ws = XLSX.utils.json_to_sheet(rows ?? []);
  const csv = XLSX.utils.sheet_to_csv(ws);
  const blob = new Blob(["\ufeff", csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const base = currentFileName ? currentFileName.replace(/\.[^.]+$/, '') : 'customer-care';
  a.href = url;
  a.download = `${base}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

setStatus('In attesa di un file…');

// -----------------------------
// Auth wiring
// -----------------------------

function showAuth() {
  el.authCard.hidden = false;
  el.routeTitleCard.hidden = true;
  hideAllViews();
  el.activeUser.textContent = '';
  setStatus('Non autenticato.');
  refreshUserSelect();
  refreshOrgModeUi();
}

el.loginBtn?.addEventListener('click', () => {
  const user = normalizeUser(el.userSelect?.value || el.username.value);
  const pin = String(el.pin.value ?? '');
  if (!user) {
    setStatus('Inserisci un nome utente.', 'muted');
    return;
  }

  // If org directory is enabled: user list is read-only and comes from org users.
  if (orgModeEnabled()) {
    const org = loadOrgUsersState();
    const rec = (org.users ?? []).find((u) => u.username === user) ?? null;
    if (!rec) {
      setStatus('Utente non presente nella directory condivisa. Chiedi al PC principale di crearlo.', 'muted');
      return;
    }
    verifyPinAgainstRecord(user, pin, rec).then((ok) => {
      if (!ok) {
        setStatus('PIN errato.', 'muted');
        return;
      }
      setStatus(`Accesso OK: ${user}`);
      setActiveUser(user);
    });
    return;
  }

  // Local registry (legacy behavior)
  const registry = ensureUsersInvariant(loadUsers());
  if (registry.length && !registry.some((u) => u.username === user)) {
    setStatus('Utente non presente. Chiedi all’Admin di crearlo.', 'muted');
    return;
  }
  if (!checkPin(user, pin)) {
    setStatus('PIN errato.', 'muted');
    return;
  }

  // If registry is empty, create a standard user on first login (fallback)
  if (registry.length === 0) {
    try {
      createUser({ username: user, role: 'standard', pin });
    } catch {
      // ignore
    }
  } else {
    // If first time and user typed a pin, set it.
    if (!getUserPin(user) && pin) setUserPin(user, pin);
  }
  setStatus(`Accesso OK: ${user}`);
  setActiveUser(user);
});

el.userSelect?.addEventListener('change', () => {
  const v = normalizeUser(el.userSelect.value);
  if (v) el.username.value = v;
});

// -----------------------------
// Shared users directory (offline org-mode)
// -----------------------------

function downloadOrgJson(filename, obj) {
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

async function exportOrgUsersDirectory() {
  if (!canManageUsers()) {
    setStatus('Su questo PC la directory utenti è in sola lettura: non puoi esportare.', 'muted');
    return;
  }

  // Source of truth: local users list + local pin storage
  const local = ensureUsersInvariant(loadUsers());
  const outUsers = [];
  for (const u of local) {
    const pin = getUserPin(u.username) ?? '';
    const pinHash = pin ? await sha256Hex(`${u.username}:${pin}`) : null;
    outUsers.push({ username: u.username, role: u.role, pinHash, createdAt: u.createdAt ?? nowIso() });
  }
  const payload = {
    schema: 1,
    enabled: true,
    updatedAt: nowIso(),
    users: ensureOrgUsersInvariant(outUsers)
  };
  downloadOrgJson(`customer-care-users-${isoDate()}.json`, payload);
  setStatus('Directory utenti esportata (JSON). Mettila nella cartella condivisa e falla importare agli altri PC.', 'ok');
}

async function importOrgUsersDirectoryFromFile(file) {
  const text = await file.text();
  const parsed = JSON.parse(text);
  const payloadUsers = Array.isArray(parsed?.users) ? parsed.users : [];
  const normalized = ensureOrgUsersInvariant(payloadUsers);
  saveOrgUsersState({ enabled: true, users: normalized, updatedAt: parsed?.updatedAt ?? nowIso() });

  // When importing on a non-master device, keep master disabled.
  saveOrgMaster({ enabled: false, pinHash: null, enabledAt: null });

  refreshUserSelect();
  refreshOrgModeUi();
  setStatus('Directory utenti importata. Questo PC è in modalità sola lettura per gli utenti.', 'ok');
}

el.orgUsersExportBtn?.addEventListener('click', () => {
  exportOrgUsersDirectory();
});

el.orgUsersImportInput?.addEventListener('change', async () => {
  const file = el.orgUsersImportInput.files?.[0];
  if (!file) return;
  try {
    await importOrgUsersDirectoryFromFile(file);
  } catch {
    setStatus('File non valido. Assicurati di importare il JSON esportato dal PC principale.', 'muted');
  } finally {
    el.orgUsersImportInput.value = '';
  }
});

// Pre-login import (Accesso screen)
el.orgUsersImportAuthInput?.addEventListener('change', async () => {
  const file = el.orgUsersImportAuthInput.files?.[0];
  if (!file) return;
  try {
    await importOrgUsersDirectoryFromFile(file);
  } catch {
    setStatus('File non valido. Assicurati di importare il JSON esportato dal PC principale.', 'muted');
  } finally {
    el.orgUsersImportAuthInput.value = '';
  }
});

el.orgSetMasterBtn?.addEventListener('click', async () => {
  const org = loadOrgUsersState();
  if (!org.enabled) {
    // Enable org-mode locally even without prior import (master can start from local users)
    saveOrgUsersState({ enabled: true, users: ensureOrgUsersInvariant(org.users), updatedAt: nowIso() });
  }

  const masterPin = String(el.orgMasterPin?.value ?? '').trim();
  if (!masterPin) {
    setStatus('Inserisci un PIN master.', 'muted');
    return;
  }

  const masterHash = await sha256Hex(`master:${masterPin}`);
  saveOrgMaster({ enabled: true, pinHash: masterHash, enabledAt: nowIso() });
  refreshOrgModeUi();
  setStatus('Questo PC è impostato come PC master. Ora puoi gestire utenti ed esportare la directory.', 'ok');
});

el.bootstrapAdminBtn?.addEventListener('click', () => {
  const users = ensureUsersInvariant(loadUsers());
  if (users.length > 0) {
    setStatus('Esistono già utenti. Usa la gestione utenti in Impostazioni (Admin).', 'muted');
    return;
  }
  const username = normalizeUser(prompt('Username Admin (es. admin):', 'admin'));
  if (!username) return;
  const pin = String(prompt('PIN Admin (consigliato):', '') ?? '');
  try {
    createUser({ username, role: 'admin', pin });
    setStatus('Admin creato. Ora puoi fare login.');
    refreshUserSelect();
  } catch (e) {
    setStatus(e?.message ?? String(e), 'muted');
  }
});

// Customers events
el.clientSearch?.addEventListener('input', () => renderClients());
el.newClientBtn?.addEventListener('click', () => createCustomer());

// Appointments events
el.apptScope?.addEventListener('change', () => renderAppointments());
el.apptSearch?.addEventListener('input', () => renderAppointments());
el.newApptBtn?.addEventListener('click', () => createAppointment());

// Interactions events
el.intScope?.addEventListener('change', () => renderInteractions());
el.intSearch?.addEventListener('input', () => renderInteractions());
el.newIntBtn?.addEventListener('click', () => createInteraction());

// Insights events
el.insScope?.addEventListener('change', () => renderInsights());
el.insSearch?.addEventListener('input', () => renderInsights());

// Settings: export/import/reset
el.exportBtn?.addEventListener('click', () => {
  if (!isLoggedIn()) return;
  const payload = buildUserBackupPayload(effectiveUser ?? activeUser);
  downloadJson(payload, `customer-care-backup-${payload.user}-${isoDate()}.json`);
});

function buildUserBackupPayload(user) {
  const u = normalizeUser(user);
  const udb = u === (effectiveUser ?? activeUser) ? db : loadDbForUser(u);
  return {
    exportedAt: nowIso(),
    schemaVersion: udb.schemaVersion,
    user: u,
    customers: udb.customers,
    appointments: udb.appointments,
    interactions: udb.interactions
  };
}

function buildGlobalBackupPayload() {
  const users = ensureUsersInvariant(loadUsers());
  return {
    exportedAt: nowIso(),
    schemaVersion: 1,
    users,
    datasets: users.map((u) => buildUserBackupPayload(u.username))
  };
}

function downloadJson(payload, filename) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

async function shareJson(payload, filename, { toEmail = '' } = {}) {
  const jsonText = JSON.stringify(payload, null, 2);
  const file = new File([jsonText], filename, { type: 'application/json' });

  // Prefer Web Share API (mobile). Supports attachments in many mobile browsers.
  try {
    if (navigator.canShare && navigator.canShare({ files: [file] }) && navigator.share) {
      await navigator.share({
        title: 'Customer Care - Backup',
        text: `Backup ${filename}`,
        files: [file]
      });
      setStatus('Condivisione avviata.');
      return;
    }
  } catch (e) {
    // ignore and fallback
    console.warn('share failed', e);
  }

  // Fallback: download + open mail client with instructions.
  downloadJson(payload, filename);
  const subject = encodeURIComponent(`Customer Care - Backup ${filename}`);
  const body = encodeURIComponent(
    `Ho appena esportato un backup.\n\nAllega manualmente il file scaricato: ${filename}\n\n(In alcuni browser non è possibile allegare automaticamente via mailto.)`
  );
  const to = encodeURIComponent(String(toEmail ?? '').trim());
  const mailto = `mailto:${to}?subject=${subject}&body=${body}`;
  window.location.href = mailto;
  setStatus('Backup scaricato. Si apre il client email (allegare il file manualmente).');
}

el.importInput?.addEventListener('change', async () => {
  if (!isLoggedIn()) return;
  const f = el.importInput.files?.[0];
  if (!f) return;
  try {
    const text = await f.text();
    const parsed = JSON.parse(text);
    if (!parsed || typeof parsed !== 'object') throw new Error('File non valido');
    const customers = Array.isArray(parsed.customers) ? parsed.customers : [];
    const appointments = Array.isArray(parsed.appointments) ? parsed.appointments : [];
    const interactions = Array.isArray(parsed.interactions) ? parsed.interactions : [];
    db.customers = customers;
    db.appointments = appointments;
    db.interactions = interactions;
    saveDb(db);
    setStatus('Ripristino completato.');
    renderClients();
    renderAppointments();
    renderInteractions();
    renderInsights();
  } catch (e) {
    setStatus(`Errore ripristino: ${e?.message ?? String(e)}`, 'muted');
  } finally {
    el.importInput.value = '';
  }
});

el.resetBtn?.addEventListener('click', () => {
  if (!isLoggedIn()) return;
  if (!confirm('Vuoi cancellare TUTTI i dati di questo utente?')) return;
  localStorage.removeItem(userKey(activeUser));
  db = loadDb(activeUser);
  setStatus('Dati utente cancellati.');
  renderClients();
  renderAppointments();
  renderInteractions();
  renderInsights();
});

el.createUserBtn?.addEventListener('click', () => {
  if (!isLoggedIn() || !isAdmin()) {
    setStatus('Solo Admin può creare utenti.', 'muted');
    return;
  }
  try {
    const username = el.newUserName.value;
    const role = el.newUserRole.value;
    const pin = el.newUserPin.value;
    createUser({ username, role, pin });
    el.newUserName.value = '';
    el.newUserPin.value = '';
    setStatus('Utente creato.');
    refreshAdminPanel();
  } catch (e) {
    setStatus(e?.message ?? String(e), 'muted');
  }
});

// Share buttons
el.shareMyBackupBtn?.addEventListener('click', async () => {
  if (!isLoggedIn()) return;
  const toEmail = el.backupEmailTo?.value ?? '';
  const payload = buildUserBackupPayload(effectiveUser ?? activeUser);
  const filename = `customer-care-backup-${payload.user}-${isoDate()}.json`;
  await shareJson(payload, filename, { toEmail });
});

el.shareAllBackupBtn?.addEventListener('click', async () => {
  if (!isLoggedIn() || !isAdmin()) {
    setStatus('Solo Admin può inviare il backup di tutti.', 'muted');
    return;
  }
  const toEmail = el.backupEmailTo?.value ?? '';
  const payload = buildGlobalBackupPayload();
  const filename = `customer-care-backup-ALL-${isoDate()}.json`;
  await shareJson(payload, filename, { toEmail });
});

el.impersonateSelect?.addEventListener('change', () => {
  if (!isLoggedIn() || !isAdmin()) return;
  try {
    setEffectiveUser(el.impersonateSelect.value);
    refreshAdminPanel();
  } catch (e) {
    setStatus(e?.message ?? String(e), 'muted');
  }
});

el.stopImpersonateBtn?.addEventListener('click', () => {
  if (!isLoggedIn() || !isAdmin()) return;
  stopImpersonation();
  refreshAdminPanel();
});

// Startup
showAuth();
