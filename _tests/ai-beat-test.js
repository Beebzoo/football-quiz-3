/* HOW LONG THE COMPUTER TAKES, and whether the beat it armed is still the one
 * the screen is waiting for.
 *
 *     node _tests/ai-beat-test.js
 *
 * Two things are being defended here and they are not the same thing.
 *
 *   THE BANDS ARE THE PERSONALITY. A single 620ms pause before every decision
 *   is what made the opponent read as a machine, so the beats are now a table
 *   of bands and the table is only worth anything if every draw actually lands
 *   in its band, if AI_TEMPO moves all of them together, and if AI_BEAT still
 *   collapses the lot for a test that has four hundred questions to get
 *   through and no patience.
 *
 *   THE ARMED BEAT CAN GO STALE. There is one timer for the whole driver, and
 *   a beat armed for one screen used to run anyway when the screen had moved
 *   on: tap a country off the grid while he is picking his own and his beat
 *   lands afterwards and takes the side you wanted. The re-check lives in
 *   aiLater now, so the test for it is one shape repeated: arm the beat, move
 *   the game under it, and prove nothing happened. The case list is checked
 *   against the number of aiLater calls in the driver, so adding a call site
 *   without adding a case fails here rather than in somebody's match.
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
const tick = (ms = 120) => new Promise(r => setTimeout(r, ms));
const R = p => JSON.parse(fs.readFileSync(path.join(REPO, p), "utf8"));
let fails = 0;
const check = (n, c, x) => {
  console.log((c ? "  PASS  " : "  FAIL  ") + n + (c ? "" : "   <-- got: " + x));
  if (!c) fails++;
};

(async () => {
  const app = makeInstance("beat");
  await tick(340);
  run(app, "TEAMS.wc2006 = " + JSON.stringify(R("assets/wc2006/index.json")) + ";");
  run(app, 'DECKS["classic-mc"] = ' + JSON.stringify(R("assets/mc/index.json")) + ";");

  /* a hundred draws is enough: the bands are uniform, so a floor or a ceiling
     that is one millisecond out shows up long before that */
  const draws = (kind, arg, slow, n = 100) =>
    ev(app, "(() => { const o = []; for(let i=0;i<" + n + ";i++) o.push(beat(" +
      JSON.stringify(kind) + "," + JSON.stringify(arg == null ? null : arg) + "," + !!slow + ")); return o; })()");
  const band = (label, kind, arg, lo, hi, slow) => {
    const d = draws(kind, arg, slow);
    const min = Math.min(...d), max = Math.max(...d);
    check(label + " lands in " + lo + ".." + hi, min >= lo && max <= hi, min + ".." + max);
    return d;
  };

  console.log("--- every band lands inside its floor and its span ---");
  band("a manager deciding", "think", null, 900, 1400);
  band("a keeper setting himself", "save", null, 900, 1800);
  band("a tackle already committed", "tackle", null, 800, 1400);
  band("a bench decision", "sub", null, 1200, 1200);

  console.log("\n--- and the two that lean on the ladder ---");
  /* THE PASS BAND IS 700 TO 1500 AND THE LADDER CUTS IT IN FIVE, so a square
     ball is hit twice as quickly as a BALL over the top. The fifths are what
     "longer for a dearer ball" means in numbers. */
  band("an Easy ball", "pass", "easy", 700, 860);
  band("a Normal ball", "pass", "normal", 860, 1020);
  band("a Hard ball", "pass", "hard", 1020, 1180);
  band("an Extreme ball", "pass", "extreme", 1180, 1340);
  band("a BALL", "pass", "ball", 1340, 1500);
  check("a dearer ball always takes longer than a cheaper one",
    Math.max(...draws("pass", "easy")) < Math.min(...draws("pass", "ball")), "no");
  /* THE ANSWER BANDS OVERLAP ON PURPOSE. Easy is 600 to 1200 and BALL is 1500
     to 3500, so the three rungs between are interpolated at both ends rather
     than sliced out of one span: an Extreme answer can legitimately take as
     long as a quick BALL. */
  band("an Easy answer", "answer", "easy", 600, 1200);
  band("a Hard answer", "answer", "hard", 1050, 2350);
  band("a BALL answer", "answer", "ball", 1500, 3500);
  /* TWO THOUSAND, NOT A HUNDRED, AND THE REAL MULTIPLIER RATHER THAN "LONGER".
     beat() multiplies a wrong answer by exactly 1.25. Sampling a hundred draws
     from a band 1300 wide and asking whether the means are 1.15 apart puts the
     test 2.7 standard deviations from failing, which is once in roughly two
     hundred and fifty runs, and a suite that goes red that often teaches you to
     run it again rather than to read it. At two thousand draws both bounds are
     eleven deviations out, and naming the multiplier means the check notices if
     somebody quietly makes it 1.4. */
  const right = draws("answer", "hard", false, 2000), wrong = draws("answer", "hard", true, 2000);
  const mean = a => a.reduce((s, v) => s + v, 0) / a.length;
  const ratio = mean(wrong) / mean(right);
  check("a wrong one takes the quarter longer beat() says it does",
    ratio > 1.15 && ratio < 1.35,
    Math.round(mean(right)) + " right, " + Math.round(mean(wrong)) + " wrong, ratio " + ratio.toFixed(3));
  check("and never past the band and a quarter", Math.max(...wrong) <= 2350 * 1.25, Math.max(...wrong));

  console.log("\n--- reading is the length of the thing he is reading ---");
  /* 12ms a character past the first sixty-five, floored at 1200 and capped at
     3000. A solo match is always Pick One, so the population is the 1,000
     questions in assets/mc WITH their options: median 109, p90 139, longest
     207. That puts the ordinary question at 1.7s and only the top 3% at the
     ceiling. */
  for (const [len, want] of [[0, 1200], [65, 1200], [109, 1728], [139, 2088], [207, 2904], [400, 3000]])
    check("a " + len + " character question reads in " + want + "ms",
      ev(app, "beat('read'," + len + ")") === want, ev(app, "beat('read'," + len + ")"));
  check("and a longer question is never quicker than a shorter one",
    ev(app, "(() => { let last = 0; for(let n=0;n<300;n+=7){ const m = beat('read', n); if(m < last) return false; last = m; } return true; })()"), "it was");

  console.log("\n--- the dial scales all of it ---");
  const KINDS = [["think", null, 900, 1400], ["pass", "ball", 1340, 1500], ["answer", "easy", 600, 1200],
                 ["save", null, 900, 1800], ["tackle", null, 800, 1400], ["sub", null, 1200, 1200]];
  /* TEMPO DIVIDES. Turn it up and he plays quicker, which is the only reading
     of the word that survives "if it runs longer, AI_TEMPO goes up". */
  for (const t of [2, 1.5, .5]) {
    run(app, "AI_TEMPO = " + t + ";");
    const bad = KINDS.filter(([k, a, lo, hi]) => {
      const d = draws(k, a);
      return Math.min(...d) < Math.floor(lo / t) || Math.max(...d) > Math.ceil(hi / t);
    }).map(k => k[0]);
    check("at tempo " + t + " every band is its own over " + t, !bad.length, bad.join(","));
  }
  run(app, "AI_TEMPO = 1;");
  check("reading scales with it too",
    ev(app, "(() => { const a = beat('read', 140); AI_TEMPO = 2; const b = beat('read', 140); AI_TEMPO = 1; return a === 2100 && b === 1050; })()"), "no");
  check("the dial is clamped to 0.5 and 2 on the way in",
    ev(app, "(() => { setAiTempo(9); const hi = AI_TEMPO; setAiTempo(0); const lo = AI_TEMPO; setAiTempo(1); return hi === 2 && lo === .5; })()"), "no");
  check("and remembered under ball3-ai-tempo",
    ev(app, "(() => { setAiTempo(.5); const k = localStorage.getItem('ball3-ai-tempo'); setAiTempo(1); return k; })()") === "0.5",
    ev(app, "localStorage.getItem('ball3-ai-tempo')"));

  console.log("\n--- and AI_BEAT is still the way out for a test in a hurry ---");
  const ALL = ["think", "pass", "read", "answer", "save", "tackle", "sub"];
  const every = (n) => ALL.map(k => draws(k, k === "read" ? 400 : "ball", true, n)).reduce((a, b) => a.concat(b), []);
  run(app, "AI_BEAT = 0;");
  check("AI_BEAT = 0 collapses every band to 0", every(20).every(v => v === 0), every(20).filter(v => v).join(","));
  run(app, "AI_BEAT = 4;");
  check("AI_BEAT = 4 keeps the whole table under 30ms", Math.max(...every(40)) <= 30, Math.max(...every(40)));
  run(app, "AI_BEAT = AI_NORMAL;");
  check("and the default is the real beat", ev(app, "AI_BEAT === 620 && AI_NORMAL === 620"), ev(app, "AI_BEAT"));

  console.log("\n--- a beat armed for one screen never lands on another ---");
  /* Small enough that a stale beat has landed long before the check, big
     enough that a live one has not been swallowed by rounding. */
  run(app, "AI_BEAT = 8;");
  run(app, `
    /* count what is armed and what actually runs, without touching the driver */
    ARMED = 0; FIRED = 0;
    __later = aiLater;
    aiLater = function(fn, ms){ ARMED++; return __later(function(){ FIRED++; return fn(); }, ms); };
  `);
  /* the eleven, the shape and the toss, so the on-the-ball phases have a real
     pitch under them rather than a half-built one */
  const onThePitch = (play, who) =>
    'S = freshState(["You","It"], false, "classic", 0, "' + play + '", true); ' +
    'S.players[1].ai = "route1"; S.players[1].level = "ere"; h2Start(); ' +
    '(() => { const n = Object.keys(h2Pool()||{}); h2PickTeam(n[0]); h2PickTeam(n[1]); })(); ' +
    'S.h2h.tossed = true; S.h2h.who = ' + who + '; S.h2h.at = 0; S.h2h.sel = null; ' +
    'S.h2h.markedAgainst = ' + who + '; S.tier = "hard"; S.qi = 0; ';
  const fresh = 'S = freshState(["You","It"], false, "classic", 0, "manager", true); ' +
                'S.players[1].ai = "route1"; S.players[1].level = "ere"; h2Start(); ';

  /* ONE CASE PER aiLater IN THE DRIVER. h_pick is two of them, the look and
     the ball, which is why it gets a step of its own below. */
  const cases = [
    ["the team grid", fresh + '(() => { const n = Object.keys(h2Pool()||{}); h2PickTeam(n[0]); })(); render();'],
    ["naming the eleven", fresh + 'S.h2h.teams = ["A","B"]; S.h2h.picking = 1; S.phase = "h_squad"; render();'],
    ["setting a shape", fresh + 'S.h2h.shaping = 1; S.phase = "h_shape"; render();'],
    ["spending the traits", fresh + 'S.h2h.tset = 1; S.phase = "h_traits"; render();'],
    ["calling the toss", fresh + 'S.players[0].ai = "route1"; S.h2h.tossed = false; S.h2h.flipping = false; S.phase = "h_toss"; render();'],
    /* THE TOSS IS TWO DECISIONS NOW, not one. A computer that calls and spins
       in the same instant swallows the only thing worth watching, so the call
       draws the screen and stops and the coin is booked behind it like any
       other beat. This is that second half: he has called, the coin is still in
       his hand, and it has its own timer to go stale. */
    ["throwing the coin up", fresh + 'S.players[0].ai = "route1"; S.h2h.tossed = false; S.h2h.flipping = false; ' +
      'S.h2h.call = "heads"; S.h2h.result = "tails"; S.phase = "h_toss"; render();'],
    ["kicking off", fresh + 'S.h2h.tossed = true; S.h2h.who = 1; S.phase = "h_toss"; render();'],
    ["marking two of them", onThePitch("manager", 0) + 'S.h2h.markedAgainst = 1; S.phase = "h_mark"; render();'],
    ["reading his question", onThePitch("pitch", 1) + 'S.phase = "h_q"; render();'],
    ["answering it", onThePitch("pitch", 1) + 'S.phase = "h_judge"; render();'],
    /* THE DUEL IS TWO DECISIONS ON TWO SIDES. Picking a corner is his while he
       is on the ball, and going to one is his while the other man is, so the
       two cases are set up from opposite ends of the same pitch. */
    ["picking his corner", onThePitch("pitch", 1) + 'S.phase = "h_aim"; render();'],
    ["going to one", onThePitch("pitch", 0) + 'S.phase = "h_dive"; render();'],
    ["the tackle", onThePitch("pitch", 0) + 'S.phase = "h_tackle"; render();'],
    ["judging the tackle", onThePitch("pitch", 0) + 'S.phase = "h_tjudge"; render();'],
    ["the bench", onThePitch("pitch", 1) + 'S.h2h.sub = {kind:"q", w:1, slot:0}; S.phase = "h_sub"; render();'],
    ["a shootout kick", onThePitch("pitch", 1) + 'S.h2h.so = {first:1, kicks:[[],[]], n:0}; S.phase = "h_pens"; render();'],
  ];
  for (const [name, setup] of cases) {
    run(app, "ARMED = 0; FIRED = 0; " + setup);
    const armed = ev(app, "ARMED");
    /* h_goal is a phase the driver has no branch for, so nothing re-arms and
       anything that fires can only be the stale beat */
    run(app, 'S.phase = "h_goal";');
    const before = ev(app, "JSON.stringify(S)");
    await tick(200);
    check(name + " arms a beat", armed > 0, armed);
    check("and it is dropped when the screen moves", ev(app, "FIRED") === 0, ev(app, "FIRED") + " fired");
    check("and nothing under it was touched", ev(app, "JSON.stringify(S)") === before, "the state moved");
  }

  /* THE SECOND HALF OF A PASS. The look is allowed to land, which highlights
     the man and arms the beat that actually plays the ball, and it is that one
     the yank has to catch. */
  /* AT THE REAL BEAT, because this is the one check with two timers in it and
     the squeezed clock cannot tell them apart: at AI_BEAT = 8 the whole move
     is eighteen milliseconds and any wait long enough to be reliable is also
     long enough for the match to have run on three more phases. Route One off
     his own goal line finds the front line, which the pitch prices a BALL, so
     the move is 1340..1500ms split .65/.35: the look lands by 975ms and the
     ball goes no earlier than 1340. 1150ms is between the two with 175ms of
     air on each side. The tier is asserted rather than assumed, so a change to
     the shape breaks this loudly instead of making it flaky. */
  run(app, "AI_BEAT = AI_NORMAL;");
  run(app, "ARMED = 0; FIRED = 0; " + onThePitch("pitch", 1) + 'S.phase = "h_pick";');
  /* THE MAN IS PINNED AND THE CLOCK IS THE VARIABLE. Everything in the comment
     above rests on the pass being a BALL, and it was, while aiPass took the
     first man off a sort. It is a weighted draw now, and this section used to
     ask him three separate times: in the condition, again in the message, which
     is evaluated either way, and a third time inside aiTick on the render. One
     cheaper man out of any of those and the beat is shorter than the window.
     Which man he picks is tested properly in ai-test; what is being tested here
     is the split between the two timers, so he is given a man and the clock is
     left as the only thing moving. */
  run(app, "var __realPass = aiPass; " +
    "var __pin = aiOptions().filter(function(o){ return o.line === 6; })[0].i; " +
    "aiPass = function(){ return __pin; };");
  check("he is finding the front line, which is a BALL",
    ev(app, "h2Priced(S.h2h.at, __pin)") === "ball", ev(app, "h2Priced(S.h2h.at, __pin)"));
  run(app, "render();");
  await tick(1150);
  check("the look lands and the ball is armed behind it",
    ev(app, "S.h2h.sel") != null && ev(app, "S.phase") === "h_pick",
    "sel " + ev(app, "S.h2h.sel") + ", phase " + ev(app, "S.phase"));
  /* and now the yank, with the ball still in the air */
  run(app, "aiPass = __realPass;");          // he chooses for himself again
  run(app, 'S.phase = "h_goal";');
  const held = ev(app, "JSON.stringify(S)");
  await tick(800);
  check("and the ball is never played into a screen that has gone",
    ev(app, "JSON.stringify(S)") === held, "the state moved");
  run(app, "aiLater = __later; AI_BEAT = AI_NORMAL;");

  console.log("\n--- and the guard cannot be quietly dropped ---");
  const src = fs.readFileSync(path.join(REPO, "index.html"), "utf8");
  const later = src.slice(src.indexOf("function aiLater(fn, ms){"));
  check("aiLater compares the cue it was armed with", /aiCue\(\) !== cue/.test(later.slice(0, 400)), "it does not");
  const tickSrc = src.slice(src.indexOf("function aiTick(){"));
  /* EITHER LINE ENDING. index.html ships CRLF and the house rule for editing
     it is to normalise to LF and write it back, so for the length of a session
     this file is LF. Hunting for a literal "\r\n}\r\n" found nothing in that
     window, sliced to the end of the file instead, and reported a raw
     setTimeout in the driver that was actually eight thousand lines below it. */
  const body = tickSrc.slice(0, tickSrc.search(/\r?\n\}\r?\n/));
  check("the driver defers through aiLater and nothing else", !/setTimeout\(/.test(body), "a raw setTimeout is in there");
  /* IF THIS ONE FAILS YOU ADDED A DECISION. Add a case to the list above for
     the phase it is armed in, then put the number up. */
  check("every aiLater in the driver has a case above",
    (body.match(/aiLater\(/g) || []).length === cases.length + 2,
    (body.match(/aiLater\(/g) || []).length + " call sites, " + (cases.length + 2) + " covered");
  /* A TYPO IN A KIND IS SILENT: beat() falls back to the manager band and
     nothing looks wrong until somebody times a match, so every kind the driver
     asks for has to be a row in the table. */
  const kinds = (body.match(/beat\("[a-z]+"/g) || []).map(s => s.slice(6, -1));
  const known = ev(app, "Object.keys(AI_BEATS)");
  check("and every kind it asks for is a row in the table",
    kinds.length > 0 && kinds.every(k => known.indexOf(k) > -1),
    kinds.filter(k => known.indexOf(k) < 0).join(",") || "none asked");

  console.log("\n" + (fails ? fails + " FAILED" : "ALL PASS"));
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
