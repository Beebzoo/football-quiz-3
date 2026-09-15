/* THE TOSS IS THE SCREEN EVERY MATCH OPENS ON.
 *
 *     node _tests/toss-test.js
 *
 * It used to be two flags and a coin, so there was nothing in it that could be
 * wrong. Staging it puts three men and two names on it, and names are facts:
 * the moment the screen says "Cannavaro" it is claiming that Cannavaro is one
 * of the eleven about to play, and it is claiming it 562 times over 22 pools
 * that nobody is going to open one by one.
 *
 * The harvest marks the SQUAD captain, off the tournament's squad table, and
 * the eleven is the side that actually started that country's last match.
 * Those two disagree for eighty-seven sides, where the man with the armband
 * was rested or came on later, and a man on the bench cannot stand at the
 * centre circle. So the first section here is the only one that matters much:
 * whoever the screen puts on the circle has to be on the pitch afterwards.
 *
 * The rest guards the two things a staging like this classically breaks. It
 * must not decide anything, because the coin already knows which way up it is
 * landing before it starts spinning, and everything drawn round it is a
 * consequence rather than an input. And it checks the referee in particular,
 * because he is the one figure variant that exists only on this screen and
 * nothing else would notice him going.
 */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const REPO = path.join(__dirname, "..");
const harness = fs.readFileSync(path.join(__dirname, "mp-test.js"), "utf8");
const head = harness.slice(0, harness.indexOf("/* ---------- drive an instance from outside ---------- */"));
eval(head.replace(/^const (fs|vm|path) = require\(.*\);$/gm, ""));

const stage = ctx => (ctx.__els["stage"] ? ctx.__els["stage"].innerHTML : "");
const ev = (c, e) => vm.runInContext("(" + e + ")", c);
const run = (c, s) => vm.runInContext(s, c);
const tick = (ms = 130) => new Promise(r => setTimeout(r, ms));
const R = p => JSON.parse(fs.readFileSync(path.join(REPO, p), "utf8"));
let fails = 0;
const check = (n, c, x) => {
  console.log((c ? "  PASS  " : "  FAIL  ") + n + (c ? "" : "   <-- got: " + x));
  if (!c) fails++;
};
/* LINE ENDINGS ARE NOT PART OF ANY RULE HERE. index.html is CRLF on disk and
   every regex below is about CSS, so the file is normalised once and read as
   text rather than as a document. */
const html = fs.readFileSync(path.join(REPO, "index.html"), "utf8").replace(/\r\n/g, "\n");
/* ONE LOOK, SO ONE SLICE. BALL 2 cut the file in two here because the skin
   block had to be told apart from the night rules. BALL 3 has no skin, so
   "where the rules live" is simply the file. */
const NIGHT = html;

(async () => {
  const app = makeInstance("toss");
  await tick(340);

  /* ---------- the man on the circle is a man on the pitch ---------- */
  console.log("--- every side in every pool puts up a captain who is playing ---");
  const pools = JSON.parse(ev(app,
    'JSON.stringify(Object.keys(POOLS).map(k => [k, POOLS[k].file, POOLS[k].of]))'));
  check("all 22 pools are registered", pools.length === 22, pools.length);

  let sides = 0, marked = 0, deputised = 0, expect = 0;
  const broken = [];
  for (const [id, file, of] of pools) {
    const file_ = R(file);
    expect += Object.keys(file_).length;
    run(app, "TEAMS[" + JSON.stringify(id) + "] = " + JSON.stringify(file_) + ";");
    run(app, 'S = freshState(["Martijn","Bram"], false, ' + JSON.stringify(of) +
      ', 0, "pitch", false); S.pool = ' + JSON.stringify(id) + "; h2Start();");
    if (ev(app, "h2PoolId()") !== id) { broken.push(id + " does not resolve"); continue; }
    /* ONE CALL PER POOL, NOT ONE PER SIDE. h2TossCap reads through h2Man, which
       reads h2Squad, which never touches the screen, so the whole sweep can run
       inside the instance and come back as a count. 562 round trips through the
       vm to ask the same question 562 times is a slow test nobody runs. */
    const out = JSON.parse(ev(app, '(() => {' +
      'const bad = [], H = S.h2h; let real = 0, gk = 0;' +
      'for(const side of Object.keys(h2Pool())){' +
      '  H.teams[0] = side;' +
      '  const i = h2TossCap(0), m = h2Man(i, 0), q = h2Squad(0) || {};' +
      '  const xi = q.xi || [];' +
      '  if(i < 0 || i > 10){ bad.push(side + ": slot " + i); continue; }' +
      '  if(!m){ bad.push(side + ": nobody in slot " + i); continue; }' +
      /* xi is the ORDERED eleven, the one h2Order has already moved a second
         keeper out of, which is the eleven that actually takes the field */
      '  if(xi.indexOf(m) < 0){ bad.push(side + ": " + m.n + " is not in the eleven"); continue; }' +
      '  const wearing = xi.filter(x => x && x.cap);' +
      '  if(wearing.length && !m.cap) bad.push(side + ": " + m.n + " over " + wearing[0].n);' +
      '  if(!wearing.length && i !== 0) bad.push(side + ": nobody marked, but slot " + i);' +
      '  if(m.cap) real++; else gk++;' +
      '}' +
      'return JSON.stringify({bad: bad, real: real, gk: gk});' +
      '})()'));
    sides += out.real + out.gk; marked += out.real; deputised += out.gk;
    if (out.bad.length) broken.push(id + " -> " + out.bad.slice(0, 3).join(" | "));
  }
  check("every side of every pool was asked", sides === expect && expect > 500,
    sides + " of " + expect);
  check("and the man it picked is in the eleven, everywhere",
    broken.length === 0, "\n           " + broken.slice(0, 8).join("\n           "));
  /* NOT AN ASSERTION, A NUMBER IN THE OUTPUT. The split moves whenever a
     harvest lands and that is fine; what is not fine is it moving without
     anybody seeing, which is what a hardcoded 361 would hide behind a diff. */
  console.log("         " + marked + " sides put up their real captain, " +
    deputised + " send the keeper out");
  check("the real captain is the usual case rather than the exception",
    marked > deputised, marked + " v " + deputised);

  /* THE SIX CLUB POOLS HAVE NO CAPTAINS AT ALL and never did, so they are the
     clean read on the fallback: if one of them ever comes back with a marked
     man, cap has started arriving from somewhere and this test should be the
     thing that says so rather than a screen nobody checked. */
  console.log("\n--- a league squad has no armband in it, so the keeper goes ---");
  for (const [id, file, of] of pools.filter(p => /-clubs$/.test(p[0]))) {
    run(app, 'S = freshState(["Martijn","Bram"], false, ' + JSON.stringify(of) +
      ', 0, "pitch", false); S.pool = ' + JSON.stringify(id) + "; h2Start();");
    const all = JSON.parse(ev(app, '(() => { const out = [];' +
      'for(const side of Object.keys(h2Pool())){ S.h2h.teams[0] = side; out.push(h2TossCap(0)); }' +
      'return JSON.stringify(out); })()'));
    check(id + " sends out its keeper every time",
      all.length > 0 && all.every(i => i === 0), all.join(","));
  }

  /* ---------- who is actually drawn ---------- */
  console.log("\n--- three men on the circle, and the right two are named ---");
  run(app, 'S = freshState(["Martijn","Bram"], false, "classic", 0, "pitch", false); S.pool = null; h2Start();');
  run(app, 'h2PickTeam("Netherlands"); h2PickTeam("Italy");');
  await tick(150);
  check("two sides opens the toss", ev(app, "S.phase") === "h_toss", ev(app, "S.phase"));
  check("three men stand on it",
    (stage(app).match(/class="tossman/g) || []).length === 3,
    (stage(app).match(/class="tossman/g) || []).length);
  check("two of them are captains",
    (stage(app).match(/class="fig cap"/g) || []).length === 2,
    (stage(app).match(/class="fig cap"/g) || []).length);
  check("and the third is the referee", stage(app).includes('class="fig ref"'), "no referee");
  /* THE NAMES ARE THE CLAIM. Italy's armband is Cannavaro's and he started;
     the Netherlands' is van der Sar's and he is also their keeper, which is
     the one case where the rule and the fallback agree and a bug between them
     would be invisible, so both are named rather than counted. */
  check("Italy put up Cannavaro", stage(app).includes("Cannavaro"), "no Cannavaro");
  check("the Netherlands put up van der Sar", stage(app).includes("van der Sar"), "nobody");
  check("both of them are in the eleven",
    ev(app, 'h2Squad(0).xi.indexOf(h2Man(h2TossCap(0), 0))') > -1 &&
    ev(app, 'h2Squad(1).xi.indexOf(h2Man(h2TossCap(1), 1))') > -1, "a bench man is standing there");
  check("nobody is named under the referee, so there are two captions",
    (stage(app).match(/class="h2lb"/g) || []).length === 2,
    (stage(app).match(/class="h2lb"/g) || []).length);
  check("the referee is not wearing either side's kit",
    ev(app, "H2_REF_KIT") !== ev(app, "h2Kit(0)") && ev(app, "H2_REF_KIT") !== ev(app, "h2Kit(1)"),
    ev(app, "H2_REF_KIT"));
  check("and his kit reads as black against a white badge",
    ev(app, 'kitInk(H2_REF_KIT)') === "#fff", ev(app, 'kitInk(H2_REF_KIT)'));

  /* ONE LOOK, SO ONE CLAIM. BALL 2 asserted the referee was painted twice over,
     once by the night rules and once by the skin's, because either could be on.
     BALL 3 has only the night rules, so this is a text check on where they live,
     there being no browser here. */
  check("the referee's badge is drawn",
    /\.fig\.ref \.f-torso::after\{/.test(NIGHT), "no badge rule");
  check("the armband is drawn",
    /\.fig\.cap \.f-arm\.l::before\{/.test(NIGHT), "no armband");
  /* --ink IS ALREADY ON EVERY FIGURE and is already the one colour kitInk has
     decided reads against this kit. An armband painted in anything else is a
     second opinion about the same question, on 250 kits nobody has looked at. */
  check("the band is the kit's own contrast colour rather than a new one",
    /\.fig\.cap \.f-arm\.l::before\{[^}]*background:var\(--ink/.test(NIGHT), "hardcoded");

  /* ---------- the dropped head ---------- */
  console.log("\n--- the loser drops his head, in a way that works twice ---");
  /* .f-head is centred with translateX(-50%), so any keyframe that writes
     transform and forgets it moves him half a head sideways off his own neck.
     BALL 2 had to make this claim twice, once for the night keyframe and once
     for the sprite's h2drop16; there is one head here and one keyframe. */
  check("the keyframe carries the translate that centres the head",
    /@keyframes h2drop\{[^}]*translateX\(-50%\)/.test(html), "he will step sideways");
  check("the head is given a neck to pivot on, not its own middle",
    /\.tossman\.lost \.fig \.f-head\{transform-origin:/.test(html), "it will read as a tilt");
  check("and the sprite's own drop went with the skin",
    !/h2drop16/.test(html), "a sixteen-bit keyframe outlived the skin");
  /* a head that falls on shoulders that do not is a broken doll */
  check("the man sinks under it", /\.tossman\.lost \.fig\{animation:h2sink/.test(html), "only the head moves");
  check("and the sink is a translate, because rotating a sprite costs it its edges",
    /@keyframes h2sink\{[^}]*translateY/.test(html) && !/@keyframes h2sink\{[^}]*rotate/.test(html),
    "the figure rotates");

  /* ---------- the coin ---------- */
  console.log("\n--- the coin leaves his hand without h2spin noticing ---");
  /* h2spin owns transform on .h2coin and always has. The wrapper was already
     position:relative, already the coin's containing block and had nothing
     animating it, so the launch rides on the wrapper and the two compose. If
     anybody ever moves the launch onto the coin the spin stops, silently. */
  check("the launch is on the wrapper", /\.h2toss3\.up \.h2coinwrap\{animation:h2tossup/.test(html),
    "not on the wrapper");
  /* the lookahead is load-bearing: .h2coinwrap starts with .h2coin, so a plain
     prefix match reads the wrapper's own launch as the coin having been got at */
  check("and h2spin still has .h2coin to itself",
    /\.h2coin\.flip\{animation:h2spin 2s linear forwards, h2arcup/.test(html) &&
    !/\.h2coin(?![\w-])[^{]*\{[^}]*h2tossup/.test(html),
    "something else writes the coin's transform");
  /* A KEYFRAME NAME IS A GLOBAL, and two blocks sharing one is not an error
     anywhere: the later one silently replaces the earlier for every rule in
     the file that names it. This screen adds six, and the first draft of it
     called one h2hop, which is already the ball's spin and scale on every
     pass. Nothing in twenty-six test files noticed. */
  const kfNames = (html.match(/@keyframes\s+([A-Za-z0-9_-]+)/g) || []).map(s => s.split(/\s+/)[1]);
  const kfDupes = kfNames.filter((n, i) => kfNames.indexOf(n) !== i);
  check("no keyframe name is declared twice in the stylesheet",
    kfDupes.length === 0, kfDupes.join(", "));
  check("the wrapper is still the coin's containing block",
    /\.h2toss3 \.h2coinwrap\{position:absolute/.test(html) &&
    /\.h2coin\{position:absolute/.test(html), "the coin would fly off on its own");

  /* ---------- and none of it decides anything ---------- */
  console.log("\n--- the staging shows the result, it does not choose it ---");
  run(app, 'S = freshState(["Martijn","Bram"], false, "classic", 0, "pitch", false); h2Start();');
  run(app, 'h2PickTeam("Netherlands"); h2PickTeam("Italy");');
  await tick(140);
  run(app, 'h2Call("heads");'); await tick(60);
  check("calling fixes the face before the coin has moved",
    ["heads", "tails"].indexOf(ev(app, "S.h2h.result")) > -1, ev(app, "S.h2h.result"));
  check("and nothing is revealed yet", ev(app, "S.h2h.coin") === null, ev(app, "S.h2h.coin"));
  check("the spin is told where to stop",
    /--end:(0|180)deg/.test(stage(app)), "no --end on the coin");
  check("and the coin is still the element h2h-test looks for",
    stage(app).includes("h2coin flip"), "the class moved");
  /* RENDERING IS THE WHOLE RISK. Three men, two captain lookups and a state
     class are now computed on every draw of this screen, and if any of it
     wrote to H the toss would come out differently depending on how many times
     the phone happened to re-render. Snapshot, draw three times, compare. */
  const before = ev(app, "JSON.stringify(S.h2h)");
  run(app, "render(); render(); render();"); await tick(60);
  check("drawing the three men does not touch the state",
    ev(app, "JSON.stringify(S.h2h)") === before, "the toss state moved under it");
  check("and it picks the same two captains every time",
    ev(app, "h2TossCap(0) + ':' + h2TossCap(1)") === ev(app, "h2TossCap(0) + ':' + h2TossCap(1)"),
    "the captain changes per render");

  /* every combination of call and face, driven rather than sampled */
  for (const call of ["heads", "tails"]) for (const coin of ["heads", "tails"]) {
    run(app, 'S.h2h.tossed = false; S.h2h.flipping = true; S.h2h.call = "' + call +
      '"; S.h2h.result = "' + coin + '"; h2Land(); render();');
    check("called " + call + ", landed " + coin + " -> player " + (call === coin ? 0 : 1),
      ev(app, "S.h2h.who") === (call === coin ? 0 : 1), ev(app, "S.h2h.who"));
    check("  and the winner's captain is the one with the hop",
      stage(app).includes('class="tossman ' + (call === coin ? "home" : "away") + ' won"'),
      "the wrong man is celebrating");
  }
  /* AND OVER A LOT OF THEM. The four cases above prove the rule; this proves
     nothing in the staging has quietly become an input to it. */
  const spread = JSON.parse(ev(app, '(() => { const n = {heads: 0, tails: 0}; let wrong = 0;' +
    'for(let k = 0; k < 400; k++){' +
    '  S.h2h.tossed = false; S.h2h.flipping = false; S.h2h.coin = null;' +
    '  h2Call(k % 2 ? "heads" : "tails"); h2Land(); render();' +
    '  n[S.h2h.coin]++;' +
    '  if(S.h2h.who !== (S.h2h.coin === S.h2h.call ? 0 : 1)) wrong++;' +
    '}' +
    'return JSON.stringify({n: n, wrong: wrong}); })()'));
  check("four hundred tosses all pay out on the call",
    spread.wrong === 0, spread.wrong + " went the wrong way");
  check("and the coin is still a coin",
    spread.n.heads > 140 && spread.n.tails > 140, JSON.stringify(spread.n));

  /* ---------- reduced motion ---------- */
  console.log("\n--- reduced motion: the coin still lands, the men do not move ---");
  const rm = html.match(/@media \(prefers-reduced-motion: reduce\)\{\n((?:.*\n)*?)  \}/g) || [];
  const ours = rm.filter(b => b.indexOf(".h2toss3") > -1);
  check("the toss has an answer for it", ours.length === 1, ours.length);
  const b = ours[0] || "";
  check("the men stop", /\.tossman \.fig[^{]*\{[^}]*animation:none/.test(b), "they keep moving");
  /* the coin IS the result and the result has to arrive, so the spin and the
     arc are deliberately not in here */
  check("the coin keeps spinning and landing",
    b.indexOf("h2spin") < 0 && b.indexOf("h2arcup") < 0 && b.indexOf(".h2coin.flip") < 0,
    "the result was killed with the staging");
  /* the small coin in his hand is an animation END STATE: take the animation
     away and it spins unreadably at his hip instead of landing where it can be
     seen, so the wrapper has to be parked as well as stopped */
  check("and it is parked where it can be read",
    /\.h2coinwrap\{[^}]*animation:none[^}]*scale\(1\)/.test(b), "it stays in his hand at a third size");

  console.log("\n" + (fails ? fails + " FAILED" : "ALL PASS"));
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
