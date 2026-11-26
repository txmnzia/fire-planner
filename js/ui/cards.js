import { el, eur, fmtK } from "../util.js?v=8.33";
import { scenarioIssues } from "../checks.js?v=8.33";
import { state } from "../state.js?v=8.33";
import { getScenarioName } from "../inputs.js?v=8.33";
import { vsPlanFor } from "./planLine.js?v=8.33";
import { portReturnAt, yearOneBudget, yearOnePermBudget, partnerContributionNote, project, pensionMonthlyAt, taxRateAt, homeEquityAt, scGl } from "../engine.js?v=8.33";
import { mcHeadlineHTML } from "./mcTab.js?v=8.33";

// ── MILESTONE RENDER ───────────────────────────────────────────────────────
const SC_COLORS=["s1","s2","s3","s4","s5"];

// Shared per-scenario card metrics — the single source of financial display
// logic for both the Scenarios cards and the Results summary tiles.
export function computeCardMetrics(sc, gl, proj) {
  const retIdx  = proj.retYear - gl.baseYear;
  const iRet    = Math.min(Math.max(0, retIdx), proj.values.length - 1);
  const portRet = proj.values[iRet] || 0;
  const retYear = gl.baseYear + Math.max(0, sc.retAge - gl.currentAge);
  const nAccum  = Math.max(0, sc.retAge - gl.currentAge);
  // depletion: start-of-year values plus the final end-of-year state
  let depletionYear = null;
  for (let i = Math.max(0, retIdx); i < proj.values.length; i++) {
    if (proj.values[i] <= 0) { depletionYear = proj.years[i]; break; }
  }
  if (depletionYear === null && proj.finalNetWorth <= 0) depletionYear = proj.years[proj.years.length - 1];
  // coast number, from the retirement-basis FIRE target
  let growthFactor = 1;
  for (let i = 0; i < nAccum; i++) growthFactor *= (1 + portReturnAt(gl, gl.currentAge + i, sc.retAge));
  const coastNow = growthFactor > 0 ? proj.fireTarget / growthFactor : proj.fireTarget;
  const coasting = ((gl.invested || 0) + gl.cash) >= coastNow;
  // vs plan: when did the plan curve expect you to be where you actually are today?
  // v8.20: against the frozen plan (a saved version) when there is one
  const pos = vsPlanFor((sc.id || 1) - 1, sc, gl);
  const vsPlan = pos ? pos.years : null;   // +ve = ahead of plan
  const m = { retIdx, portRet, retYear, depletionYear, coastNow, coasting,
              vsPlan, vsPlanOpen: pos ? pos.open : false, vsPlanGap: pos ? pos.gap : null, vsPlanLabel: pos ? pos.label : '',
              fireTarget: proj.fireTarget, fireTargetAdj: proj.fireTargetAdj, laterRise: !!proj.laterRise,
              infeasibleYear: proj.infeasibleYear };
  // With the partner: the target is YOUR FIRE (your portfolio covers your cost:
  // own spending + your part of shared costs). Household FIRE was removed in v8.8.
  const twoP = !!sc.hasPartner;
  const herDrawRet = 0;
  if (twoP) {
    m.two = {
      partialTarget: proj.fireTarget, partialNW: portRet, partialOk: portRet >= proj.fireTarget,
      note: partnerContributionNote(sc, gl, proj),
    };
  }
  if (gl.wdMode === 'swr') {
    const cashAtRet   = (proj.rows[iRet] || {}).cashVal || 0;
    // v8.2: the set-aside for costs that end (proj.tempPV) is not available for the
    // SWR draw; the SWR income only has to cover the lifelong part of the budget.
    const investAtRet = Math.max(0, portRet - cashAtRet - (proj.tempPV || 0));
    // net of CGT at the *tracked* gain fraction at retirement, not today's
    const gfr = proj.gainFracAtRet != null ? proj.gainFracAtRet : gl.gainFrac;
    const swrPortfolio = Math.round(investAtRet * gl.swr * (1 - gfr * taxRateAt(scGl(gl, sc), proj.retYear)) / 12);
    const inflAtRet = Math.pow(1 + gl.inflation, nAccum);
    const pensionMonthly = Math.round(pensionMonthlyAt(scGl(gl, sc), sc.retAge) * inflAtRet);   // v8.27: with the rights this scenario earns
    // her salary and pension are hers, never your income (one model, v8.23): the
    // breakdown keeps the two slots at 0 for the Explanation tab's layout
    const partnerPensionMonthly = 0, partnerSalMonthly = 0;
    m.netMonthly = swrPortfolio + pensionMonthly + partnerPensionMonthly + partnerSalMonthly;
    // component split, so the Explanation tab can show where the income comes from
    // without re-deriving it (single source — must stay equal to netMonthly).
    m.incomeBreakdown = { portfolio: swrPortfolio, pension: pensionMonthly,
                          partnerPension: partnerPensionMonthly, partnerSalary: partnerSalMonthly };
    // target = the same complete year-one budget the engine and Monte Carlo use
    m.targetMonthly = Math.round(yearOnePermBudget(sc.retAge, sc, gl, herDrawRet) / 12);
    m.budgetMonthly = Math.round(yearOneBudget(sc.retAge, sc, gl, herDrawRet) / 12);   // incl. costs that end
    m.tempPV = proj.tempPV || 0;
    m.incomeOk = m.netMonthly >= m.targetMonthly;
    // v8.19 stricter rule: when the cost rises later (her share falls), funded also
    // needs the portfolio at the stop age to reach that higher FIRE number.
    m.laterRise = !!proj.laterRise;
    // v8.24 (audit 2026-11 T3): the FIRE number is priced on the invested portfolio
    // (cash is a reserve outside it), so every comparison with it leaves cash out
    m.portForTarget = portRet - cashAtRet;
    if (m.laterRise) m.incomeOk = m.incomeOk && m.portForTarget >= proj.fireTarget;
    // v8.25 (owner's decision, audit 2026-11 F3): funded means EVERY retirement year
    // is on budget, not only the first: % mode cannot borrow from a pension that
    // starts later. First year where the draw + other income falls short of the
    // budget (0.1% tolerance for rounding); null = none.
    const short = proj.rows.findIndex((r, i) => i >= iRet && r.phase === 'ret' && r.swrTarget > 0 && r.swrIncome < r.swrTarget * 0.999);
    m.shortYear = short >= 0 ? proj.rows[short].yr : null;
    if (m.shortYear != null) m.incomeOk = false;
    if (m.two) { m.two.partialNW = m.portForTarget; m.two.partialOk = m.incomeOk; }
  } else {
    m.portForTarget = portRet;   // fixed mode: cash is spent like the rest
    m.surplus = portRet - proj.fireTarget;
    m.ok = m.surplus >= 0;
    if (m.two) m.two.partialOk = m.ok;
  }
  // v8.33 tile figures (owner's choice of FIRE metrics, DECISIONS 2026-11-26).
  // Net worth at stop INCLUDING the home: portfolio + cash + home equity. Not the
  // basis of any verdict (the FIRE number is a portfolio number), shown for context.
  m.homeEquity = homeEquityAt(gl, sc, retYear);
  m.netWorthAtStop = portRet + m.homeEquity;
  // Progress today: what you hold today against the FIRE number in today's money
  // (the target is in euros of the stop year, so it is deflated over the years to
  // the stop). Same basis as the verdict: % mode leaves cash out, fixed mode keeps it.
  const holdNow = (gl.invested || 0) + (gl.wdMode === 'swr' ? 0 : (gl.cash || 0));
  const targetToday = proj.fireTarget / Math.pow(1 + gl.inflation, nAccum);
  m.progressNow = targetToday > 0 ? holdNow / targetToday : null;
  return m;
}

// ── Automatic stop age (v8.1) ──────────────────────────────────────────────
// A scenario's stop age is no longer typed: it is the earliest age at which the
// scenario is funded (isFunded: the computeCardMetrics verdict, % mode → income
// covers the year-one budget, fixed mode → net worth at stop ≥ FIRE number, AND
// the money lasts to life expectancy). With the partner on this is YOUR funding
// (she keeps working to her own stop age). Every age from max(30, current age) to
// min(75, life expectancy − 1) is projected in turn; the first funded one wins.
// No funded age → found:false and the scenario is shown at the last age tried.
export const STOP_AGE_MIN = 30, STOP_AGE_MAX = 75;
// Funded = the scenario's verdict AND the money lasts: no year where portfolio and
// cash run out (infeasibleYear) and, in fixed mode, no depletion before life
// expectancy. The second half matters in fixed mode, where "net worth ≥ FIRE
// number" can hold at the stop age while the path still runs dry later.
export function isFunded(sc, gl, proj) {
  const m = computeCardMetrics(sc, gl, proj);
  const verdict = gl.wdMode === 'swr' ? !!m.incomeOk : !!m.ok;
  return verdict && m.depletionYear == null && proj.infeasibleYear == null;
}
export function earliestStopAge(sc, gl) {
  const lo = Math.max(STOP_AGE_MIN, gl.currentAge), hi = Math.min(STOP_AGE_MAX, gl.lifeExp - 1);
  let last = null;
  for (let a = lo; a <= hi; a++) {
    const s = { ...sc, retAge: a }, p = project(s, gl);
    last = { sc: s, proj: p };
    if (isFunded(s, gl, p)) return { found: true, age: a, sc: s, proj: p };
  }
  return { found: false, age: last ? last.sc.retAge : sc.retAge, sc: last ? last.sc : sc, proj: last ? last.proj : project(sc, gl) };
}
// The scenarios every tab uses: each with its automatic stop age. A scenario with
// a missing input (js/checks.js) is not searched (it would look funded at once);
// it keeps its last saved age and the grid shows "missing".
export function withStopAges(scenarios, gl) {
  return scenarios.map(sc => {
    if (scenarioIssues(sc, gl).some(i => i.blocking)) return { found: false, missing: true, age: sc.retAge, sc, proj: project(sc, gl) };
    return { missing: false, ...earliestStopAge(sc, gl) };
  });
}

// Scenario results (v8; since v8.32 shown on the Results tiles only, the
// Scenarios tab models life events). The few result figures per scenario. Every figure comes from computeCardMetrics, the single source
// shared with the Results tiles (AUDIT.md T8): never re-derive a number here.
export function scenarioGridResults(sc, gl, proj, stop) {
  const m = computeCardMetrics(sc, gl, proj);
  // A missing spending input makes the target 0 and the verdict "funded": show
  // that the input is missing instead of a confident wrong number.
  const blocking = scenarioIssues(sc, gl).filter(i => i.blocking);
  const swr = gl.wdMode === 'swr';
  const funded = swr ? !!m.incomeOk : !!m.ok;
  const gap = swr ? Math.max(0, m.targetMonthly - m.netMonthly) : Math.max(0, -m.surplus);
  const status = funded
    ? (swr ? '\u2713 Funded' : '\u2713 +' + fmtK(m.surplus))
    : (swr ? (gap > 0 ? '\u00d7 Short ' + fmtK(gap) + '/mo' : '\u00d7 Short in ' + m.shortYear) : '\u00d7 Gap ' + fmtK(gap));
  const depletionAge = m.depletionYear != null ? gl.currentAge + m.depletionYear - gl.baseYear : null;
  const stopFound = stop ? !!stop.found : true;
  const stopAgeText = sc.retAge + ' \u00b7 ' + m.retYear;
  const margin = (m.portForTarget ?? m.portRet) - m.fireTarget;   // v8.24: same basis as the verdict
  // v8.13: scenarios that buy: home equity when you stop (net worth, not FIRE)
  const equity = sc.hasProp ? homeEquityAt(gl, sc, m.retYear) : null;
  const equityText = equity == null ? 'no purchase' : (m.retYear < gl.propBuyYear ? 'buys in ' + gl.propBuyYear : fmtK(equity));
  const marginText = (margin >= 0 ? '+' : '\u2212') + fmtK(Math.abs(margin));
  if (blocking.length) {
    return {
      stopFound: false, stopAgeText: '\u2014', margin: null, marginText: '\u2014',
      funded: false, status: '\u26a0 Missing input', gap: null, missing: blocking.map(i => i.key),
      fireTarget: m.fireTarget, fireTargetText: '\u2014',
      nwAtStop: m.portRet, nwAtStopText: fmtK(m.portRet),
      depletionYear: m.depletionYear, depletionAge,
      lastsOk: false, lasts: '\u2014', equity, equityText: equity == null ? 'no purchase' : '\u2014',
    };
  }
  return {
    stopFound, stopAgeText: stopFound ? stopAgeText : 'not by ' + sc.retAge, margin, marginText,
    funded, status, gap, missing: [],
    fireTarget: m.fireTarget, fireTargetText: fmtK(m.fireTarget),
    nwAtStop: m.portRet, nwAtStopText: fmtK(m.portRet),
    depletionYear: m.depletionYear, depletionAge,
    lastsOk: depletionAge == null,
    lasts: depletionAge == null ? 'to ' + gl.lifeExp + '+' : 'runs out at ' + depletionAge,
    equity, equityText,
  };
}

export function vsPlanRowHTML(m) {
  if (m.vsPlan === null) return '';
  const d = m.vsPlan, onPlan = d === 0 && !m.vsPlanOpen, ahead = d > 0 || m.vsPlanOpen, n = Math.abs(d);
  const txt = onPlan ? 'on plan' : (m.vsPlanOpen ? '>' : '') + n + 'y ' + (ahead ? 'ahead of' : 'behind') + ' plan';
  // v8.20: the € gap to where the frozen plan expected you today
  const gap = m.vsPlanGap != null ? ' <span class="tgt">' + (m.vsPlanGap >= 0 ? '+' : '\u2212') + fmtK(Math.abs(m.vsPlanGap)) + '</span>' : '';
  return '<div class="sc-result-row" title="'+(m.vsPlanLabel||'').replace(/"/g,'&quot;')+'"><span class="k">vs Plan</span><span class="v '+(onPlan?'':(ahead?'ok':'err'))+'">'+(onPlan?'':(ahead?'▲ ':'▼ '))+txt+gap+'</span></div>';
}

// Partner scenario: your FIRE (target · net worth at retirement · chip) plus the
// note on what she contributes and how your cost changes when her income does.
export function twoRowsHTML(m, compact) {
  const t = m.two; if (!t) return '';
  const chip = (ok, yes, no) => '<span class="ms-chip sm '+(ok?'ok':'err')+'">'+(ok?'\u2713 '+yes:'\u00d7 '+no)+'</span>';
  const line = (k, tgt, nw, ok, yes, no) =>
    '<div class="sc-result-row two-row"><span class="k">'+k+' '+chip(ok, yes, no)+'</span><span class="v">'+eur(tgt)+' <span class="tgt">/ NW '+eur(nw)+'</span></span></div>';
  let html = line('Your FIRE', t.partialTarget, t.partialNW, t.partialOk, 'Funded', 'Short');
  if (!compact && t.note) {
    const n = t.note;
    html += '<div class="sc-result-note">Assumes partner contributes '+eur(n.contribMonthly)+'/mo'
      + (n.untilHerAge != null ? ' until her age '+n.untilHerAge+(n.costAfterMonthly != null ? '; after that your cost becomes '+eur(n.costAfterMonthly)+'/mo' : '') : '')
      + ' (today\u2019s \u20ac).</div>';
  }
  return html;
}

export function infeasibleRowHTML(m) {
  if (m.infeasibleYear == null) return '';
  return '<div class="sc-result-row"><span class="k">⚠ Underfunded</span><span class="v err">'+m.infeasibleYear+' (savings exhausted)</span></div>';
}

// FIRE Number row; in %-of-portfolio mode also shows the lower alternative
// target that credits future pensions & partner salary (see README).
export function fireNumRowHTML(m, gl, cc) {
  let adj = '';
  if (gl.wdMode === 'swr' && m.fireTargetAdj < m.fireTarget * 0.99) {
    adj = ' <span class="tgt">/ '+eur(m.fireTargetAdj)+' w/ pensions</span>';
  } else if (gl.wdMode === 'swr' && m.laterRise) {
    // v8.19: the headline already includes a cost that rises later (stricter rule)
    adj = ' <span class="tgt">incl. later cost rise</span>';
  }
  return '<div class="sc-result-row"><span class="k">'+(m.two ? 'FIRE Number (you)' : 'FIRE Number')+'</span><span class="v '+cc+'">'+eur(m.fireTarget)+adj+'</span></div>';
}

// Results tiles (v8.32): the only place scenario results are shown. The Scenarios
// tab models life events only. Each row appears once and only when it says
// something the others don't (v8.33: the owner's metric choice). All numbers come
// from computeCardMetrics / scenarioGridResults (AUDIT.md T8: one source).
const tileEsc = s => String(s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
export function renderSummaryTiles(projs, gl, scenarios, stops) {
  const row = el('scSummaryRow');
  if (!row) return;
  const CV = ['s1c','s2c','s3c','s4c','s5c'];
  const swr = gl.wdMode === 'swr';
  const rowHTML = (k, v, cls, title) => '<div class="sc-result-row"'+(title?' title="'+tileEsc(title)+'"':'')+'><span class="k">'+k+'</span><span class="v'+(cls?' '+cls:'')+'">'+v+'</span></div>';
  let html = '';
  projs.forEach((proj, i) => {
    const sc = scenarios[i], cv = CV[i], name = tileEsc(getScenarioName(i));
    const m = computeCardMetrics(sc, gl, proj);
    const r = scenarioGridResults(sc, gl, proj, stops ? stops[i] : null);
    const missing = r.missing.length > 0;
    const chip = missing
      ? '<span class="ms-chip err">\u26a0 Missing input</span>'
      : swr ? '<span class="ms-chip '+(m.incomeOk?'ok':'err')+'">'+(m.incomeOk?'\u2713 Funded':'\u00d7 Short')+'</span>'
            : '<span class="ms-chip '+(m.ok?'ok':'err')+'">'+(m.ok?'\u2713 On Track':'\u00d7 Gap')+'</span>';
    // v8.33: the owner's FIRE metrics, each once: stop age, vs plan, FIRE number,
    // net worth at stop incl. home, progress today, then warnings only when they
    // apply, then the Monte Carlo chance.
    let body = rowHTML('Stop age', r.stopAgeText, missing ? 'muted' : (r.stopFound ? '' : 'err'),
      'The first age at which this scenario is funded, worked out by trying every age from today to 75.');
    if (!missing) {
      body += vsPlanRowHTML(m);
      body += fireNumRowHTML(m, gl, '');
      const home = sc.hasProp
        ? (m.retYear < gl.propBuyYear ? ' <span class="tgt">buys in '+gl.propBuyYear+'</span>' : ' <span class="tgt">incl. home '+fmtK(m.homeEquity)+'</span>')
        : '';
      body += rowHTML('NW at stop', eur(m.netWorthAtStop)+home, '',
        'Portfolio + cash + home equity (home value minus the loan left) when you stop. The FIRE number is compared with the portfolio only.');
      if (m.progressNow != null) body += rowHTML('Progress today', Math.round(m.progressNow*100)+'% <span class="tgt">of FIRE nb</span>', m.progressNow >= 1 ? 'ok' : '',
        'What you hold today as a share of this scenario\u2019s FIRE number in today\u2019s money (the number deflated from the stop year).');
      body += infeasibleRowHTML(m);
      if (!r.lastsOk) body += rowHTML('Money lasts', r.lasts, 'err');
    }
    body += mcHeadlineHTML(i);            // v8.30: the Monte Carlo chance (mcTab.js)
    html +=
      '<div class="sc-summary-tile'+(i===state.activeScIdx?' active':'')+'" style="border-top:2.5px solid var(--'+cv+')" onclick="setActiveScenario('+i+')">' +
        '<div class="tile-hd">' +
          '<span style="font-size:13px;font-weight:700;color:var(--'+cv+')">'+name+'</span>' +
          chip +
        '</div>' +
        '<div class="sc-result-rows" style="margin-top:6px">' + body + '</div>' +
      '</div>';
  });
  row.innerHTML = html;
}
