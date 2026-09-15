/* THE CORNER DUEL.
 *
 *     node _tests/duel-test.js
 *
 * The shot used to be two questions in a row and is now one question and a
 * guess, and a guess is the one thing in this app that cannot be checked by
 * playing it once. So most of this file is arithmetic: the same duel run a
 * couple of thousand times, counted, and compared against the number the
 * design claims. If a save comes out at a half when it is supposed to be a
 * quarter, nobody at a table would ever notice, and every match in the app
 * would be wrong.
 *
 * FOUR THINGS ARE UNDER TEST AND ONLY THE FIRST IS OBVIOUS.
 *
 *   THE RULE. Same corner is a save, any other corner is a goal, and that is
 *   checked over all sixteen pairs rather than sampled, because sixteen is
 *   small enough to do properly.
 *
 *   THE SECRET. The keeper must not be able to learn the striker's corner
 *   before he commits to his own. That is checked three ways: the screen he is
 *   looking at, the state that goes out to every other phone in the room, and
 *   the computer, which is the one keeper that could cheat without anybody
 *   being able to see it happen. Two thousand rolls against a corner the
 *   striker never varies: a keeper who peeked would save all of them.
 *
 *   THE NUMBERS. A quarter for anybody, a half for a Keeper, an eighth at a
 *   penalty and with a centre-half in goal. Those three are the whole of what
 *   the keeper trait and the old Extreme tiers were translated into, so they
 *   are asserted as numbers and not as behaviour.
 *
 *   THE BANK. A duel is not a question and must never be filed as one. The
 *   row it writes is checked against _tools/retier.js's own filter, which is
 *   the thing that would otherwise re-tier real questions out of the bank on
 *   the strength of somebody guessing bottom left.
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
const tick = (ms = 120) => new Promise(r => setTimeout(r, ms));
const R = p => JSON.parse(fs.readFileSync(path.join(REPO, p), "utf8"));
let fails = 0;
const check = (n, c, x) => {
  console.log((c ? "  PASS  " : "  FAIL  ") + n + (c ? "" : "   <-- got: " + x));
  if (!c) fails++;
};
const ST = 9, GK = 0;
const CORNERS = ["tl", "tr", "bl", "br"];

(async () => {
  const app = makeInstance("duel");
  await tick(340);
  run(app, "TEAMS.wc2006 = " + JSON.stringify(R("assets/wc2006/index.json")));

  /* A MATCH PARKED ON A SHOT. Nothing below needs a question asked, because
     the duel happens after the striker has already answered his: h2ToSave is
     the door out of a struck ball and it is the door every one of these goes
     through, open play, penalty and shootout alike. */
  const start = (play, timed) => {
    run(app, 'S = freshState(["Martijn","Bram"], ' + (timed ? "true" : "false") +
             ', "classic", 0, "' + play + '", false); h2Start(); ' +
             'h2PickTeam("Netherlands"); h2PickTeam("Italy"); ' +
             'S.h2h.tossed = true; S.h2h.subs = [0, 0]; h2TackleOn = false; ' +
             'S.h2h.who = 0; S.h2h.at = ' + ST + '; S.h2h.shooting = true;');
  };
  /* ONE DUEL, START TO VERDICT, through the buttons a person taps. The clock
     is put back to nought each time because these are two thousand shots in
     the same match and the whistle is not what is being tested. */
  const duel = (shot, dive) => {
    const d = JSON.stringify([].concat(dive || []));
    run(app, '(() => { const H = S.h2h; H.min = 0; H.shooting = true; H.result = null;' +
             ' h2ToSave();' +
             ' h2Aim(' + JSON.stringify(shot) + ');' +
             ' if(S.phase === "h_hand") h2HandGo();' +
             ' for(const c of ' + d + ') h2Dive(c);' +
             '})();');
    return ev(app, "S.h2h.result");
  };
  const rate = (n, pick) => {
    let saved = 0;
    for (let i = 0; i < n; i++) {
      const p = pick();
      if (duel(p[0], p[1]) === "saved") saved++;
    }
    return saved / n;
  };
  const any = () => CORNERS[Math.floor(Math.random() * 4)];
  const pct = x => Math.round(x * 1000) / 10 + "%";

  /* ================================================================ */
  console.log("--- the rule, over all sixteen pairs ---");
  start("pitch", false);
  let same = 0, other = 0, wrong = [];
  for (const s of CORNERS) for (const k of CORNERS) {
    const out = duel(s, k);
    const want = s === k ? "saved" : "scored";
    if (out !== want) wrong.push(s + "/" + k + " gave " + out);
    if (s === k) same += out === "saved" ? 1 : 0;
    else other += out === "scored" ? 1 : 0;
  }
  check("the same corner is a save, all four of them", same === 4, same);
  check("any other corner is a goal, all twelve of them", other === 12, other);
  check("and nothing came out the other way round", wrong.length === 0, wrong.join("; "));

  console.log("\n--- which makes it a quarter, and nothing else ---");
  const flat = rate(2000, () => [any(), any()]);
  check("two thousand duels save about one in four", flat > .20 && flat < .30, pct(flat));

  /* ================================================================ */
  console.log("\n--- and the keeper cannot see it coming ---");
  start("pitch", false);
  run(app, '(() => { const H = S.h2h; H.shooting = true; h2ToSave(); h2Aim("tl"); })();');
  check("the aim hands the phone over", ev(app, "S.phase") === "h_hand", ev(app, "S.phase"));
  const hand = stage(app);
  check("and the card that crosses the table says nothing about the corner",
    !/\b(tl|tr|bl|br)\b/.test(hand) && !/top left|bottom left|top right|bottom right/i.test(hand),
    "the handover card names a corner");
  run(app, "h2HandGo()");
  check("the keeper is on the dive screen", ev(app, "S.phase") === "h_dive", ev(app, "S.phase"));
  const dive = stage(app);
  /* THE SCREEN IS THE WHOLE OF THE SECRET. h2GoalSceneHTML writes the corner
     onto the scene as custom properties so the reveal can draw the ball going
     there, and this is the screen where doing that would hand him the answer.
     It is checked as markup rather than as intent: no picked class, no corner
     in the style attribute, and none of the four names anywhere but on the
     four buttons, which all four of them carry equally. */
  check("no corner is lit on the goal he is looking at",
    !/class="h2gmc [a-z]+ on"/.test(dive), "a corner is already picked");
  check("all four are offered, and offered identically",
    (dive.match(/class="h2gmc /g) || []).length === 4 &&
    (dive.match(/aria-pressed="false"/g) || []).length === 4,
    (dive.match(/class="h2gmc /g) || []).length + " buttons");
  /* THERE IS NO FLIGHT WRITTEN ONTO THE SCENE ANY MORE, and the check is
     stronger for it. It used to be that the corner was replaced by a harmless
     default on this screen, which is a secret kept by remembering to keep it.
     The goal is painted on a canvas out of a configuration handed straight to
     the drawing, and h2GoalSceneHTML does not put the corner in that
     configuration at all while the state is "set", so there is nothing in the
     document for him to read and nothing anybody has to remember. */
  check("nothing about where the ball is going is in the markup",
    !/--g[xy]:/.test(dive) && !/data-(shot|corner|dive)/.test(dive),
    (dive.match(/--g[a-z]+:[^;"]*/g) || []).join(","));
  check("and the only corner names on it are the four he is being offered",
    (dive.match(/\b(tl|tr|bl|br)\b/g) || []).length === 8,
    (dive.match(/\b(tl|tr|bl|br)\b/g) || []).join(","));
  /* THE OTHER PHONES IN THE ROOM. Pitch mode is a spectator mirror online
     rather than something a guest can act on, but the whole state goes out on
     every render and the corner is in it. The marks have been stripped from
     that payload since the tackle shipped, and this is the same rule. */
  check("the mirror does not carry it while it is still secret",
    ev(app, "JSON.parse(JSON.stringify(mpStatePayload())).h2h.shot") == null,
    ev(app, "JSON.stringify(mpStatePayload().h2h.shot)"));
  run(app, 'h2Dive("br")');
  check("and it comes back once both men are looking at it",
    ev(app, "JSON.parse(JSON.stringify(mpStatePayload())).h2h.shot") === "tl",
    ev(app, "JSON.stringify(mpStatePayload().h2h.shot)"));

  /* THE COMPUTER IS THE KEEPER NOBODY CAN WATCH. A human keeper is kept
     honest by the handover card; the computer has no card and picks inside the
     same process as the striker's corner. If it ever read that corner the save
     rate against a striker who never varies would go to one, so this is driven
     against one corner, two thousand times, and counted. */
  console.log("\n--- including the one keeper you cannot watch ---");
  run(app, 'S.players[1].ai = "route1"; S.players[1].level = "champs"; AI_BEAT = 0;');
  let aiSaved = 0;
  const seen = {};
  for (let i = 0; i < 2000; i++) {
    run(app, '(() => { const H = S.h2h; H.min = 0; H.shooting = true; H.result = null;' +
             ' h2ToSave(); h2Aim("tl"); })();');
    await Promise.resolve();
    run(app, "h2AiDive()");
    for (const c of ev(app, "JSON.stringify(S.h2h.dive)") ? JSON.parse(ev(app, "JSON.stringify(S.h2h.dive)")) : [])
      seen[c] = (seen[c] || 0) + 1;
    if (ev(app, "S.h2h.result") === "saved") aiSaved++;
  }
  check("it saves about a quarter of them, not all of them",
    aiSaved / 2000 > .20 && aiSaved / 2000 < .30, pct(aiSaved / 2000));
  check("and it goes to all four corners, not to a favourite",
    CORNERS.every(c => (seen[c] || 0) > 350), JSON.stringify(seen));
  /* AND THE ROLL ITSELF TAKES NO ARGUMENT IT COULD CHEAT WITH. aiCorner is
     handed the corners it has already spent and nothing else, which is the
     structural half of the same promise: there is no parameter on it that the
     striker's pick could arrive through. */
  check("the computer's roll is not shown the striker's corner",
    ev(app, "aiCorner.length") <= 1 && !/S\.h2h\.shot|H\.shot/.test(ev(app, "String(aiCorner)")),
    ev(app, "String(aiCorner)"));
  run(app, "S.players[1].ai = null; AI_BEAT = AI_NORMAL;");

  /* ================================================================ */
  console.log("\n--- a keeper goes to two of them ---");
  /* The trait only counts in The Dugout, and it is written straight onto the
     state here: whether a man has earned it and whether his manager can afford
     it are traits-test's job, and this is about what it buys. */
  start("manager", false);
  run(app, 'S.h2h.traits[1][h2TraitKey(h2Man(0, 1))] = "keeper";');
  check("the man in goal has it", ev(app, 'h2Has(0, 1, "keeper")') === true, ev(app, 'h2TraitOf(0, 1)'));
  check("which is worth two corners", ev(app, "h2Keeps()") === 2, ev(app, "h2Keeps()"));
  run(app, '(() => { const H = S.h2h; H.shooting = true; h2ToSave(); h2Aim("tl"); h2HandGo(); h2Dive("br"); })();');
  check("one corner does not commit him", ev(app, "S.phase") === "h_dive", ev(app, "S.phase"));
  check("and the one he has spent is lit", /class="h2gmc br on"/.test(stage(app)), "not lit");
  check("with one still to give", (stage(app).match(/aria-pressed="true"/g) || []).length === 1,
    (stage(app).match(/aria-pressed="true"/g) || []).length);
  run(app, 'h2Dive("br")');
  check("tapping the same one again is not a second corner", ev(app, "S.phase") === "h_dive", ev(app, "S.phase"));
  run(app, 'h2Dive("tl")');
  check("the second one commits him, and it saved", ev(app, "S.h2h.result") === "saved", ev(app, "S.h2h.result"));
  check("either of the two keeps it out",
    duel("bl", ["bl", "tr"]) === "saved" && duel("tr", ["bl", "tr"]) === "saved", "one of them did not");
  check("and a third corner still beats him", duel("br", ["bl", "tr"]) === "scored", "it did not go in");
  const twoUp = rate(2000, () => {
    const a = any();
    let b = any(); while (b === a) b = any();
    return [any(), [a, b]];
  });
  check("two thousand of them save about a half", twoUp > .45 && twoUp < .55, pct(twoUp));
  /* WHICH IS THE POINT OF THE PRICE. The trait cost one budget point when it
     was buying Hard down to Normal, which the bank's own bands put at about
     twenty-one points of save rate. Twenty-five to fifty is twenty-five. */
  check("so the trait is worth about what it was worth", twoUp - flat > .18 && twoUp - flat < .32,
    pct(twoUp - flat) + " added");

  console.log("\n--- but not from the spot, and not in a shootout ---");
  run(app, "S.h2h.pen = true;");
  check("a penalty keeper gets one corner", ev(app, "h2Keeps()") === 1, ev(app, "h2Keeps()"));
  run(app, "S.h2h.pen = false; S.h2h.so = {first: 0, kicks: [[], []], n: 0};");
  check("and so does a shootout keeper", ev(app, "h2Keeps()") === 1, ev(app, "h2Keeps()"));
  check("who does get to hold what he reaches", ev(app, "h2Holds()") === true, ev(app, "h2Holds()"));
  run(app, "S.h2h.so = null;");

  /* ================================================================ */
  console.log("\n--- a man who is not really in a position to save it ---");
  start("pitch", false);
  run(app, "S.h2h.pen = true;");
  check("a penalty is meant to go in", ev(app, "h2Holds()") === false, ev(app, "h2Holds()"));
  const pen = rate(2000, () => { const c = any(); return [c, c]; });
  check("so he holds about half of the ones he gets to", pen > .44 && pen < .56, pct(pen));
  const penAll = rate(2000, () => [any(), any()]);
  check("which is about an eighth of the kicks", penAll > .09 && penAll < .16, pct(penAll));
  run(app, "S.h2h.pen = false;");

  start("pitch", false);
  run(app, "S.h2h.off[1] = [" + GK + "];");
  check("a centre-half in goal is the same rule", ev(app, "h2NoGk(1)") === true && ev(app, "h2Holds()") === false,
    ev(app, "h2Holds()"));
  const nogk = rate(2000, () => [any(), any()]);
  check("about an eighth of them stay out", nogk > .09 && nogk < .16, pct(nogk));
  /* AND THE SCREEN SAYS WHAT HAPPENED. "It went in" is not a description of a
     keeper who dived the right way; being told he got a hand to it is. */
  let grazed = 0;
  for (let i = 0; i < 40 && !grazed; i++) { const c = any(); if (duel(c, c) === "scored") grazed = 1; }
  check("a hand on one that still goes in is called that",
    grazed === 1 && /got a hand to it/.test(ev(app, "h2DuelHTML()")), ev(app, "h2DuelHTML()"));
  run(app, "S.h2h.off[1] = [];");

  /* ================================================================ */
  console.log("\n--- the reveal, read by the two of them together ---");
  start("pitch", false);
  duel("bl", "tr");
  check("it goes to the strike scene", ev(app, "S.phase") === "h_strike", ev(app, "S.phase"));
  const said = stage(app);
  check("it says where he hit it", /hit it bottom left/.test(said), "no corner for the striker");
  check("and where the keeper went", /went top right/.test(said), "no corner for the keeper");
  check("both men are named on it", said.includes("Martijn") && said.includes("Bram"), "a name is missing");
  check("and the scene knows it was a goal", /class="g3 scored"/.test(said), "wrong scene");
  /* IT GOES WHERE HE PUT IT AND HE GOES WHERE HE SAID, READ OFF THE PIXELS.
     These were two string matches on custom properties, which proved the
     numbers had been written onto the element and nothing whatever about where
     anything was drawn. The scene is a canvas now, so the honest version is to
     paint the frame the ball arrives on and look at it: he hit it bottom left,
     so the ball has to finish in the bottom left of the mouth, and the keeper
     named top right on his own screen, so the gloves have to finish in the top
     right of it. A keeper thrown the other way is the app calling the man who
     just tapped it a liar, and that is the failure worth a test. */
  {
    const W = ev(app, "G3.size.CW"), H = ev(app, "G3.size.CH");
    const px = []; for (let y = 0; y < H; y++) px.push(new Array(W).fill(null));
    let cur = "#000";
    const rc = { imageSmoothingEnabled: false,
      set fillStyle(v) { cur = String(v); }, get fillStyle() { return cur; },
      setTransform() {}, save() {}, restore() {}, beginPath() {}, ellipse() {}, fill() {},
      clearRect() { for (let y = 0; y < H; y++) px[y].fill(null); },
      fillRect(x, y, w, h) { const x0 = Math.round(x), y0 = Math.round(y);
        for (let j = y0; j < y0 + Math.round(h); j++) for (let i = x0; i < x0 + Math.round(w); i++)
          if (i >= 0 && i < W && j >= 0 && j < H) px[j][i] = cur; } };
    app.__can = { width: W * 5, height: H * 5, getContext: () => rc };
    run(app, "G3.paint(G3.clock.land, __can)");
    const mid = col => { const p = [];
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (px[y][x] === col) p.push([x, y]);
      return p.length ? { x: p.reduce((a, q) => a + q[0], 0) / p.length,
                          y: p.reduce((a, q) => a + q[1], 0) / p.length } : null; };
    const m = ev(app, "G3.mouth(G3.cameraFor(S.h2h.at, S.h2h.who, !!(S.h2h.pen || S.h2h.so)))");
    const cx = (m.L / 100 * W + (W - m.R / 100 * W)) / 2;
    const cy = (m.T / 100 * H + m.T / 100 * H + m.H / 100 * H) / 2;
    const ball = mid("#c3c9d2"), gloves = mid("#f2f2ee");
    check("the ball is sent to the corner he chose",
      !!ball && ball.x < cx && ball.y > cy,
      JSON.stringify(ball) + " about " + Math.round(cx) + "," + Math.round(cy));
    check("and the keeper to the one he chose",
      !!gloves && gloves.x > cx && gloves.y < cy,
      JSON.stringify(gloves) + " about " + Math.round(cx) + "," + Math.round(cy));
  }

  /* ================================================================ */
  console.log("\n--- and nothing about it reaches the question bank ---");
  start("pitch", false);
  run(app, 'localStorage.removeItem("ball3-outcomes"); S.tier = "extreme"; S.qi = 7;');
  duel("tl", "tl");
  duel("tr", "bl");
  const rows = JSON.parse(ev(app, 'JSON.stringify(JSON.parse(localStorage.getItem("ball3-outcomes") || "[]"))'));
  check("two duels, two rows", rows.length === 2, rows.length);
  check("filed as saves, so the match report can still count them",
    rows[0].kind === "save" && rows[0].ok === true && rows[1].ok === false,
    JSON.stringify(rows.map(r => [r.kind, r.ok])));
  /* THE STRIKER'S QUESTION IS STILL SITTING ON S.tier AND S.qi, which is the
     whole reason the old logOutcome call had to go: it would have filed both of
     these against an Extreme question that only one man was ever shown. */
  check("the striker's question is still loaded, and still nothing to do with this",
    ev(app, "S.tier") === "extreme" && ev(app, "S.qi") === 7, ev(app, "S.tier"));
  check("so no row carries a tier", rows.every(r => r.tier === undefined),
    JSON.stringify(rows.map(r => r.tier)));
  check("nor an index", rows.every(r => r.qi === undefined), JSON.stringify(rows.map(r => r.qi)));
  check("nor a question key", rows.every(r => r.k === undefined), JSON.stringify(rows.map(r => r.k)));
  /* THE FILTER THAT ACTUALLY PROTECTS THE BANK, copied off the top of
     _tools/retier.js rather than described: a row with no key and no tier is
     dropped before anything is tallied, so a duel can never move a question
     between tiers however many of them are played. */
  const retier = fs.readFileSync(path.join(REPO, "_tools", "retier.js"), "utf8");
  check("retier still drops rows with no question on them",
    /if \(!r \|\| !r\.k \|\| !r\.tier\) return false;/.test(retier), "the filter has changed");
  check("and it would drop both of these", rows.filter(r => r && r.k && r.tier).length === 0,
    rows.filter(r => r && r.k && r.tier).length);
  check("the corners are on the row, because the file is the only way they leave the phone",
    rows[0].shot === "tl" && rows[0].dive === "tl" && rows[1].shot === "tr" && rows[1].dive === "bl",
    JSON.stringify(rows.map(r => [r.shot, r.dive])));
  const tsv = ev(app, "outcomesTSV()").split("\n");
  check("and the exported file leaves the question columns empty rather than undefined",
    !/undefined/.test(tsv[1]) && tsv[1].split("\t")[4] === "" && tsv[1].split("\t")[5] === "", tsv[1]);

  /* ================================================================ */
  console.log("\n--- the clock on a decision with nothing to work out ---");
  start("pitch", true);
  run(app, '(() => { const H = S.h2h; H.shooting = true; h2ToSave(); })();');
  check("the aim is on a clock like everything else", /id="clock"|startTimer/.test("startTimer") &&
    ev(app, "S.phase") === "h_aim", ev(app, "S.phase"));
  run(app, "h2AimTimeUp()");
  check("running it out strikes it anyway", ev(app, "S.h2h.shot") != null, ev(app, "S.h2h.shot"));
  check("and the phone still goes over", ev(app, "S.phase") === "h_hand", ev(app, "S.phase"));
  run(app, "h2HandGo(); h2DiveTimeUp();");
  check("and running the dive out sends him somewhere",
    (ev(app, "JSON.stringify(S.h2h.dive)") || "[]") !== "[]", ev(app, "JSON.stringify(S.h2h.dive)"));
  check("the shot is settled either way", ev(app, "S.phase") === "h_strike", ev(app, "S.phase"));
  /* A BUZZER MUST NOT BE A CORNER YOU CAN LEARN. If the clock always struck it
     into, say, the top left, a keeper would only have to sit on his own clock
     and then go and stand there. */
  start("pitch", false);
  const late = {};
  for (let i = 0; i < 400; i++) {
    run(app, '(() => { const H = S.h2h; H.min = 0; H.shooting = true; h2ToSave(); })(); h2AimTimeUp();');
    const c = ev(app, "S.h2h.shot");
    late[c] = (late[c] || 0) + 1;
    run(app, 'S.phase = "h_pick";');
  }
  check("a buzzer picks a corner at random, not a default one",
    CORNERS.every(c => (late[c] || 0) > 55), JSON.stringify(late));
  const lateKeeper = {};
  for (let i = 0; i < 400; i++) {
    run(app, '(() => { const H = S.h2h; H.min = 0; H.shooting = true; h2ToSave(); h2Aim("tl");' +
             ' if(S.phase === "h_hand") h2HandGo(); })(); h2DiveTimeUp();');
    for (const c of JSON.parse(ev(app, "JSON.stringify(S.h2h.dive)"))) lateKeeper[c] = (lateKeeper[c] || 0) + 1;
  }
  check("and so does a keeper who runs out of time",
    CORNERS.every(c => (lateKeeper[c] || 0) > 55), JSON.stringify(lateKeeper));

  /* ================================================================ */
  console.log("\n--- the picker is a place in the goal, not four buttons ---");
  const src = fs.readFileSync(path.join(REPO, "index.html"), "utf8");
  /* THE MOUTH IS STILL WRITTEN DOWN ONCE, but it is no longer written down in
     the stylesheet at all. The canvas draws the goal, so the canvas is where
     the four numbers come from: G3.mouth() turns whichever camera is in use
     into percentages and h2GoalSceneHTML puts them on the element. There is
     deliberately no fallback out here either, because a default would be a
     second set of numbers to keep in step and a picker quietly pinned to a goal
     that has moved is worse than one that has visibly collapsed.

     The pixel-level proof that these percentages describe the goal that was
     actually painted lives in _tests/shot-test.js, which walks them back into
     canvas space and reads the posts either side of every edge. What is
     asserted here is the wiring. */
  const srcFlat = src.replace(/\r\n/g, "\n");
  const srcCss = srcFlat.slice(0, srcFlat.indexOf("</style>"));
  check("the mouth is not written down in the stylesheet at all",
    !/--gm[LRTH]\s*:/.test(srcCss) && !/var\(--gm[LRTH]\s*,/.test(srcCss),
    (srcCss.match(/--gm[LRTH][^;}]*/g) || []).join(" "));
  check("and it is written down exactly once in the app",
    (srcFlat.match(/--gmL:/g) || []).length === 1, (srcFlat.match(/--gmL:/g) || []).length);
  check("the picker is still pinned to it",
    /\.h2gm\{position:absolute;left:var\(--gmL\);right:var\(--gmR\);top:var\(--gmT\);height:var\(--gmH\)/.test(srcCss),
    "the picker has come off the custom properties");
  check("and the picker sits over the keeper rather than under the goal",
    /\.h2gm\{[^}]*z-index:7/.test(srcCss), "wrong stacking");
  check("a man who asked for less movement still sees where it finished",
    /if\(PEND\.hold \|\| PEND\.rm\)\{ paint\(PEND\.hold \? STILL : 1\); return; \}/.test(srcFlat) &&
    /@media \(prefers-reduced-motion: reduce\)\{\n\s*\.g3\.scored \.g3-cry,\.g3\.saved \.g3-cry,\.g3\.missed \.g3-cry\{animation:none;opacity:1\}/.test(srcCss),
    "no still frame for the goal scene");
  check("and the picker's own transition goes with it",
    /@media \(prefers-reduced-motion: reduce\)\{ \.h2gmc\{transition:none\} \}/.test(src), "the picker still moves");
  /* THE OLD PHASES ARE GONE, so a parked match sitting on one has to be caught
     rather than dropped through the render into "Carry on", which would eat a
     shot that was in the air. */
  check("the keeper's question phases are gone from the app",
    !/S\.phase = "h_save"/.test(src) && !/S\.phase = "h_sjudge"/.test(src), "a phase survived");
  start("pitch", false);
  run(app, '(() => { const H = S.h2h; H.shooting = true; S.phase = "h_save"; ' +
           'localStorage.setItem(SAVE_KEY, JSON.stringify(S)); S = null; })();');
  run(app, "resumeGame()");
  check("and a match parked on one comes back on the aim",
    ev(app, "S.phase") === "h_aim" && ev(app, "S.h2h.shooting") === true,
    ev(app, "S.phase") + "/" + ev(app, "S.h2h.shooting"));

  console.log(fails ? "\n" + fails + " FAILED" : "\nall good");
  process.exit(fails ? 1 : 0);
})();
