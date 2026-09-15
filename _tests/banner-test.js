/* THE BANNER: the art parses, the whole cycle draws, and the loop dies.
 *
 *     node _tests/banner-test.js
 *
 * Four things can go wrong here and not one of them shows up on a screenshot.
 *
 * A SCREENSHOT ONLY TESTS THE INSTANT IT LANDS ON. This is the spec's own
 * hardest-won rule and it is the reason for the sweep below: while it was being
 * drawn, a function went missing in a bulk edit and the page threw on every
 * frame after the chip. Three separate screenshots all happened to land before
 * it and all looked perfect. So this steps the entire cycle at four hundred
 * points through the real drawing code and counts the throws, rather than
 * sampling it and hoping.
 *
 * A HARD-CODED ARRAY LENGTH OUTLIVES THE ART. The same spec had a [0,1,2,3]
 * survive the move from four poses to eight, which left frames four to seven
 * undefined and killed the animation on the first frame that reached for one.
 * So the pose count is asserted to be derived from the art and not written down
 * twice.
 *
 * A TYPO IN A GRID IS A MISSING PIXEL NOBODY NOTICES. One letter per pixel over
 * eight leg poses and a body is a lot of characters, and a row that is 31 long
 * draws a notch in a boot you will look past for six weeks.
 *
 * AND THE CANVAS IS NOT CALLED "stage". The spec's own markup calls it that,
 * because on a page of its own that is the obvious name. In here #stage is the
 * one element every screen in the app is rendered into, so the two would have
 * fought over the single most load-bearing id in the file. That is asserted
 * here so nobody re-introduces it by pasting the spec in again.
 */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const REPO = path.join(__dirname, "..");
const html = fs.readFileSync(path.join(REPO, "index.html"), "utf8");
let fails = 0;
const check = (n, c, x) => {
  console.log((c ? "  PASS  " : "  FAIL  ") + n + (c ? "" : "   <-- " + x));
  if (!c) fails++;
};

/* ---------- the block, run for real against a recording canvas ----------
   Not a regex over the source. The banner is a closure that hands back four
   functions, so the honest test is to run it and drive it, and the only thing
   standing between here and that is a canvas. A recording stub is enough: the
   drawing code does not read anything back, it only paints. */
console.log("--- the banner block loads and runs ---");
const a0 = html.indexOf("/* ======================== THE BANNER ========================");
const a1 = html.indexOf("\nfunction renderSetup", a0);
check("the banner block is in the file", a0 > 0 && a1 > a0, a0 + ".." + a1);

const rec = { fills: 0, draws: 0, clears: 0, styles: new Set() };
const ctxStub = () => ({
  set fillStyle(v){ rec.styles.add(String(v)); }, get fillStyle(){ return "#000"; },
  imageSmoothingEnabled: false,
  setTransform(){}, clearRect(){ rec.clears++; }, fillRect(){ rec.fills++; },
  drawImage(){ rec.draws++; }, beginPath(){}, ellipse(){}, fill(){},
  translate(){}, scale(){}, save(){}, restore(){},
});
const canvasStub = () => ({ width: 0, height: 0, getContext: ctxStub });
const sandbox = {
  document: { createElement: () => canvasStub(), getElementById: () => canvasStub() },
  matchMedia: () => ({ matches: false }),
  requestAnimationFrame: () => 0, cancelAnimationFrame(){},
  Math: Math, console: console,
};
let BN = null, loadErr = null;
try { BN = vm.runInNewContext(html.slice(a0, a1) + ";BN", sandbox); }
catch (e) { loadErr = e; }
check("it evaluates without throwing", !loadErr, loadErr && loadErr.message);
check("and hands back its four functions",
  BN && typeof BN.start === "function" && typeof BN.stop === "function"
  && typeof BN.sweep === "function" && typeof BN.paint === "function", BN && Object.keys(BN).join());

/* ---------- the art ---------- */
console.log("\n--- the art is self consistent ---");
const grids = (BN && BN.art) || {PAL:{},BASE:[],LEGS:[],BALL:[],SQUASH:[],NUMBER:[]};
const letters = new Set(Object.keys(grids.PAL));
const widths = g => new Set(g.map(r => r.length));
check("the body is one width all the way down", widths(grids.BASE).size === 1,
  [...widths(grids.BASE)].join());
check("every leg pose is that same width",
  grids.LEGS.every(p => [...widths(p)][0] === [...widths(grids.BASE)][0]
    && widths(p).size === 1), "a pose is a different width");
check("and every pose is the same number of rows",
  new Set(grids.LEGS.map(p => p.length)).size === 1,
  grids.LEGS.map(p => p.length).join());
const stray = new Set();
for (const g of [grids.BASE, grids.SQUASH, grids.NUMBER].concat(grids.LEGS, grids.BALL))
  for (const row of g) for (const ch of row) if (!letters.has(ch)) stray.add(ch);
check("no character outside the palette", stray.size === 0, [...stray].join());
check("and no palette entry that nothing uses", (() => {
  const used = new Set();
  for (const g of [grids.BASE, grids.SQUASH, grids.NUMBER].concat(grids.LEGS, grids.BALL))
    for (const row of g) for (const ch of row) used.add(ch);
  return [...letters].every(k => used.has(k));
})(), "an unused colour");

/* THE POSE COUNT IS DERIVED. A [0,1,2,3] written down beside an eight-pose art
   set is the bug that killed this on its first frame, so the number the code
   uses has to come out of the art rather than out of a literal. */
console.log("\n--- the pose count comes out of the art ---");
check("the block reports as many poses as it has drawn",
  BN && BN.poses === grids.LEGS.length, BN && BN.poses + " vs " + grids.LEGS.length);
/* The bug shape exactly: a written-down list of indices handed straight to the
   frame builder. A data array that merely happens to begin 0, 1, 2, 3 is not
   this, and the first version of this check could not tell the two apart. */
check("and no literal pose list is handed to the frame builder",
  !/\[[\s\d,]+\]\s*\.map\s*\(\s*\w+\s*=>\s*build\(/.test(html.slice(a0, a1)),
  "a hard-coded pose list");

/* ---------- the whole cycle ---------- */
console.log("\n--- the whole cycle draws, not a sample of it ---");
const bad = BN ? BN.sweep(canvasStub(), .0025) : -1;
check("four hundred points through the cycle and nothing throws", bad === 0, bad);
check("and it actually painted", rec.fills > 1000 && rec.draws > 400,
  rec.fills + " fills, " + rec.draws + " blits");

/* ---------- the id, and the one it must not take ---------- */
console.log("\n--- it does not fight the app for an id ---");
check("the app still has exactly one #stage",
  (html.match(/\$\("#stage"\)/g) || []).length === 1,
  (html.match(/\$\("#stage"\)/g) || []).length);
/* the app's own container is legitimately id="stage". What must not exist is a
   CANVAS called that, which is what the spec's markup would have pasted in. */
check("no canvas has taken the app's stage id",
  html.indexOf('<canvas id="stage"') < 0, "the spec's own id got pasted in");
check("it is bnstage, once, in the menu head",
  (html.match(/id="bnstage"/g) || []).length === 1,
  (html.match(/id="bnstage"/g) || []).length);
check("and the canvas sits after the words, so the ball crosses in front",
  html.indexOf('<canvas id="bnstage"') > html.indexOf('<div class="words">'), "behind the type");

/* ---------- the loop's life ---------- */
console.log("\n--- the loop starts and stops with the menu ---");
const r0 = html.indexOf("function render()");
const rEnd = html.indexOf("\nfunction ", r0 + 20);
const body = html.slice(r0, rEnd);
check("render() stops it before it acquires the stage",
  body.indexOf("BN.stop()") > -1 && body.indexOf("BN.stop()") < body.indexOf('$("#stage")'),
  "not stopped first");
check("and nothing else in the file starts it",
  (html.match(/BN\.start\(\)/g) || []).length === 1,
  (html.match(/BN\.start\(\)/g) || []).length);
check("the frames are not built at parse time",
  !/^const (FRAME|BALLC)\s*=/m.test(html.slice(a0, a1)), "built eagerly");

/* ---------- and the loop follows the viewport, not only the menu ----------
   THERE IS NO SCROLLING IN HERE, so the honest way to test this is to hand the
   sandbox its own IntersectionObserver, let bnStart wire itself to it exactly
   as it does in a browser, and then be the browser: call the callback back with
   isIntersecting true and false and count the frames that get booked. That
   tests the wiring rather than a door cut into the side of it, which is why the
   closure hands out running() and nothing else.

   THE FAILURE THIS IS FOR IS INVISIBLE. Two chains painting the same canvas
   animate at exactly the right speed and cost twice the battery, so no
   screenshot and no pair of eyes can catch it. Frames booked can.

   AND THE FRAME HANDLE IS ZERO ON PURPOSE. Zero is a legal requestAnimationFrame
   handle and zero is falsy, so any guard that reads the handle as a yes or no
   falls over here. The old bnStart did exactly that. Running the whole sequence
   against a zero handle is what proves the replacement does not. */
console.log("\n--- the loop follows the viewport, and there is only ever one ---");
function rig(reduced){
  const box = {
    document:{ createElement:()=>canvasStub(), getElementById:()=>canvasStub() },
    matchMedia:()=>({ matches:!!reduced }),
    Math:Math, console:console,
    booked:0, cancelled:0, queue:[],
  };
  /* zero every time: the hostile-but-legal handle */
  box.requestAnimationFrame = fn => { box.booked++; box.queue.push(fn); return 0; };
  box.cancelAnimationFrame = () => { box.cancelled++; box.queue.length = 0; };
  box.IntersectionObserver = function(cb){
    box.fire = on => cb([{ isIntersecting:on }]);
    this.observe = () => {};
    this.disconnect = () => { box.dead = box.dead || []; box.dead.push(box.fire); };
  };
  /* one pending frame, delivered the way the browser would deliver it */
  box.tick = () => { const q = box.queue.splice(0); q.forEach(fn => fn(16)); };
  return { BN: vm.runInNewContext(html.slice(a0, a1) + ";BN", box), box };
}

const v = rig(false);
check("the closure reports whether a chain is alive",
  typeof v.BN.running === "function", Object.keys(v.BN).join());
check("and hands out no lever on the flags",
  v.BN.show === undefined && v.BN.see === undefined, Object.keys(v.BN).join());

const painted = rec.fills;
v.BN.start();
check("opening the menu books no frame until the viewport has spoken",
  v.box.booked === 0 && v.BN.running() === false, v.box.booked + " frames");
check("but it does paint the still, so the canvas is never blank",
  rec.fills > painted, "nothing painted");

v.box.fire(true);
check("the banner coming into view starts him", v.BN.running() === true, v.BN.running());
check("with exactly one frame booked", v.box.booked === 1, v.box.booked);

/* A scroll fires the observer repeatedly. Every one of these is a chance to
   start a second chain beside the first. */
const one = v.box.booked;
v.box.fire(true); v.box.fire(true); v.BN.start();
check("and no amount of asking again opens a second loop",
  v.box.booked === one, (v.box.booked - one) + " extra frames booked");

v.box.fire(false);
check("scrolling him off the top stops him", v.BN.running() === false, v.BN.running());
const parked = v.box.booked;
v.box.tick();
check("and nothing he had already queued paints its way back in",
  v.box.booked === parked && v.BN.running() === false, v.box.booked);

v.box.fire(true);
check("scrolling back brings him round again", v.BN.running() === true, v.BN.running());
check("with one frame and not two", v.box.booked === parked + 1, v.box.booked - parked);

/* THE ONE THE GENERATION COUNTER IS FOR. cancelAnimationFrame takes a queued
   callback off the queue, so in practice the parked chain is gone. This holds
   on to it anyway and delivers it after a restart, which is the only way a
   second chain could ever be booked, and asserts that the orphan dies. */
const orphan = v.box.queue[v.box.queue.length - 1];
v.box.fire(false); v.box.fire(true);
const alive = v.box.booked;
orphan(16);
check("a callback from a chain that was parked cannot book a frame",
  v.box.booked === alive, (v.box.booked - alive) + " frames from a dead chain");
check("and the live chain is still the only one running",
  v.BN.running() === true, v.BN.running());

v.BN.stop();
check("leaving the menu stops him", v.BN.running() === false, v.BN.running());
const gone = v.box.booked;
v.box.fire(true);
check("and a scroll arriving after that cannot wake him",
  v.BN.running() === false && v.box.booked === gone, v.box.booked - gone);
check("the observer was disconnected rather than left on a dead canvas",
  (v.box.dead || []).length > 0, "never disconnected");

/* reduced motion gets the still and nothing else, on a fresh instance, because
   the setting is read per start and this one has to answer differently */
const rm = rig(true);
rm.BN.start(); rm.box.fire(true); rm.box.fire(true);
check("reduced motion paints him once and books nothing",
  rm.box.booked === 0 && rm.BN.running() === false, rm.box.booked + " frames");

/* ---------- the front page's own regressions ----------
   Source checks, so they need no harness. Each one is a thing that goes back to
   how it was the moment somebody pastes an older copy of a block over the top. */
console.log("\n--- the ball on the front door is drawn, not fetched ---");
check("no kick button carries the 512 pixel photograph",
  !/class="mm-kick"[^>]*>[\s\S]{0,160}assets\/ball\.png/.test(html), "ball.png is back");
check("the ball is built out of the banner's own art",
  /function pxBallHTML\(\)[\s\S]{0,200}BN\.art/.test(html), "a second ball got drawn");
check("and it is the only ball on the page",
  (html.match(/pxBallHTML\(\)/g) || []).length === 2,
  (html.match(/pxBallHTML\(\)/g) || []).length + " call sites");
/* Run it for real against the live art rather than trusting the regex: the
   thing that breaks this is the art changing shape, not the function. */
const px = vm.runInNewContext(
  html.slice(html.indexOf("function pxBallHTML()"), html.indexOf("\n/* THE ONE TAP THAT FIXES")) +
  ";pxBallHTML()", { BN: BN });
check("it draws something, out of a nine by nine grid",
  px.indexOf('viewBox="0 0 9 9"') > -1 && (px.match(/<rect /g) || []).length > 20,
  px.slice(0, 80));
check("every colour in it came out of the banner's palette",
  (px.match(/fill="([^"]+)"/g) || []).every(f =>
    Object.values(BN.art.PAL).indexOf(f.slice(6, -1)) > -1), "a colour from nowhere");
check("and the box is a whole multiple of the grid",
  /\.mm-kick \.pxball\{width:27px/.test(html), "not 3x9");

console.log("\n--- the secondary buttons are still sentences ---");
check("the shared secondary rule transforms nothing",
  !/\.mm-ghost,\.rules summary\{[^}]*text-transform/.test(html), "uppercase is back");
check("and neither does the quiet one",
  !/\n  \.mm-quiet\{[^}]*text-transform/.test(html), "uppercase is back");
check("the rules summary is not a card",
  !/\.rules summary\{[^}]*border-radius:14px/.test(html), "the card came back");
check("and the icon inside it brings no margin of its own",
  /\.rules summary \.ic\{flex:none;margin:0\}/.test(html), "the .3em is back");
check("flex:1 is not sitting on a summary that can never use it",
  !/\.mm-ghost,\.rules summary\{flex:/.test(html), "an inert declaration");

console.log("\n--- the app has one name ---");
check("the title says it",
  html.indexOf("<title>BALL 3</title>") > -1, "the title still says BALL");
check("iOS is told the same thing, first in its own order of precedence",
  /apple-mobile-web-app-title" content="BALL 3"/.test(html), "no apple title");
check("and the button offering the home screen calls the app by its name",
  html.indexOf("Add BALL 3 to your home screen") > -1, "still says BALL");

/* ---------- and the fifty-one names stay inside ---------- */
console.log("\n--- nothing leaked out of the closure ---");
/* THE SECOND CLOSURE. The shot scene is built the same way and for the same
   reason, and it uses several of these same short names inside itself, which is
   precisely what a closure is for. So it is excised alongside the banner rather
   than being allowed to fail this. What is asserted here is that none of these
   names is loose at FILE level, not that one function in the app is the only
   one allowed a variable called ctx, and anything sitting between the two
   blocks is still caught. */
const s0 = html.indexOf("/* ======================== THE SHOT, IN PIXELS ===");
const s1 = html.indexOf("\n/* One footballer, built once", s0);
check("the shot scene is a closure too", s0 > 0 && s1 > s0, s0 + ".." + s1);
let outside = html;
for (const [x, y] of [[a0, a1], [s0, s1]].sort((p, q) => q[0] - p[0]))
  if (x > -1 && y > x) outside = outside.slice(0, x) + outside.slice(y);
const leaked = ["W", "H", "PAL", "BASE", "LEGS", "BALL", "draw", "goal", "ball", "pose", "line", "cv", "ctx"]
  .filter(n => new RegExp("^(?:const|let|var|function)\\s+" + n + "\\b", "m").test(outside));
check("none of the spec's top-level names is loose in the file",
  leaked.length === 0, leaked.join(" "));

console.log(fails ? "\n" + fails + " FAILING CHECK(S)" : "\nALL PASS");
process.exit(fails ? 1 : 0);
