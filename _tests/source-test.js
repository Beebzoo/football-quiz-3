/* ONE ON ONE, WHOSE QUESTIONS.
 *
 *     node _tests/source-test.js
 *
 * A league quiz on the pitch asks that league's deck, which is what makes it
 * that league's quiz. The table asked for the other option: play as two of its
 * clubs and be asked about football in general. This holds the join:
 *
 *   the deck the ball draws from follows the choice, and ONLY the deck: the
 *   sides, the pool and the crests stay the league's;
 *   the choice survives a save and a resume, and a save from before it
 *   existed reads as the league's own deck;
 *   kick-off is gated on the deck that will actually be read;
 *   the menu offers it on the pitch with a league picked and nowhere else;
 *   and the record book says which it was.
 *
 * Reuses the stub DOM from mp-test.js, with fetch served from disk so the
 * league decks and pools land. */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const REPO = path.join(__dirname, "..");
const harness = fs.readFileSync(path.join(__dirname, "mp-test.js"), "utf8");
const head = harness.slice(0, harness.indexOf("/* ---------- drive an instance from outside ---------- */"));
eval(head.replace(/^const (fs|vm|path) = require\(.*\);$/gm, "")
  .replace("fetch: () => Promise.reject(new Error(\"offline in test\")),",
    `fetch: (u) => { try { const b = require("fs").readFileSync(require("path").join(${JSON.stringify(REPO)}, u), "utf8");
       return Promise.resolve({ ok: true, json: () => Promise.resolve(JSON.parse(b)) }); }
       catch (e) { return Promise.resolve({ ok: false, json: () => Promise.reject(e) }); } },`));

const ev = (ctx, e) => vm.runInContext("(" + e + ")", ctx);
const run = (ctx, s) => vm.runInContext(s, ctx);
const tick = (ms = 200) => new Promise(r => setTimeout(r, ms));
const stage = c => (c.__els["stage"] ? c.__els["stage"].innerHTML : "");
let fails = 0;
const check = (n, c, x) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (c ? "" : "   <-- got: " + x)); if (!c) fails++; };

(async () => {
  const app = makeInstance("phone");
  await tick(900);
  check("the Premier League deck landed", !!ev(app, "DECKS.premier"), "no deck");
  check("and its pool of clubs", !!ev(app, "TEAMS['premier-clubs']"), "no pool");

  console.log("--- the deck follows the choice ---");
  run(app, 'S = freshState(["Martijn","Bram"], false, "premier", 0, "pitch", false, "own");');
  check("own: a league pitch reads the league deck", ev(app, "deckFor() === DECKS.premier"), "not the league deck");
  run(app, 'S = freshState(["Martijn","Bram"], false, "premier", 0, "pitch", false, "classic");');
  check("general: the same pitch reads the whole bank", ev(app, "deckFor() === BANK"), "not the classic bank");
  check("and a tier out of it is the classic tier", ev(app, "bankFor('hard') === BANK.hard"), "wrong tier array");
  check("while the quiz, and so the sides, stay the league's", ev(app, "S.mode") === "premier" && ev(app, "canPitch(S.mode)"), ev(app, "S.mode"));
  run(app, 'S = freshState(["Martijn","Bram"], false, "classic", 0, "pitch", false, "classic");');
  check("general on Let's Ball is just Let's Ball", ev(app, "deckFor() === BANK"), "classic broke");
  run(app, 'S = freshState(["Martijn","Bram","Ale"], false, "premier", 0, "board", false, "classic");');
  check("the choice is ignored off the pitch", ev(app, "deckFor() === DECKS.premier"), "the board read the wrong deck");

  console.log("\n--- saves ---");
  run(app, 'S = freshState(["Martijn","Bram"], false, "premier", 0, "pitch", false, "classic"); h2Start(); save();');
  await tick(100);
  run(app, 'S = null; resumeGame();');
  await tick(200);
  check("the choice survives a resume", ev(app, "S && S.qsrc") === "classic" && ev(app, "deckFor() === BANK"), ev(app, "S && S.qsrc"));
  run(app, 'const o = JSON.parse(localStorage.getItem(SAVE_KEY)); delete o.qsrc; localStorage.setItem(SAVE_KEY, JSON.stringify(o)); S = null; resumeGame();');
  await tick(200);
  check("a save from before this existed reads the league's own deck", ev(app, "deckFor() === DECKS.premier"), "old save read the classic bank");

  console.log("\n--- kick-off is gated on the deck that will be read ---");
  run(app, 'const keep = DECKS.premier; DECKS.premier = null; globalThis.__ready = [modeReady("premier","pitch",false,"own"), modeReady("premier","pitch",false,"classic")]; DECKS.premier = keep;');
  const r = JSON.parse(ev(app, "JSON.stringify(__ready)"));
  check("own questions wait for the league deck", r[0] === false, r[0]);
  check("general questions do not", r[1] === true, r[1]);

  console.log("\n--- the menu ---");
  run(app, 'S = null; setMode("premier"); setPlay("pitch"); render();');
  await tick(60);
  check("on a league pitch the choice is offered", /General football/.test(stage(app)) && /Premier League questions/.test(stage(app)), "no choice shown");
  run(app, 'setSrc("classic"); render();');
  check("and it can be switched", ev(app, "setupSrc") === "classic" && /whole bank/.test(stage(app)), ev(app, "setupSrc"));
  run(app, 'setMode("classic"); render();');
  check("Let's Ball does not offer it", !/General football/.test(stage(app)), "offered on classic");
  run(app, 'setMode("premier"); setPlay("board"); render();');
  check("nor does the board", !/General football/.test(stage(app)), "offered on the board");

  console.log("\n--- a real kick-off ---");
  run(app, 'setMode("premier"); setPlay("pitch"); setSrc("classic"); startGame();');
  await tick(300);
  check("the match carries the choice", ev(app, "S && S.qsrc") === "classic" && ev(app, "S.mode") === "premier", ev(app, "S && S.qsrc"));
  check("and the ball will draw from the whole bank", ev(app, "bankFor('normal') === BANK.normal"), "wrong deck");
  check("the record book says so", /general questions/.test(ev(app, "playLabel(S)")), ev(app, "playLabel(S)"));
  run(app, 'setSrc("own"); startGame();');
  await tick(300);
  check("and a league-questions match does not", !/general questions/.test(ev(app, "playLabel(S)")) && ev(app, "deckFor() === DECKS.premier"), ev(app, "playLabel(S)"));

  console.log(fails ? `\n${fails} FAILING CHECK(S)` : "\nAll checks passed.");
  process.exit(fails ? 1 : 0);
})();
