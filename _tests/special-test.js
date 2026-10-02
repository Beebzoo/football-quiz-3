/* SPECIAL: the deck written about the people who play this.
 *
 *     node _tests/special-test.js
 *
 * It is an ordinary quiz now, so most of what matters is already covered by
 * modes-test and the engine suites. What is left is the part that is specific
 * to this deck, and it is mostly about trust: these are facts Martijn and
 * Alejandro can check from memory, so a wrong row here is noticed at the table
 * in a way a wrong row about Serie B never would be.
 *
 * Three things this holds:
 *
 *   THE SHAPE SURVIVED THE CONVERSION. It arrived as a flat array priced 3, 5,
 *   8 and 10 and had to become five tiers. A conversion that silently dropped
 *   half a deck would look exactly like a conversion that worked.
 *
 *   EVERY ROW STILL KNOWS WHICH STRAND IT BELONGS TO, and every strand has
 *   artwork on disk. The strand is the whole identity of this deck: an MVV
 *   question and a Las Palmas question should not merely say something
 *   different, they should look different.
 *
 *   NO LIVE RECORDS. Eleven of the original 63 asked who is the all time
 *   leading scorer of somewhere, which is a question with a shelf life, and
 *   the build tool threw all eleven out. This is the guard that stops them
 *   walking back in.
 */
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
let fails = 0;
const check = (n, c, x) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (c ? "" : "   <-- got: " + x)); if (!c) fails++; };

const TIERS = ["easy", "normal", "hard", "extreme", "ball"];
const STRANDS = {
  mvv: "mvv-maastricht", lp: "las-palmas", ma: "morocco-national-team",
  nl: "dutch-national-team", es: "spain-national-team",
};

(async () => {
  const bank = JSON.parse(fs.readFileSync(path.join(REPO, "assets/special/index.json"), "utf8"));
  const legacy = JSON.parse(fs.readFileSync(path.join(REPO, "_tools/_questions/special/legacy-63.json"), "utf8"));
  const all = TIERS.flatMap(t => (bank[t] || []).map(r => ({ ...r, t })));

  console.log("--- the deck ---");
  check("five tiers, not a flat array", TIERS.every(t => Array.isArray(bank[t])), Object.keys(bank).join(","));
  check("the conversion kept most of what came over", all.length >= legacy.length - 15,
    `${all.length} from ${legacy.length}`);
  check("every row has a question and an answer", all.every(r => r.q && r.a),
    all.filter(r => !(r.q && r.a)).length + " broken");
  check("no question over 150 chars", all.every(r => r.q.length <= 150), (all.find(r => r.q.length > 150) || {}).q);
  check("no answer over 110 chars", all.every(r => String(r.a).length <= 110), (all.find(r => String(r.a).length > 110) || {}).a);
  check("no sub over 110 chars", all.every(r => !r.sub || r.sub.length <= 110), (all.find(r => r.sub && r.sub.length > 110) || {}).sub);
  check("no dashes, the house rule",
    all.every(r => !/[‒–—―]/.test(r.q + r.a + (r.sub || ""))), "found one");
  check("every prompt is a finished sentence", all.every(r => /[?.!]$/.test(r.q.trim())),
    (all.find(r => !/[?.!]$/.test(r.q.trim())) || {}).q);
  check("no question is asked twice", new Set(all.map(r => r.q.toLowerCase())).size === all.length,
    all.length - new Set(all.map(r => r.q.toLowerCase())).size);

  /* the rule that cost the original deck eleven rows */
  const LIVE = /\b(currently|all[- ]time|still holds?|to date|as of (today|now)|the current|record holder)\b/i;
  check("nothing asks for a record that can change", all.every(r => !LIVE.test(r.q)),
    (all.find(r => LIVE.test(r.q)) || {}).q);

  console.log("\n--- the five strands ---");
  check("every row names a strand", all.every(r => r.s && STRANDS[r.s]),
    [...new Set(all.filter(r => !STRANDS[r.s]).map(r => r.s))].join(","));
  const byStrand = {};
  all.forEach(r => { byStrand[r.s] = (byStrand[r.s] || 0) + 1; });
  check("all five are represented", Object.keys(STRANDS).every(s => byStrand[s] > 0),
    JSON.stringify(byStrand));
  check("every row carries the crest its strand maps to",
    all.every(r => r.club === STRANDS[r.s]),
    (all.find(r => r.club !== STRANDS[r.s]) || {}).club);
  check("and every one of those crests is on disk",
    Object.values(STRANDS).every(f => fs.existsSync(path.join(REPO, "assets/logos", f + ".png"))),
    Object.values(STRANDS).filter(f => !fs.existsSync(path.join(REPO, "assets/logos", f + ".png"))).join(", "));
  console.log("      " + Object.entries(byStrand).map(([k, v]) => k + " " + v).join(" / "));

  console.log("\n--- the app can reach it, which is the whole point ---");
  const app = makeInstance("phone");
  await new Promise(r => setTimeout(r, 500));
  check("it is a registered quiz", ev(app, "!!QUIZZES.spec"), "not in QUIZZES");
  check("the deck loaded", ev(app, "DECKS.spec && DECKS.spec.hard.length") === bank.hard.length,
    ev(app, "DECKS.spec && DECKS.spec.hard.length"));
  check("the menu will show it", ev(app, "!!MODE_META.spec"), "not in MODE_META");
  check("it reads as live", ev(app, "modeLive('spec')") === true, ev(app, "modeLive('spec')"));
  check("board only, no pitch", ev(app, "canPitch('spec')") === false, ev(app, "canPitch('spec')"));
  check("its icon exists", !!ev(app, "IPATHS[QUIZZES.spec.ic]"), ev(app, "QUIZZES.spec.ic"));
  check("no other mode wears its accent",
    ev(app, "Object.values(MODE_META).filter(m => m[2] === MODE_META.spec[2]).length") === 1,
    ev(app, "Object.values(MODE_META).filter(m => m[2] === MODE_META.spec[2]).length"));

  console.log("\n--- it deals and it scores ---");
  const tier = TIERS.find(t => bank[t].length > 0);
  vm.runInContext(`S = freshState(["Martijn","Bram","Ale"], false, "spec", 0); render();`, app);
  await new Promise(r => setTimeout(r, 60));
  check("a match in it opens on the picker", ev(app, "S.phase") === "pick", ev(app, "S.phase"));
  vm.runInContext(`pickTier(${JSON.stringify(tier)});`, app);
  await new Promise(r => setTimeout(r, 60));
  check("a pick deals from the Special deck", ev(app, "q() && q().q") === bank[tier][ev(app, "S.qi")].q, "wrong deck");
  check("and the question carries its crest", !!ev(app, "q().club"), "no crest on the row");

  console.log("\n--- the facts themselves ---");
  /* spot checks, so a future rebuild that reads the wrong source is caught
     here rather than at the table by the man it is about */
  const find = re => all.find(r => re.test(r.q));
  /* MVV HAVE NOT WON A EUROPEAN TROPHY, and the deck said for years that they
     had. The row asked which European trophy MVV won and answered "UEFA
     Intertoto Cup, 1970". No knock-out rounds were contested in the 1970
     Intertoto Cup and no winner was declared at all; MVV topped group A4 and
     that is the whole of it. It shipped in three apps before anybody checked,
     which is what a wrong answer about the quizmaster's own club looks like:
     nobody at the table queries a flattering fact. The row now asks why they
     did not win it, which is both true and a better question. */
  const mvvEuro = find(/MVV.*Intertoto|Intertoto.*MVV/i);
  check("the deck does not claim MVV won a European trophy",
    !all.some(r => /MVV/.test(r.q + r.a) && /\bwon a European trophy\b/i.test(r.q + r.a)),
    "the old Intertoto claim is back");
  check("and the Intertoto row says no winner was declared",
    !mvvEuro || /no winner/i.test(mvvEuro.a + (mvvEuro.sub || "")), mvvEuro && mvvEuro.a);
  /* Las Palmas's La Liga runners-up season is 1968-69, and the deck asks it
     from both ends: one row names the season and wants the champions, another
     names the club and wants the season. Both are legitimate, so the check has
     to find the right one rather than the first thing matching "runners-up". */
  const lpLiga = all.find(r => /Las Palmas finished runners-up in La Liga/i.test(r.q));
  check("Las Palmas's La Liga runners-up season is 1968-69",
    !lpLiga || /1968-69/.test(lpLiga.a), lpLiga && lpLiga.a);
  const lp69 = all.find(r => /won La Liga in 1968-69/i.test(r.q));
  check("and the champions that season were Real Madrid",
    !lp69 || /Real Madrid/i.test(lp69.a), lp69 && lp69.a);

  console.log(fails ? `\n${fails} FAILING CHECK(S)` : "\nAll checks passed.");
  process.exit(fails ? 1 : 0);
})();
