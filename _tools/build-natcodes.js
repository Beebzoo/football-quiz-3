/* A three letter country code into a flag on disk.
 *
 *     node _tools/build-natcodes.js [--dry]
 *
 * WHY THIS EXISTS. Every {{Fs player}} row on a club's article carries the
 * man's country as a three letter code, nat=GER, and build-clubs.js now keeps
 * it, so 5,313 men across twelve leagues know where they are from. A card can
 * only show that as a flag if something turns GER into de.png, and nothing did.
 *
 * WHY IT IS HARVESTED RATHER THAN TYPED. There are 154 distinct codes in the
 * club squads alone and the obvious shortcuts are all wrong. The code is not
 * the ISO one: Germany is GER and not DE, Spain is ESP and not ES. It is not
 * consistently FIFA's either, because these are written by whoever edited the
 * article: Spain turns up as both ESP and SPA, Romania as ROU and ROM, Japan
 * as JPN and JAP, Serbia as SRB and SER. A hand table of 154 rows would be
 * wrong in ways nobody would ever notice, because a wrong flag on a substitute
 * from Guinea-Bissau is not something anybody checks.
 *
 * THREE SOURCES, IN THIS ORDER OF TRUST.
 *
 *   1. THE POOLS, which are already right. Sixteen tournament squads carry a
 *      trigram and a flag slug per side, both harvested and both checked by
 *      assets-test on every run. That is 83 codes including the four British
 *      ones that have no country behind them at all, and England is exactly
 *      the case a country lookup can never solve.
 *   2. FIFA's own code, off Wikidata. P3441 sits on the national TEAM rather
 *      than on the country, which is why this asks for the team and then walks
 *      to the country through P1532, then to its ISO alpha-2 through P297.
 *   3. The IOC's code, P984, which does sit on the country. It covers the
 *      places FIFA has no team for and it is where most of the editors' odd
 *      spellings come from, because half of them are writing the Olympic code.
 *
 * A code only survives if the flag it lands on is a file that exists. Anything
 * left over is printed rather than guessed at, because a man with no flag
 * draws no flag and that is a better card than a wrong one.
 */
const fs = require("fs");
const path = require("path");
const https = require("https");

const REPO = path.join(__dirname, "..");
const FLAGS = path.join(REPO, "assets", "natflags");
const OUT = path.join(FLAGS, "codes.json");
const DRY = process.argv.includes("--dry");
const UA = "BALL3-quiz-build/1.0 (https://github.com/Beebzoo/football-quiz-3; personal hobby project)";

const sleep = ms => new Promise(r => setTimeout(r, ms));
function once(url, headers) {
  return new Promise((res, rej) => {
    https.get(url, {headers: Object.assign({"User-Agent": UA}, headers || {})}, r => {
      if (r.statusCode >= 300 && r.statusCode < 400 && r.headers.location) return res(once(r.headers.location, headers));
      if (r.statusCode !== 200) { r.resume(); return rej(new Error("HTTP " + r.statusCode)); }
      let b = ""; r.setEncoding("utf8");
      r.on("data", d => b += d); r.on("end", () => res(b));
    }).on("error", rej);
  });
}
const SPARQL = "https://query.wikidata.org/sparql?format=json&query=";
async function ask(q, tries) {
  tries = tries || 3;
  for (let i = 0; i < tries; i++) {
    try {
      const j = JSON.parse(await once(SPARQL + encodeURIComponent(q), {Accept: "application/sparql-results+json"}));
      return j.results.bindings;
    } catch (e) {
      if (i === tries - 1) { console.log("  query failed: " + e.message); return []; }
      await sleep(1500 * (i + 1));
    }
  }
  return [];
}

(async () => {
  const have = new Set(fs.readdirSync(FLAGS).filter(f => f.endsWith(".png")).map(f => f.slice(0, -4)));
  console.log(have.size + " flag files on disk");

  /* ---- 1. what the pools already know, which outranks everything ---- */
  const map = {};
  const fromPool = new Set();
  for (const d of fs.readdirSync(path.join(REPO, "assets"))) {
    if (!/^(wc|euro)\d{4}$/.test(d)) continue;
    const f = path.join(REPO, "assets", d, "index.json");
    if (!fs.existsSync(f)) continue;
    const j = JSON.parse(fs.readFileSync(f, "utf8"));
    for (const s of Object.values(j)) {
      if (!s.abbr || !s.flag || !have.has(s.flag)) continue;
      map[s.abbr.toUpperCase()] = s.flag;
      fromPool.add(s.abbr.toUpperCase());
    }
  }
  console.log("  " + fromPool.size + " codes off the tournament pools");

  /* ---- 2 and 3. FIFA, then the IOC, neither overwriting the pools ---- */
  const add = (code, iso, why, log) => {
    const c = String(code || "").toUpperCase().trim();
    const slug = String(iso || "").toLowerCase().trim();
    if (!/^[A-Z]{3}$/.test(c) || !slug) return 0;
    if (fromPool.has(c)) return 0;                  // the pools are already right
    if (!have.has(slug)) return 0;                  // no file, no flag
    if (map[c] && map[c] !== slug) { log.push(c + ": " + map[c] + " kept over " + slug + " (" + why + ")"); return 0; }
    if (map[c]) return 0;
    map[c] = slug;
    return 1;
  };

  const clashes = [];
  const fifa = await ask("SELECT ?code ?iso WHERE { ?t wdt:P3441 ?code . ?t wdt:P1532 ?c . ?c wdt:P297 ?iso . }");
  let n = 0;
  for (const r of fifa) n += add(r.code.value, r.iso.value, "FIFA", clashes);
  console.log("  +" + n + " from FIFA's codes (" + fifa.length + " rows)");

  const ioc = await ask("SELECT ?code ?iso WHERE { ?c wdt:P984 ?code . ?c wdt:P297 ?iso . }");
  let m = 0;
  for (const r of ioc) m += add(r.code.value, r.iso.value, "IOC", clashes);
  console.log("  +" + m + " from the IOC's codes (" + ioc.length + " rows)");
  if (clashes.length) {
    console.log("  two answers for one code, the earlier source kept:");
    clashes.slice(0, 10).forEach(c => console.log("    " + c));
  }

  /* ---- 4. the spellings editors use that no code list has ----
     A SPELLING IS NOT A FOOTBALL FACT, which is the same reason build-clubs.js
     is allowed to write down that Cologne is filed under Koln. Every one of
     these is a real code for a real country that simply is not the code any of
     the three sources above publishes: ROM and SER and JAP are the old ISO
     three letter forms, DNK and PHL and MRT and BRB are the current ones, DRC
     is what people call the Congo and CUR is what they call Curacao.

     EACH ONE POINTS AT ANOTHER CODE RATHER THAN AT A FLAG, so if a flag file is
     ever renamed the alias follows it instead of going stale on its own, and an
     alias whose target is missing simply does not appear. */
  const ALIAS = {
    ROM: "ROU", SER: "SRB", JAP: "JPN", DNK: "DEN", PHL: "PHI",
    GMB: "GAM", MRT: "MTN", TGO: "TOG", DRC: "COD", CUR: "CUW",
  };
  let a = 0;
  const orphan = [];
  for (const [from, to] of Object.entries(ALIAS)) {
    if (map[from]) continue;
    if (!map[to]) { orphan.push(from + " -> " + to); continue; }
    map[from] = map[to];
    a++;
  }
  console.log("  +" + a + " from the spellings editors actually use");
  /* an alias that matches nothing is folklore the next reader will believe,
     which is the lesson build-clubs.js records about its own strike list */
  if (orphan.length) console.log("  ALIAS POINTING AT NOTHING: " + orphan.join(", "));

  /* ---- what the squads actually ask for, which is the only number that matters ---- */
  const DIRS = ["premier", "laliga", "bundesliga", "seriea", "belgian", "eredivisie",
    "championship", "segunda", "bundesliga2", "serieb", "challenger", "eerste"];
  const used = {};
  for (const d of DIRS) {
    const f = path.join(REPO, "assets", d, "clubs.json");
    if (!fs.existsSync(f)) continue;
    const j = JSON.parse(fs.readFileSync(f, "utf8"));
    for (const t of Object.values(j)) for (const p of t.xi.concat(t.bench || []))
      if (p.nat) used[p.nat] = (used[p.nat] || 0) + 1;
  }
  const men = Object.values(used).reduce((a, b) => a + b, 0);
  const missing = Object.keys(used).filter(c => !map[c]).sort((a, b) => used[b] - used[a]);
  const covered = men - missing.reduce((a, c) => a + used[c], 0);
  console.log("\n" + Object.keys(map).length + " codes resolve to a flag");
  console.log("club squads: " + covered + " of " + men + " men get one (" +
    (covered / men * 100).toFixed(1) + "%), " + missing.length + " codes still unresolved");
  if (missing.length) console.log("  " + missing.map(c => c + " (" + used[c] + ")").join("  "));

  if (DRY) { console.log("\n--dry, nothing written"); return; }
  fs.writeFileSync(OUT, JSON.stringify(map));
  console.log("wrote " + path.relative(REPO, OUT) + "  (" +
    (fs.statSync(OUT).size / 1024).toFixed(1) + " KB)");
  console.log("now run: node _tools/sw-clubs.js");
})();
