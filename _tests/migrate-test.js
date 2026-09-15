/* THE SAVE SURVIVES THE SHELF.
 *
 *     node _tests/migrate-test.js
 *
 * There is no server. The only copy of anybody's album is the ball3-mine key
 * in one browser on one phone, and the only backup is a string somebody may
 * have pasted into a note. So the day the album stopped being one book and
 * became a shelf of them, and every sticker id grew a book on the front, was
 * the day a bad migration could silently delete two years of somebody's
 * evenings. This file is the reason that is allowed to ship.
 *
 * Four claims, and all four are load-bearing:
 *
 *   NOTHING IS LOST. Stickers, their counts, the finished pages, the list of
 *   countries you have already played as, and Your XI. Especially Your XI:
 *   mine().dream.men is eleven sticker ids stored a thousand lines from the
 *   album with nothing about it saying so, and the old reader cut at the last
 *   slash, so a book on the front of the id turns a saved eleven into eleven
 *   nobodies with no error anywhere.
 *
 *   RUNNING IT TWICE CHANGES NOTHING. A migration is a thing that happens on
 *   every load until somebody deletes it, so "once" is not a property it can
 *   have. It has to be a no-op the second time and the hundredth.
 *
 *   A HALF-DONE ONE FINISHES RATHER THAN DOUBLES. Every step guards on the old
 *   field rather than on a version number, which is what lets it be run again
 *   on its own half-finished output without inventing a sticker.
 *
 *   AND A SAVE IT DOES NOT RECOGNISE IS LEFT ALONE. A phone that has already
 *   run a newer build has a save this build cannot read. It refuses: it does
 *   not migrate it, does not repair it, and above all does not write over it,
 *   so going back to the newer build finds everything still there.
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
const tick = (ms = 130) => new Promise(r => setTimeout(r, ms));
const R = p => JSON.parse(fs.readFileSync(path.join(REPO, p), "utf8"));
let fails = 0;
const check = (n, c, x) => {
  console.log((c ? "  PASS  " : "  FAIL  ") + n + (c ? "" : "   <-- got: " + x));
  if (!c) fails++;
};

(async () => {
  const app = makeInstance("migrate");
  await tick(340);
  const wc = R("assets/wc2006/index.json");
  run(app, "TEAMS.wc2006 = " + JSON.stringify(wc) + ";");

  /* OPENING THE APP ON A PHONE THAT HAS THIS SAVE. MINE is read lazily on the
     first call and cached after it, so putting a string in the drawer and
     clearing the cache is exactly what a cold start does. */
  const boot = obj => run(app, 'localStorage.setItem("ball3-mine", ' +
    JSON.stringify(JSON.stringify(obj)) + '); MINE = null; MINE_FOREIGN = false; mine();');
  const disk = () => JSON.parse(ev(app, 'localStorage.getItem("ball3-mine")'));

  /* ---------- the save, written the way version 1 wrote it ----------
     Built out of the real 2006 file rather than out of invented strings,
     because the point is that these ids used to be what the app itself
     produced. Italy's whole page, five Brazilians, two of them doubles, and an
     eleven made of Italians. */
  const italy = [...(wc.Italy.xi || []), ...(wc.Italy.bench || [])];
  const brazil = [...(wc.Brazil.xi || [])].slice(0, 5);
  const v1have = {};
  for (const m of italy) v1have["italy/" + m.no] = 1;
  for (const m of brazil) v1have["brazil/" + m.no] = 1;
  v1have["brazil/" + brazil[0].no] = 3;
  v1have["brazil/" + brazil[1].no] = 2;
  const v1eleven = italy.filter(m => m.pos === "GK").slice(0, 1)
    .concat(italy.filter(m => m.pos !== "GK").slice(0, 10))
    .map(m => "italy/" + m.no);
  const V1 = {
    daily: {date: 20260910, rung: 3, done: true, got: [true, true, true], reached: 3, spent: {}},
    streak: {played: 9, half: 4, last: 20260910, lastHalf: 20260910},
    album: {have: v1have, packs: 4, foils: ["Italy"], seen: {Italy: 1, Angola: 1},
            last: [{id: "brazil/" + brazil[0].no, side: "Brazil", m: brazil[0], isNew: false}]},
    cup: null, cups: [{ts: 1, year: "2006", nation: "Italy", won: true}],
    dream: {men: v1eleven},
  };

  console.log("--- a version 1 save, which is every save written before the shelf ---");
  check("it has no version on it at all", V1.v === undefined, V1.v);
  boot(V1);
  const M = ev(app, "JSON.parse(JSON.stringify(mine()))");

  check("it is stamped version 2 now", M.v === 2, M.v);
  check("and the flat have map is gone", M.album.have === undefined, JSON.stringify(M.album.have));
  check("there is a 2006 book", !!(M.album.books && M.album.books.wc2006), Object.keys(M.album.books || {}));
  check("and it is the one you are collecting", M.album.collecting === "wc2006", M.album.collecting);

  console.log("\n--- and not one sticker was dropped on the way ---");
  const nowHave = M.album.books.wc2006.have;
  check("the same number of men", Object.keys(nowHave).length === Object.keys(v1have).length,
    Object.keys(nowHave).length + " of " + Object.keys(v1have).length);
  check("every one of them under his new id",
    Object.keys(v1have).every(id => nowHave["wc2006:" + id] === v1have[id]),
    Object.keys(v1have).filter(id => nowHave["wc2006:" + id] !== v1have[id]).slice(0, 3).join(", "));
  /* THE DOUBLES ARE THE POINT OF KEEPING THE COUNT: three of a man is two
     trades, and a migration that flattened every count to one would take them
     away without saying so. */
  check("and a man he had three of he still has three of",
    nowHave["wc2006:brazil/" + brazil[0].no] === 3, nowHave["wc2006:brazil/" + brazil[0].no]);
  check("the doubles still trade", ev(app, 'albumDupes("wc2006").length') === 2,
    ev(app, 'albumDupes("wc2006")'));
  check("the app agrees he is in the album",
    ev(app, 'albumHas("wc2006:italy/" + ' + JSON.stringify(String(italy[0].no)) + ')') === true, "not there");
  check("Italy's page is still finished", ev(app, 'albumFoil("wc2006", "Italy")') === true, "no foil");
  check("the count reads as it did", ev(app, 'albumCount("wc2006").have') === Object.keys(v1have).length,
    ev(app, 'albumCount("wc2006").have'));
  check("the packs are still in the drawer", M.album.packs === 4, M.album.packs);

  console.log("\n--- the field nothing else in the app creates ---");
  /* album.seen exists only because albumFirstTime made it the first time
     somebody picked a country. It is in no blank and in no repair block, so a
     migration that walked the known shape would walk straight past it, and
     losing it hands three free stickers a country to everybody who has ever
     played. */
  check("the countries you have already played as came across",
    M.album.books.wc2006.seen && M.album.books.wc2006.seen.Italy === 1 &&
    M.album.books.wc2006.seen.Angola === 1, JSON.stringify(M.album.books.wc2006.seen));
  const before = ev(app, 'Object.keys(albumBookState("wc2006").have).length');
  run(app, 'albumFirstTime("wc2006", "Angola");'); await tick(110);
  check("so playing as them again pays nothing",
    ev(app, 'Object.keys(albumBookState("wc2006").have).length') === before,
    ev(app, 'Object.keys(albumBookState("wc2006").have).length'));

  console.log("\n--- and Your XI is still eleven men ---");
  check("the ids gained a book", ev(app, "dreamPicked()").every(id => id.indexOf("wc2006:") === 0),
    ev(app, "dreamPicked()").slice(0, 3).join(", "));
  check("all eleven of them resolve to a man",
    ev(app, "dreamPicked().map(id => !!dreamMan(id)).filter(Boolean).length") === 11,
    ev(app, "dreamPicked().map(id => !!dreamMan(id)).filter(Boolean).length"));
  check("and to the same men as before",
    JSON.stringify(ev(app, "dreamHave()")) === JSON.stringify(v1eleven.map(id => "wc2006:" + id)),
    ev(app, "JSON.stringify(dreamHave())"));
  check("so it is still a side you can put out", ev(app, "dreamReady()") === true, "the eleven emptied");
  check("with one keeper in it",
    ev(app, 'dreamSquad().xi.filter(m => m.pos === "GK").length') === 1,
    ev(app, 'dreamSquad().xi.filter(m => m.pos === "GK").length'));

  console.log("\n--- everything that was never about the album is where it was ---");
  check("the streak", M.streak.played === 9 && M.streak.half === 4, JSON.stringify(M.streak));
  check("the daily", M.daily && M.daily.date === 20260910 && M.daily.reached === 3, JSON.stringify(M.daily));
  check("the record book", M.cups.length === 1 && M.cups[0].nation === "Italy", JSON.stringify(M.cups));

  console.log("\n--- running it twice changes nothing further ---");
  run(app, "mineSave();");
  const once = JSON.stringify(disk());
  run(app, "MINE = null; mine(); mineSave();");
  const twice = JSON.stringify(disk());
  check("the second pass is a no-op", once === twice, "the save moved on the second read");
  run(app, "MINE = null; mine(); mineSave(); MINE = null; mine(); mineSave();");
  check("and so is the fourth", JSON.stringify(disk()) === once, "it kept moving");

  console.log("\n--- a save caught half way through finishes rather than doubles ---");
  /* What a throw between two steps would leave behind: the book already has
     Italy in it, the old flat map still has everything, and the eleven is half
     re-written. Nothing here may be counted twice. */
  const HALF = JSON.parse(JSON.stringify(V1));
  HALF.album.books = {wc2006: {have: {}, foils: ["Italy"], seen: {Italy: 1}, done: false}};
  for (const m of italy) HALF.album.books.wc2006.have["wc2006:italy/" + m.no] = 1;
  HALF.album.foils = ["Italy"];
  HALF.dream = {men: v1eleven.map((id, i) => i < 5 ? "wc2006:" + id : id)};
  boot(HALF);
  const H = ev(app, "JSON.parse(JSON.stringify(mine()))");
  check("the stickers that had already moved were not counted again",
    H.album.books.wc2006.have["wc2006:italy/" + italy[0].no] === 1,
    H.album.books.wc2006.have["wc2006:italy/" + italy[0].no]);
  check("and the ones that had not still arrived",
    H.album.books.wc2006.have["wc2006:brazil/" + brazil[0].no] === 3,
    H.album.books.wc2006.have["wc2006:brazil/" + brazil[0].no]);
  check("Italy is in the foils once, not twice",
    H.album.books.wc2006.foils.filter(s => s === "Italy").length === 1,
    JSON.stringify(H.album.books.wc2006.foils));
  check("and the half-rewritten eleven came out whole",
    JSON.stringify(ev(app, "dreamPicked()")) === JSON.stringify(v1eleven.map(id => "wc2006:" + id)),
    ev(app, "JSON.stringify(dreamPicked())"));
  check("still eleven men", ev(app, "dreamHave().length") === 11, ev(app, "dreamHave().length"));

  console.log("\n--- a phone that has never played ---");
  run(app, 'localStorage.removeItem("ball3-mine"); MINE = null; MINE_FOREIGN = false;');
  const F = ev(app, "JSON.parse(JSON.stringify(mine()))");
  check("comes up stamped, so it is never migrated from a shape it never had",
    F.v === 2, F.v);
  check("with an empty shelf", JSON.stringify(F.album.books) === "{}", JSON.stringify(F.album.books));
  check("collecting the 2006 book", ev(app, "albumCollecting()") === "wc2006", ev(app, "albumCollecting()"));
  check("no stickers", ev(app, 'albumCount("wc2006").have') === 0, ev(app, 'albumCount("wc2006").have'));
  run(app, "mine().album.packs = 1; albumOpen();"); await tick(140);
  check("and a pack still opens into it",
    Object.values(ev(app, 'albumBookState("wc2006").have')).reduce((a, b) => a + b, 0) === 3,
    JSON.stringify(ev(app, 'albumBookState("wc2006").have')));

  console.log("\n--- a save from a build that came after this one ---");
  /* Somebody's phone has already run the next version. This build cannot know
     what shape that is in, so the only safe thing it can do is refuse, and the
     refusal has to include not writing. */
  const FUTURE = {v: 99, album: {collecting: "wc2038", books: {wc2038: {have: {"wc2038:mars/7": 1}}},
                                 packs: 12}, streak: {played: 400}, dream: {men: ["wc2038:mars/7"]},
                  somethingNewEntirely: {that: "this build has never heard of"}};
  const raw = JSON.stringify(FUTURE);
  boot(FUTURE);
  check("it is spotted", ev(app, "MINE_FOREIGN") === true, ev(app, "MINE_FOREIGN"));
  check("and nothing about it is guessed at",
    ev(app, "mine().album.packs") === 0, ev(app, "mine().album.packs"));
  check("the app still draws, on a blank of its own",
    ev(app, 'albumCount("wc2006").have') === 0, ev(app, 'albumCount("wc2006").have'));
  /* THE ONE THAT MATTERS. Play a whole evening on it and the drawer is
     untouched, so going back to the newer build finds everything still there. */
  run(app, "mine().album.packs = 7; mineSave(); albumStick('wc2006:italy/1'); mineSave();");
  run(app, "render();"); await tick(140);
  check("and after all that the drawer is byte for byte what it was",
    ev(app, 'localStorage.getItem("ball3-mine")') === raw,
    ev(app, 'localStorage.getItem("ball3-mine")'));
  /* and it comes back the moment a build that understands it is opened */
  run(app, "MINE = null; MINE_FOREIGN = false;");
  check("the future save is still readable", JSON.parse(ev(app, 'localStorage.getItem("ball3-mine")')).v === 99,
    "it was overwritten");

  console.log("\n--- an import off an old phone goes through the same door ---");
  /* importMine clears MINE rather than migrating anything itself, which is the
     whole reason the migrator lives inside the read: a file pasted in off a
     phone that never saw this build is migrated by the next thing that asks. */
  run(app, 'localStorage.removeItem("ball3-mine"); MINE = null; MINE_FOREIGN = false;');
  run(app, "importMine(" + JSON.stringify(JSON.stringify({
    app: "BALL 3", at: "2026-01-01T00:00:00.000Z", data: {"ball3-mine": JSON.stringify(V1)},
  })) + ");");
  await tick(140);
  check("the pasted album arrives migrated",
    ev(app, 'albumCount("wc2006").have') === Object.keys(v1have).length,
    ev(app, 'albumCount("wc2006").have'));
  check("and the eleven that came with it is a side",
    ev(app, "dreamHave().length") === 11, ev(app, "dreamHave().length"));

  console.log("\n" + (fails ? fails + " FAILED" : "ALL PASS"));
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
