/* Corroborate a league's raw questions against the sources they cite.
 *
 *     node _tools/_questions/check-league.js <league> [--write] [--verbose]
 *
 * Turns raw-*.json into checked-*.json by going and looking. For every row it
 * fetches the article the row names in `src` and asks whether the answer, and
 * the distinctive words of the question, are actually in it.
 *
 * WHAT THIS IS AND IS NOT. It is CORROBORATION, not proof. An article that
 * contains both "Leicester City" and "2015-16" does not prove Leicester won
 * that season, and this tool does not pretend otherwise. What it reliably
 * catches is the failure that matters most here: an answer that is simply not
 * in the source at all, which is what a half-remembered name looks like. That
 * is the difference between a bank that is occasionally arguable and one that
 * is confidently wrong, and on the pitch a confidently wrong question does not
 * merely annoy somebody, it decides a pass.
 *
 * Anything it cannot confirm comes back as `review`, never `drop`. A machine
 * that has not found a name has not proved a negative, and build-league.js
 * ships only ok and fixed, so an unconfirmed row simply does not go out until
 * a human has looked at it.
 *
 * THE CACHE. Sources repeat heavily across a deck, so every article is written
 * to _cache/ on first fetch and read from there afterwards. Re-running after an
 * edit costs nothing and does not hammer Wikipedia for the tenth copy of the
 * same season article. Delete _cache/ to force a refresh.
 */
const fs = require("fs");
const path = require("path");
const https = require("https");

const HERE = __dirname;
const REPO = path.resolve(HERE, "..", "..");
const CACHE = path.join(HERE, "_cache");
const UA = "BALL2-quiz-build/1.0 (https://github.com/Beebzoo/football-quiz-2; personal hobby project)";
const DIRS = {premier: "premier", laliga: "laliga", bundesliga: "bundesliga",
              seriea: "seriea", belgian: "belgian", ere: "eredivisie",
              champ: "championship", segunda: "segunda", bundesliga2: "bundesliga2",
              serieb: "serieb", challenger: "challenger", eerste: "eerste"};

const args = process.argv.slice(2);
const id = args.find(a => DIRS[a]);
if (!id) { console.error("which league? " + Object.keys(DIRS).join(" | ")); process.exit(1); }
const SRCDIR = path.join(HERE, DIRS[id]);
const WRITE = args.includes("--write");
const VERBOSE = args.includes("--verbose");

/* ---------- fetching, politely and once ---------- */
const sleep = ms => new Promise(r => setTimeout(r, ms));
let last = 0;
const GAP = 400;
function once(url) {
  return new Promise((res, rej) => {
    https.get(url, {headers: {"User-Agent": UA}}, r => {
      if (r.statusCode >= 300 && r.statusCode < 400 && r.headers.location) return res(once(r.headers.location));
      if (r.statusCode !== 200) { r.resume(); const e = new Error("HTTP " + r.statusCode); e.status = r.statusCode; return rej(e); }
      let b = ""; r.setEncoding("utf8");
      r.on("data", d => b += d); r.on("end", () => res(b));
    }).on("error", rej);
  });
}
const key = t => t.replace(/[^A-Za-z0-9]+/g, "_").slice(0, 120);
async function article(title) {
  fs.mkdirSync(CACHE, {recursive: true});
  const f = path.join(CACHE, key(title) + ".txt");
  if (fs.existsSync(f)) return fs.readFileSync(f, "utf8");
  const wait = GAP - (Date.now() - last);
  if (wait > 0) await sleep(wait);
  last = Date.now();
  try {
    const raw = await once("https://en.wikipedia.org/w/api.php?action=query&prop=extracts&explaintext=1" +
      "&format=json&formatversion=2&redirects=1&titles=" + encodeURIComponent(title));
    const j = JSON.parse(raw);
    const p = (j.query && j.query.pages && j.query.pages[0]) || {};
    /* extracts gives the prose but not the tables, and half of what a season
       article knows lives in a table. The wikitext has both. */
    const raw2 = await once("https://en.wikipedia.org/w/api.php?action=parse&prop=wikitext" +
      "&format=json&formatversion=2&redirects=1&page=" + encodeURIComponent(title));
    const j2 = JSON.parse(raw2);
    const wt = (j2.parse && j2.parse.wikitext) || "";
    const text = (p.extract || "") + "\n" + wt;
    fs.writeFileSync(f, text);
    return text;
  } catch (e) {
    fs.writeFileSync(f, "");          // remember the miss, do not ask again this run
    return "";
  }
}

/* ---------- does the source actually say it ---------- */
const fold = s => String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
/* the words worth looking for: names and numbers, not scaffolding */
const SKIP = new Set(["the","a","an","and","or","of","in","at","to","for","on","by","with","from",
  "which","who","what","when","where","was","were","is","are","did","does","his","their","its",
  "club","team","player","season","league","goals","goal","first","second","that","they","them",
  "he","she","it","after","before","under","against","won","win","scored","score","only","one",
  "two","three","four","five","six","seven","eight","nine","ten","still","had","has","have","been",
  "this","these","those","then","than","also","not","no","yes","all","any","own","out","up","down"]);
const words = s => fold(s).replace(/[^a-z0-9\s-]/g, " ").split(/\s+/)
  .filter(w => w.length > 2 && !SKIP.has(w));
/* NUMBERS ARE WRITTEN IN WORDS IN THIS BANK and in digits in every article,
   so "Eighty-one" never matched "81" and four perfectly good rows came back
   unconfirmed. Both directions are tried. */
const ONES = ["zero","one","two","three","four","five","six","seven","eight","nine","ten","eleven",
  "twelve","thirteen","fourteen","fifteen","sixteen","seventeen","eighteen","nineteen"];
const TENS = {twenty:20, thirty:30, forty:40, fifty:50, sixty:60, seventy:70, eighty:80, ninety:90};
function wordsToNumber(s) {
  const t = fold(s).replace(/[^a-z-]/g, " ").trim();
  const one = ONES.indexOf(t);
  if (one >= 0) return String(one);
  const m = t.match(/^(twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)(?:[-\s]+([a-z]+))?$/);
  if (m) {
    const base = TENS[m[1]];
    const add = m[2] ? ONES.indexOf(m[2]) : 0;
    if (add >= 0) return String(base + (add > 0 ? add : 0));
  }
  if (t === "hundred" || t === "a hundred" || t === "one hundred") return "100";
  return null;
}
/* a season written 2015-16 in a question is 2015-16 or 2015–16 in an article */
const seasons = s => (String(s).match(/\b(19|20)\d{2}\s*[-–]\s*\d{2}\b/g) || [])
  .map(x => x.replace(/\s*[-–]\s*/, "-"));

function corroborate(text, row) {
  const hay = fold(text).replace(/[–—]/g, "-");
  const miss = [];
  /* the answer, word by word. A multi-word answer counts as found when every
     word of it is in the article; a list answer ("A, B or C") counts when any
     one of its alternatives is fully present. */
  const alts = String(row.a).split(/\s*(?:,| or | and )\s*/).filter(Boolean);
  const has = w => {
    if (hay.indexOf(w) !== -1) return true;
    const n = wordsToNumber(w);
    return n !== null && new RegExp("(^|[^0-9])" + n + "([^0-9]|$)").test(hay);
  };
  const numeric = wordsToNumber(row.a);
  const answerFound =
    (numeric !== null && new RegExp("(^|[^0-9])" + numeric + "([^0-9]|$)").test(hay)) ||
    alts.some(alt => { const ws = words(alt); return ws.length ? ws.every(has) : false; }) ||
    words(row.a).every(has);
  if (!answerFound) miss.push("answer not in source");
  /* the season the question anchors to, if it names one */
  for (const s of seasons(row.q)) {
    if (hay.indexOf(s) === -1) miss.push("season " + s + " not in source");
  }
  /* the distinctive nouns of the question: a club or a person named in it
     should be somewhere in the article the row cites */
  /* This was set at half the words and it flagged good rows constantly: an
     article about a season does not contain "egyptian" or "winger" just because
     the question does. It is only here to catch a row whose source is about
     something else entirely, so the bar is where that actually shows. */
  const qw = words(row.q).filter(w => /^[a-z]/.test(w));
  const hits = qw.filter(has).length;
  if (qw.length >= 5 && hits / qw.length < 0.25) miss.push("question barely matches source");
  return miss;
}

/* ---------- the giveaway check ---------- */
function giveaway(row) {
  const q = fold(row.q), a = fold(row.a);
  const aw = words(row.a);
  if (!aw.length) return null;
  /* the whole answer sitting inside the question is not a question */
  if (aw.length && aw.every(w => q.indexOf(w) !== -1) && aw.join(" ").length > 6) return "the answer is in the question";
  return null;
}

/* ---------- the hedge check ----------
   MY OWN FAILURE MODE, WRITTEN DOWN SO IT IS CAUGHT RATHER THAN REMEMBERED.
   Writing the BALL tier from memory, I twice produced rows whose "answer"
   argued with the question instead of answering it: "Nobody. It was Tim Howard
   for Everton", "Carlos Tevez went the other way, City to United is wrong".
   Every one of them came from being unsure of the fact and hedging rather than
   dropping the question. A reader cannot judge an answer like that in a second,
   which is the one thing every row in this bank has to allow, so they are
   flagged wherever they come from. */
const HEDGE = [
  /^nobody\b/i, /^none\b/i, /^nothing\b/i, /^neither\b/i,
  /\b(is|was|were|did|does|do|had|has) not\b/i, /\bisn't\b/i, /\bdidn't\b/i,
  /\bis wrong\b/i, /\bnot the\b[^.]*\bbut\b/i, /\bwent the other way\b/i,
  /\bthe famous (one|answer)\b/i, /\bactually\b/i, /\bnot that far\b/i,
  /\bprobably\b/i, /\bmay have\b/i, /\bthought to be\b/i, /\bnot quite\b/i,
  /\bdrop this\b/i, /\bthe correct answer\b/i, /\bof the sort\b/i,
  /\bthen\b/i,      // "Conte then Allegri" is a sequence, not an answer
];
function hedged(row) {
  const a = String(row.a);
  for (const re of HEDGE) if (re.test(a)) return "the answer hedges instead of answering";
  /* an answer long enough to be a paragraph is an explanation, not an answer */
  if (a.split(/\s+/).length > 14) return "the answer is an explanation, not an answer";
  /* A YEAR THAT CANNOT BE RIGHT. "finished second in 1002" was a typo for 2002
     and nothing else caught it: the season check only looks for a 2002-03
     shape, and 1002 on its own is a perfectly findable string. Football in
     this bank runs from the 1850s, so anything earlier is a slip of the hand. */
  /* ODDS ARE NOT YEARS. Leicester being 5000-1 tripped this immediately, so a
     four figure number attached to a hyphen and another number is left alone:
     that is a price, or a scoreline, or a range. */
  const text = String(row.q + " " + a);
  const years = (text.match(/(?:^|[^\d-])(\d{4})(?![\d-])/g) || [])
    .map(m => m.replace(/[^\d]/g, ""));
  for (const y of years) if (+y < 1850 || +y > 2100) return "the year " + y + " cannot be right";
  return null;
}

(async () => {
  if (!fs.existsSync(SRCDIR)) { console.error("no folder at " + path.relative(REPO, SRCDIR)); process.exit(1); }
  const files = fs.readdirSync(SRCDIR).filter(f => /^raw-.*\.json$/.test(f)).sort();
  if (!files.length) { console.error("no raw-*.json in " + path.relative(REPO, SRCDIR)); process.exit(1); }

  let ok = 0, review = 0, total = 0;
  const why = {};
  for (const f of files) {
    const rows = JSON.parse(fs.readFileSync(path.join(SRCDIR, f), "utf8").replace(/^﻿/, ""));
    const out = [];
    for (const row of rows) {
      total++;
      const problems = [];
      const g = giveaway(row);
      if (g) problems.push(g);
      const h = hedged(row);
      if (h) problems.push(h);
      if (!row.src) problems.push("no source cited");
      else {
        const title = decodeURIComponent(String(row.src).replace(/^https?:\/\/en\.wikipedia\.org\/wiki\//, "")).replace(/_/g, " ");
        const text = await article(title);
        if (!text) problems.push("source would not load: " + title);
        else problems.push(...corroborate(text, row));
      }
      const verdict = problems.length ? "review" : "ok";
      if (verdict === "ok") ok++; else { review++; problems.forEach(p => { const k = p.split(":")[0]; why[k] = (why[k] || 0) + 1; }); }
      const copy = Object.assign({}, row, {verdict: verdict});
      if (problems.length) copy.note = problems.join("; ");
      out.push(copy);
      if (VERBOSE && problems.length) console.log("  review  " + row.q.slice(0, 78) + "\n          " + problems.join("; "));
    }
    if (WRITE) {
      const dest = path.join(SRCDIR, f.replace(/^raw-/, "checked-"));
      fs.writeFileSync(dest, JSON.stringify(out, null, 1));
      console.log("  wrote " + path.basename(dest) + "  (" + out.length + " rows)");
    }
    process.stdout.write(".");
  }
  console.log("\n" + id + ": " + total + " rows, " + ok + " corroborated, " + review + " for review");
  if (review) console.log("reasons: " + JSON.stringify(why));
  if (!WRITE) console.log("dry run, add --write to produce checked-*.json");
  console.log("\nRemember what this proves: that the source MENTIONS the answer, not");
  console.log("that the claim is true. Rows marked review are not wrong, they are");
  console.log("unconfirmed, and build-league.js ships only ok and fixed.");
})();
