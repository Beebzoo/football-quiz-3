/* Nobody reads the answer off their own phone before the steal.

     node _tests/peek-test.js

   Three phones in one room. The point of a steal is that the table does not
   know the answer yet, and the multiplayer build was painting it onto every
   phone the moment the player on the hook revealed it. By the time the STEAL
   IT button appeared, everybody had already read it.

   So this walks a real question through a three-phone room and checks the
   answer text against what each phone is actually showing, at every stage:
   the reveal, the steal offer, the stolen attempt, and the end.

   Reuses the stub DOM and the fake realtime bus from mp-test.js. */
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
const stage = c => (c.__els["stage"] ? c.__els["stage"].innerHTML : "");
const phase = c => ev(c, "S && S.phase");
let fails = 0;
const check = (n, c, x) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (c ? "" : "   <-- got: " + x)); if (!c) fails++; };

/* the answer as that phone would render it, so the comparison is against the
   real string and not a guess at it */
const answerOf = c => ev(c, "S && S.tier!=null && S.qi!=null ? esc(String(q().a)) : null");
const shows = (c, text) => text != null && stage(c).indexOf(text) > -1;
/* WHERE AN ANSWER IS ACTUALLY PRINTED, which is not the same question as whether
   the string appears somewhere on the screen. Searching the whole screen made
   this a test of the question bank: two of the easy questions contain their own
   answer, and on those draws every phone in the room "read" it because every
   phone can see the question. The hidden case is the same .atext element wearing
   hidden-ans, so the negative lookahead is what separates "the answer is here"
   from "a note saying it is not here yet". */
const ANSBLOCK = /<div class="(?:atext(?! hidden-ans)|anstext)[^"]*">[\s\S]*?<\/div>/g;
const reads = (c, text) => text != null &&
  (stage(c).match(ANSBLOCK) || []).some(b => b.indexOf(text) > -1);

(async () => {
  const host = makeInstance("host");     // Martijn, player 0
  const bram = makeInstance("bram");     // player 1, on his own phone
  const ale = makeInstance("ale");       // player 2, on his own phone
  await tick(300);

  run(host, 'S = freshState(["Martijn","Bram","Ale"], false, "classic", 0); hostRoom();');
  await tick(300);
  const code = ev(host, "MP.code");
  bram.localStorage.setItem("ball3-mp-name", "Bram");
  ale.localStorage.setItem("ball3-mp-name", "Ale");
  run(bram, `joinRoom("${code}")`);
  run(ale, `joinRoom("${code}")`);
  await tick(400);

  console.log("--- three phones in the room ---");
  check("Bram knows he is player 1", ev(bram, "myIdx()") === 1, ev(bram, "myIdx()"));
  check("Ale knows he is player 2", ev(ale, "myIdx()") === 2, ev(ale, "myIdx()"));

  /* put Bram on the hook rather than the host, so the host is a player who is
     NOT on the hook: the case that used to leak */
  run(host, "S.turn = 1; render();");
  await tick(300);
  run(bram, 'pickTier("easy")');
  await tick(300);
  check("it is Bram's question", ev(host, "S.turn") === 1 && phase(host) === "question", phase(host));

  const answer = answerOf(host);
  console.log(`      the answer is "${answer}"`);
  check("nobody sees the answer during the question",
    !reads(host, answer) && !reads(bram, answer) && !reads(ale, answer),
    [reads(host, answer) && "host", reads(bram, answer) && "bram", reads(ale, answer) && "ale"].filter(Boolean).join(","));

  console.log("\n--- Bram reveals it on his own phone ---");
  run(bram, "mpLockAnswer();");
  await tick(400);
  check("the room is judging Bram", phase(host) === "judge" && ev(host, "answerIdx()") === 1,
    phase(host) + "/" + ev(host, "answerIdx()"));
  check("Bram sees the answer", reads(bram, answer), "not on his screen");
  check("Ale does NOT see the answer", !reads(ale, answer), "Ale can read it");
  check("the host, who is also a player, does NOT see it", !reads(host, answer), "host can read it");
  check("Ale is told to wait rather than left blank", /Say nothing yet|calling it/.test(stage(ale)), stage(ale).slice(0, 80));
  check("Ale still sees the question itself", shows(ale, ev(host, "String(q().q)")), "question missing too");
  check("Bram is the only one offered the call", /Your call/.test(stage(bram)) && !/Your call/.test(stage(ale)),
    "wrong phone has the buttons");
  /* the host can still rescue a frozen phone, without being shown the answer */
  check("the host keeps an override", /They got it|They missed/.test(stage(host)), "no override on the host");

  console.log("\n--- Bram calls it wrong, and the steal opens ---");
  run(bram, "judge(false);");
  await tick(400);
  check("the question comes loose", phase(host) === "steal_offer", phase(host));
  check("Ale is offered the steal", /STEAL IT/.test(stage(ale)), stage(ale).slice(0, 80));
  check("and still has not seen the answer", !reads(ale, answer), "Ale read it before stealing");
  check("the host has not seen it either", !reads(host, answer), "host read it");

  console.log("\n--- Ale steals it ---");
  run(ale, "claimSteal(2);");
  await tick(400);
  check("Ale is on the hook", ev(host, "answerIdx()") === 2, ev(host, "answerIdx()"));
  run(ale, "mpLockAnswer();");
  await tick(400);
  check("now Ale sees the answer", reads(ale, answer), "not shown to the stealer");
  check("Bram does not see it during Ale's attempt", !reads(bram, answer), "Bram can read it");

  console.log("\n--- once it is dead, everyone gets it ---");
  run(ale, "judge(false);");
  await tick(400);
  console.log(`      phase is now ${phase(host)}`);
  if (phase(host) === "deadq") {
    check("the host sees the answer", reads(host, answer), "host still blind");
    check("Bram sees the answer", reads(bram, answer), "Bram still blind");
    check("Ale sees the answer", reads(ale, answer), "Ale still blind");
  } else {
    check("a failed steal ends the question", ["deadq", "pick"].includes(phase(host)), phase(host));
  }

  console.log("\n--- one phone on its own is untouched ---");
  const solo = makeInstance("solo");
  await tick(200);
  run(solo, 'S = freshState(["A","B"], false, "classic", 0); pickTier("easy"); reveal();');
  await tick(200);
  const soloAns = answerOf(solo);
  check("the reader still sees every answer", reads(solo, soloAns), "hidden with no room open");

  console.log(fails ? `\n${fails} FAILED` : "\nall good");
  process.exit(fails ? 1 : 0);
})();
