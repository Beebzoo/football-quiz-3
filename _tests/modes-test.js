/* The five modes this build carries, driven for real.

     node _tests/modes-test.js

   BALL was cut back from twenty modes to four. What that kind of cut breaks is
   never the mode you kept, it is the registry you forgot: a mode left in
   MODE_META with no MODE_LABEL draws a blank splash, a stale RR_POOL rolls a
   mode whose deck no longer loads. So this checks the registries agree with
   each other, then actually plays a question in each of the four, then proves a
   save from a mode that is gone gets turned away instead of crashing. */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const REPO = path.join(__dirname, "..");
const harness = fs.readFileSync(path.join(__dirname, "mp-test.js"), "utf8");
const head = harness.slice(0, harness.indexOf("/* ---------- drive an instance from outside ---------- */"));
eval(head.replace(/^const (fs|vm|path) = require\(.*\);$/gm, ""));

const stage = ctx => ctx.__els["stage"] ? ctx.__els["stage"].innerHTML : "";
const ev = (ctx, e) => vm.runInContext("(" + e + ")", ctx);
const run = (ctx, s) => vm.runInContext(s, ctx);
const tick = (ms = 280) => new Promise(r => setTimeout(r, ms));
let fails = 0;
const check = (n, c, x) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (c ? "" : "   <-- got: " + x)); if (!c) fails++; };

const load = f => JSON.parse(fs.readFileSync(path.join(REPO, f), "utf8"));

(async () => {
  const app = makeInstance("phone");
  await tick(400);

  console.log("--- the app comes up at all ---");
  check("no boot error", ev(app, "typeof render") === "function", ev(app, "typeof render"));
  /* h2h and h2mc are gone as mode ids: One on One is the classic quiz with
     play "pitch", and Pick One is that with mc on. So the drawer is one row
     per QUIZ plus the two picture modes, and how a match is played is two
     toggles rather than two more ids. */
  check("every mode is a quiz or a picture mode",
    ev(app, "Object.keys(MODE_META).sort().join(',')") ===
      "badge,belgian,bundesliga,career,classic,ere,laliga,mgr,premier,seriea",
    ev(app, "Object.keys(MODE_META).sort().join(',')"));
  check("six leagues plus the classic bank",
    ev(app, "Object.keys(QUIZZES).length") === 7, ev(app, "Object.keys(QUIZZES).length"));
  check("and every quiz names both of its decks",
    ev(app, "Object.values(QUIZZES).every(r=>r.mc && (r.spoken || r.label===\"Let's Ball\"))"),
    "a quiz is missing a deck path");
  check("Let's Ball is the classic quiz, not a label of its own",
    ev(app, "matchLabel({mode:'classic'})") === "Let's Ball", ev(app, "matchLabel({mode:'classic'})"));
  check("every mode has a label", ev(app, "Object.keys(MODE_META).every(m=>!!matchLabel({mode:m}))"),
    "a mode is missing its label");
  check("the pitch is offered for every quiz and for none of the picture modes",
    ev(app, "Object.keys(MODE_META).filter(canPitch).sort().join(',')") ===
      "belgian,bundesliga,classic,ere,laliga,premier,seriea",
    ev(app, "Object.keys(MODE_META).filter(canPitch).sort().join(',')"));
  check("One on One reads back as the classic quiz on the pitch",
    ev(app, "matchLabel({mode:'classic',play:'pitch'}) + ' / ' + playLabel({mode:'classic',play:'pitch'})") === "Let's Ball / One on One",
    ev(app, "matchLabel({mode:'classic',play:'pitch'}) + ' / ' + playLabel({mode:'classic',play:'pitch'})"));
  check("and an old h2h row in the record book still reads right",
    ev(app, "matchLabel({mode:'h2h'})") === "One on One", ev(app, "matchLabel({mode:'h2h'})"));
  check("nothing hidden on a second shelf", ev(app, "MODE_EXTRA.size") === 0, ev(app, "MODE_EXTRA.size"));

  /* ---------- a mode you can see is a mode you can pick ----------
     THE THREE PICTURE MODES WERE UNPICKABLE AND NOTHING WAS BROKEN. The app
     opens on the football game, picture modes can never go on a pitch, and the
     drawer rendered them disabled on exactly that basis, so the tap never
     reached setMode. Which is where the answer already was: setMode moves the
     toggle to the board itself for anything that cannot go on a pitch, and that
     branch was unreachable. Two parts of the app had opposite answers and the
     refusing one won, because refusing is an attribute and agreeing is a
     function nobody called.

     This is asserted on the RENDERED tile rather than on playableAs, because a
     test that asked the function would have passed against the broken version:
     the function was right the whole time. */
  run(app, "BADGE = " + JSON.stringify(load("assets/badges/index.json")));
  run(app, "MGRS = " + JSON.stringify(load("assets/managers/index.json")));
  run(app, "S = null; showBoard = false; setupMode = null; setupPlay = 'pitch'; modesOpen = true; render();");
  await tick(300);
  const tile = id => ((stage(app).match(new RegExp("setMode\\('" + id + "'\\)[^>]*", "g")) || [])[0] || "");
  for (const id of ["career", "mgr", "badge"])
    check(id + " can be tapped while the football game is selected",
      !!tile(id) && !/disabled/.test(tile(id)), tile(id) ? "disabled" : "no tile at all");
  /* AND THE TAP ARRANGES THE REST. Picking what you want to play should not
     require knowing that a toggle two sections down has to be flipped first. */
  for (const id of ["career", "mgr", "badge"]) {
    run(app, "setupPlay = 'pitch'; setMode('" + id + "');");
    await tick(200);
    check("tapping " + id + " moves you to the board by itself",
      ev(app, "setupMode") === id && ev(app, "setupPlay") === "board",
      ev(app, "setupMode") + " / " + ev(app, "setupPlay"));
  }
  run(app, "setupPlay = 'pitch'; setMode('classic');");
  await tick(200);
  check("and a quiz still stays on the pitch",
    ev(app, "setupMode") === "classic" && ev(app, "setupPlay") === "pitch",
    ev(app, "setupMode") + " / " + ev(app, "setupPlay"));
  run(app, "modesOpen = false;");

  console.log("\n--- Let's Ball (the embedded classic bank) ---");
  run(app, 'S = freshState(["Martijn","Bram","Ale"], false, "classic", 0); render();'); await tick(280);
  run(app, 'pickTier("easy")'); await tick(280);
  check("a question is dealt", ev(app, "S.phase") === "question" && !!ev(app, "q().q"), ev(app, "S.phase"));
  run(app, 'reveal()'); await tick(200);
  run(app, 'judge(true)'); await tick(300);
  check("a right answer scores", ev(app, "S.players[0].score") > 0, ev(app, "S.players[0].score"));

  console.log("\n--- Eredivisie ---");
  run(app, "DECKS.ere = " + JSON.stringify(load("assets/eredivisie/index.json")));
  run(app, 'S = freshState(["Martijn","Bram"], false, "ere", 0, "board", false); render();'); await tick(280);
  const ereTier = ev(app, 'Object.keys(TIERS).find(t=>bankFor(t)&&bankFor(t).length)');
  run(app, 'pickTier("' + ereTier + '")'); await tick(280);
  check("a question is dealt (" + ereTier + ")", !!ev(app, "q().q"), ev(app, "S.phase"));
  run(app, 'reveal()'); await tick(200);
  run(app, 'judge(true)'); await tick(300);
  check("it scores", ev(app, "S.players[0].score") > 0, ev(app, "S.players[0].score"));

  console.log("\n--- Badge Zoom ---");
  run(app, "BADGE = " + JSON.stringify(load("assets/badges/index.json")));
  run(app, 'S = freshState(["Martijn","Bram"], false, "badge", 0); render();'); await tick(280);
  run(app, 'pickTier("easy")'); await tick(280);
  check("a crest is on screen", !!ev(app, "q().img || q().badge || q().q"), ev(app, "S.phase"));
  run(app, 'reveal()'); await tick(200);
  run(app, 'judge(true)'); await tick(300);
  check("it scores", ev(app, "S.players[0].score") > 0, ev(app, "S.players[0].score"));

  console.log("\n--- Career Path ---");
  run(app, 'S = freshState(["Martijn","Bram"], false, "career", 0); newCareer(); render();'); await tick(300);
  check("a career is dealt", !!ev(app, "S.career"), ev(app, "JSON.stringify(S.career)").slice(0, 60));
  check("it is on its own phase", String(ev(app, "S.phase")).startsWith("c_"), ev(app, "S.phase"));

  console.log("\n--- Manager Path ---");
  /* THE SAME ENGINE OVER THE OTHER DECK, so the checks worth having are that
     the deck arrived and that the game knows which of the two it is playing.
     An empty MGRS used to leave newCareer saying "still loading" for ever, so
     the count is asserted rather than the truthiness. */
  run(app, "MGRS = " + JSON.stringify(load("assets/managers/index.json")));
  check("the dugout deck landed", ev(app, "MGRS.length") > 200, ev(app, "MGRS && MGRS.length"));
  check("and the mode reads as ready", ev(app, 'modeReady("mgr")') === true, ev(app, 'modeReady("mgr")'));
  run(app, 'S = freshState(["Martijn","Bram"], false, "mgr", 0); newCareer(); render();');
  await tick(320);
  check("a dugout career is dealt", !!ev(app, "S.career"), ev(app, "JSON.stringify(S.career)").slice(0, 60));
  check("it is on the career phases", String(ev(app, "S.phase")).startsWith("c_"), ev(app, "S.phase"));
  /* IT DRAWS FROM THE OTHER DECK AND MARKS THE OTHER USED-LIST, which is the
     one thing that would be silently wrong if cdeck or cused stopped
     branching: the game would play perfectly and deal footballers. */
  check("it drew a manager, not a player",
    ev(app, "MGRS.some(m => m.n === cdeck()[S.career.ci].n)"), "the deck is the player one");
  check("and it is the manager used-list being marked",
    ev(app, "S.usedM.length") === 1 && ev(app, "S.usedC.length") === 0,
    "usedM " + ev(app, "S.usedM.length") + " / usedC " + ev(app, "S.usedC.length"));
  check("the screen says which dugout it is", /jobs in this dugout career/.test(stage(app)),
    "it is calling them clubs in a career");

  console.log("\n--- a save from a mode that is gone ---");
  run(app, 'S = freshState(["Martijn","Bram"], false, "classic", 0); S.mode="stadium"; save();'); await tick(260);
  run(app, 'S = null; resumeGame();'); await tick(300);
  check("it is refused, not crashed into", ev(app, "S") === null, ev(app, "S && S.mode"));
  /* AND A PARKED MANAGER MATCH IS NOT ONE OF THOSE ANY MORE. mgr came off the
     retired list when the mode came back, and the save is the half of that
     nothing else here would notice: a mode can be perfectly playable from the
     menu while every parked game in it is still thrown away on sight. */
  run(app, 'S = freshState(["Martijn","Bram"], false, "mgr", 0); newCareer(); save();');
  await tick(300);
  run(app, 'S = null; resumeGame();'); await tick(320);
  check("but a parked manager match is picked back up",
    ev(app, "S && S.mode") === "mgr", ev(app, "S && S.mode"));

  console.log(fails ? "\n" + fails + " FAILED" : "\nall green");
  process.exit(fails ? 1 : 0);
})();
