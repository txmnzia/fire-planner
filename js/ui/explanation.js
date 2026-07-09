import { el, eur } from "../util.js";
import { state } from "../state.js";
import { getScenarioName } from "../inputs.js";
import { portReturnAt, yearOneBudget, project } from "../engine.js";
import { computeCardMetrics } from "./cards.js";
import { FLOW_COLORS } from "./charts.js";

// ── EXPLANATION TAB ──────────────────────────────────────────────────────────
// "Your plan, explained": turns the selected scenario's projection into a
// readable story — a one-sentence lede with headline stats, a visual journey
// timeline, one "chapter" per life phase (with the monthly budget translated
// into today's money and compared against the current lifestyle), the life
// events that change the numbers along the way, and a set of FIRE-concept
// explainers anchored in this scenario's actual figures.
//
// It never computes a financial figure of its own: headline numbers come from
// computeCardMetrics (the same source as the Scenario cards), per-year
// composition from the engine's own proj.rows[], and life-event impacts from
// re-running the pure engine with the feature off and diffing. Converting a
// future-year (nominal) figure into today's € is a presentation transform done
// in exactly one place (the `today` helper below).

const CV = ["s1c", "s2c", "s3c", "s4c", "s5c"];
const LETTER = ["A", "B", "C", "D", "E"];

// selected scenario for this tab only — deliberately independent of the Results
// tab's active scenario so browsing the guide doesn't disturb the charts.
let explIdx = 0;

const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const mo  = n => eur(Math.round(n / 12));           // annual € → monthly €
const pct = n => (Math.round(n * 1000) / 10) + "%"; // 0.04 → "4%"
const signed = n => (n >= 0 ? "+" : "&minus;") + eur(Math.abs(Math.round(n)));

function row(k, v, cls) { return '<div class="expl-row"><span class="k">' + k + '</span><span class="v ' + (cls || "") + '">' + v + "</span></div>"; }

// horizontal comparison bars (e.g. lifestyle now vs in a phase)
function meter(hd, items) {
  return '<div class="expl-meter"><div class="expl-meter-hd">' + hd + "</div>" +
    items.map(r =>
      '<div class="expl-meter-row"><span class="k">' + r.k + '</span>' +
      '<div class="bar"><i style="width:' + Math.max(2, Math.min(100, Math.round(r.frac * 100))) + '%' + (r.color ? ";background:" + r.color : "") + '"></i></div>' +
      '<span class="v ' + (r.cls || "") + '">' + r.v + "</span></div>").join("") + "</div>";
}

// stacked composition bar (where retirement income comes from)
function mixBar(hd, parts) {
  const segs = parts.filter(p => p.v > 0);
  const total = segs.reduce((s, p) => s + p.v, 0);
  if (total <= 0) return "";
  return '<div class="expl-mix"><div class="expl-meter-hd">' + hd + "</div>" +
    '<div class="expl-mix-bar">' + segs.map(p => '<i style="width:' + (p.v / total * 100).toFixed(1) + '%;background:' + p.color + '"></i>').join("") + "</div>" +
    segs.map(p => '<div class="expl-mix-row"><span class="dot" style="background:' + p.color + '"></span><span class="k">' + p.k + '</span><span class="v">' + eur(Math.round(p.v)) + "/mo</span></div>").join("") +
    "</div>";
}

function concept(title, num, gist, body) {
  return '<details class="expl-c"><summary><span class="expl-c-t">' + title + "</span>" +
    '<span class="expl-c-gist">' + gist + "</span>" +
    (num ? '<span class="expl-c-num">' + num + "</span>" : "") +
    '</summary><div class="expl-c-body">' + body + "</div></details>";
}

export function selectExplanationScenario(idx) {
  explIdx = Math.max(0, Math.min(4, idx));
  if (state.lastProjs && state.lastGl && state.lastScenarios)
    renderExplanation(state.lastProjs, state.lastGl, state.lastScenarios);
}

export function renderExplanation(projs, gl, scenarios) {
  const host = el("explBody");
  if (!host || !projs || !projs.length) return;
  const i = Math.max(0, Math.min(projs.length - 1, explIdx));
  const sc = scenarios[i], proj = projs[i];
  const m = computeCardMetrics(sc, gl, proj);
  const rows = proj.rows || [], vals = proj.values || [];
  const lastIdx = vals.length - 1;
  const cv = "var(--" + CV[i] + ")";
  const swr = gl.wdMode === "swr";

  const currentAge = gl.currentAge, retAge = sc.retAge, baseYear = gl.baseYear;
  const nAccum = Math.max(0, retAge - currentAge);
  const retIdx = Math.min(Math.max(0, proj.retYear - baseYear), lastIdx);
  const already = retAge <= currentAge;
  const off = gl.partnerAgeOff || 0;
  const ageAt = idx => currentAge + idx;
  const yearAt = idx => baseYear + idx;
  const infl = t => Math.pow(1 + gl.inflation, t);
  const today = (n, t) => n / infl(t);   // nominal € in year baseYear+t → today's €

  // full annual outgoings in year idx, from the engine's own row composition
  // (same shape as the engine's retirement `budget` and yearOneBudget)
  const budAnn = idx => { const r = rows[idx] || {}; return Math.max(0, (r.spending || 0) + (r.childCost || 0) + (r.mortgagePayment || 0) - (r.rentSavings || 0)); };
  const nwToday = (gl.invested || 0) + gl.cash;
  const nowMo = budAnn(0) / 12;          // what the household actually lives on today (€/mo)
  const gfr = proj.gainFracAtRet != null ? proj.gainFracAtRet : gl.gainFrac;
  const netFracRet = Math.max(0.001, 1 - gfr * gl.taxRate); // € kept per € withdrawn at retirement
  const vsNow = v => nowMo > 0 ? Math.round(v / nowMo * 100) + "%" : null;

  // ── phases ────────────────────────────────────────────────────────────────
  const penIdx = gl.pensionAge - currentAge;
  const phases = [];
  if (!already && retIdx > 0) phases.push({ key: "build", name: "Building the pot", tag: "you work, save & invest", seg: "Building", s: 0, e: retIdx - 1, op: 22 });
  const retStart = Math.max(0, retIdx);
  if (penIdx > retStart && penIdx <= lastIdx) {
    phases.push({ key: "bridge", name: "The bridge years", tag: "retired, no pension yet — the portfolio is your paycheck", seg: "Bridge", s: retStart, e: penIdx - 1, op: 44 });
    phases.push({ key: "pension", name: "The pension years", tag: "the state pension joins in", seg: "Pension", s: penIdx, e: lastIdx, op: 68 });
  } else if (penIdx > lastIdx) {
    phases.push({ key: "bridge", name: "Retirement", tag: "living off the portfolio (pension starts after age " + gl.lifeExp + ")", seg: "Retirement", s: retStart, e: lastIdx, op: 44 });
  } else {
    phases.push({ key: "pension", name: "Retirement", tag: "pension + portfolio from day one", seg: "Retirement", s: retStart, e: lastIdx, op: 68, fromRet: true });
  }

  // ── life events (each becomes a timeline marker + an entry in its phase) ──
  const events = [];
  const addEv = (idx, icon, title, sub, tone, rowsHtml) => events.push({ idx, icon, title, sub: sub || "", tone: tone || "", rows: rowsHtml || "" });

  // coast point: earliest year where freezing contributions still reaches the
  // FIRE number by retirement, purely on market growth (no fixed "X years early"
  // rule — computed from this plan).
  if (!already) {
    const growth = (fromAge, toAge) => { let g = 1; for (let a = fromAge; a < toAge; a++) g *= (1 + portReturnAt(gl, a, retAge)); return g; };
    let coastIdx = null, coastIdxAdj = null;
    for (let k = 0; k <= retIdx; k++) { if ((vals[k] || 0) * growth(ageAt(k), retAge) >= proj.fireTarget) { coastIdx = k; break; } }
    if (swr && proj.fireTargetAdj < proj.fireTarget * 0.99)
      for (let k = 0; k <= retIdx; k++) { if ((vals[k] || 0) * growth(ageAt(k), retAge) >= proj.fireTargetAdj) { coastIdxAdj = k; break; } }
    if (m.coasting)
      addEv(0, "&#x1F513;", "Coast point — you're already past it", "You could stop investing today and market growth alone would still carry the portfolio to your " + eur(proj.fireTarget) + " target by " + m.retYear + ". Anything you keep saving buys margin or an earlier date.", "ok");
    else if (coastIdx != null && coastIdx < retIdx)
      addEv(coastIdx, "&#x1F513;", "Coast point", "From here you could stop investing — <strong>" + (retAge - ageAt(coastIdx)) + " years before retirement</strong> — and growth alone would still reach your " + eur(proj.fireTarget) + " target by age " + retAge + ". Working on, but saving nothing, becomes an option.", "ok");
    else if (coastIdxAdj != null && coastIdxAdj < retIdx)
      addEv(coastIdxAdj, "&#x1F513;", "Coast point (counting future pensions)", "Against the realistic " + eur(proj.fireTargetAdj) + " target — which credits the pensions and partner income you'll actually receive — you could stop investing here. The cautious " + eur(proj.fireTarget) + " headline target needs contributions all the way to retirement.", "");
  }

  // salary change (scenario input)
  if (!already && sc.chgYear != null && sc.chgInc != null) {
    const cIdx = sc.chgYear - baseYear;
    if (cIdx > 0 && cIdx < retIdx) {
      const up = sc.chgInc >= sc.income;
      addEv(cIdx, "&#x1F4B6;", "Your income changes", "Salary " + (up ? "rises" : "drops") + " from " + eur(sc.income) + " to <strong>" + eur(sc.chgInc) + "/mo</strong> (today's €)" + (up ? ", accelerating the plan." : " — the plan absorbs the lower saving rate from here."), up ? "ok" : "warn");
    }
  }

  // property purchase + mortgage payoff — impact measured by re-running the
  // pure engine with the feature off and diffing (no duplicated financial logic)
  if (sc.hasProp && (gl.propBuyYear - baseYear) <= lastIdx) {
    const pIdx = gl.propBuyYear - baseYear, past = pIdx < 0;
    const base = project({ ...sc, hasProp: false }, gl);
    const iRet = Math.min(Math.max(0, retIdx), lastIdx);
    const dFire = proj.fireTarget - base.fireTarget, dNw = (vals[iRet] || 0) - (base.values[iRet] || 0);
    const upfront = Math.round(gl.propPrice * (gl.propDownPct + gl.propTxCostPct));
    const mortMo = Math.round(((rows.find(r => r.mortgagePayment > 0) || {}).mortgagePayment || 0) / 12);
    const rws = row("Upfront (deposit + fees)", eur(upfront) + ' <span class="tgt">' + (past ? "already paid" : gl.propBuyYear) + "</span>") +
      row("Mortgage", eur(mortMo) + '/mo <span class="tgt">for ' + gl.propMortgageTerm + "y</span>") +
      row("Rent you stop paying", "&minus;" + eur(gl.propRentSaved) + '/mo <span class="tgt">today\'s €</span>', "ok") +
      row("Effect on FIRE number", signed(dFire), dFire > 0 ? "err" : dFire < 0 ? "ok" : "") +
      row("Net worth at retirement", signed(dNw) + ' <span class="tgt">equity not counted</span>');
    addEv(pIdx, "&#x1F3E0;", past ? "You already own your home" : "You buy a " + eur(gl.propPrice) + " home",
      "The planner tracks only the <strong>cash flows</strong> — deposit &amp; fees up front, the mortgage, the rent you stop paying — not the home's resale value. So the net-worth line dips at purchase and the equity you build isn't shown.", "", rws);
    const pfIdx = pIdx + gl.propMortgageTerm;
    if (pfIdx > 0 && pfIdx <= lastIdx) {
      const lastMort = Math.round(((rows[pfIdx - 1] || {}).mortgagePayment || 0) / 12);
      if (lastMort > 0) addEv(pfIdx, "&#x1F511;", "Mortgage paid off", "The " + eur(lastMort) + "/mo payment ends — from here the home only saves you rent.", "ok");
    }
  }

  // child + end of child costs — impact by engine diff, same as property
  if (sc.hasChild && (gl.childBirthYear - baseYear) <= lastIdx) {
    const cIdx = gl.childBirthYear - baseYear, born = cIdx < 0;
    const base = project({ ...sc, hasChild: false }, gl);
    const iRet = Math.min(Math.max(0, retIdx), lastIdx);
    const dFire = proj.fireTarget - base.fireTarget, dNw = (vals[iRet] || 0) - (base.values[iRet] || 0);
    const leave = Math.min(12, gl.childMaternityMonths);
    const rws = row("Cost", eur(gl.childCostYearly) + '/yr <span class="tgt">' + eur(Math.round(gl.childCostYearly / 12)) + "/mo, today's €</span>") +
      row("Runs until", (gl.childBirthYear + gl.childCostUntilAge) + ' <span class="tgt">child turns ' + gl.childCostUntilAge + "</span>") +
      (leave > 0 ? row("Parental leave", leave + " month" + (leave === 1 ? "" : "s") + ' <span class="tgt">reduced income, ' + gl.childBirthYear + "</span>") : "") +
      row("Effect on FIRE number", signed(dFire), dFire > 0 ? "err" : dFire < 0 ? "ok" : "") +
      row("Net worth at retirement", signed(dNw));
    addEv(cIdx, "&#x1F476;", born ? "Your child (born " + gl.childBirthYear + ")" : "You have a child",
      "A sustained cost of about " + eur(Math.round(gl.childCostYearly / 12)) + "/mo in today's money until they turn " + gl.childCostUntilAge + (leave > 0 ? ", plus reduced income during parental leave" : "") + ".", "", rws);
    const ceIdx = cIdx + gl.childCostUntilAge;
    if (ceIdx > 0 && ceIdx <= lastIdx) addEv(ceIdx, "&#x1F393;", "Child costs end", "Frees about " + eur(Math.round(gl.childCostYearly / 12)) + "/mo (today's €) in the budget.", "ok");
  }

  // partner milestones
  if (sc.hasPartner) {
    const prIdx = gl.partnerRetAge - off - currentAge;
    if (prIdx > 0 && prIdx <= lastIdx) addEv(prIdx, "&#x1F91D;", "Your partner retires", "Their " + eur(gl.partnerInc) + "/mo salary (today's €) stops — until now it was covering part of the household budget.", "");
    const ppIdx = gl.partnerPensionAge - off - currentAge;
    if (ppIdx > 0 && ppIdx <= lastIdx) addEv(ppIdx, "&#x1F9D3;", "Partner's pension starts", "+" + eur(gl.partnerPension) + "/mo (today's €) of steady income the portfolio no longer has to provide.", "ok");
  }

  // windfalls
  (gl.windfalls || []).forEach(w => {
    const wIdx = w.yr - baseYear;
    if (wIdx >= 0 && wIdx <= lastIdx) addEv(wIdx, "&#x1F381;", "Windfall", "+" + eur(w.amt) + " joins the portfolio in " + w.yr + ". Deliberately <strong>not</strong> credited against your FIRE number — it just moves the curve up when it lands.", "ok");
  });

  // failure markers
  if (m.depletionYear != null)
    addEv(m.depletionYear - baseYear, "&#x26A0;&#xFE0F;", "Portfolio runs out", "On this average-return path the money is gone at <strong>age " + (currentAge + m.depletionYear - baseYear) + "</strong> — before your planning horizon of " + gl.lifeExp + ". Retiring later, spending less, or saving more closes the gap.", "err");
  if (m.infeasibleYear != null && m.infeasibleYear !== m.depletionYear)
    addEv(m.infeasibleYear - baseYear, "&#x26A0;&#xFE0F;", "Cash reserve exhausted", "From " + m.infeasibleYear + " the plan can't fully fund itself — portfolio and cash are both empty in at least one year.", "err");

  events.sort((a, b) => a.idx - b.idx);
  const eventsIn = p => events.filter(e => (e.idx < 0 && p === phases[0]) || (e.idx >= p.s && e.idx <= p.e));

  // ── chips ─────────────────────────────────────────────────────────────────
  let chips = "";
  scenarios.forEach((s, k) => {
    chips += '<button class="expl-chip' + (k === i ? " active" : "") + '" style="--cc:var(--' + CV[k] + ')"' +
      ' aria-pressed="' + (k === i) + '" onclick="selectExplanationScenario(' + k + ')">' +
      '<span class="expl-chip-dot"></span>' + LETTER[k] + " &middot; " + esc(getScenarioName(k)) + "</button>";
  });

  // ── lede ──────────────────────────────────────────────────────────────────
  const budRetMoNom = swr ? m.targetMonthly : Math.round(budAnn(retIdx) / 12); // same number as the scenario cards
  const budRetMoToday = Math.round(today(budRetMoNom, retIdx));
  const statusChip = swr
    ? '<span class="ms-chip ' + (m.incomeOk ? "ok" : "err") + '">' + (m.incomeOk ? "&#x2713; Funded" : "&#xD7; Short") + "</span>"
    : '<span class="ms-chip ' + (m.ok ? "ok" : "err") + '">' + (m.ok ? "&#x2713; On Track" : "&#xD7; Gap") + "</span>";
  const stratName = swr ? pct(gl.swr) + " of portfolio, each year" : "Fixed amount, inflation-adjusted";
  const ledeSentence = (already
    ? "You're <strong>" + currentAge + "</strong> with <strong>" + eur(nwToday) + "</strong> and already past this scenario's retirement age, so the plan draws down from day one. "
    : "You're <strong>" + currentAge + "</strong> with <strong>" + eur(nwToday) + "</strong>. Retire at <strong>" + retAge + "</strong> — in " + nAccum + " year" + (nAccum === 1 ? "" : "s") + ", " + m.retYear + " — and this plan gives you ")
    + "<strong>" + eur(budRetMoToday) + "/mo in today's money</strong> to live on"
    + (vsNow(budRetMoToday) ? ", which is <strong>" + vsNow(budRetMoToday) + "</strong> of the " + eur(Math.round(nowMo)) + "/mo your household spends now." : ".");
  const ledeMode = swr
    ? "Withdrawal strategy: <strong>" + pct(gl.swr) + " of whatever the portfolio is worth each year</strong> — it can never fully run out, but the amount it pays moves with the markets, so the question everywhere below is whether the draw <em>covers the budget</em>."
    : "Withdrawal strategy: a <strong>fixed budget grown with inflation</strong> — predictable income, but the portfolio can be depleted, so the question everywhere below is whether the money <em>lasts to age " + gl.lifeExp + "</em>.";
  const stat = (l, v, s, cls) => '<div class="expl-stat"><span class="l">' + l + '</span><span class="v ' + (cls || "") + '">' + v + "</span>" + (s ? '<span class="s">' + s + "</span>" : "") + "</div>";
  const endStat = m.depletionYear
    ? stat("Money lasts until", m.depletionYear, "age " + (currentAge + m.depletionYear - baseYear) + " — runs out", "err")
    : stat("Money lasts until", "age " + gl.lifeExp + (swr ? "" : "+"), eur(Math.round(proj.finalNetWorth)) + " left on avg path", "ok");
  const lede =
    '<div class="expl-lede" style="--cc:' + cv + '">' +
      '<div class="expl-lede-hd"><span class="expl-lede-name">' + esc(getScenarioName(i)) + "</span>" + statusChip +
        '<span class="expl-lede-meta">' + stratName + "</span></div>" +
      "<p>" + ledeSentence + "</p>" +
      '<p class="expl-lede-mode">' + ledeMode + "</p>" +
      '<div class="expl-stats">' +
        stat("Retire", already ? "now" : "age " + retAge, already ? "already reached" : m.retYear + " &middot; in " + nAccum + "y") +
        stat("Monthly budget then", eur(budRetMoToday), "today's € &middot; " + eur(budRetMoNom) + " in " + m.retYear + " money") +
        (swr
          ? stat("Year-one income", eur(m.netMonthly) + "/mo", "vs " + eur(m.targetMonthly) + "/mo budget", m.incomeOk ? "ok" : "err")
          : stat("FIRE number", eur(m.fireTarget), "you'd have " + eur(m.portRet), m.ok ? "ok" : "err")) +
        endStat +
      "</div></div>";

  // ── journey timeline ──────────────────────────────────────────────────────
  const span = Math.max(1, lastIdx);
  const pos = idx => Math.max(0, Math.min(100, idx / span * 100));
  const segHtml = phases.map(p =>
    '<div class="expl-tl-seg" style="width:' + ((Math.min(p.e + 1, lastIdx) - p.s) / span * 100).toFixed(2) + '%;background:color-mix(in srgb,' + cv + " " + p.op + '%,var(--dim))"><span>' + p.seg + "</span></div>").join("");
  let markHtml = "";
  events.filter(e => e.idx >= 0 && e.idx <= lastIdx).forEach((e, k) => {
    markHtml += '<div class="expl-tl-mark' + (k % 2 ? " lane2" : "") + (e.tone ? " " + e.tone : "") + '" style="left:' + pos(e.idx).toFixed(1) + '%">' +
      '<span class="i">' + e.icon + '</span><span class="y">' + yearAt(e.idx) + '</span><span class="pin"></span></div>';
  });
  const axPts = [{ idx: 0, lbl: "today" }];
  if (!already && retIdx > 0) axPts.push({ idx: retIdx, lbl: "retire &middot; " + yearAt(retIdx) });
  if (penIdx > Math.max(0, retIdx) && penIdx < lastIdx) axPts.push({ idx: penIdx, lbl: "pension &middot; " + yearAt(penIdx) });
  axPts.push({ idx: lastIdx, lbl: yearAt(lastIdx) });
  const axHtml = axPts.map((a, k) =>
    '<div class="expl-tl-ax' + (k === 0 ? " first" : k === axPts.length - 1 ? " last" : "") + '" style="left:' + pos(a.idx).toFixed(1) + '%"><b>' + ageAt(a.idx) + "</b><span>" + a.lbl + "</span></div>").join("");
  const tlAria = "Timeline from age " + currentAge + " to " + gl.lifeExp + ": " + phases.map(p => p.seg + " age " + ageAt(p.s) + " to " + (ageAt(p.e) + 1)).join(", ") + ".";
  const timeline =
    '<div class="expl-tl-scroll"><div class="expl-tl" role="img" aria-label="' + tlAria + '">' +
      '<div class="expl-tl-marks">' + markHtml + "</div>" +
      '<div class="expl-tl-track">' + segHtml + "</div>" +
      '<div class="expl-tl-axis">' + axHtml + "</div>" +
    "</div></div>";

  // ── phase chapters ────────────────────────────────────────────────────────
  const endNW = p => p.e >= lastIdx ? Math.round(proj.finalNetWorth) : Math.round(vals[p.e + 1] || 0);
  const evLine = e =>
    '<div class="expl-ev' + (e.tone ? " " + e.tone : "") + '">' +
      '<span class="expl-ev-when">' + (e.idx < 0 ? "already" : yearAt(e.idx) + " &middot; age " + ageAt(e.idx)) + "</span>" +
      '<div class="expl-ev-main"><span class="expl-ev-t">' + e.icon + " " + e.title + "</span>" +
      (e.sub ? '<span class="expl-ev-sub">' + e.sub + "</span>" : "") +
      (e.rows ? '<div class="expl-rows">' + e.rows + "</div>" : "") + "</div></div>";

  function phaseCard(p, n) {
    const rS = rows[p.s] || {};
    const nYears = p.e - p.s + 1;
    // a phase "ends" when the next begins; the terminal phase ends at life expectancy itself
    const endAge = p.e >= lastIdx ? ageAt(lastIdx) : ageAt(p.e) + 1;
    const range = "age " + ageAt(p.s) + " &rarr; " + endAge + " &middot; " + yearAt(p.s) + "&ndash;" + yearAt(p.e) + " &middot; " + nYears + " year" + (nYears === 1 ? "" : "s");
    const budS = budAnn(p.s), budSMo = budS / 12, budSMoToday = today(budSMo, p.s);
    let chip = "", lead = "", side = "";

    if (p.key === "build") {
      const incMo = (rS.income || 0) / 12, saveMo = (rS.netFlow || 0) / 12;
      const saveRate = rS.income > 0 ? Math.round((rS.netFlow || 0) / rS.income * 100) : null;
      lead = "For the next <strong>" + nYears + " years</strong> you keep working and investing. Of the " + eur(Math.round(incMo)) + "/mo " + (sc.hasPartner ? "your household earns" : "you earn") + ", about " + eur(Math.round(nowMo)) + " covers life today and <strong>" + eur(Math.round(saveMo)) + "/mo goes into the portfolio</strong>" + (saveRate != null ? " (a " + saveRate + "% saving rate)" : "") + ". The job of this phase is simple: grow " + eur(nwToday) + " into your " + eur(proj.fireTarget) + " FIRE number by " + m.retYear + " — contributions do the pushing early on, market growth takes over later.";
      side =
        meter("Your money today (per month)", [
          { k: "Income", frac: 1, v: eur(Math.round(incMo)), color: FLOW_COLORS.salary },
          { k: "Spending", frac: incMo > 0 ? nowMo / incMo : 0, v: eur(Math.round(nowMo)), color: FLOW_COLORS.spend },
          { k: "Invested", frac: incMo > 0 ? Math.max(0, saveMo) / incMo : 0, v: eur(Math.round(saveMo)), color: FLOW_COLORS.withdraw, cls: saveMo >= 0 ? "ok" : "err" },
        ]) +
        '<div class="expl-rows">' +
        row("Portfolio today", eur(nwToday), CV[i]) +
        row("At retirement (" + m.retYear + ")", eur(m.portRet) + ' <span class="tgt">&asymp; ' + eur(Math.round(today(m.portRet, retIdx))) + " today's €</span>") +
        row("FIRE number to hit", eur(proj.fireTarget) + (swr && proj.fireTargetAdj < proj.fireTarget * 0.99 ? ' <span class="tgt">/ ' + eur(proj.fireTargetAdj) + " w/ pensions</span>" : "")) +
        row("Coast number today", eur(m.coastNow) + (m.coasting ? " &#x2713;" : ""), m.coasting ? "ok" : "") +
        "</div>";
    } else {
      // retirement phases (bridge / pension era)
      // at the retirement year judge adequacy with the card metric (start-of-year
      // portfolio, same as the Scenario cards); later phases use the engine rows
      const okPhase = swr ? (p.s === retIdx ? m.incomeOk : (rS.swrIncome || 0) >= (rS.swrTarget || 0))
                          : !(m.depletionYear && m.depletionYear - baseYear <= p.e && m.depletionYear - baseYear >= p.s);
      chip = swr
        ? '<span class="ms-chip ' + (okPhase ? "ok" : "err") + '">' + (okPhase ? "&#x2713; Funded" : "&#xD7; Short") + "</span>"
        : '<span class="ms-chip ' + (okPhase ? "ok" : "err") + '">' + (okPhase ? "&#x2713; Lasts" : "&#xD7; Runs out") + "</span>";

      // funding mix — at the retirement year use computeCardMetrics' breakdown so
      // the numbers equal the Scenario cards; later phases read the engine rows.
      let parts;
      if (swr && p.s === retIdx && m.incomeBreakdown) {
        const b = m.incomeBreakdown;
        parts = [
          { k: "Portfolio draw (after tax)", v: b.portfolio, color: FLOW_COLORS.withdraw },
          { k: "State pension", v: b.pension, color: FLOW_COLORS.pension },
          { k: "Partner pension", v: b.partnerPension, color: FLOW_COLORS.partnerPension },
          { k: "Partner salary", v: b.partnerSalary, color: FLOW_COLORS.salary },
        ];
      } else if (swr) {
        const port = Math.max(0, (rS.swrIncome || 0) - (rS.pension || 0) - (rS.partnerPension || 0) - (rS.income || 0));
        parts = [
          { k: "Portfolio draw (after tax)", v: port / 12, color: FLOW_COLORS.withdraw },
          { k: "State pension", v: (rS.pension || 0) / 12, color: FLOW_COLORS.pension },
          { k: "Partner pension", v: (rS.partnerPension || 0) / 12, color: FLOW_COLORS.partnerPension },
          { k: "Partner salary", v: (rS.income || 0) / 12, color: FLOW_COLORS.salary },
        ];
      } else {
        parts = [
          { k: "Portfolio withdrawal (after tax)", v: ((rS.withdrawal || 0) - (rS.taxPaid || 0)) / 12, color: FLOW_COLORS.withdraw },
          { k: "State pension", v: (rS.pension || 0) / 12, color: FLOW_COLORS.pension },
          { k: "Partner pension", v: (rS.partnerPension || 0) / 12, color: FLOW_COLORS.partnerPension },
          { k: "Partner salary", v: (rS.income || 0) / 12, color: FLOW_COLORS.salary },
        ];
      }

      if (p.key === "bridge") {
        const pensionLater = penIdx > p.e && penIdx <= lastIdx;
        lead = "At <strong>" + ageAt(p.s) + "</strong> the paycheck stops" + (pensionLater ? ", and your state pension is still <strong>" + (gl.pensionAge - ageAt(p.s)) + " years away</strong>" : "") + ". For " + nYears + " years " + (sc.hasPartner && (rS.income || 0) > 0 ? "the portfolio and your partner's income carry" : "the portfolio alone carries") + " everything. Your budget: <strong>" + eur(Math.round(budSMoToday)) + "/mo in today's money</strong>" + (vsNow(budSMoToday) ? " — <strong>" + vsNow(budSMoToday) + "</strong> of what your household lives on now" : "") + ". " +
          (swr
            ? "The plan funds it by selling <strong>" + pct(gl.swr) + " of whatever the portfolio is worth</strong> each year — about " + eur(m.netMonthly) + "/mo at the start, against a " + eur(m.targetMonthly) + "/mo budget in " + yearAt(p.s) + " money. "
            : "The plan funds it by selling whatever the budget needs — " + eur(Math.round(budSMo)) + "/mo in " + yearAt(p.s) + " money, rising with inflation. ") +
          "These are also the years that decide the whole plan (see <em>sequence-of-returns risk</em> below).";
      } else {
        const penMoS = (rS.pension || 0) / 12;
        const covers = budSMo > 0 && penMoS > 0 ? Math.round(penMoS / budSMo * 100) : 0;
        lead = (p.fromRet
          ? "You retire at <strong>" + ageAt(p.s) + "</strong>, already past pension age, so the state pension flows from day one: <strong>" + mo(rS.pension || 0) + "/mo</strong>"
          : "From <strong>age " + gl.pensionAge + "</strong> your state pension starts: <strong>" + mo(rS.pension || 0) + "/mo</strong> in " + yearAt(p.s) + " money (" + eur(gl.pensionAmt) + " today's €)") +
          (covers ? ", covering about <strong>" + covers + "%</strong> of the budget — the portfolio only tops up the rest" : "") + ". " +
          (m.depletionYear
            ? "Even so, on this path the portfolio <strong>runs out in " + m.depletionYear + "</strong> (age " + (currentAge + m.depletionYear - baseYear) + ")."
            : (swr
              ? "Because the % draw only ever takes a slice of what's left, the pot never fully empties: on the average path you'd reach age " + gl.lifeExp + " with about <strong>" + eur(Math.round(proj.finalNetWorth)) + "</strong> still there."
              : "On the average path the money lasts: about <strong>" + eur(Math.round(proj.finalNetWorth)) + "</strong> is left at age " + gl.lifeExp + "."));
      }

      const maxMo = Math.max(nowMo, budSMoToday, 1);
      side =
        meter("Monthly lifestyle — in today's €", [
          { k: "Now", frac: nowMo / maxMo, v: eur(Math.round(nowMo)) },
          { k: "This phase", frac: budSMoToday / maxMo, v: eur(Math.round(budSMoToday)) + (vsNow(budSMoToday) ? ' <span class="tgt">' + vsNow(budSMoToday) + "</span>" : ""), color: cv },
        ]) +
        mixBar("Where the money comes from — " + yearAt(p.s), parts) +
        '<div class="expl-rows">' +
        row("Budget", eur(Math.round(budSMoToday)) + "/mo today's €" + ' <span class="tgt">' + eur(Math.round(budSMo)) + " in " + yearAt(p.s) + "</span>") +
        (swr ? row("Draw available", eur(swr && p.s === retIdx ? m.netMonthly : Math.round((rS.swrIncome || 0) / 12)) + '/mo <span class="tgt">vs budget</span>', okPhase ? "ok" : "err")
             : row("Sold from portfolio", mo(rS.withdrawal || 0) + "/mo" + ((rS.taxPaid || 0) > 0 ? ' <span class="tgt">incl. ' + mo(rS.taxPaid) + " tax</span>" : ""))) +
        row("Portfolio at " + ageAt(p.s), eur(Math.round(vals[p.s] || 0)), CV[i]) +
        (m.depletionYear && m.depletionYear - baseYear >= p.s && m.depletionYear - baseYear <= p.e
          ? row("Runs out", m.depletionYear + " &middot; age " + (currentAge + m.depletionYear - baseYear), "err")
          : row("Portfolio at " + endAge + (p.e >= lastIdx ? " (end)" : ""), eur(endNW(p)))) +
        "</div>";
    }

    const evs = eventsIn(p);
    return '<section class="expl-phase" style="--pc:color-mix(in srgb,' + cv + " " + p.op + '%,var(--dim))">' +
      '<div class="expl-ph-hd"><span class="expl-ph-n">' + n + '</span><span class="expl-ph-name">' + p.name + '</span><span class="expl-ph-range">' + range + "</span>" + chip + "</div>" +
      '<div class="expl-ph-body"><div class="expl-ph-main">' +
        '<p class="expl-ph-lead">' + lead + "</p>" +
        (evs.length ? '<div class="expl-sub">What happens along the way</div><div class="expl-evs">' + evs.map(evLine).join("") + "</div>" : "") +
      '</div><div class="expl-ph-side">' + side + "</div></div></section>";
  }

  const phasesHtml = '<div class="expl-sect-hd">The chapters of this plan</div><div class="expl-phases">' +
    phases.map((p, k) => phaseCard(p, k + 1)).join("") + "</div>";

  // ── concepts — not lectures: each one is this scenario's own arithmetic,
  // shown as a short numbers ladder with a single grounding sentence after it ──
  const concepts = [];

  // FIRE number — show the engine's actual arithmetic when it reconstructs the
  // headline exactly (it always should in % mode; guarded so a future engine
  // change can never make this card silently show different math).
  if (swr) {
    const budgetRet = yearOneBudget(retAge, sc, gl);
    const inflRet = infl(nAccum);
    const penOff = retAge >= gl.pensionAge ? gl.pensionAmt * 12 * inflRet : 0;
    const ppenOff = (sc.hasPartner && retAge + off >= gl.partnerPensionAge) ? gl.partnerPension * 12 * inflRet : 0;
    const fromPort = Math.max(0, budgetRet - penOff - ppenOff);
    const rebuilt = gl.swr > 0 ? Math.round(fromPort / netFracRet / gl.swr) : 0;
    const exact = Math.abs(rebuilt - proj.fireTarget) <= Math.max(2, proj.fireTarget * 0.001);
    concepts.push(concept("Your FIRE number", eur(proj.fireTarget), "your budget, run backwards",
      (exact
        ? '<div class="expl-rows">' +
          row("Your year-one budget", mo(budgetRet) + '/mo <span class="tgt">' + eur(Math.round(budgetRet)) + "/yr in " + m.retYear + " money</span>") +
          (penOff + ppenOff > 0 ? row("&minus; pensions already flowing then", "&minus;" + mo(penOff + ppenOff) + "/mo") : "") +
          row("&times; tax gross-up on selling", "&times;" + (1 / netFracRet).toFixed(2)) +
          row("&divide; your withdrawal rate", pct(gl.swr)) +
          row("= your FIRE number", eur(proj.fireTarget), CV[i]) + "</div>"
        : '<div class="expl-rows">' + row("Your FIRE number", eur(proj.fireTarget), CV[i]) + "</div>") +
      "<p>Nothing more mystical than that: the pot at which " + pct(gl.swr) + " of it pays your entire budget after tax — from there, working is a choice.</p>" +
      (proj.fireTargetAdj < proj.fireTarget * 0.99
        ? "<p>This headline gives <strong>no credit</strong> for income that isn't flowing on day one (your pension at " + gl.pensionAge + (sc.hasPartner ? ", your partner's remaining salary years" : "") + "). Counted in, the target drops to <strong>" + eur(proj.fireTargetAdj) + "</strong> — the cautious number stays the headline on purpose.</p>" : "")));
  } else {
    concepts.push(concept("Your FIRE number", eur(proj.fireTarget), "your budget, run backwards",
      '<div class="expl-rows">' +
      row("Budget to fund", eur(Math.round(today(budAnn(retIdx), retIdx) / 12)) + "/mo today's €" + ' <span class="tgt">' + mo(budAnn(retIdx)) + " in " + m.retYear + "</span>") +
      row("Years it must last", (gl.lifeExp - retAge) + ' <span class="tgt">age ' + retAge + " &rarr; " + gl.lifeExp + "</span>") +
      row("State pension helps from " + gl.pensionAge, eur(gl.pensionAmt) + "/mo today's €") +
      row("= your FIRE number", eur(proj.fireTarget), CV[i]) + "</div>" +
      "<p>Priced like an annuity you buy yourself: the pot at " + retAge + " whose withdrawals — your real budget, growing with inflation, grossed up for capital-gains tax, minus pensions in the years they flow — run out exactly at age " + gl.lifeExp + ".</p>"));
  }

  // SWR / the 4% rule — a pot→income ladder using the same after-tax draw
  // formula as the scenario cards' portfolio-draw component
  const potPays = amt => eur(Math.round(amt * gl.swr * netFracRet / 12)) + "/mo";
  concepts.push(concept("The 4% rule &amp; &ldquo;SWR&rdquo;", pct(gl.swr) + " for you", "what a pile of money pays per month",
    '<div class="expl-rows">' +
    row(eur(100000) + " invested", potPays(100000) + " after tax") +
    row(eur(500000) + " invested", potPays(500000) + " after tax") +
    row(eur(m.fireTarget) + " — your FIRE number", potPays(m.fireTarget) + " after tax", CV[i]) +
    row("Same rule, flipped", "save &asymp;" + Math.round(1 / (gl.swr || 0.04)) + "&times; your annual spending") +
    "</div>" +
    "<p>That's all a <strong>safe withdrawal rate</strong> is: the exchange rate between a pot and a monthly income. The famous 4% comes from studies of ~30-year retirements on US market history — shorthand, not a law.</p>" +
    (swr
      ? "<p>Your plan re-takes " + pct(gl.swr) + " of the <em>current</em> balance every year, so the pot can never fully empty — the real risk is <strong>lean years</strong> where " + pct(gl.swr) + " of a fallen portfolio doesn't cover the budget. That's why this app says &ldquo;funded vs short&rdquo;, never &ldquo;success rate&rdquo;, in this mode.</p>"
      : "<p>Your plan withdraws the budget regardless of markets, so the pot <em>can</em> run dry — and your " + (gl.lifeExp - retAge) + "-year retirement leans on it longer than the ~30 years the studies assumed. Your first-year draw: <strong>" + (m.portRet > 0 ? ((rows[retIdx] || {}).withdrawal || 0) / m.portRet * 100 : 0).toFixed(1) + "%</strong>.</p>")));

  // Coast FIRE
  const r0ret = portReturnAt(gl, currentAge, retAge);
  concepts.push(concept("Coast FIRE", eur(m.coastNow), "the point where saving becomes optional",
    '<div class="expl-rows">' +
    row("Coast number today", eur(m.coastNow)) +
    row("You have", eur(nwToday), m.coasting ? "ok" : "") +
    (m.coasting ? row("Status", "coasting &#x2713; — saving is optional", "ok")
                : row("Still to go", eur(Math.max(0, m.coastNow - nwToday)) + ' <span class="tgt">and the coast number falls each year</span>')) +
    "</div>" +
    "<p>" + eur(m.coastNow) + " left alone at roughly " + pct(r0ret) + "/yr growth becomes " + eur(proj.fireTarget) + " — your FIRE number — by age " + retAge + ". Past that balance you'd only need work to cover day-to-day costs; the retirement problem is already solved. No &ldquo;stop 5 years early&rdquo; folklore — it falls out of your own numbers, and it's the &#x1F513; marker on the timeline when the plan reaches it.</p>"));

  // Sequence-of-returns risk
  if (swr) {
    const b = m.incomeBreakdown || {};
    const floor = (b.pension || 0) + (b.partnerPension || 0) + (b.partnerSalary || 0);
    const badTotal = Math.round(0.7 * (b.portfolio || 0)) + floor;
    const shortfall = m.targetMonthly - badTotal;
    concepts.push(concept("Sequence-of-returns risk", "", "your first year, replayed with a crash",
      '<div class="expl-rows">' +
      row("Income, normal first year", eur(m.netMonthly) + '/mo <span class="tgt">vs ' + eur(m.targetMonthly) + " budget</span>", m.incomeOk ? "ok" : "err") +
      row("Same year after a &minus;30% crash", eur(badTotal) + "/mo", badTotal >= m.targetMonthly ? "ok" : "err") +
      (shortfall > 0 ? row("You'd have to trim", eur(shortfall) + "/mo that year", "err") : "") +
      row("Steady floor (pensions/partner)", eur(floor) + "/mo" + (floor === 0 ? ' <span class="tgt">none in year one</span>' : "")) +
      "</div>" +
      "<p>Same average return, different order, very different retirement: with a % draw a crash right after you stop earning shrinks your paycheck exactly when there's no salary to fall back on. The bigger the steady floor, the less it bites. The <strong>Monte Carlo</strong> tab replays real historical sequences against this exact plan to show how often lean years happen.</p>"));
  } else {
    const wdRate = m.portRet > 0 ? ((rows[retIdx] || {}).withdrawal || 0) / m.portRet * 100 : 0;
    concepts.push(concept("Sequence-of-returns risk", "", "why the first retirement years matter most",
      '<div class="expl-rows">' +
      row("Your first-year draw rate", wdRate.toFixed(1) + '% <span class="tgt">4% &asymp; the 30-year rule of thumb</span>', wdRate <= 4 ? "ok" : wdRate <= 5 ? "" : "err") +
      row("Your retirement length", (gl.lifeExp - retAge) + " years") +
      (m.depletionYear ? row("Average-path outcome", "runs out " + m.depletionYear, "err") : row("Average-path outcome", "lasts to " + gl.lifeExp + "+", "ok")) +
      "</div>" +
      "<p>Same average return, different order, very different retirement: withdrawing a fixed budget through a crash in the first decade locks in losses the portfolio may never recover from. This page shows the smooth average path; the <strong>Monte Carlo</strong> tab replays real historical sequences against this exact plan to show how often it survives them.</p>"));
  }

  // inflation / today's € vs future € — the same lifestyle at three dates
  const midIdx = Math.min(lastIdx, retIdx + Math.max(1, Math.round((lastIdx - retIdx) / 2)));
  concepts.push(concept("Today's € vs future €", "", "the same lifestyle at three dates",
    '<div class="expl-rows">' +
    row("Your lifestyle today", eur(gl.spendNow) + "/mo") +
    (nAccum > 0 ? row("Same lifestyle in " + m.retYear + " (retire)", eur(Math.round(gl.spendNow * infl(nAccum))) + "/mo") : "") +
    (midIdx > retIdx ? row("Same lifestyle in " + yearAt(midIdx) + " (age " + ageAt(midIdx) + ")", eur(Math.round(gl.spendNow * infl(midIdx))) + "/mo") : "") +
    row("Same lifestyle in " + yearAt(lastIdx) + " (age " + gl.lifeExp + ")", eur(Math.round(gl.spendNow * infl(lastIdx))) + "/mo") +
    "</div>" +
    "<p>Same life, bigger numbers — that's your " + pct(gl.inflation) + "/yr inflation assumption compounding. Charts and tables show the bigger (&ldquo;nominal&rdquo;) euros because that's what will actually leave your account; this page adds today's-€ tags so every future budget can be compared honestly against your life now.</p>"));

  // taxes on withdrawal
  concepts.push(concept("Tax when you sell", pct(gfr * gl.taxRate) + " effective", "why you must sell more than you spend",
    '<div class="expl-rows">' +
    row("To spend", eur(1000) + "/mo") +
    row("You must sell", eur(Math.round(1000 / netFracRet)) + "/mo") +
    row("Tax paid", eur(Math.round(1000 / netFracRet - 1000)) + "/mo", "err") +
    "</div>" +
    "<p>By your retirement about <strong>" + pct(gfr) + " of every euro you sell is capital gain</strong> (tracked by the engine year by year, not today's fraction), taxed at your country's flat " + pct(gl.taxRate) + " — so you keep €" + netFracRet.toFixed(2) + " per €1 sold. Every budget-to-portfolio conversion in this app, including your FIRE number, carries this gross-up. Flat-rate approximation, not tax advice.</p>"));

  // average path vs Monte Carlo
  concepts.push(concept("One smooth path vs real markets", "", "what this page hides, and where to see it",
    "<p>Everything here assumes returns arrive smoothly at their long-run average (" + pct(gl.stockRet) + " stocks / " + pct(gl.bondRet) + " bonds, blended along your glide path). Real markets deliver that average in lurches. The <strong>Monte Carlo</strong> tab takes this exact plan — same engine, same numbers — and replays it through hundreds of resampled historical return sequences. Treat this page as the map, Monte Carlo as the weather forecast.</p>"));

  const conceptsHtml = '<div class="expl-sect-hd">The jargon, in your numbers</div><div class="expl-concepts">' + concepts.join("") + "</div>";

  const foot = '<p class="expl-foot">Figures for future years are in that year’s euros unless tagged &ldquo;today’s €&rdquo; (the tag divides out your ' + pct(gl.inflation) + '/yr inflation assumption). Everything here is the single deterministic average-return path for the selected scenario; for the range of outcomes, see the Monte Carlo tab. Not financial advice.</p>';

  host.innerHTML =
    '<div class="expl-chips" role="group" aria-label="Choose a scenario">' + chips + "</div>" +
    lede + timeline + phasesHtml + conceptsHtml + foot;
}
