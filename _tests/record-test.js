/* The record book survives the app being shut.

     node _tests/record-test.js

   Closing BALL and opening it again should show the same Table you left. That
   is what localStorage is for, but three things could still take it away: a
   guest phone that never filed its own matches, a half-written value, and a
   bug writing an empty list over a full one.

   Every check here boots a SECOND instance against the same storage, which is
   what closing the app and starting it again actually looks like.

   Reuses the stub DOM from mp-test.js. */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const REPO = path.join(__dirname, "..");
const harness = fs.readFileSync(path.join(__dirname, "mp-test.js"), "utf8");
const head = harness.slice(0, harness.indexOf("/* ---------- drive an instance from outside ---------- */"));
eval(head.replace(/^const (fs|vm|path) = require\(.*\);$/gm, ""));

const ev = (ctx, e) => vm.runInContext("(" + e + ")", ctx);
const run = (ctx, s) => vm.runInContext(s, ctx);
const tick = (ms = 260) => new Promise(r => setTimeout(r, ms));
let fails = 0;
const check = (n, c, x) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (c ? "" : "   <-- got: " + x)); if (!c) fails++; };

/* close the app and open it again: a brand new instance, same storage */
function restart(old, label) {
  const next = makeInstance(label);
  for (const [k, v] of Object.entries(old.localStorage.__store)) next.localStorage.setItem(k, v);
  return next;
}

(async () => {
  const app = makeInstance("phone");
  await tick(300);

  console.log("--- a match played and the app closed ---");
  run(app, 'S = freshState(["Martijn","Bram"], false, "classic", 0); S.players[0].score = 12; S.players[1].score = 7; S.round = 4; endGame();');
  await tick(200);
  check("the match is on record", ev(app, "history().length") === 1, ev(app, "history().length"));

  const back = restart(app, "phone-again");
  await tick(300);
  check("still there after a restart", ev(back, "history().length") === 1, ev(back, "history().length"));
  check("with the scores it ended on",
    ev(back, "history()[0].players.map(p=>p.name+':'+p.score).join(',')") === "Martijn:12,Bram:7",
    ev(back, "history()[0].players.map(p=>p.name+':'+p.score).join(',')"));
  check("and the winner", ev(back, "history()[0].winner") === "Martijn", ev(back, "history()[0].winner"));
  check("The Table has standings to show", ev(back, "tally(null).length") === 2, ev(back, "tally(null).length"));

  console.log("\n--- a second night adds to it rather than replacing it ---");
  run(back, 'S = freshState(["Martijn","Ale"], false, "rush", 0); S.players[0].score = 3; S.players[1].score = 9; endGame();');
  await tick(200);
  const third = restart(back, "phone-3");
  await tick(300);
  check("two matches on record", ev(third, "history().length") === 2, ev(third, "history().length"));
  check("three names in the standings", ev(third, "tally(null).length") === 3, ev(third, "tally(null).length"));
  check("filtering by mode still works", ev(third, "tally('rush').length") === 2, ev(third, "tally('rush').length"));

  console.log("\n--- the ways it used to get lost ---");
  /* a bug handing putHistory an empty list */
  run(third, "putHistory([]);");
  check("an empty write is refused", ev(third, "history().length") === 2, ev(third, "history().length"));
  /* the main key half written, or cleared by something else */
  run(third, `localStorage.setItem(HIST_KEY, "{ this is not json");`);
  check("a corrupt store falls back to the backup", ev(third, "history().length") === 2, ev(third, "history().length"));
  const healed = restart(third, "phone-4");
  await tick(200);
  check("and the good copy is written back", ev(healed, "readHist(HIST_KEY) && readHist(HIST_KEY).length") === 2,
    ev(healed, "readHist(HIST_KEY) && readHist(HIST_KEY).length"));
  run(healed, `localStorage.removeItem(HIST_KEY);`);
  check("a missing store recovers too", ev(healed, "history().length") === 2, ev(healed, "history().length"));

  console.log("\n--- wiping it on purpose still works ---");
  run(healed, "clearHistory();");
  check("the book is empty", ev(healed, "history().length") === 0, ev(healed, "history().length"));
  const wiped = restart(healed, "phone-5");
  await tick(200);
  check("and stays empty after a restart", ev(wiped, "history().length") === 0, ev(wiped, "history().length"));

  console.log("\n--- a guest phone keeps its own copy ---");
  const host = makeInstance("host");
  const guest = makeInstance("guest");
  await tick(300);
  run(host, 'S = freshState(["Martijn","Bram"], false, "classic", 0); hostRoom();');
  await tick(300);
  guest.localStorage.setItem("ball3-mp-name", "Bram");
  run(guest, `joinRoom("${ev(host, "MP.code")}")`);
  await tick(400);
  check("the guest is in the room", ev(guest, "myIdx()") === 1, ev(guest, "myIdx()"));
  run(host, "S.players[0].score = 5; S.players[1].score = 21; endGame();");
  await tick(500);
  check("the host filed it", ev(host, "history().length") === 1, ev(host, "history().length"));
  check("and so did the guest, on its own phone", ev(guest, "history().length") === 1, ev(guest, "history().length"));
  check("with the same result", ev(guest, "history()[0].winner") === "Bram", ev(guest, "history()[0].winner"));
  /* the results state is re-sent on every repaint; it must not file twice */
  run(host, "render(); render();");
  await tick(400);
  check("a repeated broadcast does not file it twice", ev(guest, "history().length") === 1, ev(guest, "history().length"));
  const guestBack = restart(guest, "guest-again");
  await tick(300);
  check("and the guest still has it after closing the app", ev(guestBack, "history().length") === 1,
    ev(guestBack, "history().length"));

  console.log("\n--- the shared table ---");
  const crew = makeInstance("crew");
  await tick(300);
  check("no crew by default, so nothing is shared", ev(crew, "crewName()") === "", ev(crew, "crewName()"));
  run(crew, 'S = freshState(["Martijn","Bram"], false, "classic", 0); S.players[0].score = 4; endGame();');
  await tick(200);
  check("a filed match carries an id", !!ev(crew, "history()[0].id"), ev(crew, "history()[0].id"));
  check("the id is the one the match was given",
    ev(crew, "history()[0].id") === ev(crew, "S.mid"), ev(crew, "history()[0].id") + " vs " + ev(crew, "S.mid"));
  check("with no crew, The Table is just this phone",
    ev(crew, "books().length") === ev(crew, "history().length"), ev(crew, "books().length"));

  /* what a pull from the shared table looks like, without a network */
  run(crew, `CLOUD = [
    {id:"remote1", ts:1, mode:"rush", players:[{name:"Ale",score:9},{name:"Bram",score:2}], winner:"Ale", losers:[]},
    {id: history()[0].id, ts:2, mode:"classic", players:[{name:"Martijn",score:4},{name:"Bram",score:0}], winner:"Martijn", losers:[]}
  ];`);
  check("the shared book brings the others' matches in", ev(crew, "books().length") === 2, ev(crew, "books().length"));
  check("and does not double up the one this phone filed",
    ev(crew, "books().filter(m=>m.id===history()[0].id).length") === 1,
    ev(crew, "books().filter(m=>m.id===history()[0].id).length"));
  check("Ale appears in the standings without ever touching this phone",
    ev(crew, "tally(null).some(r=>r.name==='Ale')"), ev(crew, "tally(null).map(r=>r.name).join(',')"));
  check("matches played before any crew existed are kept",
    ev(crew, "(function(){ const h=history(); h.push({ts:3,mode:'duel',players:[{name:'Old',score:1}],winner:'Old',losers:[]}); putHistory(h); return books().some(m=>m.players[0].name==='Old'); })()"),
    "an unsynced match vanished");

  console.log("\n--- the regulars are already in the boxes ---");
  const names = makeInstance("names");
  await tick(300);
  check("it starts as Martijn, Bram and Ale",
    ev(names, "JSON.stringify(setupNames)") === '["Martijn","Bram","Ale"]', ev(names, "JSON.stringify(setupNames)"));
  /* three boxes is a BOARD thing: the pitch is two men and draws two, so the
     play axis has to be set as well as the count. */
  run(names, 'S = null; setupMode = "classic"; setupPlay = "board"; setupCount = 3; render();');
  await tick(60);
  const boxes = names.__els["stage"] ? names.__els["stage"].innerHTML : "";
  check("and the boxes come up filled in",
    ["Martijn", "Bram", "Ale"].every(n => boxes.includes('value="' + n + '"')),
    (boxes.match(/id="n\d" [^>]*value="[^"]*"/g) || []).join(" | "));

  /* a fourth at the table is typed once, not every Friday night */
  run(names, 'setupNames[0] = "Roberta"; rememberNames();');
  const later = restart(names, "names-again");
  await tick(300);
  check("a name typed over the top survives the app closing",
    ev(later, "JSON.stringify(loadNames())") === '["Roberta","Bram","Ale"]', ev(later, "JSON.stringify(loadNames())"));
  run(later, 'setupNames[0] = ""; rememberNames();');
  const cleared = restart(later, "names-cleared");
  await tick(300);
  check("and an emptied box falls back to the regular",
    ev(cleared, "JSON.stringify(loadNames())") === '["Martijn","Bram","Ale"]', ev(cleared, "JSON.stringify(loadNames())"));

  /* the boxes were reordered once Martijn and Bram became the usual two, and a
     saved name beats a default, so a phone still holding the old order has to
     be moved across or it would never see the change */
  run(cleared, 'localStorage.setItem("ball3-names", JSON.stringify(["Ale","Martijn","Bram"]));');
  const moved = restart(cleared, "names-old-order");
  await tick(300);
  check("a phone holding the old order is moved across",
    ev(moved, "JSON.stringify(loadNames())") === '["Martijn","Bram","Ale"]', ev(moved, "JSON.stringify(loadNames())"));
  run(moved, 'localStorage.setItem("ball3-names", JSON.stringify(["Ale","Sander","Bram"]));');
  const kept = restart(moved, "names-old-order-edited");
  await tick(300);
  check("but one with a name typed into it is left alone",
    ev(kept, "JSON.stringify(loadNames())") === '["Ale","Sander","Bram"]', ev(kept, "JSON.stringify(loadNames())"));

  console.log(fails ? `\n${fails} FAILED` : "\nall good");
  process.exit(fails ? 1 : 0);
})();
