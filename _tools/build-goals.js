/* Who has more international goals: the bank behind the mode.
 *
 *     node _tools/build-goals.js [--dry]
 *
 * The sibling of build-caps.js and built the same way, because the reasons are
 * the same. Two men, two album cards, tap the one who scored more for his
 * country. The pools carry a goals figure per man (capg) and every one of them
 * is the number AT THAT TOURNAMENT, so the career total has to come off one
 * curated page that is about exactly this: Wikipedia's list of men's
 * footballers with 50 or more international goals, sourced row by row to
 * RSSSF. One fetch, the country printed beside the player, and therefore none
 * of the wrong-man risk that comes with resolving names to articles.
 *
 * The cost is the same too: the bank stops at 50 goals. That is a feature. A
 * man with fifty international goals is a man somebody at the table has heard
 * of, and the whole range lands between 50 and about 150.
 *
 * WHAT IS DIFFERENT FROM THE CAPS PAGE, and each one bit:
 *   - the table class is "wikitable sortable plainrowheaders sticky-header",
 *     ten columns, not seven;
 *   - the player is {{sort name|First|Last}} (sometimes with a third argument
 *     naming the actual article), not a plain link;
 *   - the nation is {{fb|Portugal}} on one row and {{fb|KUW}} on the next, so
 *     it is matched to a pool side by name AND by the side's own abbr;
 *   - the goals cell is a link to his list of international goals with the
 *     number as the display text;
 *   - footnotes ({{efn|...}}) carry pipes INSIDE them, so they have to come
 *     out of a row before it is split into cells or the columns shift.
 *
 * A CARD MEANS A POOL, as before: he is only in the bank if one of the fifteen
 * tournament squads has him, taken from the last book he is in.
 *
 * FAME RIDES ON THE ROW. A year of English pageviews per man, so the app can
 * lean the draw toward players people have heard of. The bank is deliberately
 * not filtered by it here: the row order is what the app's used-list indexes,
 * so what ships is everybody, in goals order, and the floor and the weighting
 * live in the app where they can be tuned without renumbering anything. */
const fs = require("fs");
const path = require("path");
const https = require("https");
const { fameFor } = require("./pageviews");

const REPO = path.join(__dirname, "..");
const CACHE = path.join(__dirname, "_models");
const OUT = path.join(REPO, "assets", "goals", "index.json");
const DRY = process.argv.includes("--dry");
const UA = "BALL3-quiz-build/1.0 (https://github.com/Beebzoo/football-quiz-3; personal hobby project)";
const PAGE = "List of men's footballers with 50 or more international goals";

/* the band the app will ask in. Reported here so a bank that cannot fill it is
   caught at build time; enforced in the app. */
const GAP_MIN = 4, GAP_MAX = 25;

function once(url) {
  return new Promise((res, rej) => {
    https.get(url, { headers: { "User-Agent": UA } }, r => {
      if (r.statusCode >= 300 && r.statusCode < 400 && r.headers.location) return res(once(r.headers.location));
      if (r.statusCode !== 200) { r.resume(); return rej(new Error("HTTP " + r.statusCode)); }
      let b = ""; r.setEncoding("utf8");
      r.on("data", d => b += d); r.on("end", () => res(b));
    }).on("error", rej);
  });
}
async function wikitext(title) {
  fs.mkdirSync(CACHE, { recursive: true });
  const f = path.join(CACHE, "goals_" + title.replace(/[^A-Za-z0-9]+/g, "_").slice(0, 80) + ".txt");
  if (fs.existsSync(f) && fs.statSync(f).size > 1000) return fs.readFileSync(f, "utf8");
  const j = JSON.parse(await once("https://en.wikipedia.org/w/api.php?action=parse&prop=wikitext" +
    "&format=json&formatversion=2&redirects=1&page=" + encodeURIComponent(title)));
  const wt = (j.parse && j.parse.wikitext) || "";
  fs.writeFileSync(f, wt);
  return wt;
}

/* ---------- templates that must come out before a row is split ----------
   {{efn|name="..."|text with || in it}} is the one that matters: a footnote
   on a goals cell carries pipes, and splitting on || would hand the parser a
   column that is half a sentence. Brace-balanced, so a footnote that itself
   contains a template comes out whole. */
function stripNamed(s, names) {
  let out = "", i = 0;
  while (i < s.length) {
    const open = s.indexOf("{{", i);
    if (open < 0) { out += s.slice(i); break; }
    const head = s.slice(open + 2, open + 20).toLowerCase();
    if (!names.some(n => head.startsWith(n))) { out += s.slice(i, open + 2); i = open + 2; continue; }
    let depth = 0, j = open;
    while (j < s.length) {
      if (s.startsWith("{{", j)) { depth++; j += 2; continue; }
      if (s.startsWith("}}", j)) { depth--; j += 2; if (!depth) break; continue; }
      j++;
    }
    out += s.slice(i, open);
    i = j;
  }
  return out;
}
const clean = row => stripNamed(row, ["efn", "sfn", "refn"])
  .replace(/<ref[^>]*\/>/g, "").replace(/<ref[\s\S]*?<\/ref>/g, "").replace(/<!--[\s\S]*?-->/g, "");

const ATTRS = /^\s*(?:[a-zA-Z-]+\s*=\s*(?:"[^"]*"|'[^']*'|[^|\s]+)\s*)+\|/;
/* PIPES INSIDE A TEMPLATE ARE NOT COLUMN BREAKS. A mononym is written
   {{sort name||Neymar}} with an empty first parameter, and that || is exactly
   the cell separator, so a naive split handed back "{{sort name" in the
   player column and "Neymar}}" in the nation column and lost every Brazilian
   on the page. Pipes are masked while inside {{ }} and put back per cell. */
function maskTemplates(s) {
  let out = "", depth = 0;
  for (let i = 0; i < s.length; i++) {
    if (s.startsWith("{{", i)) { depth++; out += "{{"; i++; continue; }
    if (s.startsWith("}}", i)) { depth = Math.max(0, depth - 1); out += "}}"; i++; continue; }
    out += (depth > 0 && s[i] === "|") ? "\u0001" : s[i];
  }
  return out;
}
function cells(row) {
  return maskTemplates(row).split(/\n[|!]|\|\|/).slice(1).map(p => {
    const rs = p.match(/rowspan\s*=\s*"?(\d+)"?/i);
    return { text: p.replace(ATTRS, "").replace(/\u0001/g, "|").trim(), rowspan: rs ? +rs[1] : 1 };
  });
}
/* THE TABLE ENDS AT ITS OWN |}, not at the first one after it opens: a cell
   can hold a nested {| ... |} and the first match then cuts the table in half.
   Walked by depth. */
function tableEnd(wt, start) {
  let depth = 0, i = start;
  while (i < wt.length) {
    const open = wt.indexOf("\n{|", i), close = wt.indexOf("\n|}", i);
    if (close < 0) return wt.length;
    if (open >= 0 && open < close) { depth++; i = open + 3; continue; }
    if (depth === 0) return close;
    depth--; i = close + 3;
  }
  return wt.length;
}
function table(wt, cols) {
  const start = wt.indexOf('{|class="wikitable sortable plainrowheaders sticky-header"');
  if (start < 0) return [];
  const end = tableEnd(wt, start + 2);
  const rows = wt.slice(start, end).split(/\n\|-/).slice(1);
  const pending = {};
  const out = [];
  for (const raw of rows) {
    const cs = cells(clean(raw));
    if (!cs.length) continue;
    const row = [];
    let ci = 0, ptr = 0;
    while (ci < cols) {
      if (pending[ci] && pending[ci].left > 0) { row[ci] = pending[ci].v; pending[ci].left--; ci++; continue; }
      const c = cs[ptr++];
      if (c === undefined) break;
      row[ci] = c.text;
      if (c.rowspan > 1) pending[ci] = { v: c.text, left: c.rowspan - 1 };
      ci++;
    }
    out.push(row);
  }
  return out;
}

const fold = s => String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
  .replace(/[^a-z ]/g, " ").replace(/\s+/g, " ").trim();

/* {{sort name|Cristiano|Ronaldo}}, {{sort name|Ali|Daei|Ali Daei (footballer)}},
   '''{{sort name|Romelu|Lukaku}}''', or a plain [[link|Name]] */
function who(cell) {
  const s = cell.replace(/'''/g, "");
  /* the first parameter is EMPTY for a mononym: {{sort name||Neymar}},
     {{sort name||Ronaldo|Ronaldo (Brazilian footballer)}} */
  const sn = s.match(/\{\{sort ?name\|([^|}]*)\|([^|}]+)(?:\|([^|}]+))?\}\}/i);
  if (sn) {
    const name = (sn[1] + " " + sn[2]).trim();
    /* the third argument is either the article title outright, or dab=X,
       which means the article is "Name (X)": {{sort name|Luis|Suárez|dab=Uruguayan footballer}} */
    const third = (sn[3] || "").trim();
    const page = !third ? name : /^dab=/i.test(third) ? `${name} (${third.replace(/^dab=/i, "").trim()})` : third;
    return { name, page };
  }
  const ln = s.match(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/);
  if (ln) return { name: (ln[2] || ln[1]).trim(), page: ln[1].trim() };
  return null;
}

(async () => {
  const wt = await wikitext(PAGE);
  console.log("the list: " + (wt.length / 1024).toFixed(0) + "KB");

  /* Rank, Player, Nation, Confederation, Goals, Caps, Goals per match, Career span, Date of 50th, Ref */
  const rows = table(wt, 10);
  const listed = [];
  for (const r of rows) {
    const w = who(r[1] || "");
    /* {{fb|Hungary|1949}} carries the flag's year; Puskás carries two nations
       with a <br /> between them, and the first is the one he scored most for */
    const nat = (r[2] || "").match(/\{\{fb\|([^}|]+)(?:\|[^}]*)?\}\}/);
    const g = (r[4] || "").match(/\|\s*(\d+)\s*\]\]/) || (r[4] || "").match(/(\d+)/);
    if (!w || !nat || !g) { if (r[1] && r[1] !== "Player") console.log("  skipped row: " + (r[1] || "").slice(0, 50)); continue; }
    listed.push({ page: w.page, name: w.name, fb: nat[1].trim(), goals: +g[1] });
  }
  console.log(listed.length + " players with 50 or more international goals (" + rows.length + " table rows)");
  /* 87 men have fifty international goals as of October 2026, in one table; the
     By nationality and By confederation tables below it are not players */
  if (listed.length < 75) { console.error("FAILED: that is far short of the list, the table shape has moved"); process.exit(1); }
  const top = listed.slice().sort((a, b) => b.goals - a.goals)[0];
  console.log("  the top scorer of them: " + top.name + " " + top.fb + " " + top.goals);

  /* ---------- who has a card ---------- */
  const books = fs.readdirSync(path.join(REPO, "assets"))
    .filter(d => /^(wc|euro)\d{4}$/.test(d))
    .map(d => ({ id: d, year: +d.replace(/\D/g, "") }))
    .sort((a, b) => a.year - b.year);
  /* EVERY MAN OF THAT NAME, not the last one. The first build keyed this on the
     name alone and took the most recent book, which handed Uruguay's Luis
     Suárez the card of Colombia's Luis Suárez from the 2026 squad: same name,
     different man, and the only thing that would ever have caught it is the
     nation the list prints beside him. So the list's nation has to agree with
     the card's side, by name or by the side's own abbr, and a name with no
     agreeing card is a man with no card rather than a guess. */
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
          men.get(k).push({ pool: b.id, side, full: m.full, n: m.n, abbr: (t.abbr || "").toUpperCase(), year: b.year });
        }
  }
  console.log(men.size + " distinct names across " + books.length + " books");

  /* the list and the pools name a few countries differently; Drogba was
     dropped as the wrong man because Côte d'Ivoire is Ivory Coast */
  const ALIAS = {"cote d ivoire": "ivory coast", "czechia": "czech republic", "dr congo": "congo dr",
                 "south korea": "korea republic", "north korea": "korea dpr", "ir iran": "iran",
                 "china pr": "china", "republic of ireland": "ireland", "fr yugoslavia": "serbia",
                 "serbia and montenegro": "serbia", "west germany": "germany"};
  const nm = s => { const f = fold(s); return ALIAS[f] || f; };
  const sameNation = (c, fb) => nm(c.side) === nm(fb) || c.abbr === fb.toUpperCase()
    || nm(c.side).startsWith(nm(fb)) || nm(fb).startsWith(nm(c.side));
  const bank = [];
  const noCard = [], wrongMan = [];
  for (const p of listed) {
    const cands = (men.get(fold(p.name)) || men.get(fold(p.page.replace(/\s*\(.*\)$/, ""))) || []);
    if (!cands.length) { noCard.push(p.name); continue; }
    const ok = cands.filter(c => sameNation(c, p.fb)).sort((a, b) => b.year - a.year);
    if (!ok.length) { wrongMan.push(p.name + " (" + p.fb + ", card says " + cands.map(c => c.side).join("/") + ")"); continue; }
    const hit = ok[0];
    /* nat is what the LIST said, abbr is what the CARD says; the test holds
       them to agreeing, which is the only check there is for the right man */
    bank.push({ n: hit.n, full: hit.full, pool: hit.pool, side: hit.side, nat: p.fb, abbr: hit.abbr, goals: p.goals, page: p.page });
  }
  if (wrongMan.length) console.log("  a card of the same name for a DIFFERENT nation, left out: " + wrongMan.join("; "));
  bank.sort((a, b) => b.goals - a.goals);
  console.log(bank.length + " of them have a card, " + noCard.length + " do not");
  console.log("  no card, e.g.: " + noCard.slice(0, 8).join(", "));
  console.log("  the bank runs " + bank[bank.length - 1].goals + " to " + bank[0].goals + " goals");
  console.log("  top five: " + bank.slice(0, 5).map(p => p.n + " " + p.goals).join(", "));

  /* ---------- would anyone know him ---------- */
  const fame = await fameFor(bank.map(p => p.page), { ua: UA, log: s => console.log("  " + s) });
  for (const p of bank) { p.fame = fame.get(p.page) || 0; delete p.page; }
  const sorted = bank.map(p => p.fame).sort((a, b) => a - b);
  const q = f => sorted[Math.floor(f * (sorted.length - 1))];
  console.log("  fame quartiles (views in 2025): " + [0, .25, .5, .75, 1].map(f => q(f).toLocaleString("en-GB")).join(" / "));
  console.log("  least known: " + bank.slice().sort((a, b) => a.fame - b.fame).slice(0, 6).map(p => p.n + " " + p.nat + " " + p.fame).join(", "));

  /* ---------- can it deal ---------- */
  let ok = 0;
  for (let i = 0; i < bank.length; i++)
    for (let j = i + 1; j < bank.length; j++) {
      const g = Math.abs(bank[i].goals - bank[j].goals);
      if (g >= GAP_MIN && g <= GAP_MAX) ok++;
    }
  const all = bank.length * (bank.length - 1) / 2;
  console.log("  playable pairs: " + ok.toLocaleString("en-GB") + " of " + all.toLocaleString("en-GB") +
    " (" + (ok / all * 100).toFixed(1) + "% land in the " + GAP_MIN + " to " + GAP_MAX + " goal band)");
  const lonely = bank.filter(p => !bank.some(o => o !== p &&
    Math.abs(p.goals - o.goals) >= GAP_MIN && Math.abs(p.goals - o.goals) <= GAP_MAX));
  if (lonely.length) console.log("  NO PARTNER IN THE BAND: " + lonely.map(p => p.n + " " + p.goals).join(", "));

  const byNat = {};
  bank.forEach(p => byNat[p.nat] = (byNat[p.nat] || 0) + 1);
  console.log("  " + Object.keys(byNat).length + " countries, commonest " +
    Object.entries(byNat).sort((a, b) => b[1] - a[1]).slice(0, 6).map(e => e[0] + " " + e[1]).join(", "));

  if (DRY) { console.log("\n--dry, nothing written"); return; }
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(bank));
  console.log("wrote " + path.relative(REPO, OUT) + "  (" + (fs.statSync(OUT).size / 1024).toFixed(1) + " KB)");
})();
