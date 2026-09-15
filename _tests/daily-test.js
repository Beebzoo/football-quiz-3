/* THE DAILY BALL.
 *
 *     node _tests/daily-test.js
 *
 * Six questions up the ladder, the same six for everybody on the same day.
 * That last clause is the whole feature: the share line is only worth pasting
 * if the person reading it had the same six, so "the same six" is the thing
 * this suite is really about.
 *
 * Two ways it could quietly stop being true, and both are checked:
 *
 *   A REBUILD THAT REORDERS THE BANK. S.used fell into this once already:
 *   it holds indexes, so appending a pack sends every parked match to a
 *   different question. A daily that picked by index would do worse, because
 *   it would change questions people have already played and screenshotted.
 *   It picks by a hash of the words instead, and the test proves it by
 *   shuffling the bank and asking again.
 *
 *   A QUESTION SPENT TWICE. The daily and the Friday night draw from the same
 *   deck and must not burn each other's questions.
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
  const app = makeInstance("daily");
  await tick(340);
  const mc = R("assets/mc/index.json");
  run(app, 'DECKS["classic-mc"] = ' + JSON.stringify(mc) + ";");
  /* PLAYER OF THE DAY needs the album, which is the 2006 squads. The daily
     works without them; the prize does not. */
  run(app, "TEAMS.wc2006 = " + JSON.stringify(R("assets/wc2006/index.json")) + ";");

  console.log("--- everyone gets the same six on the same day ---");
  const six = d => JSON.stringify(ev(app, "dailySix(" + d + ").map(x => x.k)"));
  const a1 = six(20260914), a2 = six(20260914);
  check("the same date gives the same six", a1 === a2, a1 + " then " + a2);
  check("and six of them", JSON.parse(a1).length === 6, JSON.parse(a1).length);
  check("a different date gives different questions", six(20260915) !== a1, "identical");
  /* ONE PER RUNG, in the ladder's own order, because the daily is the ladder */
  const tiers = ev(app, "dailySix(20260914).map(x => x.tier)");
  check("one per rung, keeper to striker",
    tiers.join() === "easy,normal,hard,extreme,extreme,ball", tiers.join());

  console.log("\n--- and a rebuild that reorders the bank cannot change them ---");
  /* THE TRAP S.used FELL INTO. Appending a pack moves every index below it; a
     daily picked by index would change questions people have already played
     and posted a screenshot of. */
  const before = six(20260914);
  run(app, '(() => { const b = DECKS["classic-mc"]; for(const t of Object.keys(b)){ ' +
    "const a = b[t]; for(let i = a.length - 1; i > 0; i--){ const j = Math.floor(Math.random() * (i + 1)); " +
    "const tmp = a[i]; a[i] = a[j]; a[j] = tmp; } } })();");
  run(app, "for(const k of Object.keys(dailyBankCache)) delete dailyBankCache[k];");
  const after = six(20260914);
  check("the same six survive a shuffled bank", before === after, "they moved");
  /* and they are still the same QUESTIONS, not just the same keys */
  const qs = ev(app, 'dailySix(20260914).map(x => DECKS["classic-mc"][x.tier][x.i].q)');
  check("and they still point at real questions", qs.every(x => typeof x === "string" && x.length > 5),
    JSON.stringify(qs).slice(0, 80));

  console.log("\n--- playing it ---");
  run(app, 'localStorage.removeItem("ball3-mine"); MINE = null;');
  run(app, "dailyStart();"); await tick(140);
  check("it opens on the first rung", ev(app, "S.phase") === "d_q", ev(app, "S.phase"));
  check("which is the Easy one", ev(app, "S.tier") === "easy", ev(app, "S.tier"));
  check("and the question is on the screen", /h2opt/.test(stage(app)), "no options");
  /* get four right and the fifth wrong */
  for (let i = 0; i < 4; i++) {
    run(app, "dailyPick(q().k); dailyOn();"); await tick(110);
  }
  check("four right takes you to the fifth rung", ev(app, "mine().daily.rung") === 4,
    ev(app, "mine().daily.rung"));
  run(app, "dailyPick((q().k + 1) % 4); dailyOn();"); await tick(120);
  check("and one wrong ends it", ev(app, "S.phase") === "d_done", ev(app, "S.phase"));
  check("four rungs reached", ev(app, "mine().daily.reached") === 4, ev(app, "mine().daily.reached"));

  console.log("\n--- the share line ---");
  const line = ev(app, "dailyShare()");
  const squares = [...line].filter(c => c === "\u{1F7E9}" || c === "\u{1F7E5}" || c === "⬛").length;
  check("exactly six squares", squares === 6, squares + " in " + JSON.stringify(line));
  check("four green", [...line].filter(c => c === "\u{1F7E9}").length === 4,
    [...line].filter(c => c === "\u{1F7E9}").length);
  check("one red, where it was lost", [...line].filter(c => c === "\u{1F7E5}").length === 1,
    [...line].filter(c => c === "\u{1F7E5}").length);
  check("one black, never reached", [...line].filter(c => c === "⬛").length === 1,
    [...line].filter(c => c === "⬛").length);
  check("and it names where you got to", /made it to the eight/.test(line), line);
  check("and carries the link", /beebzoo\.github\.io/.test(line), line);

  console.log("\n--- the streak ---");
  check("one day", ev(app, "mine().streak.played") === 1, ev(app, "mine().streak.played"));
  check("and one past halfway, because four rungs is past the six",
    ev(app, "mine().streak.half") === 1, ev(app, "mine().streak.half"));
  /* A CONSECUTIVE DAY ADDS ONE. The date is forced rather than waited for. */
  run(app, "mine().streak.last = 20260913; mine().streak.lastHalf = 20260913; " +
    "mine().daily = {date: 20260914, reached: 4, got: [1,1,1,1,0], done: true, spent: {}}; " +
    "dailyStreak(mine().daily);");
  await tick(100);
  check("yesterday plus today is two", ev(app, "mine().streak.played") === 2, ev(app, "mine().streak.played"));
  /* AND A GAP RESETS IT. No freezes and no forgiveness: a streak you can buy
     back is not a streak. */
  run(app, "mine().streak.last = 20260910; mine().streak.lastHalf = 20260910; " +
    "mine().daily = {date: 20260914, reached: 4, got: [1,1,1,1,0], done: true, spent: {}}; " +
    "dailyStreak(mine().daily);");
  await tick(100);
  check("a missed day starts again at one", ev(app, "mine().streak.played") === 1,
    ev(app, "mine().streak.played"));
  /* falling short of halfway breaks the half streak but not the played one */
  run(app, "mine().streak.last = 20260913; mine().streak.played = 5; mine().streak.half = 5; " +
    "mine().streak.lastHalf = 20260913; " +
    "mine().daily = {date: 20260914, reached: 1, got: [1,0], done: true, spent: {}}; " +
    "dailyStreak(mine().daily);");
  await tick(100);
  check("turning up still counts", ev(app, "mine().streak.played") === 6, ev(app, "mine().streak.played"));
  check("but falling short breaks the halfway streak", ev(app, "mine().streak.half") === 0,
    ev(app, "mine().streak.half"));

  console.log("\n--- it does not burn the match bank ---");
  run(app, 'localStorage.removeItem("ball3-mine"); MINE = null; dailyStart();'); await tick(140);
  const k0 = ev(app, "mine().daily.six[0].i");
  run(app, "dailyPick(q().k); dailyOn();"); await tick(120);
  run(app, 'S = freshState(["A","B"], false, "classic", 0, "board", true);');
  check("a question the daily used is not in the match's used list",
    (ev(app, "S.used.easy") || []).indexOf(k0) < 0, ev(app, "S.used.easy"));
  /* AND THE REVERSE. A question spent on a Friday must still be able to come
     up as a daily: two banks, one deck. */
  run(app, "S.used.easy = [" + k0 + "];");
  const stillThere = ev(app, "dailySix(20260914).map(x => x.i)");
  check("and the match cannot burn a daily's", Array.isArray(stillThere) && stillThere.length === 6,
    JSON.stringify(stillThere));

  console.log("\n--- a week does not repeat itself ---");
  run(app, 'localStorage.removeItem("ball3-mine"); MINE = null;');
  run(app, "mine().daily = {date: 1, spent: {}};");
  const seen = {};
  let clash = 0;
  for (let day = 20260901; day <= 20260907; day++) {
    const keys = ev(app, "dailySix(" + day + ").map(x => x.k)");
    for (const k of keys) { if (seen[k]) clash++; seen[k] = 1; }
    run(app, "(() => { const s = mine().daily.spent; for(const x of dailySix(" + day + ")) s[x.k] = 1; })();");
  }
  check("seven days, no question twice", clash === 0, clash + " repeats");

  console.log("\n--- player of the day ---");
  /* THE SAME MAN ON EVERY PHONE is the whole reason this is not a per-phone
     skip list, so it is the first thing checked. */
  run(app, 'localStorage.removeItem("ball3-mine"); MINE = null;');
  const man = d => JSON.stringify(ev(app, "dailyMan(" + d + ")"));
  check("a day has a man", ev(app, "!!dailyMan(20260914)") === true, man(20260914));
  check("and he is the same man asked twice", man(20260914) === man(20260914), "he moved");
  check("a different day is a different man", man(20260915) !== man(20260914), "the same man");
  /* A PHONE THAT HAS ALREADY WON HIM STILL GETS HIM, because the alternative
     is two mates playing for different men and comparing squares that no
     longer mean the same thing. */
  const was = man(20260914);
  run(app, '(() => { const c = dailyManCard(dailyMan(20260914)); ' +
    'albumStick(albumId(DAILY_BOOK, c.side, c.m)); mineSave(); })();');
  check("owning him does not move the calendar", man(20260914) === was, man(20260914));
  /* NOBODY TWICE INSIDE TWO YEARS: the album is shuffled once and the calendar
     walks along it, so the only repeat is a full lap. */
  const lap = ev(app, "dailyMen().length");
  check("the whole album is in the calendar", lap === 736, lap);
  const order = ev(app, "dailyMen().map(m => m.side + '/' + m.no)");
  check("and no man is in it twice", new Set(order).size === order.length,
    order.length - new Set(order).size + " repeats");

  console.log("\n--- one strip a rung, and the striker pays ---");
  run(app, 'localStorage.removeItem("ball3-mine"); MINE = null; dailyStart();'); await tick(140);
  check("today's daily is played for somebody", !!ev(app, "mine().daily.man"),
    JSON.stringify(ev(app, "mine().daily.man")));
  check("and nothing is uncovered yet", ev(app, "dailyPeel(mine().daily)") === 0,
    ev(app, "dailyPeel(mine().daily)"));
  check("the card is on the screen under six strips",
    (stage(app).match(/--s:/g) || []).length === 6, (stage(app).match(/--s:/g) || []).length);
  run(app, "dailyPick(q().k); dailyOn();"); await tick(120);
  check("a rung clears a strip", ev(app, "dailyPeel(mine().daily)") === 1,
    ev(app, "dailyPeel(mine().daily)"));
  check("and it is the top one that goes", /class="off" style="--s:0"/.test(stage(app)),
    "the wrong strip");
  check("and he is not yours yet",
    ev(app, '(() => { const c = dailyManCard(mine().daily.man); return albumHas(albumId(DAILY_BOOK, c.side, c.m)); })()') === false,
    "already stuck in");
  /* ALL THE WAY, and he goes straight into the album rather than into a pack */
  for (let i = 0; i < 5; i++) { run(app, "dailyPick(q().k); dailyOn();"); await tick(110); }
  check("six rungs is the striker", ev(app, "mine().daily.reached") === 6,
    ev(app, "mine().daily.reached"));
  check("the card is fully peeled", ev(app, "dailyPeel(mine().daily)") === 6,
    ev(app, "dailyPeel(mine().daily)"));
  check("and he is in the album",
    ev(app, '(() => { const c = dailyManCard(mine().daily.man); return albumHas(albumId(DAILY_BOOK, c.side, c.m)); })()') === true,
    "not stuck in");
  check("the share line says so", /is mine\./.test(ev(app, "dailyShare()")), ev(app, "dailyShare()"));
  /* A DAY YOU LOSE KEEPS THE PACK AND LOSES THE MAN, which is the whole point
     of showing him at the start. */
  run(app, 'localStorage.removeItem("ball3-mine"); MINE = null; dailyStart();'); await tick(140);
  run(app, "dailyPick((q().k + 1) % 4); dailyOn();"); await tick(130);
  check("one wrong answer ends it", ev(app, "mine().daily.done") === true, ev(app, "mine().daily.done"));
  check("the pack for turning up is still paid", ev(app, "mine().album.packs") === 1,
    ev(app, "mine().album.packs"));
  check("but he is not yours",
    ev(app, '(() => { const c = dailyManCard(mine().daily.man); return albumHas(albumId(DAILY_BOOK, c.side, c.m)); })()') === false,
    "stuck in anyway");
  check("and the screen says he goes back in the box",
    /back in the box/.test(stage(app)), "no line about him");

  console.log("\n--- the share, when the phone will not draw ---");
  /* THE HARNESS HAS NO CANVAS, which is the case that matters: a browser that
     refuses one must still hand over the daily, the text line and the streak.
     The picture is the extra, and it has to be absent rather than broken. */
  run(app, 'localStorage.removeItem("ball3-mine"); MINE = null; dailyStart();'); await tick(140);
  for (let i = 0; i < 6; i++) { run(app, "dailyPick(q().k); dailyOn();"); await tick(110); }
  check("the text line still works", /Daily Ball/.test(ev(app, "dailyShare()")), ev(app, "dailyShare()"));
  check("the picture is simply not offered", ev(app, "dailyCanShare()") === false,
    ev(app, "dailyCanShare()"));
  check("and the button is not on the screen", !/shareDailyImage/.test(stage(app)),
    "the button is there with nothing behind it");
  check("drawing it returns nothing rather than throwing", ev(app, "dailyCanvas()") === null,
    ev(app, "dailyCanvas()"));
  run(app, "shareDailyImage();"); await tick(110);
  check("and asking for it anyway is survivable", ev(app, "!!mine().daily.done") === true,
    "the daily fell over");
  /* A SECOND TAP ON PLAY ON must not push a result for a question that was
     only asked once: a rung never played coming back marked is what put a red
     cross on the striker in the share image. */
  const rungs = ev(app, "mine().daily.got.length");
  run(app, "dailyOn(); dailyOn();"); await tick(110);
  check("and a second tap on play on adds nothing",
    ev(app, "mine().daily.got.length") === rungs, ev(app, "mine().daily.got.length"));

  console.log("\n--- carrying it to another phone ---");
  /* the app saves on every change; the test has been poking the object
     directly, so it has to write it down before asking for an export */
  run(app, "mineSave();");
  const dump = ev(app, "exportMine()");
  check("the export is our own file", JSON.parse(dump).app === "BALL 3", JSON.parse(dump).app);
  check("and carries the namespace", !!JSON.parse(dump).data["ball3-mine"], "missing");
  /* the harness's localStorage has getItem, setItem and removeItem, which is
     all the app ever uses, so a cleared phone is spelled out */
  run(app, '["ball3-mine","ball3-quiz-history-v1","ball3-crew","ball3-outcomes","ball3-names","ball3-mp-name"]' +
    '.forEach(k => localStorage.removeItem(k)); MINE = null;');
  check("a cleared phone has nothing", ev(app, "mine().streak.played") === 0, ev(app, "mine().streak.played"));
  run(app, "importMine(" + JSON.stringify(dump) + ");"); await tick(120);
  check("and the import brings it back", ev(app, "mine().daily") !== null, ev(app, "mine().daily"));
  /* IT REFUSES RATHER THAN GUESSES, because an import is the one action here
     that can destroy something. */
  run(app, 'importMine("{\\"app\\":\\"something else\\"}");'); await tick(100);
  check("and refuses anything that is not ours", ev(app, "mine().daily") !== null, "it took it");

  console.log("\n--- the evening warning, on a clock we drive ---");
  /* THE HOUR IS AN ARGUMENT, so this walks a whole evening in a few
     milliseconds instead of waiting for one, and every date in here is cut from
     the same fixed day. A test that reads the wall clock either sleeps until
     nine or asserts nothing, and this suite already has one set of assertions
     that passed by coincidence of the date they were written on. */
  const AT = (h, mi) => "new Date(2026, 8, 14, " + h + ", " + (mi || 0) + ")";
  const standing = (played, last) =>
    'localStorage.removeItem("ball3-mine"); MINE = null; ' +
    "mine().streak.played = " + played + "; mine().streak.last = " + last + "; " +
    "delete mine().daily; mineSave();";
  const risk = (h, mi) => ev(app, "dailyRisk(" + AT(h, mi) + ")");

  run(app, standing(9, 20260913));
  check("nothing at four in the afternoon", risk(16, 0) === 0, risk(16, 0));
  check("nothing at a minute to nine", risk(20, 59) === 0, risk(20, 59));
  check("three hours at nine on the dot", risk(21, 0) === 180, risk(21, 0));
  check("an hour at eleven", risk(23, 0) === 60, risk(23, 0));
  check("one minute at a minute to midnight", risk(23, 59) === 1, risk(23, 59));
  /* IT CANNOT OVERSTATE. Every minute of the evening, the minutes it hands back
     are the minutes there really are. */
  let wrong = 0, worst = "";
  for (let h = 21; h < 24; h++) for (let mi = 0; mi < 60; mi++) {
    const want = 24 * 60 - (h * 60 + mi);
    if (risk(h, mi) !== want) { wrong++; worst = h + ":" + mi + " gave " + risk(h, mi) + " want " + want; }
  }
  check("and every minute of the evening is counted honestly", wrong === 0, worst);
  /* MIDNIGHT NEEDS NO SPECIAL CASE: the hour falls to zero and it goes quiet on
     its own, even for the run that was still alive a minute earlier. */
  run(app, standing(9, 20260914));
  check("and it is quiet again at half past midnight",
    ev(app, "dailyRisk(new Date(2026, 8, 15, 0, 30))") === 0,
    ev(app, "dailyRisk(new Date(2026, 8, 15, 0, 30))"));

  console.log("\n--- and the three ways it could have become a nag ---");
  run(app, standing(0, 0));
  check("nobody with no run is warned about one", risk(22, 0) === 0, risk(22, 0));
  run(app, standing(9, 20260905));
  check("a run that died last week is left alone", risk(22, 0) === 0, risk(22, 0));
  run(app, standing(9, 20260913) +
    "mine().daily = {date: 20260914, rung: 5, done: true, reached: 6, got: [1,1,1,1,1,1], spent: {}};");
  check("and a day already in the bank says nothing", risk(22, 0) === 0, risk(22, 0));
  /* A RUN OF ONE IS THE WEDNESDAY RETURN, which is the whole retention loop, so
     it is warned like any other. What changes at one is the sentence. */
  run(app, standing(1, 20260913));
  check("but a run of one is still worth saving", risk(22, 0) === 120, risk(22, 0));

  console.log("\n--- the front door's daily row ---");
  /* NOTHING IN THE SUITE HAS EVER RENDERED THIS ROW, which is how a class with
     no rule behind it and a right-hand slot that stopped asking to be tapped
     both shipped. */
  /* THE DAILY ROW, ASKED FOR BY NAME. This used to take everything before the
     first </button> in what dailyCardHTML returns, which worked only while the
     daily row happened to be the first button in the club section. It is not:
     that function returns the whole Your club block, banner and all, and the
     three of us hang off the banner above it with a button each. So the first
     button became a head and every check below was reading it.

     It is the same shape as the four flakes this suite has already had, where
     an assertion about one element was checked against everything around it.
     Finding the row by its own handler cannot drift, whatever else the section
     grows. */
  const row = (h, mi) => {
    const all = ev(app, "dailyCardHTML(" + AT(h, mi) + ")");
    const at = all.indexOf('onclick="dailyStart()"');
    if (at < 0) return "";
    return all.slice(all.lastIndexOf("<button", at)).split("</button>")[0];
  };
  run(app, standing(9, 20260913));
  const untouched = row(10, 0);
  check("six marks, one per rung", (untouched.match(/<i/g) || []).length === 6,
    (untouched.match(/<i/g) || []).length);
  check("none of them filled before the day is opened",
    !/class="won"/.test(untouched) && !/class="lost"/.test(untouched), untouched);
  /* THE REGRESSION THAT WOULD HAVE CAUGHT THE OLD BUG: a streak used to take
     the Play pill away and leave a number in its place, every day, forever. */
  check("a nine day run still gets the Play pill", /mm-play">Play</.test(untouched), untouched);
  check("and no streak number in the button's place", !/mm-count/.test(untouched), untouched);
  check("the run is named small, beside the marks", /9 in a row/.test(untouched), untouched);

  run(app, standing(9, 20260913) +
    "mine().daily = {date: 20260914, rung: 2, done: false, got: [true, true], spent: {}};");
  const midrun = row(10, 0);
  check("a day half up the pitch says Finish", /mm-play">Finish</.test(midrun), midrun);
  check("two marks filled and the third live",
    (midrun.match(/class="won"/g) || []).length === 2 && /class="now"/.test(midrun), midrun);

  run(app, standing(10, 20260914) +
    "mine().daily = {date: 20260914, rung: 4, done: true, reached: 4, got: [1,1,1,1,0], spent: {}};");
  const finished = row(10, 0);
  check("a finished day hands the right slot back to the number",
    /mm-count/.test(finished) && !/mm-play/.test(finished), finished);
  check("and marks itself done, which now has a rule behind it",
    /class="mm-item done"/.test(finished), finished.slice(0, 120));
  check("four green and the one that broke it",
    (finished.match(/class="won"/g) || []).length === 4 &&
    (finished.match(/class="lost"/g) || []).length === 1, finished);

  console.log("\n--- what the row says as the evening goes ---");
  run(app, standing(9, 20260913));
  check("nothing different at a minute to nine",
    !/mm-lad risk/.test(row(20, 59)) && /Six questions/.test(row(20, 59)), row(20, 59));
  const nine = row(21, 0);
  check("at nine the ladder goes gold", /mm-lad risk/.test(nine), nine);
  check("and it names the run and the time it has left",
    /9 days on the line\. 3 hours left today\./.test(nine), nine);
  check("half ten rounds down to an hour",
    /An hour left today\./.test(row(22, 30)), row(22, 30));
  check("eleven still says an hour, because there is one",
    /An hour left today\./.test(row(23, 0)), row(23, 0));
  check("and two minutes to midnight says minutes",
    /Minutes left today\./.test(row(23, 58)), row(23, 58));
  run(app, standing(1, 20260913));
  check("a run of one is asked to double rather than told it is at risk",
    /You played yesterday\. Two minutes makes it two\./.test(row(22, 0)), row(22, 0));
  check("and is never told it has 1 days on the line", !/1 days/.test(row(22, 0)), row(22, 0));
  check("nor that it is 1 in a row", /<b>1 day<\/b>/.test(row(22, 0)), row(22, 0));

  console.log("\n--- a dead run is not a run ---");
  /* streak.played is never zeroed on a gap, so the front door has to do the
     arithmetic itself or it shows a nine to a phone that stopped a fortnight
     ago, right up until the next play quietly turns it into a one. */
  run(app, standing(9, 20260901));
  const stale = row(10, 0);
  check("a fortnight of silence stops showing the nine", !/in a row/.test(stale), stale);
  check("and the row goes back to asking", /mm-play">Play</.test(stale), stale);

  console.log("\n--- the streak is scored against the day it was played ---");
  /* THE 23:58 CASE. The daily is stamped when it starts, so a run begun on the
     Tuesday and finished at two minutes past midnight must still count as the
     Tuesday. This used to read yesterday off the wall clock, which made the
     fixtures below pass only on 14 Sep 2026 and punished anybody who took the
     evening warning literally. */
  run(app, 'localStorage.removeItem("ball3-mine"); MINE = null; ' +
    "mine().streak.played = 30; mine().streak.last = 20251231; " +
    "mine().daily = {date: 20260101, reached: 4, got: [1,1,1,1,0], done: true, spent: {}}; " +
    "dailyStreak(mine().daily);");
  check("new year's day carries on from new year's eve",
    ev(app, "mine().streak.played") === 31, ev(app, "mine().streak.played"));
  run(app, 'localStorage.removeItem("ball3-mine"); MINE = null; ' +
    "mine().streak.played = 30; mine().streak.last = 20251229; " +
    "mine().daily = {date: 20260101, reached: 4, got: [1,1,1,1,0], done: true, spent: {}}; " +
    "dailyStreak(mine().daily);");
  check("and a real gap still starts again at one",
    ev(app, "mine().streak.played") === 1, ev(app, "mine().streak.played"));

  console.log("\n" + (fails ? fails + " FAILED" : "ALL PASS"));
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
