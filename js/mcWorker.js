// Monte Carlo in the background (v8.30, issue #21). A module worker so the page
// never freezes while thousands of paths run (≈2 s on a laptop, more on a phone).
// It only relays: all the maths is montecarlo.js → engine.js, the same pure code
// the tests cover. One message in = one run; the page terminates this worker when
// newer inputs arrive (latest wins), so there is no cancellation logic here.
import { runMonteCarloOrdered } from "./montecarlo.js?v=8.34";

self.onmessage = (e) => {
  const { gen, scenarios, gl, cfg, order } = e.data;
  try {
    runMonteCarloOrdered(scenarios, gl, cfg, order, (i, result) => self.postMessage({ gen, i, result }));
    self.postMessage({ gen, done: true });
  } catch (err) {
    self.postMessage({ gen, error: String(err && err.message || err) });
  }
};
