/* =====================================================================
   SLIME — pure logic.

   Everything in this file is DOM-free so it can be tested directly in
   Node. The renderer and input handling live in the game script.

   The core idea the original lacked: a slime's quality is DECIDED by how
   it was made. Ingredients set what it can be, and mixing decides how much
   of that you actually get. Nothing here is a static stat.
   ===================================================================== */
'use strict';

/* ------------------------------------------------------------ ingredients

   Each ingredient pushes the slime along its own axes. Borax is the
   activator - without it the polymer never sets, which is real slime
   chemistry and gives the recipe a genuine constraint.
*/
const INGREDIENTS = {
  glue: {
    name: 'PVA Glue', emoji: '\u{1F9F4}', cost: 6, colour: [248, 250, 252],
    adds: { body: 3.0, stretch: 1.0, bounce: 0.2, shine: 0.3, sparkle: 0 },
    note: 'the polymer base. nothing works without it.',
  },
  borax: {
    name: 'Borax', emoji: '\u{1F9EA}', cost: 9, colour: [34, 197, 94],
    adds: { body: 1.0, stretch: -0.4, bounce: 3.0, shine: 0.2, sparkle: 0 },
    note: 'activates it. too much and it turns brittle.',
  },
  soap: {
    name: 'Hand Soap', emoji: '\u{1F9FC}', cost: 5, colour: [56, 189, 248],
    adds: { body: 0.4, stretch: 3.2, bounce: 0.6, shine: 0.8, sparkle: 0 },
    note: 'lengthens the chains. the stretch comes from here.',
  },
  shampoo: {
    name: 'Shampoo', emoji: '\u{1F9F4}', cost: 7, colour: [236, 72, 153],
    adds: { body: 0.6, stretch: 1.2, bounce: 0.3, shine: 3.0, sparkle: 0.4 },
    note: 'glossy. makes it shine in the light.',
  },
  glitter: {
    name: 'Glitter', emoji: '\u{2728}', cost: 12, colour: [234, 179, 8],
    adds: { body: 0.2, stretch: 0.2, bounce: 0.2, shine: 1.0, sparkle: 3.4 },
    note: 'does nothing functional. worth a great deal anyway.',
  },
  toner: {
    name: 'Toner', emoji: '\u{1F4A7}', cost: 4, colour: [186, 230, 253],
    adds: { body: -0.2, stretch: 1.6, bounce: 0.4, shine: 0.6, sparkle: 0 },
    note: 'thins it out. a little goes far.',
  },
};

// the order matters: it is the order they are offered in the shop
const INGREDIENT_ORDER = ['glue', 'borax', 'soap', 'shampoo', 'glitter', 'toner'];

const STATS = ['stretch', 'bounce', 'body', 'shine', 'sparkle'];
const STAT_LABEL = {
  stretch: 'Stretch', bounce: 'Bounce', body: 'Body',
  shine: 'Shine', sparkle: 'Sparkle',
};

/* ------------------------------------------------------------- chemistry

   Mixing is not decoration: an unmixed batch keeps only a fraction of what
   the ingredients could give. `mix` runs 0..1 and is driven by how far the
   player actually dragged, so a slime is as good as the effort in it.
*/
function mixPenalty(mix) {
  const m = clamp(mix, 0, 1);
  // a floor so an unmixed slime is bad but not worthless
  return 0.35 + 0.65 * m;
}

/* Borax sets the polymer. Below a threshold it never comes together at all,
   and above a much higher one it over-sets and goes brittle. Both are
   failures, so the correct window is narrow - which is the interesting part
   of the recipe rather than a free bonus. */
function boraxFactor(recipe) {
  const n = recipe.borax || 0;
  const total = Object.values(recipe).reduce((a, b) => a + b, 0) || 1;
  const ratio = n / total;
  if (n === 0) return 0.25;                 // never activated
  if (ratio < 0.08) return 0.55;            // under-activated, still tacky
  if (ratio <= 0.45) return 1.0;            // the good window
  // Over-setting climbs steeply: at a 2:1 borax-to-glue ratio the slime is
  // already brittle, and only past that does the floor take over.
  return Math.max(0.35, 1.0 - (ratio - 0.45) * 2.2);
}

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

/** Aggregate a recipe into raw stats, before quality is applied. */
function rawStats(recipe) {
  const out = { stretch: 0, bounce: 0, body: 0, shine: 0, sparkle: 0 };
  let count = 0;
  for (const key of Object.keys(recipe)) {
    const n = recipe[key] || 0;
    if (n <= 0) continue;
    const ing = INGREDIENTS[key];
    if (!ing) continue;
    count += n;
    for (const s of STATS) out[s] += (ing.adds[s] || 0) * n;
  }
  return { stats: out, count };
}

/** Final stats: raw, shaped by activation and mixing effort. */
function computeStats(recipe, mix) {
  const { stats, count } = rawStats(recipe);
  if (count === 0) return { stretch: 0, bounce: 0, body: 0, shine: 0, sparkle: 0 };
  const bf = boraxFactor(recipe);
  const mp = mixPenalty(mix);
  const out = {};
  for (const s of STATS) {
    // one ingredient can be pushed hard, but returns diminish - a batch of
    // ten glues is not ten times better than one
    const raw = stats[s];
    out[s] = round2(Math.max(0, 5.5 * Math.tanh(raw / 5.5) * bf * mp));
  }
  return out;
}

/** A colour blended from the ingredients, weighted by how much of each. */
function computeColour(recipe) {
  let r = 240, g = 240, b = 240, w = 1;   // start from a neutral base
  for (const key of Object.keys(recipe)) {
    const n = recipe[key] || 0;
    if (n <= 0) continue;
    const c = INGREDIENTS[key].colour;
    const k = n * 1.0;
    r += (c[0] - r) * (k / (w + k));
    g += (c[1] - g) * (k / (w + k));
    b += (c[2] - b) * (k / (w + k));
    w += k;
  }
  return [Math.round(r), Math.round(g), Math.round(b)];
}

/* -------------------------------------------------------------- valuation

   Value is not just the sum of stats. Balance pays, because a slime that
   is excellent at one thing is easy to find and one that is good at
   everything is not. Specialism is worth a little; balance is worth more.
*/
function valueOf(stats, opts) {
  opts = opts || {};
  const vals = STATS.map(s => Math.max(0, stats[s] || 0));

  // A recipe made of more distinct ingredients is harder to get right and is worth
  // more than the same numbers from one or two. Without this, stack-saturation made
  // the CHEAPEST recipe the most profitable and there was no reason to progress.
  const diversity = 1 + 0.09 * Math.max(0, (opts.distinct || 1) - 1);
  const sum = vals.reduce((a, b) => a + b, 0);
  if (sum <= 0) return 0;

  const mean = sum / vals.length;
  const variance = vals.reduce((a, b) => a + (b - mean) ** 2, 0) / vals.length;
  const sd = Math.sqrt(variance);
  // 1.0 when perfectly even, falling as the spread widens
  // 0.9 slope and a 0.45 floor: at maximum spread the penalty has to be strong
  // enough that a balanced batch genuinely outscores a lopsided one of the same
  // total. A specialist slime is still worth money - it is just worth it to the
  // trader who collects that stat, not on the open market.
  const balance = clamp(1 - (sd / (mean + 0.001)) * 0.9, 0.45, 1.0);

  const peak = Math.max.apply(null, vals);
  const base = sum * 1.6 + peak * 2.2;
  return Math.max(0, Math.round(base * balance * diversity * (opts.mult || 1)));
}

/* --------------------------------------------------------------- traders

   Each trader wants something different, and says so. A trader who loves
   Sparkle will pay far above the odds for glitter; the same slime is
   ordinary to someone who only cares about Stretch. That is what makes
   choosing who to trade with a decision instead of a coin flip.
*/
const TRADERS = [
  {
    id: 'maya', name: 'Maya', blurb: 'collects anything that sparkles',
    wants: { sparkle: 2.6, shine: 1.6, stretch: 0.5, bounce: 0.4, body: 0.4 },
    patience: 2, coins: 260,
  },
  {
    id: 'alex', name: 'Alex', blurb: 'stretch tests everything. everything.',
    wants: { stretch: 2.8, bounce: 0.8, body: 0.9, shine: 0.3, sparkle: 0.3 },
    patience: 3, coins: 300,
  },
  {
    id: 'liam', name: 'Liam', blurb: 'bounces them off the ceiling',
    wants: { bounce: 2.9, body: 1.4, stretch: 0.6, shine: 0.3, sparkle: 0.2 },
    patience: 2, coins: 240,
  },
  {
    id: 'zoe', name: 'Zoe', blurb: 'buys by the pound, values body',
    wants: { body: 3.0, shine: 1.0, bounce: 0.7, stretch: 0.5, sparkle: 0.5 },
    patience: 3, coins: 280,
  },
];

/** What one trader thinks a slime is worth. */
function traderOffer(trader, stats, distinct) {
  let weighted = 0;
  for (const s of STATS) weighted += (stats[s] || 0) * (trader.wants[s] || 0);
  // the base value still matters, so nobody buys a worthless slime at a premium
  const base = valueOf(stats, { distinct: distinct || 1 });
  const raw = weighted * 3.1 + base * 0.55;
  const rounded = Math.max(0, Math.round(raw / 5) * 5);
  return { coins: rounded, weighted };
}

/** Would this trader take `want` coins instead, given their own offer? */
function acceptsCounter(trader, stats, want, countersLeft, distinct) {
  if (countersLeft <= 0) return false;
  const fair = traderOffer(trader, stats, distinct).coins;
  if (fair <= 0) return false;
  const greed = want / fair;
  // patience lets them swallow one greedy ask; a third of the way over is
  // where even a keen buyer walks
  const tolerance = 1.10 + 0.06 * countersLeft;
  return greed <= tolerance;
}

/** Incoming offers: traders approach you, offering a slime of their own. */
function makeIncoming(trader, theirStats, seed) {
  const rnd = mulberry(seed);
  const offered = {};
  for (const s of STATS) {
    // (theirStats[s] || 0): an empty or partial stats object must not produce
    // NaN, which then propagates into every comparison downstream
    offered[s] = round2(Math.max(0, (theirStats[s] || 0) * (0.75 + rnd() * 0.6)));
  }
  return {
    from: trader.id,
    stats: offered,
    colour: `hsl(${Math.floor(rnd() * 360)}, ${45 + Math.floor(rnd() * 35)}%, ${45 + Math.floor(rnd() * 25)}%)`,
    wanted: round2(20 + rnd() * 60),   // what they will pay towards, in coins
  };
}

/* --------------------------------------------------------- rng + helpers */
function mulberry(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const round2 = v => Math.round(v * 100) / 100;

/** Name a slime from what is actually in it, so the inventory is readable. */
function nameFromRecipe(recipe, stats) {
  const present = Object.keys(recipe).filter(k => recipe[k] > 0);
  if (!present.length) return 'Empty Blob';
  const top = STATS.slice().sort((a, b) => (stats[b] || 0) - (stats[a] || 0))[0];
  const peak = stats[top] || 0;
  const adj = peak > 3.4 ? 'Prime' : peak > 2.2 ? 'Good' : peak > 1.2 ? 'Fair' : 'Weak';
  const flavour = {
    stretch: 'Stretchy', bounce: 'Bouncy', body: 'Dense',
    shine: 'Glossy', sparkle: 'Glittering',
  }[top];
  if (present.length === 1) return `${adj} ${INGREDIENTS[present[0]].name} Blob`;
  return `${adj} ${flavour} Slime`;
}

/** Save/load shape. Kept separate so persistence can be tested without a DOM. */
function serialise(state) {
  return JSON.stringify({
    v: 1,
    coins: state.coins,
    inv: state.inv,
    made: state.made,
    sold: state.sold,
  });
}
function deserialise(text) {
  try {
    const o = JSON.parse(text);
    if (!o || o.v !== 1) return null;
    return {
      coins: Number.isFinite(o.coins) ? o.coins : 120,
      inv: Array.isArray(o.inv) ? o.inv.filter(s => s && s.stats && s.colour) : [],
      made: Number.isFinite(o.made) ? o.made : 0,
      sold: Number.isFinite(o.sold) ? o.sold : 0,
    };
  } catch (e) {
    return null;
  }
}

/* Exported for the test runner in Node; ignored in the browser. */
if (typeof module === 'object' && module.exports) {
  module.exports = {
    INGREDIENTS, INGREDIENT_ORDER, STATS, STAT_LABEL, TRADERS,
    mixPenalty, boraxFactor, rawStats, computeStats, computeColour,
    valueOf, traderOffer, acceptsCounter, makeIncoming,
    mulberry, round2, nameFromRecipe, serialise, deserialise,
  };
}
