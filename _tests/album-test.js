/* THE ALBUM.
 *
 *     node _tests/album-test.js
 *
 * Not cards in the abstract: the 2006 World Cup sticker album, 736 men who are
 * already in the deck, drawn rather than fetched. It needs no new data and no
 * new images, which means the only things that can go wrong are the rules.
 *
 * Three of them matter and all three are here:
 *
 *   A STICKER IS A SLUG AND A SHIRT NUMBER. Not a name, because names change
 *   spelling between harvests, and not an index, because indexes move. Every
 *   id has to be unique and every one has to resolve to a man.
 *
 *   A PACK IS THREE, and it can never hand out something that is not in the
 *   album, because an album with a sticker in it that has no slot is an album
 *   nobody can finish.
 *
 *   AND FINISHING A PAGE HAS TO PAY. The bench in The Dugout is the reward,
 *   which means an unfinished page is a real cost: eleven men and nobody to
 *   bring on.
 */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const REPO = path.join(__dirname, "..");
const harness = fs.readFileSync(path.join(__dirname, "mp-test.js"), "utf8");
const head = harness.slice(0, harness.indexOf("/* ---------- drive an instance from outside ---------- */"));
eval(head.replace(/^const (fs|vm|path) = require\(.*\);$/gm, ""));

const stage = ctx => ctx.__els["stage"] ? ctx.__els["stage"].innerHTML : "";
/* THE PAGE GRID, SLICED OUT OF THE SCREEN, because a country page can now carry
   a card that is not in it. Picking a sticker up lifts it into a full-screen
   overlay written after the sheet, and that overlay holds a second real drawing
   of the front face, so a count of class="alst" across the whole stage stopped
   being an invariant and became a number that depends on whether somebody is
   holding a card.

   The count is worth keeping, because it is what catches a child class that
   merely begins with those four letters, and a failure there would read as a bug
   in the album rather than as a bug in a class name. So it is scoped instead of
   dropped: every slot in the book lives between .alsheet and .alsheet-f, that is
   still exactly twenty-three whatever is going on elsewhere on the screen, and
   what is outside the sheet gets its own check a few lines below rather than
   being quietly folded into this one. */
const sheet = ctx => { const h = stage(ctx),
  a = h.indexOf('<div class="alsheet">'), b = h.indexOf('<div class="alsheet-f">');
  return (a < 0 || b < 0) ? "" : h.slice(a, b); };
const offsheet = ctx => { const h = stage(ctx),
  a = h.indexOf('<div class="alsheet">'), b = h.indexOf('<div class="alsheet-f">');
  return (a < 0 || b < 0) ? h : h.slice(0, a) + h.slice(b); };
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
  const app = makeInstance("album");
  await tick(340);
  const wc = R("assets/wc2006/index.json");
  run(app, "TEAMS.wc2006 = " + JSON.stringify(wc) + ";");
  const clean = () => run(app, 'localStorage.removeItem("ball3-mine"); MINE = null;');

  console.log("--- 736 men, and every one of them has a slot ---");
  const c = ev(app, 'albumCount("wc2006")');
  check("the album is the whole squad list", c.all === 736, c.all);
  check("and none of it is stuck in yet", c.have === 0, c.have);
  /* EVERY ID UNIQUE. A slug and a shirt number collide only if a squad has two
     men in the same shirt, which would be a harvest bug wearing an album bug's
     clothes. */
  const ids = ev(app, '(() => { const out = []; for(const s of albumSides("wc2006")) ' +
    'for(const m of albumMen("wc2006", s)) out.push(albumId("wc2006", s, m)); return out; })()');
  check("every sticker has an id", ids.every(x => typeof x === "string" && x.indexOf("/") > 0),
    ids.filter(x => !x || x.indexOf("/") < 1).slice(0, 3).join(", "));
  check("and no two men share one", new Set(ids).size === ids.length,
    ids.length - new Set(ids).size + " collisions");
  /* AND THE BOOK IS ON THE FRONT OF EVERY ONE OF THEM, which is the whole of
     this stage: italy/10 is Totti in 2006 and somebody else at Euro 2020, and
     the two have to be able to sit in one save. */
  check("and every id says which book it came out of",
    ids.every(x => x.indexOf("wc2006:") === 0), ids.filter(x => x.indexOf("wc2006:")).slice(0, 3).join(", "));
  check("and it parses back to the man", ev(app, 'JSON.stringify(albumParse(' +
    JSON.stringify(ids[0]) + '))') === JSON.stringify({book: "wc2006",
      slug: ids[0].split(":")[1].split("/")[0], no: ids[0].split("/")[1], tag: "", id: ids[0]}),
    ev(app, 'JSON.stringify(albumParse(' + JSON.stringify(ids[0]) + '))'));

  console.log("\n--- a pack is three, and always from the album ---");
  clean();
  run(app, "mine().album.packs = 1; albumOpen();"); await tick(130);
  const have = ev(app, 'albumBookState("wc2006").have');
  const total = Object.values(have).reduce((a, b) => a + b, 0);
  check("three stickers", total === 3, total);
  check("and every one of them is in the album",
    Object.keys(have).every(id => ids.indexOf(id) > -1), Object.keys(have).join(", "));
  check("the pack was spent", ev(app, "mine().album.packs") === 0, ev(app, "mine().album.packs"));
  run(app, "albumOpen();"); await tick(120);
  check("and you cannot open one you do not have",
    Object.values(ev(app, 'albumBookState("wc2006").have')).reduce((a, b) => a + b, 0) === 3,
    Object.values(ev(app, 'albumBookState("wc2006").have')).reduce((a, b) => a + b, 0));

  console.log("\n--- doubles, and what they are for ---");
  clean();
  /* three doubles and one gap, which is the oldest trade in the playground */
  run(app, '(() => { const b = albumBookState("wc2006"), s = albumSides("wc2006")[0]; ' +
    'const men = albumMen("wc2006", s); ' +
    'for(let i = 0; i < 3; i++) b.have[albumId("wc2006", s, men[i])] = 2; mineSave(); })();');
  const want = ev(app, '(() => { const s = albumSides("wc2006")[0]; ' +
    'return albumId("wc2006", s, albumMen("wc2006", s)[7]); })()');
  check("three doubles", ev(app, 'albumDupes("wc2006").length') === 3, ev(app, 'albumDupes("wc2006").length'));
  check("and he is missing", ev(app, "albumHas(" + JSON.stringify(want) + ")") === false, "already there");
  run(app, "albumSwap(" + JSON.stringify(want) + ");"); await tick(120);
  check("swapping gets him", ev(app, "albumHas(" + JSON.stringify(want) + ")") === true, "not stuck in");
  check("and costs exactly three", ev(app, 'albumDupes("wc2006").length') === 0, ev(app, 'albumDupes("wc2006").length'));
  check("leaving the three still in the album",
    Object.keys(ev(app, 'albumBookState("wc2006").have')).length === 4,
    Object.keys(ev(app, 'albumBookState("wc2006").have')).length);
  /* AND IT REFUSES rather than quietly taking three for nothing */
  const dup2 = ev(app, '(() => { const s = albumSides("wc2006")[0]; ' +
    'return albumId("wc2006", s, albumMen("wc2006", s)[0]); })()');
  run(app, "albumSwap(" + JSON.stringify(dup2) + ");"); await tick(110);
  check("you cannot swap for a man you already have",
    Object.keys(ev(app, 'albumBookState("wc2006").have')).length === 4,
    Object.keys(ev(app, 'albumBookState("wc2006").have')).length);

  console.log("\n--- finishing a page pays, and that is the whole point ---");
  clean();
  run(app, 'S = freshState(["You","It"], false, "classic", 0, "manager", false); h2Start(); ' +
    'h2PickTeam("Italy"); h2PickTeam("Brazil"); S.h2h.tossed = true;');
  await tick(130);
  check("an unfinished page means no bench in The Dugout",
    ev(app, "h2Bench(0).length") === 0, ev(app, "h2Bench(0).length"));
  check("and no change can be made", ev(app, "h2CanSub(0, 5)") === false, ev(app, "h2CanSub(0, 5)"));
  run(app, '(() => { for(const m of albumMen("wc2006", "Italy")) ' +
    'albumStick(albumId("wc2006", "Italy", m)); mineSave(); })();');
  check("the page is complete", ev(app, 'albumDone("wc2006", "Italy")') === true, "not complete");
  run(app, 'albumCheckPage("wc2006", "Italy");'); await tick(110);
  check("which makes it a foil", ev(app, 'albumFoil("wc2006", "Italy")') === true, "no foil");
  check("and their bench is yours", ev(app, "h2Bench(0).length") === 12, ev(app, "h2Bench(0).length"));
  /* THE OTHER SIDE IS UNAFFECTED, because a page is a country and not a game */
  check("the other side is still shut", ev(app, "h2Bench(1).length") === 0, ev(app, "h2Bench(1).length"));

  console.log("\n--- and One on One is left alone ---");
  /* THE FRIDAY NIGHT IS THE PRODUCT. Progression belongs in The Dugout; taking
     substitutions off a shared phone would be taking something away. */
  run(app, 'S = freshState(["A","B"], false, "classic", 0, "pitch", false); h2Start(); ' +
    'h2PickTeam("Brazil"); h2PickTeam("France"); S.h2h.tossed = true;');
  await tick(130);
  check("a bench with no album page at all", ev(app, "h2Bench(0).length") === 12,
    ev(app, "h2Bench(0).length"));

  console.log("\n--- packs come from playing ---");
  clean();
  run(app, 'S = freshState(["You","It"], false, "classic", 0, "pitch", false); h2Start();');
  await tick(120);
  run(app, 'h2PickTeam("Angola");'); await tick(130);
  check("three of a country the first time you play as them",
    Object.keys(ev(app, 'albumBookState("wc2006").have')).length === 3 ||
    Object.values(ev(app, 'albumBookState("wc2006").have')).reduce((a, b) => a + b, 0) === 3,
    JSON.stringify(ev(app, 'albumBookState("wc2006").have')));
  check("and they are all Angolans, out of the book that was on the pitch",
    Object.keys(ev(app, 'albumBookState("wc2006").have')).every(id => id.indexOf("wc2006:angola/") === 0),
    Object.keys(ev(app, 'albumBookState("wc2006").have')).join(", "));
  const was = Object.values(ev(app, 'albumBookState("wc2006").have')).reduce((a, b) => a + b, 0);
  run(app, 'S.h2h.teams = [null, null]; h2PickTeam("Angola");'); await tick(130);
  check("but only the first time",
    Object.values(ev(app, 'albumBookState("wc2006").have')).reduce((a, b) => a + b, 0) === was,
    Object.values(ev(app, 'albumBookState("wc2006").have')).reduce((a, b) => a + b, 0));

  console.log("\n--- the screens ---");
  clean();
  run(app, "mine().album.packs = 2; mineSave(); openAlbum(); render();"); await tick(150);
  check("the album opens in front of the menu", /The album/.test(stage(app)), "menu instead");
  check("with all thirty-two pages", (stage(app).match(/openAlbum\(/g) || []).length >= 32,
    (stage(app).match(/openAlbum\(/g) || []).length);
  run(app, 'openAlbum("wc2006", "Italy"); render();'); await tick(140);
  check("a page shows all twenty-three", (sheet(app).match(/class="alst/g) || []).length === 23,
    (sheet(app).match(/class="alst/g) || []).length);
  check("and nothing is lying on top of the sheet",
    (offsheet(app).match(/class="alst/g) || []).length === 0,
    (offsheet(app).match(/class="alst/g) || []).length);
  /* THE GAP IS THE FEELING. A missing man is drawn and emptied, never left
     out, because his number and his name still being there is the whole thing. */
  check("and the ones you do not have are still drawn",
    (stage(app).match(/alst empty/g) || []).length === 23,
    (stage(app).match(/alst empty/g) || []).length);
  check("with the name still in the gap", /Cannavaro/.test(stage(app)), "no names on the gaps");
  /* AND WITH NOTHING ELSE IN IT. The card is the country's kit colour now, so a
     gap has further to fall than it used to: everything that says Italy has to
     be absent rather than turned down, and the builder does that by writing no
     kit at all and by building neither the man nor the flag. The flag is the one
     that got away once already, in the draft this was cut from. A page nobody
     had started drew twenty-three full-colour Italian flags into twenty-three
     holes, which is the loudest way an empty page could possibly say Italy, and
     no test in here had an opinion about it. */
  check("a gap is painted no colour at all", !/class="alst empty" style/.test(stage(app)),
    (stage(app).match(/class="alst empty" style="[^"]*"/g) || []).slice(0, 2).join(" | "));
  check("and nobody is standing in it", (stage(app).match(/alsfig/g) || []).length === 0,
    (stage(app).match(/alsfig/g) || []).length);
  check("and it does not fly the flag", (stage(app).match(/alsfl/g) || []).length === 0,
    (stage(app).match(/alsfl/g) || []).length);
  /* AND NO CHILD OF A SLOT MAY BE NAMED alst-SOMETHING, because the count six
     checks up is a substring count. A card carrying a child class that merely
     begins the same way would report forty-six slots on a page that has
     twenty-three, and the failure would read as a bug in the album rather than
     as a bug in a class name. */
  check("nothing inside a slot opens with those four letters",
    (stage(app).match(/class="alst[a-z]/g) || []).length === 0,
    (stage(app).match(/class="alst[a-z-]+/g) || []).slice(0, 3).join(" | "));
  /* ONE STUCK IN, which is the other half of the same question. The card you
     own is the country's colour, the man on it is built by the pitch's own
     builder rather than by a second drawing kept in step by hand, and he is
     asked for as a share of the card instead of in pixels, which is the only
     reason one drawing survives the five widths this component renders at. */
  run(app, '(() => { const b = albumBookState("wc2006"), men = albumMen("wc2006", "Italy"); ' +
    'b.have[albumId("wc2006", "Italy", men[0])] = 1; mineSave(); ' +
    'openAlbum("wc2006", "Italy"); })();'); await tick(150);
  check("the one you have is the country's colour",
    /class="alst" style="--kit:#0048BA;--kink:#fff"/.test(stage(app)), "the kit is not on the card");
  check("and twenty-two holes are left around him",
    (stage(app).match(/alst empty/g) || []).length === 22,
    (stage(app).match(/alst empty/g) || []).length);
  check("the man on it is the pitch's man, sized by the card",
    /class="alsfig"><div class="fig " style="[^"]*--h:66cqw"/.test(stage(app)),
    "the sticker and the pitch are two drawings again");
  check("and the only flag on the page is his",
    (stage(app).match(/alsfl/g) || []).length === 1, (stage(app).match(/alsfl/g) || []).length);
  /* A WHITE KIT IS A QUARTER OF THE COLLECTION. 118 of the 448 sides across the
     sixteen books come back #FFFFFF from the harvest and eight of the
     thirty-two in this one do, England among them, read out of
     assets/wc2006/index.json rather than remembered. So the ink on the card is
     a contract and not a detail: every word on it inherits one kitInk answer,
     and if that ever stops being asked, a quarter of the shelf goes blank. */
  check("a white kit is written on in dark ink",
    ev(app, 'albumStickerHTML("wc2006", "England", albumMen("wc2006", "England")[0], true, false)')
      .indexOf("--kink:#17301f") > -1, "white on white");
  /* THE BOOK WITH NO FLAGS AT ALL. Forty sides in the finals book and every one
     of them carrying flag:null, with POOLS.finals carrying flags:null to match,
     so an unguarded concatenation puts four hundred and forty broken images on
     one book in sixteen. It is deleted again afterwards because a sixteenth
     book on the shelf is not what the rest of this file is written against. */
  run(app, "TEAMS.finals = " + JSON.stringify(R("assets/finals/index.json")) + ";");
  run(app, 'openAlbum("finals", Object.keys(TEAMS.finals)[0]); render();'); await tick(150);
  check("the book with no flags asks for none", !/alsfl/.test(stage(app)), "broken images");
  check("and a side still names itself in three letters", /<s>BRA<\/s>/.test(stage(app)),
    "the thirty-character key got printed into the corner");
  run(app, 'delete TEAMS.finals; openAlbum("wc2006", "Italy"); render();'); await tick(140);
  /* THE SAME STICKER AT TWENTY-FOUR, where both class names are load-bearing.
     .xshirt is the polygon Your XI draws its eleven with and is where the shape
     and the colour come from; .alsbadge is what resizes it, and it can only win
     that because two classes on one element outweigh the one class on a rule
     set eighteen hundred lines earlier. Drop either name and the badge is a
     forty pixel shirt in a twenty-four pixel row. */
  check("the badge is that polygon, resized on weight rather than on position",
    /^<span class="xshirt alsbadge" style="--kit:#0048BA;--kink:#fff">10<\/span>$/
      .test(ev(app, 'albumBadgeHTML("#0048BA", 10)')), ev(app, 'albumBadgeHTML("#0048BA", 10)'));
  check("and it asks kitInk the same question the card does",
    ev(app, 'albumBadgeHTML("#FFFFFF", 7)').indexOf("--kink:#17301f") > -1,
    ev(app, 'albumBadgeHTML("#FFFFFF", 7)'));
  /* AND A KIT THAT IS NOT SIX DIGITS NEVER REACHES THE COLOUR HELPERS. Nothing
     in the harvest is malformed today, all 448 sides checked, so this is the
     guard rather than the bug: kitInk and kitShorts both parseInt the tail
     without looking, and a three-digit kit comes back as a confident answer
     about a colour nobody wrote. */
  check("a malformed kit is replaced rather than parsed",
    ev(app, 'albumBadgeHTML("#888", 7)').indexOf("--kit:#888888") > -1,
    ev(app, 'albumBadgeHTML("#888", 7)'));
  run(app, "closeAlbum(); render();"); await tick(130);
  check("and closing it goes back", !/alpages/.test(stage(app)), "still on the album");


  /* ================= HOW LUCKY THE DRAW IS ALLOWED TO BE =================
     ALBUM_LUCK is a claim about a number, so it is measured rather than
     reasoned about. A book is filled to order, four hundred packs are opened
     against it, and the new men out of every three are counted. The bands are
     wide because it is a draw and has to stay one; what they catch is the ramp
     being switched off, and the ceiling coming off. */
  console.log("\n--- the draw goes weighted past halfway ---");
  const rate = own => ev(app, '(() => { ' +
    'localStorage.removeItem("ball3-mine"); MINE = null; ' +
    'const b = albumBookState("wc2006"), all = []; ' +
    'for(const s of albumSides("wc2006")) for(const m of albumMen("wc2006", s)) all.push(albumId("wc2006", s, m)); ' +
    'for(let i = 0; i < ' + own + '; i++) b.have[all[i]] = 1; ' +
    'const snap = JSON.stringify(b.have); let neu = 0, tot = 0; ' +
    'for(let k = 0; k < 400; k++){ b.have = JSON.parse(snap); mine().album.packs = 1; albumOpen(); ' +
    '  for(const g of mine().album.last){ tot++; if(g.isNew) neu++; } } ' +
    'return neu / tot; })()');
  const pcOf = v => Math.round(v * 1000) / 10 + "%";
  const r25 = rate(184), r50 = rate(368), r95 = rate(699), r99 = rate(729);
  /* BELOW THE TURN NOTHING HAS CHANGED, which is half the design. A quarter of
     the way into a book, three quarters of what you pull is new all on its own
     and there is nothing there worth helping. */
  check("a quarter in, the draw is still flat", Math.abs(r25 - .75) < .085, pcOf(r25));
  check("and at the turn itself it is still flat", Math.abs(r50 - .50) < .075, pcOf(r50));
  /* AND PAST IT THE BOOK HELPS, WITHIN THE CEILING. Flat would be five per cent
     at 699 of 736. A delivery would be most of the packet. Three times as
     likely is neither of those, which is the whole of ALBUM_LUCK. */
  check("at ninety-five per cent it is lifted well clear of flat", r95 > .08 && r95 < .20, pcOf(r95));
  check("and lifted, not handed over", r95 < .5, pcOf(r95));
  /* THE DRAW DELIBERATELY DOES NOT FINISH THE BOOK. The last handful is what
     the swap screen is for, so at seven gaps left a pack is still mostly
     doubles and the ceiling is doing its job. */
  check("but the last few are still a long shot", r99 < .09, pcOf(r99));
  check("and the ramp is monotone, so nothing steps backwards",
    r25 - r50 > 0 && r50 > r95 && r95 > r99, [r25, r50, r95, r99].map(pcOf).join(" "));
  /* AND THE RAMP IS THE ARITHMETIC IN THE COMMENT, checked directly rather than
     inferred off four hundred packs. */
  check("the weight is one at the turn and ALBUM_LUCK at a full book",
    ev(app, "ALBUM_TURN") === .5 && ev(app, "ALBUM_LUCK") === 3, ev(app, "ALBUM_TURN + '/' + ALBUM_LUCK"));

  /* ================= AND A PACKET NEVER REPEATS ITSELF ================= */
  console.log("\n--- and a packet never repeats itself ---");
  clean();
  /* THE DETERMINISTIC VERSION. With the coin pinned, three independent draws
     returned the same man three times over, every time. Under ALBUM_PACK_SAME
     the second and third draws see him at weight nought and have to move on, so
     a frozen coin still comes back with three different men. */
  const frozen = ev(app, '(() => { const R0 = Math.random; Math.random = () => 0; ' +
    'try { mine().album.packs = 1; albumOpen(); return mine().album.last.map(g => g.id); } ' +
    'finally { Math.random = R0; } })()');
  check("three draws off a frozen coin are three different men",
    new Set(frozen).size === 3, frozen.join(", "));
  clean();
  const twice = ev(app, '(() => { let w = 0; for(let k = 0; k < 300; k++){ mine().album.packs = 1; albumOpen(); ' +
    'const g = mine().album.last; w = Math.max(w, g.length - new Set(g.map(x => x.id)).size); } return w; })()');
  check("and three hundred packets later it has still never happened", twice === 0, twice);
  /* AND NOTHING WITHOUT A SLOT EVER COMES OUT, which used to be true by luck
     and is now true by construction, because the pool is filtered before the
     first weight is worked out. */
  clean();
  const ghosts = ev(app, '(() => { let n = 0; for(let k = 0; k < 200; k++){ mine().album.packs = 1; albumOpen(); ' +
    'for(const g of mine().album.last) if(!g.id || !albumParse(g.id) || !albumHas(g.id)) n++; } return n; })()');
  check("and every sticker drawn has a slot to go in", ghosts === 0, ghosts);
  check("and a pack is still three", ev(app, '(() => { mine().album.packs = 1; albumOpen(); ' +
    'return mine().album.last.length; })()') === 3, "short pack on a full book");

  /* ================= FINISHING A BOOK PAYS ================= */
  console.log("\n--- finishing the book pays, and says so on the shelf ---");
  clean();
  run(app, '(() => { const b = albumBookState("wc2006"); ' +
    'for(const s of albumSides("wc2006")) for(const m of albumMen("wc2006", s)) b.have[albumId("wc2006", s, m)] = 1; ' +
    'mine().album.packs = 0; mineSave(); ' +
    'for(const s of albumSides("wc2006").slice(0, 31)) albumCheckPage("wc2006", s); mineSave(); })();');
  check("thirty-one pages is not a book", ev(app, 'albumBookIsDone("wc2006")') === false, "latched early");
  check("and pays nothing yet", ev(app, "mine().album.packs") === 0, ev(app, "mine().album.packs"));
  run(app, 'albumCheckPage("wc2006", albumSides("wc2006")[31]); mineSave();'); await tick(120);
  check("the thirty-second page closes it", ev(app, 'albumBookIsDone("wc2006")') === true, "not latched");
  check("and twelve packs land for the next one",
    ev(app, "mine().album.packs") === ev(app, "ALBUM_BOOK_PACKS") && ev(app, "ALBUM_BOOK_PACKS") === 12,
    ev(app, "mine().album.packs"));
  check("in the drawer, not only on the screen",
    ev(app, 'JSON.parse(localStorage.getItem("ball3-mine")).album.packs') === 12,
    ev(app, 'JSON.parse(localStorage.getItem("ball3-mine")).album.packs'));
  /* THE LATCH IS THE ONLY THING STOPPING A SECOND PAYOUT, so it is worth two
     lines to prove that it holds against both doors into it. */
  run(app, 'albumCheckBook("wc2006"); for(const s of albumSides("wc2006")) albumCheckPage("wc2006", s);');
  await tick(90);
  check("and it cannot be collected twice", ev(app, "mine().album.packs") === 12,
    ev(app, "mine().album.packs"));
  /* THE COVER. The shelf draws nothing at all until a second book has landed,
     which is why Euro 2008 turns up here and nowhere else in this file. */
  run(app, "TEAMS.euro2008 = " + JSON.stringify(R("assets/euro2008/index.json")) + ";");
  run(app, 'openAlbum("wc2006"); render();'); await tick(150);
  check("the finished cover is plated on the shelf", /class="alcov[^"]*plate/.test(stage(app)),
    (stage(app).match(/class="alcov[^"]*"/g) || []).join(" | ").slice(0, 160));
  check("and exactly one of them is, not the whole shelf",
    (stage(app).match(/class="alcov[^"]*plate/g) || []).length === 1,
    (stage(app).match(/class="alcov[^"]*plate/g) || []).length);
  check("the man on the front has become the cup", /class="alcov-c"/.test(stage(app)), "still a player");
  /* AND IT WEARS BOTH SENTENCES AT ONCE. Finishing the book your packs come
     from must not cost you the gold spine that says so, which is what the
     .alcov.plate.coll rule exists for. */
  check("and it is still the book you are collecting", /class="alcov[^"]*coll plate/.test(stage(app)),
    "the spine and the plate cannot co-exist");
  /* THE RIBBON STAYS, because it says a true thing in words and the plate says
     a different thing in gold. */
  check("with the Complete ribbon still on it", /class="alcov-r"/.test(stage(app)), "ribbon gone");

  /* ================= AND THE PRIZE IS ADVERTISED BEFOREHAND ================= */
  console.log("\n--- and the book screen says what finishing it is worth ---");
  clean();
  run(app, 'openAlbum("wc2006"); render();'); await tick(140);
  check("an empty drawer is told about the twelve", /12 more packs land/.test(stage(app)), "no prize line");
  /* THE ONE PLAYER WHO MUST NOT BE THE ONLY ONE MISSING IT is the one with
     packs waiting, which is exactly who the sentence used to be hidden from. */
  run(app, "mine().album.packs = 4; mineSave(); render();"); await tick(140);
  check("and so is somebody with packs waiting", /12 more packs land/.test(stage(app)),
    "the prize line hides behind the Open a pack button");
  check("and the Open a pack button is still there", /Open a pack/.test(stage(app)), "button gone");

  /* ================= THE SLOT THAT LIGHTS UP ================= */
  console.log("\n--- the one you just got is lit, and the one that closed a page is lit louder ---");
  clean();
  /* ONE MAN SHORT OF ITALY, bought with doubles, because that is the only way
     to make a page close on demand without opening four hundred packets. */
  run(app, '(() => { const b = albumBookState("wc2006"), men = albumMen("wc2006", "Italy"); ' +
    'for(let i = 0; i < men.length - 1; i++) b.have[albumId("wc2006", "Italy", men[i])] = 3; ' +
    'ALBUM_VIEW = {book: "wc2006", side: "Italy"}; ' +
    'albumSwap(albumId("wc2006", "Italy", men[men.length - 1])); })();'); await tick(150);
  check("the man who closed the page is marked as having closed it",
    /class="alst[^"]* shut"/.test(stage(app)), "no closer");
  check("and the page went foil underneath him",
    ev(app, 'albumFoil("wc2006", "Italy")') === true, "no foil");
  clean();
  run(app, '(() => { const b = albumBookState("wc2006"), men = albumMen("wc2006", "Italy"); ' +
    'for(let i = 0; i < 6; i++) b.have[albumId("wc2006", "Italy", men[i])] = 3; ' +
    'ALBUM_VIEW = {book: "wc2006", side: "Italy"}; ' +
    'albumSwap(albumId("wc2006", "Italy", men[10])); })();'); await tick(150);
  check("an ordinary one you needed is marked too, and differently",
    /class="alst[^"]* fresh"/.test(stage(app)) && !/ shut"/.test(stage(app)), "wrong grade");
  check("and only one slot on the page is lit",
    (stage(app).match(/ fresh"| shut"/g) || []).length === 1,
    (stage(app).match(/ fresh"| shut"/g) || []).length);
  /* NEWS IS NEWS ONCE, so walking away and coming back must not announce it a
     second time. */
  run(app, 'openAlbum("wc2006", "Italy"); render();'); await tick(140);
  check("and walking away puts it out", !/ fresh"| shut"/.test(stage(app)), "still lit");
  /* AND NOBODY ELSE ON THE PAGE LIGHTS UP WITH HIM. lit is null on an ordinary
     render and albumId is null for a man the harvest left without a number, so
     a bare === would light every numberless slot at once. */
  check("and an ordinary render lights nothing at all",
    (stage(app).match(/alst[^"]*fresh|alst[^"]*shut/g) || []).length === 0,
    (stage(app).match(/class="alst[^"]*"/g) || []).slice(0, 4).join(" | "));
  /* A DOUBLE IS NEVER CREDITED WITH CLOSING A PAGE, even though the check that
     latches the foil has to run on every sticker that lands. */
  clean();
  run(app, '(() => { const b = albumBookState("wc2006"); ' +
    'for(const m of albumMen("wc2006", "Italy")) b.have[albumId("wc2006", "Italy", m)] = 2; ' +
    'mine().album.packs = 60; mineSave(); albumSetBook("wc2006"); })();');
  run(app, '(() => { globalThis.__dupeshut = 0; for(let k = 0; k < 60; k++){ albumOpen(); ' +
    'for(const g of mine().album.last) if(g.shut && !g.isNew) __dupeshut++; } })();'); await tick(130);
  check("a page sitting complete and unfoiled still latches off a double",
    ev(app, 'albumFoil("wc2006", "Italy")') === true, "the page never foiled");
  check("but the double is never given the star", ev(app, "__dupeshut") === 0, ev(app, "__dupeshut"));

  /* ================= AND YOU CHOOSE WHICH THREE GO ================= */
  console.log("\n--- and you choose which three doubles go ---");
  clean();
  run(app, '(() => { const b = albumBookState("wc2006"), men = albumMen("wc2006", "Italy"); ' +
    'b.have[albumId("wc2006","Italy",men[0])] = 4; b.have[albumId("wc2006","Italy",men[1])] = 2; ' +
    'b.have[albumId("wc2006","Italy",men[2])] = 3; b.have[albumId("wc2006","Italy",men[3])] = 2; ' +
    'mineSave(); openAlbum("wc2006", "Italy"); })();'); await tick(150);
  const mark = ev(app, 'albumId("wc2006", "Italy", albumMen("wc2006","Italy")[9])');
  check("a gap is offered once you have three doubles", stage(app).indexOf("albumSwapTo(") > -1, "not offered");
  /* AND THE PAGE NO LONGER CHARGES FOR THE TAP, because the tap is now free and
     a screen that says otherwise is the one sentence this whole change exists
     to stop being true. */
  check("and the page says the tap picks rather than pays",
    /Tap a gap and pick which three doubles go\./.test(stage(app)), "still the old promise");
  run(app, 'albumSwapTo(' + JSON.stringify(mark) + ');'); await tick(150);
  check("tapping it opens the chooser rather than spending them",
    /alswant/.test(stage(app)) && /Three for one/.test(stage(app)), "swapped on the spot");
  check("and not one double has gone", ev(app, 'albumDupes("wc2006").length') === 4,
    ev(app, 'albumDupes("wc2006").length'));
  check("with the whole pile on the screen",
    (stage(app).match(/albumSwapPick\(/g) || []).length === 4,
    (stage(app).match(/albumSwapPick\(/g) || []).length);
  /* DEEPEST FIRST is what makes the screen usable on a full book: the three you
     can most afford are the first three under your thumb. */
  check("deepest stack first",
    ev(app, 'albumPile("wc2006").map(id => albumBookRead("wc2006").have[id]).join(",")') === "4,3,2,2",
    ev(app, 'albumPile("wc2006").map(id => albumBookRead("wc2006").have[id]).join(",")'));
  /* AND THE SORT IS LEGIBLE, because a rule the player has to take on trust is
     not a rule, it is a rumour. */
  check("and each card says how deep its stack is",
    (stage(app).match(/class="alsx">(\d+) copies/g) || []).join(" ") ===
      'class="alsx">4 copies class="alsx">3 copies class="alsx">2 copies class="alsx">2 copies',
    (stage(app).match(/class="alsx">\d+ copies/g) || []).join(" "));
  check("and nothing can be confirmed at nought", !/albumSwapDo/.test(stage(app)), "confirm offered early");
  check("and the line asks for three", /Pick any three of your doubles and he is yours\./.test(stage(app)),
    "wrong opening line");
  const pile = ev(app, 'albumPile("wc2006")');
  const tap = i => run(app, 'albumSwapPick(' + JSON.stringify(pile[i]) + ');');
  tap(3); await tick(120);
  check("one chosen card lights up", (stage(app).match(/alsgo/g) || []).length === 1,
    (stage(app).match(/alsgo/g) || []).length);
  check("and the line counts down rather than reporting a total",
    /Pick two more and he is yours\./.test(stage(app)), "no escalation");
  tap(3); await tick(120);
  check("and tapping it again puts it back", !/alsgo/.test(stage(app)), "still chosen");
  tap(3); tap(2); await tick(120);
  check("two picked, and it says so in English", /One more and he is yours\./.test(stage(app)),
    "wrong line at two");
  tap(1); await tick(140);
  check("three chosen offers the trade", /albumSwapDo/.test(stage(app)), "no way to confirm");
  check("and the line stops asking", /Tap one again if you want him back\./.test(stage(app)),
    "still asking for more");
  /* A BUTTON THAT STOPS ANSWERING IS A BUTTON SOMEBODY DECIDES IS BROKEN, so a
     fourth tap pushes the oldest choice out instead of doing nothing. */
  tap(0); await tick(120);
  check("a fourth tap pushes the first choice out rather than doing nothing",
    ev(app, 'JSON.stringify(ALBUM_VIEW.swap.give)') === JSON.stringify([pile[2], pile[1], pile[0]]),
    ev(app, 'JSON.stringify(ALBUM_VIEW.swap.give)'));
  run(app, "albumSwapDo();"); await tick(150);
  check("the man is yours", ev(app, "albumHas(" + JSON.stringify(mark) + ")") === true, "not stuck in");
  /* AND IT TOOK THE THREE THAT WERE PICKED, not the three at the front of the
     pile, which is the only reason the screen was built. */
  check("and the three that went are the three that were picked",
    ev(app, 'JSON.stringify(' + JSON.stringify(pile) + '.map(id => albumBookRead("wc2006").have[id] || 0))') ===
      JSON.stringify([3, 2, 1, 2]),
    ev(app, 'JSON.stringify(' + JSON.stringify(pile) + '.map(id => albumBookRead("wc2006").have[id] || 0))'));
  check("and it lands back on the page with him lit",
    /class="alst[^"]* fresh"/.test(stage(app)) && !/alswant/.test(stage(app)), "wrong screen");
  /* AND THE OLD DOOR STILL WORKS. album-test drives albumSwap with one argument
     further up this file, and anything else in the app that turns up to trade
     with no opinion about which spares to give should still get a fair trade
     rather than nothing at all. */
  clean();
  run(app, '(() => { const b = albumBookState("wc2006"), men = albumMen("wc2006", "Italy"); ' +
    'for(let i = 0; i < 3; i++) b.have[albumId("wc2006","Italy",men[i])] = 2; ' +
    'ALBUM_VIEW = null; mineSave(); ' +
    'albumSwap(albumId("wc2006", "Italy", men[9])); })();'); await tick(140);
  check("called with no opinion it still pays from the top of the pile",
    ev(app, 'albumDupes("wc2006").length') === 0 &&
    ev(app, 'albumHas(albumId("wc2006", "Italy", albumMen("wc2006","Italy")[9]))') === true,
    ev(app, 'albumDupes("wc2006").length'));
  /* AND IT REFUSES A LIST IT CANNOT TRUST, because give comes off an inline
     onclick and that is as public as an interface gets. */
  clean();
  run(app, '(() => { const b = albumBookState("wc2006"), men = albumMen("wc2006", "Italy"); ' +
    'for(let i = 0; i < 4; i++) b.have[albumId("wc2006","Italy",men[i])] = 2; ' +
    'ALBUM_VIEW = null; mineSave(); ' +
    'const one = albumId("wc2006","Italy",men[0]); ' +
    'albumSwap(albumId("wc2006", "Italy", men[9]), [one, one, one]); })();'); await tick(140);
  check("the same double named three times does not count as three men",
    ev(app, 'albumBookRead("wc2006").have[albumId("wc2006","Italy",albumMen("wc2006","Italy")[0])]') !== undefined &&
    ev(app, 'albumDupes("wc2006").length') === 1,
    ev(app, 'albumDupes("wc2006").length') + " doubles left");

  /* ================= AND THEY ARE HANDED OVER ONE AT A TIME =================
     The pack screen was three cards arriving at once, and everything below is
     about the sequence that now goes over the top of it. The overlay is
     appended to document.body, which this harness deliberately keeps no list
     of, so none of it can be read out of the stage. That is not a hole in the
     test, it is the thing being tested: the stage holds the finished screen and
     only the finished screen, from the first frame to the last, and the reveal
     is read where it actually lives, off PACK_REVEAL.

     AND IT IS DRIVEN RATHER THAN SAMPLED. A reveal that is only checked at its
     end has not been checked at all, because the end of this one is a screen
     that was painted before it started, so every assertion about it would pass
     against a sequence that never ran. So the clock below is stepped card by
     card and each card's whole panel is compared against what the builder says
     that card should look like, which is the only way to catch a sequence that
     shows the right three men in the wrong order or shows one of them twice.

     THE COIN IS PINNED FOR THE TWO RUNS THAT ARE COMPARED WITH EACH OTHER.
     albumPackDraw walks its own array and hands back the first man with weight
     left on him, so with Math.random at nought a packet is exactly the first
     three drawable men of the first side in the book, every run, on every
     machine. Without that, comparing a pack somebody sat through against a pack
     somebody skipped is comparing two different packs. */
  const src = fs.readFileSync(path.join(REPO, "index.html"), "utf8").split("\r\n").join("\n");
  const panel = () => ev(app, "PACK_REVEAL ? PACK_REVEAL.now.innerHTML : ''");
  const wants = n => ev(app, "packRevealSetHTML(mine().album.last[" + n + "], PACK_BEAT + (" +
    n + " === mine().album.last.length - 1 ? PACK_TAIL : 0))");
  const pinned = stmt => run(app, "(() => { const R0 = Math.random; Math.random = () => 0; " +
    "try { " + stmt + " } finally { Math.random = R0; } })();");

  console.log("\n--- the pack is handed over one sticker at a time ---");
  clean();
  run(app, "mine().album.packs = 1; albumOpen();");
  const endScreen = stage(app);
  /* THE WHOLE ARGUMENT FOR THE DESIGN IS THIS ONE ASSERTION. The screen the
     sequence is going to finish on exists before the first flag has dropped,
     which is what makes a skip exact rather than a reconstruction. */
  check("the screen it ends on is already painted before anything moves",
    (endScreen.match(/class="alst/g) || []).length === 3 &&
    /You have 0 packs left/.test(endScreen),
    (endScreen.match(/class="alst/g) || []).length + " cards");
  check("and a reveal is running over the top of it",
    ev(app, "!!PACK_REVEAL") === true, "nothing started");
  /* identity rather than equality, because identity is exactly what
     packRevealCheck asks on every render and a test that asked the softer
     question would pass while the real guard was broken */
  check("on the pack that was just drawn rather than on a copy of it",
    ev(app, "PACK_REVEAL.got === mine().album.last") === true, "a different array");
  check("and none of it is written into the stage",
    stage(app).indexOf("pkrv") < 0, "the sheet leaked into the screen");

  const p0 = panel();
  check("beat one names the country the card came out of",
    p0.indexOf(ev(app, 'esc(mine().album.last[0].side)')) > -1, p0.slice(0, 140));
  check("in the kit and the ink the card itself is lettered with",
    /--kit:#[0-9A-Fa-f]{6};--kink:(#fff|#17301f)/.test(p0), p0.slice(0, 180));
  check("beat two says his number the way a person would say it",
    /<em>(The (One|Two|Three|Four|Five|Six|Seven|Eight|Nine|Ten|Eleven)|Number \d+)<\/em>/.test(p0),
    (p0.match(/<em>[^<]*<\/em>/) || ["no line"])[0]);
  check("beat three is the pack screen's own card, not a second drawing of one",
    (p0.match(/class="alst[^"]*"/g) || []).length === 1,
    (p0.match(/class="alst[^"]*"/g) || []).join(" | "));
  /* THE CLASS STRING IS THE CONTRACT. Nothing in the reveal may get in front of
     empty or behind fresh and shut, and nothing it adds may begin with those
     four letters, because the slot counts further up this file read the
     attribute as literal text. */
  check("with exactly the class string the pack screen gives it",
    /^class="alst( dupe)?( foil)?( fresh| shut)?"$/.test((p0.match(/class="alst[^"]*"/g) || [""])[0]),
    (p0.match(/class="alst[^"]*"/g) || [""])[0]);
  check("and nothing the reveal adds opens with those four letters",
    !/class="alst[a-z]/.test(p0), (p0.match(/class="alst[a-z-]+/g) || []).slice(0, 3).join(" | "));
  /* THE PAPERWORK DISAGREED ABOUT THIS ONE. The plan wanted NEW and DOUBLE
     stamped on the card and the card wanted its news in the rim, so the stamp
     went on the reveal and the rim stayed on the card. */
  check("beat four stamps the verdict on the reveal and leaves the card alone",
    /class="pkrv-stamp pkrv-(new|dupe|shut)"/.test(p0) && />(New|Double|Complete)</.test(p0),
    (p0.match(/pkrv-stamp[^<]*</) || ["no stamp"])[0]);
  /* AND THE STAMP'S SECOND CLASS IS PREFIXED. shut and dupe already mean
     something on .alst two and a half thousand lines down the same stylesheet;
     there is no bare rule for either today, which is precisely how a collision
     like that waits six weeks before it bites. */
  check("and its state is prefixed rather than borrowing a word the card owns",
    !/class="pkrv-stamp (new|shut|dupe)"/.test(src), "the stamp took a bare word");
  /* THE WAY OUT BELONGS TO THE SHEET AND NOT TO THE STICKER, so it is written
     once and survives all three cards instead of being destroyed and rebuilt
     underneath somebody who is reading it. */
  check("the way out is on the sheet rather than rebuilt with every card",
    p0.indexOf("pkrv-tap") < 0 &&
    (src.match(/classList\.add\("pkrv-tap"\)/g) || []).length === 1,
    "the skip hint is inside the card markup");
  /* AND IT IS CLEAR OF THE TOAST. .toast is bottom:24px with twelve pixels of
     padding and a z-index above this sheet, so a hint at twenty-two sits
     underneath a green pill on exactly the pack that closes a page. */
  check("and it sits clear of the toast rather than under it",
    /\.pkrv-tap\{position:absolute;left:0;right:0;bottom:74px/.test(src),
    "the skip hint is back in the toast's box");

  /* ---------- and now step it ---------- */
  console.log("\n--- and the sequence is stepped, not sampled ---");
  check("card one on the sheet is card one out of the packet", p0 === wants(0), "a different card");
  await tick(1100);
  check("a beat later the second man is up", panel() === wants(1), "still on the first");
  check("and the screen underneath has not been touched", stage(app) === endScreen, "it repainted");
  await tick(1040);
  check("and a beat after that the third", panel() === wants(2), "wrong card");
  check("which is given the tail to stand in that the other two do not get",
    panel().indexOf("--life:" + ev(app, "PACK_BEAT + PACK_TAIL") + "ms") > -1,
    (panel().match(/--life:[0-9]+ms/) || ["no life"])[0]);
  check("and the stage is still the screen it was at the first frame",
    stage(app) === endScreen, "it repainted");
  await tick(1600);
  check("the sequence finished on its own", ev(app, "PACK_REVEAL") === null, "it is still going");
  check("and took its sheet with it", ev(app, "PACK_GONE") === null, "the sheet is still in the page");
  const sat = stage(app);
  check("landing on the screen that was painted before the first flag dropped",
    sat === endScreen, "sitting through it changed the screen");

  /* ---------- and skipping lands in exactly the same place ---------- */
  console.log("\n--- and tapping through lands on the same screen, byte for byte ---");
  clean();
  pinned("mine().album.packs = 1; albumOpen();");
  const pinnedSat = stage(app);
  await tick(3600);
  check("a pinned pack sits through to the same screen it started on",
    ev(app, "PACK_REVEAL") === null && stage(app) === pinnedSat, "the sat-through run moved");
  clean();
  pinned("mine().album.packs = 1; albumOpen();");
  await tick(150);
  check("the same three men come out of the same coin", panel() === wants(0), "a different packet");
  run(app, "packRevealTap();");
  /* THE STATE GOES IN THE SAME SYNCHRONOUS CALL and the element is allowed a
     tenth of a second to travel to nothing, because a full-screen dim that
     appears and vanishes between frames reads as the screen glitching. */
  check("a tap ends the sequence at once", ev(app, "PACK_REVEAL") === null, "still running");
  check("and the sheet leaves rather than being yanked",
    ev(app, '!!PACK_GONE && PACK_GONE.el.classList.contains("pkrv-done") ' +
      '&& PACK_GONE.el.classList.contains("pkrv-fast")') === true, "it was removed mid-frame");
  check("landing on precisely the screen the third card would have landed on",
    stage(app) === pinnedSat, "the two ways out disagree");
  check("without having repainted anything to get there",
    stage(app).indexOf("pkrv") < 0, "the skip rebuilt the screen");
  await tick(400);
  check("and the sheet is out of the page a moment later",
    ev(app, "PACK_GONE") === null, "the fade left a node behind");
  check("with nothing waking up behind it",
    ev(app, "PACK_REVEAL") === null && stage(app) === pinnedSat, "a timer came back");

  /* ---------- the verdict has to be allowed to rest ---------- */
  console.log("\n--- and the last beat of a card is over before the card leaves ---");
  /* .pkrv-set fades from ninety-four per cent of its life and the stamp's
     entrance ends at its delay plus its duration. At the nine hundred this
     started on those two crossed, so the verdict was being read out while the
     page it was written on was already going. */
  const stampEnd = 620 + 260;
  check("the stamp's entrance is a real animation with a real delay",
    /animation:pkrvstamp \.26s \.62s/.test(src), "the stamp moved");
  /* AND EVERYTHING ELSE IN BEAT FOUR LANDS ON THE SAME FRAME IT DOES, which is
     what the block above it claims and what makes the arithmetic below one sum
     rather than four. The tick, the star, the double going flat and the line
     naming the page all hang off the stamp's delay. */
  check("and the rest of the verdict lands on the frame the stamp does",
    (src.match(/\.26s \.62s/g) || []).length === 4, (src.match(/\.26s \.62s/g) || []).length);
  check("and it is over before the card starts to fade, with room to spare",
    ev(app, "PACK_BEAT") * 0.94 - stampEnd > 60,
    Math.round(ev(app, "PACK_BEAT") * 0.94 - stampEnd) + "ms of stillness");
  check("and the whole of it still lands near three and a quarter seconds",
    ev(app, "PACK_BEAT * 3 + PACK_TAIL") === 3300, ev(app, "PACK_BEAT * 3 + PACK_TAIL"));

  /* ================= AND IT CANNOT BE LEFT RUNNING =================
     A reveal that can be interrupted is a reveal that can leak a timer into a
     screen that has gone, and this app has lost a day to that before. */
  console.log("\n--- it cannot be left running over a screen that has gone ---");
  clean();
  run(app, "mine().album.packs = 1; albumOpen();");
  check("a reveal is up", ev(app, "!!PACK_REVEAL") === true, "nothing started");
  run(app, "closeAlbum();");
  check("walking out of the album takes it with you, in the same call",
    ev(app, "PACK_REVEAL") === null, "it survived the exit");
  check("and the sheet goes with it rather than fading over whatever you left for",
    ev(app, "PACK_GONE") === null, "a dim is sitting over the menu");
  await tick(1500);
  check("and no timer came back to write into the screen you left for",
    ev(app, "PACK_REVEAL") === null && ev(app, "ALBUM_VIEW") === null, "something is still running");

  /* THE HOLE THE FIRST DRAFT HAD. Going through render is not the same as being
     caught by the condition: the guest branches return before the album branch
     is ever reached, so an identity test on ALBUM_VIEW.open still answers "my
     pack" while a sheet sits over a live answer screen. */
  clean();
  run(app, "mine().album.packs = 1; albumOpen();");
  run(app, "globalThis.__gr = guestRole; globalThis.guestRole = () => 'answer';");
  run(app, "packRevealCheck();");
  check("a phone handed a turn mid pack loses the sheet, not the turn",
    ev(app, "PACK_REVEAL") === null && ev(app, "PACK_GONE") === null,
    "the sheet is sitting over an answer screen");
  run(app, "globalThis.guestRole = __gr;");

  clean();
  run(app, "mine().album.packs = 2; albumOpen();");
  const first = ev(app, "PACK_REVEAL.el");
  run(app, "albumOpen();");
  check("a second pack replaces the sequence rather than stacking on it",
    ev(app, "PACK_REVEAL.el") !== first &&
    ev(app, "PACK_REVEAL.got === mine().album.last") === true &&
    ev(app, "PACK_REVEAL.i") === 0, "the old sequence is still the one on screen");
  check("and the first sheet is out of the page at once rather than crossfading",
    ev(app, "PACK_GONE") === null, "two dims on the screen");
  run(app, "packRevealStop(1);");
  check("and stopping something already stopped is free",
    ev(app, "(() => { packRevealStop(1); packRevealStop(0); return PACK_REVEAL; })()") === null,
    "it threw");
  run(app, "packRevealSweep();");
  /* ONE HANDLE FOR THE SEQUENCE AND ONE FOR THE SHEET LEAVING, each cleared in
     exactly one place, which is the whole of the cancellation story and the
     only reason any of the above holds. */
  check("there is one clear site for the sequence and one for the fade",
    (src.match(/clearTimeout\(P\.t\)/g) || []).length === 1 &&
    (src.match(/clearTimeout\(G\.t\)/g) || []).length === 1,
    (src.match(/clearTimeout\([PG]\.t\)/g) || []).join(" "));
  check("and render is where the question is asked, once, on every pass",
    (src.match(/^  packRevealCheck\(\);$/gm) || []).length === 1,
    (src.match(/packRevealCheck\(\);/g) || []).length + " calls");

  /* ================= THE ROAR ================= */
  console.log("\n--- a closed page roars once, and a tap does not cancel the news ---");
  run(app, 'globalThis.__sfx = []; globalThis.__sfx0 = h2Sfx; ' +
    'globalThis.h2Sfx = (n, v) => __sfx.push(n + "/" + v);');
  /* A PAGE CLOSED ON DEMAND RATHER THAN ON THE FOUR HUNDREDTH PACKET. Own every
     man on the first side but the first three, pin the coin, and the third card
     out of the packet is the one that latches the foil, every run. */
  const shutPack = () => { clean(); pinned(
    'const b = albumBookState("wc2006"), side = Object.keys(albumBook("wc2006"))[0], ' +
    '  men = albumMen("wc2006", side).filter(m => albumId("wc2006", side, m)); ' +
    'globalThis.__page = side; ' +
    'for(let i = 3; i < men.length; i++) b.have[albumId("wc2006", side, men[i])] = 1; ' +
    'mine().album.packs = 1; mineSave(); __sfx.length = 0; albumOpen();'); };
  shutPack();
  check("the page closed", ev(app, 'albumFoil("wc2006", __page)') === true, "never closed");
  check("and the card that closed it is stamped complete, in gold",
    ev(app, 'packRevealSetHTML(mine().album.last[2], 1).indexOf("pkrv-stamp pkrv-shut") > -1'),
    "no gold stamp");
  check("wearing the card's own gold rim as well as the stamp",
    ev(app, '/class="alst[^"]*foil[^"]* shut"/.test(packRevealSetHTML(mine().album.last[2], 1))'),
    "no rim on the reveal");
  check("the roar is owed and not yet paid",
    ev(app, "PACK_REVEAL.roar") === 1 && ev(app, "JSON.stringify(__sfx)") === "[]",
    ev(app, "JSON.stringify(__sfx)"));
  run(app, "packRevealTap();");
  /* SKIPPING IS SOMEBODY SAYING THEY HAVE SEEN REVEALS BEFORE, not that they do
     not want the news, and a page closing is the one thing the sequence carries
     that is not also written on the screen underneath. */
  check("and a tap pays it on the way out rather than cancelling it",
    ev(app, "JSON.stringify(__sfx)") === JSON.stringify(["goal/0.95"]),
    ev(app, "JSON.stringify(__sfx)"));
  check("and only ever once", ev(app, "PACK_REVEAL") === null, "still owed somewhere");
  await tick(300);
  /* TWO PAGES CAN CLOSE INSIDE ONE PACKET, and two crowd recordings starting
     nine tenths of a second apart is a fight rather than a celebration. */
  run(app, '__sfx.length = 0; (() => { const got = [' +
    '{book: "wc2006", side: "Italy", m: albumMen("wc2006","Italy")[0], isNew: true, shut: true},' +
    '{book: "wc2006", side: "Italy", m: albumMen("wc2006","Italy")[1], isNew: true, shut: true},' +
    '{book: "wc2006", side: "Italy", m: albumMen("wc2006","Italy")[2], isNew: true, shut: false}];' +
    'ALBUM_VIEW = {book: "wc2006", open: got}; packReveal(got); })();');
  await tick(2600);
  check("a packet that closes two pages still roars exactly once",
    ev(app, "JSON.stringify(__sfx)") === JSON.stringify(["goal/0.95"]),
    ev(app, "JSON.stringify(__sfx)"));
  run(app, "packRevealStop(1); packRevealSweep();");
  /* AND NO RECORDING IS ASKED FOR THAT IS NOT ON THE DISK. There are two wavs
     in assets/sfx and sw.js caches those two, so a stem named in here that
     nobody harvested is a sound no phone will ever play and an offline install
     that goes looking for it. */
  const stems = (src.match(/h2Sfx\("[a-z]+"/g) || []).map(x => x.slice(7, -1));
  check("and every recording the app asks for is on the disk",
    stems.length > 0 && stems.every(n => fs.existsSync(path.join(REPO, "assets/sfx/" + n + ".wav"))),
    stems.join(", "));

  /* ================= LESS MOVEMENT IS NOT LESS NEWS ================= */
  console.log("\n--- and a man who asked for less movement gets the end of it at once ---");
  clean();
  run(app, "globalThis.__mm = matchMedia; matchMedia = () => ({matches: true, addEventListener(){}});");
  run(app, "__sfx.length = 0;");
  shutPack();
  check("no reveal is built at all", ev(app, "PACK_REVEAL") === null, "it was built anyway");
  const rm = stage(app);
  check("and the finished screen is there instead, with the three cards on it",
    (rm.match(/class="alst/g) || []).length === 3, (rm.match(/class="alst/g) || []).length);
  /* THE POINT OF THE SETTING IS LESS MOVEMENT AND NOT LESS INFORMATION, so
     every piece of news the sequence was going to carry has to be on this
     screen: which were new, which page closed, and how many are left. */
  check("with nothing that carries news suppressed",
    / shut"/.test(rm) && /That closed /.test(rm) && /You have 0 packs left/.test(rm),
    "the pack screen lost its markings");
  /* THE ROAR IS SOUND AND NOT MOVEMENT, and it is the one thing the sequence
     carries that the screen does not, so it fires here exactly as it does on a
     tap. The two ways of saying make this stop now agree. */
  check("and the roar still goes, once, the same as a tap pays it",
    ev(app, "JSON.stringify(__sfx)") === JSON.stringify(["goal/0.95"]),
    ev(app, "JSON.stringify(__sfx)"));
  run(app, "matchMedia = globalThis.__mm; globalThis.h2Sfx = __sfx0;");
  check("and the setting is answered in the stylesheet as well as in the code",
    /@media \(prefers-reduced-motion: reduce\)\{\n    \.pkrv\{display:none\}\n  \}/.test(src),
    "no second lock");

  /* ================= THE BENCH THAT IS NOT THERE ================= */
  console.log("\n--- and nobody is promised a bench that does not exist ---");
  run(app, "TEAMS.finals = " + JSON.stringify(R("assets/finals/index.json")) + ";");
  /* FIFTEEN BOOKS ARE SQUAD LISTS WITH A DOZEN MEN BEHIND THE ELEVEN AND THE
     SIXTEENTH IS FORTY LINE-UPS WITH NOBODY. The toast has been offering that
     bench to all of them since the finals book landed. */
  check("the finals book really does carry no bench",
    ev(app, "Object.keys(TEAMS.finals).every(k => (TEAMS.finals[k].bench || []).length === 0)") === true,
    "the premise moved");
  check("and a World Cup side really does carry one",
    ev(app, '(TEAMS.wc2006[Object.keys(TEAMS.wc2006)[0]].bench || []).length') > 0, "no bench");
  const said = () => ev(app, 'document.querySelector("#toast").textContent');
  clean();
  run(app, '(() => { const b = albumBookState("finals"), side = Object.keys(TEAMS.finals)[0]; ' +
    'for(const m of albumMen("finals", side)) b.have[albumId("finals", side, m)] = 1; ' +
    'albumCheckPage("finals", side); })();');
  check("closing a finals page says it is complete and stops there",
    / complete\.$/.test(said()) && said().indexOf("bench") < 0, said());
  clean();
  run(app, '(() => { const b = albumBookState("wc2006"), side = "Italy"; ' +
    'for(const m of albumMen("wc2006", side)) b.have[albumId("wc2006", side, m)] = 1; ' +
    'albumCheckPage("wc2006", side); })();');
  check("and closing a World Cup page still hands over the bench",
    said() === "Italy complete. Their bench is yours.", said());
  /* AND THE CARD SAYS THE SAME THING THE TOAST SAYS, which is not a duplicate:
     the toast fires before the sheet goes up and hides at two and two tenths,
     and the card that closed the page can be the third of the three, which does
     not arrive until two and one tenth. */
  const finCard = ev(app, '(() => { const side = Object.keys(TEAMS.finals)[0]; ' +
    'return packRevealSetHTML({book: "finals", side: side, m: TEAMS.finals[side].xi[0], ' +
    'isNew: true, shut: true}, 1000); })()');
  check("the gold card in a benchless book says complete and offers nothing more",
    /class="pkrv-sub">[^<]*complete<\/div>/.test(finCard) && finCard.indexOf("bench") < 0,
    (finCard.match(/class="pkrv-sub">[^<]*/) || ["no line"])[0]);
  const itaCard = ev(app, 'packRevealSetHTML({book: "wc2006", side: "Italy", ' +
    'm: albumMen("wc2006","Italy")[0], isNew: true, shut: true}, 1000)');
  check("and the one in a book that has a bench offers it",
    /class="pkrv-sub">Italy complete\. Their bench is yours<\/div>/.test(itaCard),
    (itaCard.match(/class="pkrv-sub">[^<]*/) || ["no line"])[0]);

  /* ================= THE BOOK WITH NO FLAGS =================
     Beat one is a flag dropping in, and one book in sixteen has none: forty
     sides carrying flag:null under a pool carrying flags:null to match. */
  console.log("\n--- the book with no flags still gets a first beat ---");
  check("it asks for no image", finCard.indexOf("<img") < 0, "broken flag");
  check("putting the side's own abbreviation where the flag would have gone",
    finCard.indexOf('class="pkrv-abbr">' + ev(app, "TEAMS.finals[Object.keys(TEAMS.finals)[0]].abbr") +
      "<") > -1, (finCard.match(/pkrv-abbr">[^<]*/) || ["nothing"])[0]);
  check("and it falls back to the side's own name rather than to nothing at all",
    ev(app, '(() => { const side = Object.keys(TEAMS.finals)[0]; ' +
      'const keep = TEAMS.finals[side].abbr; TEAMS.finals[side].abbr = ""; ' +
      'const h = packRevealSetHTML({book: "finals", side: side, m: TEAMS.finals[side].xi[0], ' +
      '  isNew: true, shut: false}, 1000); TEAMS.finals[side].abbr = keep; ' +
      'return h.indexOf("pkrv-abbr") > -1 && h.indexOf(side + "</i>") > -1; })()') === true,
    "an empty plate");
  /* AND THE LONGEST KEY IN THE POOL GOES ON ITS OWN FULL-WIDTH BAR. Forty-seven
     characters is Manchester United and a Champions League final, and forty-
     seven characters beside a flag inside eighty-six per cent of a phone is
     three wrapped lines shoving the card off the bottom of the screen. */
  const longest = ev(app, "Object.keys(TEAMS.finals).sort((a,b) => b.length - a.length)[0]");
  check("the longest side name in the app is longer than anybody planned for",
    longest.length > 40, longest.length + ": " + longest);
  check("and it gets a bar of its own rather than a line beside the flag",
    ev(app, 'packRevealSetHTML({book: "finals", side: ' + JSON.stringify(longest) +
      ', m: TEAMS.finals[' + JSON.stringify(longest) + '].xi[0], isNew: true, shut: false}, 1000)')
      .indexOf('<div class="pkrv-side">' + longest + "</div>") > -1,
    "the name is not on its own row");
  check("which truncates instead of wrapping the card down the screen",
    /\.pkrv-side\{[^}]*white-space:nowrap;overflow:hidden;\s*text-overflow:ellipsis/.test(src),
    "the bar wraps");
  run(app, "delete TEAMS.finals;");

  /* ================= THE TWO PLACES THE CLOCK IS WRITTEN DOWN ================= */
  console.log("\n--- and the two places the clock is written down still agree ---");
  check("the sting fires at the frame the card actually starts moving on",
    ev(app, "PACK_STING") === 300 && /\.pkrv-card\{animation:pkrvwipe \.34s \.3s/.test(src),
    ev(app, "PACK_STING") + " against the stylesheet");
  /* THE NUMBER BEAT STOPS AT ELEVEN ON PURPOSE. Ten thousand one hundred and
     fifty-seven men in the sixteen books carry a shirt number and five thousand
     three hundred and fifty-five of them wear above eleven, so a table running
     to ninety-nine would put "The twenty-two" on more than half the album, and
     nobody says that at a ground. */
  check("a number with a name gets said, and one without gets read out",
    ev(app, 'packManLine({no: 10, pos: "AM"})').indexOf("<em>The Ten</em>") === 0 &&
    ev(app, 'packManLine({no: 22, pos: "CB"})').indexOf("<em>Number 22</em>") === 0,
    ev(app, 'packManLine({no: 22, pos: "CB"})'));
  check("and the table is pinned at eleven so it cannot quietly creep back up",
    ev(app, "PACK_WORDS.length") === 12, ev(app, "PACK_WORDS.length"));
  /* THE ROTATION TRAP, which the pitch's marker ring fell into and documented:
     a transform that lives only in a keyframe takes the element's positioning
     with it. The surname is turned a half circle by an ordinary rule, so both
     ends of its keyframe have to repeat that or the name lands upside down. */
  const stand = src.slice(src.indexOf("@keyframes pkrvstand"), src.indexOf("@keyframes pkrvstand") + 200);
  check("the surname still knows which way up it is",
    stand.split("rotate(180deg)").length - 1 === 2,
    stand.split("rotate(180deg)").length - 1 + " of 2");
  /* AND NOTHING TOUCHES ITS ORIGIN. .alsn runs across the middle sixty per cent
     of a card that is overflow:hidden, so turning it about its bottom edge
     rather than its centre maps the whole box below the card and the name is
     simply gone. */
  check("about its own centre, which is the only place it fits",
    !/\.pkrv-card \.alsn\{[^}]*transform-origin/.test(src), "the name rotates off the card");
  check("the foil's sheen is scoped to the reveal rather than switched on across the book",
    /\.pkrv-card \.alst\.foil::before\{background-size/.test(src) &&
    !/\n  \.alst\.foil::before\{[^}]*animation/.test(src), "every foil in the album is shimmering");
  check("and it parks on the card rather than running off the far edge",
    /@keyframes pkrvsheen\{from\{background-position:200% 0\}70%,to\{background-position:0 0\}\}/.test(src),
    "the gold has gone by the time the stamp lands");
  /* THE SHEET ARRIVES AND LEAVES RATHER THAN APPEARING AND VANISHING. An eighty
     six per cent black sheet cut in and out between frames reads as the screen
     glitching; .bigreveal fades its own dim for the same reason. */
  check("the dim fades in and the sheet fades out",
    /animation:pkrvdim \.22s ease both/.test(src) &&
    /\.pkrv\{[^}]*transition:opacity \.26s ease\}/.test(src) &&
    /\.pkrv\.pkrv-done\{opacity:0;pointer-events:none\}/.test(src), "it still cuts");

  /* ======================= THE CARD TURNS OVER =======================
     ALBUM-PLAN section 3, and the last of the album's own list of unbuilt
     things. What is being asserted down here is not that a card can rotate. It
     is the four rules that decide whether the back is honest: a card turns over
     only when there is something real behind it, every row on it comes out of a
     file rather than out of a builder's imagination, the two ways of having no
     career are told apart, and the file it all depends on is asked for somewhere
     that costs nobody anything.

     FETCH REJECTS IN THIS HARNESS, which is not a limitation but the most
     interesting case there is. spells.json is a lazy second file and somebody on
     a bad connection, or offline on a book they have never opened, gets a card
     that has to be a card anyway. So the careers are pushed in by hand where the
     subject is what the back says, and the rejection is left to run where the
     subject is what the loader does about it. */
  console.log("\n--- where the careers come from, and what they cost ---");
  /* NOTHING IN THE APP HAD EVER OPENED THESE FILES. Fifteen of them, 1,980,274
     bytes, 40,181 spells joining 6,420 of the 10,157 men on the shelf, written by
     build-squads.js and read by nobody until now. */
  const shelf = ev(app, "Object.keys(POOLS).filter(albumIsBook)");
  check("all sixteen books are on the shelf", shelf.length === 16, shelf.length);
  const withfile = shelf.filter(b => ev(app, "albumSpellsFile(" + JSON.stringify(b) + ")"));
  check("and fifteen of them know where their career file is",
    withfile.length === 15, withfile.length);
  check("and every one of those files is actually on the disk",
    withfile.every(b => fs.existsSync(path.join(REPO,
      ev(app, "albumSpellsFile(" + JSON.stringify(b) + ")")))),
    withfile.map(b => ev(app, "albumSpellsFile(" + JSON.stringify(b) + ")")).join(" "));
  /* THE SIXTEENTH IS THE FINALS BOOK, which has no careers and never had: forty
     real starting elevens, no bench, no harvest. It is spotted by its group
     rather than by its name, so nothing is ever requested for a file that has
     never existed and the day a second group of line-ups lands it is already
     right. */
  check("and the book with no careers asks for no file",
    ev(app, 'albumSpellsFile("finals")') === null, ev(app, 'albumSpellsFile("finals")'));
  /* AND IT IS NOT IN THE BOOT LOOP, which is the whole cost argument. loadPool
     fetches every row in POOLS in parallel at start-up, and 1.89MB of club
     histories have no business on that wire while somebody reads a menu. */
  const flat = src.split("\n").join("");
  check("nothing fetches a career file at boot",
    !/function loadPool\(id\)\{[\s\S]{0,600}spells/.test(flat),
    "the careers went into loadPool");
  /* ASKED FOR ON THE BOOK SCREEN AND AGAIN ON THE PAGE, which is two call sites
     on purpose. The book screen is the one screen every route to a page goes
     through, so asking there buys the fetch the time it takes to choose a page.
     The page asks again because that is the retry point. */
  check("and it is asked for on the book screen and again on the page",
    (src.match(/albumWantSpells\(bid\);/g) || []).length === 2,
    (src.match(/albumWantSpells\([a-z]*\);/g) || []).length);
  /* NOR IS IT PRECACHED. sw.js installs 607 distinct files at 18,415,395 bytes,
     which is 17.56MB; fifteen more would take it to 19.45MB, a tenth again on
     every install, for a face most people will never open. That file is network
     first and caches every successful GET, so the book you actually collect is
     offline from the second time you open it. If the bargain is ever revisited,
     this is the line that says so. */
  check("and no career file is in the service worker install",
    fs.readFileSync(path.join(REPO, "sw.js"), "utf8").indexOf("spells.json") < 0,
    "spells went into the install without the size argument being re-made");

  console.log("\n--- and a book it cannot get is given up on rather than promised forever ---");
  /* THE OFFLINE PATH IS NOT A 404 AND MUST NOT BE TREATED AS ONE. sw.js falls
     back to caches.match("index.html") for anything it cannot serve, and
     index.html is precached, so an uncached spells.json requested offline comes
     back as a 200 carrying an HTML document: r.ok is true, r.json() rejects, and
     the loader lands in its catch. That is a connection problem rather than a
     missing file, so it is counted instead of believed. Two consecutive misses
     and the book is dropped for the session, which is what stops a walk through
     thirty-two pages with no signal firing thirty-two doomed requests. */
  run(app, "for(const k in SPELLS) delete SPELLS[k]; " +
    "for(const k in SPELLS_ON) delete SPELLS_ON[k]; " +
    "for(const k in SPELLS_MISS) delete SPELLS_MISS[k];");
  run(app, 'openAlbum("wc2006", "Italy");'); await tick(90);
  check("one failure is a bad moment and the book still says the clubs are coming",
    ev(app, "SPELLS_MISS.wc2006") === 1 && ev(app, 'albumSpellsState("wc2006")') === 1,
    ev(app, "SPELLS_MISS.wc2006") + " / " + ev(app, 'albumSpellsState("wc2006")'));
  run(app, 'openAlbum("wc2006", "Brazil");'); await tick(90);
  check("two is a book that is not coming, and it stops claiming otherwise",
    ev(app, "SPELLS.wc2006") === null && ev(app, 'albumSpellsState("wc2006")') === 0,
    JSON.stringify(ev(app, "SPELLS.wc2006")) + " / " + ev(app, 'albumSpellsState("wc2006")'));
  run(app, "__FETCHES = 0; __RF = fetch; fetch = u => { __FETCHES++; return __RF(u); };");
  run(app, 'openAlbum("wc2006", "France"); openAlbum("wc2006", "Spain"); openAlbum("wc2006");');
  await tick(90);
  check("and three more pages of it ask for nothing at all",
    ev(app, "__FETCHES") === 0, ev(app, "__FETCHES"));
  run(app, "fetch = __RF;");
  /* A 404 IS DIFFERENT AND IS PERMANENT STRAIGHT AWAY, because a response that
     is not ok is a file that is not there rather than a connection that is not
     working, and asking twice for a file that has been deleted is asking twice
     for nothing. */
  check("a response that is not ok is permanent on the first answer",
    /r\.ok \? r\.json\(\) : null/.test(src) && /if\(!b\)\{ SPELLS\[book\] = null; return; \}/.test(src),
    "a missing file is being retried like a dropped connection");

  console.log("\n--- a card you own turns over, and one you do not does not ---");
  clean();
  run(app, "for(const k in SPELLS) delete SPELLS[k]; " +
    "for(const k in SPELLS_ON) delete SPELLS_ON[k]; " +
    "for(const k in SPELLS_MISS) delete SPELLS_MISS[k];");
  run(app, 'openAlbum("wc2006", "Italy");'); await tick(60);
  check("a page of gaps offers nothing to turn over",
    (stage(app).match(/albumTurn\(/g) || []).length === 0,
    (stage(app).match(/albumTurn\(/g) || []).length);
  check("and says nothing about turning one",
    !/turns over/.test(stage(app)), "it invited a tap on a card nobody has");
  run(app, '(() => { for(const m of albumMen("wc2006", "Italy")) ' +
    'albumStick(albumId("wc2006", "Italy", m)); mineSave(); })(); render();'); await tick(60);
  check("a page you have finished offers all twenty-three",
    (stage(app).match(/albumTurn\(/g) || []).length === 23,
    (stage(app).match(/albumTurn\(/g) || []).length);
  /* ONE HINT LINE AND NOT TWO. The page already carries a sentence about the
     bench and a sentence about swapping, and a third italic line stacked under
     them in the same type at the same width is a page giving instructions
     instead of a page saying something. */
  check("and the invitation is a clause in the line that was already there",
    (stage(app).match(/h2hintline/g) || []).length === 1 &&
    /Tap one you have and it turns over\./.test(stage(app)),
    (stage(app).match(/h2hintline/g) || []).length + " hint lines");
  /* THE HANDLER IS ON THE SLOT AND NEVER ON THE CARD. packRevealSetHTML builds
     the same card through the same builder inside a sheet where a tap already
     means skip, so a handler at .alst level would exist on that one too. */
  check("the tap is on the slot rather than on the sticker",
    !/class="alst[^"]*"[^>]*onclick/.test(stage(app)) &&
    /<button class="alslot alspick" onclick="albumTurn\(/.test(stage(app)),
    "the handler moved onto the card");
  /* AND IT IS NOT WEARING want. That class means a man you have not got: it is
     on the gap you can afford, on the swap pile and on Your XI. A card you
     already have is the opposite of that, so it gets one declaration of its
     own rather than a name that would then be false wherever it appears. */
  check("and a card you already have is not labelled as one you want",
    /\.alslot\.alspick\{cursor:pointer\}/.test(src) &&
    (stage(app).match(/alslot want/g) || []).length === 0,
    (stage(app).match(/class="alslot[^"]*"/g) || []).slice(0, 2).join(" | "));

  console.log("\n--- what is behind it ---");
  const itid = ev(app, '(() => { const m = albumMen("wc2006", "Italy").find(x => x.no === 10); ' +
    'return albumId("wc2006", "Italy", m); })()');
  run(app, "albumTurn(" + JSON.stringify(itid) + ");"); await tick(60);
  check("turning one puts a card in your hand",
    (stage(app).match(/class="alturn"/g) || []).length === 1 &&
    (stage(app).match(/class="albk"/g) || []).length === 1,
    (stage(app).match(/class="alturn"/g) || []).length);
  /* THE SHEET NEVER CHANGES AND THE THING ON TOP OF IT IS COUNTED SEPARATELY.
     The raised card is a second real drawing of the front, because the turn
     starts on the front and rotates away from it, so the front has to be there
     to rotate. Holding the old whole-stage count at twenty-three would have
     meant drawing the slot it came out of as a hole, which is a lovely idea
     nobody can see behind a full-screen dim. */
  check("the page underneath is still exactly twenty-three slots",
    (sheet(app).match(/class="alst/g) || []).length === 23,
    (sheet(app).match(/class="alst/g) || []).length);
  check("and the card in your hand is one more front, lying on top of it",
    (offsheet(app).match(/class="alst/g) || []).length === 1,
    (offsheet(app).match(/class="alst/g) || []).length);
  check("nothing the turn brings with it opens with those four letters",
    (stage(app).match(/class="alst[a-z]/g) || []).length === 0,
    (stage(app).match(/class="alst[a-z-]+/g) || []).slice(0, 3).join(" | "));
  const back = () => (stage(app).match(/<div class="albk">[\s\S]*?<div class="alturn-t"/) || [""])[0];
  /* THE WHOLE NAME, which is the one thing the back has that the front cannot:
     full is on all 10,157 men in the app and has never once reached a screen,
     because a shirt carries a surname. */
  check("the back gives him his whole name", /<b>Francesco Totti<\/b>/.test(back()),
    (back().match(/<b>[^<]*<\/b>/) || ["no name"])[0]);
  check("and the front is still only the surname",
    /class="alsn">Totti</.test(stage(app)), "the front grew a first name");
  check("with the number, the position and the side on one line under it",
    /<s>10 \u00b7 AM \u00b7 ITA<\/s>/.test(back()),
    (back().match(/<s>[^<]*<\/s>/) || ["no line"])[0]);
  /* club, caps and dob are on every one of the 9,717 men in the fifteen squad
     books and not one of the three is referenced anywhere else in index.html
     today, so this is the first screen any of them has reached. */
  check("and the four facts the squad file has always carried",
    /<i>Born<\/i><span>27 Sep 1976 \u00b7 29 that summer<\/span>/.test(back()) &&
    /<i>Club<\/i><span>Roma<\/span>/.test(back()) &&
    /<i>Caps<\/i><span>51<\/span>/.test(back()) &&
    /<i>2006<\/i><span>7 games \u00b7 1 goal<\/span>/.test(back()),
    (back().match(/<i>[^<]*<\/i><span>[^<]*<\/span>/g) || []).join(" | "));
  /* 2006 IS ONE OF THE SIX BOOKS WITH NO CAREER GOALS COLUMN AT ALL, so the caps
     row here is a bare number and would carry goals in one of the eight that
     have them. The plan says six books; on disk it is six with none and a
     seventh, wc2010, carrying six men out of 736. */
  check("and a book with no career goals column prints caps on their own",
    back().indexOf("<i>Caps</i><span>51 \u00b7") < 0, "2006 grew a goals column");
  /* THE CARD YOU JUST PAID THREE DOUBLES FOR STAYS GOLD WHEN YOU PICK IT UP. lit
     is the light albumSwap puts on him, and a card that is gold in the sheet and
     plain in your hand is the app forgetting what it told you a moment ago. */
  run(app, "ALBUM_VIEW.lit = " + JSON.stringify(itid) + "; render();"); await tick(60);
  check("a man you have just been given is still lit in your hand",
    /class="alturn-a"><div class="alst fresh"/.test(stage(app)),
    (stage(app).match(/alturn-a"><div class="alst[^"]*"/) || ["no card"])[0]);
  run(app, "ALBUM_VIEW.lit = null; render();"); await tick(60);
  /* 2,142 men carry capg:0 and 152 carry caps:0, so every row tests for the
     field being there rather than for it being true. A truthiness test loses a
     row those men are entitled to. */
  check("a real zero is printed rather than treated as a gap",
    ev(app, 'albumBackHTML("wc2006", "Italy", {n:"X", full:"X", no:99, pos:"GK", ' +
      'club:"Somewhere", caps:0, capg:0, app:0})')
      .indexOf("<i>Caps</i><span>0 \u00b7 0 goals</span>") > -1,
    ev(app, 'albumBackHTML("wc2006", "Italy", {n:"X", full:"X", no:99, pos:"GK", ' +
      'club:"Somewhere", caps:0, capg:0, app:0})'));
  /* g is on 1,359 of the 9,717 and that is not a hole in the harvest, it is the
     truth about footballers, so appearances without goals is no goals and not a
     missing row. A man with neither loses the row, which is the plan's rule. */
  check("appearances without goals reads as no goals",
    ev(app, 'albumBackHTML("wc2006", "Italy", {n:"X", no:99, pos:"CB", app:3})')
      .indexOf("3 games \u00b7 no goals") > -1,
    ev(app, 'albumBackHTML("wc2006", "Italy", {n:"X", no:99, pos:"CB", app:3})'));
  check("and a man with neither loses the row rather than being given a nought",
    ev(app, 'albumBackHTML("wc2006", "Italy", {n:"X", no:99, pos:"CB"})')
      .indexOf("<i>2006</i>") < 0,
    ev(app, 'albumBackHTML("wc2006", "Italy", {n:"X", no:99, pos:"CB"})'));

  console.log("\n--- the career, which is the row the plan wants most ---");
  run(app, 'SPELLS.wc2006 = albumSpellsIndex(' +
    JSON.stringify(R("assets/wc2006/spells.json")) + '); render();'); await tick(60);
  check("Totti's career comes off the file rather than out of a builder",
    /<span>AS Roma<\/span>/.test(back()) && /<u>1993\u2013/.test(back()),
    back().slice(back().indexOf("albk-l"), back().indexOf("albk-l") + 220));
  /* the six slugs a spell row can carry are the six the quiz drawer already has
     an accent for, so the dot is that accent rather than a second palette, and
     it stays right the day somebody repaints the drawer. */
  check("and a league on a spell wears the quiz drawer's own colour",
    back().indexOf('--lgc:' + ev(app, "QUIZZES.seriea.ac")) > -1,
    (back().match(/--lgc:[^"]*/g) || []).join(" "));
  /* 21,012 of the 40,181 spell rows are clubs outside the six decks, so an
     uncoloured dot is the commoner case rather than the broken one, and it still
     has to be a dot: a row with no bullet in a list where every other row has one
     reads as a rendering failure. */
  const buffon = () => ev(app, 'albumBackHTML("wc2006", "Italy", ' +
    'albumMen("wc2006", "Italy").find(m => m.no === 1))');
  check("and a club outside the six keeps its dot and loses only the colour",
    /<em><\/em><u>2018\u20132019<\/u><span>Paris Saint-Germain<\/span>/.test(buffon()),
    (buffon().match(/<em[^>]*><\/em><u>[^<]*<\/u><span>[^<]*/g) || []).join(" | "));
  /* 3,116 rows of 40,181 have no end year, which is not missing data, it is a
     man who had not left when the article was written, so the dash is left
     hanging. A spell inside one year prints that year once, which happens a
     great deal on loan. */
  check("an unfinished spell says so rather than inventing an end",
    ev(app, 'albumYears({c:"x", f:2011})') === "2011\u2013" &&
    ev(app, 'albumYears({c:"x", f:2005, t:2005})') === "2005",
    ev(app, 'albumYears({c:"x", f:2011})') + " / " + ev(app, 'albumYears({c:"x", f:2005, t:2005})'));
  check("and the file agrees, on the two men in this book who have one",
    /<u>2018\u2013<\/u><span>FC Calcio Acri<\/span>/.test(
      ev(app, 'albumBackHTML("wc2006", "Costa Rica", ' +
        'albumMen("wc2006", "Costa Rica").find(m => m.no === 5))')) &&
    /<u>2005<\/u><span>LA Galaxy<\/span>/.test(
      ev(app, 'albumBackHTML("wc2006", "Costa Rica", ' +
        'albumMen("wc2006", "Costa Rica").find(m => m.no === 4))')),
    "the open and the one-season spells are not printed as the file has them");
  /* THREE ROWS IN 40,181 CARRY A FROM-YEAR OF 1: Roberto Carlos at Anzhi, once
     in each of the 1998, 2002 and 2006 books, and the same three are the only
     rows anywhere with an end before a beginning. A line reading 1 to 2012 makes
     a whole card look untrustworthy, so the year goes and the club keeps its
     line, in the place the file put it. */
  check("a year no footballer could have played in is dropped, and the club stays",
    ev(app, 'albumYears({c:"x", f:1, t:2012})') === "2012" &&
    ev(app, 'albumYears({c:"x", f:1999, t:1990})') === "1999\u2013" &&
    /<u>2012<\/u><span>FC Anzhi Makhachkala<\/span>/.test(
      ev(app, 'albumBackHTML("wc2006", "Brazil", ' +
        'albumMen("wc2006", "Brazil").find(m => m.no === 6))')),
    ev(app, 'albumYears({c:"x", f:1, t:2012})'));
  /* FOUR KEYS OUT OF 6,420 CARRY A SURNAME, which is the career harvest arriving
     independently at albumId's own rule for the three Euro 2020 shirts that two
     men each wore. Falling back to the plain key would hand Ramsdale's card
     Henderson's career, and there is no plain key for a shared shirt in any of
     the fifteen files, so the fallback could only ever be wrong. */
  run(app, "TEAMS.euro2020 = " + JSON.stringify(R("assets/euro2020/index.json")) + ";");
  run(app, 'SPELLS.euro2020 = albumSpellsIndex(' +
    JSON.stringify(R("assets/euro2020/spells.json")) + ');');
  const shirt13 = ev(app, 'albumMen("euro2020", "England").filter(m => m.no === 13).map(m => m.n)');
  check("two men in one shirt, which is what Euro 2020 did to three squads",
    shirt13.length === 2, shirt13.join(" "));
  const car13 = shirt13.map(n => ev(app, 'albumBackHTML("euro2020", "England", ' +
    'albumMen("euro2020", "England").find(m => m.n === ' + JSON.stringify(n) + '))'));
  check("and each of them gets his own career rather than the other's",
    car13[0] !== car13[1] && car13[0].indexOf("albk-l") > -1 && car13[1].indexOf("albk-l") > -1 &&
    car13.filter(c => c.indexOf("Arsenal") > -1).length === 1,
    "one shirt, one career");
  check("and a shared shirt with no name to go on gets nothing, not the other man's",
    ev(app, 'albumSpells("euro2020", "England", {n:"", no:13})') === null,
    JSON.stringify(ev(app, 'albumSpells("euro2020", "England", {n:"", no:13})')));
  /* BOTH ENDS OF THE KEY GO THROUGH albumTag, which the album's own ids have
     done since the day they were written. The join works on the raw side name
     today, but it works by the index and the harvest happening to agree on
     spelling, and the first re-harvest that writes one of them differently would
     drop a squad's careers with nothing on any screen to say why. */
  check("the join is tagged at both ends rather than trusting two spellings to match",
    !!ev(app, 'SPELLS.euro2020["england/13/henderson"]') &&
    !ev(app, 'SPELLS.euro2020["England/13/Henderson"]'),
    Object.keys(ev(app, "SPELLS.euro2020")).slice(0, 2).join(" | "));

  console.log("\n--- the two ways of having no career are different sentences ---");
  /* A MAN WITH NOTHING AND A FILE THAT HAS NOT LANDED look identical from inside
     the builder and must not look identical on the card. Counted off the fifteen
     squad books: 6,420 men get a career, 1,528 have a league and no career, and
     1,769 have neither, which sums to 9,717. */
  const nowt = '{n:"X", full:"X Y", no:99, pos:"CB", club:"C", caps:2, dob:"1980-01-01"}';
  run(app, "delete SPELLS.wc2006;");
  check("before the file lands it says it has not looked yet",
    ev(app, 'albumSpellsState("wc2006")') === 1 &&
    ev(app, 'albumBackHTML("wc2006", "Italy", ' + nowt + ')')
      .indexOf('<div class="albk-w">Clubs not here yet.</div>') > -1,
    ev(app, 'albumBackHTML("wc2006", "Italy", ' + nowt + ')'));
  run(app, 'SPELLS.wc2006 = albumSpellsIndex(' +
    JSON.stringify(R("assets/wc2006/spells.json")) + ');');
  check("and once it has, it says it looked and there was nothing",
    ev(app, 'albumSpellsState("wc2006")') === 2 &&
    ev(app, 'albumBackHTML("wc2006", "Italy", ' + nowt + ')')
      .indexOf('<div class="albk-w">No club career on file.</div>') > -1,
    ev(app, 'albumBackHTML("wc2006", "Italy", ' + nowt + ')'));
  check("which is true of a real man in this book and not just a made-up one",
    ev(app, 'albumBackHTML("wc2006", "Costa Rica", ' +
      'albumMen("wc2006", "Costa Rica").find(m => m.no === 18))')
      .indexOf("No club career on file.") > -1,
    "the 1,769 men with neither got silence instead of a sentence");
  /* ALBUM-PLAN's fifth row is the leagues, and it is drawn for the 1,528 men in
     the middle and nowhere else: printed under a career it would repeat in words
     what the coloured dots beside the clubs have already said, and printed
     instead of one it is the only thing on the card that is about football
     rather than about paperwork. */
  const solis = ev(app, 'albumBackHTML("wc2006", "Costa Rica", ' +
    'albumMen("wc2006", "Costa Rica").find(m => m.no === 8))');
  check("a man with no career falls back to the leagues he played in",
    /albk-t">Leagues<\/div><ul class="albk-l"><li><em style="--lgc:[^"]*"><\/em><span>Premier League<\/span>/
      .test(solis), solis.slice(solis.indexOf("albk-c")));
  check("and a man with a career is never given both",
    buffon().indexOf('albk-t">Leagues') < 0 && buffon().indexOf('albk-t">Clubs') > -1,
    "the card said it twice");

  console.log("\n--- a file that lands under a card somebody is holding ---");
  /* THE ONE-LINE VERSION OF THIS IS render(), and render() rebuilds the stage out
     of strings, which rebuilds the raised card as well: alturnover starts again
     from zero and a card halfway through turning snaps back and turns a second
     time. So the arrival writes the career straight into the block already on the
     screen. The harness's querySelectorAll always returns nothing, so the nodes
     are stood in for here; what is under test is the part that is ours, which is
     which nodes it agrees to touch and what it writes into them. */
  check("the arrival paints rather than re-rendering the page under your thumb",
    /albumSpellPaint\(book\);/.test(src) &&
    !/function albumWantSpells\(book\)\{[\s\S]*?\n\}/.exec(src)[0].match(/render\(\)/),
    "the fetch callback rebuilds the stage");
  run(app, 'delete SPELLS.wc2006; __PAINT = [' +
    '{__bk:"wc2006", __sp:' + JSON.stringify(itid) + ', innerHTML:"", ' +
      'getAttribute(k){ return k === "data-bk" ? this.__bk : this.__sp; }}, ' +
    '{__bk:"euro2020", __sp:"euro2020:england/13/henderson", innerHTML:"", ' +
      'getAttribute(k){ return k === "data-bk" ? this.__bk : this.__sp; }}]; ' +
    '__QSA = document.querySelectorAll; document.querySelectorAll = () => __PAINT;');
  run(app, 'SPELLS.wc2006 = albumSpellsIndex(' +
    JSON.stringify(R("assets/wc2006/spells.json")) + '); albumSpellPaint("wc2006");');
  check("the card on the table gets its clubs written into it",
    /albk-t">Clubs<\/div><ul class="albk-l">/.test(ev(app, "__PAINT[0].innerHTML")) &&
    ev(app, "__PAINT[0].innerHTML").indexOf("AS Roma") > -1,
    ev(app, "__PAINT[0].innerHTML").slice(0, 160));
  /* AND IT ASKS WHICH BOOK THE NODE CAME FROM, which is not paranoia: a fetch for
     one book can perfectly well land after somebody has walked to another book's
     page, and a paint that matched only on the shape of the block would write one
     book's careers into another book's card. */
  check("and a card from another book is left exactly as it was",
    ev(app, "__PAINT[1].innerHTML") === "", ev(app, "__PAINT[1].innerHTML"));
  run(app, "document.querySelectorAll = __QSA;");

  console.log("\n--- the thin back, and the book that has no back at all ---");
  /* 440 MEN IN ONE BOOK OF SIXTEEN carry a name, a full name, a number, a
     position and a captain's flag, and absolutely nothing else. Counted across
     all 440: no club, no caps, no date of birth, no appearances, no leagues, and
     no spells.json beside the pool. And full is byte-identical to n for 440 of
     440 of them, which is what kills the obvious way of making those cards turn
     anyway: the full name is the one field that has never reached a screen, and
     on those men it is the surname already standing up the front of the card. */
  run(app, "TEAMS.finals = " + JSON.stringify(R("assets/finals/index.json")) + ";");
  const fmen = ev(app, '(() => { const out = []; for(const s of albumSides("finals")) ' +
    'for(const m of albumMen("finals", s)) out.push([s, m]); return out; })()');
  check("the finals book is 440 men", fmen.length === 440, fmen.length);
  check("and the whole name on every one of them is the surname the front prints",
    fmen.every(r => r[1].full === r[1].n), fmen.filter(r => r[1].full !== r[1].n).length + " differ");
  check("and none of them carries a second fact to put on a back",
    fmen.every(r => !r[1].club && r[1].caps == null && !r[1].dob && r[1].app == null &&
      !(r[1].lg && r[1].lg.length)), "somebody in there has a career after all");
  /* SO THE RULE ASKS FOR TWO FACTS AND NOT ONE. A single field is too easy: the
     day that harvest gains a date of birth, all 440 would start turning over to a
     back carrying one row and a header that repeats the front, which is the exact
     card this is refusing to draw. */
  check("one fact is not a card",
    ev(app, 'albumBackful("wc2006", "Italy", {n:"X", no:99, pos:"CB", dob:"1970-01-01"})') === false,
    "a date of birth on its own was enough");
  check("two of them is",
    ev(app, 'albumBackful("wc2006", "Italy", {n:"X", no:99, pos:"CB", dob:"1970-01-01", caps:3})') === true,
    "too strict");
  check("and so is a career, whatever else is missing",
    ev(app, 'albumBackful("wc2006", "Italy", albumMen("wc2006", "Italy")[0])') === true, "no");
  check("every man in the fifteen squad books has a back",
    ev(app, 'albumSides("wc2006").every(s => albumMen("wc2006", s)' +
      '.every(m => albumBackful("wc2006", s, m)))'), "a squad man came up empty");
  check("and not one of the 440 does",
    ev(app, 'albumSides("finals").every(s => !albumMen("finals", s)' +
      '.some(m => albumBackful("finals", s, m)))'), "somebody in the finals book has a back");
  const fpage = nm => { const sd = ev(app, 'albumSides("finals").find(s => s.indexOf(' +
      JSON.stringify(nm) + ') === 0)');
    run(app, '(() => { for(const m of albumMen("finals", ' + JSON.stringify(sd) + ')) ' +
      'albumStick(albumId("finals", ' + JSON.stringify(sd) + ', m)); mineSave(); })();');
    run(app, 'openAlbum("finals", ' + JSON.stringify(sd) + ');'); };
  fpage("Brazil \u00b7 World Cup final 1970"); await tick(60);
  check("so a finished page of them turns nothing over",
    (stage(app).match(/albumTurn\(/g) || []).length === 0,
    (stage(app).match(/albumTurn\(/g) || []).length);
  /* AND THE PAGE SAYS WHY, once, rather than leaving eleven cards that ignore a
     tap to read as eleven cards that are broken. The scoreline is the one real
     fact those pages have and it belongs here rather than on eleven identical
     backs, because it is a fact about the side and not about any of the men. */
  check("and the page says so, with the one real fact it has",
    /The final: Brazil 4-1 Italy\. There is nothing else on file for these eleven/
      .test(stage(app)),
    (stage(app).match(/h2hintline[^>]*>[^<]*/) || ["no hint"])[0]);
  check("and it is still one line rather than a second one stacked under the first",
    (stage(app).match(/h2hintline/g) || []).length === 1,
    (stage(app).match(/h2hintline/g) || []).length);
  /* FIFTEEN OF THE FORTY SIDES IN THAT BOOK ARE CLUBS RATHER THAN COUNTRIES,
     which is why nothing in that sentence says country and why the scoreline is
     read off the side rather than assembled out of a nation and a year. */
  fpage("AC Milan"); await tick(60);
  check("and a club side in the same book gets the same sentence and its own result",
    /The final: AC Milan 4-0 Steaua Bucharest\. There is nothing else on file/
      .test(stage(app)),
    (stage(app).match(/h2hintline[^>]*>[^<]*/) || ["no hint"])[0]);
  /* xiVs IS A FULL RESULT ON A FINALS SIDE AND A BARE OPPONENT NAME ON A SQUAD
     SIDE, so the test is the shape of the string rather than the name of the
     book. Counted: 40 of the 40 finals sides carry a digit in it and 0 of the 408
     squad sides do, which is why "France" can never turn up under a label reading
     The final. */
  check("the scoreline is found by its shape and not by the name of the book",
    ev(app, 'albumSides("finals").every(s => /\\d/.test(String(TEAMS.finals[s].xiVs || "")))') &&
    ev(app, 'albumSides("wc2006").every(s => !/\\d/.test(String(TEAMS.wc2006[s].xiVs || "")))'),
    "a squad side carries a digit in xiVs");
  run(app, 'openAlbum("wc2006", "Italy");'); await tick(60);
  check("and a squad page is never told it has nothing to turn",
    !/There is nothing else on file/.test(stage(app)) &&
    /Tap one you have and it turns over\./.test(stage(app)), "the wrong hint");
  run(app, "delete TEAMS.finals;");

  console.log("\n--- it is the coin's trick, and the book forgets it straight away ---");
  /* THE COIN IS THE ONLY 3D IN THE FILE AND THIS IS THE SECOND. One substitution:
     rotateY where the coin takes rotateX, because a trading card turns about its
     long axis and a coin turns about its short one. */
  check("one wrapper owns the perspective and the element inside it owns the turn",
    /\.alturn-c\{[^}]*perspective:900px\}/.test(src) &&
    /\.alturn-s\{[^}]*transform-style:preserve-3d/.test(src) &&
    !/\.alturn-c\{[^}]*transform-style/.test(src), "the two jobs are on one element");
  /* AND THE PERSPECTIVE IS NOT ON THE FULL-SCREEN WRAPPER, which is the whole
     reason the dim works. A perspective value other than none makes an element
     the containing block for its position:fixed descendants, exactly the way a
     transform does, so putting it on .alturn would resolve the dim against the
     card's own box: a card-sized dark rectangle hidden behind an opaque card, and
     a page that never dims at all. */
  check("and the sheet that catches the tap is not trapped inside the card",
    /\.alturn\{position:fixed;inset:0;z-index:18/.test(src) &&
    !/\.alturn\{[^}]*(perspective|transform|filter|contain)/.test(src) &&
    /\.alturn::before\{content:"";position:absolute;inset:0;/.test(src),
    (src.match(/\.alturn\{[^}]*\}/) || ["no rule"])[0]);
  /* the resting transform and the animated one are the same expression, which is
     the whole reason reduced motion needs no second code path, and it has to be a
     keyframe rather than a transition because every screen here is an innerHTML
     string and a transition has no start value on an element born this frame. */
  check("and its resting state is already the face it turns to",
    /\.alturn-s\{[^}]*transform:rotateY\(180deg\);animation:alturnover/.test(src) &&
    /@keyframes alturnover\{from\{transform:rotateY\(0deg\)\}to\{transform:rotateY\(180deg\)\}\}/.test(src),
    "the two states disagree");
  check("both faces are hidden from behind and the back is pre-turned",
    /\.alturn-a,\.alturn-b\{backface-visibility:hidden/.test(src) &&
    /\.alturn-b\{position:absolute;inset:0;transform:rotateY\(180deg\)\}/.test(src),
    "you can see through the card");
  /* .alst is container-type:inline-size and overflow:hidden, so the back cannot
     live inside it and the wrapper has to carry the card's own width or every cqw
     on the front resolves against a different box. */
  check("and the card's own box is untouched, because every cqw on it depends on that",
    /\.alturn-c\{position:relative;width:min\(66vw,264px\)/.test(src) &&
    /\.alst\{position:relative;container-type:inline-size/.test(src),
    "the size container moved");
  check("reduced motion drops the turn and keeps the card",
    /@media \(prefers-reduced-motion: reduce\)\{\n    \.alturn::before,\.alturn-s\{animation:none\}\n  \}/.test(src),
    "no reduced motion rule for the turn");
  /* ALBUM-PLAN: the book remembers nothing about which way up a card is. Every
     function that navigates builds ALBUM_VIEW from scratch, so this is true by
     construction rather than by anybody remembering to clear it. */
  run(app, "albumTurn(" + JSON.stringify(itid) + ");"); await tick(60);
  check("a card is up", /class="alturn"/.test(stage(app)), "nothing turned");
  run(app, "albumTurn(" + JSON.stringify(itid) + ");"); await tick(60);
  check("tapping it again puts it back, and the counts go back to where they were",
    !/class="alturn"/.test(stage(app)) &&
    (sheet(app).match(/class="alst/g) || []).length === 23 &&
    (offsheet(app).match(/class="alst/g) || []).length === 0,
    (sheet(app).match(/class="alst/g) || []).length + " in the sheet, " +
    (offsheet(app).match(/class="alst/g) || []).length + " on top of it");
  run(app, 'albumTurn(' + JSON.stringify(itid) + '); openAlbum("wc2006", "Brazil");'); await tick(60);
  check("and walking to another page puts it down without being asked",
    !/class="alturn"/.test(stage(app)) && !ev(app, "!!ALBUM_VIEW.turn"), "still in hand");
  /* NOR CAN IT COLLIDE WITH THE REVEAL. That sheet is built on document.body,
     takes every tap as a skip, and draws its cards through the same builder, so
     the only thing keeping the two apart is that the turn is bound to a slot the
     reveal never builds. Its z-index is 19 against the turn's 18, so even if some
     later screen managed both, the sequence that is mid-count wins. */
  run(app, 'ALBUM_VIEW = {book:"wc2006", side:"Italy", turn:' + JSON.stringify(itid) + '};');
  const p9 = ev(app, 'packRevealSetHTML({book:"wc2006", side:"Italy", ' +
    'm: albumMen("wc2006","Italy")[0], isNew:true, shut:false}, 1)');
  check("the reveal's own card offers nothing to turn",
    p9.indexOf("albumTurn") < 0 && p9.indexOf("alturn") < 0 && p9.indexOf("albk") < 0,
    p9.slice(0, 160));
  check("and its class string is still exactly what the pack screen gives it",
    /^class="alst( dupe)?( foil)?( fresh| shut)?"$/.test((p9.match(/class="alst[^"]*"/g) || [""])[0]),
    (p9.match(/class="alst[^"]*"/g) || [""])[0]);
  check("and the sheet that is mid-sequence stays on top of a card in the hand",
    /\.pkrv\{position:fixed;inset:0;z-index:19/.test(src) &&
    /\.alturn\{position:fixed;inset:0;z-index:18/.test(src), "the turn got above the reveal");

  console.log("\n" + (fails ? fails + " FAILED" : "ALL PASS"));
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
