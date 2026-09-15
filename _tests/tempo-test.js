/* THE COMPUTER, ON A CLOCK.
 *
 *     node _tests/tempo-test.js
 *
 * ai-test proves the opponent finishes a match and that its dice are the
 * published dice. ai-beat-test proves every band lands inside its own floor and
 * ceiling and that the tempo dial moves all of them together. This one is about
 * the things that sit between the beats: the hold after the camera swings, the
 * two halves of the toss, the side he would rather be playing as, the card's
 * entrance, and how long the whole match takes end to end. That last one is a
 * different sort of claim and it needs a different sort of harness: a clock the
 * test owns.
 *
 * WHY A VIRTUAL CLOCK RATHER THAN REAL SECONDS. A solo match is meant to take
 * eight to twelve minutes. No test suite is allowed to take eight minutes, and
 * a test that runs the beats at a hundredth of their length is not measuring
 * the beats. So setTimeout and clearTimeout are swapped for a queue the test
 * drives by hand: the app schedules exactly what it schedules, in milliseconds
 * it believes in, and the test jumps the clock from one booking to the next. A
 * whole match then plays out in about a second of real time with every beat,
 * every hold and every celebration at full length.
 *
 * It works because mp-test loads the app with vm.runInContext and the app never
 * keeps a reference to setTimeout: it looks the name up on the global every time
 * it calls one. Reassigning them on the sandbox after the load is therefore
 * enough, and nothing in the app can tell.
 *
 * WHAT IS ASSERTABLE AND WHAT IS A MODEL. The computer's half is numbers in
 * index.html, so it is measured exactly and printed, and the print is the
 * point: a band typed with a digit wrong shows up in the output the next time
 * anybody runs this. The human's half is not in the app at all, so it is a
 * MODEL, written down below under HUMAN, and the eight-to-twelve-minute claim
 * is a claim about that model and nothing else. Change the model if a real
 * person disagrees with it; do not change it to make a number go green.
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
const mmss = ms => Math.floor(ms / 60000) + ":" + String(Math.round(ms % 60000 / 1000)).padStart(2, "0");

/* ---------- the clock the test owns ---------- */
/* Ordered by the time a booking is due and then by the order it was made, which
   is what a browser does and, more to the point, what the app quietly depends
   on: the strike hold and the goal hold are booked one after the other on the
   same frame more than once a match.
   The clock only ever goes forward. A booking made before the human was charged
   for his thinking comes out already overdue, and firing it must not drag the
   match back to when it was made. */
function fakeClock(ctx){
  let now = 0, seq = 0;
  const q = new Map();
  ctx.setTimeout = (fn, ms) => { const id = ++seq; q.set(id, {at: now + (Number(ms) || 0), id: id, fn: fn}); return id; };
  ctx.clearTimeout = id => { q.delete(id); };
  ctx.setInterval = () => 0;
  ctx.clearInterval = () => {};
  return {
    now: () => now,
    next(){ let n = null; for(const t of q.values()) if(!n || t.at < n.at || (t.at === n.at && t.id < n.id)) n = t; return n; },
    /* jump to whatever is due next and let it happen. Hands back how far the
       clock actually moved, so a caller can price a hold without being told
       what it was supposed to be. */
    step(){
      const t = this.next();
      if(!t) return -1;
      const moved = Math.max(0, t.at - now);
      q.delete(t.id);
      now = Math.max(now, t.at);
      try{ t.fn(); }catch(e){ console.log("  timer threw: " + e.message); }
      return moved;
    },
    /* what the human costs, charged by the driver rather than booked by the
       app, because the app has no idea he exists */
    charge(ms){ now += ms; },
  };
}

/* A PERSON, MODELLED, in milliseconds per screen he is asked to act on. These
   are somebody playing on a phone while talking, not somebody being timed:
   reading a Hard question and working out whether you know it is the big one,
   tapping Got it is nearly free, and the private half-minute has never once
   actually been half a minute. */
const HUMAN = {
  h_teams: 9000, h_squad: 14000, h_shape: 6000, h_traits: 9000, h_toss: 3000,
  h_hand: 2000, h_mark: 11000, h_pick: 9000,
  /* THE DUEL IS THE QUICKEST PAIR OF SCREENS IN THE MODE, because neither of
     them has anything on it to work out. Five seconds to put it somewhere, six
     for the keeper because a man guessing dithers and a man answering does
     not. Between them they replace a twelve second question and its judge, and
     they add an h_hand to every shot, which is the phone crossing the table. */
  h_q: 12000, h_judge: 4000, h_aim: 5000, h_dive: 6000,
  h_tackle: 12000, h_tjudge: 4000, h_sub: 8000, h_pens: 9000, h_ft: 3000,
};

(async () => {
  const app = makeInstance("tempo");
  await tick(400);
  run(app, "TEAMS.wc2006 = " + JSON.stringify(R("assets/wc2006/index.json")) + ";");
  run(app, 'DECKS["classic-mc"] = ' + JSON.stringify(R("assets/mc/index.json")) + ";");
  for (const [id, dir] of [["seriea", "seriea"], ["laliga", "laliga"], ["premier", "premier"],
                           ["ere", "eredivisie"], ["bundesliga", "bundesliga"]])
    run(app, "DECKS[" + JSON.stringify(id) + "] = " + JSON.stringify(R("assets/" + dir + "/index.json")) + ";");

  /* THE SAME MATCH EVERY TIME. A timing test that plays a different match on
     every run prints a different number on every run, which is exactly the thing
     it exists to stop: nobody can tell a band that grew by three hundred
     milliseconds from an afternoon that happened to have six more turnovers in
     it. So the dice are pinned, and the numbers printed at the bottom are a
     property of the bands rather than of the run. Pinning them up here rather
     than just above the match matters more than it looks, because the sections
     in between play matches of their own and what they leave behind decides the
     shape of the one that gets timed. The seed is the ninth of July 2006, for no
     reason at all. A band that is drawn from is still drawn from: it is drawn
     from the same place twice, which is all a spread of two hundred is being
     read for. */
  run(app, "(() => { let s = 20060709; Math.random = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; }; })();");

  const clock = fakeClock(app);
  /* the browser setting, answered by the test. The app reads it bare off the
     global through aiStill, once per call, so it can be turned on and off
     under a running match the way a person can turn it on under a running app. */
  const still = on => { app.matchMedia = () => ({matches: !!on, addEventListener(){}, removeEventListener(){}}); };
  still(false);
  const phase = () => ev(app, "S && S.phase");
  const who = () => ev(app, "S && S.h2h && S.h2h.who");
  const stage = () => app.__els["stage"] ? app.__els["stage"].innerHTML : "";

  /* ---------- the human, played by the test ---------- */
  /* He plays like a very ordinary person: the first legal thing, every time. */
  const tap = () => run(app, "(() => { const H = S.h2h; switch(S.phase){" +
    "case 'h_teams': { const n = Object.keys(h2Pool()||{}).filter(c => !H.teams.includes(c)); if(n.length) h2PickTeam(n[0]); return; }" +
    "case 'h_squad': return h2SquadDone();" +
    "case 'h_shape': return h2ShapeDone();" +
    "case 'h_traits': return h2TraitsDone();" +
    "case 'h_toss': return H.tossed ? h2KickOff() : (H.flipping ? null : h2Call('heads'));" +
    "case 'h_hand': return h2HandGo();" +
    "case 'h_mark': return h2MarksDone(true);" +
    "case 'h_pick': { for(let i=0;i<11;i++) if(i !== H.at && !h2IsOff(H.who,i)){ h2Select(i); h2Play(); return; } return; }" +
    "case 'h_q': return h2Reveal();" +
    "case 'h_judge': return h2Judge(Math.random() < .5);" +
    "case 'h_aim': return h2Aim(H2_CORNERS[Math.floor(Math.random() * 4)]);" +
    "case 'h_dive': return h2Dive(H2_CORNERS[Math.floor(Math.random() * 4)]);" +
    "case 'h_tackle': return h2TackleReveal();" +
    "case 'h_tjudge': return h2TackleJudge(Math.random() < .5);" +
    "case 'h_sub': return h2SubDecline();" +
    "case 'h_ft': return h2AfterWhistle();" +
    "case 'h_pens': return h2SoKick();" +
    "} })();");
  /* WHOSE SCREEN IS THIS, phase by phase, the same table ai-test keeps. It has
     to live out here for now because the app does not expose the answer from
     the human's end, and a table kept in two places is a table that goes out of
     step with itself. It is h2ActorOf read the other way round: every line here
     is the mirror of the line there, so a phase the computer does not act in is
     a phase the human does. The shootout reads h2SoNext and not H.who, because
     H.who at that screen is whoever took the LAST kick: get it wrong and the
     human and the driver between them cover nothing and the match sits there. */
  const humanUp = () => {
    const p = phase(), H = ev(app, "S && S.h2h");
    if(!H) return null;
    const mine = (() => {
      switch(p){
        case "h_teams":  return (H.teams[0] == null ? 0 : 1) === 0;
        case "h_squad":  return (H.picking || 0) === 0;
        case "h_shape":  return (H.shaping || 0) === 0;
        case "h_traits": return (H.tset || 0) === 0;
        case "h_toss":   return H.flipping ? false : (H.tossed ? H.who === 0 : true);
        case "h_hand":   return true;
        case "h_mark":   return H.who === 1;
        case "h_pick": case "h_q": case "h_judge": return H.who === 0;
        case "h_aim":    return H.who === 0;
        case "h_dive": case "h_tackle": case "h_tjudge": return H.who === 1;
        case "h_sub":    return !!H.sub && H.sub.w === 0;
        case "h_ft":     return true;
        case "h_pens":   return H.so ? (H.so.first + H.so.n) % 2 === 0 : H.who === 0;
        default: return false;
      }
    })();
    return mine ? p : null;
  };
  /* HAS HE BOOKED A BEAT. There is nothing on the state saying so once it has
     been armed and spent, so the test counts the bookings itself: a decision
     taken during the hold shows up here as a booking that should not exist. */
  run(app, "__booked = 0; var __alw = aiLater; aiLater = function(fn, ms){ __booked++; return __alw(fn, ms); };");
  const booked = () => ev(app, "__booked");
  /* run the match until something is true, charging the human for his taps and
     letting the clock carry everything else. Stops BEFORE tapping when the
     thing is already true, so a caller can hold a screen still and look at it.
     Nobody taps through a hold, including the man holding the phone: there is
     no tap target on that screen and the app is asked whether it is holding
     rather than the test guessing from a flag. */
  const pump = (want, max) => {
    let g = 0;
    while(!want() && g++ < (max || 600)){
      const up = ev(app, "h2Holding()") ? null : humanUp();
      if(up){ clock.charge(HUMAN[up] || 4000); tap(); continue; }
      if(clock.step() < 0) return false;
    }
    return !!want();
  };
  /* driven by the clock alone, for the screens where the whole point is that
     there is nothing for a person to tap */
  const spin = (want, max) => { let g = 0; while(!want() && g++ < (max || 40)) clock.step(); return !!want(); };

  /* =================== reduced motion =================== */
  /* 2.6's rule, and the easy one to get wrong in the generous direction:
     somebody who asked for less movement has not asked to be told nothing. */
  console.log("--- reduced motion drops to the floor, never to nothing ---");
  run(app, "AI_BEAT = AI_NORMAL; AI_TEMPO = 1;");
  still(true);
  const drawn = n => ev(app, "(() => { const o = []; for(let i=0;i<" + n + ";i++) o.push(beat('think')); return o; })()");
  check("a band collapses to its low end", drawn(20).every(v => v === ev(app, "AI_BEATS.think.lo")), drawn(1)[0]);
  check("and not to zero", drawn(1)[0] > 0, drawn(1)[0]);
  check("the question he has to read still gets its floor",
    ev(app, "beat('read', 400)") === ev(app, "AI_BEATS.read.lo"), ev(app, "beat('read', 400)"));
  check("the camera hold keeps its beat with the swing gone",
    ev(app, "h2LandMs()") === ev(app, "H2_LAND_MS") && ev(app, "H2_LAND_MS") > 0, ev(app, "h2LandMs()"));
  check("and the coin still gets long enough to be read",
    ev(app, "h2CoinMs()") === ev(app, "H2_COIN_FLOOR") && ev(app, "H2_COIN_FLOOR") > 0, ev(app, "h2CoinMs()"));
  still(false);
  check("with motion on, the hold is the swing plus the beat",
    ev(app, "h2LandMs()") === ev(app, "H2_SWING_MS + H2_LAND_MS"), ev(app, "h2LandMs()"));
  check("and the coin spins for its full two seconds",
    ev(app, "h2CoinMs()") === ev(app, "H2_COIN_MS"), ev(app, "h2CoinMs()"));
  /* AND THE HARNESS DOOR IS THE ONE THE BEATS USE. AI_BEAT is no longer a pause,
     it is the reference the bands are measured against, so the hold is squeezed
     by the same fraction as everything else the computer does rather than by a
     knob of its own. Twenty-eight other test files lean on that. */
  run(app, "AI_BEAT = 0;");
  check("AI_BEAT at zero collapses the hold the way it collapses a band",
    ev(app, "h2LandMs()") === 0, ev(app, "h2LandMs()"));
  run(app, "AI_BEAT = 4;");
  check("and at four it is out of a test's way",
    ev(app, "h2LandMs()") < 20 && ev(app, "h2LandMs()") > 0, ev(app, "h2LandMs()"));
  run(app, "AI_BEAT = AI_NORMAL;");

  /* =================== and what the stylesheet does with it =================== */
  /* THESE THREE ARE READ OUT OF THE SOURCE because there is no layout engine in
     here to ask, and all three were found by reading CSS rather than by running
     anything. A green suite is not evidence about a rule that only exists under
     a media query nobody's test browser is in. */
  console.log("\n--- and the stylesheet keeps its side of it ---");
  const css = fs.readFileSync(path.join(REPO, "index.html"), "utf8");
  /* THE RING IS CENTRED BY ITS OWN ANIMATION AND BY NOTHING ELSE. .h2ring has
     left:50% and no transform; the translate(-50%,50%) that puts the marker
     under the man's feet lives inside @keyframes h2ring. animation:none on its
     own therefore moves the only thing on the screen saying who has the ball
     half its width to the right of the man it is marking. */
  check("killing the ring's animation puts its transform back by hand",
    /\.h2ring,\.h2pitch\.landing \.h2ring\{animation:none;transform:translate\(-50%,50%\)\}/.test(css),
    "the reduced-motion ring has no transform on it");
  /* BALL 2 also held the sprite's hard rim out of h2lightup here, because an
     animation beats a plain declaration whatever the specificity says and the
     sixteen-bit rim was a plain one. There is no sprite in BALL 3, so h2lightup
     ending on the night look's own outline is the whole of it. */
  check("the coin's spin is dropped for somebody who asked for less of it",
    /\.h2coin\.flip,\.h2coin\.landed,\.cshadow\.flip\{animation:none\}/.test(css),
    "the coin still spins under reduced motion");

  /* =================== the toss =================== */
  console.log("\n--- the computer says what it called before the coin goes up ---");
  /* the caller is always player 0, so this is the one setup where the computer
     is the one being asked. Nothing shipped reaches it yet, because solo and
     the Cup both put the human in slot 0, which is exactly why it needs a test:
     the branch is real, it is just not on any road today. */
  run(app, 'S = freshState(["It","You"], false, "classic", 0, "pitch", true); ' +
           'S.players[0].ai = "route1"; S.players[0].level = "ere"; h2Start(); ' +
           'h2AsActor(() => { h2PickTeam("Netherlands"); h2PickTeam("Italy"); }); S.phase = "h_toss"; render();');
  check("it calls one of them", spin(() => !!ev(app, "S.h2h.call")) &&
    ["heads", "tails"].indexOf(ev(app, "S.h2h.call")) > -1, ev(app, "S.h2h.call"));
  check("and the coin has not moved yet", ev(app, "S.h2h.flipping") === false, ev(app, "S.h2h.flipping"));
  check("the screen says what he called", /calls (heads|tails)\./.test(stage()), stage().slice(0, 200));
  check("and offers no buttons to a man who has already called",
    stage().indexOf("h2Call(") === -1, "the call buttons are still there");
  check("a beat later it goes up", spin(() => ev(app, "S.h2h.flipping") === true), ev(app, "S.h2h.flipping"));
  const up = clock.now();
  check("then it lands", spin(() => ev(app, "S.h2h.tossed") === true), phase() + "/" + ev(app, "S.h2h.tossed"));
  check("after the length of the animation and not a frame less",
    clock.now() - up === ev(app, "H2_COIN_MS"), clock.now() - up);
  /* AND A HUMAN IS NOT MADE TO WAIT FOR HIS OWN CALL. He knows what he tapped,
     so for him the call and the spin are still one instant, exactly as before. */
  run(app, 'S = freshState(["You","It"], false, "classic", 0, "pitch", true); ' +
           'S.players[1].ai = "route1"; S.players[1].level = "ere"; h2Start(); ' +
           'h2AsActor(() => { h2PickTeam("Netherlands"); h2PickTeam("Italy"); }); S.phase = "h_toss"; render(); h2Call("heads");');
  check("your own coin goes up on the tap", ev(app, "S.h2h.flipping") === true, ev(app, "S.h2h.flipping"));

  /* =================== the favourite =================== */
  console.log("\n--- each of them has a side he would rather have ---");
  const MEN = ev(app, "JSON.parse(JSON.stringify(AI_MEN))");
  check("Route One is England", MEN.route1.side === "England", MEN.route1.side);
  check("the Bus is Italy", MEN.bus.side === "Italy", MEN.bus.side);
  check("Tiki-taka is Spain", MEN.tiki.side === "Spain", MEN.tiki.side);
  check("the Pressers are Germany", MEN.press.side === "Germany", MEN.press.side);
  /* AND THE TWO TABLES DO NOT ARGUE. cupStyle answers "how does this country
     play", AI_MEN.side answers "which country would he rather be", and they are
     not inverses of each other: Brazil plays tiki and tiki would rather be
     Spain, which is two true things about football rather than a contradiction.
     What WOULD be a contradiction is a favourite whose own country is down as
     playing somebody else's style, so every favourite is pinned to the style
     that wants it, and Brazil is left exactly where it was. */
  for(const id of Object.keys(MEN))
    check(MEN[id].side + " plays " + id + " when the Cup deals it out",
      ev(app, "cupStyle(" + JSON.stringify(MEN[id].side) + ")") === id,
      ev(app, "cupStyle(" + JSON.stringify(MEN[id].side) + ")"));
  check("and Brazil still plays tiki as well", ev(app, 'cupStyle("Brazil")') === "tiki",
    ev(app, 'cupStyle("Brazil")'));

  const picks = (id, first) => {
    run(app, 'S = freshState(["You","It"], false, "classic", 0, "pitch", true); ' +
             'S.players[1].ai = "' + id + '"; S.players[1].level = "ere"; h2Start(); ' +
             'h2PickTeam(' + JSON.stringify(first) + '); render();');
    spin(() => ev(app, "S.h2h.teams[1]") != null);
    return ev(app, "S.h2h.teams[1]");
  };
  check("and he takes it when it is going", picks("tiki", "Netherlands") === "Spain", picks("tiki", "Netherlands"));
  const taken = picks("bus", "Italy");
  check("somebody else having it is not a problem he sits down over",
    taken != null && taken !== "Italy", taken);
  /* THE SETUP SCREEN SAYS SO, and only where it can come true. The note renders
     for any pitch-mode setup and a league pool is clubs, so a sentence about
     England in front of a Premier League match is a promise the pool cannot
     keep. The line is dropped rather than softened. */
  run(app, 'setupMode = "classic"; setupPlay = "pitch"; setupAi = "route1";');
  check("the setup screen names the side he would take",
    ev(app, "aiFavLine('route1')").indexOf("England") > -1, ev(app, "aiFavLine('route1')"));
  run(app, 'setupMode = "premier";');
  check("and says nothing about it when the pool is clubs",
    ev(app, "aiFavLine('route1')") === "", ev(app, "aiFavLine('route1')"));
  run(app, 'setupMode = "classic";');

  /* =================== the scorebug =================== */
  console.log("\n--- his name is the personality and his flag is the country ---");
  run(app, 'S = freshState(["Martijn","Route One"], false, "classic", 0, "manager", true); ' +
           'S.players[1].ai = "route1"; S.players[1].level = "ere"; h2Start(); ' +
           'h2AsActor(() => { h2PickTeam("Netherlands"); h2PickTeam("Italy"); }); S.h2h.tossed = true; S.phase = "h_pick"; render();');
  const bug = ev(app, "h2ScoreHTML()");
  check("the name in the bug is his personality", bug.indexOf("Route One") > -1, bug.slice(0, 300));
  check("the badge is Italy's and not a default",
    bug.indexOf(ev(app, "h2Badge(TEAMS.wc2006.Italy.flag)")) > -1, bug.slice(0, 300));
  check("and the abbreviation is the country's too",
    bug.indexOf(">" + ev(app, "TEAMS.wc2006.Italy.abbr") + "<") > -1, ev(app, "h2Abbr(1)"));

  /* =================== the card =================== */
  console.log("\n--- the question card arrives, once, whoever is answering ---");
  const board = w => run(app,
    'S = freshState(["Martijn","Route One"], false, "classic", 0, "manager", true); ' +
    'S.players[1].ai = "route1"; S.players[1].level = "ere"; h2Start(); ' +
    'h2AsActor(() => { h2PickTeam("Netherlands"); h2PickTeam("Italy"); }); S.h2h.tossed = true; ' +
    'S.h2h.who = ' + w + '; S.h2h.at = 0; S.h2h.markedAgainst = ' + w + '; ' +
    'h2Landing = false; h2Lit = false; clearTimeout(h2LandTimer); h2LandTimer = null; ' +
    'S.phase = "h_pick"; render();');
  board(0);
  tap();                                   // he picks a man and plays it
  const mineFirst = stage();
  run(app, "render();");
  check("your card slides in", /class="qcard qin"/.test(mineFirst), mineFirst.slice(-260));
  check("and the redraw underneath it does not do it again",
    /class="qcard"/.test(stage()) && stage().indexOf("qin") === -1, stage().slice(-260));
  board(1);
  check("his question came round", pump(() => phase() === "h_q", 40), phase());
  check("and his card slides in exactly the same way", /class="qcard qin"/.test(stage()), stage().slice(-260));

  /* =================== the transition =================== */
  console.log("\n--- the pitch turns, and then it holds ---");
  /* a turnover made on purpose: he is on the ball, plays one, gets it wrong, so
     it is theirs where he stood and the camera swings */
  board(0);
  run(app, "h2Select(6); h2Play(); h2Reveal(); h2Judge(false); render();");
  check("it went to the other end", pump(() => phase() === "h_pick" && who() === 1), phase() + "/" + who());
  check("the pitch is drawn turned", /h2pitch[^"]*turned/.test(stage()), stage().slice(0, 240));
  check("and holding on the turn",
    ev(app, "h2Holding()") === true && /h2pitch[^"]*landing/.test(stage()), ev(app, "h2Landing"));
  check("with nothing on it to tap", stage().indexOf("h2hit") === -1, "there is still a tap target");
  check("the caption says whose ball it is", /Route One has it on/.test(stage()), stage().slice(-300));
  check("and does not tell you it is yours when it is not",
    stage().indexOf("Your ball.") === -1, "it said Your ball on his possession");
  /* the chrome is the one thing that does NOT go, because a row of buttons that
     turns up a beat after the pitch shoves the whole pitch down the phone at the
     moment the eye is trying to find a ball on it */
  /* the sixteen-bit button used to be the second of the two named here and the
     skin is not a setting any more, so it looks for the two this line has always
     said it was looking for */
  check("but the view and sound buttons have not moved",
    stage().indexOf("h2ToggleView()") > -1 && stage().indexOf("h2ToggleSound()") > -1, "the toggles went");
  const bookedAtHold = booked();
  /* A REDRAW IN THE MIDDLE OF THE HOLD DOES NOT WAKE HIM UP, and this is the
     half of the gate worth asserting rather than assuming: the screen redraws
     constantly, a toast landing or a thumb on the view toggle is enough, and
     every render ends in aiTick. If the gate were only "he has not been asked
     yet" it would pass here and fail in somebody's match. */
  run(app, "render();");
  check("a redraw during the hold does not start him deciding",
    booked() === bookedAtHold && ev(app, "h2Landing") === true,
    (booked() - bookedAtHold) + " beats, holding " + ev(app, "h2Landing"));
  /* measured as a distance on the clock rather than as one step, because a
     couple of toasts from earlier in the possession are sitting in the queue
     already overdue and firing one of those moves nothing. Bookings are counted
     per step and only credited when the hold was STILL on afterwards, because
     the step that ends the hold is the step he is supposed to start on. */
  const t1 = clock.now();
  let during = 0, g1 = 0;
  while(ev(app, "h2Landing") === true && g1++ < 60){
    const b = booked();
    if(clock.step() < 0) break;
    if(ev(app, "h2Landing") === true && booked() > b) during++;
  }
  const landed = ev(app, "h2Landing") === false;
  const held = clock.now() - t1;
  check("the hold is the swing plus a beat", landed && held === ev(app, "h2LandMs()"),
    held + " wanted " + ev(app, "h2LandMs()"));
  check("and nothing was decided inside it", during === 0, during + " beats were booked");
  check("then the men come up",
    ev(app, "h2Landing") === false && /h2pitch[^"]*lit/.test(stage()) && stage().indexOf("h2hit") > -1,
    ev(app, "h2Landing") + " / " + stage().slice(0, 240));
  check("and only now does he start deciding", booked() > bookedAtHold, "still nothing booked");

  console.log("\n--- and it comes back the same way ---");
  check("the ball came back to you", pump(() => phase() === "h_pick" && who() === 0), phase() + "/" + who());
  check("on a pitch that is holding", ev(app, "h2Holding()") === true, ev(app, "h2Landing"));
  check("with nothing to tap yet", stage().indexOf("h2hit") === -1, "there is still a tap target");
  check("and it says so out loud", /Your ball\./.test(stage()), stage().slice(-300));
  check("in the voice the hold reserves for it", /class="h2where h2land"/.test(stage()), stage().slice(-300));
  const t2 = clock.now();
  spin(() => ev(app, "h2Landing") === false);
  check("and a beat later the men are yours again",
    clock.now() - t2 === ev(app, "h2LandMs()") && stage().indexOf("h2hit") > -1,
    (clock.now() - t2) + "ms / " + stage().slice(0, 200));
  check("and it has stopped shouting about it",
    /Your ball\./.test(stage()) === false && /Martijn has it on/.test(stage()), stage().slice(-300));

  /* =================== the whistle =================== */
  console.log("\n--- and the whistle does not go on a dimmed pitch ---");
  /* THE ONE THE REVIEW CAUGHT, and without the gate it was on the screen at the
     end of five matches in six. The swing is armed the moment possession
     changes, but it is not always DRAWN on the screen that wants a hold: the
     restart after a goal swings the camera and the same call finds the clock has
     run out, so the full-time pitch is the render that spends the turn. It must
     not hold, because the timer that would take the dimming off only ever
     re-renders h_pick and nothing would ever take it off again.
     Driven straight at rather than waited for: how often a seeded match happens
     to end on a late goal is the dice, and this rule is not. */
  board(0);
  run(app, 'S.h2h.min = H2_MINUTES; S.h2h.scorer = 1; S.players[1].score = 1; ' +
           'S.phase = "h_goal"; h2KickOn();');
  check("the whistle went", phase() === "h_ft", phase());
  check("and the full-time pitch is drawn turned, as it always was",
    /h2pitch[^"]*turned/.test(stage()), stage().slice(0, 240));
  check("but it is not left wearing the hold",
    /h2pitch[^"]*landing/.test(stage()) === false, stage().slice(0, 240));
  check("and the hold was abandoned rather than left half-running",
    ev(app, "h2Landing") === false && ev(app, "!h2LandTimer"),
    ev(app, "h2Landing") + " / timer " + ev(app, "!!h2LandTimer"));

  /* =================== a whole match, on the clock =================== */
  console.log("\n--- a whole match, every beat at its real length ---");
  /* RE-SEEDED HERE AS WELL AS AT THE TOP, and that is not belt and braces. The
     printed number has to be a property of the bands rather than of how many
     dice the sections above happened to spend, or adding one check up there
     silently moves the match down here and the drift guard is guarding the
     test's own history. Same seed, so the match below is the same match
     whatever else this file grows. */
  run(app, "(() => { let s = 20060709; Math.random = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; }; })();");
  run(app, "AI_BEAT = AI_NORMAL; AI_TEMPO = 1;");
  /* Tallied when a beat FIRES and never when it is booked, because aiLater
     clears whatever was standing and drops anything whose screen has moved: a
     beat that gets superseded costs nobody a millisecond, and counting it would
     flatter the bands. The length is read back off aiPendingMs, which is the
     pause aiLater actually scheduled, rather than drawn a second time here:
     the bands are random, and a second draw would be a different number. */
  run(app, "__ms = 0; __n = 0; __sched = []; __wrong = 0;");
  run(app, "aiLater = function(fn, ms){" +
           " var p = (S && S.phase) || '?', box = {};" +
           " __sched.push(p);" +
           " __alw(function(){ __ms += box.d; __n++; if(((S && S.phase) || '?') !== p) __wrong++; fn(); }, ms);" +
           " box.d = aiPendingMs; };");

  run(app, 'S = freshState(["Martijn","Route One"], false, "classic", 0, "manager", true); ' +
           'S.players[1].ai = "route1"; S.players[1].level = "ere"; h2Start(); render();');

  let human = 0, holds = 0, swung = 0, unheld = 0, strayHold = 0, guard = 0;
  const seen = {};
  const t0 = clock.now();
  while(phase() !== "results" && guard++ < 30000){
    const p = phase();
    seen[p] = (seen[p] || 0) + 1;
    const s = stage();
    /* every render that draws a turned pitch on the screen the hold belongs to
       has to be holding on it, or the swing and the next screen are back on the
       same frame */
    if(/h2pitch[^"]*turned/.test(s) && p === "h_pick"){ swung++; if(!/h2pitch[^"]*landing/.test(s)) unheld++; }
    /* AND THE HOLD NEVER TURNS UP ANYWHERE ELSE. Asking only that a turned pitch
       is a holding one is the wrong way round: a goal that wins the match swings
       the camera and then the whistle goes, so the full-time pitch is drawn
       turned and must NOT hold, because the timer only re-renders h_pick and
       nothing would ever take the dimming off it again. */
    if(/h2pitch[^"]*landing/.test(s) && p !== "h_pick") strayHold++;
    const act = ev(app, "h2Holding()") ? null : humanUp();
    if(act){ const c = HUMAN[act] || 4000; clock.charge(c); human += c; tap(); continue; }
    const moved = clock.step();
    if(moved < 0){ console.log("  the match stalled at " + p); break; }
    holds += moved;
  }
  const total = clock.now() - t0;
  const beats = ev(app, "__ms"), n = ev(app, "__n");
  const sched = ev(app, "__sched");

  console.log("");
  console.log("    full time at             " + ev(app, "S.h2h && S.h2h.min") + " minutes, " +
              ev(app, "S.players[0].score") + "-" + ev(app, "S.players[1].score"));
  console.log("    the computer thought for " + (beats / 1000).toFixed(1) + "s over " + n +
              " decisions, " + Math.round(beats / Math.max(1, n)) + "ms each");
  console.log("    swings, holds, the coin  " + ((holds - beats) / 1000).toFixed(1) + "s over " + swung + " swings");
  console.log("    the modelled human       " + (human / 1000).toFixed(1) + "s");
  console.log("    WHOLE MATCH              " + mmss(total) + "   (" + (total / 1000).toFixed(1) + "s)");
  console.log("");

  check("the match reached the final whistle", phase() === "results", phase() + " after " + guard + " steps");
  check("and there was a camera swing in it to look at", swung > 0, swung);
  check("every swing held on the turn before the next screen", unheld === 0, unheld + " did not");
  check("and no other screen was left wearing the hold", strayHold === 0, strayHold + " were");
  /* A REGRESSION GUARD RATHER THAN A DISCOVERY, and worth saying so: aiLater
     itself drops a callback whose cue has moved, so this can only go non-zero if
     that guard is weakened. It is here because it is cheap and because the bug
     it watches for fired once in every match before the cue existed. */
  check("no beat ever fired into a screen it was not booked for",
    ev(app, "__wrong") === 0, ev(app, "__wrong") + " did");
  /* THE CELEBRATION IS NOT HIS TO CUT SHORT. h_strike and h_goal run on timers
     of their own, h2StrikeHold and h2GoalHold, and the driver has no branch for
     either; booking a beat on top of one would put a decision on the screen
     while the ball was still in the net. */
  const onHolds = sched.filter(p => p === "h_strike" || p === "h_goal").length;
  check("and he booked nothing on top of a strike or a goal", onHolds === 0, onHolds + " beats");
  check("there was at least one of those to sit through", (seen.h_strike || 0) > 0, "nothing was struck all match");
  /* THE DRIFT GUARD, and it is per decision rather than per match on purpose:
     how many turnovers a match happens to have is the dice, how long he takes
     over one of them is the design. 620ms flat was the old single beat and a
     person is nearer a second and a half. */
  const each = beats / Math.max(1, n);
  check("he takes a human length over a decision", each > 700 && each < 4000, Math.round(each) + "ms");
  check("and a whole match is inside twelve minutes", total < 12 * 60000, mmss(total));
  check("without being over inside five", total > 5 * 60000, mmss(total));

  console.log("\n" + (fails ? fails + " FAILED" : "ALL PASS"));
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
