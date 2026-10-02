/* Build the Special deck: the one written for the three people who play this.
 *
 *     node _tools/_questions/special/build-special.js [--write] [--verbose]
 *
 * Special came over from BALL 1, where it was a mode of its own with its own
 * screen and its own scoring, and it arrived here as a flat array of 63 rows
 * priced 3, 5, 8 and 10. Nothing in BALL 3 could read that shape, so for three
 * weeks the most personal content in the app was sitting in assets/ with no
 * mode able to reach it. This turns it into what BALL 3 calls a quiz: five
 * tiers, same row shape as every league deck, so the existing engine plays it
 * with no new screen at all.
 *
 * THE PRICES BECOME TIERS IN THE ORDER THE AUTHOR PUT THEM IN. 3 is the
 * cheapest question in the file and 10 the dearest, so they map straight onto
 * easy, normal, hard and extreme. The author's own ordering is better evidence
 * of difficulty than anything this script could infer, and re-reading 63
 * questions to second-guess it would be inventing a judgement rather than
 * carrying one across. BALL is not in the source at all, because a price list
 * has no stories tier; those rows are written separately and arrive as
 * checked-*.json in this folder.
 *
 * THE STRAND BECOMES A CREST. Each row carries s = mvv, lp, ma, nl or es, and
 * all five have artwork on disk already, so the crest that BALL 1 drew behind
 * its own bespoke screen now rides the ordinary question card instead. The
 * strand stays on the row as well, so a future Special screen can still colour
 * itself by it.
 *
 * APPEND, NEVER REBUILD, once this has shipped: S.used holds indexes into each
 * tier. Re-running on the same inputs is safe because the order is a pure
 * function of the source file, but adding rows anywhere but the end is not.
 */
const fs = require("fs");
const path = require("path");

const HERE = __dirname;
const REPO = path.resolve(HERE, "..", "..", "..");
const OUT = path.join(REPO, "assets/special/index.json");
const TIERS = ["easy", "normal", "hard", "extreme", "ball"];

const args = process.argv.slice(2);
const write = args.includes("--write");
const verbose = args.includes("--verbose");
const rd = f => JSON.parse(fs.readFileSync(f, "utf8").replace(/^﻿/, ""));

/* price -> tier, in the author's own order of difficulty */
const PRICE_TIER = { 3: "easy", 5: "normal", 8: "hard", 10: "extreme" };

/* strand -> the artwork that goes under the question, and what it is called */
const STRANDS = {
  mvv: { club: "mvv-maastricht",      name: "MVV Maastricht" },
  lp:  { club: "las-palmas",          name: "UD Las Palmas" },
  ma:  { club: "morocco-national-team", name: "Morocco" },
  nl:  { club: "dutch-national-team", name: "the Netherlands" },
  es:  { club: "spain-national-team", name: "Spain" },
};

const MAXQ = 150, MAXA = 110, MAXS = 110;
const clean = s => String(s).replace(/[‒–—―]/g, "-").replace(/\s+/g, " ").trim();

const pack = Object.fromEntries(TIERS.map(t => [t, []]));
const rejects = [];
const seen = new Set();
const norm = s => clean(s).toLowerCase().replace(/[^a-z0-9 ]/g, "");

function add(row, tier, where) {
  const why = [];
  const q = clean(row.q || ""), a = clean(row.a || "");
  const sub = row.sub ? clean(row.sub) : (row.note ? clean(row.note) : "");
  if (!q || !a) why.push("empty");
  if (!TIERS.includes(tier)) why.push("tier " + tier);
  if (q.length > MAXQ) why.push("q " + q.length);
  if (a.length > MAXA) why.push("a " + a.length);
  if (sub.length > MAXS) why.push("sub " + sub.length);
  if (/[{}|\[\]]/.test(q + a)) why.push("brackets");
  if (!/[?.!]$/.test(q)) why.push("no terminal punctuation");
  if (/\b(currently|all[- ]time|still holds?|to date|as of (today|now)|the current|record holder)\b/i.test(q)) why.push("live record");
  if (!STRANDS[row.s]) why.push("unknown strand " + row.s);
  if (seen.has(norm(q))) why.push("duplicate");
  if (why.length) { rejects.push({ where, q: q.slice(0, 80), why: why.join("; ") }); return; }
  seen.add(norm(q));
  const out = { q, a };
  if (sub) out.sub = sub;
  out.club = STRANDS[row.s].club;
  out.s = row.s;
  out.cat = "stories";
  pack[tier].push(out);
}

/* ---- the 63 that came over from BALL 1 ---- */
const legacy = rd(path.join(HERE, "legacy-63.json"));
for (const r of legacy) {
  const tier = PRICE_TIER[r.p];
  if (!tier) { rejects.push({ where: "legacy", q: String(r.q).slice(0, 80), why: "no tier for price " + r.p }); continue; }
  add(r, tier, "legacy");
}

/* ---- anything written since, already fact-checked, carrying its own tier ---- */
for (const f of fs.readdirSync(HERE).filter(f => /^checked-.*\.json$/.test(f)).sort()) {
  for (const r of rd(path.join(HERE, f))) {
    const verdict = String(r.verdict || "ok").toLowerCase();
    if (!["ok", "fixed"].includes(verdict)) { rejects.push({ where: f, q: String(r.q).slice(0, 80), why: "verdict " + verdict }); continue; }
    add(r, String(r.tier || "").toLowerCase(), f);
  }
}

const total = TIERS.reduce((n, t) => n + pack[t].length, 0);
console.log(`\n${total} kept, ${rejects.length} rejected`);
console.log("per tier: " + TIERS.map(t => `${t} ${pack[t].length}`).join(" / "));
const byStrand = {};
TIERS.forEach(t => pack[t].forEach(r => { byStrand[r.s] = (byStrand[r.s] || 0) + 1; }));
console.log("per strand: " + Object.entries(byStrand).map(([k, v]) => `${STRANDS[k].name} ${v}`).join(" / "));
if (verbose) rejects.forEach(r => console.log(`  ${r.where}  ${r.why}\n      ${r.q}`));
else if (rejects.length) console.log("rejections: " + JSON.stringify(rejects.reduce((m, r) => { const k = r.why.split(";")[0]; m[k] = (m[k] || 0) + 1; return m; }, {})));

const empty = TIERS.filter(t => !pack[t].length);
if (empty.length) console.log(`\nNOTE: no rows yet in ${empty.join(", ")}. The picker hides a tier with nothing in it.`);

if (write) {
  fs.writeFileSync(OUT, JSON.stringify(pack, null, 1));
  console.log("wrote " + path.relative(REPO, OUT));
} else console.log("dry run, add --write to ship");
