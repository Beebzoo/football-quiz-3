/* Build a league's question pack from its checked question files.
 *
 *     node _tools/_questions/build-league.js <league> [--raw] [--append] [--write] [--verbose]
 *
 *     league   premier | laliga | bundesliga | seriea | belgian | ere
 *
 * Generalised from build-ere.js, which did this for one league with the Dutch
 * clubs typed into it. Six leagues is six of those lists to keep in step, so
 * the clubs now come from that league's own assets/<dir>/clubs.json, which is
 * harvested and already correct, plus an optional clubs-extra.json per league
 * for the sides a question bank talks about that are not in the division this
 * season. Nobody was ever going to keep six hand-typed lists honest.
 *
 * WHAT IT ENFORCES, same as before:
 *   - only rows a fact-checker marked ok or fixed
 *   - the card limits, so nothing overflows the question card
 *   - no brackets, no missing terminal punctuation
 *   - no live records ("all-time", "still holds"), which have a shelf life
 *   - nothing that repeats the Classic bank, this league's shipping pack, or
 *     itself, by near-duplicate rather than exact match
 *
 * FIRST BUILD ONLY, unless --append. Once a pack has shipped, S.used holds
 * indexes into each tier, so a rebuild that reorders a tier points every parked
 * match at the wrong questions.
 */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const HERE = __dirname;
const REPO = path.resolve(HERE, "..", "..");
const TIERS = ["easy", "normal", "hard", "extreme", "ball"];
const MAXQ = 150, MAXA = 110, MAXS = 110;

const LEAGUES = {
  premier:    {dir: "premier",    label: "Premier League", stop: ["premier", "english", "england"]},
  laliga:     {dir: "laliga",     label: "La Liga",        stop: ["liga", "spanish", "spain"]},
  bundesliga: {dir: "bundesliga", label: "Bundesliga",     stop: ["bundesliga", "german", "germany"]},
  seriea:     {dir: "seriea",     label: "Serie A",        stop: ["serie", "italian", "italy"]},
  belgian:    {dir: "belgian",    label: "Pro League",     stop: ["belgian", "belgium", "pro"]},
  ere:        {dir: "eredivisie", label: "Eredivisie",     stop: ["eredivisie", "dutch", "netherlands"]},
  /* THE SECOND DIVISIONS, and the one word each of them must NOT stop on.
     The stop list is here so that near-dupe detection is not fooled by every
     question in a deck carrying the league's own name. Put a second division
     next to its top flight and that reverses: the tier word is the only thing
     telling two questions apart, and stopping it makes them the same question.

     "Which club won the 1995-96 2. Bundesliga?" normalises to 1995 96 won once
     "bundesliga" and "2" are stopped. So does the classic bank's "Which club
     won the 1995-96 Bundesliga?". Different question, different answer, and
     nineteen champions of the German second tier were thrown out as dupes of
     the German first. Serie B lost nineteen the same way, because the base
     list already stops a bare "a" and "b" was added here.

     So the tier word stays: 2, B, Challenger. Everything else that identifies
     the competition rather than the question still goes. */
  champ:      {dir: "championship", label: "Championship", stop: ["championship", "english", "england", "efl", "first", "division"]},
  segunda:    {dir: "segunda",      label: "Segunda División", stop: ["segunda", "division", "spanish", "spain", "hypermotion"]},
  bundesliga2:{dir: "bundesliga2",  label: "2. Bundesliga", stop: ["bundesliga", "german", "germany", "zweite"]},
  serieb:     {dir: "serieb",       label: "Serie B",      stop: ["serie", "italian", "italy"]},
  challenger: {dir: "challenger",   label: "Challenger Pro League", stop: ["pro", "belgian", "belgium", "second", "division"]},
  eerste:     {dir: "eerste",       label: "Eerste Divisie", stop: ["eerste", "divisie", "dutch", "netherlands", "keuken", "kampioen", "jupiler"]},
};

const args = process.argv.slice(2);
const id = args.find(a => LEAGUES[a]);
if (!id) { console.error("which league? " + Object.keys(LEAGUES).join(" | ")); process.exit(1); }
const row = LEAGUES[id];
const SRCDIR = path.join(HERE, row.dir);
const OUT = path.join(REPO, "assets", row.dir, "index.json");
const write = args.includes("--write"), raw = args.includes("--raw"), append = args.includes("--append");
const rd = f => JSON.parse(fs.readFileSync(f, "utf8").replace(/^﻿/, ""));

/* ---- the Classic bank as the app loads it, so nothing here repeats it ---- */
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
for (const p of packList) {
  const extra = rd(path.join(REPO, p));
  for (const [t, rows] of Object.entries(extra)) if (BANK[t] && rows) BANK[t].push(...rows);
}

/* ---- near-duplicate detection ----
   Same idea as build-ere.js: two questions with the same answer, the same
   numbers in them and most of the same words are the same question however
   differently they are phrased. */
const STOP = new Set(["the", "a", "an", "which", "who", "what", "in", "at", "of", "for", "to",
  "did", "does", "was", "were", "is", "club", "team", "player", "season", "league"].concat(row.stop));
const norm = s => String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
  .replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter(w => w && !STOP.has(w)).sort().join(" ");
const nums = s => JSON.stringify([...new Set(String(s).match(/\d+/g) || [])].sort());
const OVERLAP = 0.7;

const seenQ = new Set(), byAns = new Map();
function remember(r, where) {
  seenQ.add(norm(r.q));
  const k = norm(r.a);
  if (!byAns.has(k)) byAns.set(k, []);
  byAns.get(k).push({where: where, words: new Set(norm(r.q).split(" ")), q: r.q});
}
for (const t of TIERS) for (const r of BANK[t]) remember(r, "classic");
function nearDupe(r) {
  if (seenQ.has(norm(r.q))) return {q: r.q, where: "exact"};
  const mine = new Set(norm(r.q).split(" ")), mynums = nums(r.q);
  for (const cand of byAns.get(norm(r.a)) || []) {
    if (nums(cand.q) !== mynums) continue;
    let shared = 0;
    for (const w of mine) if (cand.words.has(w)) shared++;
    if (shared / Math.max(mine.size, cand.words.size) >= OVERLAP) return cand;
  }
  return null;
}

/* ---- which club's crest goes under the question ----
   The rule that matters: the crest comes from a club named in the QUESTION and
   never from one named in the answer. It is there to give the table something
   to look at while they think, so a crest that answers the question would ruin
   the thing it is for.

   The list is built from the league's own harvested clubs, plus whatever
   clubs-extra.json adds for sides the bank talks about that are not in the
   division now. Aliases of four characters or fewer match case sensitively,
   because "AZ" and "NEC" as lowercase fragments turn up inside ordinary words. */
const LOGOS = path.join(REPO, "assets/logos");
const CLUBS = [];
{
  const f = path.join(REPO, "assets", row.dir, "clubs.json");
  if (fs.existsSync(f)) {
    const cur = rd(f);
    for (const name of Object.keys(cur)) {
      if (!cur[name].flag) continue;
      /* the common name, and the name without its legal form: "Tottenham
         Hotspur" is also "Tottenham", "AFC Bournemouth" is "Bournemouth" */
      const short = name.replace(/\b(F\.?C\.?|A\.?F\.?C\.?|S\.?C\.?|C\.?F\.?|CF|FC)\b/gi, "").replace(/\s+/g, " ").trim();
      const names = [...new Set([name, short].filter(Boolean))];
      CLUBS.push({s: cur[name].flag, names: names});
    }
  }
  const extra = path.join(SRCDIR, "clubs-extra.json");
  if (fs.existsSync(extra)) {
    for (const c of rd(extra)) {
      const hit = CLUBS.find(x => x.s === c.s);
      if (hit) { hit.names = [...new Set(hit.names.concat(c.names))]; if (c.not) hit.not = (hit.not || []).concat(c.not); }
      else CLUBS.push(c);
    }
  }
}
{
  const missing = CLUBS.filter(c => !fs.existsSync(path.join(LOGOS, c.s + ".png")));
  if (missing.length) { console.error("no crest on disk for: " + missing.map(c => c.s).join(", ")); process.exit(1); }
}
const rx = s => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
for (const c of CLUBS) c.names.sort((a, b) => b.length - a.length);   // longest alias first
const mentions = (text, alias) =>
  new RegExp("(^|[^A-Za-z0-9])" + rx(alias) + "($|[^A-Za-z0-9])", alias.length <= 4 ? "" : "i").test(text);
function clubFor(q, a) {
  const hits = [];
  for (const c of CLUBS) {
    if (c.not && c.not.some(n => mentions(q + " " + a, n))) continue;
    const inQ = c.names.find(n => mentions(q, n));
    if (!inQ) continue;
    if (c.names.some(n => mentions(a, n))) continue;   // never the answer
    const at = q.toLowerCase().indexOf(inQ.toLowerCase());
    hits.push({s: c.s, at: at < 0 ? 1e9 : at});
  }
  if (!hits.length) return null;
  hits.sort((x, y) => x.at - y.at);                    // the first club named wins
  return hits[0].s;
}

/* DOES THE QUESTION ASK FOR A PERSON? Only the openings that can have no other
   kind of answer. "Which club" and "who won" are left alone on purpose,
   because a club is the right answer to both. */
const ASKS_PERSON = /^(who (was|were) the (top|leading) (goal)?scorer|who scored|who kept|who managed|who was (the )?(manager|coach|captain|keeper|goalkeeper)|which (player|striker|goalkeeper|keeper|manager|coach|midfielder|defender|forward|winger))/i;
/* is the whole answer a club and nothing else */
const answerIsClub = a => CLUBS.some(c => c.names.some(n =>
  String(a).trim().toLowerCase() === String(n).trim().toLowerCase()));

/* ---- the shipping pack, when appending ---- */
const pack = Object.fromEntries(TIERS.map(t => [t, []]));
if (append && fs.existsSync(OUT)) {
  const cur = rd(OUT);
  for (const t of TIERS) { pack[t] = cur[t] || []; for (const r of pack[t]) remember(r, "shipping"); }
}

/* ---- the candidates ---- */
if (!fs.existsSync(SRCDIR)) { console.error("no question folder at " + path.relative(REPO, SRCDIR)); process.exit(1); }
const files = fs.readdirSync(SRCDIR).filter(f => (raw ? /^raw-.*\.json$/ : /^checked-.*\.json$/).test(f)).sort();
if (!files.length) { console.log("no input files in " + path.relative(REPO, SRCDIR)); process.exit(1); }
const rejects = [];
const clean = s => String(s).replace(/[‒–—―]/g, "-").replace(/\s+/g, " ").trim();
let kept = 0;
for (const f of files) {
  const rows = rd(path.join(SRCDIR, f));
  for (const r of rows) {
    const why = [];
    const verdict = (r.verdict || "ok").toLowerCase();
    if (!raw && ["ok", "fixed"].indexOf(verdict) === -1) why.push("verdict " + verdict);
    const tier = String(r.tier || "").toLowerCase();
    if (TIERS.indexOf(tier) === -1) why.push("tier " + tier);
    const q = clean(r.q || ""), a = clean(r.a || ""), sub = r.sub ? clean(r.sub) : "";
    if (!q || !a) why.push("empty");
    if (q.length > MAXQ) why.push("q " + q.length);
    if (a.length > MAXA) why.push("a " + a.length);
    if (sub.length > MAXS) why.push("sub " + sub.length);
    if (/[{}|\[\]]/.test(q + a)) why.push("brackets");
    if (!/[?.!]$/.test(q)) why.push("no terminal punctuation");
    if (/\b(currently|all[- ]time|still holds?|to date|as of (today|now)|the current|most capped|record holder)\b/i.test(q)) why.push("live record");
    /* THE ANDERLECHT CHECK. "and has the most Belgian titles" slipped past
       the live-record filter because bare "most" is not on the banned list,
       and a superlative in the present tense goes stale the moment somebody
       wins another one. Past tense anchored to a season is still fine:
       "by the end of 2017-18, which club HAD the most" reads as history. */
    if (/(has|have|holds|hold|is|are) the (most|fewest|highest|lowest|best|longest|biggest)/i.test(q)) why.push("live superlative");
    /* the Lewandowski check: a person was asked for and a club came back */
    if (ASKS_PERSON.test(q) && answerIsClub(a)) why.push("asks for a person, answers with a club");
    if (!why.length) { const d = nearDupe({q: q, a: a}); if (d) why.push("dupe of " + d.where + ": " + d.q.slice(0, 70)); }
    if (why.length) { rejects.push({f: f, q: (r.q || "").slice(0, 90), why: why.join("; ")}); continue; }
    const out = {q: q, a: a};
    if (sub) out.sub = sub;
    /* the category the specialisms idea will want. Kept on the row from the
       start for the new leagues, because retrofitting tags onto a shipped bank
       is the job the classic bank is now stuck with. */
    if (r.cat) out.cat = String(r.cat).toLowerCase();
    const club = clubFor(q, a); if (club) out.club = club;
    pack[tier].push(out); remember(out, "pack"); kept++;
  }
}

console.log("\n" + row.label + ": " + files.length + " file(s), " + kept + " kept, " + rejects.length + " rejected");
console.log("per tier:", TIERS.map(t => t + " " + pack[t].length).join(" / "));
const byWhy = {};
for (const r of rejects) { const k = r.why.split(":")[0]; byWhy[k] = (byWhy[k] || 0) + 1; }
if (rejects.length) console.log("rejections:", JSON.stringify(byWhy));
if (args.includes("--verbose")) for (const r of rejects) console.log("  " + r.f + "  " + r.why + "\n      " + r.q);
const total = TIERS.reduce((n, t) => n + pack[t].length, 0);
const crested = TIERS.reduce((n, t) => n + pack[t].filter(r => r.club).length, 0);
const crests = [...new Set(TIERS.flatMap(t => pack[t].map(r => r.club).filter(Boolean)))].sort();
console.log("crests: " + crests.length + " clubs on " + crested + " of " + total + " questions");
const cats = {};
TIERS.forEach(t => pack[t].forEach(r => { if (r.cat) cats[r.cat] = (cats[r.cat] || 0) + 1; }));
if (Object.keys(cats).length) console.log("categories:", Object.entries(cats).sort((a, b) => b[1] - a[1])
  .map(e => e[0] + " " + e[1]).join("  "));

/* thin tiers are worth shouting about: the pitch draws Easy constantly for
   short balls, so an Easy tier of nine runs dry inside one match */
const thin = TIERS.filter(t => pack[t].length < 25);
if (thin.length) console.log("THIN TIERS (a match will run these dry): " + thin.join(", "));

if (write) {
  fs.mkdirSync(path.dirname(OUT), {recursive: true});
  fs.writeFileSync(OUT, JSON.stringify(pack, null, 1));
  console.log("wrote " + path.relative(REPO, OUT) + "  (" + (fs.statSync(OUT).size / 1024).toFixed(1) + " KB)");
  console.log("now run: node _tools/sw-clubs.js   to precache any new crest");
} else console.log("dry run, add --write to ship");
