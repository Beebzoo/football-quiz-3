/* Append checked questions to assets/extra/index.json.

   APPEND, never rebuild. Two reasons: S.used holds indexes, so reordering a
   tier would point a resumed match at the wrong questions, and the shipped
   pack already carries hand edits (ten questions shortened to fit the card)
   that regenerating from the checked files would silently undo.

   node append-pack.js in1.json in2.json ... [--write]  */
const fs = require("fs"), path = require("path"), vm = require("vm");
const REPO = path.resolve(__dirname, "..", "..");
const PACK = path.join(REPO, "assets/extra/index.json");
const TIERS = ["easy", "normal", "hard", "extreme", "ball"];
const MAXQ = 150;                                   // the card cuts off past this

const args = process.argv.slice(2);
const write = args.includes("--write");
const ins = args.filter(a => a !== "--write");
const rd = f => JSON.parse(fs.readFileSync(f, "utf8").replace(/^\uFEFF/, ""));

/* ---- everything the app currently loads, packs read from PACKS itself so
        this cannot drift from what index.html actually fetches ---- */
const src = fs.readFileSync(path.join(REPO, "index.html"), "utf8");
const start = src.indexOf("const BANK"), open = src.indexOf("{", start);
let depth = 0, end = -1, inStr = null;
for (let i = open; i < src.length; i++) {
  const c = src[i], p = src[i - 1];
  if (inStr) { if (c === inStr && p !== "\\") inStr = null; continue; }
  if (c === '"' || c === "'" || c === "`") { inStr = c; continue; }
  if (c === "{") depth++; else if (c === "}") { depth--; if (!depth) { end = i + 1; break; } }
}
const BANK = vm.runInNewContext("(" + src.slice(open, end) + ")");
const packList = vm.runInNewContext("(" + src.slice(src.indexOf("[", src.indexOf("const PACKS")),
  src.indexOf("]", src.indexOf("const PACKS")) + 1) + ")");
console.log("packs the app loads:", packList.join(", "));
for (const p of packList) {
  const extra = rd(path.join(REPO, p));
  for (const [t, rows] of Object.entries(extra)) if (BANK[t] && rows) BANK[t].push(...rows);
}

const STOP = new Set(["the","a","an","which","who","what","in","at","of","for","to","did","does","was","were","is","club","team","player"]);
const norm = s => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
  .replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter(w => w && !STOP.has(w)).sort().join(" ");
const nums = s => JSON.stringify([...new Set(String(s).match(/\d+/g) || [])].sort());
const OVERLAP = 0.7;

const seen = new Set(), byAns = new Map();
for (const t of TIERS) for (const r of BANK[t]) {
  seen.add(norm(r.q));
  const k = norm(String(r.a));
  if (!byAns.has(k)) byAns.set(k, []);
  byAns.get(k).push({ t, words: new Set(norm(r.q).split(" ")), q: r.q });
}
function nearDupe(q, a) {
  const mine = new Set(norm(q).split(" ")), mynums = nums(q);
  for (const cand of byAns.get(norm(String(a))) || []) {
    if (nums(cand.q) !== mynums) continue;
    let shared = 0;
    for (const w of mine) if (cand.words.has(w)) shared++;
    if (shared / Math.max(mine.size, cand.words.size) >= OVERLAP) return cand;
  }
  return null;
}

const pack = rd(PACK);
const before = Object.fromEntries(TIERS.map(t => [t, (pack[t] || []).length]));
const problems = [];
let n = 0, added = 0;

for (const f of ins) for (const r of rd(f)) {
  n++;
  const where = `${path.basename(f)}: ${String(r.q).slice(0, 60)}`;
  if (r.verdict === "drop") { problems.push(`DROPPED by checker  ${where}`); continue; }
  if (r.verdict === "pending") { problems.push(`STILL UNCHECKED     ${where}`); continue; }
  if (!TIERS.includes(r.tier)) { problems.push(`BAD TIER ${r.tier}  ${where}`); continue; }
  if (!r.q || !r.a) { problems.push(`EMPTY  ${where}`); continue; }
  if (/[\u2014\u2013]/.test(r.q + r.a)) { problems.push(`EM DASH  ${where}`); continue; }
  if (/[{}|]/.test(r.q + r.a)) { problems.push(`TEMPLATE JUNK  ${where}`); continue; }
  if (r.q.length > MAXQ) { problems.push(`OVER ${MAXQ} CHARS (${r.q.length})  ${where}`); continue; }
  const k = norm(r.q);
  if (seen.has(k)) { problems.push(`DUPLICATE  ${where}`); continue; }
  const near = nearDupe(r.q, r.a);
  if (near) { problems.push(`NEAR DUPLICATE of "${near.q.slice(0, 50)}"  <- ${where}`); continue; }

  seen.add(k);
  const ak = norm(String(r.a));
  if (!byAns.has(ak)) byAns.set(ak, []);
  byAns.get(ak).push({ t: r.tier, words: new Set(k.split(" ")), q: r.q });
  (pack[r.tier] = pack[r.tier] || []).push(r.cat ? { q: r.q, a: r.a, cat: r.cat } : { q: r.q, a: r.a });
  added++;
}

console.log(`\nread ${n} checked rows, appending ${added}`);
for (const t of TIERS) console.log(`  ${t.padEnd(8)} ${String(before[t] || 0).padStart(4)} -> ${String((pack[t] || []).length).padStart(4)}`);
if (problems.length) { console.log(`\nrefused ${problems.length}:`); problems.forEach(p => console.log("   ! " + p)); }

if (write) { fs.writeFileSync(PACK, JSON.stringify(pack, null, 1), "utf8"); console.log("\nwrote " + PACK); }
else console.log("\n(dry run, pass --write to save)");
