/* THE THREE OF US, HANGING ON THE YOUR CLUB BANNER.
 *
 * Heads over the bar, four fingers on its top edge, and the one you tap comes
 * up far enough to show his shirt and his flag. What makes this worth a file is
 * not the toggling, which is three lines, but the four ways it can be quietly
 * wrong, and three of those are invisible without a browser.
 *
 * THE FACES ARE PAINTED AT ALL. BALL 2 had a sixteen-bit skin whose
 * body.pixel .fig > * blanked background-image on every part of every figure,
 * and these three are the only men in the app with faces, so it took two
 * !important declarations to beat it. BALL 3 has no skin, so the declarations
 * are all there is and they are what gets asserted.
 *
 * HOW MUCH OF A MAN SHOWS. "Heads only" and "not more than mid body" are the
 * whole brief and they are geometry, so they are checked as geometry: the
 * figure is 22 units tall with the head at rows 0 to 4, the flag on the chest
 * at 6 to 7.5 and the shorts from 13. A number that drifts past 13 is a man
 * standing up, and nothing on a screenshot would tell you which side of the
 * line you were on.
 *
 * THE PAGE JUMPING. The room above the bar is paid for once so that a man
 * standing up does not shove the banner and everything under it down the page.
 * That is one declaration and losing it would be a regression nobody would
 * describe as a bug, only as "it feels jumpy".
 *
 * AND THE COUNT LEAVING THE APP'S OWN RANGE. setupCount is offered on the setup
 * page as exactly two pills. A strip that can set it to one produces a state no
 * pill can light and nothing else in the app can reach.
 */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const REPO = path.join(__dirname, "..");
const harness = fs.readFileSync(path.join(__dirname, "mp-test.js"), "utf8");
const head = harness.slice(0, harness.indexOf("/* ---------- drive an instance from outside ---------- */"));
eval(head);

const stage = ctx => ctx.__els["stage"] ? ctx.__els["stage"].innerHTML : "";
const ev = (c, e) => vm.runInContext("(" + e + ")", c);
const run = (c, s) => vm.runInContext(s, c);
const tick = (ms = 160) => new Promise(r => setTimeout(r, ms));
const R = p => JSON.parse(fs.readFileSync(path.join(REPO, p), "utf8"));
const SRC = fs.readFileSync(path.join(REPO, "index.html"), "utf8");

let fails = 0;
const check = (n, c, x) => {
  if (c) console.log("  PASS  " + n);
  else { fails++; console.log("  FAIL  " + n + "   <-- got: " + x); }
};

(async () => {
  const app = makeInstance("us");
  const up = () => ev(app, "usUp");
  const names = () => ev(app, "setupNames");
  const count = () => ev(app, "setupCount");
  const rx = (h, n) => (h.match(new RegExp(n, "g")) || []).length;

  await tick(340);
  /* THE CLUB SECTION IS NOT ON THE PAGE UNTIL THE CLASSIC PACK LANDS, which is
     dailyCardHTML's own first line, so there is no banner to hang off before
     then and therefore nobody hanging. That is the right behaviour and it is
     why this has to be loaded before anything below can be looked for. */
  run(app, 'DECKS["classic-mc"] = ' + JSON.stringify(R("assets/mc/index.json")) + ";");
  run(app, "S = null; showBoard = false; render();");
  await tick(240);

  console.log("--- they hang on the banner, not in a box of their own ---");
  let h = stage(app);
  check("nobody at all before the pack lands",
    ev(app, '(() => { const d = DECKS["classic-mc"]; delete DECKS["classic-mc"]; ' +
      'const out = dailyCardHTML(); DECKS["classic-mc"] = d; return out; })()') === "",
    "the club section drew without its deck");
  check("they are inside the Your club banner",
    /mm-eyebrow">Your club<span class="usheads"/.test(h), "not on the banner");
  check("all three of them", rx(h, 'class="uspeek') === 3, rx(h, 'class="uspeek'));
  check("each is the app's own figure", rx(h, 'class="fig us"') === 3, rx(h, 'class="fig us"'));
  check("each in a window that clips him", rx(h, 'class="usman"') === 3, rx(h, 'class="usman"'));
  check("two hands each", rx(h, "usgrip") === 6, rx(h, "usgrip"));
  /* NO BACKGROUND OF THEIR OWN. The first version of this gave them a green
     pitch to stand on, which was a second green panel on a page that already
     had one. They hang off the bar now and the bar is the only thing painted. */
  const hung = h.slice(h.indexOf("usheads"), h.indexOf("mm-list"));
  check("and no panel behind them", !/background|usline|h2xipitch/.test(hung),
    "something is painted behind them");

  console.log("\n--- their faces and flags are painted ---");
  check("the face is painted onto the head",
    /\.fig\.us \.f-head::after\{[^}]*background-image:var\(--usface\)/.test(SRC),
    "the face is not declared, so nothing paints it");
  check("and the flag onto the chest",
    /\.fig\.us \.f-torso\{[^}]*background-image:var\(--usflag\)/.test(SRC),
    "the flag is not declared, so nothing paints it");
  /* THE HEAD UNDERNEATH HAS TO GO QUIET. The drawing is the whole head, so the
     skull fill and the hair bar over it would both sit on top of a real face.
     No !important anywhere: there is no skin to out-shout any more, and
     .fig.us .f-head::after already beats .f-head::after on specificity. */
  check("the plain head and its hair are turned off under a drawn face",
    /\.fig\.us \.f-head\{background:none/.test(SRC) &&
    /\.fig\.us \.f-head::after\{[^}]*background:none/.test(SRC),
    "the drawn face will have a skull and a fringe on top of it");
  const men = ev(app, "US.length");
  check("every one of them has a face and a flag",
    (SRC.match(/--usface:url\("data:image\/svg\+xml;base64,/g) || []).length === men &&
    (SRC.match(/--usflag:url\("data:image\/svg\+xml;base64,/g) || []).length === men,
    "a face or a flag is missing");

  console.log("\n--- heads only, and never past mid body ---");
  /* THE BRIEF IS GEOMETRY so it is checked as geometry. The figure is 22 units:
     head 0-4, chest with the flag 6-7.5, shorts from 13. */
  const unit = re => { const m = SRC.match(re); return m ? parseFloat(m[1]) : null; };
  const rest = unit(/height:calc\(var\(--ush\) \* ([\d.]+) \/ 22\)[^}]*\}\s*\.uspeek\.up/);
  const risen = unit(/--usup:calc\(var\(--ush\) \* ([\d.]+) \/ 22\)/);
  check("at rest he is a head and a jaw, not a torso",
    rest !== null && rest > 4 && rest < 6, rest);
  check("risen he clears the flag on his chest, which ends at 7.5",
    risen !== null && risen >= 8, risen);
  check("and he never reaches the shorts, which start at 13",
    risen !== null && risen < 13, risen);
  check("so risen is more than at rest and both are under half of him",
    risen > rest && risen <= 11, rest + " -> " + risen);

  console.log("\n--- and the page does not jump when he stands ---");
  /* THE ROOM IS PAID FOR ONCE. Without this the banner and everything under it
     shifts down every time somebody is tapped, which nobody reports as a bug,
     only as "it feels jumpy". */
  check("the space above the bar is reserved for the tallest state",
    /\.mm-club\{[^}]*padding-top:var\(--usup\)/.test(SRC), "the page will shift on a tap");
  /* THE WINDOW IS THE HEIGHT OF THE BUTTON, and this is the one that shipped
     broken. .usman used to be a fixed --usup with overflow:hidden, so it drew
     ten units of man whatever the button said and the button's height only
     moved his top about: ducking somebody slid his shirt down OVER the banner
     instead of cutting him off at it, because .usheads lives inside the eyebrow
     and its children paint on top of it. Exactly one thing may have a size. */
  check("the clipping window is the button's own height, not a fixed one",
    /\.usman\{[^}]*height:100%;overflow:hidden\}/.test(SRC),
    "the window has its own height again, so nobody will be clipped");
  check("and the row hangs off the bar rather than sitting in the flow",
    /\.usheads\{position:absolute;[^}]*bottom:100%/.test(SRC), "it is in the flow");
  /* THE FINGERS DO NOT RISE WITH HIM, which is the whole joke and is one rule. */
  check("the fingers stay on the line while he goes up",
    /\.uspeek\.up \.usgrip\{opacity:0/.test(SRC) && !/\.uspeek\.up[^{]*\.usgrip\{[^}]*bottom/.test(SRC),
    "the hands go up with him");

  console.log("\n--- they start behind the wall ---");
  /* THE JOKE IS THREE PEOPLE HIDING and it cannot land if nobody is hiding, so
     a fresh page has everybody down. This is asserted on the markup as well as
     the state, because "up" is a class and a state that never reached the class
     would look exactly like a bug in the CSS. */
  run(app, 'localStorage.removeItem("ball3-us"); usUp = usLoad(); render();');
  await tick(220);
  check("nobody is up on a fresh page", up().length === 0, JSON.stringify(up()));
  check("and no head on the page is wearing a shirt",
    rx(stage(app), "uspeek us-[a-z]+ up") === 0, rx(stage(app), "uspeek us-[a-z]+ up"));

  console.log("\n--- and every one of them answers ---");
  /* THERE USED TO BE A FLOOR OF TWO ON THE MEN, so once one had ducked the
     other two stopped responding: three heads on the page and two that did
     nothing. A control that ignores you is worse than one that is not there.
     Every man is walked up and back down to prove all three take a tap. */
  const keys = ev(app, "US.map(m => m.k)");
  for (const k of keys) { run(app, "usTap(" + JSON.stringify(k) + ");"); await tick(90); }
  check("tapping each of them brings all three up", up().length === keys.length,
    JSON.stringify(up()));
  check("and the page shows three shirts", rx(stage(app), "uspeek us-[a-z]+ up") === 3,
    rx(stage(app), "uspeek us-[a-z]+ up"));
  for (const k of keys) { run(app, "usTap(" + JSON.stringify(k) + ");"); await tick(90); }
  check("and tapping each again puts all three back down", up().length === 0,
    JSON.stringify(up()));

  console.log("\n--- the floor is on the count, not on the people ---");
  run(app, "setMode('classic'); setPlay('board');");
  await tick(220);
  const pills = (stage(app).match(/setCount\((\d)\)/g) || []).map(x => +x.replace(/\D/g, ""));
  check("the page offers two counts and they are 2 and 3",
    pills.length === 2 && Math.min(...pills) === 2, JSON.stringify(pills));
  /* AN EMPTY WALL IS A FINE THING TO LOOK AT. With nobody up the count sits at
     the minimum and the boxes fall back to the placeholders they have always
     had, which is the state this page opened in long before any of this. */
  check("with nobody up the count is still a quiz", count() >= Math.min(...pills), count());
  check("and the boxes are handed back to their placeholders",
    names().slice(0, 3).every(n => !n), JSON.stringify(names()));
  run(app, "usTap(" + JSON.stringify(keys[0]) + ");");
  await tick();
  check("one man up still leaves room for a second", count() >= Math.min(...pills), count());
  check("and he is in the first box", names()[0] === ev(app, "US[0].n"), JSON.stringify(names()));
  run(app, "usTap(" + JSON.stringify(keys[1]) + "); usTap(" + JSON.stringify(keys[2]) + ");");
  await tick();
  check("all three up is a three-player quiz", count() === 3, count());
  check("and the slot behind a man who ducks gets emptied", (() => {
    run(app, "usTap(" + JSON.stringify(keys[2]) + ");");
    return names()[2] === "";
  })(), JSON.stringify(names()));

  console.log("\n--- and it remembers, within reason ---");
  check("what is up is written down",
    JSON.parse(ev(app, 'localStorage.getItem("ball3-us")')).length === up().length,
    ev(app, 'localStorage.getItem("ball3-us")'));
  /* AN EMPTY LIST IS A REAL ANSWER NOW, so it has to survive the round trip:
     a load that quietly refilled the wall would undo the last tap. */
  run(app, 'localStorage.setItem("ball3-us", "[]");');
  check("an empty wall comes back empty rather than refilling itself",
    ev(app, "usLoad().length") === 0, JSON.stringify(ev(app, "usLoad()")));
  run(app, 'localStorage.setItem("ball3-us", JSON.stringify(["nobody","mar","bra"]));');
  check("a name that is not one of us is dropped",
    ev(app, "usLoad().indexOf('nobody')") === -1 && ev(app, "usLoad().length") === 2,
    JSON.stringify(ev(app, "usLoad()")));
  run(app, 'localStorage.setItem("ball3-us", "not json at all");');
  check("rubbish on the disk does not take the front door down",
    ev(app, "usLoad().length") === 0, JSON.stringify(ev(app, "usLoad()")));

  console.log("\n" + (fails ? fails + " FAILED" : "ALL PASS"));
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
