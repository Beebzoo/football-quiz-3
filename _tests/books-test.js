/* THE SHELF.
 *
 *     node _tests/books-test.js
 *
 * ALBUM-PLAN sections 1 and 7: one book per tournament instead of one album
 * welded to the 2006 World Cup, and the state that carries it. album-test is
 * still about the rules of collecting; this one is about there being fifteen
 * of them.
 *
 * Four claims:
 *
 *   EVERY BOOK IS FINISHABLE. An id has to be unique inside its book and it
 *   has to lead back to exactly one man, in all sixteen pools and not just in
 *   the one somebody happened to open. A book where two men share a slot is a
 *   book nobody can close, and it says nothing on the screen about why.
 *
 *   EURO 2020 IS THE ONE THAT PROVED IT. Three of its squads carry two men in
 *   the same shirt, because a late replacement walked into the number of the
 *   man he came in for. Under slug and number alone, three of those six men
 *   have no slot at all.
 *
 *   EVERY BOOK KEEPS ITS OWN PROGRESS. Switching shelf moves where the packs
 *   come from and nothing else. What is in a book you walk away from is still
 *   in it when you come back.
 *
 *   AND THE DAILY DOES NOT FOLLOW YOU. The calendar is nailed to the 2006
 *   book by name, because the man of the day is the one thing on this phone
 *   that is the same on everybody else's, and a daily that moved with whichever
 *   book you were collecting would make the six squares meaningless.
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

/* Written out rather than read off POOLS, because "whatever the app thinks is
   a book" would happily pass while the app thought nothing was. */
const BOOKS = ["wc1998", "wc2002", "wc2006", "wc2010", "wc2014", "wc2018", "wc2022", "wc2026",
               "euro2000", "euro2004", "euro2008", "euro2012", "euro2016", "euro2020", "euro2024",
               "finals"];
/* THE THREE EURO 2020 SQUADS THAT BROKE THE OLD ID, named here so the day a
   re-harvest quietly drops one of them this file says so. */
const SHARED = [["Switzerland", 21], ["Belgium", 12], ["England", 13]];

(async () => {
  const app = makeInstance("books");
  await tick(340);
  for (const id of BOOKS) run(app, "TEAMS[" + JSON.stringify(id) + "] = " +
    JSON.stringify(R("assets/" + id + "/index.json")) + ";");
  const clean = () => run(app, 'localStorage.removeItem("ball3-mine"); MINE = null; DREAM_SIG = "";');
  clean();

  console.log("--- what is a book and what is not ---");
  const shelf = ev(app, "albumBooks()");
  check("all sixteen tournaments are",
    shelf.length === BOOKS.length && BOOKS.every(id => shelf.indexOf(id) > -1),
    JSON.stringify(shelf));
  /* IN THE REGISTRY'S OWN ORDER, which is the order the pools were added and
     not the alphabet or the year. The shelf's drawing is section 5's problem;
     what matters here is that the order is a property of the registry, so one
     list decides it and the covers can sort themselves however they like. */
  check("in the order the pool registry has them",
    JSON.stringify(shelf) === JSON.stringify(ev(app, "Object.keys(POOLS).filter(id => albumIsBook(id))")),
    JSON.stringify(shelf));
  /* A CLUB SQUAD IS THIS SEASON'S AND THERE IS NOTHING IN IT TO COLLECT, which
     is why the rule reads the registry's group rather than a second list. */
  run(app, "TEAMS['ere-clubs'] = " + JSON.stringify(R("assets/eredivisie/clubs.json")) + ";");
  check("a league's clubs are not", ev(app, 'albumIsBook("ere-clubs")') === false, "the Eredivisie grew a book");
  check("and nor is a pool that does not exist", ev(app, 'albumIsBook("wc1930")') === false, "it does");

  console.log("\n--- every man in every book has a slot of his own ---");
  let worst = null, totalMen = 0;
  for (const id of BOOKS) {
    const ids = ev(app, '(() => { const out = []; for(const s of albumSides(' + JSON.stringify(id) + ')) ' +
      'for(const m of albumMen(' + JSON.stringify(id) + ', s)) out.push(albumId(' +
      JSON.stringify(id) + ', s, m)); return out; })()');
    totalMen += ids.length;
    const dupes = ids.length - new Set(ids).size;
    const bad = ids.filter(x => typeof x !== "string" || x.indexOf(id + ":") !== 0);
    if (dupes || bad.length) worst = id + ": " + dupes + " collisions, " + bad.length + " malformed";
    check(id + ": " + ids.length + " men, " + ids.length + " slots", dupes === 0 && bad.length === 0,
      dupes + " collisions, " + bad.length + " malformed");
  }
  check("nine and a half thousand men and not one collision anywhere",
    worst === null && totalMen > 9000, worst || totalMen);

  console.log("\n--- and every id leads back to exactly one man ---");
  /* dreamMan is the reader that used to cut at the last slash. Handing it an
     id off every book, including the three-part ones, is the check that the
     grammar and its parser still agree. */
  for (const id of BOOKS) {
    const one = ev(app, '(() => { const s = albumSides(' + JSON.stringify(id) + ')[0]; ' +
      'const m = albumMen(' + JSON.stringify(id) + ', s)[0]; ' +
      'const sid = albumId(' + JSON.stringify(id) + ', s, m); ' +
      'const back = dreamMan(sid); return {sid: sid, side: s, n: m.n, gotN: back && back.n, ' +
      'gotFrom: back && back.from, gotBook: back && back.book}; })()');
    check(id + ": the first man off the page comes back as himself",
      one.gotN === one.n && one.gotFrom === one.side && one.gotBook === id, JSON.stringify(one));
  }

  console.log("\n--- Euro 2020, the book that could not be finished ---");
  for (const [side, no] of SHARED) {
    const men = ev(app, 'albumMen("euro2020", ' + JSON.stringify(side) + ')' +
      '.filter(m => String(m.no) === ' + JSON.stringify(String(no)) + ').map(m => m.n)');
    check(side + " really do have two men in the " + no, men.length === 2, men.join(", "));
    const ids = ev(app, 'albumMen("euro2020", ' + JSON.stringify(side) + ')' +
      '.filter(m => String(m.no) === ' + JSON.stringify(String(no)) + ')' +
      '.map(m => albumId("euro2020", ' + JSON.stringify(side) + ', m))');
    check("and two ids, so two slots", new Set(ids).size === 2, ids.join(" | "));
    /* THE NAME IS ON BOTH OF THEM, not only on the one who turned up second.
       An id that depends on which of the two the harvest listed first is an id
       that moves the next time the harvest runs. */
    check("with the name on both, so neither is the exception",
      ids.every(x => x.split("/").length === 3), ids.join(" | "));
    check("and each of them is a different man",
      ev(app, "JSON.stringify(" + JSON.stringify(ids) + ".map(x => dreamMan(x).n))") ===
      JSON.stringify(men), ev(app, "JSON.stringify(" + JSON.stringify(ids) + ".map(x => dreamMan(x) && dreamMan(x).n))"));
  }
  /* AND A MAN IN A SHIRT NOBODY SHARES IS UNTOUCHED, which is what keeps this
     a rule about squads rather than a patch on three squads. */
  check("a shirt nobody shares is still just a shirt",
    ev(app, '(() => { const m = albumMen("euro2020", "Italy").find(x => String(x.no) === "10"); ' +
      'return albumId("euro2020", "Italy", m); })()').split("/").length === 2,
    ev(app, '(() => { const m = albumMen("euro2020", "Italy").find(x => String(x.no) === "10"); ' +
      'return albumId("euro2020", "Italy", m); })()'));
  clean();
  run(app, '(() => { for(const m of albumMen("euro2020", "Switzerland")) ' +
    'albumStick(albumId("euro2020", "Switzerland", m)); })();');
  check("so a Euro 2020 page can actually be closed",
    ev(app, 'albumDone("euro2020", "Switzerland")') === true, "still short");
  check("all twenty-seven of them",
    ev(app, 'Object.keys(albumBookState("euro2020").have).length') ===
    ev(app, 'albumMen("euro2020", "Switzerland").length'),
    ev(app, 'Object.keys(albumBookState("euro2020").have).length'));

  console.log("\n--- a book at a time, and every book keeps what is in it ---");
  clean();
  check("2006 is where the shelf opens", ev(app, "albumCollecting()") === "wc2006",
    ev(app, "albumCollecting()"));
  run(app, '(() => { for(const m of albumMen("wc2006", "Italy")) albumStick(albumId("wc2006", "Italy", m)); ' +
    'albumCheckPage("wc2006", "Italy"); mineSave(); })();');
  const had2006 = ev(app, 'albumCount("wc2006").have');
  check("a page filled in the 2006 book", had2006 === 23, had2006);
  run(app, 'albumSetBook("euro2008");'); await tick(130);
  check("the shelf moved", ev(app, "albumCollecting()") === "euro2008", ev(app, "albumCollecting()"));
  check("and the 2006 book is exactly where it was",
    ev(app, 'albumCount("wc2006").have') === had2006, ev(app, 'albumCount("wc2006").have'));
  check("Italy's foil with it", ev(app, 'albumFoil("wc2006", "Italy")') === true, "the foil went");
  check("while the new one is empty", ev(app, 'albumCount("euro2008").have') === 0,
    ev(app, 'albumCount("euro2008").have'));
  /* THE PACKS FOLLOW THE SHELF, which is the whole of section 1: a book has to
     be finishable in a season and it is not if packs are spread over nine
     thousand men. */
  run(app, "mine().album.packs = 1; albumOpen();"); await tick(150);
  check("and a pack comes out of the book you are collecting",
    ev(app, 'Object.keys(albumBookState("euro2008").have).length') === 3,
    JSON.stringify(ev(app, 'albumBookState("euro2008").have')));
  check("with nothing added to the one you left",
    ev(app, 'albumCount("wc2006").have') === had2006, ev(app, 'albumCount("wc2006").have'));
  /* AND SWITCHING BACK FINDS IT ALL THERE. This is the promise the shelf makes
     and the only one that matters. */
  run(app, 'albumSetBook("wc2006");'); await tick(130);
  check("switching back finds the page still finished",
    ev(app, 'albumDone("wc2006", "Italy")') === true, "it emptied");
  check("and the Euro 2008 three still in their book",
    ev(app, 'Object.keys(albumBookState("euro2008").have).length') === 3,
    ev(app, 'Object.keys(albumBookState("euro2008").have).length'));
  /* A BOOK IS ONLY EVER LOOKED AT UNTIL YOU SAY OTHERWISE. Flicking through
     Euro 2000 must not quietly move your collection there. */
  run(app, 'openAlbum("euro2000"); render();'); await tick(150);
  check("opening another book does not move the shelf",
    ev(app, "albumCollecting()") === "wc2006", ev(app, "albumCollecting()"));
  check("but it says so, and offers", /Collect this one/.test(stage(app)), "no way to switch");
  run(app, 'closeAlbum();'); await tick(120);

  console.log("\n--- the daily does not follow you round the shelf ---");
  const dayMan = () => JSON.stringify(ev(app, "dailyMan(20260914)"));
  const was = dayMan();
  check("the man of the day comes out of the 2006 book",
    ev(app, 'TEAMS.wc2006[JSON.parse(' + JSON.stringify(was) + ').side] !== undefined') === true, was);
  run(app, 'albumSetBook("euro2016"); dailyOrder = null;'); await tick(130);
  check("collecting Euro 2016 does not move him", dayMan() === was, dayMan());
  check("the calendar is still 736 long", ev(app, "dailyMen().length") === 736, ev(app, "dailyMen().length"));
  /* AND THE STICKER HE PAYS GOES ON A 2006 PAGE, because he is a 2006 man.
     Paying him into whichever book you were collecting would put a man in a
     book he never played in. */
  clean();
  run(app, 'mine().album.collecting = "euro2016"; ' +
    'mine().daily = {date: 20260914, reached: 6, got: [1,1,1,1,1,1], done: true, spent: {}, ' +
    'man: dailyMan(20260914)}; dailyStreak(mine().daily);');
  await tick(130);
  check("and he goes into the 2006 book, not the one you are collecting",
    ev(app, 'Object.keys(albumBookState("wc2006").have).length') === 1 &&
    ev(app, 'Object.keys((albumBookRead("euro2016") || {have: {}}).have).length') === 0,
    "2006: " + ev(app, 'Object.keys(albumBookState("wc2006").have)') +
    " / euro2016: " + ev(app, 'JSON.stringify(albumBookRead("euro2016"))'));

  console.log("\n--- Your XI is built off the whole shelf ---");
  /* A side you have already built must not stop being a side the moment you
     open a different book, which is the same bug as the one the migration is
     for, wearing a different coat. */
  clean();
  run(app, '(() => { for(const m of albumMen("wc2006", "Italy")) albumStick(albumId("wc2006", "Italy", m)); ' +
    'for(const m of albumMen("euro2008", "Spain")) albumStick(albumId("euro2008", "Spain", m)); ' +
    'mineSave(); })();');
  const owned = ev(app, "dreamOwned().map(m => m.id)");
  check("men off two books are both offered",
    owned.some(id => id.indexOf("wc2006:") === 0) && owned.some(id => id.indexOf("euro2008:") === 0),
    owned.length + " owned");
  const gk = ev(app, 'dreamOwned().filter(m => m.pos === "GK" && m.book === "wc2006")[0].id');
  const out = ev(app, 'dreamOwned().filter(m => m.pos !== "GK" && m.book === "euro2008").slice(0, 10).map(m => m.id)');
  run(app, "mine().dream = {men: " + JSON.stringify([gk].concat(out)) + "}; DREAM_SIG = ''; mineSave();");
  check("an eleven can be one keeper from 2006 and ten Spaniards from 2008",
    ev(app, "dreamReady()") === true, "not a side");
  run(app, 'albumSetBook("euro2020");'); await tick(130);
  check("and switching shelf again leaves it standing",
    ev(app, "dreamReady()") === true && ev(app, "dreamHave().length") === 11,
    ev(app, "dreamHave().length"));

  console.log("\n" + (fails ? fails + " FAILED" : "ALL PASS"));
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
