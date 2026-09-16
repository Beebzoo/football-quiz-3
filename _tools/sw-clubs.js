/* Keep the service worker's precache list in step with what you can play.
 *
 *     node _tools/sw-clubs.js              generate, guard, bump the cache
 *     node _tools/sw-clubs.js --dry        say what would change, write nothing
 *     node _tools/sw-clubs.js --no-flags   leave the pool badges out
 *     node _tools/sw-clubs.js --shrink     yes, I did mean to drop some
 *
 * Every team picker in the app draws a badge per side, and a badge that is not
 * precached is a grey box on a phone with no signal, which is most of where
 * this gets played. A pool whose own file is not precached is worse: the menu
 * row opens onto nothing. Both change whenever a club goes up or down or a
 * tournament is added, so they are GENERATED between two markers in sw.js
 * rather than maintained by hand. Run this after every build-clubs.js run and
 * after adding a pool.
 *
 * WHAT IT NOW COVERS, and why the DIRS list is gone. This file used to hold six
 * folder names, typed here, which made the tool that exists so nobody has to
 * remember sw.js by hand into a thing to remember. It now reads the app's OWN
 * POOLS registry out of index.html, the way _tests/assets-test.js does, and
 * CUP_YEARS beside it. So:
 *
 *   CLUB_DECKS   a league pool's clubs.json, and the index.json and mc.json
 *                beside it, because a league with precached clubs and no
 *                questions is a picker that opens onto nothing.
 *   CLUB_CRESTS  every crest those clubs.json files name.
 *   POOL_FILES   every squad pool's file, plus a cup file per CUP_YEARS.
 *   POOL_FLAGS   the badges those squad pools name, and only those. Not the
 *                whole of assets/natflags, which is a different decision.
 *
 * Measured when this was written: 9 of the app's 22 pools were in the install
 * and 13 were not, because six club pools came in through CLUB_DECKS and
 * wc2006, wc2022 and finals were typed into EXTRA_ASSETS by hand. The other
 * thirteen were a menu row that did nothing offline, and nothing anywhere said
 * so. A pool added to index.html is now in the install on the next run of this
 * with nothing typed here, which is the whole point of the file.
 *
 * THE BADGES ARE OPT-OUT RATHER THAN OPT-IN, and the number is why. Every badge
 * the squad pools actually name came to 83 files and 79KB when this was written
 * and the run prints both every time, against an install already past sixteen
 * megabytes. A pool whose file is cached and whose picker then draws a screen of
 * grey boxes offline is half a job. --no-flags is there if you disagree. This is
 * NOT the whole of assets/natflags, which is 156 files nothing has asked for.
 *
 * FOUR GUARDS, and each of them is something this repo has actually been bitten
 * by rather than a precaution.
 *
 *   1. EVERY PATH IS ON DISK. Cache.addAll is all or nothing: one 404 and the
 *      whole install rejects, the app runs with no cache at all, and nothing on
 *      screen says a word. Nothing is written until every generated path opens.
 *   2. EVERY LIST IS SPREAD. sw.js already carries two lists, NATFLAGS and
 *      MANAGER_LOGOS, that are declared and never used by anything, and each of
 *      them looks exactly like a working precache until you go and count. A
 *      generated list that nothing reads is worse, because it looks maintained.
 *      So the file is read back, with this tool's own block cut out first, and a
 *      list only counts as used if something outside the block spreads it.
 *   3. NOTHING SHRINKS BY ACCIDENT. If the registry regex stops matching, the
 *      honest failure is a short list, a bumped cache and an install with less
 *      in it than yesterday that looks like a clean build. A list that comes
 *      back smaller than the one already in sw.js stops the run. A club really
 *      did go down, or a pool really was retired, is what --shrink is for.
 *   4. THE CACHE IS BUMPED, because a precache list that changed and a cache
 *      name that did not is the single most confusing thing that can happen in
 *      this repo: the code is right, the tests are green, and the phone keeps
 *      showing you yesterday.
 *
 * IT IS NOT THE ONLY WRITER of sw.js. _tools/_questions/eredivisie/build-ere.js
 * writes ERECRESTS between its own pair of markers in the same file, and
 * _tools/build-stickers.py writes STICKERS between a third pair. This only ever
 * touches the span between its own two markers and the CACHE line, so the three
 * cannot fight. Do not widen that.
 *
 * ORDER IS LOAD-BEARING. The generated block sits ABOVE EXTRA_ASSETS and far
 * above ASSETS, because const is not hoisted and a list declared below the array
 * that spreads it throws a ReferenceError on install. That happened here from
 * v111 to v123 and nothing visibly broke, the app just quietly stopped working
 * offline. Anything added to the block goes in the block.
 */
const fs = require("fs");
const path = require("path");

const REPO = path.join(__dirname, "..");
const SW = path.join(REPO, "sw.js");
const OPEN = "/* ---- CLUBS: generated by _tools/sw-clubs.js, do not edit by hand ---- */";
const SHUT = "/* ---- end of the generated club list ---- */";
const DRY = process.argv.includes("--dry");
const SHRINK = process.argv.includes("--shrink");
const WANT_FLAGS = !process.argv.includes("--no-flags");

/* ---------- what the app says you can play ---------- */
/* PARSED, NOT TYPED. _tests/assets-test.js reads this same block in this same
   shape and for the same reason: a pool added to the app and not to the tool is
   invisible otherwise, and nothing anywhere says so. Two different readings of
   one block is how two files drift apart, so this is deliberately the same one.
   The only fields wanted off a row are the file it names and, where it has one,
   the folder and extension its badges live at. */
const html = fs.readFileSync(path.join(REPO, "index.html"), "utf8");
const POOLS = (() => {
  const a = html.indexOf("const POOLS = {"), b = html.indexOf("const QUIZZES = {");
  if (a < 0 || b < a) return [];
  return [...html.slice(a, b).matchAll(
    /^\s*"?([a-z0-9-]+)"?:\s*\{[\s\S]*?file:\s*"([^"]+)"[\s\S]*?flags:\s*(null|"[^"]*")[\s\S]*?ext:\s*"([^"]*)"/gm)]
    .map(m => ({ id: m[1], file: m[2], flags: m[3] === "null" ? null : m[3].slice(1, -1), ext: m[4] }));
})();
if (POOLS.length < 3) {
  console.error("NOT WRITING. The POOLS registry in index.html parsed to " + POOLS.length +
    " pools, which cannot be right.");
  process.exit(1);
}

/* THE CUP IS NOT IN POOLS. It is its own list in index.html, one file per year,
   fetched as assets/cup/<year>.json, and those seven files used to be typed into
   EXTRA_ASSETS by hand. Read the years from the app rather than scanning the
   folder: a stray file in assets/cup that the app never asks for should not ride
   along in the install, and an eighth cup year should not need a hand edit. */
const CUP_YEARS = (() => {
  const m = /const CUP_YEARS = \[([^\]]*)\]/.exec(html);
  return m ? [...m[1].matchAll(/"(\d{4})"/g)].map(x => x[1]) : [];
})();

/* A LEAGUE POOL IS THE ONE THAT POINTS AT A clubs.json, which is the app's own
   distinction and the reason six folder names no longer live in this file. */
const leaguePools = POOLS.filter(p => /clubs\.json$/.test(p.file));
const squadPools  = POOLS.filter(p => !/clubs\.json$/.test(p.file));

/* ---------- the club decks and their crests ---------- */
const decks = [];
const crests = new Set();
let clubs = 0;
for (const p of leaguePools) {
  const f = path.join(REPO, p.file);
  const dir = path.dirname(p.file);
  if (!fs.existsSync(f)) { console.log("  no deck yet for " + p.id + ", skipped"); continue; }
  decks.push(p.file);
  /* the question decks go in the same list: a league that has its clubs
     precached and not its questions is a team picker that opens onto nothing */
  for (const also of ["index.json", "mc.json"]) {
    if (fs.existsSync(path.join(REPO, dir, also))) decks.push(dir + "/" + also);
  }
  const rows = JSON.parse(fs.readFileSync(f, "utf8"));
  for (const name of Object.keys(rows)) {
    clubs++;
    const slug = rows[name].flag;
    /* the crest path comes off the registry row rather than being built from
       assets/logos here, because the registry is what the app will actually
       ask for. It comes to the same string today and it stops being a second
       opinion about where crests live. */
    if (slug && p.flags) crests.add(p.flags + slug + p.ext);
  }
}

/* ---------- the squad pools, their badges, and the cup ---------- */
const poolFiles = [];
const poolFlags = new Set();
let sidesSeen = 0, noBadge = 0;
for (const p of squadPools) {
  const f = path.join(REPO, p.file);
  if (!fs.existsSync(f)) { console.log("  no file yet for " + p.id + ", skipped"); continue; }
  poolFiles.push(p.file);
  const deck = JSON.parse(fs.readFileSync(f, "utf8"));
  for (const t of Object.values(deck.teams || deck)) {
    sidesSeen++;
    /* NO BADGE IS A DESIGN, not a hole: the picker draws a kit-coloured swatch
       for a side that has none, which is what lets a pool ship before every
       crest has been found, and the finals pool draws a swatch for all forty of
       its sides on purpose because it has no flags folder at all. Nothing to
       precache for those, so they are counted and the run says how many rather
       than naming a file that was never going to exist. */
    if (!p.flags || !t || !t.flag) { noBadge++; continue; }
    poolFlags.add(p.flags + t.flag + p.ext);
  }
}
for (const y of CUP_YEARS) {
  const rel = "assets/cup/" + y + ".json";
  if (fs.existsSync(path.join(REPO, rel))) poolFiles.push(rel);
  else console.log("  no cup file for " + y + ", skipped");
}

/* THE FOUR LISTS ARE NOT CROSS-DEDUPED, and that is on purpose: each one is a
   straight answer to its own question, and sw.js de-duplicates the whole thing
   at the point it installs it. A list that had to know what the other three
   hold would be a list that breaks when one of them changes. */
const LISTS = [
  ["CLUB_DECKS",  decks],
  ["CLUB_CRESTS", [...crests].sort()],
  ["POOL_FILES",  poolFiles],
  ["POOL_FLAGS",  WANT_FLAGS ? [...poolFlags].sort() : []],
];

/* ---------- guard one: every path is on disk ---------- */
/* addAll is all or nothing. One path that does not resolve and the install
   rejects, the app runs uncached, and nothing on screen says a word. */
const generated = LISTS.flatMap(([, list]) => list);
const missing = generated.filter(p => !fs.existsSync(path.join(REPO, p)));
if (missing.length) {
  console.error("NOT WRITING. " + missing.length + " file(s) named by the app are not on disk:");
  missing.slice(0, 10).forEach(p => console.error("  " + p));
  console.error("caches.addAll is all or nothing, so one of these leaves the app with no cache at all.");
  process.exit(1);
}

const kb = list => (list.reduce((t, p) => t + fs.statSync(path.join(REPO, p)).size, 0) / 1024).toFixed(0) + "KB";
const block = [OPEN]
  .concat(LISTS.map(([name, list]) => "const " + name + " = " + JSON.stringify(list) + ";"))
  .concat([SHUT]).join("\n");

let s = fs.readFileSync(SW, "utf8");
const nl = s.includes("\r\n") ? "\r\n" : "\n";
const a = s.indexOf(OPEN), b = s.indexOf(SHUT);
const had = (a >= 0 && b > a) ? s.slice(a, b) : "";
/* read the file with the old block cut out, so a list only counts as spread if
   something OUTSIDE the generated region spreads it and a block cannot vouch
   for itself */
const outside = (a >= 0 && b > a) ? s.slice(0, a) + s.slice(b + SHUT.length) : s;

/* ---------- guard two: everything declared is actually spread ---------- */
const dead = LISTS.map(([name]) => name).filter(name => !outside.includes("..." + name));
if (dead.length) {
  console.error("NOT WRITING. sw.js declares but never spreads: " + dead.join(", "));
  console.error("  Add " + dead.map(d => "..." + d).join(", ") + " to the ASSETS array in sw.js,");
  console.error("  below the generated block, and run this again.");
  console.error("  A generated list that nothing spreads is dead weight that looks maintained,");
  console.error("  which is exactly what NATFLAGS and MANAGER_LOGOS in that file already are.");
  process.exit(1);
}

/* ---------- guard three: nothing shrinks by accident ---------- */
const shrunk = had ? LISTS.map(([name, list]) => {
  const m = new RegExp("const " + name + " = (\\[[^\\n]*\\]);").exec(had);
  if (!m) return null;
  let before = [];
  try { before = JSON.parse(m[1]); } catch (e) { return null; }
  /* --no-flags is somebody saying out loud that the badges should go, so it is
     not the accident this guard is looking for */
  if (name === "POOL_FLAGS" && !WANT_FLAGS) return null;
  return before.length > list.length ? name + " " + before.length + " -> " + list.length : null;
}).filter(Boolean) : [];
if (shrunk.length && !SHRINK) {
  console.error("NOT WRITING. These lists came back smaller than what is in sw.js now:");
  shrunk.forEach(q => console.error("  " + q));
  console.error("  A registry row that stopped matching looks exactly like this and would ship an");
  console.error("  install with a pool missing out of it, a bumped cache and an exit code of 0.");
  console.error("  If a club went down or a pool was retired that is real, and --shrink says so.");
  process.exit(1);
}

if (a >= 0 && b > a) {
  s = s.slice(0, a) + block.split("\n").join(nl) + s.slice(b + SHUT.length);
} else {
  /* first run: drop it in above the precache list that will use it. const is
     not hoisted, so a generated list below the array that spreads it throws a
     ReferenceError on install and kills the whole service worker silently,
     which is what happened from v111 to v123. Above, always. */
  const anchor = "const EXTRA_ASSETS";
  const at = s.indexOf(anchor);
  if (at < 0) { console.error("cannot find EXTRA_ASSETS to sit above"); process.exit(1); }
  s = s.slice(0, at) + block.split("\n").join(nl) + nl + s.slice(at);
}

/* bump the cache, or phones keep serving the old build */
const m = s.match(/const CACHE = "ball-quiz-3-v(\d+)"/);
let bumped = null;
if (m) {
  bumped = Number(m[1]) + 1;
  s = s.replace(m[0], 'const CACHE = "ball-quiz-3-v' + bumped + '"');
}

console.log(decks.length + " club deck files, " + crests.size + " crests for " + clubs + " clubs");
console.log(poolFiles.length + " pool files (" + squadPools.length + " squad pools and " +
  CUP_YEARS.length + " cup years)");
console.log(WANT_FLAGS
  ? poolFlags.size + " pool badges, " + kb([...poolFlags]) + " (" + noBadge + " of " + sidesSeen +
    " sides draw a kit swatch and need none)"
  : "pool badges left out by --no-flags: " + poolFlags.size + " files, " + kb([...poolFlags]) +
    " that a pool picker will draw as grey boxes offline");
for (const [name, list] of LISTS) console.log("  " + name.padEnd(12) + String(list.length).padStart(4) + "   " + kb(list));
console.log("generated " + generated.length + " paths, " + kb(generated) + " on disk");

/* AN OLD HAND-TYPED ENTRY IS NOT A BUG NOW, it is a duplicate, and sw.js
   de-duplicates ASSETS before it installs it. Say so rather than reaching
   outside the markers to delete it: a generator that edits the parts of a file
   it does not own is how two writers start fighting over one file, and this one
   has two neighbours in there. Deleting them is a hand edit somebody can make
   once, and until then the install is right either way. */
const extra = s.slice(s.indexOf("const EXTRA_ASSETS"), s.indexOf("const ASSETS"));
const dupes = generated.filter(p => extra.includes('"' + p + '"'));
if (dupes.length) {
  console.log("\nnote: " + dupes.length + " of these are also typed into EXTRA_ASSETS by hand.");
  console.log("  Harmless, the install de-duplicates, but they are generated now:");
  dupes.slice(0, 12).forEach(p => console.log("    " + p));
}

if (DRY) {
  console.log("\n--dry, nothing written" + (bumped ? " (CACHE would go to v" + bumped + ")" : ""));
  process.exit(0);
}
fs.writeFileSync(SW, s);
if (bumped) console.log("CACHE bumped to v" + bumped);
