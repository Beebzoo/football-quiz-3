/* The clubs you can play AS in a league's football game.
 *
 *     node _tools/build-clubs.js [league...] [--dry] [--force]
 *
 * One file per league: assets/<dir>/clubs.json, shaped exactly like the 2006
 * World Cup deck build-squads.js writes, so h2Squad cannot tell them apart.
 *
 * WHY IT IS HARVESTED AND NOT TYPED. Six leagues is a hundred and twelve clubs
 * and well over twelve hundred players in the elevens alone, and this repo has
 * learned more than once that a name typed from memory is a name that is
 * quietly wrong. Everything here comes off Wikipedia, where every club article
 * carries its first team in one machine-readable template per man:
 *
 *   {{Fs player|no=1|pos=GK|nat=GER|name=[[Marc-Andre ter Stegen]]}}
 *
 * WHICH CLUBS. Getting the list of clubs right turned out to be the hard part,
 * and three plausible sources all lied in different ways:
 *
 *   - Wikidata P118 returns every club that was EVER in the league, because
 *     the property sits on the club and editors do not always close the old
 *     statement. Filtering to statements with no end date helps and is still
 *     not the current table. It also matches players and seasons, so an
 *     unfiltered query came back with two and a half thousand rows, most of
 *     them footballers.
 *   - The season article's standings template is authoritative when it is
 *     there, and the Bundesliga keeps its table in a SEPARATE transcluded
 *     template, so the article itself parses to zero teams.
 *   - That separate template, fetched directly, came back missing two clubs
 *     the same article's own location map listed.
 *
 * So nothing here trusts one source. Candidates are pooled from all of them,
 * and then every candidate has to EARN its place by having a first-team squad
 * on its own article. That check is not extra work, it is the work: the squad
 * has to be fetched anyway, and a candidate that is not a club (the Premier
 * League map labels the city of London exactly the way it labels Aston Villa)
 * simply has no squad and falls out. The count is then reported against what
 * the league is supposed to have, and a mismatch refuses to write.
 *
 * WHICH ELEVEN. A squad list is not a team sheet, so there is no starting XI
 * in the data to read. Players are picked by SHIRT NUMBER within each
 * position, lowest first, which is deterministic and checkable and is the same
 * rule build-squads.js uses. It is not a claim about who started on Saturday.
 * Shape is 1 GK, 4 DF, 3 MF, 3 FW, which is what the pitch wants.
 *
 * THE BENCH is kept too, twelve more by the same rule, because a substitution
 * that says "Sneijder replaces Landzaat" needs a Sneijder to name.
 */
const fs = require("fs");
const path = require("path");
const https = require("https");

const REPO = path.join(__dirname, "..");
const DRY = process.argv.includes("--dry");
const FORCE = process.argv.includes("--force");
/* THE USER AGENT IS NOT DECORATION, it is the difference between a build that
   works and one that 429s on every single call.

   This started as "BALL-quiz-build/1.0 (personal project; contact via repo
   owner)" and Wikimedia throttled it into uselessness: every request came back
   429 with retry-after 35, the retries fell through to the fallbacks, and the
   build cheerfully reported eleven clubs out of eighteen as though that were a
   result. The same URL with a User-Agent naming a real, reachable project
   returned 200 on the first try and 174KB of wikitext.

   Wikimedia's policy asks for something that identifies the client and gives a
   way to contact whoever is running it. A vague phrase does not; a public repo
   URL does. Nothing else about the requests changed. */
const UA = "BALL2-quiz-build/1.0 (https://github.com/Beebzoo/football-quiz-2; personal hobby project)";

/* The season is resolved at run time rather than pinned, so this keeps working
   next August without an edit. Both the current and the previous season are
   tried: in July the new article exists but is empty, in May the old one is
   the only one that is right. */
const now = new Date();
const startYear = now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1;
const season = y => y + "–" + String(y + 1).slice(2);   // en dash, as Wikipedia writes it

const LEAGUES = {
  premier:    {dir: "premier",    league: "Premier League",     qid: "Q9448",   teams: 20, label: "Premier League"},
  laliga:     {dir: "laliga",     league: "La Liga",            qid: "Q324867", teams: 20, label: "La Liga"},
  bundesliga: {dir: "bundesliga", league: "Bundesliga",         qid: "Q82595",  teams: 18, label: "Bundesliga"},
  seriea:     {dir: "seriea",     league: "Serie A",            qid: "Q15804",  teams: 20, label: "Serie A"},
  /* eighteen, not sixteen: the division has been both, and the number here is
     checked against the season article's own table rather than remembered */
  belgian:    {dir: "belgian",    league: "Belgian Pro League", qid: "Q216022", teams: 18, label: "Belgian Pro League"},
  ere:        {dir: "eredivisie", league: "Eredivisie",         qid: "Q167541", teams: 18, label: "Eredivisie"},
  /* THE SECOND DIVISIONS, one under each of the six above. Same harvest, same
     shape, same proof (a club earns its place by carrying a first-team squad on
     its own article). Team counts are what each division plays this season and
     are checked against the article rather than remembered: the Championship
     is twenty-four, Spain twenty-two, Belgium fifteen. */
  champ:      {dir: "championship", league: "EFL Championship",      qid: "Q19510",    teams: 24, label: "Championship"},
  segunda:    {dir: "segunda",      league: "Segunda División",      qid: "Q35615",    teams: 22, label: "Segunda División"},
  bundesliga2:{dir: "bundesliga2",  league: "2. Bundesliga",         qid: "Q152665",   teams: 18, label: "2. Bundesliga"},
  serieb:     {dir: "serieb",       league: "Serie B",               qid: "Q194052",   teams: 20, label: "Serie B"},
  challenger: {dir: "challenger",   league: "Challenger Pro League", qid: "Q23925620", teams: 15, label: "Challenger Pro League"},
  eerste:     {dir: "eerste",       league: "Eerste Divisie",        qid: "Q610823",   teams: 20, label: "Eerste Divisie"},
};

/* ---------- being polite to Wikipedia ----------
   The same lesson build-squads.js records: the damage from being throttled is
   not a crash, it is a build that "succeeds" and writes a deck full of nulls. */
const sleep = ms => new Promise(r => setTimeout(r, ms));
const once = (url, headers) => new Promise((res, rej) => {
  https.get(url, {headers: Object.assign({"User-Agent": UA}, headers || {})}, r => {
    if (r.statusCode >= 300 && r.statusCode < 400 && r.headers.location) return res(once(r.headers.location, headers));
    if (r.statusCode !== 200) {
      r.resume();
      const e = new Error("HTTP " + r.statusCode);
      e.status = r.statusCode;
      return rej(e);
    }
    let b = "";
    r.setEncoding("utf8");
    r.on("data", d => b += d);
    r.on("end", () => res(b));
  }).on("error", rej);
});
/* ONE REQUEST PER CLUB GOT THIS THROTTLED INTO USELESSNESS.
   At 170ms apart, fetching a season article and then eighteen club articles
   drew 429s on almost every call, and the damage was not a crash: the retries
   fell through to the fallbacks and the build reported eleven clubs out of
   eighteen as though that were a result. So two things changed. The gap is
   most of a second, and the club articles are fetched in BATCHES: the API
   takes up to fifty titles in one query, so a whole league is one request
   rather than twenty. Six leagues now cost about thirty requests in total. */
let lastCall = 0;
const GAP = 400;
async function get(url, tries, headers) {
  tries = tries || 4;
  for (let i = 0; i < tries; i++) {
    const wait = GAP - (Date.now() - lastCall);
    if (wait > 0) await sleep(wait);
    lastCall = Date.now();
    try {
      return await once(url, headers);
    } catch (e) {
      const retryable = e.status === 429 || e.status >= 500 || !e.status;
      if (!retryable || i === tries - 1) throw e;
      const back = 1200 * Math.pow(2, i);
      console.log("      " + (e.status || e.message) + ", waiting " + (back / 1000) + "s");
      await sleep(back);
    }
  }
}
const API = "https://en.wikipedia.org/w/api.php?action=parse&prop=wikitext&format=json&formatversion=2&redirects=1&page=";
async function wikitext(page) {
  try {
    const j = JSON.parse(await get(API + encodeURIComponent(page)));
    if (j.error) return null;
    return j.parse.wikitext;
  } catch (e) {
    return null;
  }
}
/* Many articles, few requests. Returns a Map keyed by the title that was ASKED
   FOR, not the one that came back: "Feyenoord" redirects to "Feyenoord
   Rotterdam" and the caller is holding the former. normalized and redirects
   are both followed so nothing is silently dropped. */
const QAPI = "https://en.wikipedia.org/w/api.php?action=query&prop=revisions&rvprop=content&rvslots=main" +
             "&format=json&formatversion=2&redirects=1&titles=";
async function wikitexts(titles) {
  const out = new Map();
  const BATCH = 12;
  for (let i = 0; i < titles.length; i += BATCH) {
    const slice = titles.slice(i, i + BATCH);
    let j;
    try { j = JSON.parse(await get(QAPI + encodeURIComponent(slice.join("|")))); }
    catch (e) { console.log("      batch failed (" + e.message + "), " + slice.length + " clubs skipped"); continue; }
    const q = (j && j.query) || {};
    /* asked-for title -> the title the content actually came back under */
    const alias = new Map();
    (q.normalized || []).forEach(n => alias.set(n.from, n.to));
    (q.redirects || []).forEach(r => {
      for (const [from, to] of alias) if (to === r.from) alias.set(from, r.to);
      alias.set(r.from, r.to);
    });
    const byTitle = new Map();
    (q.pages || []).forEach(p => {
      const c = p.revisions && p.revisions[0] && p.revisions[0].slots && p.revisions[0].slots.main;
      if (c && c.content) byTitle.set(p.title, c.content);
    });
    slice.forEach(t => {
      const real = alias.get(t) || t;
      const hit = byTitle.get(real) || byTitle.get(t);
      /* the RESOLVED title comes back too, because it is the only safe key to
         dedupe on: the season table links [[Willem II (football club)|Willem
         II]] and Wikidata calls the same club Willem II Tilburg, and without
         this the league comes out with nineteen teams in it */
      if (hit) out.set(t, {text: hit, title: byTitle.has(real) ? real : t});
    });
    process.stdout.write("  [" + out.size + "/" + titles.length + "]");
  }
  return out;
}

/* ---------- wikitext helpers ---------- */
function unlink(t) {
  return String(t)
    .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, "$2")
    .replace(/\[\[([^\]]+)\]\]/g, "$1")
    .replace(/\{\{(?:nowrap|nobr|sortname)\|([^}]*)\}\}/gi, "$1")
    /* THE TAG AND WHAT IS INSIDE IT. The Belgian second tier marks its reserve
       sides [[Club NXT]]<sup>'''U23'''</sup>, and stripping only the tags left
       a club called "Club NXT '''U23'''" with the wiki bold still on it. A
       superscript is an annotation, never part of a name. */
    .replace(/<sup>[\s\S]*?<\/sup>/gi, " ")
    .replace(/'{2,}/g, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\(\s*c\s*\)/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}
/* the LINK TARGET, which is the article to fetch, not the display text */
function linkTarget(t) {
  const m = String(t).match(/\[\[([^\]|]+)/);
  return m ? m[1].trim() : null;
}
const PARTICLES = new Set(["van", "von", "de", "del", "della", "di", "da", "dos", "das", "du",
  "der", "den", "el", "al", "ter", "ten", "la", "le", "bin", "ibn", "mc", "op"]);
function shortName(full) {
  const parts = String(full).split(" ").filter(Boolean);
  if (parts.length === 1) return parts[0];
  for (let i = 1; i < parts.length - 1; i++) {
    if (PARTICLES.has(parts[i].toLowerCase())) return parts.slice(i).join(" ");
  }
  return parts[parts.length - 1];
}
const SHAPE = ["GK", "DF", "DF", "DF", "DF", "MF", "MF", "MF", "FW", "FW", "FW"];

/* ---------- who is in the league ----------
   Everything that comes out of here is a GUESS. It is proved or dropped by
   whether its own article carries a first-team squad. */
async function candidates(row) {
  const found = new Map();             // page title -> display name
  /* table:true means this name came off the league table, which is the club's
     own name. Anything else may be a city, so a table name always wins. */
  const fromTable = new Set();
  const add = (raw, table) => {
    const page = linkTarget(raw);
    if (!page) return;
    if (/^(Football|Association football|List of|Category:|File:|Image:|:)/i.test(page)) return;
    if (!found.has(page) || (table && !fromTable.has(page))) found.set(page, unlink(raw));
    if (table) fromTable.add(page);
  };
  const names = w => { for (const m of w.matchAll(/\|\s*name_[A-Za-z0-9]+\s*=\s*(.+)/g)) add(m[1], true); };
  /* The label of a map pin is a wiki-link, and a wiki-link contains a pipe:
       |label=[[FC Augsburg|Augsburg]]
     Capturing everything up to the next pipe therefore captured
     "[[FC Augsburg", and the whole Bundesliga came out with names like
     "[[1. FC Koln". So take the first [[...]] inside each pin instead, which
     also quietly handles the ones wrapped in a colour template:
       |label={{background color|white|[[Football in London|London]]}}
     where the link is the city and gets dropped by the filter in add(). */
  const maps = w => { for (const m of w.matchAll(/\{\{[Ll]ocation map~[\s\S]{0,400}?(\[\[[^\]]+\]\])/g)) add(m[1]); };

  for (const y of [startYear, startYear - 1]) {
    const page = season(y) + " " + row.league;
    const w = await wikitext(page);
    if (!w) continue;
    console.log("    season article: " + page);
    /* ORDER MATTERS, and getting it wrong renamed half the Bundesliga.
       add() keeps the FIRST name it is given for a page, and a map pin is
       labelled with the CITY ([[1. FC Union Berlin|Berlin]]) while the league
       table is labelled with the club. The Bundesliga keeps its table in a
       separate template, so the map ran first and the division came out as
       Berlin, Leverkusen, Mainz and Munich. The table, wherever it lives, is
       read before the map now, and a table name replaces a map one. */
    names(w);
    const tpl = await wikitext("Template:" + page + " table");
    if (tpl) {
      const before = found.size;
      names(tpl);
      if (found.size !== before) console.log("    +" + (found.size - before) + " from the table template");
    }
    maps(w);
    /* the stadium table: the first cell of each row is the club */
    const si = w.search(/==+\s*Stadiums? and locations?\s*==+/i);
    if (si > 0) {
      for (const m of w.slice(si, si + 24000).matchAll(/^\|\s*(\[\[[^\]]+\]\])\s*$/gm)) add(m[1]);
    }
    if (found.size >= row.teams) break;
  }

  /* THE SEASON ARTICLE OUTRANKS WIKIDATA and is only topped up by it.
     Wikidata lists a club as being in a league until somebody closes the
     statement, so relegated sides linger: asking it for the Belgian division
     produced nineteen clubs with real squads for an eighteen-team league, and
     every extra was a genuine club that simply is not in it any more. So the
     article's list is the truth, and Wikidata is only asked when the article
     came up short. */
  const fromArticle = new Set(found.keys());
  if (found.size >= row.teams) {
    console.log("    " + found.size + " off the season article, Wikidata not needed");
    return {found: found, fromArticle: fromArticle, tableOnly: fromTable};
  }
  // Wikidata as a third opinion, never as the only one
  try {
    const q = "SELECT ?article WHERE { ?c p:P118 ?st . ?st ps:P118 wd:" + row.qid + " ." +
      " FILTER NOT EXISTS { ?st pq:P582 ?e } ?c wdt:P31/wdt:P279* wd:Q476028 ." +
      " ?article schema:about ?c ; schema:isPartOf <https://en.wikipedia.org/> . }";
    const j = JSON.parse(await get("https://query.wikidata.org/sparql?format=json&query=" + encodeURIComponent(q),
      3, {Accept: "application/sparql-results+json"}));
    let n = 0;
    for (const b of j.results.bindings) {
      const page = decodeURIComponent(b.article.value.replace("https://en.wikipedia.org/wiki/", "")).replace(/_/g, " ");
      if (!found.has(page)) { found.set(page, page); n++; }
    }
    if (n) console.log("    +" + n + " Wikidata only (unproven until a squad is found)");
  } catch (e) {
    console.log("    Wikidata unavailable (" + e.message + "), carrying on with the article");
  }
  return {found: found, fromArticle: fromArticle, tableOnly: fromTable};
}

/* ---------- the squad ---------- */
function parseSquad(w, under) {
  /* A RESERVE SIDE THAT SHARES ITS PARENT'S ARTICLE. The season table links
     Jong Genk to [[KRC Genk]], whose block 0 is Genk's first team, so the
     harvest would have put Genk's eleven in the second division wearing a
     Jong badge. The parent article keeps the reserves as a later block under a
     heading carrying the reserve side's name ("Jong Genk", "Jong KAA Gent"),
     so when the side asked for is not the article's own, the block read is the
     first one AFTER the heading that names it. No such heading, no squad: a
     side that cannot be found is reported, never guessed. */
  if (under) {
    const rx = new RegExp("^==+\\s*" + under.replace(/[.*+?^$\{\}()|[\]\\]/g, "\\$&") + "\\s*==+\\s*$", "mi");
    const at = w.search(rx);
    if (at < 0) return [];
    w = w.slice(at);
  }
  /* Block 0 is the first team, every time: block 1 onward is the youth side,
     the reserves, or men out on loan, and a man out on loan is not in the
     side. Checked against Ajax, Arsenal, Bayern and Real Madrid, which have
     three or four blocks each. */
  /* {{Fs end}} TAKES PARAMETERS and plenty of articles pass them:
     Nottingham Forest closes its squad with {{Fs end|bg=DD0000|color=FFFFFF}}.
     Insisting on a bare {{Fs end}} matched no block at all there, so the
     club silently had no squad and the Premier League shipped nineteen. */
  /* BOTH SPELLINGS OF THE BLOCK TOO. {{Fs start}} is the short form of
     {{football squad start}} and FC Den Bosch writes the long one, which is
     exactly how the player template lost Nottingham Forest before. */
  const block = w.match(/\{\{\s*(?:[Ff]s start|[Ff]ootball squad start)[\s\S]*?\{\{\s*(?:[Ff]s end|[Ff]ootball squad end)[^}]*\}\}/);
  if (!block) return [];
  const players = [];
  /* BOTH SPELLINGS. {{Fs player}} is a redirect to {{football squad player}}
     and most articles use the short one, but not all of them: Nottingham
     Forest writes it out in full, so the Premier League came back with
     nineteen clubs and no explanation of which one was missing. */
  for (const m of block[0].matchAll(/\{\{\s*(?:[Ff]s player|football squad player)\s*\|([\s\S]*?)\}\}/g)) {
    const f = {};
    /* Split on | at depth zero. BOTH kinds of bracket have to be counted: the
       obvious nested template, and name=[[Some Player]] ([[Captain|c]]) whose
       pipe lives inside [[...]]. Counting only braces cut every captain in
       half when build-squads.js first tried it. */
    let depth = 0, cur = "";
    for (const ch of m[1]) {
      if (ch === "{" || ch === "[") depth++;
      else if (ch === "}" || ch === "]") depth--;
      if (ch === "|" && depth === 0) {
        const e = cur.indexOf("=");
        if (e > 0) f[cur.slice(0, e).trim()] = cur.slice(e + 1);
        cur = "";
      } else cur += ch;
    }
    const e = cur.indexOf("=");
    if (e > 0) f[cur.slice(0, e).trim()] = cur.slice(e + 1);
    if (!f.name || !f.pos) continue;
    /* listed with the first team but away for the season is not available */
    if (/on loan (at|to)/i.test(f.other || "")) continue;
    players.push({
      no: parseInt(f.no, 10) || 99,
      pos: String(f.pos).trim().toUpperCase(),
      name: unlink(f.name),
      nat: String(f.nat || "").trim().toUpperCase(),
    });
  }
  return players;
}

/* THE MAN AS THE DECK CARRIES HIM. nat is the FIFA trigram off the squad
   template (nat=GER), kept because the cards in the app draw a flag from it;
   it was parsed and then dropped on the floor for a year. Absent stays absent. */
const man = p => {
  const m = {n: shortName(p.name), full: p.name, no: p.no, pos: p.pos};
  if (p.nat && /^[A-Z]{3}$/.test(p.nat)) m.nat = p.nat;
  return m;
};
function pickXI(players) {
  const by = p => players.filter(x => x.pos === p).sort((a, b) => a.no - b.no);
  const pools = {GK: by("GK"), DF: by("DF"), MF: by("MF"), FW: by("FW")};
  const used = new Set();
  const xi = [];
  for (const want of SHAPE) {
    let pick = pools[want] ? pools[want].find(p => !used.has(p)) : null;
    /* a squad short of forwards borrows from midfield rather than failing */
    if (!pick) pick = players.slice().sort((a, b) => a.no - b.no).find(p => !used.has(p));
    if (!pick) return null;
    used.add(pick);
    xi.push(man(pick));
  }
  const bench = players.filter(p => !used.has(p)).sort((a, b) => a.no - b.no).slice(0, 12).map(man);
  return {xi: xi, bench: bench};
}

/* ---------- kit colour and crest ----------
   Both out of the app's own harvested banks rather than invented. kits carries
   1,021 sides with a slug and a first-shirt colour; logos is 2,894 crests
   already on disk and already shipping for Badge Zoom. A club that cannot be
   matched is REPORTED, never guessed at. */
function slugify(s) {
  return String(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/&/g, " and ").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}
/* the noise that sits round a club's real name */
/* the German and Belgian forms joined the list with the second divisions:
   VfL Bochum is Bochum, KAA Gent is Gent, RSC Anderlecht is Anderlecht */
const AFFIX = /\b(f\.?c\.?|a\.?f\.?c\.?|s\.?c\.?|c\.?f\.?|v\.?v\.?|s\.?v\.?|k\.?v\.?|b\.?c\.?|a\.?c\.?|s\.?s\.?|u\.?s\.?|vfl|vfb|tsv|tsg|fsv|ssv|spvgg|kaa|krc|kvc|rsc|rfc|calcio|club|football|association)\b/gi;
function bare(s) {
  return String(s).replace(/\([^)]*\)/g, " ").replace(AFFIX, " ").replace(/\s+/g, " ").trim();
}

/* A CREST FILENAME IS NOT A FOOTBALL FACT, which is why these few are allowed
   to be written down. The crest bank was harvested under the name a club is
   filed under in English or in its own language, and those disagree for exactly
   the cases you would expect: Munich and Munchen, Cologne and Koln. Everything
   else is matched, never mapped, and anything matched loosely is reported. */
const CREST_ALIAS = {
  "bayern-munich": "bayern-munchen",
  "cologne": "1-fc-koln",
  "koln": "1-fc-koln",
  /* the second divisions, from the first dry run: a reserve side wears its
     parent's crest, and two banks filed a club under an older name */
  "wolverhampton-wanderers": "wolves",
  "beerschot": "beerschot-wilrijk",
  "club-nxt": "club-brugge",
  "rsca-futures": "anderlecht",
  "jong-genk": "genk",
  "jong-kaa-gent": "gent",
  "jong-az": "az-alkmaar",
};
/* the words that carry meaning in a club's name, for matching one against
   another: the legal form and the founding year do not distinguish anybody */
const NOISE = new Set(["fc","afc","sc","cf","vv","sv","kv","bc","ac","ss","us","rc","cd","ud",
  "calcio","club","football","association","de","la","le","the","1","04","05","07","09",
  "1899","1900","1907","1909","1913","1846","1848","1860","96","98","and"]);
const tokens = s => new Set(slugify(s).split("-").filter(t => t && !NOISE.has(t)));

/* The first-shirt colour as the club's own infobox states it. The # is
   optional there and about half the articles write it, which is why Elche
   and Deportivo came back with nothing at all until this tolerated both. An
   empty body1 is not a failure: those clubs wear a PATTERN, and their shirt
   has no single colour to report. */
function kitFromInfobox(w) {
  const grab = k => {
    const g = w.match(new RegExp("\\|\\s*" + k + "\\s*=\\s*#?([A-Fa-f0-9]{6})"));
    return g ? "#" + g[1].toUpperCase() : null;
  };
  const body = grab("body1"), arm = grab("leftarm1");
  return (body === "#FFFFFF" && arm && arm !== "#FFFFFF") ? arm : body;
}

function buildMatchers() {
  const kits = JSON.parse(fs.readFileSync(path.join(REPO, "assets/kits/index.json"), "utf8"));
  const rows = Object.values(kits).flat();
  const byName = new Map();
  rows.forEach(k => {
    byName.set(slugify(k.n), k);
    byName.set(slugify(bare(k.n)), k);
    if (k.s) byName.set(k.s, k);
  });
  const logos = new Set(fs.readdirSync(path.join(REPO, "assets/logos"))
    .filter(f => f.endsWith(".png")).map(f => f.slice(0, -4)));
  /* every crest by its significant words, so "TSG Hoffenheim" can find
     hoffenheim.png without anybody writing that pairing down */
  const logoTokens = [...logos].map(s => ({s: s, t: tokens(s)}));
  /* How many crests use each word. This is what tells a distinctive name from
     a prefix: "hoffenheim" appears once in 2,894 crests and "deportivo" appears
     in dozens, and only the first of those identifies a club on its own. */
  const freq = new Map();
  logoTokens.forEach(r => r.t.forEach(t => freq.set(t, (freq.get(t) || 0) + 1)));
  return {byName: byName, logos: logos, logoTokens: logoTokens, freq: freq};
}
/* The crest whose significant words are all present in the club's name, and
   which uses the most of them. "TSG Hoffenheim" -> hoffenheim. Ties are
   refused rather than guessed: two crests that fit equally well means the
   answer is not known. */
function crestByWords(m, name) {
  const want = tokens(name);
  if (!want.size) return null;
  /* how many crests are a single word that this club's name contains: more
     than one and no single-word answer can be trusted */
  let singles = 0;
  for (const row of m.logoTokens) {
    if (row.t.size !== 1) continue;
    const only = [...row.t][0];
    if (want.has(only)) singles++;
  }
  let best = null, bestN = 0, tie = false;
  for (const row of m.logoTokens) {
    if (!row.t.size) continue;
    let all = true;
    for (const t of row.t) if (!want.has(t)) { all = false; break; }
    if (!all) continue;
    if (row.t.size === 1 && want.size > 1) {
      /* A ONE WORD CREST HAS TO EARN IT, TWICE OVER.
         Matching on a single shared word put Deportivo La Coruna's crest on
         Alaves, because "Deportivo Alaves" does contain the word deportivo and
         so do dozens of Spanish clubs. Requiring the word to be RARE fixed that
         and immediately put AC Milan's crest on Inter, because "Inter Milan"
         contains milan and milan is rare while inter is not.

         So both tests have to pass. The word has to be rare enough to name a
         club by itself, AND it has to be the only single word in the whole
         bank that fits this club at all. Inter Milan fits both inter and milan,
         so the answer is not known and the by-words route declines; the plainer
         trimming fallback then gets it right. TSG Hoffenheim fits only
         hoffenheim, so it is not a guess. */
      const only = [...row.t][0];
      if ((m.freq.get(only) || 0) > 2) continue;
      if (singles > 1) continue;
    }
    if (row.t.size > bestN) { best = row.s; bestN = row.t.size; tie = false; }
    else if (row.t.size === bestN) tie = true;
  }
  return tie ? null : best;
}

/* AAA for the scorebug. Clubs have no FIFA trigram the way countries do, so
   this is DERIVED and says so: the first three letters of the short name, and
   where two clubs in one league collide (Manchester United and Manchester City
   both give MAN) the initial of the first word plus two of the second, which
   is how a broadcast writes MUN and MCI anyway. */
/* AAA for the scorebug, and every rung is a real abbreviation rather than a
   number stuck on the end.

     1. the first three letters of the short name        Ajax -> AJA
     2. on a collision between two-word names, the initial of the first plus
        two of the second, which is how a broadcast writes it anyway:
        Manchester United -> MUN, Manchester City -> MCI
     3. on a collision between ONE-word names, the consonant skeleton: keep
        the first letter, then drop the vowels. Genk -> GNK, Gent -> GNT
     4. and only if all of that still collides, a digit.

   Rule 3 exists because Genk and Gent both gave GEN and the loser came out
   as GE2, which looks like a bug even when it is not. A short name that is
   genuinely only two letters stays two letters: AZ is AZ, not AZX. */
function codes(names) {
  const out = {};
  /* "1. FC Heidenheim" is HEI, not 1HE: a founding number or a numbered
     prefix is not part of how a broadcast writes a club */
  const letters = n => slugify(bare(n) || n).replace(/^[0-9]+-?/, "").replace(/-/g, "").toUpperCase();
  const first = n => { const s = letters(n); return s.slice(0, Math.min(3, Math.max(2, s.length))); };
  const skeleton = n => {
    const s = letters(n);
    return (s.slice(0, 1) + s.slice(1).replace(/[AEIOU]/g, "")).slice(0, 3);
  };
  const taken = new Map();
  names.forEach(n => { const c = first(n); taken.set(c, (taken.get(c) || 0) + 1); });
  names.forEach(n => {
    let c = first(n);
    if (taken.get(c) > 1) {
      const w = (bare(n) || n).split(/\s+/).filter(Boolean);
      c = w.length >= 2 ? (w[0][0] + w[1].slice(0, 2)).toUpperCase() : skeleton(n);
      /* Jong Genk and Jong Gent both give JGE: the first and last letter of the
         club then tells them apart, JGK and JGT, before a digit is reached for */
      if (w.length >= 2 && names.some(o => o !== n && (bare(o) || o).split(/\s+/).length >= 2 &&
          ((bare(o) || o).split(/\s+/)[0][0] + (bare(o) || o).split(/\s+/)[1].slice(0, 2)).toUpperCase() === c))
        c = (w[0][0] + w[1][0] + w[1][w[1].length - 1]).toUpperCase();
    }
    let c2 = c, i = 1;
    while (Object.values(out).indexOf(c2) !== -1) c2 = c.slice(0, 2) + String(++i);
    out[n] = c2;
  });
  return out;
}

(async () => {
  const want = Object.keys(LEAGUES).filter(k => process.argv.indexOf(k) !== -1);
  const todo = want.length ? want : Object.keys(LEAGUES);
  const m = buildMatchers();
  console.log("season: " + season(startYear) + "   leagues: " + todo.join(", ") + (DRY ? "   (dry)" : ""));

  for (const id of todo) {
    const row = LEAGUES[id];
    console.log("\n=== " + row.label + " ===");
    const picked = await candidates(row);
    const cands = picked.found, fromArticle = picked.fromArticle, tableOnly = picked.tableOnly;
    console.log("    " + cands.size + " candidates, expecting " + row.teams + " real clubs");

    const clubs = {};
    const noKit = [], noCrest = [], thin = [], trims = [];
    const pages = [...cands.keys()];
    const texts = await wikitexts(pages);
    console.log("");
    const seen = new Map();          // resolved article -> the name already kept
    const cameFrom = new Map();      // display name -> the candidate page it came from
    const doubled = new Set();       // candidates that turned out to be a club already kept
    const dupes = [];
    for (const [page, display] of cands) {
      const got = texts.get(page);
      if (!got) continue;
      const w = got.text;
      if (seen.has(got.title)) { dupes.push(display + " = " + seen.get(got.title)); doubled.add(page); continue; }
      /* "Jong Genk" whose page is "KRC Genk": read the block under the heading
         that carries the reserve side's own name, never the parent's first XI */
      const disp = unlink(display).replace(/\s+/g, " ").trim();
      const shared = /^Jong /i.test(disp) && slugify(disp) !== slugify(got.title);
      const players = parseSquad(w, shared ? disp : null);
      if (players.length < 14) continue;          // not a club, or not a squad
      const xi = pickXI(players);
      if (!xi) continue;
      /* the name under the crest: what the season table called it, tidied */
      const name = unlink(display).replace(/\s+/g, " ").trim() || page;
      const key = slugify(name), keyBare = slugify(bare(name));
      /* THE CLUB'S OWN INFOBOX FIRST, and the kit bank only as a fallback.
         It was the other way round, and the kit bank lied: it reports
         #FFFFFF for Liverpool, Arsenal, Chelsea and Everton alike, because
         it was harvested for Guess the Kit where what matters is the shirt
         IMAGE and the colour field was never the point. Liverpool ran out in
         white. The club's own article carries the real thing: Liverpool
         8F1E32, Chelsea 14349B, Everton 0000ff.

         A white shirt with coloured sleeves reads better as the sleeve
         colour, which is the same rule build-squads.js uses. */
      let kit = kitFromInfobox(w);
      const hit = m.byName.get(key) || m.byName.get(keyBare) ||
                  m.byName.get(slugify(page)) || m.byName.get(slugify(bare(page)));
      if (!kit && hit) kit = hit.c;
      if (!kit) noKit.push(name);
      let crest = [hit && hit.s, key, keyBare, slugify(page), slugify(bare(page))]
        .find(s => s && m.logos.has(s)) || null;
      /* LAST RESORT, AND IT IS REPORTED. The crests are filed under the name a
         club is usually called, so "PSV Eindhoven" and "Willem II Tilburg"
         miss a bank that has psv and willem-ii. Dropping trailing words finds
         them, and it can also find the WRONG club: sparta-rotterdam trimmed to
         sparta is Prague's crest, not Rotterdam's. So every match made this
         way is printed at the end of the league for a human to look at once,
         rather than quietly believed. */
      let trimmed = null;
      if (!crest && CREST_ALIAS[key] && m.logos.has(CREST_ALIAS[key])) {
        crest = CREST_ALIAS[key];
        trimmed = key + " -> " + crest + " (spelling)";
      }
      if (!crest) {
        const byWords = crestByWords(m, name) || crestByWords(m, page);
        if (byWords) { crest = byWords; trimmed = key + " -> " + crest + " (by words)"; }
      }
      if (!crest) {
        const parts = key.split("-");
        for (let n = parts.length - 1; n >= 1 && !crest; n--) {
          const s = parts.slice(0, n).join("-");
          if (m.logos.has(s)) { crest = s; trimmed = key + " -> " + s; }
        }
      }
      if (trimmed) trims.push(name + "  (" + trimmed + ")");
      if (!crest) noCrest.push(name);
      if (players.length < 18) thin.push(name + " (" + players.length + ")");
      seen.set(got.title, name);
      cameFrom.set(name, page);
      clubs[name] = {
        kit: kit, abbr: null, flag: crest, slug: crest,
        squad: players.length, xi: xi.xi, bench: xi.bench,
      };
      process.stdout.write(".");
    }
    console.log("");
    /* More clubs than the league has means something with a real squad got
       through that is not in it this season. The article's list is the truth,
       so anything only Wikidata suggested is dropped before the count. */
    let names = Object.keys(clubs);
    if (names.length > row.teams) {
      const extra = names.filter(n => !fromArticle.has(cameFrom.get(n)));
      if (extra.length) {
        console.log("    dropped, not in the season article: " + extra.join(", "));
        extra.forEach(n => delete clubs[n]);
        names = Object.keys(clubs);
      }
    }
    const code = codes(names);
    names.forEach(n => clubs[n].abbr = code[n]);

    console.log("    clubs with an XI: " + names.length + " / " + row.teams);
    /* A club the season table lists and that never produced an eleven is the
       thing worth knowing about, because it is the difference between
       nineteen and twenty and the count alone does not say WHICH. */
    /* Only the LEAGUE TABLE's own entries are worth reporting here. The
       candidate pool also holds every ground and every kit sponsor the stadium
       table links to, and those correctly have no squad, so listing them
       buried the one line that mattered under fifty that did not. */
    const kept = new Set(cameFrom.values());
    const lost = [...fromArticle].filter(p => !kept.has(p) && !doubled.has(p) && tableOnly.has(p));
    if (lost.length) console.log("    LISTED BUT NO XI FOUND: " + lost.join(", "));
    if (dupes.length) console.log("    same club twice, kept one: " + dupes.join("; "));
    if (noKit.length) console.log("    NO KIT COLOUR (left null, not guessed): " + noKit.join(", "));
    if (noCrest.length) console.log("    NO CREST: " + noCrest.join(", "));
    if (trims.length) console.log("    CREST MATCHED BY TRIMMING, check these once: " + trims.join("; "));
    if (thin.length) console.log("    thin squads: " + thin.join(", "));
    console.log("    codes: " + names.map(n => code[n]).join(" "));
    const sample = names[0];
    if (sample) {
      console.log("    sample, " + sample + ":");
      clubs[sample].xi.forEach((p, i) =>
        console.log("      " + SHAPE[i].padEnd(3) + " #" + String(p.no).padEnd(4) + p.n + "  (" + p.full + ")"));
      console.log("      bench: " + clubs[sample].bench.map(p => p.n).join(", "));
    }

    /* REFUSE TO WRITE A DECK THAT IS KNOWN TO BE WRONG, the same rule
       build-squads.js learned the hard way when a throttled run wrote a deck
       full of nulls and invented country codes and called itself a success. */
    const problems = [];
    if (names.length !== row.teams) problems.push("found " + names.length + " clubs, the league has " + row.teams);
    for (const n of names) {
      const v = clubs[n];
      /* A NULL KIT IS NOT A FAILURE, it is the honest answer.
         The clubs that come back empty have body1= with nothing in it and a
         pattern_b1 pointing at a Commons image, because their home shirt is a
         pattern rather than a colour: white with a green sash, black and white
         stripes. Guessing was tried and it lied. Taking the dominant colour of
         the crest makes Leeds yellow and Real Madrid gold, when both play in
         white, so it is not a shirt colour at all, it is a badge colour. The
         app already falls back to home red and away blue per SIDE, which is
         always legible on a pitch, so a null here costs character and never
         correctness. Reported, not fatal. */
      if (!v.xi || v.xi.length !== 11) problems.push(n + ": not eleven men");
      if (!/^[A-Z0-9]{2,3}$/.test(v.abbr || "")) problems.push(n + ": '" + v.abbr + "' is not a code");
    }
    if (DRY) {
      console.log("    --dry, nothing written" + (problems.length ? "  (" + problems.length + " problem(s))" : ""));
      problems.slice(0, 8).forEach(p => console.log("      " + p));
      continue;
    }
    if (problems.length && !FORCE) {
      console.log("    NOT WRITING. " + problems.length + " problem(s):");
      problems.slice(0, 10).forEach(p => console.log("      " + p));
      console.log("    Most likely a rate limit, or a season article mid-edit. --force writes it anyway.");
      process.exitCode = 1;
      continue;
    }
    const out = path.join(REPO, "assets", row.dir, "clubs.json");
    fs.mkdirSync(path.dirname(out), {recursive: true});
    fs.writeFileSync(out, JSON.stringify(clubs));
    console.log("    wrote " + path.relative(REPO, out) + "  (" + (fs.statSync(out).size / 1024).toFixed(1) + " KB)");
  }
})().catch(e => { console.error("FAILED: " + e.message); process.exit(1); });
