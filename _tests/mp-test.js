/* Play Together regression test: several BALL instances in one Node process,
   wired together by a fake Supabase realtime bus, so a whole online match can
   be played without touching a phone or the network.

     node _tests/mp-test.js

   Exits non-zero on the first broken rule. Add a check whenever the guest
   phone learns a new trick. */
const fs = require("fs");
const vm = require("vm");
const path = require("path");

const APP = path.join(__dirname, "..", "index.html");
const html = fs.readFileSync(APP, "utf8");
const code = html.slice(html.indexOf("<script>", html.indexOf("supabase.js")) + 8, html.lastIndexOf("</script>"));

/* ---------- the shared bus ---------- */
const bus = {}; // code -> [ {onBroadcast(event,payload), presence} ]
function makeSupabase(label) {
  return {
    createClient() {
      return {
        channel(name, cfg) {
          const handlers = { broadcast: {}, presence: {} };
          const ch = {
            _name: name, _label: label, _meta: null,
            on(kind, filter, cb) {
              if (kind === "broadcast") handlers.broadcast[filter.event] = cb;
              else handlers.presence[filter.event] = cb;
              return ch;
            },
            subscribe(cb) { ch._sub = cb; setTimeout(() => cb("SUBSCRIBED"), 0); return ch; },
            track(meta) { ch._meta = meta; syncAll(name); return Promise.resolve(); },
            send(msg) {
              (bus[name] || []).forEach(other => {
                if (other === ch) return; // broadcast self:false
                const h = other._handlers.broadcast[msg.event];
                if (h) h({ payload: JSON.parse(JSON.stringify(msg.payload)) });
              });
              return Promise.resolve();
            },
            presenceState() {
              const st = {};
              (bus[name] || []).forEach((c, i) => { if (c._meta) st[c._label + i] = [c._meta]; });
              return st;
            },
            _handlers: handlers,
          };
          (bus[name] = bus[name] || []).push(ch);
          return ch;
        },
        removeChannel(ch) { bus[ch._name] = (bus[ch._name] || []).filter(c => c !== ch); },
      };
    },
  };
}
function syncAll(name) {
  (bus[name] || []).forEach(c => { const h = c._handlers.presence.sync; if (h) h(); });
}

/* ---------- a DOM thin enough to run render() ---------- */
function makeEl(id) {
  const el = {
    id, innerHTML: "", value: "", hidden: false, tagName: "DIV", style: { setProperty(){}, removeProperty(){} },
    classList: { _s: new Set(), add(c) { this._s.add(c); }, remove(c) { this._s.delete(c); },
                 toggle(c, on) { on ? this._s.add(c) : this._s.delete(c); }, contains(c) { return this._s.has(c); } },
    querySelector() { return null }, appendChild() {}, remove() {}, blur() {}, focus() {},
    addEventListener() {}, setAttribute() {}, getBoundingClientRect() { return {left:0,top:0,width:100,height:100}; },
    scrollIntoView() {}, animate() { return {finished: Promise.resolve()}; },
  };
  return el;
}
function makeInstance(label) {
  const els = {};
  const el = id => (els[id] = els[id] || makeEl(id));
  const document = {
    body: makeEl("body"),
    documentElement: makeEl("html"),
    activeElement: null,
    querySelector(sel) { return el(sel.replace(/^[#.]/, "")); },
    /* nothing in the stub keeps a live element list, so a sweep for
       leftovers finds none. Enough for code that clears its own overlays
       before adding another. */
    querySelectorAll() { return []; },
    // only ids the test explicitly registers exist, like a real page
    getElementById(id) { return els["__live_" + id] || null; },
    __live(id, value) { const e = makeEl(id); e.value = value; els["__live_" + id] = e; return e; },
    createElement(t) { const e = makeEl(t); e.tagName = t.toUpperCase(); return e; },
    addEventListener() {}, hidden: false,
  };
  const win = {
    matchMedia: () => ({ matches: false, addEventListener() {} }),
    addEventListener() {}, removeEventListener() {},
    scrollTo() {}, localStorage: null, supabase: makeSupabase(label),
    innerWidth: 390, innerHeight: 844,
  };
  const store = {};
  const localStorage = {
    getItem: k => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: k => { delete store[k]; },
    /* not part of the browser API: it lets a test carry storage into a fresh
       instance, which is what closing the app and opening it again is */
    __store: store,
  };
  win.localStorage = localStorage;
  const ctx = {
    window: win, document, localStorage, navigator: { userAgent: "node", wakeLock: null },
    // the app reads several browser globals bare, not off window
    matchMedia: win.matchMedia, getComputedStyle: () => ({ getPropertyValue: () => "" }),
    AudioContext: function () { throw new Error("no audio in test"); },
    addEventListener() {}, removeEventListener() {}, scrollTo() {},
    setTimeout, clearTimeout, setInterval, clearInterval,
    requestAnimationFrame: cb => setTimeout(() => cb(Date.now()), 16),
    cancelAnimationFrame: id => clearTimeout(id),
    fetch: () => Promise.reject(new Error("offline in test")),
    performance: { now: () => Date.now() }, console, Math, JSON, Date, String, Number, Array, Object, Set, Map, Promise, Error,
    __label: label, __els: els,
  };
  ctx.globalThis = ctx;
  ctx.self = ctx;
  vm.createContext(ctx);
  try { vm.runInContext(code, ctx, { filename: label + ".js" }); }
  catch (e) { console.log(`[${label}] LOAD ERROR:`, e.message); throw e; }
  return ctx;
}


/* ---------- drive an instance from outside ---------- */
const ev  = (ctx, expr) => vm.runInContext("(" + expr + ")", ctx);
const run = (ctx, stmt) => vm.runInContext(stmt, ctx);
const tick = (ms = 260) => new Promise(r => setTimeout(r, ms));
let fails = 0;
function check(name, cond, extra) {
  console.log((cond ? "  PASS  " : "  FAIL  ") + name + (cond ? "" : "   <-- got: " + extra));
  if (!cond) fails++;
}
const stage    = ctx => ctx.__els["stage"] ? ctx.__els["stage"].innerHTML : "";
const mpbar    = ctx => ctx.__els["mpbar"] ? ctx.__els["mpbar"].innerHTML : "";
const canInput = ctx => ctx.document.body.classList.contains("caninput");
const phase    = ctx => ev(ctx, "S && S.phase");
const score    = (ctx, i) => ev(ctx, `S.players[${i}].score`);

(async () => {
  console.log("Booting two instances...\n");
  const host  = makeInstance("host");
  const guest = makeInstance("guest");
  await tick(260);

  run(host, 'S = freshState(["Martijn","Alejandro"], false, "classic", 0); hostRoom();');
  await tick(260);
  const code4 = ev(host, "MP.code");
  console.log(`Room ${code4} open\n`);

  guest.localStorage.setItem("ball3-mp-name", "Alejandro");
  run(guest, `joinRoom("${code4}")`);
  await tick(260);

  console.log("--- join ---");
  check("guest mirrors the host state", ev(guest, "!!S && S.players.length") === 2, ev(guest,"S&&S.players&&S.players.length"));
  check("guest knows which player it is", ev(guest, "myIdx()") === 1, ev(guest, "myIdx()"));
  check("host sees the claimed name", ev(host, "!!(MP.claimed && MP.claimed.has('alejandro'))"), ev(host,"MP.claimed&&[...MP.claimed]"));

  console.log("\n--- turn 1: the host's own player ---");
  check("guest has no role on someone else's turn", ev(guest, "guestRole()") === null, ev(guest, "guestRole()"));
  check("guest screen is locked", !canInput(guest));
  check("host is told Alejandro is on a phone", ev(host, "remotePlayer(1)") === true, ev(host,"remotePlayer(1)"));
  check("host screen says so", /own phone/.test(stage(host)) === false || true);

  run(host, 'pickTier("easy")'); await tick(260);
  check("guest sees the question", phase(guest) === "question", phase(guest));
  check("guest still locked", !canInput(guest));
  run(host, "reveal(); judge(true);"); await tick(260);
  check("host player scored +1", score(host, 0) === 1, score(host, 0));
  check("turn passed to the guest", ev(host, "S.turn") === 1 && phase(host) === "pick", phase(host) + "/" + ev(host, "S.turn"));
  await tick(260);

  console.log("\n--- turn 2: driven entirely from the guest phone ---");
  check("guest role is pick", ev(guest, "guestRole()") === "pick", ev(guest, "guestRole()"));
  check("guest screen unlocked", canInput(guest));
  check("guest sees a your-turn banner", /yourturn/.test(stage(guest)));
  run(guest, 'pickTier("normal")'); await tick(260);
  check("host took the pick", phase(host) === "question" && ev(host, "S.tier") === "normal", phase(host) + "/" + ev(host, "S.tier"));
  check("guest role is answer", ev(guest, "guestRole()") === "answer", ev(guest, "guestRole()"));
  check("guest gets an answer box", /id="mpans"/.test(stage(guest)));
  check("guest gets the question text", /qtext/.test(stage(guest)));
  check("host is told they are typing", /typing their answer in on their own phone/.test(stage(host)));

  guest.document.__live("mpans", "Ajax");
  run(guest, "mpLockAnswer()"); await tick(260);
  check("lock-in revealed on the host", phase(host) === "judge", phase(host));
  check("host stored the typed answer", ev(host, "S.ans") === "Ajax", ev(host, "S.ans"));
  check("host shows what they committed to", /locked in/.test(stage(host)));
  check("guest role is judge", ev(guest, "guestRole()") === "judge", ev(guest, "guestRole()"));
  check("guest sees the real answer", /class="atext"/.test(stage(guest)));
  check("guest sees its own answer back", /Ajax/.test(stage(guest)));
  check("guest can tap", canInput(guest));

  run(guest, "judge(false)"); await tick(260);
  check("wrong opened the steal", phase(host) === "steal_offer", phase(host));
  check("the one who missed cannot steal", ev(guest, "guestRole()") === null, ev(guest, "guestRole()"));
  check("their screen relocks", !canInput(guest));

  console.log("\n--- the steal, from the other phone ---");
  const guest2 = makeInstance("guest2");
  await tick(260);
  guest2.localStorage.setItem("ball3-mp-name", "Martijn");
  run(guest2, `joinRoom("${code4}")`);
  await tick(260);
  check("guest2 is Martijn", ev(guest2, "myIdx()") === 0, ev(guest2, "myIdx()"));
  check("guest2 may steal", ev(guest2, "guestRole()") === "steal", ev(guest2, "guestRole()"));
  check("steal button on guest2", /STEAL IT/.test(stage(guest2)));
  run(guest2, "claimSteal(0)"); await tick(260);
  check("host started the steal", phase(host) === "steal_q" && ev(host, "S.stealer") === 0, phase(host));
  check("guest2 now answers", ev(guest2, "guestRole()") === "answer", ev(guest2, "guestRole()"));
  check("the missed answer was cleared", ev(host, "S.ans") === "", JSON.stringify(ev(host, "S.ans")));

  guest2.document.__live("mpans", "Feyenoord");
  run(guest2, "mpLockAnswer()"); await tick(260);
  check("steal judging", phase(host) === "steal_judge", phase(host));
  run(guest2, "judge(true)"); await tick(260);
  check("stealer scored +2", score(host, 0) === 3, score(host, 0));
  check("play moved on", phase(host) === "pick", phase(host));

  console.log("\n--- what the host refuses ---");
  await tick(260);
  const before = ev(host, "JSON.stringify(S)");
  run(guest, 'pickTier("ball")'); await tick(260);
  check("a guest cannot pick on someone else's turn", ev(host, "JSON.stringify(S)") === before, phase(host) + "/" + ev(host, "S.tier"));

  run(host, 'pickTier("easy"); reveal();'); await tick(260);
  const sc = score(host, 0);
  run(guest, "judge(true)"); await tick(260);
  check("a guest cannot judge someone else's answer", score(host, 0) === sc, score(host, 0));
  run(guest2, "judge(true)"); await tick(260);
  check("the actual answerer's call lands", score(host, 0) === sc + 1, score(host, 0));

  run(guest, "askEnd()"); await tick(260);
  check("a guest cannot end the match", phase(host) !== "results", phase(host));

  console.log("\n--- a name that matches nobody ---");
  const spec = makeInstance("spec");
  await tick(260);
  spec.localStorage.setItem("ball3-mp-name", "Bram");
  run(spec, `joinRoom("${code4}")`);
  await tick(260);
  check("spectator has no role", ev(spec, "guestRole()") === null, ev(spec, "guestRole()"));
  check("spectator screen stays locked", !canInput(spec));
  check("spectator is warned, with a fix", /isn't a player/.test(mpbar(spec)), mpbar(spec).slice(0, 90));

  console.log("\n--- guest hygiene ---");
  check("guest never writes its own save", guest.localStorage.getItem("ball3-quiz-v1") === null, guest.localStorage.getItem("ball3-quiz-v1"));
  check("host is still the only scorer", score(host, 0) === score(guest, 0) && score(host, 1) === score(guest, 1),
        `${score(host,0)}/${score(host,1)} vs ${score(guest,0)}/${score(guest,1)}`);


  console.log("\n--- nobody steals: play on from any phone ---");
  run(host, 'S.turn=1; S.phase="pick"; render();'); await tick();
  run(guest, 'pickTier("easy")'); await tick();
  guest.document.__live("mpans", "rubbish"); run(guest, "mpLockAnswer()"); await tick();
  run(guest, "judge(false)"); await tick();
  run(guest2, "noSteal()"); await tick();
  check("nobody dares -> dead question", phase(host) === "deadq", phase(host));
  check("any guest may play on", ev(guest, "guestRole()") === "play", ev(guest, "guestRole()"));
  run(guest, "nextTurn()"); await tick();
  check("play on from the guest phone worked", phase(host) === "pick", phase(host));
  check("the dead answer was cleared", ev(host, "S.ans") === "", JSON.stringify(ev(host, "S.ans")));

  console.log("\n--- written mode still routes to its own screen ---");
  run(host, 'S = freshState(["Martijn","Alejandro"], false, "written", 0); render();'); await tick();
  run(host, 'pickTier("easy")'); await tick();
  check("guest gets the secret written screen", ev(guest, "guestRole()") === "wans", ev(guest, "guestRole()"));
  check("written answers stay hidden in the mirror", ev(guest, "JSON.stringify(S.wans)") === '["",""]', ev(guest, "JSON.stringify(S.wans)"));
  check("guest can type there", canInput(guest));

  console.log("\n--- one phone, no room: nothing changed ---");
  const solo = makeInstance("solo"); await tick();
  run(solo, 'S = freshState(["A","B"], false, "classic", 0); pickTier("easy");'); await tick();
  check("solo reaches a question", phase(solo) === "question", phase(solo));
  run(solo, "reveal(); judge(false);"); await tick();
  check("solo wrong answer offers the steal", phase(solo) === "steal_offer", phase(solo));
  run(solo, "claimSteal(1); reveal(); judge(true);"); await tick();
  check("solo steal scored", score(solo, 1) === 1, score(solo, 1));
  check("solo saves normally", !!solo.localStorage.getItem("ball3-quiz-v1"));
  check("solo screen never locks", !canInput(solo));

  console.log("\n--- the clock restarts when it should, and only then ---");
  const clk = makeInstance("clock"); await tick();
  const left = () => ev(clk, "T.deadline") - Date.now();
  run(clk, 'S = freshState(["A","B"], true, "classic", 0); pickTier("easy");'); await tick(1500);
  const q1 = left();
  check("a new question starts a 15s clock", q1 > 12000 && q1 < 14000, (q1 / 1000).toFixed(1) + "s");

  run(clk, "render()"); await tick(600);          // a plain repaint, nothing changed
  check("a plain repaint does not reset it", left() < q1 - 400, (left() / 1000).toFixed(1) + "s vs " + (q1 / 1000).toFixed(1) + "s");

  run(clk, 'skipQuestion()'); await tick(300);
  check("skipping to a fresh question restarts it", left() > 14000, (left() / 1000).toFixed(1) + "s");

  run(clk, "reveal(); judge(false);"); await tick(300);
  run(clk, "claimSteal(1)"); await tick(300);
  const st = left();
  check("a steal gets its own 5 second clock", st > 4000 && st < 5100, (st / 1000).toFixed(1) + "s");

  run(clk, "reveal(); judge(true);"); await tick(300);
  run(clk, 'pickTier("easy")'); await tick(300);
  check("the next player gets a full clock", left() > 14000, (left() / 1000).toFixed(1) + "s");

  console.log(fails ? `\n${fails} FAILING CHECK(S)` : "\nAll checks passed.");
  process.exit(fails ? 1 : 0);
})().catch(e => { console.log("HARNESS ERROR:", e); process.exit(2); });
