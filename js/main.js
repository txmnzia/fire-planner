import { el } from "./util.js?v=8.6.2";
import { initInfoTips } from "./ui/infoTips.js?v=8.6.2";
import { state } from "./state.js?v=8.6.2";
import { recalc } from "./recalc.js?v=8.6.2";
import { loadState, initSync, scheduleSave, connectSync, disconnectSync,
         openSyncModal, closeSyncModal, syncNow, withoutSave } from "./sync.js?v=8.6.2";
import { switchTab, toggleFeature, updateToggleUI, scrollToScenario, updateScNav,
         updateAge, toggleTable, onWdMode, setActiveScenario } from "./ui/controls.js?v=8.6.2";
import { handleCSV } from "./ui/ibkr.js?v=8.6.2";
import { addNwRow, updateNwRow, removeNwRow } from "./ui/nwHistory.js?v=8.6.2";
import { initSituation, setPartnerModel } from "./ui/situation.js?v=8.6.2";
import { downloadCSV } from "./ui/table.js?v=8.6.2";
import { runMonteCarloUI, selectMcScenario } from "./ui/mcTab.js?v=8.6.2";
import { selectExplanationScenario } from "./ui/explanation.js?v=8.6.2";

// The HTML uses inline on* attributes (and render functions emit them too), so
// every function they reference must exist as a global.
Object.assign(window, {
  recalc, switchTab, toggleFeature, updateAge, onWdMode, setPartnerModel,
  toggleTable, downloadCSV, setActiveScenario, scrollToScenario,
  handleCSV, addNwRow, updateNwRow, removeNwRow,
  runMonteCarloUI, selectMcScenario, selectExplanationScenario,
  scheduleSave, connectSync, disconnectSync, openSyncModal, closeSyncModal, syncNow,
});

// ── INIT ───────────────────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
  // Tap/click bubbles for every (i) button: native title tooltips never show on a phone.
  initInfoTips();

  // Enhance the Situation-tab controls (sliders, year pickers, subject rail,
  // windfall list) BEFORE loadState — applyState() repaints them from saved data.
  initSituation();

  // Load state first — before updateAge/onWdMode which trigger recalc/scheduleSave
  // and would write empty defaults to localStorage before we get a chance to restore
  loadState();

  // Not a user edit: must not re-stamp the saved state's ts (see withoutSave).
  withoutSave(() => {
    for (let s = 1; s <= 5; s++) updateAge(s);
    onWdMode();
    updateToggleUI();
  });

  // Background Supabase sync (best-effort, non-blocking)
  initSync();

  // Sync scenario nav dots with horizontal scroll position
  const scGrid = document.querySelector('.sc-grid');
  if (scGrid) {
    let t;
    scGrid.addEventListener('scroll', () => {
      clearTimeout(t);
      t = setTimeout(() => {
        const cards = scGrid.querySelectorAll('.sc-card');
        if (!cards.length) return;
        const cardW = cards[0].offsetWidth;
        updateScNav(Math.min(4, Math.max(0, Math.round(scGrid.scrollLeft / cardW))));
      }, 80);
    }, { passive: true });
  }
  // Sync active scenario when user swipes the summary-tile carousel in Results
  const summaryRow = el('scSummaryRow');
  if (summaryRow) {
    let sr;
    summaryRow.addEventListener('scroll', () => {
      clearTimeout(sr);
      sr = setTimeout(() => {
        const tiles = summaryRow.querySelectorAll('.sc-summary-tile');
        if (!tiles.length) return;
        const tileW = tiles[0].offsetWidth + 8; // 8 = gap
        const newIdx = Math.min(4, Math.max(0, Math.round(summaryRow.scrollLeft / tileW)));
        if (newIdx !== state.activeScIdx) setActiveScenario(newIdx);
      }, 80);
    }, { passive: true });
  }

  // Swipe the Results charts left/right to change the active scenario
  function addChartSwipe(elm) {
    if (!elm) return;
    let x0 = null, y0 = null;
    elm.addEventListener('touchstart', e => { const t = e.changedTouches[0]; x0 = t.clientX; y0 = t.clientY; }, { passive: true });
    elm.addEventListener('touchend', e => {
      if (x0 == null) return;
      const t = e.changedTouches[0], dx = t.clientX - x0, dy = t.clientY - y0;
      if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy) * 1.3) {
        const ni = Math.min(4, Math.max(0, state.activeScIdx + (dx < 0 ? 1 : -1)));
        if (ni !== state.activeScIdx) setActiveScenario(ni);
      }
      x0 = y0 = null;
    }, { passive: true });
  }
  addChartSwipe(document.querySelector('.proj-canvas-wrap'));
  addChartSwipe(document.querySelector('.alloc-canvas-wrap'));
});
