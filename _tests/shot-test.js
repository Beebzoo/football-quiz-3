/* THE SHOT SCENE, DRIVEN FRAME BY FRAME AND READ OFF ITS OWN GEOMETRY.
 *
 *     node _tests/shot-test.js
 *
 * The scene is drawn with Zdog now rather than stamped from pixel grids, so
 * there is no framebuffer worth reading: a sphere is a stroked point and a
 * shirt is a thick line, and a cell's last colour says nothing about where a
 * ball is. What the scene has instead is a read-back, G3.last(), which after
 * every paint says where the ball, the gloves and the two men landed in the
 * canvas's logical pixels. Everything below asks that, and asks the markup
 * the same questions it always asked.
 *
 * THE FOUR THINGS THIS EXISTS TO CATCH.
 *
 * THE PICKER COMING OFF THE GOAL. The overlay is pinned to four percentages
 * that mouth() works out of the same camera the frame is drawn from. The
 * honest test is not that the numbers are inside the frame, it is that a ball
 * the scene sends to "top left" arrives in the top left quarter of the
 * rectangle the picker was handed, on every camera.
 *
 * A KEEPER THROWN THE WRONG WAY. He is given a corner and has to finish with
 * his gloves in that quarter of the mouth, and all four corners have to be
 * four different dives.
 *
 * A FRAME THAT THROWS SOMEWHERE IN THE MIDDLE. Every camera, every outcome
 * and both mirrors are stepped end to end and the throws are counted.
 *
 * AND getContext AT PARSE TIME, which has taken this whole suite down twice.
 */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const REPO = path.join(__dirname, "..");
const html = fs.readFileSync(path.join(REPO, "index.html"), "utf8");
const src = html.replace(/\r\n/g, "\n");
const harness = fs.readFileSync(path.join(__dirname, "mp-test.js"), "utf8");
const head = harness.slice(0, harness.indexOf("/* ---------- drive an instance from outside ---------- */"));
eval(head.replace(/^const (fs|vm|path) = require\(.*\);$/gm, ""));

const ev = (c, e) => vm.runInContext("(" + e + ")", c);
const run = (c, s) => vm.runInContext(s, c);
const tick = (ms = 200) => new Promise(r => setTimeout(r, ms));
const stage = c => (c.__els["stage"] ? c.__els["stage"].innerHTML : "");
let fails = 0;
const check = (n, c, x) => {
  console.log((c ? "  PASS  " : "  FAIL  ") + n + (c ? "" : "   <-- got: " + x));
  if (!c) fails++;
};

/* ---------- the block, as text ---------- */
const g0 = src.indexOf("/* ======================== THE SHOT, IN ZDOG ===");
const g1 = src.indexOf("\n/* One footballer, built once", g0);
check("the scene is in the file where it was", g0 > 0 && g1 > g0, g0 + "/" + g1);
const block = src.slice(g0, g1);
check("and the page loads Zdog before it", /<script src="assets\/vendor\/zdog\.dist\.min\.js"><\/script>/.test(src) &&
  src.indexOf("zdog.dist.min.js") < g0, "no vendor script tag ahead of the scene");
check("and the service worker ships it", /assets\/vendor\/zdog\.dist\.min\.js/.test(fs.readFileSync(path.join(REPO, "sw.js"), "utf8")),
  "zdog is not precached");

/* ---------- nothing touches a context at parse time ---------- */
console.log("\n--- getContext is only ever reached from a paint ---");
const firstCtx = block.indexOf("getContext(");
const buildAt = block.indexOf("function build(");
check("no getContext call sits ahead of the scene builder", firstCtx === -1 || firstCtx > buildAt, firstCtx + " vs " + buildAt);
check("the drawing waits for an element", /function paint\(u, el\)\{\n  const cv = el \|\| canvasEl\(\);\n  if\(!cv \|\| !cv\.getContext \|\| !PEND\) return false;/.test(block),
  "paint no longer guards the element");

/* ---------- the stylesheet still holds the overlay to the frame ---------- */
console.log("\n--- the picker and the shout ---");
const css = src.slice(src.indexOf("<style>"), src.indexOf("</style>"));
check("the picker is still pinned to them",
  /\.h2gm\{position:absolute;left:var\(--gmL\);right:var\(--gmR\);top:var\(--gmT\);height:var\(--gmH\)/.test(css),
  "the overlay has come off the custom properties");
check("and it still sits over the keeper rather than under the goal",
  /\.h2gm\{[^}]*z-index:7/.test(css), "wrong stacking");
check("h2GoalSceneHTML is the only thing that writes them",
  (src.match(/--gmL:/g) || []).length === 1, (src.match(/--gmL:/g) || []).length);
check("the canvas is no longer told to stay pixelated", !/\.g3c\{[^}]*pixelated/.test(css), "image-rendering:pixelated is still on it");
check("a man who asked for less movement is painted the END of the shot",
  /if\(PEND\.hold \|\| PEND\.rm\)\{ paint\(PEND\.hold \? STILL : 1\); return; \}/.test(block) &&
  /cfg\.rm = still\(\);/.test(block),
  "reduced motion does not hold the last frame");
check("and the shout stops moving with it",
  /@media \(prefers-reduced-motion: reduce\)\{\n\s*\.g3\.scored \.g3-cry,\.g3\.saved \.g3-cry,\.g3\.missed \.g3-cry\{animation:none;opacity:1\}/.test(css),
  "the shout still animates");

/* ---------- a canvas the scene will accept ---------- */
const canvasStub = (W, H) => {
  let calls = 0; const props = {};
  const c = new Proxy({}, {
    get: (t, k) => (k in props) ? props[k] : (k === "measureText" ? () => ({ width: 10 }) :
      (k === "createLinearGradient" || k === "createRadialGradient") ? () => ({ addColorStop() {} }) : () => { calls++; }),
    set: (t, k, v) => { props[k] = v; return true; } });
  return { el: { nodeName: "CANVAS", width: W, height: H, style: {}, getContext: () => c }, get calls() { return calls; } };
};

(async () => {
  const app = makeInstance("shot");
  await tick(340);
  const WC = JSON.parse(fs.readFileSync(path.join(REPO, "assets/wc2006/index.json"), "utf8"));
  run(app, "TEAMS.wc2006 = " + JSON.stringify(WC));
  run(app, "h2TackleOn = false;");

  const SZ = ev(app, "G3.size");
  const CW = SZ.CW, CH = SZ.CH;
  const CAMS = Object.keys(ev(app, "G3.cams"));
  const CORNERS = ev(app, "H2_CORNERS");
  const T0 = ev(app, "G3.clock");
  check("the canvas is the same shape the page lays out for", Math.abs(CW / CH - 124 / 84) < .01, CW + "x" + CH);

  run(app, `function __cfg(o){
    const base = {cam:"close", flip:false, out:"scored", shot:"tl", dive:"tl", hold:false, no:9,
      kit:"#e04a34", shorts:"#ffffff", gkKit:"#3d7ae8", gkShorts:"#111111", ink:"#ffffff", sig:"t" + Math.random()};
    return Object.assign(base, o || {});
  }`);
  const draw = (o, u) => {
    const can = canvasStub(CW, CH);
    app.__can = can.el;
    run(app, "G3.arm(__cfg(" + JSON.stringify(o) + ")); G3.stop();");
    run(app, "G3.paint(" + u + ", __can)");
    const last = ev(app, "G3.last()");
    return Object.assign({ calls: can.calls }, last || {});
  };
  const mouthPx = cam => {
    const m = ev(app, "G3.mouth(" + JSON.stringify(cam) + ")");
    const l = m.L / 100 * CW, r = CW - m.R / 100 * CW, t = m.T / 100 * CH, b = t + m.H / 100 * CH;
    return { l, r, t, b, cx: (l + r) / 2, cy: (t + b) / 2, m };
  };
  const quarter = (p, M, c) => (c[1] === "l" ? p.x < M.cx : p.x > M.cx) && (c[0] === "t" ? p.y < M.cy : p.y > M.cy);

  /* ---------- the one that matters ---------- */
  console.log("\n--- the picker is pinned to the goal that got painted ---");
  for (const cam of CAMS) {
    const M = mouthPx(cam);
    check(cam + ": all four numbers are inside the frame",
      M.m.L > 0 && M.m.R > 0 && M.m.T > 0 && M.m.H > 0 && M.m.T + M.m.H < 100 && M.m.L + M.m.R < 100, JSON.stringify(M.m));
    check(cam + ": the goal is centred, so a mirrored shot keeps the same picker", M.m.L === M.m.R, M.m.L + "/" + M.m.R);
    for (const c of CORNERS) {
      const r = draw({ cam, out: "scored", shot: c, dive: null }, T0.land);
      check(cam + ": a ball sent " + c + " arrives in that quarter of the picker",
        quarter(r.ball, M, c) && r.ball.x > M.l && r.ball.x < M.r && r.ball.y > M.t - 4 && r.ball.y < M.b + 4,
        JSON.stringify(r.ball) + " in " + JSON.stringify([Math.round(M.l), Math.round(M.t), Math.round(M.r), Math.round(M.b)]));
    }
  }
  /* AND THE SAME NUMBERS REACH THE SCREEN. */
  const mouthOf = s => {
    const m = s.match(/--gmL:([\d.]+)%;--gmR:([\d.]+)%;--gmT:([\d.]+)%;--gmH:([\d.]+)%/);
    return m ? { L: +m[1], R: +m[2], T: +m[3], H: +m[4] } : null;
  };

  /* ---------- four corners, four dives ---------- */
  console.log("\n--- a keeper who called the bottom left does not play the top left frame ---");
  const M0 = mouthPx("close");
  const G = {};
  for (const c of CORNERS) G[c] = draw({ dive: c, out: "saved", shot: c }, T0.land).gloves;
  check("he has gloves in all four", CORNERS.every(c => G[c]), JSON.stringify(G));
  for (const c of CORNERS)
    check("for the " + c + " his gloves finish in that quarter of the mouth", quarter(G[c], M0, c),
      JSON.stringify(G[c]) + " about " + Math.round(M0.cx) + "," + Math.round(M0.cy));
  check("the two low corners put them lower than the two high ones",
    G.bl.y > G.tl.y + 10 && G.br.y > G.tr.y + 10, JSON.stringify([G.tl.y, G.bl.y, G.tr.y, G.br.y]));
  check("the two left corners put them left of the two right ones",
    G.tl.x < G.tr.x - 20 && G.bl.x < G.br.x - 20, JSON.stringify([G.tl.x, G.tr.x, G.bl.x, G.br.x]));
  check("and all four are genuinely different places", new Set(CORNERS.map(c => G[c].x + "," + G[c].y)).size === 4, JSON.stringify(G));
  /* a save gets there, a goal falls short: the gloves on a goal are nearer the keeper's own body than on a save */
  const short = draw({ dive: "tr", out: "scored", shot: "tl" }, T0.land).gloves;
  check("beaten, he falls short of the corner he went for",
    Math.hypot(short.x - M0.cx, short.y - M0.cy) < Math.hypot(G.tr.x - M0.cx, G.tr.y - M0.cy) - 6,
    JSON.stringify([short, G.tr]));
  const stood = draw({ dive: null, hold: true }, 0.16).gloves;
  check("and standing on his line he is doing none of it",
    Math.abs(stood.x - M0.cx) < 30 && stood.y > M0.cy, JSON.stringify(stood) + " about " + Math.round(M0.cx) + "," + Math.round(M0.cy));

  /* ---------- the run-up ---------- */
  console.log("\n--- there is a run-up, and the strike waits for it ---");
  const manAt = u => draw({ hold: false }, u).man;
  const m0 = manAt(0.01), mA = manAt(T0.arrive), mC = manAt(T0.cock), mE = manAt(0.99);
  check("he starts to the side of it", Math.abs(m0.x - mA.x) > 20, m0.x + " -> " + mA.x);
  check("and nearer the camera, because he comes from behind", m0.y > mA.y + 10, m0.y + " -> " + mA.y);
  check("he has arrived before the leg goes back", Math.abs(mC.x - mA.x) <= 5 && Math.abs(mE.x - mA.x) <= 5,
    mC.x + "/" + mA.x + "/" + mE.x);
  const ballAt = u => draw({ hold: false, out: "scored" }, u).ball;
  const b0 = ballAt(0.02), bHit = ballAt(T0.hit - .01);
  check("the ball is still on his boot through the whole approach",
    Math.abs(b0.x - bHit.x) <= 1 && Math.abs(b0.y - bHit.y) <= 1, JSON.stringify([b0, bHit]));
  check("and it sits outside the foot that kicks it, which is his right",
    bHit.x > mA.x + 8, JSON.stringify([bHit, mA]));
  check("and it is gone by the time he has followed through", ballAt(T0.thru).y < bHit.y - 20, JSON.stringify([bHit, ballAt(T0.thru)]));
  const flipped = draw({ hold: false, flip: true }, T0.hit - .01);
  check("mirrored, it sits outside his left", flipped.ball.x < flipped.man.x - 8, JSON.stringify(flipped));

  /* ---------- where it finishes ---------- */
  console.log("\n--- the three endings look like three different things ---");
  const endOf = o => draw(Object.assign({ hold: false }, o), 0.995).ball;
  const goal = endOf({ out: "scored", shot: "tr", dive: "bl" });
  const save = endOf({ out: "saved", shot: "tr", dive: "tr" });
  const over = endOf({ out: "over", shot: "tr", dive: null });
  check("a goal finishes inside the goal", goal.x > M0.l && goal.x < M0.r && goal.y > M0.t && goal.y < M0.b + 2,
    JSON.stringify(goal) + " mouth " + JSON.stringify([Math.round(M0.l), Math.round(M0.t), Math.round(M0.r), Math.round(M0.b)]));
  check("a save finishes somewhere else entirely", Math.abs(save.x - goal.x) > 30 || Math.abs(save.y - goal.y) > 30, JSON.stringify([goal, save]));
  check("and one over the bar is above it", over.y < M0.t - 10, JSON.stringify(over) + " bar " + Math.round(M0.t));
  const netHit = draw({ hold: false, out: "scored", shot: "tr", dive: "bl" }, T0.land + .04);
  check("the net takes it", netHit.bulge > .5, netHit.bulge);
  check("and has settled by the end", draw({ hold: false, out: "scored", shot: "tr", dive: "bl" }, 0.995).bulge === 0,
    draw({ hold: false, out: "scored" }, 0.995).bulge);

  /* ---------- nothing throws, anywhere ---------- */
  console.log("\n--- every camera, every ending, both ways round ---");
  let bad = 0, blank = 0;
  for (const cam of CAMS) for (const out of ["scored", "saved", "over"]) for (const flip of [false, true]) {
    const can = canvasStub(CW, CH);
    app.__can = can.el;
    run(app, "G3.arm(__cfg(" + JSON.stringify({ cam, out, flip, shot: "br", dive: "tl" }) + ")); G3.stop();");
    const n = ev(app, "G3.sweep(__can, .01)");
    if (n !== 0) bad += Math.max(n, 1);
    if (can.calls < 20000) blank++;
  }
  check("not one frame of any of them throws", bad === 0, bad);
  check("and not one of them comes out empty", blank === 0, blank);

  /* ---------- the app picks the camera, nobody chooses it ---------- */
  console.log("\n--- which camera, read off the shape ---");
  check("a penalty is a penalty whoever is taking it",
    ev(app, "G3.cameraFor(9, 0, true)") === "pen" && ev(app, "G3.cameraFor(7, 0, true)") === "pen",
    ev(app, "G3.cameraFor(9, 0, true)"));
  check("the striker is six yards out", ev(app, "G3.cameraFor(9, 0, false)") === "close", ev(app, "G3.cameraFor(9, 0, false)"));
  check("a winger is shooting from the angle",
    ev(app, "G3.cameraFor(8, 0, false)") === "angle" && ev(app, "G3.cameraFor(10, 0, false)") === "angle",
    ev(app, "G3.cameraFor(8, 0, false)") + "/" + ev(app, "G3.cameraFor(10, 0, false)"));
  check("and the ten is outside the box, bending it round somebody",
    ev(app, "G3.cameraFor(7, 0, false)") === "curler", ev(app, "G3.cameraFor(7, 0, false)"));
  const shapes = ev(app, "Object.keys(H2_SHAPES)");
  const stray = [];
  for (const id of shapes) {
    run(app, 'S = freshState(["a","b"], false, "classic", 0, "pitch", false); h2Start(); S.h2h.form = ["' + id + '","' + id + '"];');
    const n = ev(app, "h2Shape(0).length");
    for (let i = 0; i < n; i++) {
      if (!ev(app, "H2_SHOT_AT(" + i + ", 0)")) continue;
      const cam = ev(app, "G3.cameraFor(" + i + ", 0, false)");
      if (CAMS.indexOf(cam) < 0) stray.push(id + "[" + i + "]=" + cam);
    }
  }
  check("every man in every shape who is allowed a shot gets a camera", stray.length === 0, stray.join(" "));

  /* ---------- and the whole thing, through the app ---------- */
  console.log("\n--- driven for real ---");
  const start = async () => {
    run(app, 'S = freshState(["Martijn","Bram"], false, "classic", 0, "pitch", false); h2Start(); S.h2h.subs=[0,0]; ' +
             'h2PickTeam("Netherlands"); h2PickTeam("Italy"); render();');
    await tick(180);
    run(app, '(() => { const H = S.h2h; H.toss = 0; S.phase = "h_pick"; H.who = 0; H.at = 9; })(); render();');
    await tick(140);
  };
  await start();
  run(app, "h2Shoot()"); await tick(170);
  run(app, "h2Reveal()"); await tick(130);
  run(app, "h2Judge(true)"); await tick(180);
  check("a clean strike puts him on the corner picker", ev(app, "S.phase") === "h_aim", ev(app, "S.phase"));
  const aim = stage(app);
  check("the scene is one canvas", (aim.match(/class="g3c"/g) || []).length === 1, (aim.match(/class="g3c"/g) || []).length);
  check("with the four corners over it", (aim.match(/class="h2gmc /g) || []).length === 4, (aim.match(/class="h2gmc /g) || []).length);
  const aimM = mouthOf(aim);
  check("and the mouth on the element is this camera's mouth",
    aimM && JSON.stringify(aimM) === JSON.stringify((() => {
      const m = ev(app, "G3.mouth(G3.cameraFor(S.h2h.at, S.h2h.who, false))");
      return { L: m.L, R: m.R, T: m.T, H: m.H };
    })()), JSON.stringify(aimM));
  check("both men are named over it",
    aim.includes(ev(app, "h2Who(9,0)")) && aim.includes(ev(app, "h2Who(0,1)")), "the men are anonymous");

  run(app, "h2Aim('tl')"); await tick(150);
  if (ev(app, "S.phase") === "h_hand") { run(app, "h2HandGo()"); await tick(150); }
  const dive = stage(app);
  check("the keeper is choosing", ev(app, "S.phase") === "h_dive", ev(app, "S.phase"));
  check("and the corner the striker picked is nowhere in what he is looking at",
    !/\b(tl|tr|bl|br)\b/.test(dive.replace(/class="h2gmc [a-z]+"/g, "").replace(/h2Dive\('[a-z]+'\)/g, "")),
    "a corner leaked onto the keeper's screen");
  check("no corner is lit on it", !/class="h2gmc [a-z]+ on"/.test(dive), "a corner is already picked");
  check("all four are offered identically", (dive.match(/aria-pressed="false"/g) || []).length === 4,
    (dive.match(/aria-pressed="false"/g) || []).length);
  check("and the scene is held rather than looping under his decision",
    ev(app, "(function(){ var r = false; try { r = G3.sweep(null) === -1; } catch(e){ r = String(e); } return r; })()") === true,
    "the still scene could not be checked");
  check("and the scene armed under him is held, with no shot in it",
    (() => { const a = ev(app, "G3.armed()"); return a && a.hold === true; })(), JSON.stringify(ev(app, "G3.armed()")));

  run(app, "h2Dive('br')"); await tick(240);
  const strike = stage(app);
  check("the reveal is the same canvas", strike.includes('class="g3c"'), "no canvas");
  check("it says GOAL", strike.includes("GOAL") && /class="g3 scored"/.test(strike), "no call");
  const cry = strike.match(/--g3cry:([\d.]+)s/);
  check("and the shout waits for the ball to arrive",
    cry && +cry[1] > T0.land * SZ.dur / 1000 && +cry[1] < SZ.dur / 1000, cry ? cry[1] : "no --g3cry");

  /* ---------- the kits are the match's ---------- */
  console.log("\n--- both kits come off the match, not out of the art ---");
  const armed = ev(app, "G3.armed()");
  const kitHome = ev(app, "h2Kit(0)"), kitAway = ev(app, "h2Kit(1)");
  check("the man who hit it is in his country's kit", armed && armed.kit === kitHome, JSON.stringify(armed) + " vs " + kitHome);
  check("the keeper is in the other one", armed && armed.gkKit === kitAway, JSON.stringify(armed) + " vs " + kitAway);
  check("and neither of them is the prototype's red and blue",
    kitHome !== kitAway && armed.kit !== "#e04a34" && armed.gkKit !== "#3d7ae8", JSON.stringify(armed));
  const no = String(ev(app, "h2No(S.h2h.at, S.h2h.who)")).replace(/[^0-9]/g, "").slice(-2);
  check("the number on his back is his own", no.length > 0 && String(armed.no).replace(/[^0-9]/g, "").slice(-2) === no,
    "shirt " + no + " got " + armed.no);
  /* and the frame it paints is this match's, through the real element path */
  const can2 = canvasStub(CW, CH);
  app.__can = can2.el;
  run(app, "G3.paint(0.16, __can)");
  check("and it paints through the element it is handed", can2.calls > 1500, can2.calls);

  /* ---------- the shootout, which has no duel behind it ---------- */
  console.log("\n--- a shootout still draws something sensible ---");
  run(app, '(() => { const H = S.h2h; H.so = {a:[], b:[], turn:0}; H.pen = true; H.shot = null; H.dive = null; })();');
  const soHTML = ev(app, 'h2GoalSceneHTML("set")');
  check("it builds without a corner to draw", soHTML.includes('class="g3c"'), soHTML.slice(0, 80));
  check("and from twelve yards, with nobody in the way",
    ev(app, "G3.cameraFor(S.h2h.at, S.h2h.who, true)") === "pen" && ev(app, "G3.cams.pen.def") === null,
    ev(app, "G3.cameraFor(S.h2h.at, S.h2h.who, true)"));
  const soMiss = ev(app, 'h2GoalSceneHTML("missed")');
  check("a kick put over the bar says so", soMiss.includes("OVER") && /class="g3 missed"/.test(soMiss), soMiss.slice(0, 60));
  const can3 = canvasStub(CW, CH);
  app.__can = can3.el;
  run(app, "G3.paint(0.99, __can)");
  const so = ev(app, "G3.last()");
  const Mp = mouthPx("pen");
  check("and the keeper who was never told anything is still on his line",
    so && so.gloves && Math.abs(so.keeper.x - Mp.cx) < 40 && so.gloves.y > Mp.cy, JSON.stringify(so && so.keeper));

  console.log(fails ? "\n" + fails + " FAILING CHECK(S)" : "\nALL PASS");
  process.exit(fails ? 1 : 0);
})();
