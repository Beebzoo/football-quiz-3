#!/usr/bin/env node
/* WHAT EACH MAN ACTUALLY DID IN GERMANY.
 *
 * RUN IT AFTER THE ELEVENS. The pipeline is squads, then the real elevens,
 * then this, then the careers: build-elevens.js rewrites every position to
 * the one the man actually played, and the traits below read positions.
 *
 *     node _tools/build-tournament.js            dry run, read the table
 *     node _tools/build-tournament.js --write    stamp it onto the deck
 *     node _tools/build-tournament.js --who "Klose"
 *
 * The Dugout wants traits, and a trait has to come from somewhere. Typing one
 * out of memory is how a quiz ends up telling a room that somebody was a
 * finisher when he did not score all summer, so every trait in this app is
 * EARNED off the tournament itself: goals, cards, appearances and the armband,
 * read out of the nine match articles Wikipedia keeps for 2006.
 *
 * Nine fetches. Eight group pages and the knockout stage, about 390KB, and the
 * same API call build-man-leagues.js already uses, cached the same way.
 *
 * TWO TRAPS, both found by counting and both worth spelling out, because they
 * do not look like bugs, they look like results.
 *
 *   {{goal|17||48|pen.}} is minute-then-note PAIRS. Split it naively and
 *   "pen." counts as a goal, which on its own turned David Villa's three into
 *   five. Count numeric tokens only.
 *
 *   {{goal|4|o.g.}} is an own goal, and it is listed under the OPPOSING side's
 *   block, because that is where the goal counted. Credit it naively and you
 *   make finishers out of defenders: Gamarra, Sancho, Zaccardo and Petit, who
 *   are precisely 2006's four own goals.
 *
 * The eligibility it produces is deliberately NOT the trait. The harvest says
 * what a man COULD be; the budget in the app says how many are switched on. A
 * side with six eligible finishers still only gets three points to spend, so
 * Brazil having more good players does not become Brazil having more traits.
 */
const fs = require("fs");
const path = require("path");
const https = require("https");
const crypto = require("crypto");

const REPO = path.join(__dirname, "..");
/* WHICH TOURNAMENT. Wikipedia has used the same squad and match templates for
   every World Cup back to 1930, so the year is the only thing that changes.
   2006 is the default because it is the one whose data has been checked by
   hand, man by man, and it stays the default until another one has been. */
const T = require("./_tournament.js").argsOf(process.argv);
const YEAR = T.year;
const POOL = T.pool;
const OUT = path.join(REPO, "assets", POOL, "index.json");
const CACHE = path.join(__dirname, "_models");
const UA = "ball3-tournament/1.0 (personal quiz project)";
const WRITE = process.argv.includes("--write");
const WHO = (i => i > -1 ? process.argv[i + 1] : null)(process.argv.indexOf("--who"));

/* THE FINAL IS ALWAYS ITS OWN ARTICLE and the knockout page never carries it,
   so a harvest that stops at the knockout stage is missing the goals from the
   one match everybody remembers. EXTRAS are the other matches famous enough to
   have been given a page of their own. */
const EXTRAS = {
  "2006": ["Battle of Nuremberg (2006 FIFA World Cup)"],
};
/* EVERY PAGE THIS TOURNAMENT KEEPS, from _tournament.js: the groups (eight
   at a World Cup, twelve from 2026, four or six at a Euro), both spellings of
   the knockout page, and the final. A title that does not exist comes back
   empty and costs one fetch. */
const PAGES = T.pages.concat(EXTRAS[YEAR] || []);
const SQUADS = T.title + " squads";

/* what the published tournament totals were, so the harvest can be checked
   against something rather than against itself */
/* WHAT EACH TOURNAMENT ACTUALLY PRODUCED, so the harvest is checked against
   something outside itself rather than against its own arithmetic. A year
   with no row here simply prints its counts and claims nothing, which is
   better than comparing 2022 to 2006 and calling the difference a bug. */
/* KEYED BY POOL, not by year: there is a 2004 European Championship and there
   will be a 2030 World Cup, and a table keyed on the number alone would put
   one tournament’s totals against another. */
const PUBLISHED_BY_YEAR = {
  "wc2006": { goals: 147, yellows: 345, reds: 28 },
  /* 1998: 171, the record until 2014 equalled it. */
  "wc1998": { goals: 171 },
  /* the European Championships, goal totals only: the card counts are not
     typed from memory. */
  "euro2000": { goals: 85 },
  "euro2004": { goals: 77 },
  "euro2008": { goals: 77 },
  "euro2012": { goals: 76 },
  "euro2016": { goals: 108 },
  "euro2020": { goals: 142 },
  "wc2002": { goals: 161 },
  /* 2010: 145, and the harvest lands on it exactly, which is the strongest
     evidence there is that the goal reader is right. */
  "wc2010": { goals: 145 },
  /* 2014: the goal total equalled the 1998 record and is not in dispute. The
     card counts are deliberately absent rather than typed from memory. */
  "wc2014": { goals: 171 },
  "wc2018": { goals: 169, yellows: 219, reds: 4 },
  "wc2022": { goals: 172, yellows: 227, reds: 4 },
};
const PUBLISHED = PUBLISHED_BY_YEAR[POOL] || null;

const sleep = ms => new Promise(r => setTimeout(r, ms));
const norm = x => String(x || "").normalize("NFD").replace(/[̀-ͯ]/g, "")
  .toLowerCase().replace(/[^a-z ]/g, " ").replace(/\s+/g, " ").trim();

if (!fs.existsSync(CACHE)) fs.mkdirSync(CACHE, { recursive: true });
const cacheRead = k => { try { return JSON.parse(fs.readFileSync(path.join(CACHE, k), "utf8")); } catch (e) { return null; } };
const cacheWrite = (k, v) => { try { fs.writeFileSync(path.join(CACHE, k), JSON.stringify(v)); } catch (e) {} };

const getOnce = url => new Promise((res, rej) => {
  https.get(url, { headers: { "User-Agent": UA } }, r => {
    if (r.statusCode !== 200) {
      const e = new Error("HTTP " + r.statusCode);
      e.status = r.statusCode;
      r.resume();
      return rej(e);
    }
    let d = ""; r.setEncoding("utf8");
    r.on("data", c => d += c); r.on("end", () => res(d));
  }).on("error", rej);
});
/* A 429 COSTS A MINUTE, NOT AN HOUR. Wikipedia rate-limits politely and a
   harvest that reads five hundred pages will meet it; until this existed, the
   first one threw and took the rest of the run with it. Two seconds, four,
   eight, sixteen, then give up. Only on a throttle or a server error: a 404
   is an article that is not there, and asking again will not conjure it. */
async function get(url) {
  let wait = 2000;
  for (let n = 0; ; n++) {
    try { return await getOnce(url); }
    catch (e) {
      const retry = e.status === 429 || (e.status >= 500 && e.status < 600);
      if (!retry || n >= 4) throw e;
      console.log("  " + e.message + ", waiting " + (wait / 1000) + "s");
      await new Promise(r => setTimeout(r, wait));
      wait *= 2;
    }
  }
}
async function wikitext(title) {
  const key = "wct-" + crypto.createHash("sha1").update(title).digest("hex").slice(0, 16) + ".json";
  const hit = cacheRead(key);
  if (hit) return hit.t || "";
  const j = JSON.parse(await get("https://en.wikipedia.org/w/api.php?action=parse&format=json" +
    "&prop=wikitext&redirects=1&page=" + encodeURIComponent(title)));
  const t = (j && j.parse && j.parse.wikitext && j.parse.wikitext["*"]) || "";
  cacheWrite(key, { t: t });
  await sleep(400);
  return t;
}

/* ---------- the deck we are stamping ---------- */
const sides = JSON.parse(fs.readFileSync(OUT, "utf8"));
const men = [];
for (const [side, t] of Object.entries(sides))
  for (const key of ["xi", "bench"])
    for (const p of (t[key] || [])) men.push({ side: side, key: key, p: p });

/* NAME TO MAN, and it has to be precise. Two men in the deck can share a
   surname, so the full name is tried first and a surname only accepted when
   exactly one man in the whole tournament answers to it. */
const byFull = {}, bySur = {};
for (const m of men) {
  byFull[norm(m.p.full)] = byFull[norm(m.p.full)] || [];
  byFull[norm(m.p.full)].push(m);
  const sur = norm(m.p.n);
  bySur[sur] = bySur[sur] || [];
  bySur[sur].push(m);
}
/* article title -> the name the deck actually holds. Checked one at a time
   against assets/wc2006/index.json, not guessed. */
const ALIAS = {
  "Anatoliy Tymoschuk": "Anatoliy Tymoshchuk",
  "Andriy Nesmachnyi": "Andriy Nesmachniy",
  "Abdulaziz Khathran": "Abdulaziz Al-Khathran",
  "Jorge Martín Núñez": "Jorge Núñez",
  "Julio Ricardo Cruz": "Julio Cruz",
  "Luís Manuel Ferreira Delgado": "Delgado",
  /* 2018. The squad page gives him his family name in full and the match
     reports drop the article, which is the standard Arabic transliteration
     disagreement rather than two different men. */
  "Abdallah Said": "Abdallah El Said",
  /* 2018. Wikipedia gives the middle name or a disambiguator in the match
     reports and the plain name in the squad, and two of these are two
     different men who share a name, which is exactly why the disambiguator is
     there. Each one checked against assets/wc2018/index.json by hand. */
  /* TWO MEN, ONE NAME. Uruguay's Carlos Sánchez and Colombia's Carlos
     Sánchez, and the deck holds both under exactly that name, so the alias
     has to name the side as well or the wrong man gets the card. */
  "Carlos Andrés Sánchez": {n: "Carlos Sánchez", side: "Uruguay"},
  "Carlos Sánchez (Uruguayan footballer)": {n: "Carlos Sánchez", side: "Uruguay"},
  "Carlos Sánchez (Colombian footballer)": {n: "Carlos Sánchez", side: "Colombia"},
  "Alberto Junior Rodríguez": "Alberto Rodríguez",
  "Gabriel Enrique Gómez": "Gabriel Gómez",
  /* 2014. The squad pages drop the apostrophe and the first name; the match
     reports keep both. Each checked against assets/wc2014/index.json. */
  "Nicolas N'Koulou": "Nicolas Nkoulou",
  "Óscar Boniek García": "Boniek García",
  "Eduardo da Silva": "Eduardo",
  "Carlos Armando Gruezo Arboleda": "Carlos Gruezo",
  /* TWO ROJAS IN ONE TOURNAMENT, Chile's and Ecuador's, and the deck holds
     both under the surname. Wikipedia tells them apart by birth year, which
     is information the side does better. */
  "José Rojas (footballer, born 1983)": {n: "José Manuel Rojas", side: "Chile"},
  /* 2010. North Korea took two Pak Nam-chols and the squad page numbers them
     I and II while Wikipedia dates them; the match reports give the born-1985
     man shirt 4, and shirt 4 in the deck is the first of them. */
  "Pak Nam-chol (footballer, born 1985)": "Pak Nam-chol I",
  "Ki Sung-yong": "Ki Sung-yueng",
  "Ignacio María González": "Ignacio González",
  "Nikos Spiropoulos": "Nikos Spyropoulos",
  "Walter Julián Martínez": "Walter Martínez",
  /* 2002 */
  "Jenílson Ângelo de Souza": "Júnior",
  "Luiz Bombonato Goulart": "Luizão",
  "Pablo Gabriel García": "Pablo García",
  "MacDonald Mukasi": "MacDonald Mukansi",
  "Boukar Alioum": "Alioum Boukar",
  /* 1998. Cameroon’s squad page spells him without the apostrophe. */
  "Joseph N'Do": "Joseph Ndo",
  "Mohammed Al-Deayea": "Mohamed Al-Deayea",
  /* IN THE LINE-UPS AND NOT IN THE SQUAD LIST, which is two articles
     disagreeing rather than something to paper over. */
  "Khamis Al-Dosari": null,

  /* 1998 */
  "Ali El Khattabi": "Ali Elkhattabi",
  "Fahad Al-Mehallel": "Fahd Al-Mehallel",
  "César Augusto Ramírez": "César Ramírez",
  /* SPAIN’S RIGHT-BACK, not Paraguay’s midfielder. Both squads carry an
     Aguilera and the match report links his full legal name, which is the
     kind of near-miss that credits a card to the wrong man in the wrong
     country. Checked against the Spain v Bulgaria line-up. */
  "Juan Carlos Aguilera": {n: "Carlos Aguilera", side: "Spain"},
  /* he played under one name and Wikipedia files him under the other */
  "Preki": "Predrag Radosavljević",

  /* 2022 and 2026 */
  /* in Saudi Arabia’s line-ups and not in their squad list */
  "Hassan Al-Tombakti": null,
  /* Brazil took two Danilos and two Édersons, and Wikipedia dates them apart. */
  "Danilo (footballer, born July 1991)": {n: "Danilo Luiz", side: "Brazil"},
  "Danilo (footballer, born 2001)": {n: "Danilo Santos", side: "Brazil"},
  "Éderson (footballer, born 1999)": {n: "Éderson Silva", side: "Brazil"},

  /* the European Championships */
  "Georgios Tzavelas": "Georgios Tzavellas",
  "Frank Leboeuf": "Frank Lebœuf",
  "Lasse Schøne": "Lasse Schöne",
  "Artem Besyedin": "Artem Besedin",
  "Maksym Talovyerov": "Maksym Talovierov",
  /* TWO EDERS AT EURO 2016, and it was Portugal’s who scored the winner in
     the final, so the side has to be named. */
  "Éder (footballer, born 1986)": {n: "Éder", side: "Italy"},
  "Eder (footballer, born 1987)": {n: "Eder", side: "Portugal"},
  /* in Sweden’s Euro 2000 line-up and not in their squad list */
  "Tomas Antonelius": null,
  "Selim Ben Achour": "Selim Benachour",
  "Mohammed Al-Jahani": null,

  /* on the pitch in Germany, not among the twenty-three their country's squad
     page lists. Two articles disagreeing, not something to paper over. */
  "Hussein Sulaimani": null,
  "Haminu Dramani": null,
};
let missed = [];
function find(name, side, no) {
  /* THE QUALIFIER COMES OFF THE RAW TITLE. norm() turns brackets into spaces,
     so by the time it has run there is nothing left to cut and "Ronaldo
     (Brazilian footballer)" is a four-word name nobody has. */
  /* THE TABLE SEES THE TITLE FIRST, brackets and all. Stripping them before
     the lookup meant a disambiguated title could never be aliased, which is
     the one case where the bracket is the whole point. */
  let raw = String(name).trim();
  let want = null;
  for (const key of [raw, raw.replace(/\s*\([^)]*\)\s*$/, "").trim()]) {
    if (!Object.prototype.hasOwnProperty.call(ALIAS, key)) continue;
    if (ALIAS[key] === null) return null;      // known, and known not to be in the deck
    const v = ALIAS[key];
    if (typeof v === "string") raw = v;
    else { raw = v.n; want = v.side || null; }
    break;
  }
  raw = raw.replace(/\s*\([^)]*\)\s*$/, "").trim();
  /* AN ALIAS FOR ONE TOURNAMENT MUST NOT BREAK ANOTHER. The table is flat
     across every harvest, so if the aliased name matches nobody in this deck,
     the name as written is tried instead. An alias can only ever help. */
  const plain = String(name).trim().replace(/\s*\([^)]*\)\s*$/, "").trim();
  if (norm(raw) !== norm(plain) && !byFull[norm(raw)] && !bySur[norm(raw)]) { raw = plain; want = null; }
  /* a side named in the alias is as good as one named by the caller, and the
     callers below read a concatenated page and have none */
  if (want) side = want;
  const n = norm(raw);
  /* THE SHIRT SETTLES IT when two men in the tournament share a name and this
     file, reading every page as one string, has no side to narrow with. */
  const byShirt = list => (no != null && list.length > 1)
    ? list.filter(m => String(m.p.no) === String(no)) : list;
  let hit = byShirt(byFull[n] || []);
  if (hit.length > 1 && side) hit = hit.filter(m => m.side === side);
  if (hit.length === 1) return hit[0];
  const bare = n;
  hit = byFull[bare] || [];
  if (hit.length > 1 && side) hit = hit.filter(m => m.side === side);
  if (hit.length === 1) return hit[0];
  let s = byShirt(bySur[bare] || bySur[n] || []);
  if (s.length > 1 && side) s = s.filter(m => m.side === side);
  if (s.length === 1) return s[0];
  /* the final word, which is how a shown name usually differs */
  const last = bare.split(" ").slice(-1)[0];
  let l = byShirt(bySur[last] || []);
  if (l.length > 1 && side) l = l.filter(m => m.side === side);
  if (l.length === 1) return l[0];
  /* AN ARTICLE TITLE IS OFTEN LONGER THAN THE SHIRT. "Luis Marín Murillo"
     against a deck that holds "Luis Marín", or the other way round. Accepted
     only when exactly one man in the tournament fits, because a loose match
     that picks the wrong man is worse than no match at all. */
  let pre = men.filter(m => {
    const f = norm(m.p.full);
    return f && bare && (f.indexOf(bare + " ") === 0 || bare.indexOf(f + " ") === 0);
  });
  if (pre.length > 1 && side) pre = pre.filter(m => m.side === side);
  if (pre.length === 1) return pre[0];
  missed.push(name + (side ? " [" + side + "]" : ""));
  return null;
}

/* ---------- counters, hung on the deck man himself ---------- */
for (const m of men) { m.g = 0; m.og = 0; m.y = 0; m.r = 0; m.app = 0; m.cap = false; }

/* HOW MANY GOALS ARE IN ONE {{goal|...}}. Minute, note, minute, note, so only
   the numeric tokens count, and an o.g. note disowns the one before it. */
function goalsIn(tpl) {
  /* the wrapper first, or the last token is "o.g.}}" and never matches */
  const parts = tpl.replace(/^\{\{/, "").replace(/\}\}$/, "").split("|").slice(1);
  let n = 0, own = 0;
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i].trim();
    if (!/^\d+/.test(p)) continue;
    const note = (parts[i + 1] || "").trim().toLowerCase();
    if (/^o\.?\s*g\.?$/.test(note) || note === "og") own++;
    else n++;
  }
  return { n: n, own: own };
}


/* ---------- the matches that got their own article ----------
   The round's page carries a stub and a {{main|...}} pointing at the real
   report, so the extras are read off the pages already fetched rather than
   typed into a table that only ever covers the tournament somebody last
   looked at. A title of the shape "... (<year> FIFA World Cup)" is a match
   report and nothing else is. */
function extraPages(text, had){
  const out = [];
  const rx = new RegExp("\\{\\{\\s*main\\s*\\|\\s*([^}|]*\\(" + YEAR + " FIFA World Cup\\))\\s*\\}\\}", "gi");
  let m;
  while ((m = rx.exec(text))) {
    const t = m[1].trim();
    if (out.indexOf(t) < 0 && had.indexOf(t) < 0) out.push(t);
  }
  return out;
}

/* ---------- a scorer written without the template ----------
   Accepted ONLY when what follows the name is nothing but minutes, because a
   group page is full of bulleted links with years in them and one of those
   counted as a goal is a striker with a two-thousand season. */
const MINUTES = /^\s*(?:\d{1,3}(?:\s*\+\s*\d{1,2})?\s*[''\u2032]?\s*(?:\(?\s*(?:pen\.?|p\.?|o\.?\s*g\.?|og)\s*\)?)?\s*[,;]?\s*)+$/i;
function goalsPlain(tail) {
  const t = String(tail).replace(/<ref[\s\S]*?(?:\/>|<\/ref>)/g, "").replace(/\{\{[^}]*\}\}/g, "").trim();
  if (!t || !MINUTES.test(t)) return { n: 0, own: 0 };
  let n = 0, own = 0;
  for (const part of t.split(/[,;]/)) {
    if (!/\d/.test(part)) continue;
    if (/o\.?\s*g\.?|\bog\b/i.test(part)) own++; else n++;
  }
  return { n: n, own: own };
}

(async () => {
  console.log("reading " + PAGES.length + " match pages for " + YEAR + "...");
  let text = "";
  /* THE SAME ARTICLE UNDER TWO NAMES. The knockout page is "stage" at a World
     Cup and at the older Euros and "phase" at the newer ones, so both are
     offered and one is expected to come back empty. At several Euros one is a
     REDIRECT to the other and neither does, and the harvest read the knockout
     twice: Euro 2016 came out with 146 goals against a tournament that had
     108, which is its knockout stage counted again. */
  const readAlready = new Set();
  for (const p of PAGES) {
    const w = await wikitext(p);
    if (!w) continue;
    const sig = w.length + "|" + w.slice(0, 300);
    if (readAlready.has(sig)) continue;
    readAlready.add(sig);
    text += "\n" + w;
  }
  const extra = extraPages(text, PAGES);
  if (extra.length) {
    console.log("  following " + extra.length + " match" + (extra.length === 1 ? "" : "es") +
      " with a page of its own: " + extra.join(", "));
    for (const p of extra) text += "\n" + await wikitext(p);
  }
  console.log("  " + Math.round(text.length / 1024) + "KB of wikitext");

  /* ---------- goals ---------- */
  /* a scorer line looks like:  *[[Lukas Podolski]] {{goal|4|71}}  */
  let goalEvents = 0, ownEvents = 0;
  for (const m of text.matchAll(/^\s*\*+\s*\[\[([^\]|]+)(?:\|[^\]]*)?\]\]([^\n]*)$/gm)) {
    const tail = m[2] || "";
    const { n, own } = /\{\{\s*goal\s*\|/.test(tail) ? goalsIn(tail) : goalsPlain(tail);
    if (!n && !own) continue;
    goalEvents += n; ownEvents += own;
    const man = find(m[1]);
    if (man) { man.g += n; man.og += own; }
  }
  console.log("goals: " + goalEvents + " credited, " + ownEvents + " own goals" +
    (PUBLISHED && PUBLISHED.goals ? "   (the tournament had " + PUBLISHED.goals + " in all)" : ""));

  /* ---------- cards and appearances, off the line-up tables ---------- */
  /* a line-up row:  |CM ||'''6''' ||[[Danny Fonseca]] || || {{yel|30}}  */
  let yel = 0, red = 0, rows = 0;
  /* THE POSITION IS SOMETIMES A TOOLTIP: see the note in build-elevens.js.
     Without this the 2014 final's cards and appearances are not counted. */
  /* A REAL SHIRT NUMBER, which keeps the technical staff out: 2026 books
     assistant coaches under "Other disciplinary actions" with an em dash where
     the number goes, and a booked assistant is not an appearance. */
  for (const m of text.matchAll(/^\|\s*(?:\{\{\s*abbr\s*\|\s*[A-Z]{2,3}\s*\|[^}\n]*\}\}|[A-Z]{2,3})\s*\|\|\s*'''(\d+)'''\s*\|\|[^\n]*?\[\[([^\]|]+)(?:\|[^\]]*)?\]\]([^\n]*)$/gm)) {
    const man = find(m[2], null, m[1]);
    rows++;
    if (!man) continue;
    man.app += 1;
    const rest = m[3] || "";
    const ys = (rest.match(/\{\{\s*yel\b/gi) || []).length;
    const rs = (rest.match(/\{\{\s*(sent ?off|red|yel-red|y-r|dismissed)\b/gi) || []).length;
    man.y += ys; man.r += rs; yel += ys; red += rs;
  }
  console.log("line-up rows: " + rows + ", yellows " + yel + ", reds " + red +
    (PUBLISHED && PUBLISHED.yellows != null
      ? "   (the tournament had " + PUBLISHED.yellows + " and " + PUBLISHED.reds + ")" : ""));

  /* ---------- the armband, off the squads page ---------- */
  const sq = await wikitext(SQUADS);
  let caps = 0;
  /* THE ARMBAND IS SPELLED FOUR WAYS AND THIS KNEW TWO. 2006 puts the link in
     brackets after the name and 2022 gives it a field of its own, and every one
     of these articles carries exactly one per side, so a side that comes back
     without a captain is a pattern that cannot read that article rather than a
     side that walked out without one. Three Euros were coming back short,
     euro2004 fifteen of sixteen, euro2016 thirteen of twenty-four, euro2024
     eighteen of twenty-four, and reading the rows that went missing turned up
     two more spellings and one accident.

       name={{sortname|Hugo|Lloris}} instead of name=[[Hugo Lloris]]. Every Euro
       from 2004 on mixes the two freely inside a single group, and a pattern
       that insists on the wikilink throws away whoever happens to be written
       the other way round. That alone cost euro2016 eleven of its sides.

       other=[[List of Scotland national football team captains|captain]]. The
       link still says captain, it just does not point at the same article, and
       the old pattern tested where the link went rather than what it said.

       And the old pattern only ever reached "other=" when no closing brace
       stood between it and the name, which was never a rule about captains, it
       was an accident of writing [^\n}] to keep the match on one line. Half the
       squad rows carry an {{age}} template in between, and that brace shut them
       all out.

     So the two halves are independent now: the name is a wikilink or a
     sortname, the armband is any wikilink whose VISIBLE text is c or captain,
     and anything at all may sit between them so long as it stays on the one
     line the template occupies.

     READING WHAT THE LINK SAYS RATHER THAN WHERE IT GOES IS LOAD-BEARING, and
     it is the half that would otherwise have quietly broken a pool that already
     worked. 2018 Argentina writes Mascherano as other=[[Captain (association
     football)|vice-captain]], the same target as Messi, and the de-dupe below is
     per MAN rather than per side, so a pattern matching on the target hands
     Argentina two captains. It only looks safe in the old code because the brace
     rule was accidentally shutting that row out. Belgium the same year is why
     the C is taken in either case: theirs reads |Captain]] with a capital.

     Measured across all fifteen tournament pools this is one captain on every
     one of the 408 sides, and it takes nobody’s armband away. */
  const capRx = /name\s*=\s*(?:\[\[([^\]|\n]+?)(?:\|[^\]\n]*)?\]\]|\{\{\s*sortname\s*\|\s*([^|}\n]+?)\s*\|\s*([^|}\n]+?)\s*[|}])[^\n]*?\[\[[^\]\n]*?\|\s*[Cc](?:aptain)?\s*\]\]/g;
  const seenCap = new Set();
  for (const m of sq.matchAll(capRx)) {
    /* a sortname hands over the given name and the family name as two fields,
       and joining them with a space is exactly what the template renders */
    const man = find(m[1] || (m[2] + " " + m[3]));
    if (man && !seenCap.has(man)) { man.cap = true; seenCap.add(man); caps++; }
  }
  console.log("captains: " + caps + "/" + Object.keys(sides).length);

  if (missed.length) {
    const uniq = [...new Set(missed)];
    console.log("\nnames the deck does not know (" + uniq.length + "): " + uniq.slice(0, 14).join(", "));
  } else {
    console.log("\nevery name in the match reports found its man.");
  }
  /* AN ALIAS THAT MATCHES NOTHING IS FOLKLORE, the same rule the league
     harvest learned. If Wikipedia settles on one spelling, the entry should
     go rather than sit here teaching the next reader something untrue. */
  const stale = Object.keys(ALIAS).filter(k => text.indexOf(k) < 0 && sq.indexOf(k) < 0);
  if (stale.length) console.log("STALE ALIASES, no longer in the source: " + stale.join(", "));

  /* ================================================================
     TRAITS: what each man is ELIGIBLE for
     ================================================================
     Eligibility is read off the whole twenty-three rather than the eleven,
     because seven of the shipped XIs contain nobody who scored and a manager
     with budget he cannot spend has been handed a broken screen. Only one
     squad in the tournament, Trinidad and Tobago, has no scorer at all across
     all twenty-three, and that is why Enforcer exists: every single side has
     somebody who was booked. */
  /* EVERY SPELLING OF A FORWARD. A squad list says FW and a match report says
     CF, ST, LW, RW, SS, LF or RF, and after the real elevens landed the second
     kind is what most of these men carry. */
  const UP_TOP = ["FW", "CF", "ST", "SS", "LW", "RW", "LF", "RF"];
  const isFwd = m => UP_TOP.indexOf(m.p.pos) > -1;
  const TRAITS = {
    finisher:  {cost: 2, eligible: m => m.g >= 2,
                says: "His shot comes off a tier cheaper."},
    poacher:   {cost: 2, eligible: m => isFwd(m) && m.g >= 1,
                says: "Route one to him is Extreme, not BALL."},
    captain:   {cost: 2, eligible: m => m.cap,
                says: "Every ball he plays is a tier cheaper."},
    enforcer:  {cost: 1, eligible: m => m.y >= 2 || m.r >= 1,
                says: "His tackle is a tier cheaper, until he is booked."},
    keeper:    {cost: 1, eligible: m => m.p.pos === "GK" && m.app >= 1,   // GK is GK everywhere
                says: "His save is a tier cheaper."},
  };
  for (const m of men) {
    m.tr = Object.keys(TRAITS).filter(k => TRAITS[k].eligible(m));
  }

  console.log("\nELIGIBILITY");
  for (const k of Object.keys(TRAITS))
    console.log("  " + k.padEnd(10) + men.filter(m => m.tr.indexOf(k) > -1).length + " men");

  /* CAN EVERY SIDE SPEND ITS BUDGET? The question the whole design turns on.
     A side that cannot field a single trait has a screen with nothing on it. */
  const bad = [];
  for (const side of Object.keys(sides)) {
    const ours = men.filter(m => m.side === side);
    const any = ours.filter(m => m.tr.length);
    const cheapest = Math.min(...any.map(m => Math.min(...m.tr.map(k => TRAITS[k].cost))), 99);
    if (!any.length || cheapest > 3) bad.push(side + " (" + any.length + " eligible)");
  }
  console.log("\n  sides with nothing to spend a budget on: " + (bad.length ? bad.join(", ") : "none"));
  const thin = Object.keys(sides).map(side => ({
    side: side, n: men.filter(m => m.side === side && m.tr.length).length,
  })).sort((a, b) => a.n - b.n).slice(0, 5);
  console.log("  thinnest squads: " + thin.map(t => t.side + " " + t.n).join(", "));

  if (WHO) {
    console.log("");
    for (const m of men.filter(x => norm(x.p.full).indexOf(norm(WHO)) > -1 || norm(x.p.n) === norm(WHO)))
      console.log("  " + m.p.full.padEnd(26) + m.side.padEnd(16) +
        "goals " + m.g + (m.og ? " (+" + m.og + " o.g.)" : "") +
        "  yellow " + m.y + "  red " + m.r + "  apps " + m.app + (m.cap ? "  (c)" : "") +
        "   -> " + (m.tr.join(", ") || "nothing"));
  }

  console.log("\nthe top of each list, to read once and believe:");
  const top = (label, f) => console.log("  " + label.padEnd(10) +
    men.slice().sort((a, b) => f(b) - f(a)).slice(0, 6).map(m => m.p.n + " " + f(m)).join(", "));
  top("goals", m => m.g);
  top("yellows", m => m.y);
  top("apps", m => m.app);

  if (!WRITE) { console.log("\ndry run, add --write to stamp it onto the deck"); return; }

  for (const m of men) {
    const p = m.p;
    if (m.g) p.g = m.g; else delete p.g;
    if (m.y) p.y = m.y; else delete p.y;
    if (m.r) p.r = m.r; else delete p.r;
    if (m.app) p.app = m.app; else delete p.app;
    if (m.cap) p.cap = 1; else delete p.cap;
    if (m.tr.length) p.tr = m.tr; else delete p.tr;
  }
  fs.writeFileSync(OUT, JSON.stringify(sides));
  console.log("\nwrote " + path.relative(REPO, OUT) + "  (" +
    (fs.statSync(OUT).size / 1024).toFixed(1) + " KB)");
})().catch(e => { console.error(e); process.exit(1); });
