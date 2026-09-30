/* Drives the BUILT game through a DOM stub, so the loop that a player actually
   experiences is tested rather than only the logic underneath it.

   RUN:  node test_game.js
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

/* ------------------------------------------------------------ DOM stub
   Enough of a DOM for the game to boot and be driven. Elements remember their
   handlers so the test can fire events the way a player would. */
function makeEl(id) {
  const el = {
    id, tagName: 'DIV', textContent: '', innerHTML: '', value: '',
    style: new Proxy({}, { get: (t, k) => t[k] || '', set: (t, k, v) => { t[k] = v; return true; } }),
    dataset: {}, disabled: false, children: [], _handlers: {},
    classList: {
      _s: new Set(),
      add(c) { this._s.add(c); }, remove(c) { this._s.delete(c); },
      contains(c) { return this._s.has(c); },
      toggle(c, f) { f ? this._s.add(c) : this._s.delete(c); },
    },
    addEventListener(ev, fn) { (el._handlers[ev] = el._handlers[ev] || []).push(fn); },
    removeEventListener() {},
    querySelector() { return makeEl('q'); },
    querySelectorAll(sel) {
      // the game calls this after setting innerHTML; return one stub per element it
      // would have found, so the wiring is exercised
      if (sel === 'button' || sel === '.trader' || sel === '.chip') {
        const n = (el.innerHTML.match(sel === 'button' ? /<button/g :
                    sel === '.trader' ? /class="trader/g : /class="chip/g) || []).length;
        const out = [];
        for (let i = 0; i < n; i++) {
          const c = makeEl(sel + i);
          // pull the identifying data attribute out of the markup the game wrote
          const re = sel === '.trader' ? /data-t="([^"]+)"/g : /data-[ki]="([^"]+)"/g;
          const all = [...el.innerHTML.matchAll(re)].map(m => m[1]);
          if (all[i] != null) { c.dataset.t = all[i]; c.dataset.k = all[i]; c.dataset.i = all[i]; }
          out.push(c);
        }
        return out;
      }
      return [];
    },
    appendChild(c) { el.children.push(c); return c; },
    clientWidth: 420, clientHeight: 520, width: 420, height: 520,
    getBoundingClientRect() { return { left: 0, top: 0, width: 420, height: 520 }; },
    getContext() { return CTX; },
    focus() {},
  };
  return el;
}

const CTX = new Proxy({}, {
  get: (t, k) => {
    if (k === 'createRadialGradient' || k === 'createLinearGradient')
      return () => ({ addColorStop() {} });
    if (k === 'measureText') return () => ({ width: 10 });
    return () => {};
  },
  set: () => true,
});
const els = {};
global.document = {
  getElementById(id) { return els[id] || (els[id] = makeEl(id)); },
  querySelectorAll() { return []; },
  createElement(t) { return makeEl(t); },
  addEventListener() {},
  body: makeEl('body'), documentElement: makeEl('html'), hidden: false,
};
const winHandlers = {};
global.window = {
  addEventListener(ev, fn) { (winHandlers[ev] = winHandlers[ev] || []).push(fn); },
  removeEventListener() {},
  innerWidth: 800, innerHeight: 600, devicePixelRatio: 1,
  visualViewport: { width: 800, height: 600 },
};
const store = {};
global.localStorage = {
  getItem: k => (k in store ? store[k] : null),
  setItem: (k, v) => { store[k] = String(v); },
  removeItem: k => { delete store[k]; },
};
global.performance = { now: () => Date.now() };
global.requestAnimationFrame = () => 0;
global.setTimeout = (fn) => 0;
global.clearTimeout = () => {};
global.setInterval = () => 0;

/* ---------------------------------------------------------------- boot */
const box = { console, document: global.document, window: global.window,
              localStorage: global.localStorage, performance: global.performance,
              setTimeout: global.setTimeout, clearTimeout: global.clearTimeout };
box.requestAnimationFrame = () => 0;
box.addEventListener = (ev, fn) => { (winHandlers[ev] = winHandlers[ev] || []).push(fn); };
box.removeEventListener = () => {};
box.devicePixelRatio = 1;
box.self = box; box.globalThis = box;
vm.createContext(box);

let bootErr = null;
try {
  vm.runInContext(scripts[0], box);          // core
  vm.runInContext(scripts[1], box);          // game
} catch (e) { bootErr = e; }
check('the built game boots without throwing', !bootErr, bootErr && bootErr.message);
if (bootErr) { console.log('\n  RESULT  passes=' + pass + '  fails=' + (fail + 1)); process.exit(1); }

/* Reach the game's own state and functions through the context. */
const probe = vm.runInContext(`({
  S: typeof S !== 'undefined' ? S : null,
  batch: typeof batch !== 'undefined' ? batch : null,
  CORE: typeof CORE !== 'undefined' ? CORE : null,
  stats: typeof stats === 'function' ? stats() : null,
  value: typeof value === 'function' ? value() : null,
})`, box);
check('the game exposes its state', !!probe.S && !!probe.batch);
check('the core is reachable from the game', !!probe.CORE && !!probe.CORE.computeStats);
check('a new game starts with coins', probe.S.coins === 120, String(probe.S.coins));

/* ----------------------------------------------------- buy + mix + save */
console.log('\n  ---- a full loop: buy, mix, save, sell ----');
const run = (code) => vm.runInContext(code, box);

// buy glue and borax the way a player would
run(`addIngredient('glue'); addIngredient('glue'); addIngredient('borax');`);
let st = run(`({ coins: S.coins, recipe: batch.recipe, mix: batch.mix })`);
check('coins were deducted for the ingredients',
      st.coins === 120 - 6 - 6 - 9, `${st.coins}`);
check('the recipe recorded what was bought',
      st.recipe.glue === 2 && st.recipe.borax === 1, JSON.stringify(st.recipe));
check('adding an ingredient resets the mix progress', st.mix === 0, String(st.mix));

// the blob must visibly report the recipe
const drawn = run(`CORE.computeColour(batch.recipe)`);
check('the renderer has a colour for the recipe to draw with',
      Array.isArray(drawn) && drawn.length === 3 && drawn.every(v => v >= 0 && v <= 255),
      JSON.stringify(drawn));
const matNow = run(`({ size: material.size, bubbles: material.bubbles })`);
check('the recipe produced a live material for the simulation',
      matNow.size > 0 && Number.isFinite(matNow.bubbles), JSON.stringify(matNow));

// mix it by dragging
const mixBefore = run(`batch.mix`);
{
  const cx = run('VW') / 2, cy = run('VH') / 2;
  run(`onDown({ clientX: ${cx}, clientY: ${cy}, preventDefault(){} });`);
  for (let k = 0; k < 400; k++) {
    const x = cx + Math.sin(k * 0.4) * 140;
    run(`onMove({ clientX: ${x}, clientY: ${cy}, preventDefault(){} });`);
  }
  run(`onUp();`);
}
const mixAfter = run(`batch.mix`);
check('mixing can be advanced to full', mixAfter === 1, String(mixAfter));
check('mixing improved the score', (() => {
  const a = run(`CORE.valueOf(CORE.computeStats(batch.recipe, 0))`);
  const b = run(`CORE.valueOf(CORE.computeStats(batch.recipe, 1))`);
  return b > a;
})());
check('mixing also improved the physical material', (() => {
  const a = run(`CORE.materialFromRecipe(batch.recipe, 0).stiffness`);
  const b = run(`CORE.materialFromRecipe(batch.recipe, 1).stiffness`);
  return b > a;
})());

const worthBefore = run(`valueOfBatch()`);
run(`saveSlime()`);
const after = run(`({ inv: S.inv.length, made: S.made, coins: S.coins, mix: batch.mix,
                      recipe: batch.recipe, tab: document.getElementById('tab-trade').classList.contains('active') })`);
check('saving put the slime in the inventory', after.inv === 1, String(after.inv));
check('the save counter advanced', after.made === 1, String(after.made));
check('the bowl was emptied after saving',
      after.mix === 0 && Object.keys(after.recipe).length === 0);
check('saving moved the player to the traders', after.tab === true);
check('the saved slime remembers what it is worth',
      run(`S.inv[0].value`) === worthBefore, `${run('S.inv[0].value')} vs ${worthBefore}`);
check('the saved slime carries the material it was made with',
      (() => { const m = run(`S.inv[0].material`);
        return m && Number.isFinite(m.stiffness) && Number.isFinite(m.size); })());

/* ---------------------------------------------------------------- sell */
console.log('\n  ---- selling values the right slime to the right trader ----');
run(`pickSlime(0)`);
const before30 = run(`S.coins`);
run(`pickTrader('maya')`);
const mayaOffer = run(`offer`);
check('a trader names an offer', mayaOffer > 0, String(mayaOffer));
check('that offer beats doing nothing', mayaOffer > 0);
run(`doAccept()`);
const sold = run(`({ coins: S.coins, inv: S.inv.length, sold: S.sold })`);
check('accepting pays the coins', sold.coins === before30 + mayaOffer,
      `${before30} + ${mayaOffer} = ${sold.coins}`);
check('the slime left the inventory', sold.inv === 0);
check('the sale counter advanced', sold.sold === 1);

/* ------------------------------------------------------ countering */
console.log('\n  ---- countering is a real decision ----');
run(`S.coins = 500;
     addIngredient('glue'); addIngredient('glue'); addIngredient('borax');
     addIngredient('glitter'); addIngredient('glitter');
     batch.mix = 1; saveSlime(); pickSlime(0); pickTrader('maya');`);
const baseOffer = run(`offer`);
const counters0 = run(`counters`);
run(`doCounter()`);
const c1 = run(`({ offer: offer, counters: counters })`);
check('one counter can succeed and raise the price', c1.offer > baseOffer || c1.counters === 0,
      `${baseOffer} -> ${c1.offer}`);
// keep countering until patience runs out
run(`doCounter(); doCounter();`);
const c2 = run(`({ counters: counters, offer: offer })`);
check('patience is finite', c2.counters <= counters0);
check('an exhausted trader cannot be countered again',
      run(`CORE.acceptsCounter(CORE.TRADERS[0], S.inv[0].stats, offer * 3, 0)`) === false);

/* --------------------------------------------------- persistence */
console.log('\n  ---- progress survives a reload ----');
const saved = store['slime.v2'] || store[Object.keys(store)[0]];
check('the game writes a save', !!saved, String(saved).slice(0, 40));
const restored = run(`CORE.deserialise(${JSON.stringify(saved)})`);
check('the save reloads', !!restored);
check('the reloaded coins match', restored.coins === run(`S.coins`),
      `${restored.coins} vs ${run('S.coins')}`);
check('the reloaded inventory matches', restored.inv.length === run(`S.inv.length`));

/* a fresh boot with that save must come up with the same state */
store['slime.v2'] = saved;
const box2 = { console, document: makeDoc(),
               localStorage: global.localStorage, performance: global.performance,
               setTimeout: global.setTimeout, clearTimeout: global.clearTimeout };
box2.requestAnimationFrame = () => 0;
box2.addEventListener = () => {};
box2.removeEventListener = () => {};
box2.devicePixelRatio = 1;
box2.self = box2; box2.globalThis = box2; box2.window = box2;
vm.createContext(box2);
vm.runInContext(scripts[0], box2);
vm.runInContext(scripts[1], box2);
const reloaded = vm.runInContext('({ coins: S.coins, inv: S.inv.length, made: S.made })', box2);
check('a fresh boot reads the save back', reloaded.coins === run(`S.coins`),
      `${reloaded.coins} vs ${run('S.coins')}`);
check('the inventory survived the reload', reloaded.inv === run(`S.inv.length`));

function makeDoc() {
  const e = {};
  return {
    getElementById(id) { return e[id] || (e[id] = makeEl(id)); },
    querySelectorAll() { return []; },
    createElement(t) { return makeEl(t); },
    addEventListener() {},
    body: makeEl('body'), documentElement: makeEl('html'), hidden: false,
  };
}

/* -------------------------------------------------------- guard rails */
console.log('\n  ---- the game refuses nonsense ----');
run(`resetBatch(true); S.coins = 0;`);
run(`addIngredient('glitter')`);
check('you cannot buy without coins', run(`Object.keys(batch.recipe).length`) === 0);
check('coins did not go negative', run(`S.coins`) === 0, String(run('S.coins')));
run(`S.coins = 100`);
run(`resetBatch(true)`);
const invBefore = run(`S.inv.length`);
run(`saveSlime()`);
check('an empty batch cannot be saved', run(`S.inv.length`) === invBefore,
      `${invBefore} -> ${run('S.inv.length')}`);
check('a batch that never set is refused even though it has some value', (() => {
  run(`resetBatch(true); addIngredient('glue'); batch.mix = 1;`);
  const worth = run(`valueOfBatch()`);
  const n = run(`S.inv.length`);
  run(`saveSlime()`);
  return run(`S.inv.length`) === n && worth > 0;
})(), 'a glue-only batch should be refused despite a non-zero value');

console.log(`\n  RESULT  passes=${pass}  fails=${fail}`);
process.exit(fail ? 1 : 0);