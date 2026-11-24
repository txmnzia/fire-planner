// Banner listing missing inputs (from js/checks.js) under the tab bar, on every
// tab, with a button that jumps to the field. Text goes in via textContent.
import { el } from "../util.js?v=8.13";
import { allIssues } from "../checks.js?v=8.13";
import { switchTab } from "./controls.js?v=8.13";

export function renderIssues(scenarios, gl) {
  const box = el("inputIssues"); if (!box) return;
  const issues = allIssues(scenarios, gl);
  box.hidden = issues.length === 0;
  box.replaceChildren();
  for (const i of issues) {
    const row = document.createElement("div"); row.className = "issue";
    const t = document.createElement("span"); t.textContent = "⚠ " + i.text;
    const b = document.createElement("button"); b.type = "button"; b.className = "issue-fix"; b.textContent = "Fix";
    b.setAttribute("aria-label", "Go to the missing field");
    b.addEventListener("click", () => {
      switchTab("situation");
      const f = el(i.field);
      if (f) { f.scrollIntoView({ block: "center", behavior: "smooth" }); setTimeout(() => f.focus({ preventScroll: true }), 300); }
    });
    row.append(t, b); box.append(row);
  }
}
