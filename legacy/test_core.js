/* Tests for the slime logic. The crafting has to have real consequences and the
   traders have to genuinely differ, or the game is the coin flip it replaced.

   RUN:  node test_core.js
*/
const C = require('./slime_core.js');

let pass = 0, fail = 0;
const check = (n, c, x) => {
  if (c) { pass++; console.log('  PASS  ' + n); }
  else { fail++; console.log('  FAIL  ' + n + (x ? '   -> ' + x : '')); }
};

/* ------------------------------------------------------------ chemistry */
console.log('\n  ---- mixing has consequences ----');
check('an unmixed batch keeps only a fraction', C.mixPenalty(0) < 0.4, String(C.mixPenalty(0)));
check('a fully mixed batch keeps all of it', Math.abs(C.mixPenalty(1) - 1) < 1e-9);
check('mixing is monotonic', C.mixPenalty(0.3) < C.mixPenalty(0.7));
check('mix beyond 1 cannot exceed the cap', C.mixPenalty(5) === 1);

const recipe = { glue: 2, borax: 1, soap: 1, glitter: 1 };
const unmixed = C.computeStats(recipe, 0);
const half = C.computeStats(recipe, 0.5);
const full = C.computeStats(recipe, 1);
check('the same recipe scores higher when mixed', full.stretch > half.stretch && half.stretch > unmixed.stretch,
      `${unmixed.stretch} < ${half.stretch} < ${full.stretch}`);

console.log('\n  ---- borax is a real constraint, not a free bonus ----');
const none = C.boraxFactor({ glue: 3 });
const under = C.boraxFactor({ glue: 20, borax: 0.5 });  // 2.4% - far too little
const good = C.boraxFactor({ glue: 3, borax: 1, soap: 3, glitter: 2 }); // ~11% - in the window
const over = C.boraxFactor({ glue: 1, borax: 4 });
check('no borax barely activates', none < 0.3, String(none));
check('the right ratio activates fully', good === 1.0, String(good));
check('too much borax over-sets and hurts', over < 1.0, String(over));
check('under-activated is also penalised', under < 1.0, String(under));
// 1 part borax to 3 glue is 25%, squarely inside the good window - this is the
// classic recipe and must score full marks, not be mistaken for a fault
check('the classic 1:3 ratio activates fully',
      C.boraxFactor({ glue: 3, borax: 1 }) === 1.0);
check('the window has a lower edge too',
      C.boraxFactor({ glue: 1, borax: 0.05 }) === 0.55);
check('over-setting is reached before absurdity',
      C.boraxFactor({ glue: 1, borax: 2 }) < 0.6,
      String(C.boraxFactor({ glue: 1, borax: 2 })));

console.log('\n  ---- diminishing returns ----');
const one = C.computeStats({ glue: 1, borax: 0.3 }, 1);
const ten = C.computeStats({ glue: 10, borax: 3 }, 1);
check('more ingredient still helps', ten.body > one.body, `${one.body} -> ${ten.body}`);
check('but not proportionally', ten.body < one.body * 4, `${one.body}*4 vs ${ten.body}`);
check('stats are capped near the tanh ceiling', ten.body <= 5.5);
check('an empty recipe scores zero', C.computeStats({}, 1).body === 0);
check('stats are never negative', C.computeStats({ soap: 10, borax: 1 }, 1).stretch >= 0);

console.log('\n  ---- colour comes from the ingredients ----');
const pink = C.computeColour({ shampoo: 4 });
check('a shampoo-heavy batch goes pink', pink[0] > 150 && pink[2] > 100, JSON.stringify(pink));
const green = C.computeColour({ borax: 4 });
check('a borax-heavy batch goes green', green[1] > 120 && green[1] > green[2], JSON.stringify(green));
check('every colour channel is a valid byte',
      [pink, green].every(c => c.every(v => v >= 0 && v <= 255)));

/* ------------------------------------------------------------ valuation */
console.log('\n  ---- balance is rewarded ----');
const flat = C.valueOf({ stretch: 2, bounce: 2, body: 2, shine: 2, sparkle: 2 });
const spiky = C.valueOf({ stretch: 10, bounce: 0, body: 0, shine: 0, sparkle: 0 });
check('a balanced slime is worth more than a lopsided one of equal total',
      flat > spiky, `flat ${flat} vs spiky ${spiky}`);
check('a better slime is worth more', C.valueOf({ stretch: 4, bounce: 4, body: 4, shine: 4, sparkle: 4 })
      > C.valueOf({ stretch: 3, bounce: 3, body: 3, shine: 3, sparkle: 3 }));
check('a worthless slime is worth nothing', C.valueOf({}) === 0);

/* -------------------------------------------------------------- traders */
console.log('\n  ---- traders are actually different ----');
const sparkly = { stretch: 1, bounce: 1, body: 1, shine: 2, sparkle: 6 };
const stretchy = { stretch: 6, bounce: 1, body: 1, shine: 2, sparkle: 1 };
const maya = C.TRADERS.find(t => t.id === 'maya');
const alex = C.TRADERS.find(t => t.id === 'alex');
check('Maya pays more for the sparkly one',
      C.traderOffer(maya, sparkly).coins > C.traderOffer(maya, stretchy).coins);
check('Alex pays more for the stretchy one',
      C.traderOffer(alex, stretchy).coins > C.traderOffer(alex, sparkly).coins);
check('so the right buyer matters', (() => {
  const m1 = C.traderOffer(maya, sparkly).coins, a1 = C.traderOffer(alex, sparkly).coins;
  const m2 = C.traderOffer(maya, stretchy).coins, a2 = C.traderOffer(alex, stretchy).coins;
  return m1 > a1 && a2 > m2;
})());
check('every trader is willing to name a price', C.TRADERS.every(t => C.traderOffer(t, sparkly).coins > 0));
check('every trader has a stated preference', C.TRADERS.every(t =>
      Object.keys(t.wants).length === C.STATS.length && t.blurb.length > 5));
check('a worthless slime is not bought at a premium',
      C.TRADERS.every(t => C.traderOffer(t, {}).coins === 0));

console.log('\n  ---- counters are limited by patience ----');
const fair = C.traderOffer(maya, sparkly).coins;
check('asking exactly the offered price is accepted', C.acceptsCounter(maya, sparkly, fair, 2));
check('a modest ask above is accepted', C.acceptsCounter(maya, sparkly, fair * 1.08, 2));
check('a greedy ask is refused', !C.acceptsCounter(maya, sparkly, fair * 2.5, 2));
check('with no patience left, nothing is accepted',
      !C.acceptsCounter(maya, sparkly, fair, 0), 'countersLeft 0');
check('more patience tolerates more', (() => {
  const ask = fair * 1.18;
  return C.acceptsCounter(maya, sparkly, ask, 3) === true &&
         C.acceptsCounter(maya, sparkly, ask, 1) === false;
})());
check('an empty slime cannot be countered on', !C.acceptsCounter(maya, {}, 10, 3));

/* -------------------------------------------------------------- incoming */
console.log('\n  ---- incoming offers ----');
const a1 = C.makeIncoming(maya, sparkly, 1234);
const a2 = C.makeIncoming(maya, sparkly, 1234);
const b1 = C.makeIncoming(maya, sparkly, 9999);
check('offers are reproducible from a seed', JSON.stringify(a1) === JSON.stringify(a2));
check('a different seed gives a different offer', JSON.stringify(a1) !== JSON.stringify(b1));
check('an offer has all the stats', C.STATS.every(s => Number.isFinite(a1.stats[s])));
check('offered stats are never negative', C.STATS.every(s => a1.stats[s] >= 0));
check('the offer states what they will pay', a1.wanted > 0, String(a1.wanted));
check('a trader can offer against a weak slime too',
      C.STATS.every(s => C.makeIncoming(maya, {}, 7).stats[s] >= 0));

/* ------------------------------------------------------------ naming */
console.log('\n  ---- slimes get readable names ----');
const s1 = C.computeStats({ glue: 2, borax: 1, glitter: 4 }, 1);
check('a glitter-heavy batch is named for sparkle',
      /Glitter|Glossy/.test(C.nameFromRecipe({ glue: 2, borax: 1, glitter: 4 }, s1)),
      C.nameFromRecipe({ glue: 2, borax: 1, glitter: 4 }, s1));
check('an empty slime gets a clear name', C.nameFromRecipe({}, {}) === 'Empty Blob');
check('a single ingredient is named after it',
      /Glue/.test(C.nameFromRecipe({ glue: 1 }, C.computeStats({ glue: 1 }, 1))));
check('a strong slime is called Prime',
      /^Prime/.test(C.nameFromRecipe({ glue: 3, borax: 1, soap: 3 },
        { stretch: 5, bounce: 3, body: 4, shine: 2, sparkle: 1 })));

/* ------------------------------------------------------------- saving */
console.log('\n  ---- persistence ----');
const st = { coins: 240, inv: [{ name: 'x', stats: { stretch: 2 }, colour: 'red' }], made: 3, sold: 1 };
const round = C.deserialise(C.serialise(st));
check('a save round-trips', round && round.coins === 240 && round.inv.length === 1 && round.made === 3);
check('garbage does not throw', C.deserialise('not json') === null);
check('a wrong version is refused', C.deserialise('{"v":99,"coins":5}') === null);
check('a corrupt inventory entry is dropped',
      C.deserialise('{"v":1,"coins":10,"inv":[{"name":"ok","stats":{},"colour":"#fff"},null,{"bad":1}]}').inv.length === 1);
check('missing numbers fall back rather than becoming undefined',
      C.deserialise('{"v":1,"inv":[]}').coins === 120);

/* ------------------------------------------------ the whole loop closes */
console.log('\n  ---- a crafted slime actually beats a lazy one ----');
const lazyStats = C.computeStats({ glue: 3, borax: 1 }, 0.05);
const craftedStats = C.computeStats({ glue: 3, borax: 1, soap: 2, glitter: 2, shampoo: 1 }, 1.0);
const lazyVal = C.valueOf(lazyStats), craftedVal = C.valueOf(craftedStats);
check('the crafted slime is worth more', craftedVal > lazyVal * 2,
      `${lazyVal} vs ${craftedVal}`);
console.log(`         lazy:    ${C.nameFromRecipe({glue:3,borax:1}, lazyStats)} worth ${lazyVal}`);
console.log(`         crafted: ${C.nameFromRecipe({glue:3,borax:1,soap:2,glitter:2,shampoo:1}, craftedStats)} worth ${craftedVal}`);

console.log(`\n  RESULT  passes=${pass}  fails=${fail}`);
process.exit(fail ? 1 : 0);
