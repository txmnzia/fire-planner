import { el, eur } from "../util.js";
import { state } from "../state.js";
import { getScenarioName } from "../inputs.js";
import { portReturnAt, yearOneBudget } from "../engine.js";
import { computeCardMetrics } from "./cards.js";

// ── EXPLANATION TAB ──────────────────────────────────────────────────────────
// A plain-language, scenario-tailored walkthrough of what happens at each life
// milestone, illustrated with THIS scenario's actual numbers. It never computes
// a financial figure of its own: headline numbers come from computeCardMetrics
// (the same source as the Scenario cards) and per-year composition comes from
// the engine's own `proj.rows[]`. Only the selected scenario and the active
// withdrawal mode (SWR vs Fixed) are shown, so the page mirrors the user's setup.

const CV = ["s1c", "s2c", "s3c", "s4c", "s5c"];
const LETTER = ["A", "B", "C", "D", "E"];

// selected scenario for this tab only — deliberately independent of the Results
// tab's active scenario so browsing the guide doesn't disturb the charts.
let explIdx = 0;

const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const mo  = n => eur(Math.round(n / 12));           // annual € → monthly €
const pct = n => (Math.round(n * 1000) / 10) + "%"; // 0.04 → "4%"

function row(k, v, cls) { return '<div class="expl-row"><span class="k">' + k + '</span><span class="v ' + (cls || "") + '">' + v + "</span></div>"; }
function card(tone, step, when, lead, rows) {
  return '<section class="expl-card ' + tone + '">' +
    '<div class="expl-card-main">' +
      '<div class="expl-card-hd"><span class="expl-step">' + step + "</span>" +
      (when ? '<span class="expl-when">' + when + "</span>" : "") + "</div>" +
      '<p class="expl-lead">' + lead + "</p>" +
    "</div>" +
    (rows ? '<div class="expl-rows">' + rows + "</div>" : "") + "</section>";
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
  const ageAt = idx => currentAge + idx;
  const yearAt = idx => baseYear + idx;

  // ── chips ──
  let chips = "";
  scenarios.forEach((s, k) => {
    chips += '<button class="expl-chip' + (k === i ? " active" : "") + '" style="--cc:var(--' + CV[k] + ')"' +
      ' aria-pressed="' + (k === i) + '" onclick="selectExplanationScenario(' + k + ')">' +
      '<span class="expl-chip-dot"></span>' + LETTER[k] + " · " + esc(getScenarioName(k)) + "</button>";
  });

  // ── strategy header + tailored mode explainer ──
  const stratName = swr ? "% of Portfolio (" + pct(gl.swr) + " withdrawal)" : "Fixed Amount";
  const already = retAge <= currentAge;
  const summary =
    '<div class="expl-summary" style="border-color:' + cv + '">' +
    '<span class="expl-summary-name" style="color:' + cv + '">' + esc(getScenarioName(i)) + "</span>" +
    '<span class="expl-summary-meta">Retire at ' + retAge + " &middot; " + m.retYear +
    (already ? " (already reached)" : " (in " + nAccum + "y)") + "  &middot;  " + stratName + "</span></div>";
  const modeNote = swr
    ? '<p class="expl-mode">You use the <strong>% of Portfolio</strong> strategy: each year you may take <strong>' +
      pct(gl.swr) + " of whatever your portfolio is worth that year</strong>. It can never fully run out, but the amount you can spend rises and falls with the markets — so the question at each step is <strong>whether that draw still covers your budget</strong>, not whether the money lasts."
    : '<p class="expl-mode">You use the <strong>Fixed Amount</strong> strategy: you spend a set budget (grown with inflation) every year, and the portfolio has to keep up. That means it <strong>can run out</strong> if markets disappoint — so the question at each step is <strong>how the balance holds up</strong> and whether it lasts to age ' + gl.lifeExp + ".</p>";

  // ── milestone 1: today ──
  const r0 = rows[0] || {};
  const nwToday = (gl.invested || 0) + gl.cash;
  const savedY = r0.netFlow || 0;
  const saveRate = (r0.income > 0) ? Math.round(savedY / r0.income * 100) : null;
  // "years of retirement spending banked" — net worth ÷ retirement budget expressed
  // in today's money (the FI odometer; ~25× ≈ the 4% rule is met).
  const inflAtRet = Math.pow(1 + gl.inflation, nAccum);
  const budgetTodayAnn = yearOneBudget(retAge, sc, gl) / (inflAtRet || 1);
  const yearsBanked = budgetTodayAnn > 0 ? nwToday / budgetTodayAnn : null;
  let todayRows =
    row("Net worth", eur(nwToday) + ' <span class="tgt">(' + eur(gl.invested || 0) + " invested + " + eur(gl.cash) + " cash)</span>", CV[i]) +
    row("Income this year", eur(r0.income || 0) + ' <span class="tgt">' + mo(r0.income || 0) + "/mo</span>") +
    row("Spending this year", eur(r0.spending || 0) + ' <span class="tgt">' + mo(r0.spending || 0) + "/mo</span>");
  if (!already) todayRows += row("You save", (savedY >= 0 ? "+" : "") + eur(savedY) + "/yr" + (saveRate != null ? " (" + saveRate + "% of income)" : ""), savedY >= 0 ? "ok" : "err");
  if (yearsBanked != null) todayRows += row("Retirement spending banked", yearsBanked.toFixed(1) + " years" + ' <span class="tgt">of your ' + eur(Math.round(budgetTodayAnn)) + "/yr budget</span>", yearsBanked >= 25 ? "ok" : "");
  const todayLead = already
    ? "You've already reached your retirement age in this scenario, so the plan starts drawing down straight away."
    : "Right now you're building the portfolio. You plan to retire in <strong>" + nAccum + " years</strong>, at age <strong>" + retAge + "</strong> (" + m.retYear + ").";
  let html = chips ? '<div class="expl-chips" role="group" aria-label="Choose a scenario">' + chips + "</div>" : "";
  html += summary + modeNote + '<div class="expl-timeline">';
  html += card("neutral", "Today", yearAt(0) + " &middot; age " + currentAge, todayLead, todayRows);

  // ── milestone 2: coast ──
  // The question this answers: from what age could you STOP contributing (still
  // covering day-to-day costs from work, not touching the portfolio) and have
  // market growth alone carry the balance to your FIRE number by retirement.
  // There is no fixed "5 years early" rule — it's computed from the plan.
  if (!already) {
    const growth = (fromAge, toAge) => { let g = 1; for (let a = fromAge; a < toAge; a++) g *= (1 + portReturnAt(gl, a, retAge)); return g; };
    // earliest projection year k where freezing contributions still reaches the
    // FIRE number by retirement (vals[k] = start-of-year net worth at year k).
    let coastIdx = null;
    for (let k = 0; k <= retIdx; k++) { if ((vals[k] || 0) * growth(ageAt(k), retAge) >= proj.fireTarget) { coastIdx = k; break; } }
    // in SWR mode, the same crossover against the realistic (adjusted) target that
    // credits guaranteed future pensions & partner income — usually far earlier.
    let coastIdxAdj = null;
    if (gl.wdMode === "swr" && proj.fireTargetAdj < proj.fireTarget * 0.99)
      for (let k = 0; k <= retIdx; k++) { if ((vals[k] || 0) * growth(ageAt(k), retAge) >= proj.fireTargetAdj) { coastIdxAdj = k; break; } }
    // if frozen at idx, the age the balance would grow into the FIRE number (may
    // be after retirement — i.e. you'd delay drawdown by that many years).
    const reachAgeFrozenAt = idx => { let a = ageAt(idx), p = vals[idx] || 0; while (p < proj.fireTarget && a < 121) { p *= (1 + portReturnAt(gl, a, retAge)); a++; } return p >= proj.fireTarget ? a : null; };
    const adjNote = (gl.wdMode === "swr" && proj.fireTargetAdj < proj.fireTarget * 0.99)
      ? " Counting the pensions and partner income you'll actually receive (your lower " + eur(proj.fireTargetAdj) + " target), you could stop even earlier." : "";
    const ruleLine = " There's no fixed rule for how early that is — it's not always &ldquo;5 years before&rdquo; — it depends on how far ahead of target you get. For this scenario:";
    const coastLine = "<strong>Coast FIRE</strong> is the point where you can stop investing new money — still covering your day-to-day costs from work — and let market growth alone carry the portfolio to your FIRE number by retirement." + ruleLine;
    let tone, when, lead, rows;
    if (m.coasting) {
      tone = "ok"; when = "already coasting";
      lead = coastLine + " <strong>You're already there.</strong> You could stop investing today and still reach your " + eur(proj.fireTarget) + " target by " + m.retYear + " on market growth alone.";
      rows = row("You can stop investing", "now &middot; age " + currentAge, "ok") +
        row("Years before retirement", nAccum + "y") +
        row("Net worth today", eur(nwToday)) +
        row("FIRE number by " + m.retYear, eur(proj.fireTarget));
    } else if (coastIdx != null && coastIdx < retIdx) {
      const yrsEarly = retAge - ageAt(coastIdx);
      tone = "ok"; when = "coast at age " + ageAt(coastIdx);
      lead = coastLine + " On plan, from <strong>age " + ageAt(coastIdx) + "</strong> (" + yearAt(coastIdx) + ") you could stop investing — <strong>" + yrsEarly + " year" + (yrsEarly === 1 ? "" : "s") + " before you retire</strong> — and markets alone would carry you to your " + eur(proj.fireTarget) + " target by " + retAge + "." + adjNote;
      rows = row("Stop investing at", "age " + ageAt(coastIdx) + " &middot; " + yearAt(coastIdx), "ok") +
        row("Years before retirement", yrsEarly + "y", "ok") +
        row("Years you still contribute", coastIdx + "y") +
        row("Net worth at that point", eur(vals[coastIdx] || 0));
    } else if (coastIdxAdj != null && coastIdxAdj < retIdx) {
      // can't coast against the cautious target, but can against the realistic one
      const yrsEarly = retAge - ageAt(coastIdxAdj);
      tone = "neutral"; when = "coast at age " + ageAt(coastIdxAdj) + " w/ pensions";
      lead = coastLine + " Against the cautious " + eur(proj.fireTarget) + " target you'd keep investing until retirement — but that number gives no credit for the pensions and partner income you'll actually receive. Counting those (a realistic " + eur(proj.fireTargetAdj) + " target), from <strong>age " + ageAt(coastIdxAdj) + "</strong> (" + yearAt(coastIdxAdj) + ") you could stop investing — <strong>" + yrsEarly + " year" + (yrsEarly === 1 ? "" : "s") + " before you retire</strong>.";
      rows = row("Stop investing at", "age " + ageAt(coastIdxAdj) + " &middot; " + yearAt(coastIdxAdj) + ' <span class="tgt">pensions counted</span>', "ok") +
        row("Years before retirement", yrsEarly + "y", "ok") +
        row("Cautious FIRE number", eur(proj.fireTarget)) +
        row("Realistic (pensions counted)", eur(proj.fireTargetAdj), "ok");
    } else {
      // never gets far enough ahead to coast before retirement (cutting it close)
      tone = "warn"; when = "no early coast on plan";
      const stopIdx = Math.max(0, retIdx - 3);
      const reachAge = reachAgeFrozenAt(stopIdx);
      const delay = reachAge != null ? Math.max(0, reachAge - retAge) : null;
      lead = coastLine + " You're <strong>cutting it close</strong> — this plan needs your contributions right up to retirement to hit the target on time, so there's no comfortable window to stop early." +
        (reachAge != null ? " For a feel: stop <strong>3 years early</strong> (age " + ageAt(stopIdx) + ", keep covering costs from work) and you'd reach the number around age " + reachAge + " — about " + delay + " year" + (delay === 1 ? "" : "s") + " past your target." : "") + adjNote;
      rows = row("Earliest full coast", "at retirement (age " + retAge + ")") +
        (reachAge != null ? row("Stop 3y early instead", "reach target at age " + reachAge + ' <span class="tgt">+' + delay + "y vs target</span>") : "") +
        row("FIRE number", eur(proj.fireTarget)) +
        (adjNote ? row("With pensions counted", eur(proj.fireTargetAdj) + ' <span class="tgt">lower target</span>') : "");
    }
    html += card(tone, "Reaching &ldquo;coast&rdquo;", when, lead, rows);
  }

  // ── milestone 3: at retirement ──
  {
    const rr = rows[retIdx] || {};
    const budgetMo = rr.spending != null
      ? Math.round(((rr.spending || 0) + (rr.childCost || 0) + (rr.mortgagePayment || 0) - (rr.rentSavings || 0)) / 12)
      : 0;
    let retTone, retLead, retRows;
    if (swr) {
      const b = m.incomeBreakdown || {};
      retTone = m.incomeOk ? "ok" : "bad";
      retLead = "You switch from saving to drawing " + pct(gl.swr) + " of the portfolio. In year one that draw " +
        (m.incomeOk ? "<strong>covers</strong>" : "<strong>falls short of</strong>") + " your budget of <strong>" + eur(m.targetMonthly) + "/mo</strong>.";
      retRows =
        row("Net worth at retirement", eur(m.portRet), CV[i]) +
        row("FIRE number needed", eur(m.fireTarget)) +
        row("Monthly income", eur(m.netMonthly) + ' <span class="tgt">/ ' + eur(m.targetMonthly) + " budget</span>", m.incomeOk ? "ok" : "err") +
        '<div class="expl-sub">where it comes from</div>' +
        row("&nbsp;&nbsp;Portfolio draw (after tax)", eur(b.portfolio || 0)) +
        (b.pension ? row("&nbsp;&nbsp;State pension", eur(b.pension)) : "") +
        (b.partnerPension ? row("&nbsp;&nbsp;Partner pension", eur(b.partnerPension)) : "") +
        (b.partnerSalary ? row("&nbsp;&nbsp;Partner salary", eur(b.partnerSalary)) : "") +
        '<div class="expl-sub">what the budget covers</div>' +
        row("&nbsp;&nbsp;Living spending", mo(rr.spending || 0)) +
        (rr.childCost ? row("&nbsp;&nbsp;Child costs", mo(rr.childCost)) : "") +
        (rr.mortgagePayment ? row("&nbsp;&nbsp;Mortgage", mo(rr.mortgagePayment)) : "") +
        (rr.rentSavings ? row("&nbsp;&nbsp;Rent saved", "&minus;" + mo(rr.rentSavings), "ok") : "");
    } else {
      const netDraw = (rr.withdrawal || 0) - (rr.taxPaid || 0);
      const otherInc = (rr.pension || 0) + (rr.partnerPension || 0) + (rr.income || 0);
      retTone = m.ok ? "ok" : "bad";
      retLead = "You stop saving and start living off the portfolio. Your portfolio of <strong>" + eur(m.portRet) +
        "</strong> is " + (m.ok ? "<strong>above</strong>" : "<strong>below</strong>") + " the <strong>" + eur(m.fireTarget) + "</strong> FIRE number it needs to fund this plan.";
      retRows =
        row("Net worth at retirement", eur(m.portRet), CV[i]) +
        row("FIRE number needed", eur(m.fireTarget)) +
        row(m.ok ? "Surplus" : "Gap", (m.ok ? "+" : "") + eur(m.surplus), m.ok ? "ok" : "err") +
        '<div class="expl-sub">first retirement year (' + yearAt(retIdx) + ")</div>" +
        row("&nbsp;&nbsp;Budget to fund", eur((rr.spending || 0) + (rr.childCost || 0) + (rr.mortgagePayment || 0) - (rr.rentSavings || 0)) + ' <span class="tgt">' + eur(budgetMo) + "/mo</span>") +
        row("&nbsp;&nbsp;Portfolio withdrawal", eur(rr.withdrawal || 0) + (rr.taxPaid ? ' <span class="tgt">incl. ' + eur(rr.taxPaid) + " tax</span>" : "")) +
        (otherInc ? row("&nbsp;&nbsp;Other income", eur(otherInc) + ' <span class="tgt">pension / partner</span>') : "");
    }
    const retStep = already ? "You're retired" : "At retirement";
    html += card(retTone, retStep, m.retYear + " &middot; age " + retAge, retLead, retRows);
  }

  // ── milestone 3b: the early years — the trade-offs & drawbacks of the strategy ──
  {
    const rr = rows[retIdx] || {};
    const retLen = Math.max(0, gl.lifeExp - retAge);
    let tone, when, lead, tradeRows;
    if (swr) {
      const b = m.incomeBreakdown || {};
      const floor = (b.pension || 0) + (b.partnerPension || 0) + (b.partnerSalary || 0); // income that doesn't move with markets
      const badTotal = Math.round(0.7 * (b.portfolio || 0)) + floor;                     // draw after a −30% year
      const shortfall = m.targetMonthly - badTotal;
      tone = "neutral"; when = "sequence-of-returns risk";
      lead = "Living off a <strong>% of the portfolio</strong> has one big upside and one real drawback. " +
        "<strong>Upside:</strong> you can never fully run out — you always draw a slice of what's left, so the money outlives you. " +
        "<strong>Drawback:</strong> your income <strong>swings with the market</strong>. A bad run early in retirement doesn't threaten survival, it <strong>shrinks your paycheck</strong> — and since the draw feeds on a smaller base after a crash, the leanest years often come first, right when you've just stopped earning. Your pensions and partner income are the part that doesn't move, so the bigger that floor, the steadier you are. " +
        "<em>(The Fixed Amount approach trades this the other way: steadier income, but a portfolio that can be depleted.)</em>";
      tradeRows =
        row("Income, normal year", eur(m.netMonthly) + ' <span class="tgt">/ ' + eur(m.targetMonthly) + " budget</span>", m.incomeOk ? "ok" : "err") +
        row("Income after a &minus;30% year", eur(badTotal) + ' <span class="tgt">/ ' + eur(m.targetMonthly) + "</span>", badTotal >= m.targetMonthly ? "ok" : "err") +
        (shortfall > 0 ? row("&nbsp;&nbsp;you'd trim by", eur(shortfall) + "/mo that year", "err") : "") +
        row("Steady floor (pensions/partner)", eur(floor) + "/mo" + (floor === 0 ? ' <span class="tgt">none yet</span>' : "")) +
        row("Portfolio can run out?", "no — by design", "ok");
    } else {
      const wdRate = m.portRet > 0 ? (rr.withdrawal || 0) / m.portRet * 100 : 0;
      tone = m.depletionYear ? "bad" : "neutral"; when = "sequence-of-returns risk";
      lead = "Living off a <strong>fixed real amount</strong> flips the trade-off. " +
        "<strong>Upside:</strong> your income is <strong>predictable</strong> — the same inflation-adjusted budget every year, no market-watching. " +
        "<strong>Drawback:</strong> the portfolio <strong>can run dry</strong>. The danger is <strong>sequence of returns</strong> — a crash in the first decade, while you keep withdrawing a fixed sum, can do damage the portfolio never recovers from. Retiring early sharpens this: a " + retLen + "-year retirement leans on the money far longer than the ~30 years the classic 4% rule was built for, so a lower draw rate is safer. " +
        "<em>(The % of Portfolio approach trades this the other way: it can't deplete, but your income would rise and fall with markets.)</em>";
      tradeRows =
        row("Fixed budget (real)", mo((rr.spending || 0) + (rr.childCost || 0) + (rr.mortgagePayment || 0) - (rr.rentSavings || 0)) + "/mo") +
        row("First-year draw rate", wdRate.toFixed(1) + "% of portfolio" + ' <span class="tgt">4% ≈ 30-yr rule</span>', wdRate <= 4 ? "ok" : wdRate <= 5 ? "" : "err") +
        row("Retirement length", retLen + " years") +
        (m.depletionYear
          ? row("Portfolio outcome", "runs out " + m.depletionYear, "err")
          : row("Portfolio outcome", "lasts to age " + gl.lifeExp + " (avg path)", "ok"));
    }
    html += card(tone, "The early years — your strategy's trade-off", when, lead, tradeRows);
  }

  // ── milestone 4: settling in / state pension ──
  const pensionApplies = gl.pensionAge > retAge && (gl.pensionAge - currentAge) <= (gl.lifeExp - currentAge);
  let idx4 = pensionApplies
    ? Math.min(lastIdx, gl.pensionAge - currentAge)
    : Math.min(lastIdx - 1, retIdx + Math.max(5, Math.round((lastIdx - retIdx) / 2)));
  if (idx4 > retIdx && idx4 <= lastIdx && idx4 >= 0) {
    const r4 = rows[idx4] || {};
    const budget4 = (r4.spending || 0) + (r4.childCost || 0) + (r4.mortgagePayment || 0) - (r4.rentSavings || 0);
    const netDraw4 = (r4.withdrawal || 0) - (r4.taxPaid || 0);
    let step4, lead4, tone4 = "neutral", rows4;
    if (pensionApplies) {
      step4 = "State pension begins";
      lead4 = "From age <strong>" + gl.pensionAge + "</strong> your state pension of about <strong>" + mo(r4.pension || 0) +
        "/mo</strong> starts (grown with inflation), so the portfolio has to provide that much less each year.";
    } else {
      step4 = "Well into retirement";
      lead4 = "A typical later year, to show how the plan settles once you've been retired a while.";
    }
    rows4 =
      row("Portfolio left (start of year)", eur(vals[idx4] || 0), (vals[idx4] || 0) > 0 ? "" : "err") +
      row("Budget this year", eur(budget4) + ' <span class="tgt">' + mo(budget4) + "/mo</span>") +
      (r4.pension ? row("State pension", eur(r4.pension) + ' <span class="tgt">' + mo(r4.pension) + "/mo</span>", "ok") : "") +
      (r4.partnerPension ? row("Partner pension", eur(r4.partnerPension), "ok") : "") +
      (r4.income ? row("Partner salary", eur(r4.income), "ok") : "") +
      row("Portfolio draw" + (r4.taxPaid ? " (after tax)" : ""), eur(netDraw4));
    if (swr && r4.swrTarget) {
      const okY = (r4.swrIncome || 0) >= (r4.swrTarget || 0);
      rows4 += row("Draw vs budget", eur(r4.swrIncome || 0) + ' <span class="tgt">/ ' + eur(r4.swrTarget) + "</span>", okY ? "ok" : "err");
      if (pensionApplies) tone4 = okY ? "ok" : "warn";
    }
    html += card(tone4, step4, yearAt(idx4) + " &middot; age " + ageAt(idx4), lead4, rows4);
  }

  // ── milestone 5: end of plan ──
  {
    const finalNW = Math.round(proj.finalNetWorth);
    let endTone, endLead, endRows;
    if (m.depletionYear) {
      endTone = "bad";
      endLead = "On this average-return path the portfolio <strong>runs out in " + m.depletionYear + "</strong> (age " +
        (currentAge + m.depletionYear - baseYear) + "), before your life expectancy of " + gl.lifeExp + ". You'd need to retire later, spend less, or save more.";
      endRows = row("Runs out", m.depletionYear + " &middot; age " + (currentAge + m.depletionYear - baseYear), "err") +
        row("FIRE number was", eur(m.fireTarget));
    } else if (swr) {
      endTone = "ok";
      endLead = "Because the % strategy only ever takes a slice of what's left, it <strong>never fully depletes</strong>. On the average path you reach age " + gl.lifeExp + " with money to spare — the real-world risk isn't running out, it's lean years where the draw dips below budget. The <strong>Monte Carlo</strong> tab shows how often that happens.";
      endRows = row("Net worth at age " + gl.lifeExp, eur(finalNW), finalNW > 0 ? "ok" : "") +
        row("Ever underfunded?", m.infeasibleYear ? "yes, from " + m.infeasibleYear : "no", m.infeasibleYear ? "err" : "ok");
    } else {
      endTone = "ok";
      endLead = "On this average-return path the portfolio <strong>lasts to age " + gl.lifeExp +
        "</strong> with about <strong>" + eur(finalNW) + "</strong> left. Remember this assumes a smooth average return — the <strong>Monte Carlo</strong> tab tests it against real market ups and downs.";
      endRows = row("Net worth at age " + gl.lifeExp, eur(finalNW), "ok") +
        row("Survives to", "age " + gl.lifeExp + "+", "ok");
    }
    if (m.infeasibleYear && !m.depletionYear && !swr)
      endRows += row("&#9888; Underfunded from", m.infeasibleYear + " (savings exhausted)", "err");
    html += card(endTone, "End of the plan", gl.baseYear + (gl.lifeExp - currentAge) + " &middot; age " + gl.lifeExp, endLead, endRows);
  }

  html += "</div>"; // /expl-timeline
  html += '<p class="expl-foot">Figures for future years are in that year’s euros (they include inflation), just like the projection chart. This is the single deterministic average-return path; for the range of outcomes, see the Monte Carlo tab. Not financial advice.</p>';
  host.innerHTML = html;
}
