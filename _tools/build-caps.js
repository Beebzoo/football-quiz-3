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
const { fameFor } = require("./pageviews");

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
/* THE FLOOR WENT FROM TWO TO FIVE on 3 Oct 2026, because the man who asked for
   van der Sar against Neuer played it for a fortnight and said two apart is too
   hard. He was right and the argument above was wrong about who the table is:
   a hundred and thirty is a number somebody has READ, but 130 against 128 is a
   number somebody has to have read twice. Five is the first gap where knowing
   the men is enough. The ceiling stays: thirty apart is a question anybody can
   answer and the band above it is not a question at all. */
const GAP_MIN = 5, GAP_MAX = 30;

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
  /* EVERY MAN OF THAT NAME, not the last one. This used to key on the name
     alone and take the most recent book, and the header of this file says a
     list that names the country beside the player cannot pick the wrong man.
     It cannot; the matching could, and did: Uruguay's Luis Suárez was handed
     the card of Colombia's Luis Suárez from the 2026 squad, Egypt's Ahmed Fathy
     a Qatari's, Costa Rica's Marín a Chilean's, the UAE's Khalil a Tunisian's.
     Four men in the bank the mode shipped with were somebody else, which is
     the exact failure the Older or Taller bank had and this one was built to
     avoid. The list's nation now has to agree with the card's side, and a
     name with no agreeing card is a man with no card rather than a guess. */
  const men = new Map();
  for (const b of books) {
    const f = path.join(REPO, "assets", b.id, "index.json");
    if (!fs.existsSync(f)) continue;
    const j = JSON.parse(fs.readFileSync(f, "utf8"));
    for (const [side, t] of Object.entries(j))
      for (const m of (t.xi || []).concat(t.bench || []))
        if (m.full) {
          const k = fold(m.full);
          if (!men.has(k)) men.set(k, []);
          men.get(k).push({pool: b.id, side: side, full: m.full, n: m.n, abbr: (t.abbr || "").toUpperCase(), year: b.year});
        }
  }
  console.log(men.size + " distinct names across " + books.length + " books");

  /* the list writes a man's country as it was when he played it, the pool as
     it is now: West Germany is Germany, Serbia and Montenegro is Serbia */
  const SAME = {FRG: "GER", GDR: "GER", SCG: "SRB", YUG: "SRB", TCH: "CZE", URS: "RUS", CIS: "RUS",
                CHL: "CHI", QTR: "QAT", DRC: "COD", ZAI: "COD", LAT: "LVA", HOL: "NED", ROM: "ROU"};
  const same = (a, b) => (SAME[a] || a) === (SAME[b] || b);
  const bank = [];
  const noCard = [], wrongMan = [];
  for (const p of listed) {
    const cands = men.get(fold(p.name)) || men.get(fold(p.page)) || [];
    if (!cands.length) { noCard.push(p.name); continue; }
    const ok = cands.filter(c => same(c.abbr, p.nat)).sort((a, b) => b.year - a.year);
    if (!ok.length) { wrongMan.push(p.name + " (" + p.nat + ", card says " + [...new Set(cands.map(c => c.abbr))].join("/") + ")"); continue; }
    const hit = ok[0];
    bank.push({n: hit.n, full: hit.full, pool: hit.pool, side: hit.side, nat: p.nat, abbr: hit.abbr, caps: p.caps, page: p.page});
  }
  if (wrongMan.length) console.log("  a card of the same name for a DIFFERENT nation, left out: " + wrongMan.join("; "));
  bank.sort((a, b) => b.caps - a.caps);
  console.log(bank.length + " of them have a card, " + noCard.length + " do not");
  console.log("  no card, e.g.: " + noCard.slice(0, 6).join(", "));
  console.log("  the bank runs " + bank[bank.length - 1].caps + " to " + bank[0].caps + " caps");
  console.log("  top five: " + bank.slice(0, 5).map(p => p.n + " " + p.caps).join(", "));

  /* ---------- would anyone know him ----------
     The hundred-cap list is honest about who has played a hundred times and
     silent about who anybody has heard of, and those are different lists: it
     is full of Saudis, Qataris and Central Americans who got there on regional
     tournaments and friendlies, and the table asked for fewer of them. A year
     of English pageviews per man rides on the row, so the app can keep the
     least-known quarter on the shelf and lean the draw toward the rest. It is
     deliberately NOT filtered here: the row order is what the app's used-list
     indexes, so the file keeps everybody in caps order and the floor lives in
     the app where it can move without renumbering anything. */
  const fame = await fameFor(bank.map(p => p.page), {ua: UA, log: s => console.log("  " + s)});
  for (const p of bank) { p.fame = fame.get(p.page) || 0; delete p.page; }
  const sorted = bank.map(p => p.fame).sort((a, b) => a - b);
  const q = f => sorted[Math.floor(f * (sorted.length - 1))];
  console.log("  fame quartiles (views in 2025): " + [0, .25, .5, .75, 1].map(f => q(f).toLocaleString("en-GB")).join(" / "));
  const dim = bank.slice().sort((a, b) => a.fame - b.fame);
  console.log("  least known: " + dim.slice(0, 8).map(p => p.n + " " + p.nat + " " + p.fame).join(", "));
  const quarter = dim.slice(0, Math.floor(dim.length / 4));
  const qNat = {};
  quarter.forEach(p => qNat[p.nat] = (qNat[p.nat] || 0) + 1);
  console.log("  the least-known quarter is mostly: " +
    Object.entries(qNat).sort((a, b) => b[1] - a[1]).slice(0, 6).map(e => e[0] + " " + e[1]).join(", "));

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
