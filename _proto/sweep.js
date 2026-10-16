/* step every frame of the app's Zdog shot scene (read out of index.html), every camera, outcome, corner
   and mirror, under a stub canvas, and count the frames that throw run: node _proto/sweep.js */
const fs = require("fs"), path = require("path"), vm = require("vm");
const REPO = path.join(__dirname, "..");
const ctxStub = () => new Proxy({ canvas: null }, {
  get: (t, k) => (k in t) ? t[k] : (k === "measureText" ? () => ({ width: 10 }) :
       (k === "createLinearGradient" || k === "createRadialGradient") ? () => ({ addColorStop(){} }) : () => undefined),
  set: (t, k, v) => { t[k] = v; return true; },
});
const canvas = () => ({ nodeName: "CANVAS", width: 620, height: 420, style: {}, getContext: () => ctxStub() });
const sandbox = { console, Math, Date, JSON, Object, Array, String, Number, Boolean, Error, parseInt, parseFloat, isNaN,
  devicePixelRatio: 1, requestAnimationFrame: () => 1, cancelAnimationFrame(){}, addEventListener(){}, removeEventListener(){},
  matchMedia: () => ({ matches: false }), document: { getElementById: () => null } };
sandbox.window = sandbox; sandbox.self = sandbox; sandbox.globalThis = sandbox;
const ctx = vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(REPO, "assets/vendor/zdog.dist.min.js"), "utf8"), ctx);
const html = fs.readFileSync(path.join(REPO, "index.html"), "utf8").replace(/\r\n/g, "\n");
const a = html.indexOf("/* ======================== THE SHOT, IN ZDOG ==="), b = html.indexOf("\n/* One footballer, built once", a);
vm.runInContext(html.slice(a, b), ctx);
const G4 = vm.runInContext("G3", ctx);
let bad = 0, frames = 0, worst = null;
const corners = ["tl", "tr", "bl", "br"];
for (const cam of Object.keys(G4.cams)) for (const out of ["scored", "saved", "over"]) for (const flip of [false, true])
  for (const shot of corners) for (const dive of [null, "tl", "br"]) {
    const cfg = { cam, flip, out, shot, dive, hold: false, no: 9, kit: "#e04a34", shorts: "#fff", gkKit: "#3d7ae8", gkShorts: "#111",
      sig: [cam, out, flip, shot, dive].join("|") };
    G4.arm(cfg); G4.stop();
    const el = canvas();
    for (let u = 0; u <= 1.0001; u += .02) {
      frames++;
      try { if (!G4.paint(u, el)) { bad++; worst = worst || (cfg.sig + " @" + u + " paint returned false"); } }
      catch (e) { bad++; worst = worst || (cfg.sig + " @" + u.toFixed(2) + " " + e.stack.split("\n").slice(0, 2).join(" | ")); }
    }
  }
/* the mouth: every camera inside the frame, and the picker never off the goal */
let mouthBad = [];
for (const cam of Object.keys(G4.cams)) {
  const m = G4.mouth(cam);
  if (!(m.L > 0 && m.R > 0 && m.T > 0 && m.H > 0 && m.T + m.H < 100 && m.L + m.R < 100)) mouthBad.push(cam + " " + JSON.stringify(m));
}
console.log("frames", frames, "threw", bad, worst ? "\nfirst: " + worst : "");
console.log("mouths", mouthBad.length ? mouthBad.join("; ") : "all four inside the frame");
for (const cam of Object.keys(G4.cams)) console.log("  ", cam, JSON.stringify(G4.mouth(cam)), JSON.stringify(G4.marks(cam, false)));
process.exit(bad || mouthBad.length ? 1 : 0);
