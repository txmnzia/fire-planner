import { el } from "./util.js";
import { state, features } from "./state.js";
import { LEGACY_RATE_TO_CODE } from "./inputs.js";
import { recalc } from "./recalc.js";
import { renderHoldings } from "./ui/ibkr.js";
import { renderNwHistory } from "./ui/nwHistory.js";
import { refreshSituationControls } from "./ui/situation.js";
import { updateAge, onWdMode, updateToggleUI } from "./ui/controls.js";
import { db } from "./db.js";

// ── STATE + SYNC ────────────────────────────────────────────────────────────
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
// ── Per-account sync (Supabase, shared txmnzia-dbs project) ─────────────────
// Sign-in is a magic link; the session lives in supabase-js's own storage. No
// token is ever pasted or stored by this app. The old Gist token keys are
// removed on load so a leftover PAT doesn't linger in the browser.
for (const k of ['fire_github_token', 'fire_github_login', 'fire_gist_id']) {
  try { localStorage.removeItem(k); } catch {}
}
let sb          = null;   // Supabase client, once loaded
let userId      = '';
let userEmail   = '';
let syncTimer   = null;
let isSyncLoad  = false;
let lastSynced  = null;
let localTs     = 0;
let pollTimer   = null;

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

// Applying a payload is never an edit: everything below, including the
// recalcs that updateAge()/onWdMode() trigger, runs with isSyncLoad set so
// scheduleSave() can't re-stamp ts. Otherwise every load would look like the
// newest edit and last-write-wins would push stale state over newer devices.
export function applyState(data) {
  if (!data || data.v !== 1) return;
  isSyncLoad = true;
  try { applyStateInner(data); } finally { isSyncLoad = false; }
  localTs = data.ts || 0;
}

function applyStateInner(data) {
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
  recalc();
}

// Run UI initialisation that recalcs without counting it as a user edit
// (page load in main.js). Same reason as applyState above.
export function withoutSave(fn) {
  isSyncLoad = true;
  try { fn(); } finally { isSyncLoad = false; }
}

export async function syncSave() {
  if (!sb || !userId) return;
  setSyncStatus('syncing');
  const data = collectState();
  data.ts = localTs || (localTs = Date.now());
  try {
    const { error } = await sb.from('state')
      .upsert({ user_id: userId, data, ts: data.ts, updated_at: new Date().toISOString() });
    if (error) throw error;
    lastSynced = new Date();
    setSyncStatus('ok');
  } catch { setSyncStatus('error'); }
}

async function fetchRemote() {
  const { data, error } = await sb.from('state').select('data,ts').maybeSingle();
  if (error) throw error;
  return data;   // null when this account has never saved
}

// Last-write-wins on ts, the app's existing contract: pull if the account's
// copy is strictly newer, push if this device's is. On a device's first
// sign-in this uploads its local state when the account is empty or older.
export async function syncLoad() {
  if (!sb || !userId) return false;
  const remote = await fetchRemote();
  if (remote && remote.ts > localTs) {
    applyState(remote.data);
    lastSynced = new Date();
    return true;
  }
  if (!remote || remote.ts < localTs) await syncSave();
  return false;
}

export function scheduleSave() {
  if (isSyncLoad) return;
  localTs = Date.now();
  const st = collectState(); st.ts = localTs;
  try { localStorage.setItem('fire_state', JSON.stringify(st)); } catch {}
  if (!userId) return;
  clearTimeout(syncTimer);
  syncTimer = setTimeout(syncSave, 2500);
}

export function setSyncStatus(status) {
  const btn = el('syncBtn');
  if (btn) btn.dataset.state = status;
  const lbl = el('syncNameLbl');
  if (lbl) lbl.textContent = userEmail;
  const em = el('syncEmailLbl');
  if (em) em.textContent = userEmail;
  const last = el('syncLastTime');
  if (last && lastSynced) last.textContent = 'Last synced: ' + lastSynced.toLocaleTimeString();
}

// Send a magic link; the session arrives when the link reopens this page.
export async function connectSync() {
  const inp = el('syncEmailInput'), err = el('syncEmailErr'), btn = el('syncConnectBtn');
  const email = (inp ? inp.value : '').trim();
  if (!email) return;
  if (err) err.style.display = 'none';
  if (btn) btn.disabled = true;
  try {
    sb = sb || await db();
    if (!sb) throw new Error('Sync is unavailable right now (offline?).');
    const { error } = await sb.auth.signInWithOtp({
      email, options: { emailRedirectTo: location.origin + location.pathname },
    });
    if (error) throw error;
    if (err) { err.textContent = 'Check your email for the sign-in link.'; err.style.display = ''; }
  } catch (e) {
    if (err) { err.textContent = e.message || 'Could not send the link.'; err.style.display = ''; }
  } finally { if (btn) btn.disabled = false; }
}

export async function disconnectSync() {
  if (sb) await sb.auth.signOut().catch(() => {});
  userId = ''; userEmail = '';
  if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
  setSyncStatus('idle');
  closeSyncModal();
}

// Background poll so an already-open tab picks up edits made on another device.
async function syncPoll() {
  if (!sb || !userId) return;
  if (syncTimer) return;                               // a local save is pending — don't clobber it
  const ae = document.activeElement;                  // user is mid-edit — leave their input alone
  if (ae && /^(INPUT|SELECT|TEXTAREA)$/.test(ae.tagName)) return;
  try {
    const remote = await fetchRemote();
    if (remote && remote.ts > localTs) { applyState(remote.data); lastSynced = new Date(); setSyncStatus('ok'); }
  } catch { /* transient network blip — try again next tick */ }
}

export function startPolling() {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = setInterval(() => { if (document.visibilityState === 'visible') syncPoll(); }, 15000);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') syncPoll(); });
}

export function openSyncModal() {
  const ok = !!userId;
  el('syncStatusView').style.display  = ok ? '' : 'none';
  el('syncSignInView').style.display  = ok ? 'none' : '';
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

// Sync bootstrap (best-effort, non-blocking). Always loads the client so a
// magic-link redirect completes the sign-in; does nothing visible signed out.
export async function initSync() {
  sb = await db();
  if (!sb) { setSyncStatus('idle'); return; }
  const onSession = async (session) => {
    const id = session?.user?.id || '';
    if (!id || id === userId) return;
    userId = id; userEmail = session.user.email || '';
    setSyncStatus('syncing');
    try { await syncLoad(); setSyncStatus('ok'); startPolling(); }
    catch { setSyncStatus('error'); }
  };
  sb.auth.onAuthStateChange((_event, session) => { onSession(session); });
  const { data } = await sb.auth.getSession();
  if (data.session) await onSession(data.session); else setSyncStatus('idle');
}
