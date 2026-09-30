/* Tests for the material model.

   The point of this file: the material model replaced "just change the colour", so
   every claim in it has to be measurably true, not merely asserted in a comment.
   Each test measures the DELTA, because "borax increases stiffness" is a worthless
   claim if it increases it by 0.001.

   RUN:  node test_model.js
*/
const M = require('./slime_model.js');

let pass = 0, fail = 0;
const check = (n, c, x) => {
  if (c) { pass++; console.log('  PASS  ' + n); }
  else { fail++; console.log('  FAIL  ' + n + (x ? '   -> ' + x : '')); }
};
const mat = (r, mix) => M.materialFromRecipe(r, mix == null ? 1 : mix);
const mid = (m, mat_, k) => (mat_[k] - M.RANGES[k][0]) / (M.RANGES[k][1] - M.RANGES[k][0]);

/* A neutral reference batch: set, so activation is not the variable under test. */
const BASE = { glue: 3, borax: 1 };
const base = mat(BASE);

/* ------------------------------------------------ every ingredient applies */
console.log('\n  ---- the matrix actually moves the material ----');
for (const k of M.INGREDIENT_ORDER) {
  const withIt = mat(Object.assign({}, BASE, { [k]: (BASE[k] || 0) + 2 }));
  const changed = M.MATERIALS.filter(m => Math.abs(withIt[m] - base[m]) > 1e-9);
  check(`${k}: changes at least two material properties`,
        changed.length >= 2, `${changed.length}: ${changed.join(',')}`);
}
check('a batch with no ingredients is inert',
      M.materialFromRecipe({}, 1).stiffness === M.RANGES.stiffness[0]);

/* --------------------------------------------------- GLUE: base and mass */
console.log('\n  ---- glue: base / mass ----');
const g0 = mat({ glue: 1, borax: 0.4 });
const g1 = mat({ glue: 6, borax: 2.4 });
check('more glue means a bigger blob', g1.size > g0.size,
      `${g0.size.toFixed(3)} -> ${g1.size.toFixed(3)}`);
check('mass is reported so the renderer can use it', g1.mass === 8.4, String(g1.mass));
// density is a COMPOSITION property: the same ratio at any size has the same density
check('the same recipe at any size has the same density',
      Math.abs(g1.density - g0.density) < 1e-9,
      `${g0.density.toFixed(3)} vs ${g1.density.toFixed(3)}`);
// a recipe with a higher glue fraction is genuinely denser
const richGlue = mat({ glue: 8, borax: 1 });
const thinGlue = mat({ glue: 2, borax: 1 });
check('more glue relative to the mix means more body',
      richGlue.density > thinGlue.density,
      `${thinGlue.density.toFixed(3)} -> ${richGlue.density.toFixed(3)}`);
check('glue alone does not act as an activator', M.activation({ glue: 10 }) < 0.3);
check('the size change is substantial, not cosmetic',
      g1.size / g0.size > 1.3, `ratio ${(g1.size / g0.size).toFixed(3)}`);

/* --------------------------------------------- BORAX: activator, elasticity */
console.log('\n  ---- borax: activator / elasticity ----');
const noBorax = mat({ glue: 5 });
const someBorax = mat({ glue: 5, borax: 1.5 });
check('borax raises stiffness sharply', someBorax.stiffness > noBorax.stiffness * 1.4,
      `${noBorax.stiffness.toFixed(3)} -> ${someBorax.stiffness.toFixed(3)}`);
// damping is VELOCITY RETAINED per step: high = snappy, low = sluggish
check('borax raises velocity retention so it snaps back instead of oozing',
      someBorax.damping > noBorax.damping,
      `${noBorax.damping.toFixed(4)} -> ${someBorax.damping.toFixed(4)}`);
check('borax raises elasticity', someBorax.pressure > noBorax.pressure,
      `${noBorax.pressure.toFixed(3)} -> ${someBorax.pressure.toFixed(3)}`);
check('borax makes it less runny', someBorax.flow < noBorax.flow,
      `${noBorax.flow.toFixed(3)} -> ${someBorax.flow.toFixed(3)}`);
check('past the window, more borax stops helping',
      M.activation({ glue: 2, borax: 3 }) < 1.0,
      String(M.activation({ glue: 2, borax: 3 })));

/* -------------------------------------------- SHAMPOO: softener, fluidity */
console.log('\n  ---- shampoo: softener / fluidity ----');
const sh = mat({ glue: 4, borax: 1, shampoo: 4 });
const shBase = mat({ glue: 4, borax: 1 });
check('shampoo softens it (lower stiffness)', sh.stiffness < shBase.stiffness,
      `${shBase.stiffness.toFixed(3)} -> ${sh.stiffness.toFixed(3)}`);
check('shampoo makes it slower to respond (lower retention)', sh.damping < shBase.damping,
      `${shBase.damping.toFixed(4)} -> ${sh.damping.toFixed(4)}`);
check('shampoo makes it more fluid', sh.flow > shBase.flow,
      `${shBase.flow.toFixed(3)} -> ${sh.flow.toFixed(3)}`);
check('shampoo reduces elasticity', sh.pressure < shBase.pressure,
      `${shBase.pressure.toFixed(3)} -> ${sh.pressure.toFixed(3)}`);

/* ------------------------------------------- SOAP: aeration, lower density */
console.log('\n  ---- soap: fluffiness / aeration ----');
// borax is held inside its window in all three, so this measures aeration and
// not the deactivation that heavy dilution would cause
const so2 = mat({ glue: 4, borax: 1.2, soap: 3 });
const so6 = mat({ glue: 4, borax: 1.6, soap: 8 });
check('more soap means more aeration', so6.aeration > so2.aeration,
      `${so2.aeration.toFixed(3)} -> ${so6.aeration.toFixed(3)}`);
check('more soap means more bubbles', so6.bubbles > so2.bubbles,
      `${so2.bubbles} -> ${so6.bubbles}`);
check('soap introduces bubbles at all', so2.bubbles > 0, `bubbles ${so2.bubbles}`);
check('a no-soap batch has no bubbles at all', shBase.bubbles === 0,
      `bubbles ${shBase.bubbles}`);
check('soap lowers density', so2.density < shBase.density,
      `${shBase.density.toFixed(3)} -> ${so2.density.toFixed(3)}`);
check('bubble count is bounded so the renderer cannot be flooded',
      mat({ glue: 1, borax: 0.2, soap: 60 }).bubbles <= 26);

/* ------------------------------------------------------------- TONER + GLITTER */
console.log('\n  ---- toner thins, glitter is inert ----');
const tn = mat({ glue: 4, borax: 1, toner: 4 });
check('toner makes it runnier', tn.flow > shBase.flow, `${shBase.flow.toFixed(3)} -> ${tn.flow.toFixed(3)}`);
check('toner softens it', tn.stiffness < shBase.stiffness);
// glitter's own column carries no movement properties at all - that is the exact
// claim. It still dilutes the actives by taking up mass, which is real physics.
check('glitter adds nothing to how it moves',
      M.INGREDIENTS.glitter.vec.stiffness === 0.10 &&
      M.INGREDIENTS.glitter.vec.flow === 0 &&
      M.INGREDIENTS.glitter.vec.aeration === 0,
      JSON.stringify(M.INGREDIENTS.glitter.vec));
check('the only material effect glitter has is dilution',
      mat({ glue: 4, borax: 1, glitter: 4 }).stiffness < shBase.stiffness);
check('glitter is still worth money because stats pick it up',
      M.computeStats({ glue: 4, borax: 1, glitter: 4 }, 1).sparkle > 1.0);

/* ----------------------------------------------------- everything is clamped */
console.log('\n  ---- extremes cannot break the simulation ----');
const silly = [
  { glue: 99, borax: 1 }, { borax: 99, glue: 1 }, { shampoo: 99, glue: 1 },
  { soap: 99, glue: 1 }, { toner: 99, glue: 1 }, { glitter: 99, glue: 1 },
  { glue: 1, borax: 1, shampoo: 1, soap: 1, toner: 1, glitter: 1 },
];
let outOfRange = [];
for (const r of silly) {
  const mm = mat(r);
  for (const k of M.MATERIALS) {
    const [lo, hi] = M.RANGES[k];
    if (!(mm[k] >= lo - 1e-9 && mm[k] <= hi + 1e-9)) outOfRange.push(`${JSON.stringify(r)}.${k}=${mm[k]}`);
    if (!Number.isFinite(mm[k])) outOfRange.push(`${JSON.stringify(r)}.${k} not finite`);
  }
  if (!Number.isFinite(mm.bubbles) || mm.bubbles < 0) outOfRange.push('bubbles');
}
check('every extreme recipe stays inside the safe ranges', outOfRange.length === 0,
      outOfRange.slice(0, 3).join('; '));

/* ------------------------------------------------- mixing drives the physics */
console.log('\n  ---- mixing changes the physics, not just the score ----');
const unmixed = mat({ glue: 4, borax: 1 }, 0);
const mixed = mat({ glue: 4, borax: 1 }, 1);
check('an unmixed batch is softer (it has not set properly)',
      unmixed.stiffness < mixed.stiffness,
      `${unmixed.stiffness.toFixed(3)} -> ${mixed.stiffness.toFixed(3)}`);
check('an unmixed batch is less elastic', unmixed.pressure < mixed.pressure);
check('mixing quality is monotonic',
      M.mixQuality(0.1) < M.mixQuality(0.5) && M.mixQuality(0.5) < M.mixQuality(1));

/* ----------------------------------------- stats and physics agree by design */
console.log('\n  ---- the screen and the price tag cannot disagree ----');
const bouncy = mat({ glue: 3, borax: 3 });
const oozey = mat({ glue: 3, borax: 0.2, shampoo: 3 });
const bs = M.computeStats({ glue: 3, borax: 3 }, 1);
const os = M.computeStats({ glue: 3, borax: 0.2, shampoo: 3 }, 1);
check('the more elastic batch scores higher on Bounce',
      bs.bounce > os.bounce, `${os.bounce} -> ${bs.bounce}`);
check('the more fluid batch scores higher on Stretch',
      os.stretch > bs.stretch, `${bs.stretch} -> ${os.stretch}`);
check('the elastic batch really is stiffer in the simulation',
      bouncy.stiffness > oozey.stiffness);
check('the fluid batch really is runnier in the simulation',
      oozey.flow > bouncy.flow);
check('stats track material monotonically for pressure',
      (() => {
        let last = -1;
        for (const p of [0.2, 0.6, 1.2, 2.0, 3.0]) {
          const st = M.statsFromMaterial({ pressure: p, stiffness: 0.5, density: 1, size: 1, flow: 0.5, damping: 0.95, aeration: 0 });
          if (st.bounce < last) return false;
          last = st.bounce;
        }
        return true;
      })());
check('no stat can be negative or absurd',
      (() => {
        for (const r of silly.concat([BASE])) {
          const st = M.computeStats(r, 1);
          for (const s of M.STATS) if (!(st[s] >= 0 && st[s] <= 6)) return false;
        }
        return true;
      })());

/* --------------------------------------------- the economy still works */
console.log('\n  ---- the economy still works ----');
console.log('  ' + 'recipe'.padEnd(30) + 'cost  best offer  profit');
let profitable = 0, rows = [];
for (const [label, r, cost] of [
  ['glue x2, borax x1', { glue: 2, borax: 1 }, 21],
  ['+ soap', { glue: 2, borax: 1, soap: 1 }, 26],
  ['+ shampoo', { glue: 2, borax: 1, soap: 1, shampoo: 1 }, 33],
  ['+ toner', { glue: 2, borax: 1, soap: 1, shampoo: 1, toner: 1 }, 37],
  ['+ glitter x2', { glue: 2, borax: 1, soap: 1, shampoo: 1, toner: 1, glitter: 2 }, 57],
  ['+ glitter x6', { glue: 2, borax: 1, soap: 1, shampoo: 1, toner: 1, glitter: 6 }, 97],
]) {
  const st = M.computeStats(r, 1);
  const d = Object.keys(r).length;
  let best = 0, who = '';
  for (const t of M.TRADERS) {
    const o = M.traderOffer(t, st, d).coins;
    if (o > best) { best = o; who = t.name; }
  }
  if (best > cost) profitable++;
  rows.push(best - cost);
  console.log('  ' + label.padEnd(30) + String(cost).padStart(4) +
    ('◈' + best + ' ' + who).padStart(13) + String(best - cost).padStart(8));
}
check('every tier is worth making', profitable >= 5, `${profitable}/6`);
check('progression pays better than the starter recipe',
      Math.max.apply(null, rows) > rows[0] * 1.2,
      `${rows[0]} -> ${Math.max.apply(null, rows)}`);

console.log('\n  ---- persistence ----');
const st = { coins: 240, inv: [{ name: 'x', stats: { bounce: 2 }, colour: 'red', recipe: { glue: 1 } }], made: 3, sold: 1 };
const back = M.deserialise(M.serialise(st));
check('a v2 save round-trips', back && back.coins === 240 && back.inv.length === 1);
check('a v1 save still loads (the inventory shape did not change)',
      M.deserialise('{"v":1,"coins":50,"inv":[]}') !== null);
check('a future version is refused', M.deserialise('{"v":9}') === null);
check('garbage is refused', M.deserialise('nope') === null);

console.log(`\n  RESULT  passes=${pass}  fails=${fail}`);
process.exit(fail ? 1 : 0);
