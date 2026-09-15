#!/usr/bin/env node
/* THE ELEVEN WHO ACTUALLY STARTED.
 *
 *     node _tools/build-elevens.js              dry run, read the elevens
 *     node _tools/build-elevens.js --write      stamp them onto the deck
 *     node _tools/build-elevens.js --who Italy
 *
 * There is no starting eleven in a squad list, so build-squads.js picked one
 * by shirt number within position and said so in its own comment. That is a
 * reasonable eleven and it is not anybody's eleven. It puts Robben on the
 * Dutch bench and Landzaat in the side, and it has Zaccardo at right-back for
 * the Italy that won the thing. Anyone who watched the tournament sees it in
 * ten seconds, which makes it exactly the sort of quietly-wrong data this repo
 * exists to avoid.
 *
 * THE RULE: the eleven who started that team's LAST match at the tournament.
 * The final for the two who got there, the exit for everyone else. It is the
 * eleven people remember, it is one table per match on Wikipedia in the same
 * template every tournament has used for decades, and it comes with the real
 * positions and a real shape.
 *
 * POSITIONS COME FROM THE LINE-UP, NOT THE SQUAD LIST. A man listed as a
 * midfielder who started at right-back started at right-back. That is the
 * whole point of reading the match report rather than the squad.
 *
 * AND THEN THE HARD PART. The shapes index the eleven in a fixed order: slot 0
 * is the keeper, 1 and 2 the centre-backs, 3 and 4 the wide defenders, 5 the
 * holding midfielder, 6 and 7 the two in front of him, 8 to 10 the front line.
 * A real line-up is not in that order and sometimes does not fit it at all: a
 * back three has no wide defenders and a 4-4-2 has no ten. So the mapping is
 * done here, once, by preference, and every team where it had to make a
 * judgement is PRINTED rather than silently accepted. A wrong mapping is a
 * keeper on the wing, which is the bug the position sort was written to stop.
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
const UA = "ball3-xi/1.0 (personal quiz project)";
const WRITE = process.argv.includes("--write");
const WHO = (i => i > -1 ? process.argv[i + 1] : null)(process.argv.indexOf("--who"));

/* THE FINAL ALWAYS HAS ITS OWN ARTICLE and the knockout page never carries it.
   Without it Italy's last match in 2006 is the semi-final against Germany,
   which is the one side in that tournament where being a game out is most
   obvious: no Materazzi sending-off, no Grosso penalty, the wrong eleven for
   the team that won it.

   EXTRAS are the matches famous enough to have been given their own page too,
   which likewise leaves them off the knockout article. One per tournament at
   most, and a missing one shows up as a side whose last match is too early. */
const EXTRAS = {
  "2006": ["Battle of Nuremberg (2006 FIFA World Cup)"],
};
/* EVERY PAGE THIS TOURNAMENT KEEPS, from _tournament.js: the groups (eight
   at a World Cup, twelve from 2026, four or six at a Euro), both spellings of
   the knockout page, and the final. A title that does not exist comes back
   empty and costs one fetch. */
const PAGES = T.pages.concat(EXTRAS[YEAR] || []);

const sleep = ms => new Promise(r => setTimeout(r, ms));
const norm = x => String(x || "").normalize("NFD").replace(/[̀-ͯ]/g, "")
  .toLowerCase().replace(/[^a-z ]/g, " ").replace(/\s+/g, " ").trim();
/* A TEAM NAME ENDS WHERE ITS FOOTNOTE BEGINS. Group A hangs two citations off
   every kit title and the final wraps its titles in nowrap, which between them
   cost four teams their line-up and moved Italy's last match to the semi. Cut
   the footnote first, unwrap second: a nowrap can contain a ref, not the
   reverse. */
const tidy = x => String(x || "")
  .split(/<ref/)[0]
  /* AND ANY OTHER TAG. 2022 wraps every kit title in a nowrap span, which is
     invisible on the page and is six unknown teams to a parser. */
  .replace(/<[^>]*>/g, "")
  .replace(/\{\{\s*nowrap\s*\|/gi, "")
  .replace(/\[\[[^\]|]*\|([^\]]*)\]\]/g, "$1")
  .replace(/\[\[|\]\]|\}\}|'''/g, "")
  .replace(/\s+/g, " ")
  .trim();

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

/* the deck, and the men in it, so a line-up name can be tied to a squad man */
const sides = JSON.parse(fs.readFileSync(OUT, "utf8"));
/* THE SAME ALIASES THE TOURNAMENT HARVEST NEEDS, for the same reason: the
   squad page and the match reports transliterate differently. */
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
  "Carlos Andrés Sánchez": "Carlos Sánchez",
  "Carlos Sánchez (Uruguayan footballer)": "Carlos Sánchez",
  "Carlos Sánchez (Colombian footballer)": "Carlos Sánchez",
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

  /* 2002. The deck spells him as one word, the reports as three. */
  "Selim Ben Achour": "Benachour",
  /* IN THE LINE-UP AND NOT IN THE SQUAD, which is two Wikipedia articles
     disagreeing rather than something to paper over. Named here so the
     harvest walks back a match instead of reporting him every run. */
  "Mohammed Al-Jahani": null,
};
/* COUNTRY NAMES DIFFER between the kit titles and the deck keys. Checked one
   at a time against the deck rather than guessed. */
const SIDE_ALIAS = {
  "Korea Republic": "South Korea", "IR Iran": "Iran", "Côte d'Ivoire": "Ivory Coast",
  "Serbia & Montenegro": "Serbia and Montenegro", "USA": "United States",
  "Trinidad & Tobago": "Trinidad and Tobago", "Czechia": "Czech Republic",
  "China": "China PR", "Ireland": "Republic of Ireland",
  "Yugoslavia": "FR Yugoslavia",
};

function manIn(side, name, no) {
  const t = sides[side];
  if (!t) return null;
  /* THE TABLE SEES THE TITLE FIRST, brackets and all. Stripping them before
     the lookup means a disambiguated title can never be aliased, which is the
     one case where the bracket is the whole point: North Korea took two Pak
     Nam-chols in 2010 and Wikipedia dates them apart.
     AN ALIAS MAY ALSO NAME A SIDE, for the two Rojas of 2014. manIn already
     knows which side it is looking at, so here the name is all that is taken. */
  let raw = String(name).trim();
  for (const key of [raw, raw.replace(/\s*\([^)]*\)\s*$/, "").trim()]) {
    if (!Object.prototype.hasOwnProperty.call(ALIAS, key)) continue;
    if (ALIAS[key] === null) return null;
    raw = typeof ALIAS[key] === "string" ? ALIAS[key] : ALIAS[key].n;
    break;
  }
  raw = raw.replace(/\s*\([^)]*\)\s*$/, "").trim();
  /* AN ALIAS FOR ONE TOURNAMENT MUST NOT BREAK ANOTHER. The table is flat
     across every harvest, so a correction written for South Africa 2010 is
     applied to Euro 2008 as well, where the squad page spells him the other
     way round. If the aliased name finds nobody, the name as written is tried,
     which means an alias can only ever help. */
  const all = [...(t.xi || []), ...(t.bench || [])];
  const plain = String(name).trim().replace(/\s*\([^)]*\)\s*$/, "").trim();
  if (norm(raw) !== norm(plain) && !all.some(m => norm(m.full) === norm(raw) || norm(m.n) === norm(raw)))
    raw = plain;
  const n = norm(raw);
  /* THE SHIRT DECIDES when the name is anywhere near. One man in a squad wears
     a number, so a spelling that is ambiguous is not ambiguous at all. */
  const shirt = no != null ? all.filter(m => String(m.no) === String(no)) : [];
  const near = m => {
    const f = norm(m.full), sh = norm(m.n);
    return f === n || sh === n || f.indexOf(n + " ") === 0 || n.indexOf(f + " ") === 0 ||
           n.indexOf(" " + sh) > -1 || f.indexOf(" " + n) > -1;
  };
  if (shirt.length === 1 && near(shirt[0])) return shirt[0];
  let hit = all.filter(m => norm(m.full) === n);
  if (hit.length === 1) return hit[0];
  hit = all.filter(m => norm(m.n) === n);
  if (hit.length === 1) return hit[0];
  /* THE SURNAME RULE, AND ITS VETO. Matching on the last word alone is what
     put Ricardo Carvalho in goal for Portugal in 2010, because their keeper's
     article is Eduardo Carvalho. If the row named a shirt and the man it found
     is not wearing it, that is not him. */
  const last = n.split(" ").slice(-1)[0];
  hit = all.filter(m => norm(m.n) === last);
  if (hit.length === 1 && (no == null || String(hit[0].no) === String(no))) return hit[0];
  hit = all.filter(m => norm(m.full).indexOf(n + " ") === 0 || n.indexOf(norm(m.full) + " ") === 0);
  if (hit.length === 1 && (no == null || String(hit[0].no) === String(no))) return hit[0];
  return null;
}

/* ---------- the app's eleven slots, and what each one wants ----------
   In order of preference, most specific first. The last resort on every slot
   is "anybody left", which is what makes a back three or a 4-4-2 fit at all,
   and every time it is reached the team is flagged. */
const SLOTS = [
  { n: "GK",  want: ["GK"] },
  { n: "CB",  want: ["CB", "SW", "DF"] },
  { n: "CB",  want: ["CB", "SW", "DF"] },
  { n: "LB",  want: ["LB", "LWB", "LM", "CB"] },
  { n: "RB",  want: ["RB", "RWB", "RM", "CB"] },
  { n: "DM",  want: ["DM", "CM", "MF"] },
  { n: "CM",  want: ["CM", "DM", "MF"] },
  { n: "AM",  want: ["AM", "CM", "SS", "MF"] },
  { n: "LW",  want: ["LW", "LM", "LF", "SS"] },
  { n: "ST",  want: ["CF", "ST", "FW", "SS"] },
  { n: "RW",  want: ["RW", "RM", "RF", "SS"] },
];

/* HOW FAR UP THE PITCH EACH POSITION IS, nought at your own goal and four at
   theirs. It is only ever used to decide which of two men a slot would rather
   borrow, so the exact numbers matter less than their order, and their order
   is not arguable. */
const ZONE = {
  GK: 0,
  SW: 1, CB: 1, DF: 1, LB: 1.3, RB: 1.3, LWB: 1.6, RWB: 1.6,
  DM: 2, CM: 2.5, MF: 2.5, LM: 2.6, RM: 2.6,
  AM: 3, SS: 3.4, LW: 3.4, RW: 3.4, LF: 3.8, RF: 3.8,
  CF: 4, ST: 4, FW: 4,
};
const SLOT_ZONE = [0, 1, 1, 1.3, 1.3, 2, 2.5, 3, 3.4, 4, 3.4];
/* WHICH TOUCHLINE, where a position has one. The wish lists already know
   (the left-back slot never asks for a RWB); the fallback did not, and put
   Roberto Carlos on the right wing in 2002. */
const flank = p => /^L/.test(p) && p !== "LF" ? "L" : /^R/.test(p) && p !== "RF" ? "R"
  : p === "LF" ? "L" : p === "RF" ? "R" : null;
const SLOT_FLANK = [null, null, null, "L", "R", null, null, null, "L", null, "R"];
/* what it costs to put this man in this slot: his place on the wish list if he
   is on it, otherwise ten plus how far he has been moved. The keeper is not
   negotiable at any price. */
function cost(si, slot, man){
  const at = slot.want.indexOf(man.pos);
  if(at > -1) return at;
  if(si === 0 || man.pos === "GK") return 1000;
  const z = ZONE[man.pos];
  const moved = SLOT_ZONE[si] - (z === undefined ? 2.5 : z);
  /* FORWARD IS FURTHER THAN BACK, and distance is charged SQUARED.
     Forward, because what actually happens when a side changes shape is that
     defenders come inward and midfielders go out, so a centre-half on the wing
     reads worse than a winger tucked into midfield. Squared, because a flat
     ten-plus-distance made every wrong slot cost about the same and the whole
     decision fell to the on-list ties: Brazil in 2002 came out with Roque
     Junior on the right wing, which was three points of pitch away and cost
     three points. */
  const far = moved > 0 ? moved * 1.6 : -moved;
  /* CROSSING THE PITCH costs more than any distance up it that this ever
     measures, and less than putting a defender in attack. */
  const wrongSide = SLOT_FLANK[si] && flank(man.pos) && SLOT_FLANK[si] !== flank(man.pos);
  return 10 + far * far + (wrongSide ? 6 : 0);
}
/* Order a real line-up into the app's slots, and say where it had to guess.
   The whole eleven at once rather than slot by slot: see the note at the top
   of this file about Vertonghen in attacking midfield. */
function fit(lineup){
  const men = lineup.slice();
  const n = SLOTS.length;
  const C = SLOTS.map((slot, si) => men.map(m => cost(si, slot, m)));
  /* a greedy start: the cheapest pair still going, over and over */
  const pick = new Array(n).fill(-1), taken = new Array(men.length).fill(false);
  for(let k = 0; k < n; k++){
    let best = Infinity, bs = -1, bm = -1;
    for(let si = 0; si < n; si++){
      if(pick[si] > -1) continue;
      for(let mi = 0; mi < men.length; mi++){
        if(taken[mi]) continue;
        if(C[si][mi] < best){ best = C[si][mi]; bs = si; bm = mi; }
      }
    }
    if(bs < 0) break;
    pick[bs] = bm; taken[bm] = true;
  }
  /* THEN SWAPS, AND THEN ROTATIONS, until neither is an improvement.
     Swapping two is not enough on a back three: Brazil in 2002 needed Roque
     Junior into the back four, Lucio out to left-back and Roberto Carlos up to
     the wing, and no single swap improves on the way there. Eleven by eleven
     makes 165 rotations, which costs nothing and gets out of exactly this. */
  const at = i => (pick[i] < 0 ? null : C[i][pick[i]]);
  for(let pass = 0; pass < 12; pass++){
    let moved = false;
    for(let a = 0; a < n; a++) for(let b = a + 1; b < n; b++){
      const ma = pick[a], mb = pick[b];
      if(ma < 0 || mb < 0) continue;
      if(C[a][mb] + C[b][ma] < C[a][ma] + C[b][mb]){
        pick[a] = mb; pick[b] = ma; moved = true;
      }
    }
    for(let a = 0; a < n; a++) for(let b = 0; b < n; b++) for(let c = 0; c < n; c++){
      if(a === b || b === c || a === c) continue;
      const ma = pick[a], mb = pick[b], mc = pick[c];
      if(ma < 0 || mb < 0 || mc < 0) continue;
      const now = at(a) + at(b) + at(c);
      /* a takes b's man, b takes c's, c takes a's */
      if(C[a][mb] + C[b][mc] + C[c][ma] < now){
        pick[a] = mb; pick[b] = mc; pick[c] = ma; moved = true;
      }
    }
    if(!moved) break;
  }
  const out = [], notes = [];
  for(let si = 0; si < n; si++){
    const m = pick[si] > -1 ? men[pick[si]] : null;
    out.push(m || null);
    if(m && SLOTS[si].want.indexOf(m.pos) < 0) notes.push(SLOTS[si].n + " filled by a " + m.pos);
  }
  return { xi: out, notes: notes };
}

/* what shape a line-up actually was, for the record and for the shape picker */
function shapeOf(lineup) {
  const c = p => lineup.filter(x => x.pos === p).length;
  const def = c("CB") + c("SW") + c("LB") + c("RB") + c("LWB") + c("RWB") + c("DF");
  const fwd = c("CF") + c("ST") + c("FW") + c("LF") + c("RF");
  const mid = 10 - def - fwd;
  return def + "-" + mid + "-" + fwd;
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
  console.log("  " + Math.round(text.length / 1024) + "KB\n");

  /* ---------- every match, in order ---------- */
  const kits = [...text.matchAll(/\{\{\s*Football kit/gi)].map(m => m.index);
  console.log("kit blocks found: " + kits.length + "  (two a match, so " + (kits.length / 2) + " matches)");
  /* every date on every page, found once rather than once a match */
  const allDates = [...text.matchAll(/\{\{\s*[Ss]tart date\s*\|\s*(\d{4})\s*\|\s*(\d{1,2})\s*\|\s*(\d{1,2})/g)]
    .map(m => ({ at: m.index,
      when: m[1] + "-" + String(m[2]).padStart(2, "0") + "-" + String(m[3]).padStart(2, "0") }));
  console.log("dates found: " + allDates.length + "  (one a match)");
  const badSplit = [];
  const matches = [];
  for (let i = 0; i + 1 < kits.length; i += 2) {
    const seg = text.slice(kits[i], kits[i + 2] === undefined ? text.length : kits[i + 2]);
    /* the two sides, off the kit blocks themselves rather than off any
       "title=" in the section, because the citations carry titles too */
    const names = [];
    for (const k of [kits[i], kits[i + 1]]) {
      /* 2600 rather than 900: a title with two citations hanging off it is
         longer than a whole kit block without them. */
      const block = text.slice(k, k + 2600);
      const m = block.match(/\|\s*title\s*=\s*([\s\S]*?)(?:\n\s*\}\}|\n\s*\|)/);
      names.push(m ? tidy(m[1]) : null);
    }
    if (!names[0] || !names[1]) continue;
    /* THE DATE, exactly: the last one declared before this match's kits. A
       fixed lookback window landed inside the previous match on the knockout
       pages, which put Italy out at the semi-final. */
    const d = allDates.filter(x => x.at < kits[i]).pop();
    const when = d ? d.when : "0000-00-00";

    /* EACH SIDE'S TABLE ENDS WITH A MANAGER ROW, twice a match and never more,
       and that is the one thing every spelling of this table agrees on. Within
       each half the first eleven rows are the eleven who started, whatever is
       listed under them: some tables carry substitutes who never came on, which
       is what broke counting to twenty-two. */
    /* MANAGERS, PLURAL, for a side with two of them: Sweden shared the job
       between Lagerback and Soderberg in 2002 and all four of their matches
       fell out of the harvest over the s. */
    const halves = seg.split(/Managers?:/);
    if (halves.length < 3) continue;
    const rowsIn = t => {
      const out = [];
      /* THE POSITION IS SOMETIMES A TOOLTIP. Every page writes a bare code
         except the 2014 final, which wraps it in {{abbr}} so a reader can
         hover it, and that is the only place Germany's and Argentina's real
         elevens exist. */
      /* TWO BRANCHES, NOT ONE WITH AN OPTIONAL TAIL, and the tail cannot
         cross a line. Written as one, the bare-code branch ran on into the
         NEXT row's {{abbr}} looking for its }}, and read that row's shirt and
         name: the 2014 final came out with Lahm in goal. */
      for (const m of t.matchAll(/^\|\s*(?:\{\{\s*abbr\s*\|\s*([A-Z]{2,3})\s*\|[^}\n]*\}\}|([A-Z]{2,3}))\s*\|\|\s*'''(\d+)'''\s*\|\|\s*\[\[([^\]|]+)(?:\|[^\]]*)?\]\]/gm))
        out.push({ pos: m[1] || m[2], no: parseInt(m[3], 10), name: m[4] });
      return out;
    };
    const a = rowsIn(halves[0]).slice(0, 11), b = rowsIn(halves[1]).slice(0, 11);
    if (a.length !== 11 || b.length !== 11) { badSplit.push(names[0] + " v " + names[1]); continue; }
    /* BOTH ELEVENS BEGIN WITH A GOALKEEPER. A free check that the split landed
       where it should, and the only way this can go wrong silently. */
    if (a[0].pos !== "GK" || b[0].pos !== "GK") { badSplit.push(names[0] + " v " + names[1]); continue; }
    matches.push({ when: when, sides: [
      { name: names[0], line: a },
      { name: names[1], line: b },
    ]});
  }
  console.log("matches parsed: " + matches.length + " of " + (kits.length / 2));
  if (badSplit.length) console.log("  the eleven-eleven split did not land: " + badSplit.join(", "));

  /* ---------- each team's LAST match ---------- */
  /* EVERY MATCH A SIDE PLAYED, newest first. Only the last one is wanted, but
     two line-ups name a man his own squad page does not list, and walking back
     one match is worth far more than falling back to a sorted squad list. */
  const played = {};
  let unknownSide = new Set();
  for (const m of matches) {
    for (const s of m.sides) {
      const side = SIDE_ALIAS[s.name] || s.name;
      if (!sides[side]) { unknownSide.add(s.name); continue; }
      if (s.line.length !== 11) continue;
      (played[side] = played[side] || []).push(
        { when: m.when, line: s.line, against: m.sides.filter(x => x !== s)[0].name });
    }
  }
  const last = {};
  for (const side of Object.keys(played)) {
    played[side].sort((a, b) => (a.when < b.when ? 1 : -1));
    last[side] = played[side][0];
  }
  if (unknownSide.size)
    console.log("kit titles the deck does not know: " + [...unknownSide].join(", "));
  console.log("teams with a last match: " + Object.keys(last).length + "/" + Object.keys(sides).length);
  const missing = Object.keys(sides).filter(s => !last[s]);
  if (missing.length) console.log("  NO LINE-UP FOUND: " + missing.join(", "));

  /* ---------- tie every name to a squad man ---------- */
  let lost = [];
  const built = {}, walked = [];
  for (const side of Object.keys(played)) {
    for (const info of played[side]) {
      const men = [];
      let missed = null;
      for (const row of info.line) {
        const m = manIn(side, row.name, row.no);
        if (!m) { missed = row.name; break; }
        /* THE POSITION HE PLAYED THAT DAY, not the one the squad list gave him */
        men.push({ n: m.n, full: m.full, no: m.no, pos: row.pos, lg: m.lg, tr: m.tr,
                   g: m.g, y: m.y, r: m.r, app: m.app, cap: m.cap });
      }
      /* ELEVEN NAMES IS NOT ELEVEN MEN. Two rows resolving to the same man
         used to pass as a complete eleven and put him on the pitch twice, so
         the count is of distinct shirts. */
      const distinct = new Set(men.map(m => m.no)).size;
      if (men.length !== 11 || distinct !== 11) {
        if (info === played[side][0])
          lost.push(side + ": " + (missed || "two rows resolved to one man"));
        continue;                       // try the match before it
      }
      if (info !== played[side][0]) walked.push(side + " (back to " + info.when + ")");
      const f = fit(men);
      built[side] = { xi: f.xi, notes: f.notes, when: info.when, against: info.against,
                      shape: shapeOf(men) };
      break;
    }
  }
  if (walked.length) console.log("walked back a match to get a complete eleven: " + walked.join(", "));
  if (lost.length) console.log("\nnames in a line-up the squad does not have (" + lost.length + "): " +
    lost.slice(0, 10).join(", "));
  console.log("teams with a complete real eleven: " + Object.keys(built).length);

  /* ---------- what changed, and where it had to guess ---------- */
  console.log("\nWHAT THE SHIRT-NUMBER GUESS GOT WRONG");
  let changed = 0, totalOut = 0;
  for (const [side, b] of Object.entries(built)) {
    const had = new Set((sides[side].xi || []).map(m => m.full));
    const now = b.xi.map(m => m.full);
    const out = [...had].filter(f => now.indexOf(f) < 0);
    const inn = now.filter(f => !had.has(f));
    if (!out.length) continue;
    changed++; totalOut += out.length;
    if (out.length >= 4 || WHO)
      console.log("  " + side.padEnd(22) + out.length + " wrong: out " + out.map(x => x.split(" ").pop()).join(", ") +
        "  in " + inn.map(x => x.split(" ").pop()).join(", "));
  }
  console.log("  " + changed + " of " + Object.keys(built).length + " sides changed, " +
    totalOut + " men in all (showing the four-plus)");

  const guessed = Object.entries(built).filter(([, b]) => b.notes.length);
  console.log("\nSIDES WHERE THE SLOT MAPPING HAD TO JUDGE (" + guessed.length + ")");
  for (const [side, b] of guessed)
    console.log("  " + side.padEnd(22) + b.shape.padEnd(8) + b.notes.join("; "));

  if (WHO) {
    const b = built[WHO];
    console.log("\n" + WHO + (b ? "  " + b.shape + ", last played " + b.when + " against " + b.against : " has no eleven"));
    if (b) b.xi.forEach((m, i) => console.log("  " + String(i).padStart(2) + "  " +
      SLOTS[i].n.padEnd(4) + (m.pos + "").padEnd(4) + "#" + String(m.no).padEnd(3) + m.full));
  }

  if (!WRITE) { console.log("\ndry run, add --write to stamp the real elevens onto the deck"); return; }

  for (const [side, b] of Object.entries(built)) {
    const t = sides[side];
    const wasAll = [...(t.xi || []), ...(t.bench || [])];
    const inXi = new Set(b.xi.map(m => m.full));
    t.xi = b.xi;
    /* THE BENCH IS THE REST OF THE TWENTY-THREE, and it has to be exactly that:
       a man in both lists would be two men, and h2Bench indexes into it. */
    t.bench = wasAll.filter(m => !inXi.has(m.full));
    t.xiWhen = b.when;
    t.xiVs = b.against;
    t.xiShape = b.shape;
  }
  /* NO MARKER KEY ON THE POOL. sides is a map of country to squad and the
     app iterates it; a rule name sitting in there is a thirty-third team. The
     per-team xiWhen and xiVs already say what the rule was, one team at a
     time, which is more useful anyway. */
  fs.writeFileSync(OUT, JSON.stringify(sides));
  console.log("\nwrote " + path.relative(REPO, OUT) + "  (" +
    (fs.statSync(OUT).size / 1024).toFixed(1) + " KB)");
})().catch(e => { console.error(e); process.exit(1); });
