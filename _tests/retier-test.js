/* CALIBRATION.
 *
 *     node _tests/retier-test.js
 *
 * Tiers are hand-assigned, so somewhere in the bank there is an Extreme
 * everybody gets and an Easy nobody does. _tools/retier.js finds them from
 * what people actually answered, and this suite is about the one thing that
 * could go wrong quietly while it does:
 *
 *   A RE-TIER MUST NOT MOVE ANY OTHER QUESTION. S.used holds indexes and a
 *   parked match holds a used list, so splicing a question out of a tier
 *   re-points every index above it: a match somebody left half-played comes
 *   back showing a different question, and a daily somebody screenshotted is
 *   no longer the daily they played. So the tool marks in place and appends,
 *   and this checks that every index in every tier is exactly where it was.
 *
 *   AND THE APP HAS TO HONOUR THE MARK. A retired question is still sitting in
 *   its old tier, so if the draw does not skip it, the re-tier has done
 *   nothing except put the question in the deck twice.
 *
 * The fixture is generated from the deck on disk rather than checked in, so it
 * cannot drift out of date the first time somebody re-tiers for real.
 */
const fs = require("fs");
const path = require("path");
const os = require("os");
const vm = require("vm");
const { execFileSync } = require("child_process");

const REPO = path.join(__dirname, "..");
const harness = fs.readFileSync(path.join(__dirname, "mp-test.js"), "utf8");
const head = harness.slice(0, harness.indexOf("/* ---------- drive an instance from outside ---------- */"));
eval(head.replace(/^const (fs|vm|path) = require\(.*\);$/gm, ""));

const ev = (c, e) => vm.runInContext("(" + e + ")", c);
const run = (c, s) => vm.runInContext(s, c);
const tick = (ms = 130) => new Promise(r => setTimeout(r, ms));
let fails = 0;
const check = (n, c, x) => {
  console.log((c ? "  PASS  " : "  FAIL  ") + n + (c ? "" : "   <-- got: " + x));
  if (!c) fails++;
};
const qKey = q => {
  const t = (q && q.q) || "";
  let h = 5381;
  for (let i = 0; i < t.length; i++) h = ((h * 33) ^ t.charCodeAt(i)) >>> 0;
  return h.toString(36);
};

(async () => {
  /* ---------- the tool, against a deck nobody else is using ----------
     A copy of the repo's deck under a temp root, so a --write run can be
     inspected without touching anything that ships. */
  console.log("--- the tool, on a deck of its own ---");
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ball3-retier-"));
  fs.mkdirSync(path.join(root, "assets", "mc"), { recursive: true });
  fs.mkdirSync(path.join(root, "_tools"), { recursive: true });
  fs.mkdirSync(path.join(root, "_outcomes"), { recursive: true });
  fs.copyFileSync(path.join(REPO, "_tools", "retier.js"), path.join(root, "_tools", "retier.js"));
  const src = JSON.parse(fs.readFileSync(path.join(REPO, "assets/mc/index.json"), "utf8"));
  fs.writeFileSync(path.join(root, "assets/mc/index.json"), JSON.stringify(src, null, 1));

  /* ONE EASY NOBODY GETS AND ONE EXTREME EVERYBODY DOES, which is the shape
     the whole tool exists to find, plus one with too little evidence to act
     on and one dead heat that is already where it belongs. */
  const hardEasy = src.easy[3], easyExtreme = src.extreme[7];
  const thin = src.hard[11], fine = src.normal[5];
  const rows = [];
  const t0 = Date.parse("2026-09-01T20:00:00Z");
  const push = (tier, q, asks, right, from) => {
    for (let i = 0; i < asks; i++)
      rows.push({ t: from + i * 1000, mid: "m1", mode: "classic", mc: true, tier: tier,
                  kind: "board", ok: i < right, k: qKey(q) });
  };
  push("easy", hardEasy, 30, 6, t0);
  push("extreme", easyExtreme, 30, 27, t0 + 100000);
  push("hard", thin, 8, 1, t0 + 200000);
  push("normal", fine, 30, 20, t0 + 300000);
  fs.writeFileSync(path.join(root, "_outcomes", "phone-a.json"),
    JSON.stringify({ app: "BALL 3 outcomes", at: "2026-09-14T00:00:00Z", rows: rows }));
  /* THE SAME MATCH FILED TWICE, which is what a host and a guest both do */
  fs.writeFileSync(path.join(root, "_outcomes", "phone-b.json"),
    JSON.stringify({ app: "BALL 3 outcomes", at: "2026-09-14T00:00:00Z", rows: rows.slice(0, 10) }));

  const tool = a => execFileSync(process.execPath,
    [path.join(root, "_tools", "retier.js"), path.join(root, "_outcomes")].concat(a || []),
    { encoding: "utf8" });

  const dry = tool([]);
  check("the same ball filed twice is counted once",
    new RegExp("\\b" + rows.length + " after dropping").test(dry),
    (dry.match(/\d+ after dropping[^\n]*/) || [""])[0] + ", wanted " + rows.length);
  check("an Easy nobody gets is found", /easy\s+-> normal/.test(dry), "not found");
  check("an Extreme everybody gets is found", /extreme\s+-> hard/.test(dry), "not found");
  /* ONE STEP AT A TIME, and it says so rather than moving it silently */
  check("and neither is moved more than one tier", /the numbers say extreme, moved one step/.test(dry) &&
    /the numbers say easy, moved one step/.test(dry), "moved further than a step");
  check("a question with eight asks is left alone", !/hard\s+->/.test(dry), "moved on thin evidence");
  check("and one that is already right is left alone", !/normal\s+->/.test(dry), "moved for nothing");
  check("a dry run writes nothing",
    JSON.stringify(JSON.parse(fs.readFileSync(path.join(root, "assets/mc/index.json"), "utf8"))) ===
    JSON.stringify(src), "it wrote");

  console.log("\n--- and applying it moves no index anywhere ---");
  tool(["--write"]);
  const after = JSON.parse(fs.readFileSync(path.join(root, "assets/mc/index.json"), "utf8"));
  /* THE WHOLE POINT. Every tier is the same length it was or longer, and every
     index below the old end still holds the same question. */
  let moved = 0, shrunk = 0;
  for (const tier of Object.keys(src)) {
    if (!Array.isArray(src[tier])) continue;
    if (after[tier].length < src[tier].length) shrunk++;
    for (let i = 0; i < src[tier].length; i++)
      if (qKey(src[tier][i]) !== qKey(after[tier][i])) moved++;
  }
  check("no tier got shorter", shrunk === 0, shrunk + " tiers shrank");
  check("and no question changed index", moved === 0, moved + " moved");
  check("the Easy is marked where it was", after.easy[3].x === 1, JSON.stringify(after.easy[3].x));
  check("and says where it went", after.easy[3].to === "normal", after.easy[3].to);
  const copy = after.normal[after.normal.length - 1];
  check("a copy is appended to its new tier", qKey(copy) === qKey(hardEasy), "not appended");
  check("and the copy is not itself marked", !copy.x, "marked");
  check("it remembers where it came from", copy.was === "easy" && copy.seen === 30,
    copy.was + " / " + copy.seen);
  /* RUNNING IT TWICE IS SAFE, because the second pass sees the mark */
  tool(["--write"]);
  const twice = JSON.parse(fs.readFileSync(path.join(root, "assets/mc/index.json"), "utf8"));
  check("running it again changes nothing", twice.normal.length === after.normal.length,
    twice.normal.length + " vs " + after.normal.length);

  console.log("\n--- and the app skips a question that has been moved ---");
  const app = makeInstance("retier");
  await tick(340);
  /* a tiny bank so the draw has nowhere to hide: two Easy questions, one of
     them retired */
  run(app, 'DECKS["classic-mc"] = {easy: [{q:"Kept", a:"a", o:["a","b","c","d"], k:0},' +
    '{q:"Moved", a:"a", o:["a","b","c","d"], k:0, x:1}], normal: [], hard: [], extreme: [], ball: []};');
  run(app, 'S = freshState(["A","B"], false, "classic", 0, "board", true);');
  const drew = [];
  for (let i = 0; i < 8; i++) {
    run(app, "S.used.easy = []; pickTier('easy');"); await tick(40);
    drew.push(ev(app, "q() && q().q"));
  }
  check("a retired question is never drawn", drew.every(x => x === "Kept"),
    [...new Set(drew)].join(", "));
  /* AND THE DAILY WILL NOT USE ONE EITHER, because a rung that points at a
     question the re-tier has moved is a rung with two right answers. */
  const bank = ev(app, '(() => { for(const k of Object.keys(dailyBankCache)) delete dailyBankCache[k]; ' +
    'return dailyBank("easy").length; })()');
  check("and the daily will not pick one", bank === 1, bank);

  fs.rmSync(root, { recursive: true, force: true });
  console.log("\n" + (fails ? fails + " FAILED" : "ALL PASS"));
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
