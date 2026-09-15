/* YOUR XI.
 *
 *     node _tests/dream-test.js
 *
 * SQUADS-PLAN.md §2.6, and the rule that makes it a game rather than Ultimate
 * Team is the only rule worth testing hard:
 *
 *   YOU CAN ONLY FIELD MEN YOU HAVE COLLECTED. If a man who is not in the
 *   album can reach the eleven by any route, the album stops meaning anything
 *   and so does every pack.
 *
 *   ONE KEEPER, EXACTLY. Slot 0 of every shape is the goalkeeper and the
 *   restart, the save and the shootout all say so, so a side with two or none
 *   is a side that breaks on the first kick-off.
 *
 *   AND IT HAS TO BE A SIDE LIKE ANY OTHER. Everything downstream reads a
 *   squad: the shapes, the ladder, the traits, the report. If Your XI is not
 *   shaped like a country it fails somewhere nobody is looking.
 */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const REPO = path.join(__dirname, "..");
const harness = fs.readFileSync(path.join(__dirname, "mp-test.js"), "utf8");
const head = harness.slice(0, harness.indexOf("/* ---------- drive an instance from outside ---------- */"));
eval(head.replace(/^const (fs|vm|path) = require\(.*\);$/gm, ""));

const stage = ctx => ctx.__els["stage"] ? ctx.__els["stage"].innerHTML : "";
const ev = (c, e) => vm.runInContext("(" + e + ")", c);
const run = (c, s) => vm.runInContext(s, c);
const tick = (ms = 130) => new Promise(r => setTimeout(r, ms));
const R = p => JSON.parse(fs.readFileSync(path.join(REPO, p), "utf8"));
let fails = 0;
const check = (n, c, x) => {
  console.log((c ? "  PASS  " : "  FAIL  ") + n + (c ? "" : "   <-- got: " + x));
  if (!c) fails++;
};

(async () => {
  const app = makeInstance("dream");
  await tick(340);
  run(app, "TEAMS.wc2006 = " + JSON.stringify(R("assets/wc2006/index.json")) + ";");
  const clean = () => run(app, 'localStorage.removeItem("ball3-mine"); MINE = null; DREAM_SIG = "";');

  console.log("--- an empty album fields nobody ---");
  clean();
  check("nothing is picked", ev(app, "dreamPicked().length") === 0, ev(app, "dreamPicked().length"));
  check("nothing is owned", ev(app, "dreamOwned().length") === 0, ev(app, "dreamOwned().length"));
  check("and there is no side", ev(app, "dreamReady()") === false, ev(app, "dreamReady()"));
  check("the front door does not offer it", !/openDream/.test(
    ev(app, "(() => { S = null; render(); return document.querySelector('#stage').innerHTML; })()") || ""),
    "offered with nothing to pick");

  console.log("\n--- you can only field men you have collected ---");
  /* a phone with one country's page and nothing else */
  run(app, '(() => { for(const m of albumMen("wc2006", "Italy")) ' +
    'albumStick(albumId("wc2006", "Italy", m)); mineSave(); })();');
  const owned = ev(app, "dreamOwned().map(m => m.id)");
  check("twenty-three men are collected", owned.length === 23, owned.length);
  check("and they are all Italians", owned.every(id => id.indexOf("wc2006:italy/") === 0),
    owned.filter(id => id.indexOf("wc2006:italy/") !== 0).slice(0, 3).join(", "));
  /* A MAN WHO IS NOT IN THE ALBUM CANNOT BE PICKED, whatever id is handed in:
     the id resolves to nobody and nobody is added. */
  run(app, 'dreamPick("wc2006:brazil/9");'); await tick(110);
  check("a man you do not have cannot be fielded",
    ev(app, 'dreamMan("wc2006:brazil/9") && albumHas("wc2006:brazil/9")') === false, "he got in");
  check("and picking him is refused outright",
    ev(app, "dreamPicked().indexOf('wc2006:brazil/9')") === -1, ev(app, "dreamPicked()"));
  /* AND AN ID IN THE OLD GRAMMAR IS NOBODY. This is the shape every saved Your
     XI on every phone was written in, so it has to resolve to null rather than
     to the wrong man, and the migration is what stops that mattering. */
  check("a bookless id off an old save resolves to nobody",
    ev(app, 'dreamMan("italy/1")') === null, ev(app, 'JSON.stringify(dreamMan("italy/1"))'));

  console.log("\n--- one keeper, exactly ---");
  const gks = ev(app, 'dreamOwned().filter(m => m.pos === "GK").map(m => m.id)');
  check("Italy took three keepers", gks.length === 3, gks.length);
  run(app, "dreamPick(" + JSON.stringify(gks[0]) + ");"); await tick(100);
  run(app, "dreamPick(" + JSON.stringify(gks[1]) + ");"); await tick(100);
  check("the second one is refused", ev(app, "dreamPicked().length") === 1, ev(app, "dreamPicked()"));
  /* and the side is not ready with ten outfielders and no keeper either */
  run(app, "dreamPick(" + JSON.stringify(gks[0]) + ");"); await tick(100);
  check("taking him out again leaves nothing", ev(app, "dreamPicked().length") === 0,
    ev(app, "dreamPicked()"));
  const out = ev(app, 'dreamOwned().filter(m => m.pos !== "GK").map(m => m.id)');
  for (const id of out.slice(0, 11)) { run(app, "dreamPick(" + JSON.stringify(id) + ");"); await tick(40); }
  check("eleven outfielders fills the eleven", ev(app, "dreamPicked().length") === 11,
    ev(app, "dreamPicked().length"));
  check("but with no keeper it is not a side", ev(app, "dreamReady()") === false, "it is ready");
  run(app, "dreamPick(" + JSON.stringify(out[10]) + ");"); await tick(100);
  run(app, "dreamPick(" + JSON.stringify(gks[0]) + ");"); await tick(100);
  check("swapping one for a keeper makes it one", ev(app, "dreamReady()") === true, "not ready");
  /* AND TWELVE IS NOT ELEVEN */
  run(app, "dreamPick(" + JSON.stringify(out[11]) + ");"); await tick(100);
  check("a twelfth man is refused", ev(app, "dreamPicked().length") === 11,
    ev(app, "dreamPicked().length"));

  console.log("\n--- and it is a side like any other ---");
  const sq = ev(app, "dreamSquad()");
  check("it has eleven", sq && sq.xi.length === 11, sq && sq.xi.length);
  check("and no bench, which is the trade", sq && sq.bench.length === 0, sq && sq.bench.length);
  check("it carries a kit", !!(sq && sq.kit), sq && sq.kit);
  check("and every man says which side he came off",
    sq.xi.every(m => !!m.from), sq.xi.filter(m => !m.from).length + " without");
  /* THE SAME OBJECT EACH TIME, because h2Order sorts a squad once and a fresh
     object every render would re-sort forever. */
  check("and it is built once per eleven", ev(app, "dreamSquad() === dreamSquad()") === true,
    "rebuilt");

  console.log("\n--- Your XI plays anybody ---");
  run(app, 'S = freshState(["Me","It"], false, "classic", 0, "pitch", false); h2Start(); render();');
  await tick(130);
  check("it is on the team screen", /Your XI/.test(stage(app)), "not offered");
  run(app, 'h2PickTeam("Your XI"); h2PickTeam("Brazil"); S.h2h.tossed = true;'); await tick(140);
  check("it can be picked", ev(app, "S.h2h.teams[0]") === "Your XI", ev(app, "S.h2h.teams[0]"));
  check("and the men on the pitch are the ones you picked",
    ev(app, "h2Man(0, 0) && h2Man(0, 0).from") === "Italy", ev(app, "h2Man(0,0)"));
  check("the keeper is in goal", ev(app, 'h2Man(0, 0).pos') === "GK", ev(app, "h2Man(0,0).pos"));
  check("eleven of them", ev(app, "h2Squad(0).xi.length") === 11, ev(app, "h2Squad(0).xi.length"));
  check("and no bench", ev(app, "h2Bench(0).length") === 0, ev(app, "h2Bench(0).length"));
  /* THE OTHER SIDE IS UNTOUCHED, and cannot also be Your XI: there is one
     album on the phone. */
  check("the other side is a country", ev(app, "S.h2h.teams[1]") === "Brazil", ev(app, "S.h2h.teams[1]"));

  console.log("\n--- and only where the album is a book ---");
  run(app, "TEAMS.finals = " + JSON.stringify(R("assets/finals/index.json")) + ";");
  run(app, 'S = freshState(["Me","It"], false, "classic", 0, "pitch", false); h2Start(); h2SetPool("finals"); render();');
  await tick(140);
  check("the forty finals do not offer Your XI", !/Your XI/.test(stage(app)),
    "offered on a pool the album is not a book of");

  console.log("\n--- the screen ---");
  run(app, "openDream(); render();"); await tick(140);
  check("it opens in front of the menu", /Your XI/.test(stage(app)), "menu instead");
  check("with the eleven drawn as stickers",
    (stage(app).match(/class="alst/g) || []).length >= 11 + 23,
    (stage(app).match(/class="alst/g) || []).length);
  check("and the men already in it are lit",
    (stage(app).match(/alslot want in/g) || []).length === 11,
    (stage(app).match(/alslot want in/g) || []).length);
  run(app, 'dreamFilter("GK"); render();'); await tick(120);
  /* the eleven above, and under it only the keepers */
  const shown = (stage(app).match(/alslot want/g) || []).length;
  const keepers = ev(app, 'dreamOwned().filter(m => m.pos === "GK").length');
  check("filtering to keepers shows only keepers",
    shown === ev(app, "dreamPicked().length") + keepers,
    shown + ", wanted " + ev(app, "dreamPicked().length") + " + " + keepers);
  run(app, "dreamClear(); render();"); await tick(120);
  check("starting again empties it", ev(app, "dreamPicked().length") === 0, ev(app, "dreamPicked()"));
  check("and it is no longer a side", ev(app, "dreamReady()") === false, "still ready");
  run(app, "closeDream(); render();"); await tick(120);
  check("closing it goes back", !/dreamPick/.test(stage(app)), "still on the screen");

  console.log("\n" + (fails ? fails + " FAILED" : "ALL PASS"));
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
