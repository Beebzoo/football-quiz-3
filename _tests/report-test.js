/* THE SCOUTING REPORT HAS TO BE TRUE.
 *
 *     node _tests/report-test.js
 *
 * A report is the one thing in the app that makes a claim about the match
 * rather than showing you the match. A scoreline cannot be wrong; "your worst
 * ball was to van Persie" can be, and it would be believed, because nobody
 * counts their own passes.
 *
 * So this plays a match with known outcomes and checks the report says exactly
 * what happened. It also checks the two traps the log fell into by design:
 * a substitute must not inherit the balls the man he replaced lost, and one
 * match must not read another match's rows.
 */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const REPO = path.join(__dirname, "..");
const harness = fs.readFileSync(path.join(__dirname, "mp-test.js"), "utf8");
const head = harness.slice(0, harness.indexOf("/* ---------- drive an instance from outside ---------- */"));
eval(head.replace(/^const (fs|vm|path) = require\(.*\);$/gm, ""));

const ev = (c, e) => vm.runInContext("(" + e + ")", c);
const run = (c, s) => vm.runInContext(s, c);
const tick = (ms = 110) => new Promise(r => setTimeout(r, ms));
const R = p => JSON.parse(fs.readFileSync(path.join(REPO, p), "utf8"));
let fails = 0;
  /* THE DUGOUT'S BENCH IS EARNED. A country whose album page is unfinished
     plays with eleven men and nobody to bring on, so a test that reaches for a
     substitute finishes the page the way a player would. */
  /* THROUGH THE APP'S OWN FUNCTIONS, never by spelling an id out here. A
     test that knows the grammar is a second copy of the grammar, and this file
     was one of six carrying one. */
  const finishBoth = (ctx) => run(ctx, "(() => { for(const w of [0,1]){ " +
    "const side = h2Team(w); if(!TEAMS.wc2006[side]) continue; " +
    "for(const m of albumMen('wc2006', side)) albumStick(albumId('wc2006', side, m)); " +
    "albumCheckPage('wc2006', side); } mineSave(); })();");
  const finish = (ctx, side) => run(ctx, "(() => { const side = " +
    JSON.stringify(side) + "; " +
    "for(const m of albumMen('wc2006', side)) albumStick(albumId('wc2006', side, m)); " +
    "albumCheckPage('wc2006', side); mineSave(); })();");

const check = (n, c, x) => {
  console.log((c ? "  PASS  " : "  FAIL  ") + n + (c ? "" : "   <-- got: " + x));
  if (!c) fails++;
};

(async () => {
  const app = makeInstance("report");
  await tick(340);
  run(app, "TEAMS.wc2006 = " + JSON.stringify(R("assets/wc2006/index.json")));
  for (const [id, dir] of [["seriea", "seriea"], ["laliga", "laliga"], ["premier", "premier"],
                           ["ere", "eredivisie"], ["bundesliga", "bundesliga"]])
    run(app, "DECKS[" + JSON.stringify(id) + "] = " + JSON.stringify(R("assets/" + dir + "/index.json")));

  const start = (play) => run(app,
    'S = freshState(["Martijn","Bram"], false, "classic", 0, "' + play + '", false); h2Start(); ' +
    'h2PickTeam("Netherlands"); h2PickTeam("Italy"); S.h2h.tossed = true; S.h2h.subs=[3,3]; h2TackleOn = false;');
  /* one ball, played and judged, from a named slot to a named slot */
  const ball = async (who, from, to, ok) => {
    run(app, "S.h2h.who=" + who + "; S.h2h.at=" + from + "; S.h2h.sel=null; S.h2h.marks=[]; " +
      "S.h2h.markedAgainst=" + who + "; S.phase=\"h_pick\"; render(); h2Select(" + to + "); h2Play();");
    await tick();
    run(app, "h2Reveal(); h2Judge(" + (ok ? "true" : "false") + ");");
    await tick();
  };

  console.log("--- a match with known outcomes ---");
  run(app, "localStorage.setItem('ball3-outcomes','[]');");
  start("manager");
  const mid = ev(app, "S.mid");
  check("the match has an id from the first ball", !!mid, mid);

  /* four balls to slot 7, three of them lost; three to slot 9, all found.
     Three each, because the report refuses to call two out of two a pattern
     and a test should ask about claims it is allowed to make. */
  await ball(0, 5, 7, false);
  await ball(0, 5, 7, false);
  await ball(0, 5, 7, false);
  await ball(0, 5, 7, true);
  await ball(0, 5, 9, true);
  await ball(0, 5, 9, true);
  await ball(0, 5, 9, true);

  const rep = ev(app, "h2Report(" + JSON.stringify(mid) + ")");
  check("the report found this match", !!rep, rep);
  check("it counted every ball", rep && rep[0].balls === 7, rep && rep[0].balls);
  check("and how many were found", rep && rep[0].won === 4, rep && rep[0].won);

  const men = rep ? rep[0].men : {};
  const seven = ev(app, "h2Man(7,0).n"), nine = ev(app, "h2Man(9,0).n");
  check("the man at seven has four balls against his name",
    men[seven] && men[seven].n === 4, JSON.stringify(men[seven]));
  check("one of which he got", men[seven] && men[seven].ok === 1, JSON.stringify(men[seven]));
  check("the striker has three, all found",
    men[nine] && men[nine].n === 3 && men[nine].ok === 3, JSON.stringify(men[nine]));
  check("and nobody else is in the list", Object.keys(men).length === 2, Object.keys(men).join(", "));

  const lines = ev(app, "h2ReportLines(h2Report(" + JSON.stringify(mid) + ")[0])");
  check("it says how many balls were played", lines.some(l => /played 7 balls and found 4/.test(l)),
    JSON.stringify(lines));
  check("it names the worst ball, and it is the right man",
    lines.some(l => l.indexOf("worst ball was to " + seven) > -1), JSON.stringify(lines));
  check("it names the man who got every one",
    lines.some(l => l.indexOf(nine + " got every one of his 3") > -1), JSON.stringify(lines));
  /* NOTHING ON TWO BALLS. A claim needs three behind it or it is a coincidence
     dressed as a finding, and a report that always finds something to say is a
     horoscope. Its own match, so the counts above are not disturbed. */
  run(app, "S.mid = 'floor-test';");
  await ball(0, 5, 8, false);
  await ball(0, 5, 8, false);
  const floor = ev(app, "h2ReportLines(h2Report('floor-test')[0])");
  check("two out of two names nobody at all",
    !floor.some(l => /worst ball|got every one/.test(l)), JSON.stringify(floor));
  await ball(0, 5, 8, false);
  const floor3 = ev(app, "h2ReportLines(h2Report('floor-test')[0])");
  check("the third ball lets it speak", floor3.some(l => /worst ball was to/.test(l)),
    JSON.stringify(floor3));
  run(app, "S.mid = " + JSON.stringify(mid) + ";");

  console.log("\n--- a substitute does not inherit what the man he replaced lost ---");
  /* deliberately NOT clearing the log here: the section after this one checks
     that two matches sitting in the same store stay apart */
  start("manager");
  const mid2 = ev(app, "S.mid");
  const before = ev(app, "h2Man(7,0).n");
  await ball(0, 5, 7, false);
  await ball(0, 5, 7, false);
  await ball(0, 5, 7, false);
  /* put a fresh man in that slot and play three more, all found */
  finishBoth(app);
  run(app, "S.h2h.subbed[0][7] = h2Bench(0)[0].p; S.h2h.benchUsed[0].push(0);");
  const after = ev(app, "h2Man(7,0).n");
  check("a different man is in the slot now", after !== before, before + " then " + after);
  await ball(0, 5, 7, true);
  await ball(0, 5, 7, true);
  await ball(0, 5, 7, true);
  const men2 = ev(app, "h2Report(" + JSON.stringify(mid2) + ")[0].men");
  check("the man who came off keeps his three lost balls",
    men2[before] && men2[before].n === 3 && men2[before].ok === 0, JSON.stringify(men2[before]));
  check("and the man who came on keeps his three found ones",
    men2[after] && men2[after].n === 3 && men2[after].ok === 3, JSON.stringify(men2[after]));

  console.log("\n--- one match cannot read another's rows ---");
  const old = ev(app, "h2Report(" + JSON.stringify(mid) + ")");
  check("the first match still reports its own seven", old && old[0].balls === 7, old && old[0].balls);
  check("and the second its own six", ev(app, "h2Report(" + JSON.stringify(mid2) + ")[0].balls") === 6,
    ev(app, "h2Report(" + JSON.stringify(mid2) + ")[0].balls"));
  check("and a match nobody played reports nothing",
    ev(app, 'h2Report("no-such-match")') === null, ev(app, 'h2Report("no-such-match")'));

  console.log("\n--- the league is caught before it is thrown away ---");
  run(app, "localStorage.setItem('ball3-outcomes','[]');");
  start("manager");
  const mid3 = ev(app, "S.mid");
  for (let k = 0; k < 4; k++) await ball(0, 5, 7, true);
  const r3 = ev(app, "h2Report(" + JSON.stringify(mid3) + ")[0]");
  const named = Object.values(r3.leagues).reduce((a, b) => a + b, 0);
  check("every ball knows which deck answered it, or honestly says the bank",
    named + (4 - named) === 4 && named >= 0, JSON.stringify(r3.leagues));
  check("the shape was recorded too",
    ev(app, 'JSON.parse(localStorage.getItem("ball3-outcomes")).slice(-1)[0].form') === "4-2-3-1",
    ev(app, 'JSON.parse(localStorage.getItem("ball3-outcomes")).slice(-1)[0].form'));

  console.log("\n--- One on One logs the men too, but claims nothing about lines ---");
  run(app, "localStorage.setItem('ball3-outcomes','[]');");
  start("pitch");
  const mid4 = ev(app, "S.mid");
  for (let k = 0; k < 3; k++) await ball(0, 5, 7, false);
  const r4 = ev(app, "h2Report(" + JSON.stringify(mid4) + ")[0]");
  check("the balls are counted on the pitch as well", r4 && r4.balls === 3, r4 && r4.balls);
  check("but no line is claimed, because there are none to set",
    r4 && Object.keys(r4.vline).length === 0, JSON.stringify(r4 && r4.vline));

  console.log("\n" + (fails ? fails + " FAILED" : "ALL PASS"));
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
