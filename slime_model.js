/* =====================================================================
   SLIME — the model.

   DOM-free, so every rule here is directly testable in Node.

   The structure is:

       recipe  --[ MIX MATRIX ]-->  material properties
                                        |
                                        +--> drives the SOFT-BODY SIMULATION
                                        +--> drives the SELLABLE STATS

   Both outputs come from the same numbers on purpose. What you watch jiggle
   is what you sell: if the blob on screen is springy, the slime is worth
   money to the trader who wants bounce, and the screen and the price tag
   cannot disagree.

   The matrix is a linear mixture model, which is how real mixtures are
   approximated: each ingredient contributes to each property in proportion
   to how much of it is present.
   ===================================================================== */
'use strict';

/* ------------------------------------------------------------ ingredients

   `vec` is this ingredient's column in the mix matrix: how it pushes each
   material property. The signs are the whole design - borax stiffens,
   shampoo softens and slows, soap lightens and aerates.
*/
const INGREDIENTS = {
  glue: {
    name: 'PVA Glue', emoji: '\u{1F9F4}', cost: 6, colour: [248, 250, 252],
    vec: { stiffness: 1.00, damping: 0.60, pressure: 1.35, density: 1.80, size: 1.50, flow: -0.30, aeration: 0.00 },
    note: 'the base. adds mass and body.',
  },
  borax: {
    name: 'Borax', emoji: '\u{1F9EA}', cost: 9, colour: [34, 197, 94],
    vec: { stiffness: 3.00, damping: 1.80, pressure: 1.55, density: 0.40, size: 0.15, flow: -0.85, aeration: 0.00 },
    note: 'activates it. tighter springs - snaps back and jiggles.',
  },
  shampoo: {
    name: 'Shampoo', emoji: '\u{1F9F4}', cost: 7, colour: [236, 72, 153],
    vec: { stiffness: -0.85, damping: -2.00, pressure: -0.45, density: 0.05, size: 0.30, flow: 2.20, aeration: 0.15 },
    note: 'softens it. slower, stretchier, more liquid.',
  },
  soap: {
    name: 'Hand Soap', emoji: '\u{1F9FC}', cost: 5, colour: [56, 189, 248],
    vec: { stiffness: -0.30, damping: -0.20, pressure: 0.55, density: -1.25, size: 0.95, flow: 0.85, aeration: 1.70 },
    note: 'aerates it. foam bubbles, and lighter.',
  },
  toner: {
    name: 'Toner', emoji: '\u{1F4A7}', cost: 4, colour: [186, 230, 253],
    vec: { stiffness: -0.50, damping: -1.00, pressure: -0.30, density: -0.20, size: 0.20, flow: 1.45, aeration: 0.05 },
    note: 'thins it out. runs like water if you overdo it.',
  },
  glitter: {
    name: 'Glitter', emoji: '\u{2728}', cost: 10, colour: [234, 179, 8],
    vec: { stiffness: 0.10, damping: 0.10, pressure: 0.10, density: 0.65, size: 0.10, flow: 0.00, aeration: 0.00 },
    note: 'does nothing to how it moves. only what it is worth.',
  },
};

const INGREDIENT_ORDER = ['glue', 'borax', 'shampoo', 'soap', 'toner', 'glitter'];

/** The properties the matrix produces. */
const MATERIALS = ['stiffness', 'damping', 'pressure', 'density', 'size', 'flow', 'aeration'];
const MATERIAL_LABEL = {
  stiffness: 'Stiffness', damping: 'Viscosity', pressure: 'Elasticity',
  density: 'Density', size: 'Mass', flow: 'Fluidity', aeration: 'Aeration',
};

/** The five things a trader will pay for. */
const STATS = ['bounce', 'stretch', 'body', 'shine', 'sparkle'];
const STAT_LABEL = {
  bounce: 'Bounce', stretch: 'Stretch', body: 'Body',
  shine: 'Shine', sparkle: 'Sparkle',
};

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

/* --------------------------------------------------------- the mix matrix

   Normalised ingredient fractions multiplied by each ingredient's column.
*/
function rawMaterial(recipe) {
  let total = 0;
  for (const k of Object.keys(recipe)) if (recipe[k] > 0) total += recipe[k];
  const out = {};
  for (const m of MATERIALS) out[m] = 0;
  if (total <= 0) return { material: out, total: 0 };

  for (const k of Object.keys(recipe)) {
    const n = recipe[k];
    if (!(n > 0)) continue;
    const ing = INGREDIENTS[k];
    if (!ing) continue;
    const w = n / total;
    for (const m of MATERIALS) out[m] += ing.vec[m] * w;
  }
  return { material: out, total };
}

/* --------------------------------------------------------------- chemistry

   Borax activates the polymer. Below a threshold it never sets; above a much
   higher one it over-sets and goes brittle. Both are failures, so the working
   window is narrow - the interesting part of the recipe rather than a bonus.
*/
function activation(recipe) {
  let total = 0, borax = 0;
  for (const k of Object.keys(recipe)) {
    const n = recipe[k];
    if (!(n > 0)) continue;
    total += n;
    if (k === 'borax') borax += n;
  }
  if (borax === 0) return 0.25;
  const ratio = borax / total;
  if (ratio < 0.08) return 0.55;
  if (ratio <= 0.45) return 1.0;
  return Math.max(0.35, 1.0 - (ratio - 0.45) * 2.2);
}

/** Mixing effort, 0..1. An unmixed batch keeps only about a third. */
function mixQuality(mix) {
  return 0.35 + 0.65 * clamp(mix, 0, 1);
}

/* ------------------------------------------------------ material mapping

   Raw matrix output -> the numbers the simulation uses. Each is clamped into
   a range the renderer can rely on, so a silly recipe produces extreme slime
   rather than a broken simulation.
*/
const RANGES = {
  stiffness: [0.04, 1.00],
  damping:   [0.905, 0.998],   // velocity retained per step: higher = runnier
  pressure:  [0.15, 3.20],
  density:   [0.35, 2.60],
  size:      [0.55, 2.40],
  flow:      [0.00, 1.00],
  aeration:  [0.00, 1.00],
};

/* Properties where zero means "none of it". These are mapped from the raw value
   upward instead of being centred on the middle of their range - otherwise a batch
   with no soap at all still lands mid-range and comes out foamy. */
const ABSOLUTE = { aeration: true };

/* How large a raw matrix value is meaningful. The weighted sums land around +/-1.5,
   so dividing by this uses most of each property's range instead of a sliver of it -
   the first version used about a sixth, which is why the slime barely changed. */
const V_SPAN = 1.5;

function materialFromRecipe(recipe, mix) {
  const { material, total } = rawMaterial(recipe);
  const act = activation(recipe);
  const mq = mixQuality(mix);

  const out = {};
  if (total <= 0) {
    for (const m of MATERIALS) out[m] = RANGES[m][0];
    out.size = 0.8;
    out.damping = 0.96;
    out.bubbles = 0;
    return out;
  }

  for (const m of MATERIALS) {
    let v = material[m];
    // activation gates the elastic behaviour: a batch that never set behaves
    // like wet glue no matter what else went in
    if (m === 'stiffness' || m === 'pressure') v *= 0.25 + 0.75 * act;
    if (m === 'damping' || m === 'flow') v *= 0.60 + 0.40 * act;
    if (m === 'aeration') v *= 0.40 + 0.60 * act;
    // mixing always helps: unmixed batches behave unevenly
    if (m === 'stiffness' || m === 'pressure') v *= 0.5 + 0.5 * mq;

    const lo = RANGES[m][0], hi = RANGES[m][1];
    if (ABSOLUTE[m]) {
      // zero raw value must mean zero, not the middle of the range
      out[m] = clamp(lo + (v / V_SPAN) * (hi - lo), lo, hi);
    } else {
      const ref = (lo + hi) / 2, spread = (hi - lo) / 2;
      out[m] = clamp(ref + (v / V_SPAN) * spread, lo, hi);
    }
  }

  // more mass should simply make it bigger: "more glue = more slime" is the
  // clearest signal in the game and should not be subtle
  // MASS. Every property above comes from the COMPOSITION, so a big batch of the
  // same recipe behaved identically to a small one - adding more glue changed
  // nothing, which is plainly wrong. Size is where the absolute amount belongs:
  // more ingredients means more slime. Composition only nudges it, and only via
  // aeration, because foam takes up room.
  out.mass = total;
  out.size = clamp(0.52 + 0.19 * total + 0.30 * out.aeration,
                   RANGES.size[0], RANGES.size[1]);
  out.bubbles = Math.round(out.aeration * 30);
  return out;
}

/* ----------------------------------------------------- physics parameters

   Material -> the numbers the soft-body simulation runs on. Kept here, in the
   DOM-free model, so the translation is testable: the renderer cannot quietly
   decide that stiffness means something else.

   `viewR` is how many pixels a size of 1.0 occupies in the bowl.
*/
function simParams(mat, viewR) {
  const r = viewR == null ? 100 : viewR;
  return {
    restR: r * mat.size,
    // spring constant: how hard the perimeter pulls itself back to round
    k: 0.08 + 0.42 * mat.stiffness,
    // velocity retained per step: high = snappy, low = sluggish
    retention: clamp(mat.damping, 0.80, 0.999),
    // internal pressure: volume preservation, which is what makes it jiggle
    pressure: mat.pressure,
    // how much shape memory it has: a fluid slime barely pulls itself round again
    flow: mat.flow,
    // heavier slime falls harder and resists being dragged
    gravity: 0.20 * mat.density,
    grip: clamp(1.25 / mat.density, 0.35, 2.4),
    bubbles: mat.bubbles,
    size: mat.size,
  };
}

/* ---------------------------------------------------- stats from material

   The sellable stats are the material properties restated in plain words.
   Same numbers as the simulation, so the slime on screen and the slime on
   the price tag cannot disagree.
*/
function statsFromMaterial(mat) {
  const norm = (m) => {
    const lo = RANGES[m][0], hi = RANGES[m][1];
    return clamp((mat[m] - lo) / (hi - lo), 0, 1);
  };
  const bounce = norm('pressure') * 0.65 + norm('stiffness') * 0.35;
  const stretch = norm('flow') * 0.70 + (1 - norm('stiffness')) * 0.30;
  const body = norm('density') * 0.70 + norm('size') * 0.30;
  return {
    bounce: round2(bounce * 5.5),
    stretch: round2(stretch * 5.5),
    body: round2(body * 5.5),
    shine: 0,      // filled from the recipe below: a surface property
    sparkle: 0,
  };
}

/** Full stats: material-derived, plus the two that come from the recipe. */
/* Yield: a bigger batch is more slime. Saturating, so ten times the ingredients is
   not ten times the money - but a large batch is worth more than a small one. */
function yieldFactor(total) {
  return 0.70 + 0.80 * (1 - Math.exp(-total / 7));
}

function computeStats(recipe, mix) {
  const mat = materialFromRecipe(recipe, mix);
  const st = statsFromMaterial(mat);
  const mq = mixQuality(mix);
  const act = activation(recipe);

  let shine = 0, sparkle = 0, n = 0;
  for (const k of Object.keys(recipe)) {
    const c = recipe[k];
    if (!(c > 0)) continue;
    n += c;
    if (k === 'shampoo') shine += 2.6 * c;
    if (k === 'glitter') { sparkle += 3.0 * c; shine += 0.8 * c; }
    if (k === 'soap') shine += 0.5 * c;
  }
  const t = Math.max(1, n);
  st.shine = round2(Math.max(0, 5.5 * Math.tanh((shine / t) * 2.2) * act * mq));
  st.sparkle = round2(Math.max(0, 5.5 * Math.tanh((sparkle / t) * 2.2)));

  // apply yield to the material-derived stats, so a bigger batch of the same recipe
  // earns more without changing what it is like to handle
  const yf = yieldFactor(Object.keys(recipe).reduce((a, k) => a + (recipe[k] > 0 ? recipe[k] : 0), 0));
  for (const s of ['bounce', 'stretch', 'body']) st[s] = round2(Math.min(6, st[s] * yf));
  st.shine = round2(Math.min(6, st.shine * yf));
  st.sparkle = round2(Math.min(6, st.sparkle * yf));
  return st;
}

/** Colour, blended by how much of each ingredient is present. */
function computeColour(recipe) {
  let r = 240, g = 240, b = 240, w = 1;
  for (const key of Object.keys(recipe)) {
    const n = recipe[key];
    if (!(n > 0)) continue;
    const c = INGREDIENTS[key].colour;
    r += (c[0] - r) * (n / (w + n));
    g += (c[1] - g) * (n / (w + n));
    b += (c[2] - b) * (n / (w + n));
    w += n;
  }
  return [Math.round(clamp(r, 0, 255)), Math.round(clamp(g, 0, 255)), Math.round(clamp(b, 0, 255))];
}

/* --------------------------------------------------------------- valuation */
function valueOf(stats, opts) {
  opts = opts || {};
  const vals = STATS.map(s => Math.max(0, stats[s] || 0));
  const sum = vals.reduce((a, b) => a + b, 0);
  if (sum <= 0) return 0;
  const mean = sum / vals.length;
  const sd = Math.sqrt(vals.reduce((a, b) => a + (b - mean) ** 2, 0) / vals.length);
  const balance = clamp(1 - (sd / (mean + 0.001)) * 0.9, 0.45, 1.0);
  const diversity = 1 + 0.09 * Math.max(0, (opts.distinct || 1) - 1);
  const peak = Math.max.apply(null, vals);
  const base = sum * 1.6 + peak * 2.2;
  return Math.max(0, Math.round(base * balance * diversity * (opts.mult || 1)));
}

/* --------------------------------------------------------------- traders */
const TRADERS = [
  { id: 'maya', name: 'Maya', blurb: 'only buys things that sparkle',
    wants: { sparkle: 2.6, shine: 1.6, stretch: 0.5, bounce: 0.4, body: 0.4 },
    patience: 2, coins: 260 },
  { id: 'alex', name: 'Alex', blurb: 'stretch tests everything',
    wants: { stretch: 2.8, bounce: 0.8, body: 0.9, shine: 0.3, sparkle: 0.3 },
    patience: 3, coins: 300 },
  { id: 'liam', name: 'Liam', blurb: 'bounces them off the ceiling',
    wants: { bounce: 2.9, body: 1.4, stretch: 0.6, shine: 0.3, sparkle: 0.2 },
    patience: 2, coins: 240 },
  { id: 'zoe', name: 'Zoe', blurb: 'buys by the pound',
    wants: { body: 3.0, shine: 1.0, bounce: 0.7, stretch: 0.5, sparkle: 0.5 },
    patience: 3, coins: 280 },
];

function traderOffer(trader, stats, distinct) {
  let weighted = 0;
  for (const s of STATS) weighted += (stats[s] || 0) * (trader.wants[s] || 0);
  const base = valueOf(stats, { distinct: distinct || 1 });
  return { coins: Math.max(0, Math.round((weighted * 3.1 + base * 0.55) / 5) * 5), weighted };
}

function acceptsCounter(trader, stats, want, countersLeft, distinct) {
  if (countersLeft <= 0) return false;
  const fair = traderOffer(trader, stats, distinct).coins;
  if (fair <= 0) return false;
  return want / fair <= 1.10 + 0.06 * countersLeft;
}

function makeIncoming(trader, theirStats, seed) {
  const rnd = mulberry(seed);
  const offered = {};
  for (const s of STATS) {
    offered[s] = round2(Math.max(0, (theirStats[s] || 0) * (0.75 + rnd() * 0.6)));
  }
  return {
    from: trader.id, stats: offered,
    colour: `hsl(${Math.floor(rnd() * 360)}, ${45 + Math.floor(rnd() * 35)}%, ${45 + Math.floor(rnd() * 25)}%)`,
    wanted: round2(20 + rnd() * 60),
  };
}

/* ---------------------------------------------------------- rng + naming */
function mulberry(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const round2 = v => Math.round(v * 100) / 100;

/** How the material behaves, in words - shown next to the sim. */
function describeMaterial(mat) {
  const words = [];
  const mid = (m) => (mat[m] - RANGES[m][0]) / (RANGES[m][1] - RANGES[m][0]);
  if (mid('pressure') > 0.66) words.push('very elastic');
  else if (mid('pressure') < 0.33) words.push('dead');
  if (mid('flow') > 0.66) words.push('runny');
  else if (mid('flow') < 0.33) words.push('firm');
  if (mid('density') > 0.66) words.push('heavy');
  else if (mid('density') < 0.33) words.push('light');
  if (mat.aeration > 0.5) words.push('foamy');
  return words.length ? words.join(', ') : 'unremarkable';
}

function nameFromRecipe(recipe, stats) {
  const present = Object.keys(recipe).filter(k => recipe[k] > 0);
  if (!present.length) return 'Empty Blob';
  const top = STATS.slice().sort((a, b) => (stats[b] || 0) - (stats[a] || 0))[0];
  const peak = stats[top] || 0;
  const adj = peak > 3.4 ? 'Prime' : peak > 2.2 ? 'Good' : peak > 1.2 ? 'Fair' : 'Weak';
  const flavour = {
    bounce: 'Bouncy', stretch: 'Stretchy', body: 'Dense',
    shine: 'Glossy', sparkle: 'Glittering',
  }[top];
  if (present.length === 1) return `${adj} ${INGREDIENTS[present[0]].name} Blob`;
  return `${adj} ${flavour} Slime`;
}

/* ------------------------------------------------------------- persistence */
function serialise(state) {
  return JSON.stringify({
    v: 2,                       // the material model replaced v1
    coins: state.coins,
    inv: (state.inv || []).map(s => ({
      name: s.name, stats: s.stats, colour: s.colour,
      recipe: s.recipe, mix: s.mix, value: s.value,
      material: s.material || null,
    })),
    made: state.made,
    sold: state.sold,
  });
}

function deserialise(text) {
  try {
    const o = JSON.parse(text);
    // v1 saves are still readable: the inventory shape did not change
    if (!o || (o.v !== 1 && o.v !== 2)) return null;
    return {
      coins: Number.isFinite(o.coins) ? o.coins : 120,
      inv: Array.isArray(o.inv) ? o.inv.filter(s => s && s.stats && s.colour) : [],
      made: Number.isFinite(o.made) ? o.made : 0,
      sold: Number.isFinite(o.sold) ? o.sold : 0,
    };
  } catch (e) { return null; }
}

/* Exported for the tests; ignored in the browser. */
if (typeof module === 'object' && module.exports) {
  module.exports = {
    INGREDIENTS, INGREDIENT_ORDER, MATERIALS, MATERIAL_LABEL, STATS, STAT_LABEL,
    RANGES, TRADERS,
    rawMaterial, activation, mixQuality, materialFromRecipe, statsFromMaterial, simParams,
    computeStats, computeColour, valueOf, traderOffer, acceptsCounter,
    makeIncoming, mulberry, round2, describeMaterial, nameFromRecipe,
    serialise, deserialise, clamp,
  };
}
