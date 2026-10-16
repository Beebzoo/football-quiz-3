/* Carry in-place fixes to a shipped deck back into its checked-*.json sources.
 *
 *     node _tools/_questions/sync-fixes.js <deck-dir> <git-rev> [--write]
 *
 * WHY. build-league.js --append recognises a source row as already shipped by
 * its question and answer. Correct a shipped row in place (the only safe way,
 * since S.used holds indexes) and the wrong original still sits in checked-*.json,
 * no longer matching anything shipped, so the next --append quietly ships it
 * again as a "new" question, wrong answer and all.
 *
 * So: diff the deck at <git-rev> against the working copy, index by index, and
 * for every row that changed, rewrite the source row that matches the old
 * question and answer to the new one. Rows only appended since <git-rev> are
 * ignored; only rows that existed at <git-rev> and now differ count as fixes.
 */
const fs = require("fs");
const path = require("path");
const cp = require("child_process");

const [dir, rev] = process.argv.slice(2).filter(a => !a.startsWith("--"));
const write = process.argv.includes("--write");
if (!dir || !rev) { console.error("usage: sync-fixes.js <deck-dir> <git-rev> [--write]"); process.exit(1); }

const REPO = path.resolve(__dirname, "..", "..");
const TIERS = ["easy", "normal", "hard", "extreme", "ball"];
const rel = "assets/" + dir + "/index.json";
const old = JSON.parse(cp.execSync("git show " + rev + ":" + rel, {cwd: REPO, encoding: "utf8"}));
const cur = JSON.parse(fs.readFileSync(path.join(REPO, rel), "utf8"));

const fixes = [];
for (const t of TIERS) (old[t] || []).forEach((o, i) => {
  const n = cur[t] && cur[t][i];
  if (n && (o.q !== n.q || String(o.a) !== String(n.a) || (o.sub || "") !== (n.sub || ""))) fixes.push({t, i, o, n});
});
console.log(dir + ": " + fixes.length + " shipped row(s) changed since " + rev);

const SRC = path.join(__dirname, dir);
let synced = 0;
const unmatched = new Set(fixes);
for (const f of fs.readdirSync(SRC).filter(f => /^checked-.*\.json$/.test(f))) {
  const file = path.join(SRC, f);
  const rows = JSON.parse(fs.readFileSync(file, "utf8").replace(/^﻿/, ""));
  let touched = 0;
  for (const r of rows) for (const fx of fixes) {
    if (r.q !== fx.o.q || String(r.a) !== String(fx.o.a)) continue;
    r.q = fx.n.q; r.a = fx.n.a;
    if (fx.n.sub) r.sub = fx.n.sub; else delete r.sub;
    if (fx.n.cat) r.cat = fx.n.cat;
    r.verdict = "fixed";
    r.note = ((r.note || "") + " Synced from in-place fix to shipped " + fx.t + " " + fx.i + ".").trim();
    unmatched.delete(fx); touched++; synced++;
  }
  if (touched) {
    console.log("  " + f + ": " + touched + " row(s)");
    if (write) fs.writeFileSync(file, JSON.stringify(rows, null, 1) + "\n", "utf8");
  }
}
console.log("synced " + synced + (write ? "" : " (dry run, add --write)"));
for (const fx of unmatched) console.log("  no source row for " + fx.t + " " + fx.i + ": " + fx.o.q.slice(0, 70));
