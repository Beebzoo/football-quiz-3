/* ======================== THE SHOT, IN ZDOG ========================
   A prototype of the shot scene drawn with Zdog (assets/vendor/zdog.dist.min.js,
   MIT) instead of pixel sprites. Same contract as G3 in index.html so it can be
   swapped in: arm(cfg) / stop() / paint(u, el) / sweep / mouth(cam) /
   marks(cam, flip) / cameraFor / size / cams.

   WHAT STAYS THE SAME, because the duel depends on it: the whole shot is one
   function of one number u (0..1); the clock T is G3's clock; the goal mouth is
   an upright rectangle on screen and mouth() hands the picker the same four
   percentages the frame is drawn from; the corners come from H2_CORNER_AT.

   WHAT CHANGES: everything is geometry. Figures are capsules (thick-stroked
   lines) in kit colours, lit flat like the night figures on the pitch. The
   goal is real posts, the net is a mesh of polylines that bulges where the
   ball hits it, the ball is a sphere with a spinning patch, and the camera is
   a tilt and a zoom rather than a second set of sprites.

   Zdog is orthographic. Depth is sold by the tilt (far is higher), by the
   striker being drawn larger than the keeper, by the ball shrinking as it
   travels, and by the ground painted in 2D under the scene with stripes that
   converge. */
const G4 = (function(){
const CW = 620, CH = 420;                     // logical canvas, same ratio as G3 (124x84)
const DUR = 2100, STILL = .16;
const T = { arrive:.14, cock:.22, hit:.30, thru:.48, land:.62 };
const lerp = (a,b,t) => a + (b-a)*t;
const clamp = t => t < 0 ? 0 : t > 1 ? 1 : t;
const ease = t => t*t*(3-2*t);
const mix = (a, b, t) => "#" + [1,3,5].map(i => {
  const A = parseInt(a.substr(i,2),16), B = parseInt(b.substr(i,2),16);
  return Math.round(A + (B-A)*t).toString(16).padStart(2,"0");
}).join("");

/* the goal: 7.32m by 2.44m, in world units */
const GW = 240, GH = 80, POSTR = 3.2, NETD = 62;
const SKIN = "#c98c5c", HAIR = "#2b1f15", GLOVE = "#f2f2ee", BOOT = "#1d1a17";
const NET = "rgba(205,225,210,.55)", NETB = "rgba(205,225,210,.28)";
const POST = "#f1f4f3", POSTD = "#b9c3c2";

/* the corners, as fractions of the mouth: the duel's own table, copied here
   only because the prototype runs outside index.html. In the app it reads
   H2_CORNER_AT. */
const CORNER_AT = (typeof H2_CORNER_AT !== "undefined") ? H2_CORNER_AT :
  { tl:{u:.17, v:.20}, tr:{u:.83, v:.20}, bl:{u:.19, v:.82}, br:{u:.81, v:.82} };

/* ---------------- the cameras ----------------
   tilt is the camera looking down, zoom is how near, zg is where the goal
   line is (negative is away from the camera). Everything else is where the
   men stand: the striker's x and z, the keeper on his line, an optional
   defender, and for a bent shot two control points out past the far post. */
const CAMS = {
  pen:    { tilt:-.30, zoom:1.18, zg:-250, shift:118,
            man:{x:12,  z:70,  s:1.30}, gk:{x:0, s:1.0}, def:null, bend:null, box:false },
  close:  { tilt:-.30, zoom:1.32, zg:-220, shift:128,
            man:{x:-150, z:125, s:1.42}, gk:{x:0, s:1.0}, def:null, bend:null, box:false },
  angle:  { tilt:-.27, zoom:1.02, zg:-300, shift:100,
            man:{x:-290, z:60, s:1.30}, gk:{x:8, s:1.0}, def:{x:-120, z:-170, s:1.08},
            bend:[{x:-150, z:-150},{x:250, z:-290}], box:true },
  curler: { tilt:-.25, zoom:.92, zg:-360, shift:92,
            man:{x:-130, z:30, s:1.26}, gk:{x:14, s:1.0}, def:{x:-40, z:-200, s:1.06},
            bend:[{x:-30, z:-190},{x:330, z:-350}], box:true },
};

/* which camera, read off the shape, exactly as G3 does */
function cameraFor(i, w, pen){
  if(pen) return "pen";
  let p = null;
  try { p = h2Spot(i, w); } catch(e){ p = null; }
  if(!p) return "close";
  if(p.line < 6) return "curler";
  return (p.x >= 34 && p.x <= 66) ? "close" : "angle";
}

/* ---------------- projection ----------------
   Zdog is linear: screen = o + x*ex + y*ey + z*ez. Four anchors under a root
   carrying the camera's tilt give the basis, and everything that is painted in
   2D (the ground, the stands, the number on his back) goes through it so it
   lands where the 3D things land. */
function basis(cam){
  const C = CAMS[cam] || CAMS.close;
  const root = new Zdog.Anchor({ rotate:{x:C.tilt} });
  const o = new Zdog.Anchor({ addTo:root });
  const ax = new Zdog.Anchor({ addTo:root, translate:{x:1} });
  const ay = new Zdog.Anchor({ addTo:root, translate:{y:1} });
  const az = new Zdog.Anchor({ addTo:root, translate:{z:1} });
  root.updateGraph();
  const z = C.zoom, P = a => ({x:a.renderOrigin.x*z, y:a.renderOrigin.y*z});
  const O = P(o), X = P(ax), Y = P(ay), Z = P(az);
  const ex = {x:X.x-O.x, y:X.y-O.y}, ey = {x:Y.x-O.x, y:Y.y-O.y}, ez = {x:Z.x-O.x, y:Z.y-O.y};
  const sh = C.shift || 0;
  return (x, y, zz) => ({ x: CW/2 + O.x + x*ex.x + y*ey.x + zz*ez.x,
                          y: CH/2 + sh + O.y + x*ex.y + y*ey.y + zz*ez.y });
}
/* the mouth in screen space: the inside of the posts, under the bar, down to
   the goal line. The picker is pinned to these four numbers. */
function mouthPx(cam){
  const C = CAMS[cam] || CAMS.close, p = basis(cam);
  const tl = p(-GW/2 + POSTR, -GH + POSTR, C.zg), br = p(GW/2 - POSTR, 0, C.zg);
  return { l: tl.x, r: br.x, t: tl.y, b: br.y };
}
function mouth(cam){
  const m = mouthPx(cam);
  const pc = n => Math.round(n * 1000) / 10;
  return { L: pc(m.l/CW), R: pc((CW-m.r)/CW), T: pc(m.t/CH), H: pc((m.b-m.t)/CH), w: CW, h: CH };
}
function marks(cam, flip){
  const C = CAMS[cam] || CAMS.close, p = basis(cam);
  const fx = v => flip ? -v : v;
  const pc = n => Math.round(n * 1000) / 10;
  const hold = n => Math.max(8, Math.min(92, n));
  const g = p(fx(C.gk.x), 6, C.zg + 6), m = p(fx(C.man.x), 0, C.man.z);
  return { gk:{x: hold(pc(g.x/CW)), y: pc(g.y/CH)}, man:{x: hold(pc(m.x/CW))} };
}

/* ---------------- a footballer ----------------
   Origin between the boots, y up is negative. s scales the whole man, stroke
   included, because Zdog's scale leaves stroke alone and a bigger man with
   thin limbs is a further-away man drawn wrong. */
function figure(addTo, kit, shorts, s, gloves){
  const S = s || 1, K = kit, Kd = mix(kit, "#000000", .32), SH = shorts;
  const root = new Zdog.Anchor({ addTo:addTo });
  const body = new Zdog.Anchor({ addTo:root });
  const legs = [], arms = [];
  for(const side of [-1, 1]){
    const hip = new Zdog.Anchor({ addTo:body, translate:{x:side*7*S, y:-24*S} });
    new Zdog.Shape({ addTo:hip, path:[{y:0},{y:13*S}], stroke:9.5*S, color:SKIN });
    new Zdog.Shape({ addTo:hip, path:[{y:12*S},{y:22*S}], stroke:10*S, color:mix(SH,"#ffffff",.35) }); // sock
    new Zdog.Shape({ addTo:hip, path:[{y:22*S, z:1*S},{y:23*S, z:6*S}], stroke:8*S, color:BOOT });        // boot
    legs.push(hip);
  }
  /* shorts: two short legs rather than one wide band, so they read as shorts */
  for(const side of [-1, 1])
    new Zdog.Shape({ addTo:body, path:[{x:side*6*S, y:-29*S},{x:side*6.5*S, y:-19*S}], stroke:12*S, color:SH });
  /* THE SHIRT: one capsule, a shade down his left side at the same depth so it
     draws on top as a sliver rather than as a second shirt, and a collar */
  new Zdog.Shape({ addTo:body, path:[{y:-30*S},{y:-52*S}], stroke:21*S, color:K });                   // torso
  new Zdog.Shape({ addTo:body, path:[{y:-31*S},{y:-51*S}], stroke:6*S, color:Kd, translate:{x:-7*S} }); // shade
  new Zdog.Shape({ addTo:body, path:[{x:-5*S, y:-57*S},{x:5*S, y:-57*S}], stroke:5*S, color:Kd });     // collar
  for(const side of [-1, 1]){
    const sh = new Zdog.Anchor({ addTo:body, translate:{x:side*12*S, y:-50*S} });
    new Zdog.Shape({ addTo:sh, path:[{y:0},{y:9*S}], stroke:8.5*S, color:K });          // sleeve
    new Zdog.Shape({ addTo:sh, path:[{y:8.5*S},{y:9.5*S}], stroke:8.5*S, color:Kd });   // the sleeve's hem
    new Zdog.Shape({ addTo:sh, path:[{y:8*S},{y:24*S}], stroke:7.5*S, color:SKIN });    // arm
    new Zdog.Shape({ addTo:sh, path:[{y:24*S},{y:27*S}], stroke:gloves ? 9.5*S : 7.5*S, color:gloves ? GLOVE : SKIN }); // hand
    arms.push(sh);
  }
  const head = new Zdog.Anchor({ addTo:body, translate:{y:-66*S} });
  new Zdog.Shape({ addTo:head, stroke:17*S, color:SKIN });
  new Zdog.Shape({ addTo:head, stroke:17*S, color:HAIR, translate:{y:-2.5*S, z:-2*S} });
  new Zdog.Shape({ addTo:head, path:[{x:-6*S, y:-4*S},{x:6*S, y:-4*S}], stroke:9*S, color:HAIR, translate:{z:-3*S} });
  return { root:root, body:body, legs:legs, arms:arms, head:head, s:S };
}
function pose(f, p){
  /* p: {lL,lR,aL,aR} rotations about x (swing fore/aft), {zL,zR,azL,azR} about z (sideways), lean */
  f.legs[0].rotate.x = p.lL || 0;  f.legs[1].rotate.x = p.lR || 0;
  f.legs[0].rotate.z = p.zL || 0;  f.legs[1].rotate.z = p.zR || 0;
  f.arms[0].rotate.x = p.aL || 0;  f.arms[1].rotate.x = p.aR || 0;
  f.arms[0].rotate.z = p.azL || 0; f.arms[1].rotate.z = p.azR || 0;
  f.body.rotate.x = p.lean || 0;   f.body.rotate.z = p.tilt || 0;
  f.body.translate.y = p.crouch || 0;
}

/* ---------------- the goal ----------------
   Posts and bar as thick strokes, the net as polylines so it can be bent. */
function goal(addTo, zg){
  const g = new Zdog.Anchor({ addTo:addTo, translate:{z:zg} });
  const L = -GW/2, R = GW/2, TOP = -GH, BK = -NETD;
  /* the net first so the frame draws over it */
  const net = new Zdog.Anchor({ addTo:g });
  const lines = [];
  const poly = (pts, col) => { const s = new Zdog.Shape({ addTo:net, path:pts, stroke:1.1, color:col, closed:false }); lines.push({s:s, base:pts.map(q=>({x:q.x,y:q.y,z:q.z}))}); return s; };
  const NX = 14, NY = 6, NZ = 4;
  /* back panel */
  for(let i=0;i<=NX;i++){ const x = L + (R-L)*i/NX; const pts=[]; for(let j=0;j<=NY;j++) pts.push({x:x, y:TOP + GH*j/NY, z:BK}); poly(pts, NET); }
  for(let j=0;j<=NY;j++){ const y = TOP + GH*j/NY; const pts=[]; for(let i=0;i<=NX;i++) pts.push({x:L + (R-L)*i/NX, y:y, z:BK}); poly(pts, NET); }
  /* roof */
  for(let i=0;i<=NX;i+=2){ const x = L + (R-L)*i/NX; poly([{x:x,y:TOP,z:0},{x:x,y:TOP,z:BK}], NETB); }
  for(let k=1;k<NZ;k++){ const z = BK*k/NZ; poly([{x:L,y:TOP,z:z},{x:R,y:TOP,z:z}], NETB); }
  /* sides */
  for(const x of [L, R]){
    for(let k=1;k<NZ;k++){ const z = BK*k/NZ; poly([{x:x,y:TOP,z:z},{x:x,y:0,z:z}], NETB); }
    for(let j=1;j<NY;j++){ const y = TOP + GH*j/NY; poly([{x:x,y:y,z:0},{x:x,y:y,z:BK}], NETB); }
  }
  /* the frame */
  const frame = new Zdog.Anchor({ addTo:g });
  new Zdog.Shape({ addTo:frame, path:[{x:L,y:0},{x:L,y:TOP}], stroke:POSTR*2, color:POST });
  new Zdog.Shape({ addTo:frame, path:[{x:R,y:0},{x:R,y:TOP}], stroke:POSTR*2, color:POST });
  new Zdog.Shape({ addTo:frame, path:[{x:L,y:TOP},{x:R,y:TOP}], stroke:POSTR*2, color:POST });
  new Zdog.Shape({ addTo:frame, path:[{x:L+1.2,y:0},{x:L+1.2,y:TOP}], stroke:1.4, color:POSTD, translate:{z:-1.5} });
  new Zdog.Shape({ addTo:frame, path:[{x:R+1.2,y:0},{x:R+1.2,y:TOP}], stroke:1.4, color:POSTD, translate:{z:-1.5} });
  /* back stanchions */
  for(const x of [L, R]) new Zdog.Shape({ addTo:frame, path:[{x:x,y:TOP,z:0},{x:x,y:0,z:BK}], stroke:2.4, color:POSTD });
  return { g:g, lines:lines };
}
/* bend the net around a hit point: every polyline point within reach goes
   back by an amount that falls off with distance, and the shape is told. */
function bulgeNet(G, hit, amt){
  for(const l of G.lines){
    let moved = false;
    for(let i=0;i<l.s.path.length;i++){
      const b = l.base[i], p = l.s.path[i];
      if(!amt || !hit){ if(p.z !== b.z){ p.x=b.x; p.y=b.y; p.z=b.z; moved = true; } continue; }
      const d = Math.hypot(b.x-hit.x, b.y-hit.y) / 55;
      const w = Math.max(0, 1 - d*d);
      const nz = b.z - 42*amt*w;
      if(nz !== p.z){ p.z = nz; moved = true; }
    }
    if(moved) l.s.updatePath();
  }
}

/* ---------------- the ball ----------------
   A white sphere with a dark patch group that turns as it flies. */
function ball(addTo){
  const a = new Zdog.Anchor({ addTo:addTo });
  new Zdog.Shape({ addTo:a, stroke:19, color:"#ffffff" });
  const spin = new Zdog.Anchor({ addTo:a });
  /* place each patch on the surface: rotate an anchor, put the patch at radius */
  for(const r of [{x:0,y:0},{x:1.9,y:1.1},{x:-1.9,y:1.1},{x:0,y:2.2},{x:1.2,y:3.3},{x:2.8,y:-1.4}]){
    const h = new Zdog.Anchor({ addTo:spin, rotate:{x:r.y, y:r.x} });
    new Zdog.Ellipse({ addTo:h, diameter:5.4, fill:true, color:"#232a2e", stroke:false, translate:{z:7.2} });
  }
  const ghosts = [.22, .14, .08, .04].map(al => new Zdog.Shape({ addTo:addTo, stroke:19, color:"rgba(255,255,255," + al + ")", visible:false }));
  return { a:a, spin:spin, ghosts:ghosts };
}

/* ---------------- the flight, in world xz with a height ----------------
   boot -> target. Straight: lerp with lift. Bent: a cubic through two control
   points set outside the far post. */
/* where the ball sits before it is struck: just outside his kicking foot */
function bootAt(C, flip){
  const fx = v => flip ? -v : v, s = C.man.s;
  return { x: fx(C.man.x) + fx(9*s), y: -7, z: C.man.z - 11*s };
}
function flight(C, flip, target, t){
  const fx = v => flip ? -v : v;
  const a0 = bootAt(C, flip), a = {x:a0.x, z:a0.z}, b = {x:target.x, z:C.zg - 6};
  const m = 1-t;
  let x, z;
  if(!C.bend){ x = lerp(a.x, b.x, t); z = lerp(a.z, b.z, t); }
  else {
    const p = {x:fx(C.bend[0].x), z:C.bend[0].z}, q = {x:fx(C.bend[1].x), z:C.bend[1].z};
    const A = m*m*m, B = 3*t*m*m, Cc = 3*t*t*m, D = t*t*t;
    x = A*a.x + B*p.x + Cc*q.x + D*b.x; z = A*a.z + B*p.z + Cc*q.z + D*b.z;
  }
  /* height: leaves the ground, peaks early, arrives at the corner's height */
  const y = lerp(-7, target.y, t) - 26*Math.sin(t*Math.PI)*(1 - .6*t);
  return {x:x, y:y, z:z};
}
function targetFor(corner){
  const uv = CORNER_AT[corner] || {u:.5, v:.35};
  return { x: -GW/2 + POSTR + (GW - 2*POSTR)*uv.u, y: -(GH - POSTR) + (GH - POSTR)*uv.v };
}

/* ---------------- the ground, in 2D ----------------
   Painted under the Zdog scene through the same projection: roof, a tier of
   crowd, hoardings, then grass with stripes that pinch towards the goal. */
let crowd = null;
function ground(ctx, cam, flip, box, W, H, p, when){
  const C = CAMS[cam] || CAMS.close;
  const gl = p(0, 0, C.zg).y;                       // goal line on screen
  const far = p(0, 0, C.zg - 150).y;                // the hoardings
  const grassTop = far;
  /* roof and stand */
  ctx.fillStyle = "#070b0e"; ctx.fillRect(0, 0, W, H);
  const standTop = grassTop - 54, standBot = grassTop - 14;
  const sg = ctx.createLinearGradient(0, standTop, 0, standBot);
  sg.addColorStop(0, "#1a1714"); sg.addColorStop(1, "#2a2520");
  ctx.fillStyle = sg; ctx.fillRect(0, standTop, W, standBot - standTop);
  if(!crowd){ crowd = []; let h = 7; for(let i=0;i<2600;i++){ h = (h*1103515245 + 12345) >>> 0; crowd.push(h); } }
  const CR = ["#6b5f52","#8a7c6b","#4a4038","#7a5a52","#5a6070","#8a8478","#6b4a44","#55504a","#93887a","#4f5a52","#7d6a5e","#3d3730","#2f3a4a","#6d7a88","#a89b88"];
  for(let i=0;i<crowd.length;i++){
    const h = crowd[i], x = (h % 1000) / 1000 * W, row = (h >>> 10) % 14, y = standTop + 4 + row*3.4 + ((h>>>20)%3);
    if((h >>> 5) % 11 === 0) continue;
    ctx.fillStyle = (h >>> 7) % 173 === 0 ? "#e6dfcd" : mix(CR[(h>>>3) % CR.length], "#1a1714", (13-row)/13*.6);
    ctx.fillRect(x, y, 2.2, 2.6);
  }
  /* floodlight glow across the stand */
  const fl = ctx.createRadialGradient(W/2, standBot, 10, W/2, standBot, W*.7);
  fl.addColorStop(0, "rgba(255,244,214,.10)"); fl.addColorStop(1, "rgba(255,244,214,0)");
  ctx.fillStyle = fl; ctx.fillRect(0, standTop, W, standBot - standTop);
  /* hoardings */
  const ADS = ["#a83236","#d6d1c4","#23508f","#c9a733","#186344","#8a3a63","#d6d1c4","#2f6f9c"];
  ctx.fillStyle = "#0d0b09"; ctx.fillRect(0, standBot, W, grassTop - standBot);
  for(let x=0, k=0; x<W; x+=52, k++){
    ctx.fillStyle = ADS[k % ADS.length]; ctx.fillRect(x+1, standBot+1, 50, grassTop - standBot - 3);
    ctx.fillStyle = "rgba(255,255,255,.18)"; ctx.fillRect(x+1, standBot+1, 50, 2);
  }
  /* grass */
  const gg = ctx.createLinearGradient(0, grassTop, 0, H);
  gg.addColorStop(0, "#1b5a2c"); gg.addColorStop(.45, "#1f6a33"); gg.addColorStop(1, "#174f27");
  ctx.fillStyle = gg; ctx.fillRect(0, grassTop, W, H - grassTop);
  /* stripes, pinched towards the goal: a band at depth z spans the frame at
     the camera and narrows to the goal's own width plus a margin at the line */
  const span = z => { const t = clamp((z - C.zg) / (C.man.z + 200 - C.zg)); return lerp(GW*1.45 * C.zoom, W*1.25, t); };
  ctx.fillStyle = "rgba(0,0,0,.11)";
  for(let k=-3;k<12;k++){
    const z0 = C.zg - 150 + k*58, z1 = z0 + 29;
    if(k % 2) continue;
    const y0 = p(0,0,z0).y, y1 = p(0,0,z1).y, w0 = span(z0), w1 = span(z1);
    ctx.beginPath(); ctx.moveTo(W/2 - w0/2, y0); ctx.lineTo(W/2 + w0/2, y0);
    ctx.lineTo(W/2 + w1/2, y1); ctx.lineTo(W/2 - w1/2, y1); ctx.closePath(); ctx.fill();
  }
  /* light pooled in front of the goal */
  const pool = ctx.createRadialGradient(W/2, gl + 20, 20, W/2, gl + 20, W*.62);
  pool.addColorStop(0, "rgba(255,250,225,.13)"); pool.addColorStop(1, "rgba(255,250,225,0)");
  ctx.fillStyle = pool; ctx.fillRect(0, grassTop, W, H - grassTop);
  /* the lines: goal line, six-yard box, and the edge of the area when the shot is from outside it */
  ctx.strokeStyle = "rgba(255,255,255,.85)"; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(0, gl); ctx.lineTo(W, gl); ctx.stroke();
  const sixW = GW/2 + 55, sixZ = C.zg + 55;
  const a = p(-sixW, 0, C.zg), b = p(-sixW, 0, sixZ), c = p(sixW, 0, sixZ), d = p(sixW, 0, C.zg);
  ctx.strokeStyle = "rgba(255,255,255,.55)"; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.lineTo(c.x, c.y); ctx.lineTo(d.x, d.y); ctx.stroke();
  if(box){
    const bw = GW/2 + 200, bz = C.zg + 200;
    const e = p(-bw, 0, C.zg), f = p(-bw*1.08, 0, bz), g = p(bw*1.08, 0, bz), h = p(bw, 0, C.zg);
    ctx.beginPath(); ctx.moveTo(e.x, e.y); ctx.lineTo(f.x, f.y); ctx.lineTo(g.x, g.y); ctx.lineTo(h.x, h.y); ctx.stroke();
  }
  /* the penalty spot */
  const ps = p(0, 0, C.zg + 150);
  ctx.fillStyle = "rgba(255,255,255,.8)"; ctx.beginPath(); ctx.ellipse(ps.x, ps.y, 3.2, 1.4, 0, 0, Math.PI*2); ctx.fill();
  /* two floodlight pylons, as the glare they throw into the lens */
  for(const x of [W*.08, W*.92]){
    const g = ctx.createRadialGradient(x, standTop - 26, 2, x, standTop - 26, 120);
    g.addColorStop(0, "rgba(255,248,224,.55)"); g.addColorStop(.12, "rgba(255,248,224,.18)"); g.addColorStop(1, "rgba(255,248,224,0)");
    ctx.fillStyle = g; ctx.fillRect(x - 120, standTop - 150, 240, 240);
    ctx.fillStyle = "#fff8e0"; ctx.fillRect(x - 7, standTop - 29, 14, 5);
  }
  /* phones go up in the stand when it goes in */
  if(when && when.out === "scored" && when.u > .62){
    const n = Math.floor(when.u * 60);
    for(let i=0;i<14;i++){
      const h = (n*2654435761 ^ i*40503) >>> 0;
      if(h % 3) continue;
      ctx.fillStyle = "rgba(255,255,255,.9)";
      ctx.fillRect((h % 997)/997*W, standTop + 4 + ((h >>> 10) % 44), 2.5, 2.5);
    }
  }
  /* vignette */
  const v = ctx.createRadialGradient(W/2, H*.55, H*.35, W/2, H*.55, W*.75);
  v.addColorStop(0, "rgba(0,0,0,0)"); v.addColorStop(1, "rgba(0,0,0,.45)");
  ctx.fillStyle = v; ctx.fillRect(0, 0, W, H);
}
function shadow(ctx, p, x, z, rx, ry, a){
  const q = p(x, 0, z);
  ctx.fillStyle = "rgba(0,0,0," + (a == null ? .28 : a) + ")";
  ctx.beginPath(); ctx.ellipse(q.x, q.y, rx, ry, 0, 0, Math.PI*2); ctx.fill();
}

/* ---------------- building a scene ----------------
   One illustration per armed shot. Rebuilt when the signature changes. */
let illo = null, built = null, ctx2 = null;
function build(cv, cfg){
  const C = CAMS[cfg.cam] || CAMS.close;
  const F = !!cfg.flip, fx = v => F ? -v : v;
  illo = new Zdog.Illustration({ element:cv, zoom:C.zoom, rotate:{x:C.tilt}, translate:{y:(C.shift||0)/C.zoom} });
  const world = new Zdog.Anchor({ addTo:illo });
  const G = goal(world, C.zg);
  const gk = figure(world, cfg.gkKit, cfg.gkShorts, C.gk.s, true);
  gk.root.translate = { x: fx(C.gk.x), y: 0, z: C.zg + 8 };
  let def = null;
  if(C.def){ def = figure(world, cfg.gkKit, cfg.gkShorts, C.def.s, false); def.root.translate = { x: fx(C.def.x), y:0, z:C.def.z }; def.root.rotate.y = F ? -.5 : .5; }
  const man = figure(world, cfg.kit, cfg.shorts, C.man.s, false);
  man.root.translate = { x: fx(C.man.x), y: 0, z: C.man.z };
  man.root.rotate.y = Math.PI + (F ? .18 : -.18);   // his back to us, turned a touch towards goal
  const B = ball(world);
  built = { C:C, F:F, G:G, gk:gk, def:def, man:man, B:B, p:basis(cfg.cam), target:targetFor(cfg.shot), sig:cfg.sig };
}

/* ---------------- one frame ----------------
   Everything in the frame read off u. */
function scene(cfg, u){
  const X = built, C = X.C, F = X.F, fx = v => F ? -v : v, p = X.p;
  const out = cfg.out, tgt = X.target;

  /* the striker. He has his back to us (rotate.y is pi), so his local -x leg
     is the one on the RIGHT of the screen, which is the side the ball sits on
     for an unflipped shot: legs[0] kicks, legs[1] plants. */
  const m = X.man, kickIdx = F ? 1 : 0, plantIdx = F ? 0 : 1;
  let mx = fx(C.man.x), mz = C.man.z;
  if(u < T.arrive){
    const a = ease(u / T.arrive), w = Math.sin(u*46);
    mx = lerp(fx(C.man.x) + fx(-55), fx(C.man.x), a); mz = lerp(C.man.z + 95, C.man.z, a);
    const P = {}; P["l"+(kickIdx?"R":"L")] = .9*w; P["l"+(plantIdx?"R":"L")] = -.9*w;
    P["a"+(kickIdx?"R":"L")] = -.8*w; P["a"+(plantIdx?"R":"L")] = .8*w; P.lean = .12;
    pose(m, P);
  } else {
    let kick, plant, arm, lean;
    if(u < T.cock){ const t = ease((u-T.arrive)/(T.cock-T.arrive)); kick = lerp(0, -1.5, t); plant = lerp(0, .15, t); arm = lerp(0, .9, t); lean = lerp(.12, -.05, t); }
    else if(u < T.hit){ const t = ease((u-T.cock)/(T.hit-T.cock)); kick = lerp(-1.5, .3, t); plant = .15; arm = lerp(.9, .4, t); lean = lerp(-.05, .15, t); }
    else if(u < T.thru){ const t = ease((u-T.hit)/(T.thru-T.hit)); kick = lerp(.3, 1.55, t); plant = lerp(.15, -.05, t); arm = lerp(.4, -.7, t); lean = lerp(.15, .32, t); }
    else { const t = ease(clamp((u-T.thru)/.25)); kick = lerp(1.55, .45, t); plant = -.05; arm = lerp(-.7, -.2, t); lean = lerp(.32, .14, t); }
    const P = {}; P["l"+(kickIdx?"R":"L")] = kick; P["l"+(plantIdx?"R":"L")] = plant;
    P["a"+(kickIdx?"R":"L")] = -arm*.6; P["a"+(plantIdx?"R":"L")] = arm; P.lean = lean; P.tilt = F ? .08 : -.08;
    if(out === "scored" && u > T.land + .06){ const t = ease(clamp((u - T.land - .06)/.2)); P.azL = lerp(0, 2.6, t); P.azR = lerp(0, -2.6, t); P.aL = P.aR = 0; P.lean = lerp(lean, -.1, t); P.crouch = -5*Math.sin(t*Math.PI); }
    pose(m, P);
  }
  m.root.translate.x = mx; m.root.translate.z = mz;

  /* THE KEEPER DIVES AT THE CORNER, not sideways. The dive is solved from
     where the gloves have to end up: his body is rotated about his feet until
     it points at the corner, both arms go up along it, and his feet are then
     put wherever leaves the glove tips on the spot. A save reaches the corner
     itself; a goal falls short of it by a quarter, which is what leaves him
     beaten rather than standing still. */
  const gk = X.gk, go = cfg.dive ? targetFor(cfg.dive) : null, gs = C.gk.s;
  const d = ease(clamp((u - T.hit) / .26));
  let gx = fx(C.gk.x), gyRoot = 0;
  if(go && d > 0){
    const left = go.x < 0, low = go.y > -GH*.5;
    const reach = out === "saved" ? 1 : (low ? .8 : .76);
    const P = { x: go.x*reach, y: Math.min(-9, go.y*reach) };     // where the gloves go
    const a = (left ? -1 : 1) * (low ? 1.42 : 1.02);             // body angle, head to the corner
    const R = 76*gs;                                              // feet to glove tips
    const rootX = P.x - R*Math.sin(a), rootY = Math.min(0, P.y + R*Math.cos(a));
    gx = lerp(fx(C.gk.x), rootX, d);
    gyRoot = lerp(0, rootY, d) - 9*gs*Math.sin(d*Math.PI);        // a little air on the way
    const str = Math.PI - .25;                                    // arms along the body, past the head
    pose(gk, { tilt: lerp(0, a, d), azL: lerp(.75, str, d), azR: lerp(-.75, -str, d), aL:0, aR:0,
               zL: (left ? .25 : -.25)*d, zR: (left ? .25 : -.25)*d, lL: .45*d, lR: -.25*d, lean: lerp(.18, .05, d) });
    if(out === "saved" && u > T.land){ /* he has it: the arms gather it in */
      const t = ease(clamp((u-T.land)/.2));
      pose(gk, { tilt: a, azL: lerp(str, 1.95, t), azR: lerp(-str, -1.95, t), zL: left ? .25 : -.25, zR: left ? .25 : -.25, lL:.45, lR:-.25, lean:.05 });
    }
  } else {
    const b = Math.sin(u*9)*.03;
    pose(gk, { zL:-.28, zR:.28, azL:.75, azR:-.75, aL:.35, aR:.35, lean:.18 + b, crouch: 4 });
  }
  gk.root.translate.x = gx; gk.root.translate.y = gyRoot;

  /* the defender just stands there, which is what he was doing */
  if(X.def) pose(X.def, { zL:-.15, zR:.15, azL:.25, azR:-.25, lean:.05 });

  /* the ball */
  const B = X.B, q = clamp((u - T.hit) / (T.land - T.hit));
  let bx, by, bz, bs;
  const boot = bootAt(C, F);
  if(u < T.hit){ bx = boot.x; by = boot.y; bz = boot.z; bs = 1; }
  else if(out === "over"){ const f = flight(C, F, {x:tgt.x, y:-GH-60}, q); bx = f.x; by = f.y - 30*q; bz = f.z; bs = 1 - .35*q; }
  else if(out === "saved" && q >= 1){ const t = clamp((u - T.land)/.3); const f = flight(C, F, tgt, 1); bx = f.x + (go && go.x < 0 ? -1 : 1)*40*t; by = Math.min(-7, f.y + 60*t*t); bz = f.z + 90*t; bs = .62 + .2*t; }
  else if(out === "scored" && q >= 1){ const t = clamp((u - T.land)/.3); bx = tgt.x - 6*t; by = Math.min(-7, lerp(tgt.y, -7, t*t)); bz = C.zg - NETD + 10 - 20*(1-t); bs = .6; }
  else { const f = flight(C, F, tgt, q); bx = f.x; by = f.y; bz = f.z; bs = 1 - .38*q; }
  B.a.translate = { x:bx, y:by, z:bz }; B.a.scale = bs;
  B.spin.rotate.x = u*14; B.spin.rotate.y = u*5 + (F ? -1 : 1)*q*3;
  /* the trail: ghosts of where it just was, only while it is in the air */
  B.ghosts.forEach((g, k) => {
    const tt = q - (k+1)*.055;
    const on = q > 0 && q < 1 && tt > 0 && out !== "over";
    g.visible = on;
    if(on){ const f = flight(C, F, tgt, tt); g.translate = { x:f.x, y:f.y, z:f.z }; g.scale = (1 - .38*tt) * (1 - k*.12); }
  });

  /* the net */
  const hit = T.land;
  const bulge = out === "scored" && u > hit ? Math.max(0, 1 - (u-hit)/.3) * (1 - .4*Math.sin((u-hit)*40)) : 0;
  bulgeNet(X.G, out === "scored" ? tgt : null, bulge);

  /* paint: ground in 2D first, then the graph, then the shadows go under the men
     so they are drawn before: the shadows are 2D, so they are part of the ground */
  const cv = illo.element, W = CW, H = CH;
  illo.onPrerender = function(c){
    c.save(); c.setTransform(1,0,0,1,0,0);
    const pr = cv.width / W;
    c.scale(pr, pr);
    ground(c, cfg.cam, F, C.box, W, H, p, {u:u, out:out});
    shadow(c, p, gx, C.zg + 8, 22*C.gk.s, 7*C.gk.s, go && d > 0 ? .18 : .28);
    if(X.def) shadow(c, p, fx(C.def.x), C.def.z, 20, 6.5);
    shadow(c, p, mx, mz, 26*C.man.s*.8, 8*C.man.s*.8);
    if(u >= T.hit && (out !== "over")){ const bb = p(bx, 0, bz); c.fillStyle = "rgba(0,0,0,.2)"; c.beginPath(); c.ellipse(bb.x, bb.y, 8*bs, 3*bs, 0, 0, Math.PI*2); c.fill(); }
    c.restore();
  };
  illo.updateRenderGraph();
  /* the number on his back, in 2D over the torso */
  const no = String(cfg.no == null ? "" : cfg.no).replace(/[^0-9]/g, "").slice(-2);
  if(no && u >= T.arrive){
    const c = ctx2, pr = cv.width / W, s = C.man.s;
    const t = p(mx + (F ? -1 : 1)*0, -42*s, mz);
    c.save(); c.setTransform(pr,0,0,pr,0,0);
    c.font = "800 " + Math.round(15*s) + "px system-ui, sans-serif"; c.textAlign = "center"; c.textBaseline = "middle";
    c.fillStyle = cfg.ink || "#ffffff"; c.globalAlpha = .92;
    c.fillText(no, t.x, t.y);
    c.restore();
  }
}

/* ================= driving it, exactly as G3 ================= */
let PEND = null, raf = null, t0 = 0, sig = "";
function arm(cfg){
  cfg.rm = still();
  PEND = cfg;
  if(cfg.sig !== sig){ sig = cfg.sig; t0 = 0; built = null; }
  if(raf) return;
  try { raf = requestAnimationFrame(mount); } catch(e){ raf = null; }
}
function canvasEl(){
  try { const el = document.getElementById("g3c"); return (el && el.getContext) ? el : null; } catch(e){ return null; }
}
function paint(u, el){
  const cv = el || canvasEl();
  if(!cv || !cv.getContext || !PEND) return false;
  if(!built || built.sig !== PEND.sig || !illo || illo.element !== cv){
    if(cv.width !== CW * (window.devicePixelRatio || 1)){ /* Zdog sets the pixel ratio itself */ }
    build(cv, PEND); ctx2 = cv.getContext("2d");
  }
  scene(PEND, u);
  return true;
}
function still(){ try { return !!matchMedia("(prefers-reduced-motion:reduce)").matches; } catch(e){ return false; } }
function mount(now){
  raf = null;
  if(!PEND) return;
  if(PEND.hold || PEND.rm){ paint(PEND.hold ? STILL : 1); return; }
  if(!t0) t0 = now || 0;
  const u = clamp(((now || 0) - t0) / DUR);
  if(!paint(u) || u >= 1) return;
  try { raf = requestAnimationFrame(mount); } catch(e){ raf = null; }
}
function stop(){ if(raf){ try { cancelAnimationFrame(raf); } catch(e){} raf = null; } }
function sweep(el, step){
  let bad = 0;
  for(let u=0; u<=1; u+=(step || .004)){ try { if(!paint(u, el)) return -1; } catch(e){ bad++; } }
  return bad;
}
return { arm:arm, stop:stop, paint:paint, sweep:sweep, mouth:mouth, marks:marks, cameraFor:cameraFor, mix:mix,
         size:{CW:CW, CH:CH, PX:1, dur:DUR, still:STILL}, clock:T, cams:CAMS };
})();
