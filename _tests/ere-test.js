/* Eredivisie: the deck about their league, and the screens it plays on.

     node _tests/ere-test.js

   The deck rides on the Classic engine, so what is tested here is the join:
   the bank has the five tiers the picker expects, the rows fit the card, the
   mode is wired into every list a mode has to be in (labels, drawer, Rainbow
   Road, the install), and a match in the mode actually deals, reveals, scores
   and passes the go. Plus the house rules on the questions themselves.

   Reuses the stub DOM from mp-test.js. */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const REPO = path.join(__dirname, "..");
const harness = fs.readFileSync(path.join(__dirname, "mp-test.js"), "utf8");
const head = harness.slice(0, harness.indexOf("/* ---------- drive an instance from outside ---------- */"));
eval(head.replace(/^const (fs|vm|path) = require\(.*\);$/gm, "")
  .replace("fetch: () => Promise.reject(new Error(\"offline in test\")),",
    `fetch: (u) => { try { const b = require("fs").readFileSync(require("path").join(${JSON.stringify(REPO)}, u), "utf8");
       return Promise.resolve({ ok: true, json: () => Promise.resolve(JSON.parse(b)) }); }
       catch (e) { return Promise.resolve({ ok: false, json: () => Promise.reject(e) }); } },`));

const ev = (ctx, e) => vm.runInContext("(" + e + ")", ctx);
const run = (ctx, s) => vm.runInContext(s, ctx);
const tick = (ms = 200) => new Promise(r => setTimeout(r, ms));
const stage = c => (c.__els["stage"] ? c.__els["stage"].innerHTML : "");
let fails = 0;
const check = (n, c, x) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (c ? "" : "   <-- got: " + x)); if (!c) fails++; };

const TIERS = ["easy", "normal", "hard", "extreme", "ball"];

(async () => {
  const bank = JSON.parse(fs.readFileSync(path.join(REPO, "assets/eredivisie/index.json"), "utf8"));
  const html = fs.readFileSync(path.join(REPO, "index.html"), "utf8");
  const sw = fs.readFileSync(path.join(REPO, "sw.js"), "utf8");
  const all = TIERS.flatMap(t => (bank[t] || []).map(r => ({ ...r, t })));

  console.log("--- the deck ---");
  check("all five tiers are there", TIERS.every(t => Array.isArray(bank[t])), Object.keys(bank).join(","));
  /* Every lane on the picker has to hold a night's worth. BALL shipped thin
     for one version while its stories were still being checked; it is stocked
     now, so the bar is back where it belongs for all five. */
  check("every tier is properly stocked", TIERS.every(t => (bank[t] || []).length >= 25),
    TIERS.map(t => t + ":" + (bank[t] || []).length).join(" "));
  check("a proper deck, not a handful", all.length >= 300, all.length);
  check("every row has a question and an answer", all.every(r => r.q && r.a), all.filter(r => !(r.q && r.a)).length + " broken");
  check("no question over 150 chars", all.every(r => r.q.length <= 150), (all.find(r => r.q.length > 150) || {}).q);
  check("no answer over 110 chars", all.every(r => String(r.a).length <= 110), (all.find(r => String(r.a).length > 110) || {}).a);
  check("no sub line over 110 chars", all.every(r => !r.sub || r.sub.length <= 110), (all.find(r => r.sub && r.sub.length > 110) || {}).sub);
  check("no dashes, the house rule",
    all.every(r => !/[‒–—―]/.test(r.q + r.a + (r.sub || ""))), (all.find(r => /[‒–—―]/.test(r.q + r.a + (r.sub || ""))) || {}).q);
  check("no wikitext or brackets survived", all.every(r => !/[{}|\[\]]/.test(r.q + r.a)), (all.find(r => /[{}|\[\]]/.test(r.q + r.a)) || {}).q);
  check("every prompt is a finished sentence", all.every(r => /[?.!]$/.test(r.q.trim())), (all.find(r => !/[?.!]$/.test(r.q.trim())) || {}).q);
  /* a superlative is a question with a shelf life */
  const LIVE = /\b(currently|all[- ]time|still holds?|to date|as of (today|now)|the current|most capped|record holder)\b/i;
  check("no live records in the present tense", all.every(r => !LIVE.test(r.q)), (all.find(r => LIVE.test(r.q)) || {}).q);
  check("no question is asked twice", new Set(all.map(r => r.q.toLowerCase())).size === all.length,
    all.length - new Set(all.map(r => r.q.toLowerCase())).size);
  check("nothing from the writers' tooling leaked into the shipped rows",
    all.every(r => !("src" in r) && !("conf" in r) && !("verdict" in r) && !("note" in r)), "found a src/conf/verdict/note key");

  console.log("\n--- the club crests ---");
  /* The crest exists to give the table something to look at while they think.
     The moment it can answer the question it is worse than nothing, so the
     rule is checked here with its own alias list rather than by asking the
     build tool whether it agrees with itself. */
  const NAMES = {
    ajax: ["Ajax"], psv: ["PSV"], feyenoord: ["Feyenoord"], "az-alkmaar": ["AZ"],
    twente: ["Twente"], "fc-utrecht": ["FC Utrecht"], vitesse: ["Vitesse"],
    "sc-heerenveen": ["Heerenveen"], "fc-groningen": ["FC Groningen"], "willem-ii": ["Willem II"],
    "nac-breda": ["NAC"], "nec-nijmegen": ["NEC", "N.E.C."], "go-ahead-eagles": ["Go Ahead Eagles"],
    "roda-jc-kerkrade": ["Roda JC", "Roda"], "vvv-venlo": ["VVV"], "mvv-maastricht": ["MVV"],
    "fortuna-sittard": ["Fortuna Sittard", "Fortuna '54"], "de-graafschap": ["De Graafschap"],
    "rkc-waalwijk": ["RKC"], "pec-zwolle": ["PEC Zwolle", "FC Zwolle"], "ado-den-haag": ["ADO"],
    "sparta-rotterdam": ["Sparta"], "excelsior-rotterdam": ["Excelsior"],
    "heracles-almelo": ["Heracles"], "sc-cambuur": ["Cambuur"], volendam: ["Volendam"],
    "fc-emmen": ["FC Emmen"], "fc-dordrecht": ["FC Dordrecht"], "helmond-sport": ["Helmond Sport"],
    telstar: ["Telstar"], "top-oss": ["TOP Oss"], "almere-city": ["Almere City"],
    "fc-den-bosch": ["FC Den Bosch", "Den Bosch"], "fc-eindhoven": ["FC Eindhoven"], "rbc-roosendaal": ["RBC Roosendaal"],
  };
  const crested = all.filter(r => r.club);
  const named = (text, n) => new RegExp("(^|[^A-Za-z0-9])" + n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "($|[^A-Za-z0-9])", n.length <= 4 ? "" : "i").test(text);
  check("a good share of questions carry a crest", crested.length > all.length * 0.4,
    `${crested.length} of ${all.length}`);
  check("every crest is a club the test knows", crested.every(r => NAMES[r.club]),
    [...new Set(crested.filter(r => !NAMES[r.club]).map(r => r.club))].join(", "));
  const leaks = crested.filter(r => (NAMES[r.club] || []).some(n => named(r.a, n)));
  check("no crest gives away its own answer", leaks.length === 0,
    leaks.slice(0, 3).map(r => r.club + " => " + r.a).join(" | "));
  check("every crest is named in its own question",
    crested.every(r => (NAMES[r.club] || []).some(n => named(r.q, n))),
    (crested.find(r => !(NAMES[r.club] || []).some(n => named(r.q, n))) || {}).q);
  check("every crest file is on disk",
    crested.every(r => fs.existsSync(path.join(REPO, "assets/logos", r.club + ".png"))),
    [...new Set(crested.filter(r => !fs.existsSync(path.join(REPO, "assets/logos", r.club + ".png"))).map(r => r.club))].join(", "));
  const swCrests = (sw.match(/assets\/logos\/[a-z0-9-]+\.png/g) || []);
  check("every crest the deck uses is precached",
    [...new Set(crested.map(r => r.club))].every(c => swCrests.includes("assets/logos/" + c + ".png")),
    [...new Set(crested.map(r => r.club))].filter(c => !swCrests.includes("assets/logos/" + c + ".png")).join(", "));
  console.log(`      ${crested.length} of ${all.length} questions, ${new Set(crested.map(r => r.club)).size} clubs`);

  console.log("\n--- the wiring ---");
  const app = makeInstance("ere");
  await tick(400);
  check("the app loaded the deck", ev(app, "DECKS.ere && DECKS.ere.hard.length") === bank.hard.length, ev(app, "DECKS.ere && DECKS.ere.hard.length"));
  check("named in the mode drawer", ev(app, "MODE_META.ere && MODE_META.ere[1]") === "Eredivisie", ev(app, "MODE_META.ere && MODE_META.ere[1]"));
  check("named in the record book", ev(app, "matchLabel({mode:'ere'})") === "Eredivisie", ev(app, "matchLabel({mode:'ere'})"));
  check("its icon exists", !!ev(app, "IPATHS[MODE_META.ere[0]]"), ev(app, "MODE_META.ere[0]"));
  /* It used to be the only league, so it owned its icon. Now there are six of
     them and they deliberately SHARE one: they are the same kind of thing and
     read as a family, told apart by their accent colour the way a shelf of
     league badges is. What has to stay unique is the colour. */
  /* WHICH QUIZZES ARE LEAGUES is now a question with a real answer, where it
     used to be "all of them except the classic bank". Special is a quiz and
     is not a league, and it must NOT wear the family icon: the whole point of
     the shared stripes is that it says league, so handing it to the one deck
     that is about two clubs and three countries would make the shelf lie.

     A league is a quiz that fields a club side, which the registry already
     says in its own words: its pool id ends in -clubs. The classic bank plays
     as a 2006 nation and Special plays as nobody. */
  const leagues = ev(app, "Object.keys(QUIZZES).filter(k => /-clubs$/.test(QUIZZES[k].pool || ''))");
  check("there are twelve leagues to be a family of", leagues.length === 12, leagues.length);
  check("the leagues share the family icon",
    ev(app, "Object.keys(QUIZZES).filter(k => /-clubs$/.test(QUIZZES[k].pool || '')).every(k=>MODE_META[k][0]==='stripes')"),
    ev(app, "Object.keys(QUIZZES).map(k=>k+':'+MODE_META[k][0]).join(' ')"));
  check("and the quizzes that are not leagues do not wear it",
    ev(app, "Object.keys(QUIZZES).filter(k => !/-clubs$/.test(QUIZZES[k].pool || '')).every(k=>MODE_META[k][0]!=='stripes')"),
    ev(app, "Object.keys(QUIZZES).filter(k => !/-clubs$/.test(QUIZZES[k].pool || '')).map(k=>k+':'+MODE_META[k][0]).join(' ')"));
  check("and no two modes share an accent colour",
    ev(app, "new Set(Object.values(MODE_META).map(v=>v[2])).size") === ev(app, "Object.keys(MODE_META).length"),
    ev(app, "Object.values(MODE_META).map(v=>v[2]).join(' ')"));
  check("the picture modes do not wear it",
    ev(app, "Object.keys(PICTURE_MODES).every(k=>MODE_META[k][0]!=='stripes')"), "a picture mode looks like a league");
  check("in the Rainbow Road pool", ev(app, "RR_POOL.includes('ere')"));
  check("and Rainbow Road can tell when it is ready", ev(app, "RR_READY.ere()") === true);
  check("the deck is in the install", sw.includes("assets/eredivisie/index.json"), "not precached");
  check("and so is the old mark", sw.includes("assets/eredivisie/logo.png"), "not precached");
  check("the old mark is on disk", fs.existsSync(path.join(REPO, "assets/eredivisie/logo.png")), "missing");
  /* One gate now, and it asks about the COMBINATION rather than the mode, so
     Eredivisie read aloud can be ready while its multiple choice is not. */
  check("the drawer lights the tile once a deck lands", ev(app, "modeLive('ere')") === true, "tile never lights");
  check("and dims it when nothing is loaded",
    ev(app, "(()=>{const k=DECKS.ere,m=DECKS['ere-mc'];delete DECKS.ere;delete DECKS['ere-mc'];" +
            "const r=modeLive('ere');DECKS.ere=k;if(m)DECKS['ere-mc']=m;return r;})()") === false, "lit with no deck");
  /* IT ASKS ABOUT THE COMBINATION, not the literal. The third argument stopped
     being setupMc when the computer arrived, because a match against it is
     Pick One whether you asked for that or not, and a test that greps for the
     variable name fails on a rename that changed nothing it cared about. */
  check("starting is gated on the combination",
    /modeReady\(setupMode,\s*setupPlay,\s*\w+\)/.test(html), "no start gate");
  check("resuming is gated on the combination", html.indexOf("modeReady(S.mode, S.play, S.mc)") > 0, "no resume gate");

  console.log("\n--- a go ---");
  run(app, 'S = freshState(["Ale","Bram","Martijn"], false, "ere", 0, "board", false); render();');
  await tick(60);
  check("opens on the picker", ev(app, "S.phase") === "pick", ev(app, "S.phase"));
  check("the body is dressed for the mode", ev(app, "document.body.classList.contains('eremode')"), "no eremode class");
  check("the board offers all five lanes", TIERS.every(t => stage(app).includes(`pickTier('${t}')`)), "a lane is missing");
  run(app, "pickTier('hard')");
  await tick(60);
  check("a pick deals a question", ev(app, "S.phase") === "question" && ev(app, "S.qi") !== null, ev(app, "S.phase"));
  check("from the Eredivisie deck, not Classic", ev(app, "q().q") === bank.hard[ev(app, "S.qi")].q, "wrong bank");
  const qq = ev(app, "q()");
  check("the question is on screen", stage(app).includes(qq.q.slice(0, 24).replace(/&/g, "&amp;")), "missing");
  /* NOT ANYWHERE THE SCREEN PUT IT, which is not the same as not anywhere at
     all. One of the 325 hard questions is "PSV and Feyenoord both finished
     2012-13 on 69 points. Which club took second on goal difference?", and its
     answer is PSV. The question names both candidates on purpose and separating
     them is the whole exercise, so the old check failed on it, and because the
     deal is random it failed one run in three hundred and looked like a flake.
     The question text is the one place the answer is allowed to be, so it comes
     out of the haystack before the search. */
  const qHTML = qq.q.replace(/&/g, "&amp;");
  const noQ = stage(app).split(qHTML).join(" ").split(qq.q).join(" ");
  check("the answer is NOT anywhere the screen added it", !noQ.includes(qq.a), qq.a);
  /* drive a crested question onto every screen a question can appear on */
  const ci = bank.hard.findIndex(r => r.club);
  run(app, `S.tier="hard"; S.qi=${ci}; S.phase="question"; render();`);
  await tick(30);
  check("a crested question shows its crest", stage(app).includes(`assets/logos/${bank.hard[ci].club}.png`), "no crest");
  run(app, 'S.phase="judge"; render();');
  await tick(30);
  check("and still shows it on the reveal", stage(app).includes(`assets/logos/${bank.hard[ci].club}.png`), "crest vanished");
  run(app, 'S.phase="deadq"; render();');
  await tick(30);
  check("and on the dead question", stage(app).includes(`assets/logos/${bank.hard[ci].club}.png`), "crest vanished");
  const ni = bank.hard.findIndex(r => !r.club);
  if (ni >= 0) {
    run(app, `S.tier="hard"; S.qi=${ni}; S.phase="question"; render();`);
    await tick(30);
    check("a question with no club shows no crest", !stage(app).includes("qcrest"), "drew an empty crest");
  }
  run(app, `S.tier="hard"; S.qi=${ev(app, "S.used.hard[0]")}; S.phase="question"; render();`);
  run(app, "reveal()");
  await tick(30);
  check("revealing shows the answer", ev(app, "S.phase") === "judge" && stage(app).includes(qq.a.replace(/&/g, "&amp;")), ev(app, "S.phase"));
  if (qq.sub) check("and the story under it", stage(app).includes("pfact"), "no sub line");
  run(app, "judge(true)");
  await tick(30);
  check("a correct answer pays the lane", ev(app, "S.players[0].score") === 5, ev(app, "S.players[0].score"));
  check("and the go passes", ev(app, "S.turn") === 1, ev(app, "S.turn"));
  check("and the question is marked used", ev(app, "S.used.hard.length") === 1, ev(app, "S.used.hard.length"));

  run(app, 'S.phase="results"; render();');
  await tick(30);
  check("the dressing comes off at the results", !ev(app, "document.body.classList.contains('eremode')"), "still dressed");
  run(app, 'S=null; render();');
  await tick(30);
  check("and stays off on the menu", !ev(app, "document.body.classList.contains('eremode')"), "still dressed");

  console.log("\n--- the deck and the resume ---");
  run(app, 'S = freshState(["Ale","Bram"], false, "ere", 0, "board", false);');
  const seen = new Set();
  for (let n = 0; n < 25; n++) { run(app, "pickTier('extreme'); S.phase='pick';"); seen.add(ev(app, "S.qi")); }
  check("twenty-five deals, twenty-five different questions", seen.size === 25, seen.size);
  run(app, 'localStorage.setItem("ball-quiz-save-v1", JSON.stringify(S)); resumeGame();');
  await tick(30);
  check("a parked match in the mode resumes", ev(app, "S && S.mode") === "ere", ev(app, "S && S.mode"));

  console.log(fails ? `\n${fails} FAILING CHECK(S)` : "\nAll checks passed.");
  process.exit(fails ? 1 : 0);
})();
