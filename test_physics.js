/* Runs the soft-body simulation headlessly and MEASURES it.

   The renderer cannot be seen from here, so the only way to know the physics is real
   rather than decorative is to step it and measure: does it settle, does it stay
   stable, and does changing the recipe actually change how it moves.

   RUN:  node test_physics.js
*/
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const html = fs.readFileSync(path.join(__dirname, 'slime_game.html'), 'utf8');
const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);

let pass = 0, fail = 0;
const check = (n, c, x) => {
  if (c) { pass++; console.log('  PASS  ' + n); }
  else { fail++; console.log('  FAIL  ' + n + (x ? '   -> ' + x : '')); }
};

/* -------------------------------------------------- canvas + DOM stub */
const KEYS = ['matBars', 'statBars', 'ingredients', 'inv', 'traders', 'dealCard',
              'mix-fill', 'mixPct', 'value', 'nameTag', 'matTag', 'behaviour', 'coins',
              'msg', 'myBlob', 'myName', 'myVal', 'theirBlob', 'theirName', 'theirVal',
              'theirLbl', 'invEmpty', 'acceptBtn', 'counterBtn', 'declineBtn', 'cv',
              'bowlWrap', 'nav-lab', 'nav-trade', 'saveBtn', 'resetBtn', 'subtitle',
              'tab-lab', 'tab-trade'];
const els = {};
function el(id) {
  if (els[id]) return els[id];
  const e = {
    id, textContent: '', innerHTML: '', value: '', disabled: false,
    clientWidth: 420, clientHeight: 520, width: 420, height: 520,
    style: new Proxy({}, { get: (t, k) => t[k] || '', set: (t, k, v) => { t[k] = v; return true; } }),
    dataset: {}, _h: {},
    classList: { _s: new Set(), add(c) { this._s.add(c); }, remove(c) { this._s.delete(c); },
                 contains(c) { return this._s.has(c); }, toggle(c, f) { f ? this._s.add(c) : this._s.delete(c); } },
    addEventListener(ev, fn) { (e._h[ev] = e._h[ev] || []).push(fn); },
    removeEventListener() {},
    querySelector() { return el('q'); },
    querySelectorAll() { return []; },
    appendChild(c) { return c; },
    getBoundingClientRect() { return { left: 0, top: 0, width: 420, height: 520 }; },
    getContext() { return CTX; },
    focus() {},
  };
  els[id] = e; return e;
}
// a 2D context that accepts everything and returns a gradient stub
const CTX = new Proxy({}, {
  get: (t, k) => {
    if (k === 'createRadialGradient' || k === 'createLinearGradient') return () => ({ addColorStop() {} });
    if (k === 'measureText') return () => ({ width: 10 });
    return () => {};
  },
  set: () => true,
});
for (const k of KEYS) el(k);

global.document = {
  getElementById: id => el(id),
  querySelectorAll: () => [],
  createElement: t => el(t),
  addEventListener() {},
  body: el('body'), documentElement: el('html'), hidden: false,
};
const winH = {};
global.window = {
  addEventListener(ev, fn) { (winH[ev] = winH[ev] || []).push(fn); },
  removeEventListener() {}, innerWidth: 420, innerHeight: 520, devicePixelRatio: 1,
  visualViewport: { width: 420, height: 520 },
};
const store = {};
global.localStorage = { getItem: k => (k in store ? store[k] : null),
  setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } };
global.performance = { now: () => Date.now() };
global.requestAnimationFrame = () => 0;          // no render loop; we step by hand
global.setTimeout = () => 0;
global.clearTimeout = () => {};
global.setInterval = () => 0;

const box = { console, document: global.document, window: global.window,
              localStorage: global.localStorage, performance: global.performance,
              setTimeout: global.setTimeout, clearTimeout: global.clearTimeout,
              requestAnimationFrame: global.requestAnimationFrame,
              Math, isFinite, JSON, Object, Array, Number, String, Date, Proxy, Set, Map };
// the game calls window.addEventListener and window.devicePixelRatio, so the
// context object has to provide the window API itself
box.addEventListener = (ev, fn) => { (winH[ev] = winH[ev] || []).push(fn); };
box.removeEventListener = () => {};
box.devicePixelRatio = 1;
box.self = box; box.globalThis = box; box.window = box;
vm.createContext(box);

let bootErr = null;
try { vm.runInContext(scripts[0], box); vm.runInContext(scripts[1], box); }
catch (e) { bootErr = e; }
check('the game boots headlessly', !bootErr, bootErr && bootErr.message);
if (bootErr) { console.log('\n  RESULT  passes=' + pass + '  fails=' + (fail + 1)); process.exit(1); }

/* ------------------------------------------------------------ helpers */
const run = code => vm.runInContext(code, box);

function build(recipe, mix) {
  run(`batch.recipe = ${JSON.stringify(recipe)}; batch.mix = ${mix == null ? 1 : mix};
       refresh(false); blob.reset(VW/2, VH*0.5, simP.restR, baseRadius());`);
  // settle it onto the floor
  run(`for (let i = 0; i < 400; i++) blob.step(simP, bounds, null, 16);`);
}
function area() { return Math.abs(run(`blob.measure()`)); }
function centre() { return run(`({x: blob.centre.x, y: blob.centre.y})`); }
function inBounds() {
  return run(`blob.p.every(q => q.x >= bounds.l - 0.01 && q.x <= bounds.r + 0.01 &&
                               q.y >= bounds.t - 0.01 && q.y <= bounds.b + 0.01)`);
}
function allFinite() {
  return run(`blob.p.every(q => Number.isFinite(q.x) && Number.isFinite(q.y))`);
}

/* ------------------------------------------------------------- settling */
console.log('\n  ---- it settles like a body, not a screenshot ----');
build({ glue: 4, borax: 1.2 });
const restArea = area();
const targetArea = run(`blob.area0 * simP.size * simP.size`);
check('after settling the blob holds its volume',
      Math.abs(restArea / targetArea - 1) < 0.25,
      `area ${restArea.toFixed(0)} vs target ${targetArea.toFixed(0)}`);
check('every particle position is finite', allFinite());
check('the blob stays inside the bowl', inBounds());
check('it rests on the floor rather than floating',
      centre().y > VHmid(), `centre y ${centre().y.toFixed(0)}`);
function VHmid() { return run('VH') * 0.35; }

/* moving after settling must slow to a stop, not drift forever */
const before = run(`blob.p.map(q => ({x: q.x, y: q.y}))`);
run(`for (let i = 0; i < 120; i++) blob.step(simP, bounds, null, 16);`);
const after = run(`blob.p.map(q => ({x: q.x, y: q.y}))`);
let drift = 0;
for (let i = 0; i < before.length; i++) drift += Math.hypot(after[i].x - before[i].x, after[i].y - before[i].y);
drift /= before.length;
check('a settled blob stops moving', drift < 0.6, `${drift.toFixed(3)} px per particle over 120 frames`);

/* ---------------------------------------------------------- stability */
console.log('\n  ---- it does not explode ----');
let worst = null;
for (const r of [{ glue: 6 }, { glue: 4, borax: 3 }, { glue: 4, borax: 1.2, shampoo: 6 },
                 { glue: 4, borax: 1.6, soap: 10 }, { glue: 20, borax: 5, soap: 10, shampoo: 4 }]) {
  build(r);
  // hammer it the way a player would
  run(`for (let k = 0; k < 60; k++) {
         grip.active = true; grip.x = VW/2 + Math.sin(k)*140; grip.y = VH/2 + Math.cos(k*1.7)*90;
         blob.step(simP, bounds, grip, 16);
       }
       grip.active = false;
       for (let i = 0; i < 300; i++) blob.step(simP, bounds, null, 16);`);
  if (!allFinite() || !inBounds()) worst = JSON.stringify(r);
}
check('no recipe and no amount of dragging breaks the simulation', worst === null, worst);

/* --------------------------------------------- material changes behaviour */
console.log('\n  ---- the recipe changes how it MOVES ----');

/* Deform it, let go, and see how round it is afterwards.
   This is the distinction that matters: a runny slime SLUMPS and stays slumped, a
   stiff one springs back. "Which one goes quiet first" measures the wrong thing -
   a sluggish slime goes quiet precisely because it cannot move. */
function roundnessAfterDeform(recipe) {
  build(recipe);
  run(`grip.active = true; grip.x = blob.centre.x; grip.y = blob.centre.y - 240;
       for (let i = 0; i < 80; i++) blob.step(simP, bounds, grip, 16);
       grip.active = false;
       for (let i = 0; i < 240; i++) blob.step(simP, bounds, null, 16);`);
  // mean absolute deviation from a perfect circle, as a fraction of restR
  return run(`(() => {
    let s = 0;
    for (const q of blob.p) {
      const d = Math.hypot(q.x - blob.centre.x, q.y - blob.centre.y);
      s += Math.abs(d - simP.restR) / simP.restR;
    }
    return s / blob.p.length;
  })()`);
}

/** How much of a kick is left after a fixed time. "Snaps back faster" means the
 *  deviation is mostly gone already, so a stiff slime gives a SMALLER number.
 *  Counting sign crossings was too coarse to separate them. */
function residualAfterKick(recipe) {
  build(recipe);
  const rest = Math.abs(run(`blob.measure()`));
  run(`blob.pulse(34);`);
  for (let i = 0; i < 24; i++) run(`blob.step(simP, bounds, null, 16);`);
  const now = Math.abs(run(`blob.measure()`));
  return Math.abs(now - rest) / rest;
}
/** Diameter while being pulled, in units of restR. A stretched slime is longer
 *  than a round one of the same volume, and this cannot be confused by the blob
 *  being a squashed puddle at rest or a lifted sphere mid-pull. */
function stretchUnderDrag(recipe) {
  build(recipe);
  const c = centre();
  run(`grip.active = true; grip.x = ${c.x}; grip.y = ${c.y - 200};`);
  for (let i = 0; i < 90; i++) run(`blob.step(simP, bounds, grip, 16);`);
  const dia = run(`(() => {
    let m = 0;
    for (let a = 0; a < blob.p.length; a++)
      for (let b = a + 1; b < blob.p.length; b++)
        m = Math.max(m, Math.hypot(blob.p[a].x - blob.p[b].x, blob.p[a].y - blob.p[b].y));
    return m;
  })()`);
  run(`grip.active = false;`);
  return dia / run(`simP.restR`);
}

const stiff = { glue: 4, borax: 2.4 };
// equal total mass on purpose: otherwise the soft batch is bigger, fills the bowl,
// and the comparison measures the walls instead of the material
const runny = { glue: 4, borax: 0.8, shampoo: 2.4 };

const stiffRound = roundnessAfterDeform(stiff);
const runnyRound = roundnessAfterDeform(runny);
check('a stiff slime springs back into shape; a runny one slumps',
      stiffRound < runnyRound,
      `stiff deviates ${stiffRound.toFixed(3)} vs runny ${runnyRound.toFixed(3)}`);

const stiffResid = residualAfterKick(stiff);
const runnyResid = residualAfterKick(runny);
check('the activated slime snaps back faster after a knock',
      stiffResid < runnyResid,
      `stiff still off by ${(stiffResid * 100).toFixed(1)}% vs runny ${(runnyResid * 100).toFixed(1)}%`);

const stiffStretch = stretchUnderDrag(stiff);
const runnyStretch = stretchUnderDrag(runny);
check('a runny slime stretches further when dragged',
      runnyStretch > stiffStretch,
      `runny diameter ${runnyStretch.toFixed(3)} restR vs stiff ${stiffStretch.toFixed(3)}`);

const stiffSquash = squashOnLanding(stiff);
const runnySquash = squashOnLanding(runny);
check('a runny slime deforms more on landing',
      runnySquash < stiffSquash,
      `runny squashes to ${runnySquash.toFixed(3)} vs stiff ${stiffSquash.toFixed(3)}`);

/** How much it flattens when it lands from a height. A runny slime spreads
 *  further, so this is a smaller number. */
function squashOnLanding(recipe) {
  build(recipe);
  run(`blob.reset(VW/2, 40, simP.restR, baseRadius());`);
  let minRatio = 1;
  for (let i = 0; i < 70; i++) {
    run(`blob.step(simP, bounds, null, 16);`);
    const g = run(`(() => {
      const c = blob.centre; let hi = 1e9, lo = -1e9;
      for (const q of blob.p) { hi = Math.min(hi, q.y - c.y); lo = Math.max(lo, q.y - c.y); }
      return (lo - hi) / (2 * simP.restR);
    })()`);
    if (g < minRatio) minRatio = g;
  }
  return minRatio;
}

/* mass must be visible */
console.log('\n  ---- more ingredients really is more slime ----');
build({ glue: 2, borax: 0.6 });
const smallR = run(`simP.restR`);
build({ glue: 12, borax: 3.6 });
const bigR = run(`simP.restR`);
check('a bigger batch is a bigger blob', bigR > smallR * 1.2,
      `${smallR.toFixed(0)} px -> ${bigR.toFixed(0)} px`);

/* ------------------------------------------------------------- bubbles */
console.log('\n  ---- soap really does make foam ----');
build({ glue: 4, borax: 1.2 });
check('no soap means no bubbles', run(`motes.b.length`) === 0,
      String(run(`motes.b.length`)));
build({ glue: 4, borax: 1.6, soap: 8 });
check('soap fills it with bubbles', run(`motes.b.length`) > 5,
      String(run(`motes.b.length`)));
check('bubbles live inside the blob',
      run(`motes.b.every(b => Number.isFinite(b.u) && b.u >= 0 && b.u <= 1)`));
build({ glue: 4, borax: 1.2, glitter: 3 });
check('glitter produces sparkle, not foam',
      run(`sparks.b.length`) > 0 && run(`motes.b.length`) === 0,
      `sparks ${run('sparks.b.length')} bubbles ${run('motes.b.length')}`);

/* --------------------------------------------------- drag does the mixing */
console.log('\n  ---- dragging is what mixes it ----');
build({ glue: 4, borax: 1.2 });
run(`batch.mix = 0; onDown({ clientX: VW/2, clientY: VH/2, preventDefault(){} });`);
const m0 = run(`batch.mix`);
// a full gesture: press, sweep, release - exactly what the game listens for
const midX = run('VW') / 2, midY = run('VH') / 2;
for (let k = 0; k < 40; k++) {
  const x = Math.round(midX + Math.sin(k * 0.7) * 130);
  run(`onMove({ clientX: ${x}, clientY: ${midY}, preventDefault(){} });`);
}
run(`onUp();`);
const m1 = run(`batch.mix`);
check('swiping raises the mix', m1 > m0, `${m0.toFixed(3)} -> ${m1.toFixed(3)}`);
check('the mix is capped at fully mixed', m1 <= 1.0001, String(m1));

/* A stiff slime fights the drag; a soft one gives way. That is the claim worth
   testing. "Unset batches are harder to mix" is NOT true: wet glue is runny and
   mixes easily, it simply never sets. */
function swipeGain(recipe) {
  build(recipe);
  run(`batch.mix = 0; onDown({ clientX: VW/2, clientY: VH/2, preventDefault(){} });`);
  const cx = run('VW') / 2, cy = run('VH') / 2;
  for (let k = 0; k < 3; k++) {
    const x = Math.round(cx + Math.sin(k * 0.7) * 130);
    run(`onMove({ clientX: ${x}, clientY: ${cy}, preventDefault(){} });`);
  }
  run(`onUp();`);
  return run(`batch.mix`);
}
const softGain = swipeGain({ glue: 4, borax: 0.8, shampoo: 2.4 });
const firmGain = swipeGain({ glue: 4, borax: 2.4 });
check('a stiff slime resists the drag; a soft one gives way',
      firmGain < softGain,
      `firm gains ${firmGain.toFixed(4)} vs soft ${softGain.toFixed(4)}`);
check('a wet unset batch is easy to work (it is runny, it just never sets)',
      swipeGain({ glue: 5 }) > firmGain);

/* mixing must immediately change the material, not wait for a save */
build({ glue: 4, borax: 1.2 });
const kAt0 = run(`simP.k`);
run(`batch.mix = 0; refresh(false);`);
const kAt0b = run(`simP.k`);
run(`batch.mix = 1; refresh(false);`);
const kAt1 = run(`simP.k`);
check('mixing raises stiffness immediately', kAt1 > kAt0b,
      `${kAt0b.toFixed(3)} -> ${kAt1.toFixed(3)}`);

console.log(`\n  RESULT  passes=${pass}  fails=${fail}`);
process.exit(fail ? 1 : 0);
