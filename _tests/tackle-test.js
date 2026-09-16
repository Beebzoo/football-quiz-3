/* The tackle, driven rule by rule.
 *
 *     node _tests/tackle-test.js
 *
 * The tackle is the first rule in this mode that gives the DEFENDER something
 * to do, and almost all of it is invisible in the code: whether a card went to
 * the right man, whether a red actually takes him out of the shape, whether a
 * foul in the box becomes a penalty.
 *
 * Since the marks became a POSSESSION decision rather than a per-pass one,
 * most of what can go wrong is bookkeeping across passes: a mark that fires
 * twice, relief handed out every ball instead of once, the phone asking to
 * cross the table mid-possession, or last possession's men still ticked. Those
 * are what the middle of this file is about.
 *
 * It opens with h2NearestTo, because everything here stands on it: a card that
 * says "the left wing-back brought him down" is worth nothing if the app cannot
 * tell the left wing-back from the right one.
 */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const REPO = path.join(__dirname, "..");
const harness = fs.readFileSync(path.join(__dirname, "mp-test.js"), "utf8");
const head = harness.slice(0, harness.indexOf("/* ---------- drive an instance from outside ---------- */"));
eval(head.replace(/^const (fs|vm|path) = require\(.*\);$/gm, ""));

const stage = ctx => ctx.__els["stage"] ? ctx.__els["stage"].innerHTML : "";
const ev = (ctx, e) => vm.runInContext("(" + e + ")", ctx);
const run = (ctx, s) => vm.runInContext(s, ctx);
const tick = (ms = 170) => new Promise(r => setTimeout(r, ms));
let fails = 0;
const check = (n, c, x) => {
  console.log((c ? "  PASS  " : "  FAIL  ") + n + (c ? "" : "   <-- got: " + x));
  if (!c) fails++;
};

// squad indices, by the names Martijn uses for them
const GK = 0, LCB = 1, RCB = 2, LWB = 3, RWB = 4, SIX = 5, EIGHT = 6, TEN = 7, LW = 8, ST = 9, RW = 10;

(async () => {
  const app = makeInstance("tackle");
  await tick(340);
  const WC = JSON.parse(fs.readFileSync(path.join(REPO, "assets/wc2006/index.json"), "utf8"));
  run(app, "TEAMS.wc2006 = " + JSON.stringify(WC));

  const phase = () => ev(app, "S.phase");
  const H = k => ev(app, "S.h2h." + k);
  const tier = () => ev(app, "S.tier");

  const start = async () => {
    run(app, 'S = freshState(["Martijn","Bram"], false, "classic", 0, "pitch", false); h2Start(); ' +
             'h2PickTeam("Netherlands"); h2PickTeam("Italy"); S.h2h.tossed = true; render();');
    await tick(150);
  };
  /* park the ball on a man with the pitch live and the marks already settled,
     so a test can skip the handoff it is not about */
  const place = async (w, at, marks) => {
    run(app, `S.h2h.who=${w}; S.h2h.at=${at}; S.h2h.sel=null; S.h2h.caught=null; ` +
             `S.h2h.marks=${JSON.stringify(marks || [])}; S.h2h.markedAgainst=${w}; S.h2h.relief=true; ` +
             `S.h2h.shooting=false; S.h2h.pen=false; S.phase="h_pick"; render();`);
    await tick(140);
  };

  /* ---------------------------------------------------------------- */
  console.log("--- who picks up a ball lost out wide (h2NearestTo in 2D) ---");
  await start();
  run(app, "h2TackleOn = false;");
  const collects = i => ev(app, `h2NearestTo(${i}, 0, 1)`);
  check("a ball lost on the right and one lost on the left go to different men",
    collects(RW) !== collects(LW), "both went to " + collects(RW));
  check("lost on the right wing, their left wing-back steps out for it", collects(RW) === LWB, collects(RW));
  check("lost on the left wing, their right wing-back does", collects(LW) === RWB, collects(LW));
  check("lost on your own line, their striker is through", collects(GK) === ST, collects(GK));
  check("lost at their striker, a centre-back has to build from scratch",
    [LCB, RCB].indexOf(collects(ST)) !== -1, collects(ST));

  /* ---------------------------------------------------------------- */
  console.log("\n--- two marks, set once, standing for the possession ---");
  run(app, "h2TackleOn = true;");
  await start();
  run(app, "S.h2h.who = 0; h2KickOff();");
  await tick(160);
  check("the possession opens with the phone crossing the table", phase() === "h_hand", phase());
  check("and it is the defending man's card", H("hand.w") === 1, H("hand.w"));
  run(app, "h2HandGo()"); await tick(140);
  check("he gets the private screen", phase() === "h_mark", phase());
  /* ELEVEN, NOT TEN. The screen draws the attacker's shape on a pitch now, so
     every live man is on it including the one with the ball. He is drawn and
     disabled rather than left out: a mark on the man who already has it is a
     mark thrown away, but a hole where a man should be standing reads as a
     drawing bug rather than as a rule. */
  check("the attacker's whole eleven are on the pitch",
    (stage(app).match(/h2markman/g) || []).length === 11,
    (stage(app).match(/h2markman/g) || []).length);
  check("and the man on the ball is drawn but cannot be taken",
    !new RegExp('onclick="h2Mark\\(' + ev(app, "S.h2h.at") + '\\)"').test(stage(app)) &&
    /h2markman[^"]*"[^>]*disabled/.test(stage(app)), "he was offered, or he is missing");
  /* the position abbreviation went with the list: he is standing on it */
  check("and the shape is drawn rather than labelled",
    /h2markpitch/.test(stage(app)) && !/h2markbtn/.test(stage(app)),
    "the old grid is still there");
  run(app, `h2Mark(${SIX}); h2Mark(${ST});`); await tick(140);
  check("he can mark two", JSON.stringify(H("marks")) === JSON.stringify([SIX, ST]), JSON.stringify(H("marks")));
  run(app, `h2Mark(${TEN});`); await tick(140);
  check("and not a third", H("marks").length === 2, JSON.stringify(H("marks")));
  run(app, `h2Mark(${ST});`); await tick(120);
  check("tapping one again takes him off", H("marks").indexOf(ST) === -1, JSON.stringify(H("marks")));
  run(app, `h2Mark(${ST});`); await tick(120);
  run(app, "h2MarksDone(false)"); await tick(140);
  check("done hands the phone back", phase() === "h_hand" && H("hand.down") === true, phase());
  run(app, "h2HandGo()"); await tick(140);
  check("then the pitch", phase() === "h_pick", phase());
  check("and the pitch does not say who is marked",
    stage(app).indexOf("h2markring") === -1, "the marks leaked onto the pitch");

  /* ---------------------------------------------------------------- */
  console.log("\n--- the phone does NOT cross the table again mid-possession ---");
  run(app, `S.h2h.at = ${GK}; h2Select(${LCB}); h2Play();`); await tick(160);
  check("a pass to nobody marked is the attacker's question", phase() === "h_q", phase());
  run(app, "h2Reveal(); h2Judge(true)"); await tick(220);
  check("he keeps it and goes straight back to the pitch", phase() === "h_pick", phase());
  check("the marks are still standing", H("marks").length === 2, JSON.stringify(H("marks")));
  check("and they still belong to this possession", H("markedAgainst") === H("who"), H("markedAgainst"));

  console.log("\n--- relief is once a possession, not once a pass ---");
  await place(0, GK, [SIX, ST]);
  run(app, `h2Select(${TEN}); h2Play();`); await tick(160);
  const t1 = tier();
  check("the first pass that misses comes a tier cheaper", t1 === "hard", t1 + " (ladder says extreme)");
  check("and the relief is spent", H("relief") === false, H("relief"));
  run(app, "h2Reveal(); h2Judge(true)"); await tick(200);
  /* back to the keeper and the SAME pass, because it has to be one where
     relieved and full price differ: GK to the ten is extreme, relieved hard.
     Asking for a pass that is already at the bottom of the ladder makes this
     check unfailable, which is how it was first written. */
  run(app, `S.h2h.at = ${GK}; h2Select(${TEN}); h2Play();`); await tick(160);
  check("the next one pays full price", tier() === ev(app, `h2TierFor(${GK},${TEN})`), tier());

  console.log("\n--- a mark that lands is spent, and the other stands ---");
  await place(0, GK, [SIX, ST]);
  run(app, `h2Select(${SIX}); h2Play();`); await tick(160);
  check("into a marked man is the defender's question", phase() === "h_tackle", phase());
  check("at the tackle's own tier", tier() === ev(app, "H2_TACKLE_TIER"), tier());
  check("and it is the tackle, not the press", H("contest") === "tackle", H("contest"));
  run(app, "h2TackleReveal(); h2TackleJudge(false)"); await tick(220);
  check("he fouled him, so the pass goes through", H("at") === SIX, H("at"));
  check("that mark is spent", H("marks").indexOf(SIX) === -1, JSON.stringify(H("marks")));
  check("the other one is still on", H("marks").indexOf(ST) !== -1, JSON.stringify(H("marks")));
  check("and the phone stays on the table", phase() === "h_pick", phase());
  /* the ball is ON the six now, and you cannot pass a man to himself, so put it
     back before trying to run into the spent mark again */
  run(app, `S.h2h.at = ${GK}; render();`); await tick(120);
  run(app, `h2Select(${SIX}); h2Play();`); await tick(160);
  check("the spent mark does not fire twice", phase() === "h_q", phase());

  /* ---------------------------------------------------------------- */
  console.log("\n--- winning it, and where the ball ends up ---");
  await place(0, GK, [ST]);
  run(app, `h2Select(${ST}); h2Play(); h2TackleJudge(true);`); await tick(200);
  check("the ball changes hands", H("who") === 1, H("who"));
  check("collected where the pass was GOING, not where it came from",
    [LCB, RCB].indexOf(H("at")) !== -1, H("at"));
  check("and the new man is asked to set his own marks", phase() === "h_hand", phase());

  /* the press wins it where the ball WAS, which is the difference */
  await place(0, GK, []);
  run(app, `S.h2h.safe = 99; h2Select(${LCB}); h2Play();`); await tick(160);
  check("the press still fires on a short ball", H("contest") === "press", H("contest"));
  run(app, "h2TackleJudge(true)"); await tick(180);
  check("and takes it where the ball was, so their striker is through", H("at") === ST, H("at"));

  /* ---------------------------------------------------------------- */
  console.log("\n--- losing it is a foul, and the card goes to a man ---");
  /* cards survive a place(), so this starts from a clean book or it is testing
     the bookings the section above handed out */
  run(app, "S.h2h.cards = [{}, {}]; S.h2h.off = [[], []];");
  await place(0, SIX, [EIGHT]);
  run(app, `h2Select(${EIGHT}); h2Play(); h2TackleJudge(false);`); await tick(200);
  check("the attacker keeps the ball", H("who") === 0, H("who"));
  check("and the pass goes through untouched", H("at") === EIGHT, H("at"));
  check("somebody in the defending side is booked",
    ev(app, "JSON.stringify(S.h2h.cards[1])") !== "{}", ev(app, "JSON.stringify(S.h2h.cards[1])"));
  check("one man, not the whole team", ev(app, "Object.keys(S.h2h.cards[1]).length") === 1,
    ev(app, "JSON.stringify(S.h2h.cards[1])"));
  check("nobody is off for a first yellow", ev(app, "S.h2h.off[1].length") === 0, ev(app, "S.h2h.off[1].length"));

  console.log("\n--- through the back of the front three is a penalty ---");
  await start();
  run(app, "h2TackleOn = true;");
  await place(0, SIX, [ST]);
  run(app, `h2Select(${ST}); h2Play(); h2TackleJudge(false);`); await tick(220);
  check("it is a spot kick, not a free kick", H("pen") === true, H("pen"));
  check("the attacker is shooting", H("shooting") === true, H("shooting"));
  check("and it is priced to go in", tier() === ev(app, "H2_PEN_TAKER"), tier());
  run(app, "h2Reveal(); h2Judge(true);"); await tick(200);
  check("put away, and the pair of them pick corners", phase() === "h_aim", phase());
  check("and a penalty keeper does not get to hold it", ev(app, "h2Holds()") === false, ev(app, "h2Holds()"));

  /* ---------------------------------------------------------------- */
  console.log("\n--- a second yellow on the same man is a red ---");
  await start();
  run(app, "h2TackleOn = true; S.h2h.cards = [{}, {}]; S.h2h.off = [[], []];");
  const foul = async () => {
    await place(0, SIX, [EIGHT]);
    run(app, `h2Select(${EIGHT}); h2Play(); h2TackleJudge(false);`);
    await tick(200);
  };
  await foul();
  const man = +ev(app, "Object.keys(S.h2h.cards[1])[0]");
  await foul();
  check("the same man fouls again and goes", ev(app, "S.h2h.off[1].length") === 1, ev(app, "S.h2h.off[1].length"));
  check("and it is him", ev(app, "S.h2h.off[1][0]") === man, ev(app, "S.h2h.off[1][0]"));

  console.log("\n--- and a red card is a hole in the shape ---");
  run(app, `S.h2h.who = 1; S.h2h.at = ${GK}; S.h2h.markedAgainst = 1; S.h2h.marks = []; ` +
           `S.h2h.off[1] = [${TEN}]; S.phase = "h_pick"; render();`);
  await tick(160);
  check("nobody can pass to him", ev(app, `(h2Select(${TEN}), S.h2h.sel)`) === null, ev(app, "S.h2h.sel"));
  check("he cannot shoot either", ev(app, `h2CanShoot(${TEN})`) === false, ev(app, `h2CanShoot(${TEN})`));
  /* the ball has to be lost somewhere the ten WOULD have collected it, or the
     check passes on a technicality: the ten is never the nearest man to
     himself. Lost on the six, the ten is the closest at 16.8, but for the red */
  check("he is not collecting turnovers", ev(app, `h2NearestTo(${SIX}, 0, 1)`) !== TEN, ev(app, `h2NearestTo(${SIX}, 0, 1)`));
  check("and he is not drawn on the pitch",
    (stage(app).match(/class="h2man [^"]*"/g) || []).length === 21,
    (stage(app).match(/class="h2man [^"]*"/g) || []).length);
  run(app, `S.phase = "h_mark"; S.h2h.who = 0; S.h2h.off[0] = [${TEN}]; render();`);
  await tick(140);
  /* NINE TAPPABLE: eleven, less the man sent off, less the man on the ball.
     Counted by the handler rather than by the class, because all eleven slots
     are drawn now and two of them are simply not offers: the sent-off man is a
     dashed hole where he used to stand, and the man on the ball is his own
     shirt with the ball on his shoulder. */
  check("and he cannot be marked", (stage(app).match(/onclick="h2Mark\(/g) || []).length === 9,
    (stage(app).match(/onclick="h2Mark\(/g) || []).length);
  check("but his slot is still drawn, empty",
    /h2markman gone/.test(stage(app)), "the shape silently became a ten");
  run(app, "S.h2h.off = [[], []];");

  console.log("\n--- a keeper sent off is an outfield man in goal ---");
  run(app, `S.h2h.who = 0; S.h2h.at = ${ST}; S.h2h.off[1] = [${GK}]; S.h2h.pen = false; ` +
           `S.h2h.marks = []; S.h2h.markedAgainst = 0; S.phase = "h_pick"; render(); ` +
           `h2Shoot(); h2Reveal(); h2Judge(true);`);
  await tick(200);
  check("an outfield man in goal does not get to hold it either",
    phase() === "h_aim" && ev(app, "h2Holds()") === false, phase() + "/" + ev(app, "h2Holds()"));
  /* and when the outfielder DOES keep hold of one, the restart cannot go to
     the keeper, because there is no keeper: both restarts used to write
     H.at = 0 unconditionally and put the ball on a man who is not drawn. The
     duel's own coin is not what is under test here, so the outcome is given
     through the same door it always settles through. */
  run(app, "h2Aim('tl'); h2HandGo(); h2SaveJudge(true);"); await tick(2100);   // h2AfterStrike fires at 1.9s
  check("a save with the keeper off restarts on a man who is actually on the pitch",
    ev(app, "S.h2h.who") === 1 && ev(app, `S.h2h.at !== ${GK}`) && ev(app, "!h2IsOff(1, S.h2h.at)"),
    "who " + ev(app, "S.h2h.who") + " at " + ev(app, "S.h2h.at"));
  run(app, "S.h2h.off = [[], []];");

  /* ---------------------------------------------------------------- */
  console.log("\n--- sitting off, and turning the whole thing off ---");
  await start();
  run(app, "h2TackleOn = true; S.h2h.who = 0; h2KickOff();");
  await tick(160);
  run(app, "h2HandGo()"); await tick(140);
  run(app, "h2MarksDone(true)"); await tick(140);
  check("letting him play returns the phone the same way", phase() === "h_hand", phase());
  check("and that card says put it down", H("hand.down") === true, H("hand.down"));
  run(app, "h2HandGo()"); await tick(140);
  check("with nobody marked", H("marks").length === 0, JSON.stringify(H("marks")));
  run(app, `S.h2h.at = ${GK}; h2Select(${ST}); h2Play();`); await tick(160);
  check("and a pass costs exactly what the ladder says", tier() === "ball", tier());

  run(app, "h2TackleOn = false; S.h2h.who = 0; S.h2h.at = 0; S.h2h.markedAgainst = null; h2Next();");
  await tick(150);
  check("with tackles off a turn goes straight to the pitch", phase() === "h_pick", phase());

  /* ---------------------------------------------------------------- */
  console.log("\n--- and the secret stays secret (the things a review caught) ---");
  await start();
  run(app, "h2TackleOn = true;");

  /* the card must never be labelled from the drawn tier: the relief only
     exists when marks were set, so a cheaper label proves he marked, and a
     full-price one proves he did not and the rest of the possession is free */
  await place(0, GK, [SIX, ST]);
  run(app, `h2Select(${TEN}); h2Play();`); await tick(180);
  const withMarks = stage(app).match(/class="kick">([^<]*)</);
  const drawnTier = tier();
  await place(0, GK, []);
  run(app, `h2Select(${TEN}); h2Play();`); await tick(180);
  const noMarks = stage(app).match(/class="kick">([^<]*)</);
  check("the question really was made cheaper", drawnTier === "hard" && tier() === "extreme",
    drawnTier + " vs " + tier());
  check("but the card reads the same either way",
    withMarks && noMarks && withMarks[1] === noMarks[1],
    (withMarks ? withMarks[1] : "?") + "   |   " + (noMarks ? noMarks[1] : "?"));

  /* flipping the rule off and on must not leave last possession's men live */
  await place(0, GK, [SIX, ST]);
  run(app, "h2ToggleTackle();"); await tick(120);
  check("switching the rule clears the marks", H("marks").length === 0, JSON.stringify(H("marks")));
  check("and forgets whose possession they were", H("markedAgainst") === null, H("markedAgainst"));
  run(app, "h2ToggleTackle();"); await tick(120);
  run(app, `S.phase = "h_pick"; render(); h2Select(${SIX}); h2Play();`); await tick(180);
  check("so a stale mark cannot fire", phase() === "h_q", phase());

  /* a raking ball relieved to normal is still a raking ball */
  await place(0, GK, [SIX]);
  run(app, `S.h2h.safe = 0; h2Select(${TEN}); h2Play();`); await tick(170);
  run(app, "h2Reveal(); h2Judge(true)"); await tick(220);
  check("a relieved long ball does not feed the press streak", H("safe") === 0, H("safe"));

  /* the marks are never broadcast to the other phone */
  await place(0, GK, [SIX, ST]);
  check("and they never go on the wire",
    JSON.parse(ev(app, "JSON.stringify(mpStatePayload())")).h2h.marks.length === 0,
    ev(app, "JSON.stringify(mpStatePayload().h2h.marks)"));

  /* ---------------------------------------------------------------- */
  console.log("\n--- the challenge goes in, and holds ---");
  await place(0, SIX, [ST]);
  run(app, `h2Select(${ST}); h2Play();`); await tick(200);
  const s1 = stage(app);
  check("somebody goes to ground", /class="h2man [^"]*\bdown\b/.test(s1), "nobody is down");
  check("and he is the man who would be booked for it",
    ev(app, `h2Contest().by === h2Tackler(${ST})`), ev(app, "JSON.stringify(h2Contest())").slice(0, 60));
  check("he slides in on the first render", /\bslide\b/.test(s1), "no entry animation");
  check("he leaves a mark in the grass", s1.indexOf("h2skid") !== -1, "no skid");
  check("the contact is drawn", s1.indexOf("h2clash") !== -1, "no contact");
  check("the man he went through braces", /class="h2man [^"]*\bcaught\b/.test(s1), "nobody braced");
  check("everyone else gets out of the way", s1.indexOf("h2pitch") !== -1 && / chal"/.test(s1),
    "the pitch is not dimmed");

  /* the ball has to DIE on his boot, short of the man it was played to: that is
     the whole tension of the freeze */
  const bxy = s1.match(/class="h2ballwrap[^"]*" style="left:([\d.]+)%;top:([\d.]+)%/);
  const cxy = ev(app, "[h2Contest().bx, h2Contest().by2]");
  check("the ball dies at the contact, not on the passer's boot",
    bxy && Math.abs(+bxy[1] - cxy[0]) < 0.2 && Math.abs(+bxy[2] - cxy[1]) < 0.2,
    bxy ? bxy[1] + "," + bxy[2] + " vs " + cxy.map(n => n.toFixed(1)).join(",") : "no ball");

  /* THE FREEZE. Tapping reveal re-renders the pitch, and a class carrying an
     animation would play the whole challenge again at exactly the wrong
     moment. He must still be down, and must NOT be sliding. */
  run(app, "h2TackleReveal()"); await tick(180);
  const s2 = stage(app);
  check("revealing the answer holds the pose", /class="h2man [^"]*\bdown\b/.test(s2), "he got up");
  check("and does not replay the slide", !/\bslide\b/.test(s2), "the challenge started again");

  run(app, "h2TackleJudge(false)"); await tick(200);
  const s3 = stage(app);
  check("a foul carries him through it", /class="h2man [^"]*\bthru\b/.test(s3), "no follow through");
  check("and the man he took out goes over", /class="h2man [^"]*\bfelled\b/.test(s3), "nobody fell");

  console.log(fails ? "\n" + fails + " FAILED" : "\nall green");
  process.exit(fails ? 1 : 0);
})();
