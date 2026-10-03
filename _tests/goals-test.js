/* WHO HAS MORE INTERNATIONAL GOALS, driven for real.
 *
 *     node _tests/goals-test.js
 *
 * The sibling of caps-test.js, over the other number on the card. The engine
 * is shared, so what this adds is everything the SHARING could get wrong:
 * that the goals bank is read as goals and never as caps, that the two modes
 * keep separate used-lists because their indexes point into different files,
 * that the band is the goals band, and that the screen says goals.
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

const bank = JSON.parse(fs.readFileSync(path.join(REPO, "assets/goals/index.json"), "utf8"));
const caps = JSON.parse(fs.readFileSync(path.join(REPO, "assets/caps/index.json"), "utf8"));

console.log("--- the bank ---");
/* Eighty seven men have fifty international goals and about half of them are
   in a tournament book from 1998 on, so the bank is small by design. Depth is
   pairs, not men: forty men in a band of 4 to 25 is several hundred pairs. */
check("it is a list and there is enough of it to play", Array.isArray(bank) && bank.length >= 40, bank.length);
const keys = ["n", "full", "pool", "side", "nat", "goals", "fame"];
const shapeless = bank.filter(p => keys.some(k => p[k] === undefined || p[k] === ""));
check("every man carries a name, a book, a side, a country, a total and a fame figure",
  shapeless.length === 0, shapeless.length + " short, e.g. " + JSON.stringify(shapeless[0] || {}));
/* the source lists men with 50 or more; the column beside it is caps, which
   is always larger, so a parser that slipped a column reads as goals over 100 */
const odd = bank.filter(p => !(Number.isInteger(p.goals) && p.goals >= 50 && p.goals <= 170));
check("every total is a whole number between 50 and 170", odd.length === 0,
  odd.slice(0, 3).map(p => p.n + " " + p.goals).join(", "));
check("nobody has more goals than caps would allow",
  bank.every(p => { const c = caps.find(q => q.full === p.full); return !c || p.goals <= c.caps; }), "a man outscored his own appearances");
check("the top of the list is the man it should be", bank[0].full === "Cristiano Ronaldo" && bank[0].goals >= 130, bank[0].full + " " + bank[0].goals);
const seen = new Map();
for (const p of bank) seen.set(p.full, (seen.get(p.full) || 0) + 1);
check("nobody is in the bank twice", [...seen].filter(e => e[1] > 1).length === 0);

const pools = {};
for (const d of fs.readdirSync(path.join(REPO, "assets")))
  if (/^(wc|euro)\d{4}$/.test(d))
    pools[d] = JSON.parse(fs.readFileSync(path.join(REPO, "assets", d, "index.json"), "utf8"));
const lost = bank.filter(p => {
  const t = (pools[p.pool] || {})[p.side];
  return !t || !(t.xi || []).concat(t.bench || []).some(m => m && m.full === p.full);
});
check("every man in the bank is still in the book it says he is in", lost.length === 0,
  lost.slice(0, 4).map(p => p.full + " (" + p.pool + "/" + p.side + ")").join(", "));
/* the right man: the list's nation (a name or a code) has to be the card's side */
const fold = s => String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z ]/g, " ").replace(/\s+/g, " ").trim();
const ALIAS = {"cote d ivoire": "ivory coast", "czechia": "czech republic", "dr congo": "congo dr",
               "south korea": "korea republic", "north korea": "korea dpr", "ir iran": "iran",
               "china pr": "china", "republic of ireland": "ireland", "fr yugoslavia": "serbia",
               "serbia and montenegro": "serbia", "west germany": "germany"};
const nm = s => { const f = fold(s); return ALIAS[f] || f; };
const otherMan = bank.filter(p => {
  const t = (pools[p.pool] || {})[p.side] || {};
  const card = (t.abbr || p.abbr || "").toUpperCase();
  return !(nm(p.side) === nm(p.nat) || card === String(p.nat).toUpperCase()
    || nm(p.side).startsWith(nm(p.nat)) || nm(p.nat).startsWith(nm(p.side)));
});
check("every card belongs to the nation the list says he scored for", otherMan.length === 0,
  otherMan.slice(0, 4).map(p => p.n + " list=" + p.nat + " card=" + p.side).join(", "));

console.log("\n--- the pair it deals ---");
(async () => {
  const app = makeInstance("phone");
  await tick(500);
  run(app, "GOALS = " + JSON.stringify(bank) + "; CAPS = " + JSON.stringify(caps) + ";");
  for (const [id, j] of Object.entries(pools)) run(app, "TEAMS[" + JSON.stringify(id) + "] = " + JSON.stringify(j) + ";");
  run(app, "capsPoolCache = null; capsPoolAt = -1;");

  check("the mode reads as ready once the bank and the books are in",
    ev(app, 'modeReady("goals")') === true, ev(app, 'modeReady("goals")'));
  check("it is in the drawer with its own icon and colour",
    !!ev(app, "MODE_META.goals") && ev(app, "MODE_META.goals[0]") === "goal" && !!ev(app, "IPATHS.goal"),
    JSON.stringify(ev(app, "MODE_META.goals")));
  check("and no other mode wears that colour",
    ev(app, "Object.values(MODE_META).filter(m => m[2] === MODE_META.goals[2]).length") === 1);
  check("it is named Goals in the record book", ev(app, "matchLabel({mode:'goals'})") === "Goals", ev(app, "matchLabel({mode:'goals'})"));

  run(app, 'setMode("goals"); startGame();');
  await tick(300);
  check("kicking off deals a pair", ev(app, "S && S.phase") === "cp_play", ev(app, "S && S.phase"));
  check("on the board, not a pitch", ev(app, "S.play") === "board", ev(app, "S.play"));
  check("the pair is read out of the GOALS bank, not the caps one",
    ev(app, "statOf().bank() === GOALS") === true, "wrong bank");
  check("and the used list is the goals one", ev(app, "S.usedGL.length") === 2 && ev(app, "S.usedCP.length") === 0,
    "usedGL " + ev(app, "S.usedGL.length") + " usedCP " + ev(app, "S.usedCP.length"));

  const GAP_MIN = ev(app, "GOALS_GAP_MIN"), GAP_MAX = ev(app, "GOALS_GAP_MAX");
  let ties = 0, tooFar = 0, tooClose = 0, same = 0, n = 0, fameSum = 0;
  for (let i = 0; i < 1000; i++) {
    run(app, "newCaps();");
    const d = JSON.parse(ev(app, "JSON.stringify(S.cap)"));
    if (!d) continue;
    n++;
    const A = bank[d.a], B = bank[d.b];
    if (d.a === d.b) same++;
    const g = Math.abs(A.goals - B.goals);
    if (g === 0) ties++;
    if (g < GAP_MIN) tooClose++;
    if (g > GAP_MAX) tooFar++;
    fameSum += (A.fame + B.fame) / 2;
  }
  check("a thousand draws all produced a pair", n === 1000, n);
  check("never the same man twice on one screen", same === 0, same);
  check("never a dead heat", ties === 0, ties);
  check("never closer than " + GAP_MIN + " goals", tooClose === 0, tooClose);
  check("never further apart than " + GAP_MAX, tooFar === 0, tooFar);
  /* THE DRAW LEANS TOWARD MEN PEOPLE KNOW. The average fame of a dealt man
     has to beat the average fame of the bank, or the weighting is doing
     nothing and the table is back to Panamanian full backs. */
  const bankAvg = bank.reduce((s, p) => s + p.fame, 0) / bank.length;
  check("a dealt man is better known than the bank's average", fameSum / n > bankAvg * 1.2,
    "dealt " + Math.round(fameSum / n) + " vs bank " + Math.round(bankAvg));

  console.log("\n--- the screen says goals ---");
  run(app, "S.players[0].score = 0; S.cap.streak = 0; newCaps(); render();");
  const html = () => app.__els["stage"] ? app.__els["stage"].innerHTML : "";
  check("the title asks about goals", /more international goals/i.test(html()), "title");
  check("and the kick line names the mode", /Goals ·/.test(html()), "kick");
  let d = JSON.parse(ev(app, "JSON.stringify(S.cap)"));
  const right = bank[d.a].goals > bank[d.b].goals ? "a" : "b";
  run(app, 'capsPick("' + right + '"); render();');
  check("a right answer pays a point", ev(app, "S.players[0].score") === 1, ev(app, "S.players[0].score"));
  check("the revealed number is labelled goals, not caps", /<i>goals<\/i>/.test(html()) && !/<i>caps<\/i>/.test(html()), "unit");
  check("and the hint reads the goals figures", new RegExp(bank[d.a].n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + " " + bank[d.a].goals).test(html()), "hint");

  console.log("\n--- caps is untouched by all this ---");
  run(app, 'setMode("caps"); startGame();');
  await tick(200);
  check("a caps match still reads the caps bank", ev(app, "statOf().bank() === CAPS") === true, "wrong bank");
  const cd = JSON.parse(ev(app, "JSON.stringify(S.cap)"));
  check("and its pair sits in the caps band",
    Math.abs(caps[cd.a].caps - caps[cd.b].caps) >= ev(app, "CAPS_GAP_MIN") && Math.abs(caps[cd.a].caps - caps[cd.b].caps) <= ev(app, "CAPS_GAP_MAX"),
    Math.abs(caps[cd.a].caps - caps[cd.b].caps));
  check("the caps floor is five now, as asked", ev(app, "CAPS_GAP_MIN") === 5, ev(app, "CAPS_GAP_MIN"));

  console.log(fails ? `\n${fails} FAILING CHECK(S)` : "\nAll checks passed.");
  process.exit(fails ? 1 : 0);
})();
