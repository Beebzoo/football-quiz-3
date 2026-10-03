/* Would anyone at the table know him? English Wikipedia pageviews, the same
 * measure build-badges, build-kits, build-careers and build-alumni use, pulled
 * out so the two card-versus-card banks can share it.
 *
 *     const { fameFor } = require("./pageviews");
 *     const fame = await fameFor(["Cristiano Ronaldo", "Majed Abdullah"], { ua });
 *     fame.get("Cristiano Ronaldo")  ->  views over the last twelve full months
 *
 * WHY PAGEVIEWS AND NOT SITELINKS. Sitelinks count how many Wikipedias have a
 * stub, which puts a Lithuanian minnow above Heerenveen (build-kits found that
 * one). Pageviews count how many people went looking, which is the question
 * the quiz is actually asking: is this a man somebody has heard of.
 *
 * WHAT A TITLE'S VIEWS ARE NOT. The metrics API counts one title and follows
 * nothing, and a famous man's traffic is spread over more than one title:
 *
 *   - Pepe's article moved from "Pepe (footballer, born 1983)" to "...born
 *     February 1983" in May 2026. The new title had five months of views, the
 *     old one, now a redirect, had the rest.
 *   - Luis Suárez is worse. "Luis Suárez" became a disambiguation page and the
 *     striker was swapped under "Luis Suárez (Uruguayan footballer)", so a year
 *     of the most-read footballer article in the bank sits on a page that is no
 *     longer his, and his own title showed 87 views for 2025.
 *
 * Asking for one title shelved both of them as unknown. So the figure is the
 * sum over the article, every page that redirects to it, and, where the title
 * carries a disambiguator, the bare name if that is now a disambiguation page
 * (a disambiguation page at his name exists because of men like him, and its
 * traffic before the swap was his). Over-crediting a man whose bare name is a
 * busy disambiguation page is possible and harmless: the floor is a quartile
 * and the weighting is a square root.
 *
 * THE LAST TWELVE FULL MONTHS rather than a calendar year, so a man who moved
 * title recently is counted under both, and the window is fixed per calendar
 * month so two builds in the same month rank the same men the same way.
 *
 * Cached per title in _tools/_models/pageviews-12m.json, gitignored. A failed
 * fetch is NOT cached, so a bad minute of API weather cannot shelve a famous
 * man until somebody notices. */
const fs = require("fs");
const path = require("path");
const https = require("https");

const CACHE = path.join(__dirname, "_models", "pageviews-12m.json");

/* first day of the month twelve months before last month, to the last day of
   last month, as the metrics API wants them */
function window() {
  const now = new Date();
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0));          // last day of previous month
  const start = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() - 11, 1));   // twelve months back
  const f = d => d.toISOString().slice(0, 10).replace(/-/g, "");
  return { FROM: f(start) + "00", TO: f(end) + "00", tag: f(start).slice(0, 6) + "-" + f(end).slice(0, 6) };
}

function getJSON(url, ua) {
  return new Promise((res, rej) => {
    https.get(url, { headers: { "User-Agent": ua, "Accept": "application/json" } }, r => {
      let b = ""; r.setEncoding("utf8");
      r.on("data", d => b += d);
      r.on("end", () => {
        if (r.statusCode === 404) return res(null);
        if (r.statusCode !== 200) return rej(new Error("HTTP " + r.statusCode + " for " + url));
        try { res(JSON.parse(b)); } catch (e) { rej(e); }
      });
    }).on("error", rej);
  });
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
const WIKI = "https://en.wikipedia.org/w/api.php?format=json&";
const METRICS = "https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/en.wikipedia/all-access/user/";

async function fameFor(titles, { ua, concurrency = 1, log = () => {} } = {}) {
  if (!ua) throw new Error("fameFor needs a User-Agent: Wikimedia asks for one and throttles the anonymous");
  const { FROM, TO, tag } = window();
  fs.mkdirSync(path.dirname(CACHE), { recursive: true });
  let cache = {};
  if (fs.existsSync(CACHE)) { try { cache = JSON.parse(fs.readFileSync(CACHE, "utf8")); } catch (e) { cache = {}; } }
  /* a cache from another month is a different window, and starts again */
  if (cache.__window !== tag) cache = { __window: tag };
  const want = [...new Set(titles)].filter(t => t && cache[t] === undefined);
  log(`pageviews ${tag}: ${titles.length} titles, ${want.length} not cached`);

  let done = 0, saved = 0, failures = 0;
  const save = () => { fs.writeFileSync(CACHE, JSON.stringify(cache)); saved = done; };

  /* one metrics call with the long backoff the API needs; null means 404 */
  const views = async (title) => {
    const u = METRICS + encodeURIComponent(title.replace(/ /g, "_")) + "/monthly/" + FROM + "/" + TO;
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        const j = await getJSON(u, ua);
        return j && j.items ? j.items.reduce((n, m) => n + (m.views || 0), 0) : null;
      } catch (e) {
        if (attempt === 4) throw e;
        await sleep(3000 * Math.pow(2, attempt));
      }
    }
    return null;
  };
  /* the article behind a title (redirects followed), the titles that redirect
     to it, and whether a given title is a disambiguation page */
  const about = async (title) => {
    const j = await getJSON(WIKI + "action=query&redirects=1&prop=redirects|pageprops&rdlimit=50&titles=" + encodeURIComponent(title), ua);
    const p = j && j.query && j.query.pages && Object.values(j.query.pages)[0];
    if (!p || "missing" in p) return null;
    return { title: p.title, redirects: (p.redirects || []).map(r => r.title), dab: !!(p.pageprops && "disambiguation" in p.pageprops) };
  };

  const worker = async () => {
    while (want.length) {
      const t = want.shift();
      try {
        const a = await about(t);
        if (!a) { cache[t] = 0; done++; continue; }
        let total = (await views(a.title)) || 0;
        for (const r of a.redirects.slice(0, 12)) { total += (await views(r)) || 0; await sleep(100); }
        const bare = a.title.replace(/\s*\([^)]*\)\s*$/, "");
        if (bare !== a.title) {
          const b = await about(bare);
          if (b && b.dab) total += (await views(b.title)) || 0;
        }
        if (a.title !== t) log(`  ${t} -> ${a.title}`);
        cache[t] = total;
      } catch (e) {
        failures++;
        log(`  not cached, will ask again next run: ${t}: ${e.message}`);
      }
      done++;
      if (done - saved >= 20) save();
      await sleep(300);   /* single file and slow: two workers at 150ms lost 140 of 426 titles to 429s */
    }
  };
  await Promise.all(Array.from({ length: concurrency }, worker));
  if (done !== saved) save();
  log(`pageviews: fetched ${done - failures}, failed ${failures}, cache holds ${Object.keys(cache).length - 1}`);
  return new Map(titles.map(t => [t, cache[t] || 0]));
}

module.exports = { fameFor };
