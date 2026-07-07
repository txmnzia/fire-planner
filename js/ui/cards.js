import { el, eur } from "../util.js";
import { state } from "../state.js";
import { getScenarioName } from "../inputs.js";
import { portReturnAt, yearOneBudget, buildPlanProj, planYearsAhead } from "../engine.js";

// ── MILESTONE RENDER ───────────────────────────────────────────────────────
const SC_COLORS=["s1","s2","s3","s4","s5"];

// Shared per-scenario card metrics — the single source of financial display
// logic for both the Scenarios cards and the Results summary tiles.
export function computeCardMetrics(sc, gl, proj) {
  const retIdx  = proj.retYear - gl.baseYear;
  const iRet    = Math.min(Math.max(0, retIdx), proj.values.length - 1);
  const portRet = proj.values[iRet] || 0;
  const retYear = gl.baseYear + Math.max(0, sc.retAge - gl.currentAge);
  const off     = gl.partnerAgeOff || 0;
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
  const pos = planYearsAhead(buildPlanProj(sc, gl, state.nwHistory), gl);
  const vsPlan = pos ? pos.years : null;   // +ve = ahead of plan
  const m = { retIdx, portRet, retYear, depletionYear, coastNow, coasting,
              vsPlan, vsPlanOpen: pos ? pos.open : false,
              fireTarget: proj.fireTarget, fireTargetAdj: proj.fireTargetAdj,
              infeasibleYear: proj.infeasibleYear };
  if (gl.wdMode === 'swr') {
    const cashAtRet   = (proj.rows[iRet] || {}).cashVal || 0;
    const investAtRet = Math.max(0, portRet - cashAtRet);
    // net of CGT at the *tracked* gain fraction at retirement, not today's
    const gfr = proj.gainFracAtRet != null ? proj.gainFracAtRet : gl.gainFrac;
    const swrPortfolio = Math.round(investAtRet * gl.swr * (1 - gfr * gl.taxRate) / 12);
    const inflAtRet = Math.pow(1 + gl.inflation, nAccum);
    const pensionMonthly = sc.retAge >= gl.pensionAge ? Math.round(gl.pensionAmt * inflAtRet) : 0;
    const partnerPensionMonthly = (sc.hasPartner && sc.retAge + off >= gl.partnerPensionAge)
      ? Math.round(gl.partnerPension * inflAtRet) : 0;
    const partnerSalMonthly = (sc.hasPartner && sc.retAge + off < gl.partnerRetAge)
      ? Math.round(gl.partnerInc * inflAtRet) : 0;
    m.netMonthly = swrPortfolio + pensionMonthly + partnerPensionMonthly + partnerSalMonthly;
    // component split, so the Explanation tab can show where the income comes from
    // without re-deriving it (single source — must stay equal to netMonthly).
    m.incomeBreakdown = { portfolio: swrPortfolio, pension: pensionMonthly,
                          partnerPension: partnerPensionMonthly, partnerSalary: partnerSalMonthly };
    // target = the same complete year-one budget the engine and Monte Carlo use
    m.targetMonthly = Math.round(yearOneBudget(sc.retAge, sc, gl) / 12);
    m.incomeOk = m.netMonthly >= m.targetMonthly;
  } else {
    m.surplus = portRet - proj.fireTarget;
    m.ok = m.surplus >= 0;
  }
  return m;
}

export function vsPlanRowHTML(m) {
  if (m.vsPlan === null) return '';
  const d = m.vsPlan, onPlan = d === 0 && !m.vsPlanOpen, ahead = d > 0 || m.vsPlanOpen, n = Math.abs(d);
  const txt = onPlan ? 'on plan' : (m.vsPlanOpen ? '>' : '') + n + 'y ' + (ahead ? 'ahead of' : 'behind') + ' plan';
  return '<div class="sc-result-row"><span class="k">vs Plan</span><span class="v '+(onPlan?'':(ahead?'ok':'err'))+'">'+(onPlan?'':(ahead?'▲ ':'▼ '))+txt+'</span></div>';
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
  }
  return '<div class="sc-result-row"><span class="k">FIRE Number</span><span class="v '+cc+'">'+eur(m.fireTarget)+adj+'</span></div>';
}

export function renderMilestone(idx, sc, gl, proj) {
  const cc = SC_COLORS[idx-1];
  const m  = computeCardMetrics(sc, gl, proj);
  const retIdx = m.retIdx, portRet = m.portRet, retYearM = m.retYear;
  const coastNow = m.coastNow, coasting = m.coasting, depletionYear = m.depletionYear;
  const scName = getScenarioName(idx-1);
  const coastRow = '<div class="sc-result-row"><span class="k">Coast Number</span><span class="v '+(coasting?'ok':'')+'">'+eur(coastNow)+(coasting?' \u2713':'')+'</span></div>';
  const retireAgeRow = '<div class="sc-result-row"><span class="k">Retire age</span><span class="v '+cc+'">'+sc.retAge+' &middot; '+retYearM+'</span></div>';
  const nwRetRow = '<div class="sc-result-row"><span class="k">NW at retirement</span><span class="v '+cc+'">'+eur(portRet)+'</span></div>';
  const depRowErr = depletionYear
    ? '<div class="sc-result-row"><span class="k">Runs out</span><span class="v err">'+depletionYear+' (age '+(gl.currentAge+depletionYear-gl.baseYear)+')</span></div>'
    : '';
  const vsPlanRow = vsPlanRowHTML(m);
  const infeasRow = infeasibleRowHTML(m);
  const fireNumRow = fireNumRowHTML(m, gl, cc);

  let headChip, innerRows;
  if (gl.wdMode === 'swr') {
    // %-of-portfolio mode cannot meaningfully deplete, so the honest headline is
    // budget adequacy, not a survival chip.
    headChip = '<div class="ms-chip '+(m.incomeOk?'ok':'err')+'">'+(m.incomeOk?'\u2713 Funded':'\u00d7 Short')+'</div>';
    const incomeRow = '<div class="sc-result-row"><span class="k">Monthly income</span><span class="v '+(m.incomeOk?'ok':'err')+'">'+eur(m.netMonthly)+' <span class="tgt">/ '+eur(m.targetMonthly)+'</span></span></div>';
    innerRows = retireAgeRow + vsPlanRow + incomeRow + nwRetRow + fireNumRow + coastRow + depRowErr + infeasRow;
  } else {
    headChip = '<div class="ms-chip '+(m.ok?'ok':'err')+'">'+(m.ok?'\u2713 On Track':'\u00d7 Gap')+'</div>';
    const surpRow = m.ok
      ? '<div class="sc-result-row"><span class="k">Surplus</span><span class="v ok">+'+eur(m.surplus)+'</span></div>'
      : '<div class="sc-result-row"><span class="k">Gap</span><span class="v err">'+eur(m.surplus)+'</span></div>';
    const depRow = depletionYear ? depRowErr
      : '<div class="sc-result-row"><span class="k">Survives to</span><span class="v ok">age '+gl.lifeExp+'+</span></div>';
    innerRows = retireAgeRow + vsPlanRow + nwRetRow + fireNumRow + surpRow + coastRow + depRow + infeasRow;
  }

  el("ms"+idx).innerHTML =
    '<div class="sc-result-head">'+
      '<div class="sc-result-age" style="color:var(--'+cc+'c)">'+scName+' &middot; Age '+sc.retAge+'</div>'+
      headChip+
    '</div>'+
    '<div class="sc-result-rows">'+innerRows+'</div>';
}

export function renderSummaryTiles(projs, gl, scenarios) {
  const row = el('scSummaryRow');
  if (!row) return;
  const CV = ['s1c','s2c','s3c','s4c','s5c'];
  let html = '';
  projs.forEach((proj, i) => {
    const sc = scenarios[i], cv = CV[i], name = getScenarioName(i);
    const m = computeCardMetrics(sc, gl, proj);   // same numbers as the scenario cards
    let chip, metricRow;
    if (gl.wdMode === 'swr') {
      chip = '<span class="ms-chip '+(m.incomeOk?'ok':'err')+'">'+(m.incomeOk?'\u2713 Funded':'\u00d7 Short')+'</span>';
      metricRow = '<div class="sc-result-row"><span class="k">Monthly income</span><span class="v '+(m.incomeOk?'ok':'err')+'">'+eur(m.netMonthly)+' <span class="tgt">/ '+eur(m.targetMonthly)+'</span></span></div>';
    } else {
      chip = '<span class="ms-chip '+(m.ok?'ok':'err')+'">'+(m.ok?'\u2713 On Track':'\u00d7 Gap')+'</span>';
      metricRow = '<div class="sc-result-row"><span class="k">FIRE Number</span><span class="v">'+eur(m.fireTarget)+'</span></div>';
    }
    html +=
      '<div class="sc-summary-tile'+(i===state.activeScIdx?' active':'')+'" style="border-top:2.5px solid var(--'+cv+')" onclick="setActiveScenario('+i+')">' +
        '<div class="tile-hd">' +
          '<span style="font-size:13px;font-weight:700;color:var(--'+cv+')">'+name+'</span>' +
          chip +
        '</div>' +
        '<div class="sc-result-rows" style="margin-top:6px">' +
          '<div class="sc-result-row"><span class="k">Retire age</span><span class="v">'+sc.retAge+' &middot; '+m.retYear+'</span></div>' +
          vsPlanRowHTML(m) +
          metricRow +
          '<div class="sc-result-row"><span class="k">NW at retirement</span><span class="v">'+eur(m.portRet)+'</span></div>' +
          infeasibleRowHTML(m) +
        '</div>' +
      '</div>';
  });
  row.innerHTML = html;
}
