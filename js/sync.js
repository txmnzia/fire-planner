import { el } from "./util.js";
import { state, features } from "./state.js";
import { LEGACY_RATE_TO_CODE } from "./inputs.js";
import { recalc } from "./recalc.js";
import { renderHoldings } from "./ui/ibkr.js";
import { renderNwHistory } from "./ui/nwHistory.js";
import { refreshSituationControls } from "./ui/situation.js";
import { updateAge, onWdMode, updateToggleUI } from "./ui/controls.js";

// ── GITHUB GIST SYNC ────────────────────────────────────────────────────────
const SYNC_FIELDS = [
  'cash','cashReturn',
  'dob','lifeExp','baseYear',
  'baseIncome','spendNow','spendRet','swr',
  'stockRet','bondRet','inflation','bondAllocNow','bondAllocRet',
  'retCountry',
  'pensionAmt','pensionAge',
  'partnerInc','partnerRetAge','partnerPension','partnerPensionAge','partnerSpendMult',
  'propBuyYear','propPrice','propDownPct','propTxCostPct','propMortgageRate','propMortgageTerm','propRentSaved',
  'childBirthYear','childCostYearly','childCostUntilAge','childMaternityMonths','childMaternityIncome',
  'sc1name','sc2name','sc3name','sc4name','sc5name',
  's1_ret','s2_ret','s3_ret','s4_ret','s5_ret',
  's1_inc','s2_inc','s3_inc','s4_inc','s5_inc',
  's1_chgYear','s2_chgYear','s3_chgYear','s4_chgYear','s5_chgYear',
  's1_chgInc','s2_chgInc','s3_chgInc','s4_chgInc','s5_chgInc',
  'mcSims','mcBlock',
  'gainFrac','partnerBirthYear',
];

const SAM_STATE = {"v":1,"fields":{"cash":"18000","cashReturn":"1.5","dob":"1994-03-12","lifeExp":"85","baseYear":"2026","baseIncome":"6700","spendNow":"3700","spendRet":"3000","swr":"4","stockRet":"7","bondRet":"3","inflation":"2","bondAllocNow":"0","bondAllocRet":"40","retCountry":"30","pensionAmt":"800","pensionAge":"67","wf0_yr":"2030","wf0_amt":"100000","wf1_yr":"","wf1_amt":"","wf2_yr":"","wf2_amt":"","partnerInc":"1400","partnerRetAge":"67","partnerPension":"400","partnerPensionAge":"67","partnerSpendMult":"1.3","propBuyYear":"2029","propPrice":"400000","propDownPct":"20","propTxCostPct":"8","propMortgageRate":"3.5","propMortgageTerm":"25","propRentSaved":"1200","childBirthYear":"2030","childCostYearly":"12000","childCostUntilAge":"23","childMaternityMonths":"12","childMaternityIncome":"1800","sc1name":"FIRE","sc2name":"With Tatou","sc3name":"Barista","sc4name":"Tatou+kid @FR","sc5name":"All @FR","s1_ret":"42","s2_ret":"45","s3_ret":"50","s4_ret":"59","s5_ret":"63","s1_inc":"","s2_inc":"","s3_inc":"","s4_inc":"","s5_inc":"","s1_chgYear":"","s2_chgYear":"","s3_chgYear":"2030","s4_chgYear":"2031","s5_chgYear":"2031","s1_chgInc":"","s2_chgInc":"","s3_chgInc":"1400","s4_chgInc":"4000","s5_chgInc":"4000"},"wdMode":"swr","features":{"1":{"partner":false,"prop":false,"child":false},"2":{"partner":true,"prop":false,"child":false},"3":{"partner":false,"prop":false,"child":false},"4":{"partner":true,"prop":false,"child":true},"5":{"partner":true,"prop":true,"child":true}},"ibkr":{"total":286780.5899394,"holdings":[{"sym":"IWDA","qty":6,"val":702.21},{"sym":"VWCE","qty":1811,"val":278821.56},{"sym":"Cash","qty":null,"val":7256.8199394}]}};
const GIST_DESC = 'fire-planner';

// ── Per-device GitHub token ─────────────────────────────────────────────────
// Sync uses a gist-scoped classic PAT pasted once per device in the sync modal
// and stored only in that browser's localStorage. It is never embedded in the
// served file or the repo: anything shipped in the page source is readable (and
// abusable) by anyone who can load the page.
let oauthToken  = localStorage.getItem('fire_github_token') || '';
let ghLogin     = localStorage.getItem('fire_github_login') || '';
let syncGistId  = localStorage.getItem('fire_gist_id')      || '';
let syncTimer   = null;
let isSyncLoad  = false;
let lastSynced  = null;
let localTs     = 0;
let pollTimer   = null;

const ghHeaders = () => ({ Authorization: `Bearer ${oauthToken}`, 'Content-Type': 'application/json' });

export function collectState() {
  const fields = {};
  SYNC_FIELDS.forEach(id => { const e = el(id); if (e) fields[id] = e.value; });
  const wdEl = document.querySelector('input[name="wdMode"]:checked');
  const feat = {};
  for (let s = 1; s <= 5; s++) feat[s] = { ...features[s] };
  const mcRe = el('mcRecenter');
  return { v: 1, fields, wdMode: wdEl ? wdEl.value : 'fixed', features: feat,
    nwHistory: state.nwHistory,
    windfalls: state.windfalls,
    mc: { recenter: mcRe ? mcRe.checked : true },
    ibkr: { total: state.ibkrTotal, holdings: state.ibkrHoldings } };
}

export function applyState(data) {
  if (!data || data.v !== 1) return;
  localTs = data.ts || 0;
  Object.entries(data.fields || {}).forEach(([id, val]) => {
    const e = el(id); if (!e) return;
    // migrate legacy numeric country values (rates were ambiguous across countries)
    if (id === 'retCountry' && LEGACY_RATE_TO_CODE[val]) val = LEGACY_RATE_TO_CODE[val];
    e.value = val;
  });
  const radio = document.querySelector(`input[name="wdMode"][value="${data.wdMode}"]`);
  if (radio) radio.checked = true;
  const mcRe = el('mcRecenter'); if (mcRe && data.mc) mcRe.checked = data.mc.recenter !== false;
  for (let s = 1; s <= 5; s++) { if (data.features?.[s]) features[s] = { ...data.features[s] }; }
  if (data.ibkr) { state.ibkrTotal = data.ibkr.total || 0; state.ibkrHoldings = data.ibkr.holdings || []; renderHoldings(); }
  state.nwHistory = Array.isArray(data.nwHistory) ? data.nwHistory.map(r=>({
    year:+r.year||0, val:+r.val||0,
    income:(r.income==null||r.income==='')?null:+r.income,
    spend:(r.spend==null||r.spend==='')?null:+r.spend
  })) : [];
  // Windfalls: dynamic array on newer payloads; migrate legacy wf{i}_yr/wf{i}_amt fields otherwise.
  if (Array.isArray(data.windfalls)) {
    state.windfalls = data.windfalls.map(w=>({
      yr:(w.yr==null||w.yr==='')?null:parseInt(w.yr),
      amt:(w.amt==null||w.amt==='')?null:+w.amt
    }));
  } else {
    const wfs = [];
    for (let i = 0; i < 3; i++) {
      const yr = data.fields?.['wf'+i+'_yr'], amt = data.fields?.['wf'+i+'_amt'];
      if (yr == null || yr === '') continue;
      const y = parseInt(yr), a = parseFloat(amt);
      if (!isNaN(y)) wfs.push({ yr: y, amt: isNaN(a) ? null : a });
    }
    state.windfalls = wfs;
  }
  renderNwHistory();
  refreshSituationControls();
  for (let s = 1; s <= 5; s++) updateAge(s);
  onWdMode(); updateToggleUI();
  isSyncLoad = true; recalc(); isSyncLoad = false;
}

export async function syncSave() {
  if (!oauthToken) return;
  setSyncStatus('syncing');
  const state = collectState();
  state.ts = localTs || (localTs = Date.now());
  const payload = { description: GIST_DESC, files: { 'fire-planner.json': { content: JSON.stringify(state, null, 2) } } };
  try {
    let res;
    if (syncGistId) {
      res = await fetch(`https://api.github.com/gists/${syncGistId}`, {
        method: 'PATCH', headers: ghHeaders(), body: JSON.stringify(payload),
      });
      if (res.status === 404) { syncGistId = ''; localStorage.removeItem('fire_gist_id'); return syncSave(); }
      if (res.status === 401) { handleAuthError(); return; }
    } else {
      res = await fetch('https://api.github.com/gists', {
        method: 'POST', headers: ghHeaders(),
        body: JSON.stringify({ ...payload, public: false }),
      });
      if (res.status === 401) { handleAuthError(); return; }
    }
    if (!res.ok) throw new Error(res.status);
    const json = await res.json();
    if (!syncGistId) { syncGistId = json.id; localStorage.setItem('fire_gist_id', syncGistId); }
    lastSynced = new Date();
    setSyncStatus('ok');
  } catch { setSyncStatus('error'); }
}

export async function syncLoad() {
  if (!syncGistId) return false;
  const res = await fetch(`https://api.github.com/gists/${syncGistId}`, { headers: ghHeaders() });
  if (res.status === 401) { handleAuthError(); return false; }
  if (!res.ok) return false;
  const json = await res.json();
  const content = json.files?.['fire-planner.json']?.content;
  if (!content) return false;
  applyState(JSON.parse(content));
  lastSynced = new Date();
  return true;
}

// Finds the fire-planner Gist — matches exact desc or legacy "fire-planner:name" pattern.
// If a legacy Gist is found its description is updated to the canonical value.
async function findGist() {
  for (let page = 1; page <= 5; page++) {
    const res = await fetch(`https://api.github.com/gists?per_page=100&page=${page}`, { headers: ghHeaders() });
    if (!res.ok) return null;
    const list = await res.json();
    if (!list.length) return null;
    const found = list.find(g => g.description === GIST_DESC || g.description?.startsWith('fire-planner:'));
    if (found) return found.id;
  }
  return null;
}

export function scheduleSave() {
  if (isSyncLoad) return;
  localTs = Date.now();
  const st = collectState(); st.ts = localTs;
  localStorage.setItem('fire_state', JSON.stringify(st));
  if (!oauthToken) return;
  clearTimeout(syncTimer);
  syncTimer = setTimeout(syncSave, 2500);
}

export function setSyncStatus(status) {
  const btn = el('syncBtn');
  if (btn) btn.dataset.state = status;
  const lbl = el('syncNameLbl');
  if (lbl) lbl.textContent = ghLogin ? '@' + ghLogin : '';
  const last = el('syncLastTime');
  if (last && lastSynced) last.textContent = 'Last synced: ' + lastSynced.toLocaleTimeString();
}

function handleAuthError() {
  // Token revoked / lacks gist scope — clear it so the modal offers reconnection.
  oauthToken = '';
  localStorage.removeItem('fire_github_token');
  setSyncStatus('error');
  if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
}

// Validate & store a pasted gist-scoped token for this device, then start syncing.
export async function connectSync() {
  const inp = el('syncTokenInput'), err = el('syncTokenErr'), btn = el('syncConnectBtn');
  const tok = (inp ? inp.value : '').trim();
  if (!tok) return;
  if (err) err.style.display = 'none';
  if (btn) btn.disabled = true;
  try {
    const res = await fetch('https://api.github.com/user', { headers: { Authorization: `Bearer ${tok}` } });
    if (!res.ok) throw new Error('GitHub rejected the token (' + res.status + '). Check it has the gist scope.');
    const user = await res.json();
    oauthToken = tok;
    localStorage.setItem('fire_github_token', tok);
    ghLogin = user.login || '';
    localStorage.setItem('fire_github_login', ghLogin);
    if (inp) inp.value = '';
    closeSyncModal();
    setSyncStatus('syncing');
    if (!syncGistId) {
      const gid = await findGist();
      if (gid) { syncGistId = gid; localStorage.setItem('fire_gist_id', syncGistId); }
    }
    if (syncGistId) await syncLoad(); else await syncSave();
    setSyncStatus('ok');
    startPolling();
  } catch (e) {
    if (err) { err.textContent = e.message || 'Could not connect.'; err.style.display = ''; }
    setSyncStatus('error');
  } finally { if (btn) btn.disabled = false; }
}

export function disconnectSync() {
  oauthToken = '';
  localStorage.removeItem('fire_github_token');
  ghLogin = '';
  localStorage.removeItem('fire_github_login');
  if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
  setSyncStatus('idle');
  closeSyncModal();
}

// Background poll so an already-open tab picks up edits made on another device.
async function syncPoll() {
  if (!oauthToken || !syncGistId) return;
  if (syncTimer) return;                               // a local save is pending — don't clobber it
  const ae = document.activeElement;                  // user is mid-edit — leave their input alone
  if (ae && /^(INPUT|SELECT|TEXTAREA)$/.test(ae.tagName)) return;
  try {
    const res = await fetch(`https://api.github.com/gists/${syncGistId}`, { headers: ghHeaders() });
    if (res.status === 401) { handleAuthError(); return; }
    if (!res.ok) return;
    const json = await res.json();
    const content = json.files?.['fire-planner.json']?.content;
    if (!content) return;
    const data = JSON.parse(content);
    if ((data.ts || 0) > localTs) { applyState(data); lastSynced = new Date(); setSyncStatus('ok'); }
  } catch { /* transient network blip — try again next tick */ }
}

export function startPolling() {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = setInterval(() => { if (document.visibilityState === 'visible') syncPoll(); }, 15000);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') syncPoll(); });
}

export function openSyncModal() {
  const ok = !!oauthToken;
  el('syncStatusView').style.display  = ok ? '' : 'none';
  el('syncNoTokenView').style.display = ok ? 'none' : '';
  if (ok) {
    el('syncStateText').textContent = el('syncBtn').dataset.state === 'error' ? 'unavailable' : 'active';
    const last = el('syncLastTime');
    if (last) last.textContent = lastSynced ? 'Last synced: ' + lastSynced.toLocaleTimeString() : '';
  }
  el('syncOverlay').style.display = 'flex';
}

export function closeSyncModal() {
  el('syncOverlay').style.display = 'none';
}

export async function syncNow() { localTs = Date.now(); await syncSave(); }

export function loadState() {
  const saved = localStorage.getItem('fire_state');
  if (saved) { try { applyState(JSON.parse(saved)); return; } catch {} }
  applyState(SAM_STATE);
}

// Background Gist sync bootstrap (best-effort, non-blocking) — pulls the latest
// state from any other device, or creates the gist on first run for an account.
export async function initSync() {
  if (!oauthToken) { setSyncStatus('idle'); return; }
  setSyncStatus('syncing');
  try {
    if (!syncGistId) {
      const gid = await findGist();
      if (gid) { syncGistId = gid; localStorage.setItem('fire_gist_id', syncGistId); }
    }
    if (syncGistId) await syncLoad();   // pull latest from any other device
    else await syncSave();              // first run on this account — create the gist
    setSyncStatus('ok');
    startPolling();                     // keep an open tab live-updated
  } catch { setSyncStatus('error'); }
}
