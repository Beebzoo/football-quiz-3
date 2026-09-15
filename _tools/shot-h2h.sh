#!/bin/sh
# Screenshot One on One at phone width, in whatever state you name.
#
#   sh _tools/shot-h2h.sh out.png [scale] [state] [scrollpx] [scrubms]
#
#   scrollpx  shift the app up inside the frame, to inspect something that
#             falls below the fold at a high scale
#   scrubms   pause every animation on the page and set it to this millisecond.
#             The only reliable way to frame a moving thing: headless virtual
#             time renders a mid-animation frame from a clock the main thread
#             does not share, so the late-firing states below land wherever
#             they land. Scrubbed is exact. The scrub happens 2800ms after the
#             state is set up and everything has to be over well inside the
#             5000ms budget or the scrubbed frame is never drawn, so the states
#             built for it (inflight chalgo run runw runlost) fire at 2500. The
#             older late states (strike save goal foul) still fire at 3500 and
#             up and are caught by luck, as they always were.
#
#   scale   1.0 to inspect detail, .6 to see a whole phone screen
#   state   the menu:    menu modes setup setupb board qcard clubs clubpitch
#           kicking off: teams toss flip landed pick sel att flat nl it
#           the tackle:  hand mark chal chalgo chalfar chalflat foul cards
#           the press:   heat press
#           a ball:      inflight run runw runlost
#           a shot:      shot strike save goal
#           the bench:   sub subgk
#           the end:     ft pens penq over pensend
#           pick one:    mcq
#           the dugout:  dugmenu dugout dugshape dugline dugboth dugpress dugbus
#           every shape: shape4231 shape442 shape433 shape352 shape532
#           every line:  linehigh linemid linelow
#           the shot at
#           every line:  shotlinehigh shotlinemid shotlinelow
#
#           The shape and line states are generated from the app's own tables,
#           so a new formation gets a state without anyone editing this list.
#           A line state selects a long ball so the bar shows the moved price;
#           a shotline state stands the striker up so the Shoot button does.
#
#           press is the three-short-balls contest; chal* is the mark-based
#           tackle. Two different rules that both land on h_tackle.
#
# WHY THIS EXISTS. One on One is the only thing in the repo that cannot be
# checked by reading it. Four separate bugs in this mode were invisible in the
# code and obvious in a picture: a stage with max-width but no width collapsed
# the pitch to nothing; overflow:hidden silently flattened the 3D and laid the
# players down instead of standing them up; the men were built out of spans, so
# every part of them ignored width and height; and the side nets were rotated
# towards the camera, splaying out past the posts like wings. Every one of them
# took seconds to spot once rendered.
#
# Two things this repo learned the hard way, both worked around here: headless
# Edge ignores --window-size (it always renders about 492x485), so the app is
# loaded inside a fixed-width iframe and scaled to fit; and file:// fetches
# fail, so the folder has to actually be served.
#
# Transient animations are hard to catch: the shot fires at a fixed virtual
# time, so a 1.6s celebration is usually over or not yet started. The states
# that need it (strike, save, goal) trigger late on purpose. Expect to nudge
# those numbers rather than to get it first time.
set -e
REPO=$(cd "$(dirname "$0")/.." && pwd)
OUT="$1"
SCALE="${2:-.62}"
STATE="${3:-pick}"
SCROLL="${4:-0}"
SCRUB="${5:-}"
PORT=${PORT:-8811}   # override to reuse a server you already have up
EDGE="/c/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"

cd "$REPO"

SHOT_STATE="$STATE" SHOT_SCRUB="$SCRUB" node -e '
const fs=require("fs");
let state =process.env.SHOT_STATE||"pick";
const scrub=parseInt(process.env.SHOT_SCRUB||"",10)||0;
const base=`S=freshState(["Martijn","Bram"],false,"classic",0,"pitch",false); h2TackleOn=false; h2Start();`;
const picked=`${base} h2PickTeam("Netherlands"); h2PickTeam("Italy");`;
const nl=`${picked} S.h2h.tossed=true;`;
const nl2=`${picked} S.h2h.tossed=true;`;
const setups={
  /* the front door and the classic board: not One on One at all, but this is
     the only rendering harness in the repo and a menu that has gone unreadable
     is exactly as invisible in the code as a collapsed pitch was */
  menu:  `S=null; render();`,
  clubs: `S=freshState(["Martijn","Bram"],false,"premier",0,"pitch",false); h2TackleOn=false; h2Start(); render();`,
  clubpitch: `S=freshState(["Martijn","Bram"],false,"premier",0,"pitch",false); h2TackleOn=false; h2Start(); h2PickTeam("Liverpool"); h2PickTeam("Everton"); S.h2h.tossed=true; S.h2h.who=0; S.h2h.at=0; S.phase="h_pick"; render(); h2Select(7);`,
  modes: `S=null; modesOpen=true; setupMode="classic"; render();`,
  setup: `S=null; setupMode="classic"; setupPlay="pitch"; render();`,
  setupb:`S=null; setupMode="classic"; setupPlay="board"; render();`,
  board: `S=freshState(["Martijn","Bram","Ale"],false,"classic",100,"board",false); S.phase="pick"; render();`,
  qcard: `S=freshState(["Martijn","Bram","Ale"],false,"classic",100,"board",false); S.phase="pick"; render(); pickTier("hard");`,
  teams: `${base} render();`,
  hand:  `${nl2} h2TackleOn=true; S.h2h.who=0; S.h2h.at=0; h2Hand(1,"h_mark");`,
  mark:  `${nl2} h2TackleOn=true; S.h2h.who=0; S.h2h.at=0; S.h2h.hand=null; S.phase="h_mark"; render(); h2Mark(5); h2Mark(9);`,
  /* the challenge: marks standing, the ball played into one of them. chal is
     the FROZEN pose the question is asked over; chalgo fires late so the shot
     lands mid-slide, the same trick strike and save use. */
  chal:  `${nl2} h2TackleOn=true; S.h2h.who=0; S.h2h.at=5; S.h2h.marks=[9]; S.h2h.markedAgainst=0; S.phase="h_pick"; render(); h2Select(9); h2Play();`,
  chalgo:`${nl2} h2TackleOn=true; S.h2h.who=0; S.h2h.at=5; S.h2h.marks=[9]; S.h2h.markedAgainst=0; S.phase="h_pick"; render(); setTimeout(()=>{ h2Select(9); h2Play(); }, 2500);`,
  chalfar:`${nl2} h2TackleOn=true; S.h2h.who=0; S.h2h.at=0; S.h2h.marks=[9]; S.h2h.markedAgainst=0; S.phase="h_pick"; render(); h2Select(9); h2Play();`,
  foul:  `${nl2} h2TackleOn=true; S.h2h.who=0; S.h2h.at=5; S.h2h.marks=[9]; S.h2h.markedAgainst=0; S.phase="h_pick"; render(); h2Select(9); h2Play(); setTimeout(()=>{ h2TackleReveal(); h2TackleJudge(false); }, 4000);`,
  chalflat:`h2Tilt=false; ${nl2} h2TackleOn=true; S.h2h.who=0; S.h2h.at=5; S.h2h.marks=[9]; S.h2h.markedAgainst=0; S.phase="h_pick"; render(); h2Select(9); h2Play();`,
  cards: `${nl2} h2TackleOn=false; S.h2h.who=0; S.h2h.at=5; S.h2h.cards=[{},{}]; S.h2h.cards[0][1]=1; S.h2h.cards[0][6]=2; S.h2h.off=[[6],[]]; S.phase="h_pick"; render();`,
  toss:  `${picked} render();`,
  flip:  `${picked} render(); h2Call("heads");`,
  landed:`${picked} render(); h2Call("heads"); h2Land();`,
  pick:  `${base} S.h2h.tossed=true; S.h2h.who=0; S.h2h.at=0; S.phase="h_pick"; render();`,
  sel:   `${base} S.h2h.tossed=true; S.h2h.who=0; S.h2h.at=0; S.phase="h_pick"; render(); h2Select(5);`,
  att:   `${base} S.h2h.tossed=true; S.h2h.who=0; S.h2h.at=9; S.phase="h_pick"; render();`,
  flat:  `h2Tilt=false; ${nl} S.h2h.who=0; S.h2h.at=0; S.phase="h_pick"; render();`,
  nl:    `${nl} S.h2h.who=0; S.h2h.at=0; S.phase="h_pick"; render(); h2Select(7);`,
  it:    `${nl} S.h2h.who=1; S.h2h.at=0; S.phase="h_pick"; render(); h2Select(7);`,
  heat:  `${nl} S.h2h.who=0; S.h2h.at=5; S.h2h.safe=3; S.phase="h_pick"; render(); h2Select(6);`,
  /* THE PRESS (three short balls draw a man), which is not the tackle: the
     mark-based one is chal / chalgo / chalfar / chalflat / foul. This state
     was called `tackle` back when the press was, and cost somebody a trip
     looking for a challenge in it. */
  press: `${nl} S.h2h.who=0; S.h2h.at=5; S.h2h.safe=3; S.phase="h_pick"; render(); h2Select(6); h2Play();`,
  inflight:`${nl} S.h2h.who=0; S.h2h.at=0; S.phase="h_pick"; render(); setTimeout(()=>{ h2Select(5); h2Play(); h2Reveal(); h2Judge(true); }, 2500);`,
  shot:  `${nl} S.h2h.who=0; S.h2h.at=9; S.phase="h_pick"; render(); h2Shoot(); h2Reveal(); h2Judge(true);`,
  strike:`${nl} S.h2h.who=0; S.h2h.at=9; S.phase="h_pick"; render(); h2Shoot(); h2Reveal(); h2Judge(true); h2SaveReveal(); setTimeout(()=>h2SaveJudge(false), 3700);`,
  save:  `${nl} S.h2h.who=0; S.h2h.at=9; S.phase="h_pick"; render(); h2Shoot(); h2Reveal(); h2Judge(true); h2SaveReveal(); setTimeout(()=>h2SaveJudge(true), 3800);`,
  goal:  `${nl} S.h2h.who=0; S.h2h.at=9; S.phase="h_pick"; render(); setTimeout(()=>{ h2Shoot(); h2Reveal(); h2Judge(true); h2SaveReveal(); h2SaveJudge(false); }, 3500);`,
  /* the runs (1400ms): scrub to 450 for the run out, 840 for the take, 1300 for the trot home */
  run:    `${nl} S.h2h.who=0; S.h2h.at=7; S.phase="h_pick"; render(); setTimeout(()=>{ h2Select(9); h2Play(); h2Reveal(); h2Judge(true); }, 2500);`,
  runw:   `${nl} S.h2h.who=0; S.h2h.at=6; S.phase="h_pick"; render(); setTimeout(()=>{ h2Select(8); h2Play(); h2Reveal(); h2Judge(true); }, 2500);`,
  /* The Dugout: the question comes from the receivers career, so it fires
     late enough for the league decks to have landed. */
  dugout: `S=freshState(["Martijn","Bram"],false,"classic",0,"manager",false); h2TackleOn=false; h2Start(); h2PickTeam("Italy"); h2PickTeam("Costa Rica"); S.h2h.tossed=true; setTimeout(()=>{ S.h2h.who=0; S.h2h.at=5; S.phase="h_pick"; render(); h2Select(2); h2Play(); }, 2200);`,
  /* the private screen in The Dugout: marks and the line, or just the line */
  /* picking a shape, and the pitch once a side is in a 5-3-2 */
  /* BALL 2 had these screens twice over, once in daylight, because there were
     two palettes to photograph. One look, one set of states. */
  dugshape:`S=freshState(["Martijn","Bram"],false,"classic",0,"manager",false); h2TackleOn=false; h2Start(); h2PickTeam("Netherlands"); h2PickTeam("Italy"); render();`,
  dugbus:`S=freshState(["Martijn","Bram"],false,"classic",0,"manager",false); h2TackleOn=false; h2Start(); h2PickTeam("Netherlands"); h2PickTeam("Italy"); S.h2h.tossed=true; S.h2h.form=["4-3-3","5-3-2"]; S.h2h.who=0; S.h2h.at=0; S.h2h.markedAgainst=0; S.phase="h_pick"; render(); h2Select(9);`,
  dugline:`S=freshState(["Martijn","Bram"],false,"classic",0,"manager",false); h2TackleOn=false; h2Start(); h2PickTeam("Netherlands"); h2PickTeam("Italy"); S.h2h.tossed=true; S.h2h.who=0; h2KickOff(); h2HandGo();`,
  dugboth:`S=freshState(["Martijn","Bram"],false,"classic",0,"manager",false); h2TackleOn=true; h2Start(); h2PickTeam("Netherlands"); h2PickTeam("Italy"); S.h2h.tossed=true; S.h2h.who=0; h2KickOff(); h2HandGo(); h2SetLine("low");`,
  dugpress:`S=freshState(["Martijn","Bram"],false,"classic",0,"manager",false); h2TackleOn=false; h2Start(); h2PickTeam("Netherlands"); h2PickTeam("Italy"); S.h2h.tossed=true; S.h2h.line=["mid","high"]; S.h2h.who=0; S.h2h.at=5; S.h2h.markedAgainst=0; S.phase="h_pick"; render(); h2Select(7);`,
  dugmenu:`S=null; setupMode="classic"; setupPlay="manager"; render();`,
  /* the midfield runs: the eight off their ten, the ten off their eight */
  run8:  `${nl} S.h2h.who=0; S.h2h.at=5; S.phase="h_pick"; render(); setTimeout(()=>{ h2Select(6); h2Play(); h2Reveal(); h2Judge(true); }, 1200);`,
  run10: `${nl} S.h2h.who=0; S.h2h.at=5; S.phase="h_pick"; render(); setTimeout(()=>{ h2Select(7); h2Play(); h2Reveal(); h2Judge(true); }, 1200);`,
  /* he is still up there a beat later, with the ball, rather than back in the shape */
  held:  `${nl} S.h2h.who=0; S.h2h.at=7; S.phase="h_pick"; render(); setTimeout(()=>{ h2Select(9); h2Play(); h2Reveal(); h2Judge(true); }, 1200);`,
  /* and drops back into it when he plays it away */
  back:  `${nl} S.h2h.who=0; S.h2h.at=7; S.phase="h_pick"; render(); setTimeout(()=>{ h2Select(9); h2Play(); h2Reveal(); h2Judge(true); setTimeout(()=>{ h2Select(7); h2Play(); h2Reveal(); h2Judge(true); }, 1300); }, 1200);`,
  runlost:`${nl} S.h2h.subs=[0,0]; S.h2h.who=0; S.h2h.at=7; S.phase="h_pick"; render(); setTimeout(()=>{ h2Select(9); h2Play(); h2Reveal(); h2Judge(false); }, 2500);`,
  /* the bench, the whistle and the shootout */
  sub:   `${nl} S.h2h.who=0; S.h2h.at=5; S.phase="h_pick"; render(); h2Select(7); h2Play(); h2Reveal(); h2Judge(false);`,
  subgk: `${nl} S.h2h.who=0; S.h2h.at=9; S.phase="h_pick"; render(); h2Shoot(); h2Reveal(); h2Judge(true); h2SaveReveal(); h2SaveJudge(false);`,
  ft:    `${nl} S.h2h.who=0; S.h2h.at=5; S.h2h.min=85; S.players[0].score=1; S.phase="h_pick"; render(); h2Select(7); h2Play(); h2Reveal(); h2Judge(true);`,
  pens:  `${nl} S.h2h.who=0; S.h2h.at=5; S.h2h.min=90; S.players[0].score=1; S.players[1].score=1; S.phase="h_pick"; h2Whistle(); h2AfterWhistle(); S.h2h.so.kicks=[[1,0],[1]]; S.h2h.so.n=3; render();`,
  penq:  `${nl} S.h2h.who=0; S.h2h.at=5; S.h2h.min=90; S.players[0].score=1; S.players[1].score=1; S.phase="h_pick"; h2Whistle(); h2AfterWhistle(); h2SoKick();`,
  over:  `${nl} S.h2h.who=0; S.h2h.at=5; S.h2h.min=90; S.players[0].score=1; S.players[1].score=1; S.phase="h_pick"; h2Whistle(); h2AfterWhistle(); h2SoKick(); h2Reveal(); setTimeout(()=>h2Judge(false), 3700);`,
  pensend:`${nl} S.h2h.who=0; S.h2h.at=5; S.h2h.min=90; S.players[0].score=1; S.players[1].score=1; S.phase="h_pick"; h2Whistle(); h2AfterWhistle(); S.h2h.so.kicks=[[1,1,1],[0,0,0]]; S.h2h.so.n=6; h2SoEnd();`,
  mcq:   `S=freshState(["Martijn","Bram"],false,"classic",0,"pitch",true); h2TackleOn=false; h2Start(); S.h2h.teams=["Netherlands","Italy"]; S.h2h.tossed=true; S.h2h.who=0; S.h2h.at=0; S.phase="h_pick"; render(); h2Select(5); h2Play();`,
};

/* ONE STATE PER SHAPE AND PER LINE, generated rather than typed, so the sixth
   formation gets its picture for free and nobody has to remember to add it.
   The shape states put both sides in the same formation at kick-off, because
   the thing being checked is whether the eleven draw where the table says.
   The line states leave the attacker on a normal line, set the DEFENDER to
   the one being looked at, and select a long ball, so the price the bar shows
   is the price the line moved. */
/* the results screen with a scouting report on it: play six balls, three of
   them lost, then blow the whistle */
setups.report = `S=freshState(["Martijn","Bram"],false,"classic",0,"manager",false); h2TackleOn=false; h2Start(); h2PickTeam("Netherlands"); h2PickTeam("Italy"); S.h2h.tossed=true; S.h2h.subs=[3,3];
  const ball=(from,to,ok)=>{ S.h2h.who=0; S.h2h.at=from; S.h2h.sel=null; S.h2h.marks=[]; S.h2h.markedAgainst=0; S.phase="h_pick"; render(); h2Select(to); h2Play(); h2Reveal(); h2Judge(ok); };
  ball(5,7,false); ball(5,7,false); ball(5,7,false); ball(5,7,true); ball(5,9,true); ball(5,9,true);
  S.players[0].score=1; S.phase="results"; render();`;

/* a change nobody was forced into: the eleven, then the bench */
setups.change = `S=freshState(["Martijn","Bram"],false,"classic",0,"manager",false); h2TackleOn=false; h2Start(); h2PickTeam("Netherlands"); h2PickTeam("Italy"); S.h2h.tossed=true; S.h2h.subs=[3,3]; S.h2h.who=0; S.h2h.at=5; S.h2h.sel=null; S.h2h.markedAgainst=0; S.phase="h_pick"; render(); h2SubWant(); h2SubOff(7);`;

/* the traits screen, where the budget is spent */
setups.traits = `S=freshState(["Martijn","Bram"],false,"classic",0,"manager",false); h2TackleOn=false; h2Start(); h2PickTeam("Netherlands"); h2PickTeam("Italy"); S.h2h.picking=null; S.h2h.shaping=null; S.h2h.tset=0; S.phase="h_traits"; render();`;

/* the toss, as a team sheet: four decisions each, side by side */
setups.sheet = `S=freshState(["Martijn","Bram"],false,"classic",0,"manager",false); h2TackleOn=false; h2Start(); h2PickTeam("Netherlands"); h2PickTeam("Italy"); S.h2h.picking=null; S.h2h.shaping=null; S.h2h.tset=0; S.h2h.form=["4-3-3","5-3-2"]; S.h2h.line=["high","low"]; h2SetTrait(9,"poacher"); S.h2h.tset=1; h2SetTrait(0,"keeper"); S.h2h.tset=null; S.phase="h_toss"; S.h2h.tossed=true; S.h2h.coin="heads"; S.h2h.who=0; render();`;

/* the daily: the front door card, a question, and the result */
setups.dailymenu = `S=null; setupMode="classic"; setupPlay="pitch"; render();`;
setups.dailyq = `dailyStart();`;
setups.dailydone = `dailyStart(); for(let i=0;i<6;i++){ const Q=q(); dailyPick(i===4?(Q.k+1)%4:Q.k); dailyOn(); }`;
/* the peel: half a card, and a whole one */
setups.dailypeel = `dailyStart(); for(let i=0;i<3;i++){ const Q=q(); dailyPick(Q.k); dailyOn(); }`;
setups.dailywon = `dailyStart(); for(let i=0;i<6;i++){ const Q=q(); dailyPick(Q.k); dailyOn(); }`;
/* the share image itself, drawn onto the stage so it can be looked at */
setups.dailypic = `dailyStart(); for(let i=0;i<6;i++){ const Q=q(); dailyPick(i===4?(Q.k+1)%4:Q.k); dailyOn(); } (() => { const c = dailyCanvas(); const st = document.getElementById("stage"); st.innerHTML = ""; c.style.width = "360px"; c.style.imageRendering = "pixelated"; st.appendChild(c); })();`;
setups.dailypicwon = `dailyStart(); for(let i=0;i<6;i++){ const Q=q(); dailyPick(Q.k); dailyOn(); } (() => { const c = dailyCanvas(); const st = document.getElementById("stage"); st.innerHTML = ""; c.style.width = "360px"; c.style.imageRendering = "pixelated"; st.appendChild(c); })();`;

/* the album: the whole thing, one page, and a pack being opened */
setups.album = `mine().album.packs = 4; mineSave(); openAlbum();`;
setups.albumpage = `(() => { const t = TEAMS.wc2006.Netherlands, a = mine().album; const men = [...(t.xi||[]), ...(t.bench||[])]; men.slice(0, 14).forEach(m => a.have[(t.slug) + "/" + m.no] = 1); a.have[(t.slug) + "/" + men[0].no] = 3; a.have[(t.slug) + "/" + men[1].no] = 2; a.have[(t.slug) + "/" + men[2].no] = 2; mineSave(); })(); openAlbum("Netherlands");`;
setups.albumpack = `mine().album.packs = 3; mineSave(); albumOpen();`;

/* the Cup: the picker, one card, the group table, and the wall chart.
   NO APOSTROPHES IN HERE: this whole block is a shell single-quoted
   string, and one apostrophe ends it two hundred lines early. */
setups.cup = `openCup();`;
setups.cuppick = `cupLook("Trinidad and Tobago");`;
setups.cupgroup = `cupStart("Trinidad and Tobago"); render();`;
setups.cupchart = `cupStart("Trinidad and Tobago"); cupFiled(3,0); cupFiled(2,0); cupFiled(1,0); render();`;
setups.cupout = `cupStart("Togo"); cupFiled(0,2); cupFiled(0,2); cupFiled(1,2); render();`;
setups.cupwon = `cupStart("Trinidad and Tobago"); cupFiled(3,0); cupFiled(2,0); cupFiled(1,0); for(let i=0;i<4;i++) cupFiled(2,1); render();`;
/* and the second tournament */
setups.cup2018 = `cupSetYear("2018");`;
setups.cup2018group = `cupSetYear("2018"); cupStart("Panama"); render();`;
setups.cup2010 = `cupSetYear("2010");`;
setups.cup2014 = `cupSetYear("2014");`;
setups.cup2022 = `cupSetYear("2022");`;
/* Your XI: a phone with a few dozen stickers, and a side half built */
const someStickers = `(() => { const a = mine().album; let n = 0; for(const side of albumSides()){ for(const m of albumMen(side)){ if(n++ % 9) continue; a.have[albumId(side, m)] = 1; } } mineSave(); })();`;
setups.dream = someStickers + ` openDream();`;
setups.dreambuilt = someStickers + ` (() => { const own = dreamOwned(); const gk = own.find(m => m.pos === "GK"); const rest = own.filter(m => m.pos !== "GK").slice(0, 10); mine().dream = {men: [gk.id].concat(rest.map(m => m.id))}; mineSave(); })(); openDream();`;
setups.dreampick = someStickers + ` (() => { const own = dreamOwned(); const gk = own.find(m => m.pos === "GK"); const rest = own.filter(m => m.pos !== "GK").slice(0, 10); mine().dream = {men: [gk.id].concat(rest.map(m => m.id))}; mineSave(); })(); S=freshState(["Martijn","Bram"],false,"classic",0,"pitch",false); h2Start(); render();`;

const SHOT_SHAPES = ["4-2-3-1", "4-4-2", "4-3-3", "3-5-2", "5-3-2"];
const SHOT_LINES = ["high", "mid", "low"];
const dug = `S=freshState(["Martijn","Bram"],false,"classic",0,"manager",false); h2TackleOn=false; h2Start(); h2PickTeam("Netherlands"); h2PickTeam("Italy"); S.h2h.tossed=true;`;
for (const id of SHOT_SHAPES)
  setups["shape" + id.replace(/-/g, "")] = dug +
    ` S.h2h.form=["${id}","${id}"]; S.h2h.who=0; S.h2h.at=0; S.h2h.markedAgainst=0; S.phase="h_pick"; render();`;
for (const k of SHOT_LINES)
  setups["line" + k] = dug +
    ` S.h2h.line=["mid","${k}"]; S.h2h.who=0; S.h2h.at=0; S.h2h.markedAgainst=0; S.phase="h_pick"; render(); h2Select(9);`;
/* and the same three with the striker on the ball, because the shot takes the line too */
for (const k of SHOT_LINES)
  setups["shotline" + k] = dug +
    ` S.h2h.line=["mid","${k}"]; S.h2h.who=0; S.h2h.at=9; S.h2h.markedAgainst=0; S.phase="h_pick"; render();`;
/* PIXEL: ON ANY STATE. "pixel:nl" is the nl state in the sixteen-bit look,
   which means every state ever written can be photographed in both without
   a second copy of any of them. It drives the h2Pixel flag the app itself
   reads, and its apply, rather than putting the class on the body by hand,
   because the toggle row reads the variable and not the class: a hand-added
   class gave a pixel pitch under a button still offering you "16-bit", and no
   screenshot could ever have caught it, because this tool was producing it.

   NOT h2TogglePixel, which flips whatever localStorage last said, so pixel:
   would mean the other one rather than on, and which drags an AudioContext
   and a render() along before the state has built anything.

   NO APOSTROPHES ANYWHERE IN THIS BLOCK. Everything from the node -e above to
   its closing quote is one single-quoted sh string, so one apostrophe ends it
   and the script stops parsing two hundred lines early.

   The skin goes on before the state runs, so the first frame is already
   right. */
const pixel = /^pixel:/.test(state);
const st16 = pixel ? state.slice(6) : state;
setups[st16] = (pixel ? `h2Pixel = true; h2ApplyPixel();` : "") +
  (setups[st16] || setups.pick);
state = st16;

let h=fs.readFileSync("index.html","utf8");
const drive=`
<script>
window.addEventListener("load",()=>{ setTimeout(()=>{ try{ ${setups[state]||setups.pick} }catch(e){ document.body.innerHTML="<pre style=color:red>"+e+"</pre>"; } ${scrub ? `setTimeout(()=>{ document.getAnimations().forEach(a=>{ try{ a.pause(); a.currentTime=${scrub}; }catch(e){} }); }, 2800);` : ""} }, 700); });
<\/script>`;
fs.writeFileSync("_shot_app.html", h.replace("</body>", drive + "</body>"), "utf8");
'

cat > _shot_frame.html <<HTML
<!doctype html><meta charset="utf-8">
<style>
  html,body{margin:0;background:#0b1f14}
  #wrap{width:390px;height:1000px;transform:scale($SCALE);transform-origin:0 0}
  iframe{width:390px;height:1000px;border:0;display:block;margin-top:-${SCROLL}px}
</style>
<div id="wrap"><iframe src="_shot_app.html"></iframe></div>
HTML

node _tools/serve.js $PORT >/dev/null 2>&1 &
SRV=$!
trap 'kill $SRV 2>/dev/null; rm -f "$REPO/_shot_app.html" "$REPO/_shot_frame.html"' EXIT
# WAIT FOR IT TO ANSWER rather than for a second to pass. One second is enough
# on a warm machine and is not on a cold one, and when it is not, Edge photographs
# the browser's own connection-refused page and the script still says "wrote".
for i in 1 2 3 4 5 6 7 8 9 10; do
  curl -s -o /dev/null "http://localhost:$PORT/index.html" && break
  sleep 1
done

"$EDGE" --headless=new --disable-gpu --hide-scrollbars \
  --screenshot="$OUT" --virtual-time-budget=5000 \
  "http://localhost:$PORT/_shot_frame.html" >/dev/null 2>&1

echo "wrote $OUT  (state: $STATE, scale: $SCALE, scroll: $SCROLL${SCRUB:+, scrubbed to ${SCRUB}ms})"
