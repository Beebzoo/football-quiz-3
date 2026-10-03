/* WHO HAS MORE CAPS, driven for real.
 *
 *     node _tests/caps-test.js
 *
 * This mode is a self-judging one: the app says who is right and nobody at the
 * table gets to argue, which is the same promise BALL 1's Older or Taller made
 * and then broke. Thirteen rows of that bank were a different person entirely,
 * so the mode confidently called correct answers wrong all night and the first
 * anybody knew was somebody insisting they were right. There is no clever test
 * for "is this the right Pepe"; what there IS a test for is everything around
 * it, and that is what this does:
 *
 *   the bank is shaped the way the app reads it, and every man in it can
 *   actually be drawn as a card, because a card is the whole screen;
 *   the totals are in the range the source promises (100 and up), so a parse
 *   that started reading the debut column instead would be caught;
 *   nobody is in there twice, because two cards of the same man is a question
 *   with no answer;
 *   the pair that gets dealt always has an answer and is always close enough to
 *   be worth asking;
 *   and the scoring, the streak and the run-ending all behave.
 */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const REPO = path.join(__dirname, "..");
const harness = fs.readFileSync(path.join(__dirname, "mp-test.js"), "utf8");
const head = harness.slice(0, harness.indexOf("/* ---------- drive an instance from outside ---------- */"));
eval(head.replace(/^const (fs|vm|path) = require\(.*\);$/gm, ""));

const ev = (ctx, e) => vm.runInContext("(" + e + ")", ctx);
const run = (ctx, s) => vm.runInContext(s, ctx);
const tick = (ms = 280) => new Promise(r => setTimeout(r, ms));
let fails = 0;
const check = (n, c, x) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (c ? "" : "   <-- " + x)); if (!c) fails++; };

const bank = JSON.parse(fs.readFileSync(path.join(REPO, "assets/caps/index.json"), "utf8"));

console.log("--- the bank ---");
check("it is a list and there is enough of it to play",
  Array.isArray(bank) && bank.length >= 200, bank.length);
const keys = ["n", "full", "pool", "side", "nat", "caps"];
const shapeless = bank.filter(p => keys.some(k => p[k] === undefined || p[k] === ""));
check("every man carries a name, a book, a side, a country and a total",
  shapeless.length === 0, shapeless.length + " short, e.g. " + JSON.stringify(shapeless[0] || {}));

/* THE RANGE IS THE PARSE CHECK. The source is a list of players with 100 or
   more caps and the column beside it is a debut year, so a parser that slipped
   one column would come back with totals in the 1990s and 2000s. Anything under
   100 or over 250 means the table shape moved. */
const odd = bank.filter(p => !(Number.isInteger(p.caps) && p.caps >= 100 && p.caps <= 250));
check("every total is a whole number between 100 and 250",
  odd.length === 0, odd.slice(0, 3).map(p => p.n + " " + p.caps).join(", "));

const seen = new Map();
for (const p of bank) seen.set(p.full, (seen.get(p.full) || 0) + 1);
const twice = [...seen].filter(e => e[1] > 1);
check("nobody is in the bank twice", twice.length === 0,
  twice.slice(0, 3).map(e => e[0]).join(", "));

/* EVERY MAN HAS TO BE DRAWABLE. The bank stores which book and which side he
   came from and nothing about how he looks, so if a squad is re-harvested and a
   name changes, his card silently becomes a blank. That is the one failure this
   mode cannot survive, because the card IS the question. */
const pools = {};
for (const d of fs.readdirSync(path.join(REPO, "assets")))
  if (/^(wc|euro)\d{4}$/.test(d))
    pools[d] = JSON.parse(fs.readFileSync(path.join(REPO, "assets", d, "index.json"), "utf8"));
const lost = bank.filter(p => {
  const t = (pools[p.pool] || {})[p.side];
  if (!t) return true;
  return !(t.xi || []).concat(t.bench || []).some(m => m && m.full === p.full);
});
check("every man in the bank is still in the book it says he is in",
  lost.length === 0, lost.slice(0, 4).map(p => p.full + " (" + p.pool + "/" + p.side + ")").join(", "));

/* IS THIS THE RIGHT PEPE. The header above says there is no clever test for
   it. There is one, and it is not clever: the list prints his country beside
   him and the card knows which side it belongs to, and they have to agree.
   The first shipped bank had four men wearing another man's card (Uruguay's
   Suárez on Colombia's, among them) and this is the check that was missing.
   Older codes are the same country: FRG is GER, SCG is SRB. */
const SAME = {FRG: "GER", GDR: "GER", SCG: "SRB", YUG: "SRB", TCH: "CZE", URS: "RUS", CIS: "RUS",
              CHL: "CHI", QTR: "QAT", DRC: "COD", ZAI: "COD", LAT: "LVA", HOL: "NED", ROM: "ROU"};
const otherMan = bank.filter(p => {
  const t = (pools[p.pool] || {})[p.side];
  const card = ((t && t.abbr) || p.abbr || "").toUpperCase();
  return card && (SAME[card] || card) !== (SAME[p.nat] || p.nat);
});
check("every card belongs to the nation the list says he played for", otherMan.length === 0,
  otherMan.slice(0, 4).map(p => p.n + " list=" + p.nat + " card=" + p.side).join(", "));

/* and the side he is filed under has what a sticker needs */
const naked = bank.filter(p => {
  const t = (pools[p.pool] || {})[p.side] || {};
  return !t.kit || !t.flag;
});
check("and that side has a kit and a badge to draw him in", naked.length === 0,
  naked.slice(0, 3).map(p => p.side).join(", "));

console.log("\n--- the pair it deals ---");
(async () => {
  const app = makeInstance("phone");
  await tick(500);
  /* the harness serves no fetches, so the bank and the books go in by hand */
  run(app, "CAPS = " + JSON.stringify(bank) + ";");
  for (const [id, j] of Object.entries(pools)) run(app, "TEAMS[" + JSON.stringify(id) + "] = " + JSON.stringify(j) + ";");
  run(app, "capsPoolCache = null; capsPoolAt = -1;");

  check("the mode reads as ready once the bank and the books are in",
    ev(app, 'modeReady("caps")') === true, ev(app, 'modeReady("caps")'));
  /* EVERY MAN RESOLVES TO A CARD, which the disk check above already proved,
     but NOT every man is dealt: the least-known quarter by English pageviews
     stays on the shelf, because the table asked for fewer Saudis and Qataris
     and this is the measure that tells them apart from Buffon. So the pool is
     smaller than the bank by about a quarter, and everyone left out has to be
     less known than everyone kept in, or the floor is just random. */
  const ready = JSON.parse(ev(app, "JSON.stringify(capsReady('caps'))"));
  check("the least-known quarter is kept off the table",
    ready.length >= Math.floor(bank.length * 0.7) && ready.length <= Math.ceil(bank.length * 0.8),
    ready.length + " of " + bank.length + " dealt");
  const inFame = ready.map(i => bank[i].fame || 0), outFame = bank.map((p, i) => ready.includes(i) ? null : (p.fame || 0)).filter(v => v !== null);
  check("and everyone left out is less known than everyone kept",
    !outFame.length || Math.max(...outFame) <= Math.min(...inFame),
    "shelf max " + Math.max(...outFame) + " vs table min " + Math.min(...inFame));
  check("the bank carries a fame figure for everybody", bank.every(p => Number.isInteger(p.fame)),
    bank.filter(p => !Number.isInteger(p.fame)).length + " without");

  run(app, 'setMode("caps"); startGame();');
  await tick(300);
  check("kicking off deals a pair", ev(app, "S && S.phase") === "cp_play", ev(app, "S && S.phase"));
  check("and it is played on the board, not a pitch",
    ev(app, "S.play") === "board", ev(app, "S.play"));

  /* A THOUSAND PAIRS, because one proves nothing about a random draw. Every one
     has to have an answer and be worth asking. */
  let ties = 0, tooFar = 0, tooClose = 0, same = 0, n = 0;
  const GAP_MIN = ev(app, "CAPS_GAP_MIN"), GAP_MAX = ev(app, "CAPS_GAP_MAX");
  for (let i = 0; i < 1000; i++) {
    run(app, "newCaps();");
    const d = JSON.parse(ev(app, "JSON.stringify(S.cap)"));
    if (!d) continue;
    n++;
    const A = bank[d.a], B = bank[d.b];
    if (d.a === d.b) same++;
    const g = Math.abs(A.caps - B.caps);
    if (g === 0) ties++;
    if (g < GAP_MIN) tooClose++;
    if (g > GAP_MAX) tooFar++;
  }
  check("a thousand draws all produced a pair", n === 1000, n);
  check("never the same man twice on one screen", same === 0, same);
  check("never a dead heat, which would have no answer", ties === 0, ties);
  check("never closer than " + GAP_MIN + " caps, which would be a coin toss", tooClose === 0, tooClose);
  check("never further apart than " + GAP_MAX + ", which would not be a question", tooFar === 0, tooFar);

  console.log("\n--- picking one ---");
  run(app, "S.players[0].score = 0; S.cap.streak = 0; newCaps();");
  let d = JSON.parse(ev(app, "JSON.stringify(S.cap)"));
  const right = bank[d.a].caps > bank[d.b].caps ? "a" : "b";
  const wrong = right === "a" ? "b" : "a";
  run(app, 'capsPick("' + right + '");');
  check("a right answer pays a point", ev(app, "S.players[0].score") === 1, ev(app, "S.players[0].score"));
  check("and shows the answer rather than dealing again",
    ev(app, "S.phase") === "cp_show", ev(app, "S.phase"));
  check("the streak is running", ev(app, "S.cap.streak") === 1, ev(app, "S.cap.streak"));

  run(app, "capsOn();");
  check("carrying on deals another pair", ev(app, "S.phase") === "cp_play", ev(app, "S.phase"));
  d = JSON.parse(ev(app, "JSON.stringify(S.cap)"));
  const bad = bank[d.a].caps > bank[d.b].caps ? "b" : "a";
  const was = ev(app, "S.players[0].score");
  run(app, 'capsPick("' + bad + '");');
  check("a wrong answer pays nothing", ev(app, "S.players[0].score") === was, ev(app, "S.players[0].score"));
  check("and the run is over", ev(app, "S.cap.right") === false, ev(app, "S.cap.right"));

  /* FIVE IN A ROW PAYS TEN ON TOP, which is the whole reason to keep going
     rather than bank a point and pass the phone. Driven rather than read. */
  run(app, "S.players[0].score = 0; S.cap = null; S.usedCP = []; newCaps();");
  for (let i = 0; i < 5; i++) {
    const c = JSON.parse(ev(app, "JSON.stringify(S.cap)"));
    const r = bank[c.a].caps > bank[c.b].caps ? "a" : "b";
    run(app, 'capsPick("' + r + '");');
    if (i < 4) run(app, "capsOn();");
  }
  check("five in a row is five points and ten on top",
    ev(app, "S.players[0].score") === 15, ev(app, "S.players[0].score"));
  check("and the streak says five", ev(app, "S.cap.streak") === 5, ev(app, "S.cap.streak"));

  console.log("\n--- the card on the screen ---");
  run(app, "S.players[0].score = 0; S.cap = null; S.usedCP = []; newCaps(); render();");
  const html = app.__els["stage"] ? app.__els["stage"].innerHTML : "";
  check("two cards are drawn", (html.match(/class="capscard/g) || []).length === 2,
    (html.match(/class="capscard/g) || []).length);
  check("and they are the album's own sticker, not a photograph",
    (html.match(/class="alst/g) || []).length === 2 && html.indexOf("assets/faces/") === -1,
    (html.match(/class="alst/g) || []).length + " stickers");
  check("each card carries a shirt, a flag and a name",
    (html.match(/alsno/g) || []).length === 2 && (html.match(/alsfl/g) || []).length === 2 &&
    (html.match(/alsn"/g) || []).length === 2, "a card is missing part of itself");
  check("the totals are hidden until it has been answered",
    html.indexOf("<b>?</b>") > -1, "a number is on screen before the tap");
  run(app, 'capsPick("a"); render();');
  const shown = app.__els["stage"] ? app.__els["stage"].innerHTML : "";
  const A = bank[JSON.parse(ev(app, "JSON.stringify(S.cap)")).a];
  check("and they are both on screen after it",
    shown.indexOf(">" + A.caps + "<") > -1, "the totals did not appear");
  check("with the country each of them played for",
    shown.indexOf(A.side) > -1, "no country named");

  console.log(fails ? "\n" + fails + " FAILED" : "\nALL PASS");
  process.exit(fails ? 1 : 0);
})();
