/* One on One, driven rule by rule.

     node _tests/h2h-test.js

   The ladder is the mode, so it is checked position by position against the
   worked example rather than spot-checked. Everything else is directional:
   player 1 attacks the other way, so a sign error looks perfect for the home
   side and sends the away side backwards. Movement is tested from both ends. */
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
const tick = (ms = 190) => new Promise(r => setTimeout(r, ms));
let fails = 0;
const check = (n, c, x) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (c ? "" : "   <-- got: " + x)); if (!c) fails++; };

// squad indices, by the names Martijn used
const GK = 0, LCB = 1, RCB = 2, LWB = 3, RWB = 4, SIX = 5, EIGHT = 6, TEN = 7, LW = 8, ST = 9, RW = 10;

(async () => {
  const app = makeInstance("pitch");
  await tick(340);
  /* the harness answers every fetch with a rejection, so the 2006 deck is put
     in by hand. It is the real file off disk, not a fixture, so the shape
     being driven is the shape that ships. */
  const WC = JSON.parse(fs.readFileSync(path.join(REPO, "assets/wc2006/index.json"), "utf8"));
  run(app, "TEAMS.wc2006 = " + JSON.stringify(WC));
  /* These checks are the ORIGINAL rules: the ladder, the turnover and the
     press. The tackle changes the shape of a turn (the phone crosses the table
     before every pass), so it is switched off here and driven on its own in
     _tests/tackle-test.js. Both rule sets ship, so both are tested. */
  run(app, "h2TackleOn = false;");

  const tier = (a, b) => ev(app, `h2TierFor(${a},${b})`);
  const pos = () => ev(app, "S.h2h.at");
  const squad = () => ev(app, "H2_SQUAD");
  // where the ball is drawn, as a percentage down the pitch
  const ballTop = () => {
    const m = stage(app).match(/class="h2ballwrap[^"]*" style="left:[\d.]+%;top:([\d.]+)%/);
    return m ? +m[1] : -1;
  };
  const who = () => ev(app, "S.h2h.who");
  const phase = () => ev(app, "S.phase");

  // a match with both countries already chosen, parked on the toss
  /* the bench is shut for this whole file (subs=[0,0]): a wrong answer here is
   meant to be a turnover, and the bench has its own suite in subs-test.js */
  const start = async () => {
    run(app, 'S = freshState(["Martijn","Bram"], false, "classic", 0, "pitch", false); h2Start(); S.h2h.subs=[0,0]; ' +
             'h2PickTeam("Netherlands"); h2PickTeam("Italy"); render();');
    await tick(180);
  };
  const place = async (w, at) => {
    run(app, `S.h2h.who=${w}; S.h2h.at=${at}; S.h2h.sel=null; S.h2h.shooting=false; S.h2h.tossed=true; S.phase="h_pick"; render();`);
    await tick(160);
  };
  const passTo = async (i, ok) => {
    run(app, `h2Select(${i})`); await tick(150);
    run(app, "h2Play()"); await tick(160);
    run(app, "h2Reveal()"); await tick(130);
    run(app, `h2Judge(${ok})`); await tick(200);
  };

  await start();

  console.log("--- the ladder from the keeper, as described ---");
  check("to a centre-back is Easy",      tier(GK, LCB)  === "easy",    tier(GK, LCB));
  check("to a wing-back is Normal",      tier(GK, LWB)  === "normal",  tier(GK, LWB));
  check("to the six is Hard",            tier(GK, SIX)  === "hard",    tier(GK, SIX));
  check("to the eight is Extreme",       tier(GK, EIGHT)=== "extreme", tier(GK, EIGHT));
  check("to the ten is Extreme",         tier(GK, TEN)  === "extreme", tier(GK, TEN));
  check("to the striker is a BALL",      tier(GK, ST)   === "ball",    tier(GK, ST));
  check("to a winger is a BALL",         tier(GK, LW)   === "ball",    tier(GK, LW));

  console.log("\n--- route one from the back, whatever the gap looks like ---");
  check("centre-back to the striker",    tier(LCB, ST)  === "ball",    tier(LCB, ST));
  check("centre-back to a winger",       tier(RCB, RW)  === "ball",    tier(RCB, RW));
  check("wing-back to the striker",      tier(LWB, ST)  === "ball",    tier(LWB, ST));
  check("but the six to the striker is not (he is not a defender)",
        tier(SIX, ST) !== "ball", tier(SIX, ST));

  console.log("\n--- shorter balls through the middle ---");
  check("six to the ten is Normal",      tier(SIX, TEN) === "normal",  tier(SIX, TEN));
  check("centre-back to the eight is Hard", tier(LCB, EIGHT) === "hard", tier(LCB, EIGHT));
  check("a ball backwards is always safe", tier(TEN, GK)  === "easy",   tier(TEN, GK));
  check("and so is a square one",        tier(LCB, RCB) === "easy",    tier(LCB, RCB));

  console.log("\n--- picking a country ---");
  run(app, 'S = freshState(["Martijn","Bram"], false, "classic", 0, "pitch", false); h2Start(); S.h2h.subs=[0,0]; render();');
  await tick(180);
  check("it opens on the team picker", phase() === "h_teams", phase());
  check("all thirty two sides are offered",
    (stage(app).match(/class="h2teambtn"/g) || []).length === 32,
    (stage(app).match(/class="h2teambtn"/g) || []).length);
  check("every one of them has a kit colour",
    Object.values(WC).every(t => /^#[0-9A-Fa-f]{6}$/.test(t.kit || "")),
    Object.entries(WC).filter(([, t]) => !t.kit).map(([c]) => c).join(","));
  check("and eleven men", Object.values(WC).every(t => t.xi.length === 11), "a squad is not eleven");
  check("and a flag that is actually on disk",
    Object.values(WC).every(t => t.flag && fs.existsSync(path.join(REPO, "assets/natflags", t.flag + ".png"))),
    Object.entries(WC).filter(([, t]) => !t.flag || !fs.existsSync(path.join(REPO, "assets/natflags", t.flag + ".png"))).map(([c]) => c).join(","));
  check("the flags are on the picker",
    (stage(app).match(/class="h2flag"/g) || []).length === 32,
    (stage(app).match(/class="h2flag"/g) || []).length);
  check("England gets England, not the Union Jack",
    WC["England"].flag !== "gb", WC["England"].flag);
  check("Serbia and Montenegro gets its own flag, not modern Serbia",
    WC["Serbia and Montenegro"].flag !== "rs", WC["Serbia and Montenegro"].flag);
  run(app, 'h2PickTeam("Netherlands")'); await tick(160);
  check("the first pick is taken", ev(app, 'S.h2h.teams[0]') === "Netherlands", ev(app, "S.h2h.teams[0]"));
  check("still on the picker for the second man", phase() === "h_teams", phase());
  run(app, 'h2PickTeam("Netherlands")'); await tick(160);
  check("the same country cannot be taken twice", ev(app, 'S.h2h.teams[1]') === null, ev(app, "S.h2h.teams[1]"));
  run(app, 'h2PickTeam("Italy")'); await tick(160);
  check("two countries starts the toss", phase() === "h_toss", phase());

  console.log("\n--- the 2006 elevens ---");
  await start();
  await place(0, GK);
  check("the keeper is van der Sar", ev(app, "h2Who(0,0)") === "van der Sar", ev(app, "h2Who(0,0)"));
  /* NOT A NAMED MAN IN A NAMED SLOT. The deck carries the eleven who actually
     started that country's last match now, so van Nistelrooy is not the
     striker: he was left out against Portugal. What these lines were really
     asserting is that the slots hold real men from the real squad, so that is
     what they ask. */
  const dutch = new Set(WC["Netherlands"].xi.concat(WC["Netherlands"].bench || []).map(m => m.n));
  check("every slot holds a man from the Dutch squad",
    [...Array(11).keys()].every(i => dutch.has(ev(app, "h2Who(" + i + ",0)"))),
    [...Array(11).keys()].map(i => ev(app, "h2Who(" + i + ",0)")).join(", "));
  check("and no man is in two slots",
    new Set([...Array(11).keys()].map(i => ev(app, "h2Who(" + i + ",0)"))).size === 11,
    "somebody is on twice");
  check("Italy is the other side", ev(app, "h2Who(0,1)") === "Buffon", ev(app, "h2Who(0,1)"));
  check("the kit is the country's", ev(app, "h2Kit(0)") === WC["Netherlands"].kit, ev(app, "h2Kit(0)"));
  check("the men wear their names", stage(app).includes("van Bronckhorst"), "no names on the pitch");
  run(app, 'h2Select(' + SIX + ')'); await tick(150);
  check("and the pass is named after the man, whoever he is",
    stage(app).includes(ev(app, "h2Who(" + SIX + ",0)")), "the pass still talks about positions");

  console.log("\n--- the toss ---");
  await start();
  check("it opens on the toss", phase() === "h_toss", phase());
  check("nobody has called yet", stage(app).includes("call it"), "no call prompt");
  check("heads and tails are both offered",
    stage(app).includes("Heads") && stage(app).includes("Tails"), "a side is missing");
  run(app, 'h2Call("heads")'); await tick(160);
  check("the coin is in the air", ev(app, "S.h2h.flipping") === true, ev(app, "S.h2h.flipping"));
  check("and it is spinning on screen", stage(app).includes("h2coin flip"), "no flip animation");
  run(app, "h2Land()"); await tick(200);
  check("it lands on a side", ["heads", "tails"].includes(ev(app, "S.h2h.coin")), ev(app, "S.h2h.coin"));
  check("calling right wins it, calling wrong loses it",
    ev(app, "S.h2h.who") === (ev(app, "S.h2h.coin") === "heads" ? 0 : 1),
    ev(app, "S.h2h.coin") + " -> player " + who());
  check("the winner starts on his own goal line", pos() === GK, pos());
  run(app, "h2KickOff()"); await tick(180);
  check("kick off starts the match", phase() === "h_pick", phase());

  console.log("\n--- passing by tapping a man ---");
  await place(0, GK);
  check("twenty two men are out", (stage(app).match(/class="h2man/g) || []).length === 22,
    (stage(app).match(/class="h2man/g) || []).length);
  run(app, `h2Select(${SIX})`); await tick(150);
  check("tapping one shows who the ball is going to",
    stage(app).includes(ev(app, "h2Who(" + SIX + ",0)")), "no confirm bar");
  check("and names the level", stage(app).includes("Hard"), "no tier on the bar");
  run(app, "h2Play()"); await tick(160);
  check("playing it deals that level", ev(app, "S.tier") === "hard", ev(app, "S.tier"));
  run(app, "h2Reveal()"); await tick(130);
  run(app, "h2Judge(true)"); await tick(200);
  check("the ball arrives at the man you picked", pos() === SIX, pos());

  console.log("\n--- the same from the other end ---");
  await place(1, GK);
  await passTo(EIGHT, true);
  check("away: the ball reaches his eight", pos() === EIGHT && who() === 1, pos() + "/" + who());

  console.log("\n--- the camera sits behind whoever has the ball ---");
  await place(0, GK);
  const homeKeeper = ballTop();
  await place(1, GK);
  const awayKeeper = ballTop();
  check("both keepers are drawn at the near end",
    homeKeeper === awayKeeper && homeKeeper > 80, homeKeeper + " vs " + awayKeeper);
  await place(0, ST);
  const homeStriker = ballTop();
  await place(1, ST);
  check("and both strikers at the far end",
    homeStriker === ballTop() && homeStriker < 30, homeStriker + " vs " + ballTop());

  console.log("\n--- you can see who has it ---");
  await place(0, ST);
  check("the man on the ball stands in a ring",
    (stage(app).match(/class="h2ring"/g) || []).length === 1,
    (stage(app).match(/class="h2ring"/g) || []).length);
  {
    // the ball should be beside his boot, not sitting on top of him
    const manY = squad()[9].y;
    const m = stage(app).match(/class="h2ballwrap[^"]*" style="left:([\d.]+)%;top:([\d.]+)%/);
    const bx = m ? +m[1] : -1, by = m ? +m[2] : -1;
    /* The spot on the grass is his FEET, so the ball belongs at the same height
       and just off to one side. It used to sit below him, which is what put it
       nowhere near his boot. */
    check("the ball is beside him, not on him",
      Math.abs(bx - squad()[9].x) > 3 && Math.abs(bx - squad()[9].x) < 8,
      "ball x " + bx + " vs man x " + squad()[9].x);
    check("and at his feet, not under them",
      by === manY, "ball y " + by + " vs his feet at " + manY);
    check("and still on the grass", bx > 2 && bx < 98, bx);
  }
  await place(0, RW);
  {
    // the wide men tuck it infield rather than hanging it off the touchline
    const m = stage(app).match(/class="h2ballwrap[^"]*" style="left:([\d.]+)%/);
    check("a wide man keeps it infield", m && +m[1] < squad()[10].x, m && m[1]);
  }

  console.log("\n--- knocking it about ---");
  {
    /* The hole this rule exists to close: short balls alone walked the length
       of the pitch for free, and Easy mixed with Normal was the FASTEST route
       there is. So the streak counts both, and the threshold has to be low
       enough to fire on a four pass route. */
    const SQ = squad();
    const cheap = t => ev(app, "H2_SAFE").includes(t);
    let at = 0, hops = 0, guard = 0;
    while (SQ[at].line < 6 && guard++ < 20) {
      let best = null;
      for (let i = 0; i < 11; i++) {
        if (SQ[i].y >= SQ[at].y) continue;
        if (!cheap(tier(at, i))) continue;
        if (best === null || SQ[i].y < SQ[best].y) best = i;
      }
      if (best === null) break;
      at = best; hops++;
    }
    check("the fastest route on short balls alone is four passes",
      SQ[at].line === 6 && hops === 4, "reached line " + SQ[at].line + " in " + hops);
    check("so the tackle fires before it can finish",
      ev(app, "H2_PRESS_AT") < hops, "threshold " + ev(app, "H2_PRESS_AT") + " vs " + hops + " passes");
    check("and it counts Normal too, or you would just alternate",
      ev(app, "H2_SAFE.join(',')") === "easy,normal", ev(app, "H2_SAFE.join(',')"));
  }

  const safePass = async (i) => {
    run(app, "h2Select(" + i + ")"); await tick(140);
    run(app, "h2Play()"); await tick(150);
    if (phase() === "h_q") {
      run(app, "h2Reveal()"); await tick(120);
      run(app, "h2Judge(true)"); await tick(200);
    }
  };

  await start();
  await place(0, GK);
  check("nobody is on him yet", ev(app, "S.h2h.safe") === 0, ev(app, "S.h2h.safe"));
  await safePass(LCB);
  await safePass(LWB);
  await safePass(SIX);
  check("three short balls counted", ev(app, "S.h2h.safe") === 3, ev(app, "S.h2h.safe"));
  check("and the screen says he is on him", stage(app).includes("is on him"), "no warning");
  run(app, "h2Select(" + EIGHT + ")"); await tick(150);
  check("the ball you are about to play is marked contested",
    stage(app).includes("Contested"), "no contested marking");
  run(app, "h2Play()"); await tick(180);
  check("the fourth short ball brings him in", phase() === "h_tackle", phase());
  check("at the level a tackle costs", ev(app, "S.tier") === ev(app, "H2_PRESS_TIER"), ev(app, "S.tier"));
  check("and it is named as his", stage(app).includes("comes in for it"), "not named");

  console.log("\n--- he wins it ---");
  run(app, "h2TackleReveal()"); await tick(130);
  run(app, "h2TackleJudge(true)"); await tick(240);
  check("possession flips", who() === 1, who());
  check("the streak dies with it", ev(app, "S.h2h.safe") === 0, ev(app, "S.h2h.safe"));
  check("and play is live again", phase() === "h_pick", phase());

  console.log("\n--- he misses, and is left on the floor ---");
  await start();
  await place(0, GK);
  await safePass(LCB); await safePass(LWB); await safePass(SIX);
  run(app, "h2Select(" + EIGHT + ")"); await tick(140);
  run(app, "h2Play()"); await tick(170);
  run(app, "h2TackleReveal()"); await tick(130);
  run(app, "h2TackleJudge(false)"); await tick(240);
  check("the pass goes straight through, no question asked",
    pos() === EIGHT && who() === 0, pos() + "/" + who());
  check("and he is still on him, so it does not buy a free run",
    ev(app, "S.h2h.safe") >= ev(app, "H2_PRESS_AT"), ev(app, "S.h2h.safe"));

  console.log("\n--- committing to a real ball clears it ---");
  await start();
  await place(0, GK);
  await safePass(LCB); await safePass(LWB); await safePass(SIX);
  check("three short balls again", ev(app, "S.h2h.safe") === 3, ev(app, "S.h2h.safe"));
  check("a ball into the front three is not a short one", tier(SIX, ST) !== "easy", tier(SIX, ST));
  run(app, "h2Select(" + ST + ")"); await tick(140);
  run(app, "h2Play()"); await tick(160);
  check("so nobody comes in for it", phase() === "h_q", phase());
  run(app, "h2Reveal()"); await tick(120);
  run(app, "h2Judge(true)"); await tick(200);
  check("and the streak is cleared by committing", ev(app, "S.h2h.safe") === 0, ev(app, "S.h2h.safe"));

  await start();

  console.log("\n--- the scorebug ---");
  await place(0, GK);
  check("it shows the country codes, not the country names",
    stage(app).includes(">NED<") && stage(app).includes(">ITA<"),
    "no codes in the bug");
  check("every country in the deck has a real three letter code",
    Object.values(WC).every(t => /^[A-Z]{3}$/.test(t.abbr || "")),
    Object.entries(WC).filter(([, t]) => !/^[A-Z]{3}$/.test(t.abbr || "")).map(([c, t]) => c + "=" + t.abbr).join(","));
  check("and they are the real ones, not the first three letters",
    WC["Netherlands"].abbr === "NED" && WC["Germany"].abbr === "GER" &&
    WC["Ivory Coast"].abbr === "CIV" && WC["South Korea"].abbr === "KOR",
    [WC["Netherlands"].abbr, WC["Germany"].abbr, WC["Ivory Coast"].abbr, WC["South Korea"].abbr].join(","));
  check("including the side that no longer exists",
    WC["Serbia and Montenegro"].abbr === "SCG", WC["Serbia and Montenegro"].abbr);
  check("both flags are in the bar", (stage(app).match(/class="sb-flag"/g) || []).length === 2,
    (stage(app).match(/class="sb-flag"/g) || []).length);
  check("the side on the ball is lit", /class="sb-t on"/.test(stage(app)), "nothing lit");
  await place(1, GK);
  check("and it moves with possession", /class="sb-t away on"/.test(stage(app)), "the light did not move");

  console.log("\n--- the ground ---");
  await place(0, ST);
  run(app, "h2Shoot()"); await tick(160);
  run(app, "h2Reveal()"); await tick(130);
  run(app, "h2Judge(true)"); await tick(180);
  const scene = stage(app);
  /* THE SCENE IS ONE CANVAS NOW, so there is nothing in the markup to search
     for a stand or a keeper in, and searching the markup was never much of a
     test: it proved a div had been written. The drawing is run for real here
     against a recording context that keeps a framebuffer, and then asked what
     it actually put where. _tests/shot-test.js does this properly and at
     length; what follows is the handful of things this file was already
     claiming, asked again of the pixels.

     THE CONTEXT IS A STUB AND THAT IS ENOUGH. The drawing never reads a pixel
     back, it only paints, so a framebuffer that records the last colour written
     to each cell is exactly as good as a browser for every question below. */
  const shotFrame = (u) => {
    const W = ev(app, "G3.size.CW"), H = ev(app, "G3.size.CH");
    const px = []; for (let y = 0; y < H; y++) px.push(new Array(W).fill(null));
    let cur = "#000";
    const c = { imageSmoothingEnabled: false,
      set fillStyle(v) { cur = String(v); }, get fillStyle() { return cur; },
      setTransform() {}, save() {}, restore() {}, beginPath() {}, ellipse() {}, fill() {},
      clearRect() { for (let y = 0; y < H; y++) px[y].fill(null); },
      fillRect(x, y, w, h) {
        const x0 = Math.round(x), y0 = Math.round(y);
        for (let j = y0; j < y0 + Math.round(h); j++) for (let i = x0; i < x0 + Math.round(w); i++)
          if (i >= 0 && i < W && j >= 0 && j < H) px[j][i] = cur; } };
    app.__can = { width: W * 5, height: H * 5, getContext: () => c };
    run(app, "G3.paint(" + u + ", __can)");
    return {
      band: (a, b) => { const s = new Set();
        for (let y = a; y <= b; y++) for (let x = 0; x < W; x++) if (px[y][x]) s.add(px[y][x]);
        return s; },
      count: col => { let n = 0;
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (px[y][x] === col) n++;
        return n; },
    };
  };
  const f = shotFrame(0.5);
  check("there is a crowd behind the goal, and it is a crowd rather than a wall",
    f.band(4, 19).size > 20, f.band(4, 19).size);
  check("boards along the back of the pitch", f.band(22, 25).size >= 6, f.band(22, 25).size);
  check("grass in front of them", f.count("#1d5a2e") > 400, f.count("#1d5a2e"));
  check("and a goal standing on it", f.count("#eef3f5") > 60, f.count("#eef3f5"));

  console.log("\n--- the two men ---");
  check("the man who hit it is in his own country's kit",
    f.count(WC["Netherlands"].kit) > 40,
    WC["Netherlands"].kit + " x" + f.count(WC["Netherlands"].kit));
  check("and the keeper is in the other country's",
    f.count(WC["Italy"].kit) > 20, WC["Italy"].kit + " x" + f.count(WC["Italy"].kit));
  /* the prototype hard-coded a red striker and a blue keeper, which is the one
     thing that would look completely fine and be completely wrong */
  check("neither of them is wearing the colours the art was drawn in",
    f.count("#d8442f") === 0 && f.count("#2f6fd0") === 0, "a hard-coded kit is being painted");
  check("both have boots on the grass", f.count("#26221c") > 20, f.count("#26221c"));
  check("and the keeper has gloves on", f.count("#f2f2ee") > 8, f.count("#f2f2ee"));
  check("and they are named over it", scene.includes(ev(app, "h2Who(0,1)")) &&
    scene.includes(ev(app, "h2Who(9,0)")), "the men are anonymous");

  run(app, "h2Aim('tl')"); await tick(130);
  run(app, "h2HandGo()"); await tick(130);
  run(app, "h2Dive('br')"); await tick(220);
  check("a goal puts the scene in its scored state",
    /class="g3 scored"/.test(stage(app)), "not scored");
  run(app, "h2AfterStrike()"); await tick(260);
  run(app, "h2KickOn()"); await tick(260);
  /* that was a real goal, so the match is 1-0 now. Everything below assumes a
     fresh one, so give it one rather than leaving a score lying around. */
  await start();

  console.log("\n--- sound ---");
  await place(0, ST);
  check("it is on by default", ev(app, "h2Sound") === true, ev(app, "h2Sound"));
  check("and there is a switch for it", stage(app).includes("Sound off"), "no sound toggle");
  run(app, "h2ToggleSound()"); await tick(160);
  check("turning it off sticks", ev(app, "h2Sound") === false, ev(app, "h2Sound"));
  check("and the switch says so", stage(app).includes("Sound on"), "the label did not flip");
  check("it is remembered", ev(app, 'localStorage.getItem("ball3-mute")') === "1",
    ev(app, 'localStorage.getItem("ball3-mute")'));
  /* The harness has no Audio constructor, which is the point: every call is
     wrapped, so a browser that refuses to play must never take the game down
     with it. */
  check("a muted goal roar is silent, not an exception",
    ev(app, '(function(){ try{ h2Sfx("goal", 1); return "fine"; }catch(e){ return "threw: "+e.message; } })()') === "fine",
    ev(app, '(function(){ try{ h2Sfx("goal", 1); return "fine"; }catch(e){ return "threw: "+e.message; } })()'));
  run(app, "h2ToggleSound()"); await tick(160);
  check("and back on again", ev(app, "h2Sound") === true, ev(app, "h2Sound"));
  check("an unplayable one does not throw either",
    ev(app, '(function(){ try{ h2Sfx("goal", 1); h2CrowdStart(); h2CrowdStop(); return "fine"; }catch(e){ return "threw: "+e.message; } })()') === "fine",
    ev(app, '(function(){ try{ h2Sfx("goal", 1); h2CrowdStart(); h2CrowdStop(); return "fine"; }catch(e){ return "threw: "+e.message; } })()'));
  {
    const sfx = ["goal", "crowd"];
    check("both files are actually there",
      sfx.every(f => fs.existsSync(path.join(REPO, "assets/sfx", f + ".wav"))),
      sfx.filter(f => !fs.existsSync(path.join(REPO, "assets/sfx", f + ".wav"))).join(","));
    const kb = sfx.map(f => fs.statSync(path.join(REPO, "assets/sfx", f + ".wav")).size / 1024);
    check("and small enough to precache (under 1MB together)",
      kb.reduce((a, b) => a + b, 0) < 1024, kb.map(k => k.toFixed(0) + "KB").join(" + "));
  }

  console.log("\n--- the men themselves ---");
  await place(0, GK);
  check("they wear a squad number", /<i>\d+<\/i>/.test(stage(app)), "no numbers on the shirts");
  check("van Persie wears 17", ev(app, "h2No(10,0)") === 17 || ev(app, "h2No(8,0)") === 17 ||
    squad().some((_, i) => ev(app, "h2No(" + i + ",0)") === 17), "17 is not in the Dutch eleven");
  check("nobody has a floating head any more", !stage(app).includes("h2head"), "heads are still drawn");
  /* the pitch used to draw little jerseys and the goal scene drew footballers.
     They are the same component now, so the pitch men have torsos and legs. */
  check("the pitch men are drawn figures, same as in the goal",
    (stage(app).match(/class="fig pm"/g) || []).length === 22,
    (stage(app).match(/class="fig pm"/g) || []).length);
  check("with a torso carrying the number", stage(app).includes("f-torso"), "no torso");
  await place(0, GK);
  run(app, "h2Select(" + SIX + ")"); await tick(140);
  run(app, "h2Play()"); await tick(150);
  run(app, "h2Reveal()"); await tick(120);
  run(app, "h2Judge(true)"); await tick(120);
  check("a pass leaves a trail behind the ball",
    (stage(app).match(/h2ballwrap[^"]*ghost/g) || []).length === 2,
    (stage(app).match(/h2ballwrap[^"]*ghost/g) || []).length);
  /* The shadow is the cue that says how high it is, so it has to travel the
     ground path and NOT ride inside the lift with the ball. */
  check("the ball keeps a shadow on the grass", stage(app).includes("h2bsh"), "no ball shadow");
  check("and the shadow is outside the lift, or it would climb with it",
    /class="h2bsh"><\/span><span class="h2lift"/.test(stage(app)), "the shadow is in the wrong place");
  {
    /* A footballer is about 1:4 shoulders to height. At .54 the torso came out
       wider than it was tall and they read as snowmen, so the build ratio is
       worth pinning: it is the difference between players and blobs. */
    const css = fs.readFileSync(path.join(REPO, "index.html"), "utf8");
    const m = css.match(/\.fig\{position:relative;width:calc\(var\(--h\) \* \.(\d+)\)/);
    const ratio = m ? +("0." + m[1]) : null;
    check("the men are a footballer's build, not a snowman's",
      ratio !== null && ratio <= 0.45, "shoulders are " + ratio + " of height");
    /* THE FACT RATHER THAN THE SOURCE LINE. This used to match the literal
       "o.them ? 34 : 48" in index.html, which says nothing about the men and
       everything about how that ternary happened to be typed: naming the two
       numbers broke it while the sides went on being different sizes. The
       difference is the point, because it is most of how you tell your side
       from his at a glance before colour or label gets a look in, so the
       difference is what gets asserted. */
    const man = JSON.parse(ev(app, "JSON.stringify(H2_MAN)"));
    check("and his eleven are drawn smaller than yours",
      man.them < man.mine, "yours " + man.mine + ", his " + man.them);
    check("and a man on the floor is between the two",
      man.down > man.them && man.down < man.mine, "down is " + man.down);
  }
  check("and the ball is lofted, higher for a longer ball",
    /--lift:\d+px/.test(stage(app)), "no arc on the pass");
  check("the eight and the ten are off the centre line, and not on top of each other",
    squad()[6].x !== 50 && squad()[7].x !== 50 && squad()[6].x !== squad()[7].x,
    JSON.stringify([squad()[6].x, squad()[7].x]));
  check("but the ladder still only reads the y axis",
    tier(GK, EIGHT) === "extreme" && tier(GK, SIX) === "hard",
    tier(GK, EIGHT) + "/" + tier(GK, SIX));

  console.log("\n--- losing it ---");
  await place(0, GK);
  await passTo(LCB, false);
  check("possession flips", who() === 1, who());
  check("and he collects it on his front line, through on goal",
    ev(app, "H2_SQUAD[S.h2h.at].line") === 6, ev(app, "H2_SQUAD[S.h2h.at].long"));
  await place(0, ST);
  await passTo(LW, false);
  check("lose it up their end and they start at the back",
    ev(app, "H2_SQUAD[S.h2h.at].line") <= 1, ev(app, "H2_SQUAD[S.h2h.at].long"));

  console.log("\n--- shooting ---");
  await place(0, SIX);
  check("the six cannot shoot", !stage(app).includes("Shoot ·"), "a shot was offered");
  await place(0, ST);
  check("the striker can", stage(app).includes("Shoot ·"), "no shot offered");
  check("and it is a Hard chance", ev(app, "H2_SHOT_AT(9, 0)") === "hard", ev(app, "H2_SHOT_AT(9, 0)"));
  check("a winger's angle is worse", ev(app, "H2_SHOT_AT(8, 0)") === "extreme", ev(app, "H2_SHOT_AT(8, 0)"));
  run(app, "h2Shoot()"); await tick(170);
  check("the shot is on", ev(app, "S.h2h.shooting") === true, ev(app, "S.h2h.shooting"));
  run(app, "h2Reveal()"); await tick(130);
  run(app, "h2Judge(true)"); await tick(190);
  check("a clean strike sends him to a corner", phase() === "h_aim", phase());
  check("all four of them are on the goal", (stage(app).match(/class="h2gmc /g) || []).length === 4,
    (stage(app).match(/class="h2gmc /g) || []).length);
  run(app, "h2Aim('tr')"); await tick(150);
  check("and the phone goes across the table", phase() === "h_hand", phase());
  run(app, "h2HandGo()"); await tick(150);
  check("the keeper gets the same four", phase() === "h_dive" &&
    (stage(app).match(/class="h2gmc /g) || []).length === 4, phase());
  run(app, "h2Dive('tr')"); await tick(220);
  /* Neither outcome lands until the strike has been watched: the camera drops
     behind the striker and you see the ball hit the net or the keeper. */
  check("the camera goes behind the striker", phase() === "h_strike", phase());
  check("there is a goal, painted", stage(app).includes('class="g3c"'), "no canvas");
  check("the keeper is named over it", stage(app).includes("g3-keeper"), "no keeper");
  check("and so is the man who hit it", stage(app).includes("g3-striker"), "no striker");
  check("it says SAVED", stage(app).includes("SAVED"), "no call");
  check("nothing has changed hands yet", who() === 0, who());
  run(app, "h2AfterStrike()"); await tick(240);
  check("a save gives him the ball on his line", who() === 1 && pos() === GK, who() + "/" + pos());
  check("and nobody scored", ev(app, "S.players[0].score") === 0, ev(app, "S.players[0].score"));

  console.log("\n--- goals, and first to two ---");
  const score = async () => {
    await place(0, ST);
    run(app, "h2Shoot()"); await tick(160);
    run(app, "h2Reveal()"); await tick(130);
    run(app, "h2Judge(true)"); await tick(160);
    run(app, "h2Aim('bl')"); await tick(130);
    run(app, "h2HandGo()"); await tick(130);
    run(app, "h2Dive('tr')"); await tick(240);
    run(app, "h2AfterStrike()"); await tick(260);
  };
  const kickOn = async () => { run(app, "h2KickOn()"); await tick(280); };

  // the strike, watched, before any of it counts
  await place(0, ST);
  run(app, "h2Shoot()"); await tick(160);
  run(app, "h2Reveal()"); await tick(130);
  run(app, "h2Judge(true)"); await tick(160);
  check("the corner is picked over the goal, not the tactics board",
    stage(app).includes('class="g3c"') && !stage(app).includes("h2pitch"), "wrong view for the shot");
  run(app, "h2Aim('bl')"); await tick(130);
  run(app, "h2HandGo()"); await tick(130);
  run(app, "h2Dive('tr')"); await tick(240);
  check("a goal is watched before it is counted",
    phase() === "h_strike" && ev(app, "S.players[0].score") === 0,
    phase() + "/" + ev(app, "S.players[0].score"));
  check("it says GOAL over the net", stage(app).includes("GOAL"), "no call");
  run(app, "h2AfterStrike()"); await tick(260);
  check("that is one", ev(app, "S.players[0].score") === 1, ev(app, "S.players[0].score"));
  /* The goal stops the game where it was scored: possession does NOT change
     until the celebration is over, so the eleven who scored are still the ones
     the camera is behind and still the ones in colour. */
  check("the ground stops for it", phase() === "h_goal", phase());
  check("the scorer still has the camera", who() === 0, who());
  check("the word lands on the pitch", stage(app).includes("h2goalcry"), "no GOAL");
  check("and the eleven celebrate", stage(app).includes("h2pitch") && stage(app).includes(" cele"), "nobody celebrated");
  check("the net takes it", stage(app).includes("h2net"), "no net flash");
  await kickOn();
  check("then the man who conceded restarts on his own line", who() === 1 && pos() === GK, who() + "/" + pos());
  check("and play is live again", phase() === "h_pick", phase());

  /* TO THE TARGET, NOT TO A NUMBER. This was two hand-written goals and an
     assertion that said "and two wins it", so moving H2_TARGET, which the app
     calls a dial in three separate places, broke a check about whether reaching
     the target ends a match. One goal is already on the board above, and the
     kick-off between goals is conditional because the last one does not get
     one: that is exactly what the check below this is asking. */
  const TARGET = ev(app, "H2_TARGET");
  while (ev(app, "S.players[0].score") < TARGET) {
    await score();
    if (ev(app, "S.players[0].score") < TARGET) await kickOn();
  }
  check("and reaching the target wins it", ev(app, "S.players[0].score") === TARGET,
    ev(app, "S.players[0].score") + " of " + TARGET);
  check("the winner gets his celebration too", phase() === "h_goal", phase());
  await kickOn();
  check("the match is over", phase() === "results", phase());
  check("it is in the record book", ev(app, "history().length") >= 1, ev(app, "history().length"));

  /* ---------------------------------------------------------------- */
  console.log("\n--- the scouting line ---");
  /* The app always knew who would collect a turnover and never said it. The
     only thing that can really go wrong here is the line and the rule
     disagreeing, so the tests read the line off the screen and then actually
     lose the ball to see whether it told the truth. */
  const scout = () => { const m = stage(app).match(/class="h2scout">Lose it here and <b>([^<]+)<\/b>/); return m ? m[1] : null; };

  await start();
  await place(0, GK);
  check("it says who picks it up", !!scout(), stage(app).slice(0, 200));
  check("and it is the man the rule picks",
    scout() === ev(app, "h2Of(h2NearestTo(0, 0, 1), 1)"), scout());
  check("which on your own goal line is their striker, through on goal",
    scout() === ev(app, "h2Of(9, 1)"), scout());
  check("it is one of THEIRS, not one of ours", scout() !== ev(app, "h2Of(9, 0)"), scout());

  /* per position, not per pass: the whole reason it sits on the caption */
  const before = scout();
  run(app, "h2Select(5)"); await tick(150);
  check("picking a team mate does not change it", scout() === before, scout());
  run(app, "h2Select(9)"); await tick(150);
  check("nor does picking a different one", scout() === before, scout());

  /* the strongest one: read the warning, then lose it */
  await place(0, EIGHT);
  const warned = scout();
  await passTo(TEN, false);
  check("lose it and the man it named is the man who has it",
    ev(app, "h2Of(S.h2h.at, S.h2h.who)") === warned, warned + " v " + ev(app, "h2Of(S.h2h.at, S.h2h.who)"));

  /* it moves when he moves, which since the hold went in happens mid-possession */
  await start();
  await place(0, TEN);
  const standing = scout();
  run(app, "h2Select(9); h2Play(); h2Reveal(); h2Judge(true);"); await tick(200);
  check("a striker who has run in behind is watched by somebody else",
    scout() !== standing, scout() + " v " + standing);
  check("and up there it is their keeper", scout() === ev(app, "h2Of(0, 1)"), scout());

  /* a man who is off cannot collect anything */
  await start();
  await place(0, GK);
  run(app, "S.h2h.off = [[], [9]]; render();"); await tick(150);
  check("their striker sent off, and somebody else is waiting",
    scout() !== ev(app, "h2Of(9, 1)") && !!scout(), scout());
  check("and he is a man still on the pitch",
    ev(app, "!h2IsOff(1, h2NearestTo(0, 0, 1))") === true, "he is off");

  /* ---------- two sides in the same colour ---------- */
  console.log("\n--- the visitor changes when the two of them look alike ---");
  const kits = (a, b) => {
    run(app, 'S = freshState(["You","It"], false, "classic", 0, "pitch", true); h2Start(); ' +
      'h2AsActor(() => { h2PickTeam(' + JSON.stringify(a) + '); h2PickTeam(' + JSON.stringify(b) + '); });');
    return {home: ev(app, "h2Kit(0)"), away: ev(app, "h2Kit(1)"), own: ev(app, "h2KitOwn(1)")};
  };
  /* every one of these is a real pair the 2006 draw can produce */
  for (const [a, b, what] of [
    ["Netherlands", "Ivory Coast", "two oranges"],
    ["Germany", "England", "two whites"],
    ["Italy", "France", "two blues"],
    ["Mexico", "Saudi Arabia", "two greens, on green grass"],
  ]) {
    const k = kits(a, b);
    check(what + ", so " + b + " change", k.away !== k.own, k.away + " is still " + k.own);
    check("and " + a + " do not", k.home === ev(app, "h2KitOwn(0)"), "the home side changed");
    check("and the two of them are clear of each other now",
      ev(app, 'h2KitGap("' + k.home + '","' + k.away + '")') >= ev(app, "H2_CLASH"),
      Math.round(ev(app, 'h2KitGap("' + k.home + '","' + k.away + '")')));
  }
  /* AND IT HAS TO LEAVE MOST FIXTURES ALONE. A rule that fires every time is
     not a clash rule, it is a repaint, and it would throw away the one thing a
     kit is for. */
  for (const [a, b] of [["Netherlands", "Germany"], ["Brazil", "Argentina"], ["Italy", "Ghana"]]) {
    const k = kits(a, b);
    check(a + " against " + b + " is already readable, so nobody changes",
      k.away === k.own, k.away + " instead of " + k.own);
  }
  /* THE CHANGE STRIP CANNOT LOSE ITSELF IN THE PITCH, which is the half of this
     that two green sides would have exposed: a strip that separated them and
     then vanished into the turf would have fixed nothing. */
  for (const c of ev(app, "JSON.stringify(H2_CHANGE)") && JSON.parse(ev(app, "JSON.stringify(H2_CHANGE)")))
    check("the change strip " + c + " is clear of the grass",
      ev(app, 'h2KitGap("' + c + '","#3AA04A")') >= 200,
      Math.round(ev(app, 'h2KitGap("' + c + '","#3AA04A")')));

  /* ---------- the buttons are wired to something ---------- */
  console.log("\n--- where your line stands ---");
  run(app, 'S = freshState(["Martijn","Route One"], false, "classic", 0, "manager", true); ' +
    'S.players[1].ai = "route1"; S.players[1].level = "ere"; h2Start(); ' +
    'h2AsActor(() => { h2PickTeam("Netherlands"); h2PickTeam("Mexico"); }); ' +
    'S.h2h.tossed = true; S.h2h.who = 1; S.h2h.at = 0; h2TackleOn = true; ' +
    'S.phase = "h_mark"; render();');
  await tick(150);
  /* THE HANDLER IS READ BACK OFF THE BUTTON, the way a browser would. This
     rendered onclick="h2SetLine("high")" for a year: the attribute ends at the
     second quote, the handler is "h2SetLine(", and nothing happens. Calling
     h2SetLine from a test passes happily the whole time that is true. */
  const lineBtns = () => [...stage(app)
    .matchAll(/<button class="[^"]*h2lineb[^"]*" onclick="([^"]*)">([^<]+)</g)]
    .map(m => ({click: m[1].replace(/&quot;/g, '"'), label: m[2]}));
  const btns = lineBtns();
  check("all three are on the screen", btns.length === 3, btns.length + " buttons");
  for (const b of btns)
    check(b.label + " carries a handler a browser can read",
      b.click.indexOf("h2SetLine(" + String.fromCharCode(34)) === 0 &&
      b.click.slice(-2) === String.fromCharCode(34) + ")", b.click);
  for (const b of btns) {
    run(app, b.click);
    await tick(80);
    const now = ev(app, "h2Line(h2Other())");
    check("tapping " + b.label + " actually moves the line",
      b.click.indexOf('"' + now + '"') > -1, "line is " + now + " after " + b.click);
  }
  /* AND THE CLASS, NOT ONLY THE CASE. Eight handlers in the file interpolate
     JSON into an attribute and all eight escape it. The ninth was the bug. */
  const src = fs.readFileSync(path.join(REPO, "index.html"), "utf8");
  const loose = src.split(/\r?\n/).filter(l =>
    /on(click|input|change)="/.test(l) && l.indexOf("JSON.stringify(") > -1 &&
    l.indexOf("&quot;") < 0 && l.indexOf('replace(/"/g') < 0);
  check("every handler that interpolates JSON escapes its quotes",
    loose.length === 0, loose.map(l => l.trim().slice(0, 70)).join(" | "));

  /* ---------- putting the phone down ---------- */
  console.log("\n--- the card is put down rather than switched off ---");
  run(app, 'S = freshState(["Martijn","Bram"], false, "classic", 0, "pitch", true); h2Start(); ' +
    'h2AsActor(() => { h2PickTeam("Netherlands"); h2PickTeam("Italy"); }); ' +
    'S.h2h.tossed = true; S.h2h.who = 0; S.h2h.at = 0; ' +
    'S.h2h.hand = {w:1, next:"h_pick", down:true}; S.phase = "h_hand"; render();');
  await tick(120);
  check("the handover card is up", ev(app, "S.phase") === "h_hand", ev(app, "S.phase"));
  /* IT MEASURES THE CARD BEFORE THE RENDER, and the two things it measures with
     are things a browser has and this harness does not. A throw there would
     leave the match sitting on a card nobody can dismiss, so the measuring is
     wrapped and this is the check that the wrapping holds. */
  let threw = null;
  try { run(app, "h2HandGo();"); } catch (e) { threw = e.message; }
  await tick(120);
  check("dismissing it does not need a layout to exist", threw === null, threw);
  check("and the possession carries on", ev(app, "S.phase") === "h_pick", ev(app, "S.phase"));
  check("with the card cleared behind it", ev(app, "S.h2h.hand") === null, "the hand is still set");
  /* TWO TAPS, ONE GHOST. This app has left a timer running over a live screen
     twice before, in the goal hold and in the pack reveal, so the handle being
     singular is asserted rather than trusted. */
  run(app, 'S.h2h.hand = {w:0, next:"h_pick", down:true}; S.phase = "h_hand"; render();');
  await tick(60);
  run(app, "h2HandGo(); h2HandGo();");
  await tick(100);
  check("tapping it twice leaves nothing behind",
    ev(app, "h2LiftEl") === null, "a ghost is still held");
  check("and still ends up on the next screen", ev(app, "S.phase") === "h_pick", ev(app, "S.phase"));

  console.log(fails ? "\n" + fails + " FAILED" : "\nall green");
  process.exit(fails ? 1 : 0);
})();
