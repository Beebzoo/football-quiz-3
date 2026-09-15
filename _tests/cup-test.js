/* THE CUP.
 *
 *     node _tests/cup-test.js
 *
 * A run is seven matches spread over days, which makes it the only thing in
 * the app where a bug costs somebody a week rather than a minute. So the rules
 * that get checked here are the ones where a mistake is silent:
 *
 *   A RUN ADVANCES ONLY ON A RESULT. Starting a match must not move it and
 *   abandoning one halfway must leave it exactly where it was, or a closed tab
 *   quietly knocks you out of the World Cup.
 *
 *   THE GROUP IS THE REAL GROUP. The other three have already played each
 *   other with the real scores, so finishing second is a bar somebody actually
 *   had to clear rather than a number the app invented.
 *
 *   THE TABLE SETTLES ON GOAL DIFFERENCE, THEN GOALS SCORED, which is how 2006
 *   settled it, and it is the difference between going through and going home.
 *
 *   THE BRACKET SLOT IS THE DRAW. Winning the group has to put you somewhere
 *   different from finishing second, or winning it means nothing.
 *
 *   LOSING A KNOCKOUT ENDS THE RUN AND KEEPS THE RECORD. Out is out, and the
 *   seven matches you played are still yours to look at.
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

const CUP = R("assets/cup/2006.json");
const WC = R("assets/wc2006/index.json");
const CUP18 = R("assets/cup/2018.json");
const WC18 = R("assets/wc2018/index.json");

(async () => {
  const app = makeInstance("cup");
  await tick(340);
  /* the harness is offline on purpose, so both decks are handed over the way a
     fetch would have handed them over */
  run(app, "TEAMS.wc2006 = " + JSON.stringify(WC) + ";");
  run(app, "CUPS['2006'] = " + JSON.stringify(CUP) + ";");
  run(app, "TEAMS.wc2018 = " + JSON.stringify(WC18) + ";");
  run(app, "CUPS['2018'] = " + JSON.stringify(CUP18) + ";");
  /* The Dugout asks Pick One, so the Cup needs the multiple choice bank before
     it will let anybody kick off. */
  run(app, 'DECKS["classic-mc"] = ' + JSON.stringify(R("assets/mc/index.json")) + ";");
  const clean = () => run(app, 'localStorage.removeItem("ball3-mine"); MINE = null;');
  const cup = () => ev(app, "mine().cup");
  const file = (f, g, pens) => run(app, "cupFiled(" + f + ", " + g + ", " +
    (pens ? JSON.stringify(pens) : "null") + ");");

  console.log("--- the tournament, before anybody plays it ---");
  /* THE DATA IS THE FEATURE. Everything below is arithmetic on this, so if the
     harvest is wrong the whole Cup is wrong in a way no screen would show. */
  const groups = "ABCDEFGH".split("");
  check("eight groups", groups.every(g => CUP.groups[g]), Object.keys(CUP.groups).join(""));
  check("four sides in each", groups.every(g => CUP.groups[g].sides.length === 4),
    groups.map(g => CUP.groups[g].sides.length).join(","));
  check("six matches in each", groups.every(g => CUP.groups[g].played.length === 6),
    groups.map(g => CUP.groups[g].played.length).join(","));
  check("thirty-two sides, all of them in the deck",
    groups.reduce((a, g) => a.concat(CUP.groups[g].sides), []).every(s => !!WC[s]) &&
    groups.reduce((a, g) => a.concat(CUP.groups[g].sides), []).length === 32,
    groups.reduce((a, g) => a.concat(CUP.groups[g].sides), []).filter(s => !WC[s]).join(", "));
  check("sixteen bracket slots and no two the same",
    CUP.slots.length === 16 && new Set(CUP.slots).size === 16, CUP.slots.join(" "));
  check("the draw pairs a winner with the next group's runner-up",
    CUP.slots[0] === "A1" && CUP.slots[1] === "B2" && CUP.slots[8] === "B1" && CUP.slots[9] === "A2",
    CUP.slots.slice(0, 2).join(",") + " / " + CUP.slots.slice(8, 10).join(","));
  check("fifteen knockout matches", CUP.ko.length === 15, CUP.ko.length);
  /* the one everybody in the room can check from memory */
  const fin = CUP.ko[14];
  check("and the final is the one that happened",
    fin.a === "Italy" && fin.b === "France" && fin.pf === 5 && fin.pg === 3,
    fin.a + " " + fin.f + " (" + fin.pf + ") - " + fin.g + " (" + fin.pg + ") " + fin.b);
  check("Italy are ranked champions", ev(app, 'cupRank("Italy")') === 7, ev(app, 'cupRank("Italy")'));
  check("and Togo are not", ev(app, 'cupRank("Togo")') === 1, ev(app, 'cupRank("Togo")'));

  console.log("\n--- the group you walk into has already been played ---");
  clean();
  run(app, 'cupStart("Trinidad and Tobago");'); await tick(120);
  let c = cup();
  check("a run exists", !!c && c.nation === "Trinidad and Tobago", JSON.stringify(c && c.nation));
  check("in the right group", c.group === "B", c.group);
  check("with three fixtures", c.fixtures.length === 3, c.fixtures.join(", "));
  check("and none of them is yourself", c.fixtures.indexOf("Trinidad and Tobago") < 0, c.fixtures.join(", "));
  /* THE OTHER THREE HAVE PLAYED EACH OTHER and you have played nobody */
  check("you have played none", c.table["Trinidad and Tobago"].p === 0, c.table["Trinidad and Tobago"].p);
  check("the other three have played two each",
    ["England", "Sweden", "Paraguay"].every(s => c.table[s].p === 2),
    ["England", "Sweden", "Paraguay"].map(s => s + " " + c.table[s].p).join(", "));
  /* England 1-0 Paraguay, Sweden 1-0 Paraguay, Sweden 2-2 England: the real
     three matches of Group B that Trinidad were not in */
  check("with the real results in the table",
    c.table.England.pts === 4 && c.table.Sweden.pts === 4 && c.table.Paraguay.pts === 0,
    ["England", "Sweden", "Paraguay"].map(s => s + " " + c.table[s].pts).join(", "));

  console.log("\n--- a run advances only on a result ---");
  const before = JSON.stringify(cup());
  run(app, "cupPlay();"); await tick(150);
  check("starting a match does not move the run", JSON.stringify(cup()) === before, "the run moved");
  check("but a match is on", ev(app, "!!(S && S.cup)") === true, ev(app, "S && S.cup"));
  check("in The Dugout, as the right country",
    ev(app, "S.h2h.teams[0]") === "Trinidad and Tobago", ev(app, "S.h2h.teams[0]"));
  check("against the right opponent", ev(app, "S.h2h.teams[1]") === cup().fixtures[0],
    ev(app, "S.h2h.teams[1]"));
  check("and the computer is in the other dugout", ev(app, "!!S.players[1].ai") === true,
    ev(app, "S.players[1].ai"));
  /* ABANDONING IS A CLOSED TAB, not a defeat */
  run(app, "S = null;"); await tick(110);
  check("abandoning mid-match keeps the run", JSON.stringify(cup()) === before, "the run moved");
  check("and it still wants the same match", ev(app, "cupNext()") === cup().fixtures[0],
    ev(app, "cupNext()"));

  console.log("\n--- goal difference, then goals scored ---");
  clean();
  /* GROUP A, where Germany and Ecuador have between them left exactly the
     shape this rule is for. Poland's three matches are against Ecuador,
     Germany and Costa Rica, in that order. */
  run(app, 'cupStart("Poland");'); await tick(110);
  c = cup();
  check("Group A, and Germany already have six", c.group === "A" && c.table.Germany.pts === 6,
    c.group + " / " + (c.table.Germany && c.table.Germany.pts));
  /* beat everybody by one: nine points and through as winners */
  file(1, 0); file(1, 0); file(1, 0);
  c = cup();
  check("nine points wins the group", c.round === "r16" && c.place === 1,
    c.round + " / " + c.place);
  /* NOW THE SAME RUN, WON BY LESS, which puts three sides on six points and
     leaves the whole group to the tie-break: lose to Ecuador, beat Germany,
     beat Costa Rica. */
  clean();
  run(app, 'cupStart("Poland");'); await tick(110);
  file(0, 1); file(1, 0); file(1, 0);
  const t = ev(app, "cupTable(mine().cup)");
  c = cup();
  check("three sides level on six points",
    t.slice(0, 3).every(r => r.pts === 6), t.map(r => r.side + " " + r.pts).join(", "));
  check("the better goal difference is first",
    t[0].side === "Germany" && (t[0].gf - t[0].ga) === 4,
    t.map(r => r.side + " " + (r.gf - r.ga)).join(", "));
  check("and level on difference, more goals scored is second",
    t[1].side === "Ecuador" && t[2].side === "Poland" &&
    (t[1].gf - t[1].ga) === (t[2].gf - t[2].ga) && t[1].gf > t[2].gf,
    t.map(r => r.side + " " + (r.gf - r.ga) + " gf" + r.gf).join(", "));
  check("which puts Poland out on goals scored", c.alive === false && c.place === 3,
    c.alive + " / " + c.place);
  /* GOALS SCORED IS THE NEXT ONE DOWN, and it is checked on the sort itself
     because engineering a whole group to land there is a worse test than
     asking the function the question. */
  const tie = ev(app, '(() => { const r = {group: "A", table: {' +
    'One: {p:3,w:1,d:1,l:1,gf:4,ga:3,pts:4}, Two: {p:3,w:1,d:1,l:1,gf:2,ga:1,pts:4}}}; ' +
    'return cupTable(r).map(x => x.side); })()');
  check("same points and same difference, more goals is first", tie[0] === "One", tie.join(", "));

  console.log("\n--- the bracket slot is the draw ---");
  clean();
  run(app, 'cupStart("Trinidad and Tobago");'); await tick(110);
  file(3, 0); file(3, 0); file(3, 0);
  c = cup();
  check("nine points tops Group B", c.place === 1 && c.round === "r16", c.place + " / " + c.round);
  check("the bracket is sixteen sides", c.line.length === 16, c.line.length);
  check("and you are in slot B1", CUP.slots[c.at] === "B1", CUP.slots[c.at] + " (" + c.at + ")");
  check("which plays the runner-up of Group A", ev(app, "cupNext()") === "Ecuador", ev(app, "cupNext()"));
  /* THE SEVEN GROUPS YOU ARE NOT IN ARE THE REAL QUALIFIERS */
  check("Germany are in the bracket where Germany were", c.line[0] === "Germany", c.line[0]);
  check("and Italy where Italy were", c.line[4] === "Italy", c.line[4]);
  check("nobody who went home is in it",
    c.line.indexOf("Togo") < 0 && c.line.indexOf("Serbia and Montenegro") < 0,
    c.line.join(", "));
  /* SECOND PUTS YOU SOMEWHERE ELSE, which is what makes winning it worth
     anything */
  clean();
  run(app, 'cupStart("Trinidad and Tobago");'); await tick(110);
  file(0, 1); file(1, 0); file(2, 0);
  c = cup();
  check("six points is second in Group B", c.place === 2, c.place + " (" +
    ev(app, "cupTable(mine().cup).map(r => r.side + ' ' + r.pts).join(', ')") + ")");
  check("and second is a different slot", CUP.slots[c.at] === "B2", CUP.slots[c.at]);
  check("with a different opponent", ev(app, "cupNext()") === "Germany", ev(app, "cupNext()"));

  console.log("\n--- third is out, however good the record ---");
  clean();
  run(app, 'cupStart("Trinidad and Tobago");'); await tick(110);
  file(0, 1); file(0, 1); file(3, 0);
  c = cup();
  check("three points is third", c.place === 3, c.place);
  check("and the run is over", c.alive === false && c.out === "the group", c.alive + " / " + c.out);
  check("with all three results kept", c.results.length === 3, c.results.length);

  console.log("\n--- a tie that really happened ends the way it really ended ---");
  const real = ev(app, 'cupDecide("Brazil", "France")');
  check("France still knock Brazil out", real.w === "France" && real.f === 0 && real.g === 1,
    JSON.stringify(real));
  check("and it says so", real.real === true, JSON.stringify(real));
  const made = ev(app, 'cupDecide("Brazil", "Trinidad and Tobago")');
  check("a tie that never happened is decided, not invented from nothing",
    made.w === "Brazil" || made.w === "Trinidad and Tobago", JSON.stringify(made));

  console.log("\n--- losing a knockout ends the run and keeps the record ---");
  clean();
  run(app, 'cupStart("Trinidad and Tobago");'); await tick(110);
  file(3, 0); file(3, 0); file(3, 0);
  check("through as winners", cup().round === "r16", cup().round);
  file(0, 0, [3, 4]);
  c = cup();
  check("beaten on penalties is beaten", c.alive === false, c.alive);
  check("out in the last sixteen", c.out === "the last sixteen", c.out);
  check("four matches on the record", c.results.length === 4, c.results.length);
  check("and the shootout is on it", c.results[3].pf === 3 && c.results[3].pg === 4,
    JSON.stringify(c.results[3]));
  check("the chart kept the tie", (c.chart || []).length === 1, (c.chart || []).length);
  check("with you on the right side of it",
    c.chart[0].a === "Trinidad and Tobago" || c.chart[0].b === "Trinidad and Tobago",
    JSON.stringify(c.chart[0]));

  console.log("\n--- winning it ---");
  clean();
  run(app, 'cupStart("Trinidad and Tobago");'); await tick(110);
  file(3, 0); file(3, 0); file(3, 0);
  for (const r of ["r16", "qf", "sf", "final"]) {
    check("into " + r, cup().round === r, cup().round);
    file(2, 0);
  }
  c = cup();
  check("champions of the world", c.won === true && c.alive === false, c.won + " / " + c.alive);
  check("seven matches", c.results.length === 7, c.results.length);
  /* THE PRIZE IS THE PAGE. Twenty-three stickers of the country you took all
     the way, which is a foil, which is their bench in The Dugout. */
  check("their album page is finished",
    ev(app, 'albumDone("wc2006", "Trinidad and Tobago")') === true, "not finished");
  check("and it is a foil",
    ev(app, 'albumFoil("wc2006", "Trinidad and Tobago")') === true, "no foil");
  check("the chart has every tie of every round",
    c.chart.length === 8 + 4 + 2 + 1, c.chart.length);
  check("and one of them is yours in each round",
    ["r16", "qf", "sf", "final"].every(r => c.chart.filter(m => m.round === r && m.you).length === 1),
    c.chart.filter(m => m.you).map(m => m.round).join(", "));
  /* THE LINE ON THE TABLE, which is the part somebody points at in a year and
     therefore the part that must survive the next run overwriting this one. */
  const filed = ev(app, "mine().cups");
  check("the run is filed", filed.length === 1 && filed[0].won === true, JSON.stringify(filed));
  check("and it reads like something you would say",
    /^Won the 2006 World Cup with Trinidad and Tobago, 2-0 against .+ in the final\.$/
      .test(ev(app, "cupLine(mine().cups[0])")), ev(app, "cupLine(mine().cups[0])"));
  run(app, 'cupStart("Togo");'); await tick(110);
  check("starting another keeps the old one filed", ev(app, "mine().cups.length") === 1,
    ev(app, "mine().cups.length"));
  run(app, "openBoard(); render();"); await tick(150);
  check("and The Table shows it", /Won the 2006 World Cup with Trinidad/.test(stage(app)),
    "not on the Table");
  run(app, "closeBoard(); render();"); await tick(110);
  /* A BINNED RUN IS NOT A RESULT. The Table is a record of things that ended. */
  run(app, "cupQuit();"); await tick(110);
  check("abandoning a run files nothing", ev(app, "mine().cups.length") === 1,
    ev(app, "mine().cups.length"));

  console.log("\n--- a group match may end level, a knockout may not ---");
  clean();
  run(app, 'cupStart("England");'); await tick(110);
  run(app, "cupPlay();"); await tick(150);
  run(app, "S.players[0].score = 1; S.players[1].score = 1; S.h2h.min = H2_MINUTES; h2AfterWhistle();");
  await tick(150);
  check("a level group match is a draw", ev(app, "S.phase") === "results", ev(app, "S.phase"));
  check("and it filed as one", cup().results[0].f === 1 && cup().results[0].g === 1,
    JSON.stringify(cup().results[0]));
  check("one point each", cup().table.England.pts === 1, cup().table.England.pts);
  /* through the front door: the whistle, not cupFiled */
  check("a real match end moves the run", cup().n === 1, cup().n);
  file(3, 0); file(3, 0);
  check("and England are through", cup().round === "r16", cup().round);
  run(app, "cupPlay();"); await tick(150);
  run(app, "S.players[0].score = 1; S.players[1].score = 1; S.h2h.min = H2_MINUTES; h2AfterWhistle();");
  await tick(150);
  check("a level knockout goes to penalties", ev(app, "S.phase") === "h_pens", ev(app, "S.phase"));

  console.log("\n--- a second tournament ---");
  clean();
  run(app, "CUP_YEAR = '2006';");
  /* ONLY THE ONES WHOSE TABLE AND SQUADS HAVE BOTH LANDED. This instance was
     handed 2006 and 2018 and not 2022, which is exactly what a phone on a slow
     connection looks like. */
  check("the tournaments on the phone are the ones it has, newest first",
    ev(app, "cupYearsLive().join(',')") === "2018,2006",
    ev(app, "cupYearsLive().join(',')"));
  check("and a year with no data is not offered", ev(app, "CUP_YEARS.indexOf('2022') > -1") === true,
    "2022 is not in the list at all");
  check("2006 is where it opens", ev(app, "cupYear()") === "2006", ev(app, "cupYear()"));
  /* THE SIDE LISTS ARE DIFFERENT TOURNAMENTS, which is the cheapest possible
     proof that the year is actually being read. */
  check("and Trinidad are in the 2006 draw", ev(app, 'cupGroupOf("Trinidad and Tobago")') === "B",
    ev(app, 'cupGroupOf("Trinidad and Tobago")'));
  run(app, "cupSetYear('2018');"); await tick(120);
  check("switching moves the tournament", ev(app, "cupYear()") === "2018", ev(app, "cupYear()"));
  check("Trinidad are not in 2018", ev(app, 'cupGroupOf("Trinidad and Tobago")') === null,
    ev(app, 'cupGroupOf("Trinidad and Tobago")'));
  check("but Panama are", ev(app, 'cupGroupOf("Panama")') === "G", ev(app, 'cupGroupOf("Panama")'));
  check("and France won it", ev(app, 'cupRank("France")') === 7, ev(app, 'cupRank("France")'));
  check("while Germany went out in the group", ev(app, 'cupRank("Germany")') === 1,
    ev(app, 'cupRank("Germany")'));

  console.log("\n--- and a 2018 run is a 2018 run all the way through ---");
  run(app, 'cupStart("Panama");'); await tick(120);
  c = cup();
  check("the run knows its year", c.year === "2018", c.year);
  check("in the right group", c.group === "G", c.group);
  check("against the sides who were in it",
    c.fixtures.slice().sort().join(",") === "Belgium,England,Tunisia", c.fixtures.join(","));
  /* A RUN PINS ITS TOURNAMENT. Switching the picker under a half-played run
     would strand it, so it simply does not move. */
  run(app, "cupSetYear('2006');"); await tick(110);
  check("a run in progress pins the tournament", ev(app, "cupYear()") === "2018",
    ev(app, "cupYear()"));
  /* AND IT IS PLAYED WITH THE 2018 SQUADS */
  run(app, "cupPlay();"); await tick(160);
  check("the match uses the 2018 pool", ev(app, "S.pool") === "wc2018", ev(app, "S.pool"));
  check("with Panama in it", ev(app, "S.h2h.teams[0]") === "Panama", ev(app, "S.h2h.teams[0]"));
  /* the shirt is the proof: 2018 Panama, not a 2006 side */
  check("and 2018 men on the pitch",
    /Panama/.test(JSON.stringify(ev(app, "Object.keys(TEAMS.wc2018)"))) &&
    ev(app, "h2Man(0,0).full") === WC18.Panama.xi[0].full,
    ev(app, "h2Man(0,0).full") + " / " + WC18.Panama.xi[0].full);
  run(app, "S = null;"); await tick(110);
  /* THROUGH THE GROUP AND INTO 2018'S DRAW */
  file(2, 0); file(2, 0); file(2, 0);
  c = cup();
  check("nine points tops Group G", c.place === 1 && c.round === "r16", c.place + " / " + c.round);
  check("and the last sixteen is the real 2018 draw",
    CUP18.slots[c.at] === "G1", CUP18.slots[c.at]);
  check("which in 2018 played the runner-up of Group H",
    ev(app, "cupNext()") === CUP18.groups.H.sides[1], ev(app, "cupNext()"));
  /* AND THE REAL 2018 TIES STILL END THE WAY THEY ENDED */
  const real18 = ev(app, 'cupDecide("Brazil", "Belgium")');
  check("Belgium still knock Brazil out in Kazan",
    real18.w === "Belgium" && real18.f === 1 && real18.g === 2, JSON.stringify(real18));
  clean();
  run(app, "CUP_YEAR = '2006';");

  console.log("\n--- the screens ---");
  clean();
  run(app, "openCup(); render();"); await tick(150);
  check("the Cup opens in front of the menu", /Pick a/.test(stage(app)), "menu instead");
  check("with all thirty-two", (stage(app).match(/cupLook\(/g) || []).length >= 32,
    (stage(app).match(/cupLook\(/g) || []).length);
  run(app, 'cupLook("Togo"); render();'); await tick(130);
  check("a nation's card says what they did", /finished bottom of their group/.test(stage(app)),
    "no epitaph");
  run(app, 'cupStart("Togo"); render();'); await tick(150);
  check("starting one shows the group table", /Group G/.test(stage(app)), "no table");
  check("and the card for the next one", /Form/.test(stage(app)) && /Style/.test(stage(app)),
    "no card");
  file(9, 0); file(9, 0); file(9, 0);
  run(app, "render();"); await tick(130);
  check("through to the bracket, and it is drawn", /Last 16/.test(stage(app)), "no chart");
  run(app, "cupQuit(); render();"); await tick(130);
  check("abandoning a run clears it", cup() == null, JSON.stringify(cup()));
  check("and puts you back at the picker", /Pick a/.test(stage(app)), "somewhere else");
  run(app, "closeCup(); render();"); await tick(130);
  check("closing it goes back", !/cupLook/.test(stage(app)), "still on the Cup");

  /* ---------- and the other way out of a run ---------- */
  console.log("\n--- going out still lets you take somebody else ---");
  clean();
  run(app, 'openCup(); cupStart("Trinidad and Tobago");'); await tick(120);
  file(0, 1); file(0, 1); file(0, 1);
  check("the run is over", ev(app, "mine().cup.alive") === false, ev(app, "mine().cup.alive"));
  run(app, "render();"); await tick(120);
  check("and the out screen offers another nation", /Take another nation/.test(stage(app)),
    "no way out of the out screen");
  /* THE SCREEN, NOT THE FLAG. Asking whether mine().cup went null would have
     passed against the broken version too, because the bug was never in the
     clearing: nothing called it, and renderCup reads cupRun() before it reads
     CUP_VIEW, so a spent run drew the out screen for ever. */
  run(app, "cupLook();"); await tick(130);
  check("taking another nation reaches the picker", /Pick a/.test(stage(app)),
    "still on the out screen");
  check("and the spent run is gone", ev(app, "mine().cup") == null,
    JSON.stringify(ev(app, "mine().cup")));
  /* AND IT MUST NEVER EAT A LIVE ONE, because the picker's own navigation is
     the same function: Somebody else calls it bare, every nation in the list
     calls it with a name. */
  run(app, 'cupStart("Trinidad and Tobago");'); await tick(120);
  run(app, "cupLook();"); await tick(120);
  check("a run still going survives the same button", ev(app, "mine().cup") != null,
    "it ate a live run");
  run(app, "cupQuit();"); await tick(120);

  console.log("\n" + (fails ? fails + " FAILED" : "ALL PASS"));
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
