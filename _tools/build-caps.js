/* Who has more caps: the bank behind the mode.
 *
 *     node _tools/build-caps.js [--dry]
 *
 * Two men, two album cards, and you tap the one with more appearances for his
 * country. So the bank needs exactly two things per player that the app does
 * not already have: a CAREER cap total, and a card to draw him on.
 *
 * WHY THE CAPS CANNOT COME OUT OF THE POOLS, which is where they look like they
 * already are. Every squad file carries caps per man and every one of them is a
 * number AT THAT TOURNAMENT: van der Sar is 116 in the 2006 book and finished on
 * 130. Asking "who has more caps" off those is asking a different question with
 * the same words, and the answer would flip depending on which summer each man
 * happened to be drawn from. Taking the largest across the sixteen books is the
 * tempting shortcut and it is worse, because it is silently wrong for everybody
 * whose last cap came after his last tournament, which is most of them.
 *
 * SO THE TOTALS COME OFF ONE PAGE THAT IS ABOUT EXACTLY THIS. Wikipedia's list
 * of men's footballers with 100 or more international caps is curated, sourced
 * to FIFA's own records, and gives the player, his country and his total in one
 * row. One fetch, no per-player article resolution, and therefore none of the
 * wrong-man risk that comes with it: this repo has been bitten by searching for
 * "Raul" and getting Raul Albiol, and BALL 1's own Older or Taller bank shipped
 * thirteen rows that were a different person entirely. A table that names the
 * country beside the player cannot make that mistake.
 *
 * The cost of that choice is that the bank stops at 100 caps. That is a feature
 * here rather than a limit: a hundred-cap international is a man somebody at the
 * table has heard of, and the whole range lands between 100 and 233, which is
 * what makes two of them worth comparing.
 *
 * A CARD MEANS A POOL. A player is only in the bank if he is in one of the
 * sixteen tournament squads, because the card drawn for him is the album's own
 * sticker: his kit, his number, his flag and his surname. Where a man appears in
 * several books he is taken from his LAST one, which is the shirt he is
 * remembered in and the total he actually finished near.
 */
const fs = require("fs");
const path = require("path");
const https = require("https");

const REPO = path.join(__dirname, "..");
const CACHE = path.join(__dirname, "_models");
const OUT = path.join(REPO, "assets", "caps", "index.json");
const DRY = process.argv.includes("--dry");
const UA = "BALL3-quiz-build/1.0 (https://github.com/Beebzoo/football-quiz-3; personal hobby project)";
const PAGE = "List of men's footballers with 100 or more international caps";

/* the gap that makes a pair worth asking. Below the floor nobody can know and
   it is a coin toss, which is the rule BALL 1's duel bank already carries about
   two years and three centimetres; above the ceiling it stops being a question.
   Both are enforced in the app, and reported here so a bank that cannot fill
   them is caught at build time rather than at the table.

   THE FLOOR IS TWO AND NOT THREE, and van der Sar settled it. He finished on
   130 and Neuer on 128, which is the pair this mode was asked for by name, and
   a floor of three throws it straight out. Caps are not height: a hundred and
   thirty is a number somebody has actually read, so two apart is a question
   people argue about rather than a coin toss. One apart is the coin toss, and
   a dead heat has no answer at all. */
const GAP_MIN = 2, GAP_MAX = 30;

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
async function wikitext(title) {
  fs.mkdirSync(CACHE, {recursive: true});
  const f = path.join(CACHE, "caps_" + title.replace(/[^A-Za-z0-9]+/g, "_").slice(0, 80) + ".txt");
  if (fs.existsSync(f) && fs.statSync(f).size > 1000) return fs.readFileSync(f, "utf8");
  const j = JSON.parse(await once("https://en.wikipedia.org/w/api.php?action=parse&prop=wikitext" +
    "&format=json&formatversion=2&redirects=1&page=" + encodeURIComponent(title)));
  const wt = (j.parse && j.parse.wikitext) || "";
  fs.writeFileSync(f, wt);
  return wt;
}

/* ---------- reading one row of a wikitable ----------
   THE ATTRIBUTES COME OFF WITH A PATTERN, NOT WITH THE LAST PIPE. Taking
   everything after the final | in a cell is the obvious way and it quietly ate
   the top of the table: the nation cell is written

       | bgcolor="FFD966" | {{fb|POR}}

   and the last pipe in that string is the one INSIDE the template, so the cell
   came back as "POR}}" and matched nothing. It failed on precisely the rows
   that are highlighted, which is the most-capped player of each confederation,
   so Ronaldo, Messi and Modric were the four missing and everybody else looked
   perfect. A leading run of name=value pairs followed by a pipe is what an
   attribute block actually is, so that is what gets stripped. */
const ATTRS = /^\s*(?:[a-zA-Z-]+\s*=\s*(?:"[^"]*"|'[^']*'|[^|\s]+)\s*)+\|/;
function cells(row) {
  return row.split(/\n[|!]|\|\|/).slice(1).map(p => {
    const rs = p.match(/rowspan\s*=\s*"?(\d+)"?/i);
    return {text: p.replace(ATTRS, "").trim(), rowspan: rs ? +rs[1] : 1};
  });
}
/* ROWSPANS CARRY DOWN OR EVERY COLUMN AFTER THEM SHIFTS. Two players tied on
   caps share one rank cell and one caps cell, and the second of them has five
   cells where the table has seven. build-special.js records the same lesson
   about national team records tables, where a tie read Depay's debut year as
   his number of caps. */
function table(wt, cols) {
  const start = wt.indexOf('{| class="wikitable sortable sticky-header"');
  if (start < 0) return [];
  const end = wt.indexOf("\n|}", start);
  const rows = wt.slice(start, end < 0 ? wt.length : end).split(/\n\|-/).slice(1);
  const pending = {};
  const out = [];
  for (const r of rows) {
    const cs = cells(r);
    if (!cs.length) continue;
    const row = [];
    let ci = 0, ptr = 0;
    while (ci < cols) {
      if (pending[ci] && pending[ci].left > 0) { row[ci] = pending[ci].v; pending[ci].left--; ci++; continue; }
      const c = cs[ptr++];
      if (c === undefined) break;
      row[ci] = c.text;
      if (c.rowspan > 1) pending[ci] = {v: c.text, left: c.rowspan - 1};
      ci++;
    }
    out.push(row);
  }
  return out;
}

const fold = s => String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
  .replace(/[^a-z ]/g, " ").replace(/\s+/g, " ").trim();

(async () => {
  const wt = await wikitext(PAGE);
  console.log("the list: " + (wt.length / 1024).toFixed(0) + "KB");

  /* Rank, Player, Nation, Confederation, Caps, Debut, Latest */
  const rows = table(wt, 7);
  const listed = [];
  for (const r of rows) {
    const nm = (r[1] || "").match(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/);
    const nat = (r[2] || "").match(/\{\{fb\|([A-Za-z]{3})\}\}/);
    const caps = (r[4] || "").replace(/[^0-9]/g, "");
    if (!nm || !nat || !caps) continue;
    listed.push({page: nm[1], name: nm[2] || nm[1], nat: nat[1].toUpperCase(), caps: +caps});
  }
  console.log(listed.length + " players with 100 or more caps");
  if (listed.length < 400) { console.error("FAILED: that is far short of the list, the table shape has moved"); process.exit(1); }
  const top = listed.slice().sort((a, b) => b.caps - a.caps)[0];
  console.log("  the most capped of them: " + top.name + " " + top.nat + " " + top.caps);

  /* ---------- who has a card ----------
     The books in order, so a man who played four of them is taken from the last,
     which is the shirt he is remembered in. */
  const books = fs.readdirSync(path.join(REPO, "assets"))
    .filter(d => /^(wc|euro)\d{4}$/.test(d))
    .map(d => ({id: d, year: +d.replace(/\D/g, "")}))
    .sort((a, b) => a.year - b.year);
  const men = new Map();
  for (const b of books) {
    const f = path.join(REPO, "assets", b.id, "index.json");
    if (!fs.existsSync(f)) continue;
    const j = JSON.parse(fs.readFileSync(f, "utf8"));
    for (const [side, t] of Object.entries(j))
      for (const m of (t.xi || []).concat(t.bench || []))
        if (m.full) men.set(fold(m.full), {pool: b.id, side: side, full: m.full, n: m.n});
  }
  console.log(men.size + " distinct men across " + books.length + " books");

  const bank = [];
  const noCard = [];
  for (const p of listed) {
    const hit = men.get(fold(p.name)) || men.get(fold(p.page));
    if (!hit) { noCard.push(p.name); continue; }
    bank.push({n: hit.n, full: hit.full, pool: hit.pool, side: hit.side, nat: p.nat, caps: p.caps});
  }
  bank.sort((a, b) => b.caps - a.caps);
  console.log(bank.length + " of them have a card, " + noCard.length + " do not");
  console.log("  no card, e.g.: " + noCard.slice(0, 6).join(", "));
  console.log("  the bank runs " + bank[bank.length - 1].caps + " to " + bank[0].caps + " caps");
  console.log("  top five: " + bank.slice(0, 5).map(p => p.n + " " + p.caps).join(", "));

  /* ---------- can it actually deal a pair? ----------
     The number that matters is not how many players there are, it is how many
     PAIRS fall in the band the mode will ask for. A bank of four hundred men
     who are all on a hundred and one caps deals nothing. */
  let ok = 0;
  for (let i = 0; i < bank.length; i++)
    for (let j = i + 1; j < bank.length; j++) {
      const g = Math.abs(bank[i].caps - bank[j].caps);
      if (g >= GAP_MIN && g <= GAP_MAX) ok++;
    }
  const all = bank.length * (bank.length - 1) / 2;
  console.log("  playable pairs: " + ok.toLocaleString("en-GB") + " of " + all.toLocaleString("en-GB") +
    " (" + (ok / all * 100).toFixed(1) + "% land in the " + GAP_MIN + " to " + GAP_MAX + " cap band)");
  /* every man has to be usable with somebody, or he is a card that can be drawn
     and never asked */
  const lonely = bank.filter(p => !bank.some(q => q !== p &&
    Math.abs(p.caps - q.caps) >= GAP_MIN && Math.abs(p.caps - q.caps) <= GAP_MAX));
  if (lonely.length) console.log("  NO PARTNER IN THE BAND: " + lonely.map(p => p.n + " " + p.caps).join(", "));

  const byNat = {};
  bank.forEach(p => byNat[p.nat] = (byNat[p.nat] || 0) + 1);
  console.log("  " + Object.keys(byNat).length + " countries, commonest " +
    Object.entries(byNat).sort((a, b) => b[1] - a[1]).slice(0, 5).map(e => e[0] + " " + e[1]).join(", "));

  if (DRY) { console.log("\n--dry, nothing written"); return; }
  fs.mkdirSync(path.dirname(OUT), {recursive: true});
  fs.writeFileSync(OUT, JSON.stringify(bank));
  console.log("wrote " + path.relative(REPO, OUT) + "  (" + (fs.statSync(OUT).size / 1024).toFixed(1) + " KB)");
  console.log("now run: node _tools/sw-clubs.js");
})();
