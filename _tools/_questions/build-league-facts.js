/* League questions harvested from the season articles, not written from memory.
 *
 *     node _tools/_questions/build-league-facts.js <league> [--from=1995] [--write]
 *
 * WHY THIS EXISTS. The first hundred league questions here were written out of
 * my own head and checked afterwards, and two things went wrong with that.
 * Twelve of them turned out to be rewordings of questions the Classic bank
 * already ships, because the Classic bank already carries 837 Premier League
 * rows and 706 La Liga ones. And the further down a league you write, which is
 * exactly where a league deck earns its place, the less reliable anybody's
 * recall is. A half-remembered second-placed side is not a small error in this
 * app: on the pitch a wrong question decides a pass.
 *
 * So the backbone is harvested. Every season article carries its final table as
 * a machine-readable template:
 *
 *   |win_LEI=23|draw_LEI=12|loss_LEI=3|gf_LEI=68|ga_LEI=36
 *   |status_LEI=C   |status_AST=R
 *   |name_LEI=[[Leicester City F.C.|Leicester City]]
 *
 * Points are computed, the table is sorted, and the questions fall out of it:
 * champions, runners-up, third, who went down, the best attack, the meanest
 * defence. The top scorers table beside it gives the golden boot and his club.
 *
 * These are CORRECT BY CONSTRUCTION rather than corroborated after the fact,
 * which is a different and much stronger thing than what check-league.js does.
 * They are written straight out as checked-*.json with verdict ok, and the
 * `src` on every row is the article the numbers were read from.
 *
 * WHAT IT DELIBERATELY DOES NOT DO is the BALL tier. A story is not in a table,
 * and "which club finished third in 2009-10" is not a BALL question however
 * obscure it is. Those stay hand-written, which is affordable because there are
 * far fewer of them.
 */
const fs = require("fs");
const path = require("path");
const https = require("https");

const HERE = __dirname;
const REPO = path.resolve(HERE, "..", "..");
const CACHE = path.join(HERE, "_cache");
const UA = "BALL2-quiz-build/1.0 (https://github.com/Beebzoo/football-quiz-2; personal hobby project)";

/* Article titles move about: the Premier League was the FA Premier League for
   its first few years, and the Belgian top flight has been renamed twice. Each
   league lists the forms to try, in order, and the first that loads wins. */
const LEAGUES = {
  premier:    {dir: "premier",    label: "Premier League", from: 1992,
               titles: y => [sn(y) + " Premier League", sn(y) + " FA Premier League"]},
  laliga:     {dir: "laliga",     label: "La Liga", from: 1995,
               titles: y => [sn(y) + " La Liga"]},
  bundesliga: {dir: "bundesliga", label: "Bundesliga", from: 1995,
               titles: y => [sn(y) + " Bundesliga"]},
  seriea:     {dir: "seriea",     label: "Serie A", from: 1995,
               titles: y => [sn(y) + " Serie A"]},
  belgian:    {dir: "belgian",    label: "Belgian Pro League", from: 2000,
               titles: y => [sn(y) + " Belgian Pro League", sn(y) + " Belgian First Division A",
                             sn(y) + " Belgian First Division"]},
  /* THE SECOND DIVISIONS. Same harvest; the only thing that differs is the
     names the article has worn. England's second tier was the First Division
     from 1992 to 2004 and the Championship since, with the sponsor prefix
     changing in 2016; Belgium's was the Second Division until 2016, First
     Division B until 2022 and the Challenger Pro League since. The LABEL is
     what the question says out loud, and it is the name the division has NOW,
     because "the 1998-99 Championship" is what a reader would say even though
     nobody called it that at the time. */
  champ:      {second: true, dir: "championship", label: "Championship", from: 1992,
               titles: y => [sn(y) + " EFL Championship", sn(y) + " Football League Championship",
                             sn(y) + " Football League First Division"]},
  segunda:    {second: true, dir: "segunda",      label: "Segunda División", from: 1995,
               titles: y => [sn(y) + " Segunda División"]},
  bundesliga2:{second: true, dir: "bundesliga2",  label: "2. Bundesliga", from: 1995,
               titles: y => [sn(y) + " 2. Bundesliga"]},
  serieb:     {second: true, dir: "serieb",       label: "Serie B", from: 1995,
               titles: y => [sn(y) + " Serie B"]},
  challenger: {second: true, dir: "challenger",   label: "Challenger Pro League", from: 2000,
               titles: y => [sn(y) + " Challenger Pro League", sn(y) + " Belgian First Division B",
                             sn(y) + " Belgian Second Division"]},
  eerste:     {second: true, dir: "eerste",       label: "Eerste Divisie", from: 1995,
               titles: y => [sn(y) + " Eerste Divisie"]},
};
/* en dash, as Wikipedia writes it; and the turn of the century is written out in
   full there ("1999–2000 FA Premier League"), which is the one season every
   league was missing until this said so */
function sn(y) { return y + "–" + (y % 100 === 99 ? String(y + 1) : String(y + 1).slice(2)); }
const say = y => y + "-" + String(y + 1).slice(2);               // hyphen, as the reader says it

const args = process.argv.slice(2);
const id = args.find(a => LEAGUES[a]);
if (!id) { console.error("which league? " + Object.keys(LEAGUES).join(" | ")); process.exit(1); }
const row = LEAGUES[id];
const WRITE = args.includes("--write");
const argOf = (k, d) => { const h = args.find(a => a.indexOf("--" + k + "=") === 0); return h ? h.split("=")[1] : d; };
const FROM = Number(argOf("from", row.from));
const TO = Number(argOf("to", new Date().getFullYear() - 1));

/* ---------- fetching, politely and once ---------- */
const sleep = ms => new Promise(r => setTimeout(r, ms));
let last = 0;
function once(url) {
  return new Promise((res, rej) => {
    https.get(url, {headers: {"User-Agent": UA}}, r => {
      if (r.statusCode >= 300 && r.statusCode < 400 && r.headers.location) return res(once(r.headers.location));
      if (r.statusCode !== 200) { r.resume(); return rej(new Error("HTTP " + r.statusCode)); }
      let b = ""; r.setEncoding("utf8");
      r.on("data", d => b += d); r.on("end", () => res(b));
    }).on("error", rej);
  });
}
const key = t => t.replace(/[^A-Za-z0-9]+/g, "_").slice(0, 120);
async function wikitext(title) {
  fs.mkdirSync(CACHE, {recursive: true});
  const f = path.join(CACHE, "wt_" + key(title) + ".txt");
  if (fs.existsSync(f)) return fs.readFileSync(f, "utf8");
  const wait = 400 - (Date.now() - last);
  if (wait > 0) await sleep(wait);
  last = Date.now();
  try {
    const j = JSON.parse(await once("https://en.wikipedia.org/w/api.php?action=parse&prop=wikitext" +
      "&format=json&formatversion=2&redirects=1&page=" + encodeURIComponent(title)));
    const wt = (j.parse && j.parse.wikitext) || "";
    fs.writeFileSync(f, wt);
    return wt;
  } catch (e) { fs.writeFileSync(f, ""); return ""; }
}

/* ---------- the final table, computed from the article's own numbers ---------- */
const unlink = t => String(t)
  .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, "$2").replace(/\[\[([^\]]+)\]\]/g, "$1")
  .replace(/\{\{(?:nowrap|nobr|sortname)\|([^}]*)\}\}/gi, "$1")
  .replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

/* EVERY STANDINGS TABLE ON THE PAGE, AND THEN THE RIGHT ONE OF THEM.
   This used to read the whole article in one go, which is correct for a league
   that prints one table and quietly wrong for every league that does not. The
   Eerste Divisie prints its standings and then FOUR PERIOD TABLES in the same
   template, and because a later name_XXX simply overwrote an earlier one, what
   came back was period four: twenty clubs, nine games each, wearing a season's
   clothes.

   The positional questions survived that by accident. trustOrder refuses to
   believe a sort whose top is not the marked champion, and a period winner
   never is, so second and third were never emitted. The RECORDS questions did
   not survive: goals for and against are a plain count and looked perfectly
   trustworthy from here, so "which club scored the most goals in the 2008-09
   Eerste Divisie" was answered with the best attack of an eight-game period.

   So each {{#invoke:Sports table}} is parsed on its own, and the season table
   is the one whose clubs have played the most football. A period table and a
   play-off table both lose that comparison on the same rule, which is why the
   test is games played rather than the heading above it: headings are in six
   languages and arithmetic is not. */
function parseTables(wt) {
  const RX = /\{\{\s*#invoke:\s*Sports table/gi;
  const at = [];
  let m;
  while ((m = RX.exec(wt))) at.push(m.index);
  /* an older article writes the parameters bare, with no invoke, and is one
     table by construction */
  const blocks = at.length
    ? at.map((start, i) => wt.slice(start, at[i + 1] === undefined ? wt.length : at[i + 1]))
    : [wt];
  return blocks.map(parseOne).filter(Boolean);
}
function parseTable(wt) {
  const tables = parseTables(wt);
  if (!tables.length) return null;
  /* the median rather than the total, so one club with a game in hand cannot
     decide which table is the season */
  const games = t => t.map(r => r.w + r.d + r.l).sort((a, b) => a - b)[Math.floor(t.length / 2)];
  return tables.slice().sort((a, b) => games(b) - games(a))[0];
}
function parseOne(wt) {
  const get = re => { const out = {}; let m; const r = new RegExp(re, "g");
    while ((m = r.exec(wt))) out[m[1]] = m[2]; return out; };
  const win  = get("\\|\\s*win_([A-Za-z0-9]+)\\s*=\\s*(\\d+)");
  const draw = get("\\|\\s*draw_([A-Za-z0-9]+)\\s*=\\s*(\\d+)");
  const loss = get("\\|\\s*loss_([A-Za-z0-9]+)\\s*=\\s*(\\d+)");
  const gf   = get("\\|\\s*gf_([A-Za-z0-9]+)\\s*=\\s*(\\d+)");
  const ga   = get("\\|\\s*ga_([A-Za-z0-9]+)\\s*=\\s*(\\d+)");
  const name = get("\\|\\s*name_([A-Za-z0-9]+)\\s*=\\s*(.+)");
  const status = get("\\|\\s*status_([A-Za-z0-9]+)\\s*=\\s*([A-Za-z]+)");
  const codes = Object.keys(win).filter(c => name[c] !== undefined && draw[c] !== undefined && loss[c] !== undefined);
  if (codes.length < 10) return null;
  const rows = codes.map(c => ({
    code: c, name: unlink(name[c]),
    w: +win[c], d: +draw[c], l: +loss[c], gf: +gf[c] || 0, ga: +ga[c] || 0,
    status: (status[c] || "").toUpperCase(),
  }));
  /* three points a win throughout the window these decks cover */
  rows.forEach(r => { r.pts = r.w * 3 + r.d; r.gd = r.gf - r.ga; });
  rows.sort((a, b) => b.pts - a.pts || b.gd - a.gd || b.gf - a.gf);
  return rows;
}

/* ---------- the golden boot ----------
   ROW BY ROW, not by one big pattern. The first version insisted on
   align="left" with its quotes and its spacing exactly as the 2015-16 article
   writes it, and four seasons out of six wrote it differently: some use
   sortable tables, some put a photograph between the heading and the table,
   some drop the quotes. Splitting the table on its own row separator and
   taking the first link and the next plain cell out of each row does not care
   about any of that. */
function parseScorers(wt) {
  const i = wt.search(/={3,4}\s*Top scorers?\s*={3,4}/i);
  if (i < 0) return null;
  let block = wt.slice(i, i + 6000);
  const close = block.indexOf("\n|}");
  if (close > 0) block = block.slice(0, close);
  const rows = [];
  let goals = null;
  for (const chunk of block.split(/\n\|-/)) {
    /* A CITATION IS NOT A FOOTBALLER. The goals column carries a <ref> naming
       the source, and the 2018-19 Bundesliga's happens to link the magazine
       kicker, so the first link in that row was read as the man who scored
       twenty-two. Anything inside a reference is dropped before looking. */
    const clean = chunk.replace(/<ref[\s\S]*?<\/ref>/gi, " ").replace(/<ref[^>]*\/>/gi, " ");
    const link = clean.match(/\[\[([^\]]+)\]\]/);
    if (!link) continue;
    const player = unlink("[[" + link[1] + "]]");
    if (/^File:|^Image:|^Category:/i.test(link[1])) continue;
    /* the club is the next cell that is plain text rather than a link or a
       number, which is how these tables are laid out either way round */
    const cells = clean.split(/\n\|/).map(c => c.replace(/^\s*align\s*=\s*"?left"?\s*\|?/i, "").trim());
    const club = cells.find(c => c && !/\[\[|^\d+$|^rowspan|^!/.test(c) && c.length > 2 && c.length < 40);
    const n = clean.match(/(?:^|\n)\|\s*(?:rowspan="\d+"\s*\|\s*)?(\d{2})\s*(?:\n|$)/);
    if (n && goals === null) goals = +n[1];
    rows.push({player: player, club: club ? unlink(club) : null});
    if (rows.length >= 6) break;
  }
  if (!rows.length) return null;
  return {top: rows[0], second: rows[1] || null, goals: goals};
}

/* ---------- turning a table into questions ---------- */
const L = row.label;
function questions(season, title, table, scorers) {
  const src = "https://en.wikipedia.org/wiki/" + encodeURIComponent(title.replace(/ /g, "_"));
  const s = say(season);
  const out = [];
  const add = (tier, cat, q, a, sub) => {
    const r = {tier: tier, cat: cat, q: q, a: a, src: src, conf: "sure", verdict: "ok",
               note: "harvested from the season table"};
    if (sub) r.sub = sub;
    out.push(r);
  };
  /* THE ARTICLE'S OWN CHAMPION MARKER BEATS MY SORT, and where they disagree
     nothing positional is emitted at all.

     Sorting the table by points and taking the top of it produced the wrong
     champion for every Belgian season, because that league plays Champions'
     play-offs after the regular season with the points halved: the regular
     table had Gent top in 2023-24 and the title went to Club Brugge, which the
     article says plainly with status_CLU=C. A harvester that reads the numbers
     and ignores the label is not more rigorous than writing from memory, it is
     just confidently wrong in a new way.

     So the marker is the answer. And if the marker and the sort disagree, this
     table is not the final standings, so second and third are not second and
     third either and no positional question comes out of that season. */
  const marked = table.filter(r => r.status.indexOf("C") !== -1);
  const champ = marked.length === 1 ? marked[0] : null;
  const trustOrder = !!champ && table[0] && champ.code === table[0].code;
  const second = trustOrder ? table[1] : null;
  const third = trustOrder ? table[2] : null;
  const down = table.filter(r => r.status.indexOf("R") !== -1).map(r => r.name);

  /* AGE IS DIFFICULTY, which is both true and the only way these come out
     spread across the tiers instead of piling into extreme. Who won it last
     season is a question anyone watching answers; who came third in 1997-98
     is not. The cut is ten years, and everything shifts one rung behind it. */
  const old = (new Date().getFullYear() - season) > 10;
  const step = (a, b) => old ? b : a;
  /* A SECOND DIVISION IS A RUNG HARDER ON ITS PEOPLE. Who won the Championship
     last season is a question anybody watching answers, the same as the top
     flight; who top scored in it is not, because the man is on Match of the
     Day only once he has gone up. So the scorer rows of a second tier step up
     one, and the club rows stay where they are. */
  const ORDER = ["easy", "normal", "hard", "extreme"];
  const up = t => row.second ? ORDER[Math.min(ORDER.length - 1, ORDER.indexOf(t) + 1)] : t;

  if (champ) add(step("easy", "normal"), "champions", "Which club won the " + s + " " + L + "?", champ.name);
  if (second) add(step("normal", "hard"), "champions", "Which club finished second in the " + s + " " + L + "?", second.name);
  if (third) add(step("hard", "extreme"), "champions", "Which club finished third in the " + s + " " + L + "?", third.name);
  if (champ && second && champ.pts === second.pts) {
    add("extreme", "champions", "The " + s + " " + L + " was decided on goal difference. Which club took it?", champ.name);
  }
  if (down.length && down.length <= 4) {
    add(step("hard", "extreme"), "relegation", "Which clubs went down from the " + L + " in " + s + "?", down.join(", "));
  }
  /* WHO WENT UP, WHICH IS WHAT A SECOND DIVISION IS FOR. This harvester was
     written for the top flight, where there is no such row, so it read C and R
     and walked straight past the one status that matters most down here. P is
     promoted, CP is promoted as champions, OP is up through the play-offs, and
     every one of them carries a P.

     Checked against 2015-16 rather than assumed: the article marks Burnley CP,
     Middlesbrough P and Hull City OP, which is exactly who went up and exactly
     how each of them did it. */
  const gone = table.filter(r => /P/.test(r.status)).map(r => r.name);
  if (gone.length >= 2 && gone.length <= 4) {
    add(step("normal", "hard"), "champions", "Which clubs went up from the " + L + " in " + s + "?", gone.join(", "));
  }
  /* THROUGH THE PLAY-OFFS, and only when exactly one club came that way.
     England sends one up through the richest match in football and the question
     asks itself; the Netherlands has sent two and three up through play-offs in
     the same season, and "which club" with three right answers is not a
     question. */
  const viaPo = table.filter(r => r.status.indexOf("OP") !== -1);
  if (viaPo.length === 1) {
    add(step("hard", "extreme"), "champions",
      "Which club came up through the " + L + " play-offs in " + s + "?", viaPo[0].name);
  }
  /* The best attack and the meanest defence, off the season table now that
     there is only one of those to read. Skipped when the answer is the
     champion, because "who scored the most" answered by the side that won it
     is not a question. */
  const mostGf = table.slice().sort((a, b) => b.gf - a.gf)[0];
  const leastGa = table.slice().sort((a, b) => a.ga - b.ga)[0];
  if (mostGf && champ && mostGf.code !== champ.code)
    add("extreme", "records", "Which club scored the most goals in the " + s + " " + L + "?", mostGf.name);
  if (leastGa && champ && leastGa.code !== champ.code)
    add("extreme", "records", "Which club conceded the fewest goals in the " + s + " " + L + "?", leastGa.name);

  if (scorers && scorers.top) {
    add(up(step("easy", "normal")), "scorers", "Who was the top scorer in the " + s + " " + L + "?", scorers.top.player,
        scorers.goals ? "He got " + scorers.goals + " of them." : null);
    if (scorers.top.club && scorers.top.club.length > 2 && scorers.top.club.length < 40)
      add(up(step("normal", "hard")), "scorers", "Which club was " + scorers.top.player + " playing for when he top scored in the " + s + " " + L + "?",
          scorers.top.club);
  }
  return out;
}

(async () => {
  const SRCDIR = path.join(HERE, row.dir);
  fs.mkdirSync(SRCDIR, {recursive: true});
  console.log(row.label + ": seasons " + say(FROM) + " to " + say(TO));
  const all = [];
  let seasons = 0, missed = [];
  for (let y = FROM; y <= TO; y++) {
    let wt = "", title = "";
    for (const t of row.titles(y)) { wt = await wikitext(t); if (wt) { title = t; break; } }
    if (!wt) { missed.push(say(y)); continue; }
    let table = parseTable(wt);
    if (!table) {
      /* some leagues keep the table in a template of its own */
      const tpl = await wikitext("Template:" + title + " table");
      if (tpl) table = parseTable(tpl);
    }
    if (!table) { missed.push(say(y) + " (no table)"); continue; }
    const scorers = parseScorers(wt);
    const qs = questions(y, title, table, scorers);
    all.push(...qs);
    seasons++;
    process.stdout.write(".");
  }
  console.log("");
  console.log("  " + seasons + " seasons read, " + all.length + " questions harvested");
  if (missed.length) console.log("  no table for: " + missed.join(", "));
  const byTier = {};
  all.forEach(q => byTier[q.tier] = (byTier[q.tier] || 0) + 1);
  console.log("  per tier: " + Object.entries(byTier).map(e => e[0] + " " + e[1]).join(" / "));
  console.log("  sample:");
  all.slice(0, 6).forEach(q => console.log("    [" + q.tier.padEnd(7) + "] " + q.q + "  ->  " + q.a));

  if (!WRITE) { console.log("\n  dry run, add --write"); return; }
  const dest = path.join(SRCDIR, "checked-facts.json");
  fs.writeFileSync(dest, JSON.stringify(all, null, 1));
  console.log("  wrote " + path.relative(REPO, dest) + "  (" + all.length + " rows)");
})();
