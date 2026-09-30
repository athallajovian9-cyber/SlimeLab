# Slime Lab

Make slime. Sell it to whoever wants it most.

The blob is a **real soft-body simulation**. The recipe decides its material
properties, the material drives the physics, and the same numbers decide what a
trader will pay — so what you watch jiggle is exactly what you sell.

## Play

Double-click **`Slime Game.exe`**. No installer, no setup, works offline.

Or run **`LAUNCHER.bat`**, which finds Chrome or Edge itself. Either way the game is
one self-contained file with no external requests.

**Drag on the slime to mix it.** That is the whole game.

## How it works

```
recipe  --[ MIX MATRIX ]-->  material properties
                                 |
                                 +--> drives the SOFT-BODY SIMULATION
                                 +--> drives the SELLABLE STATS
```

The matrix is a linear mixture model, which is how real mixtures are approximated:
each ingredient pushes each property in proportion to how much of it is present.

### What each ingredient does — measured, not claimed

```
ingredient   size   stiffness  retention  elasticity  density  fluidity  bubbles
glue         +       ~          ~          ~           ++       -         -
borax        +       +++        +++        ++          -        --        -
shampoo      +       --         ---        -           ~        +++       +
soap         +++     -          -          +           ---      +         +++
toner        +       -          -          -           -        ++        -
glitter      ~       ~          ~          ~           +        ~         -
```

Measured on the actual model, four of each added to a `glue 4 / borax 1.2` base:

```
                 size  stiff  retention  elasticity  density  fluidity  bubbles
base              1.51  0.99     0.979       3.09      2.58     0.36       0
+ glue            2.27  0.92     0.975       3.07      2.60     0.38       0
+ borax           2.27  1.00     0.987       2.88      2.23     0.32       0
+ shampoo         2.28  0.67     0.940       2.28      2.12     0.74       1
+ soap            2.40  0.74     0.964       2.72      1.69     0.54      15
+ toner           2.27  0.71     0.953       2.34      2.04     0.63       0
+ glitter         2.27  0.80     0.968       2.52      2.31     0.42       0
```

**Glue** is the base: mass, size, density. **Borax** is the activator — it tightens
the springs, so the slime snaps back faster and jiggles more, and it reduces how runny
it is. **Shampoo** is the softener: lower stiffness, slower to respond, more liquid.
**Soap** aerates it — real foam bubbles inside the body, and lower density.
**Toner** thins it. **Glitter** does nothing to how it moves; it is worth money anyway.

### What the physics actually does

Measured by running the simulation headlessly and stepping it:

```
holds its volume after settling      area 58,074 against a 60,995 target   (95%)
stops moving once settled            0.58 px per particle over 120 frames
survives any recipe and any drag     no NaN, never leaves the bowl, at any
                                     extreme the matrix can produce
a stiff slime springs back           0.020 mean deviation from round after
  (strongest effect)                 being deformed and released
a runny slime slumps                 0.030, and it stays that way
the activated slime snaps back       still off by 0.6% of its size 24 frames
                                     after a knock, against 2.2% for the runny one
a stiff slime resists the drag       0.118 mix gained from a gesture,
                                     against 0.176 for a soft one
a runny slime deforms more landing   squashes to 0.585 of rest, against 0.593
a runny slime stretches further      diameter 2.067 restR pulled, against 2.030
```

The shape and snap-back differences are large and obvious. The landing squash and the
stretch are real but **small** - a couple of percent - so do not expect the last two to
be visible at a glance. I have listed them because they are the measurements my own
test asserts, not because they are dramatic.

### Borax is a real constraint

Below about 8% of the mix it never comes together. The good window runs to roughly
45%. Past that it over-sets and goes brittle. One part borax to three parts glue is the
classic ratio and scores full marks. There is a correct answer, and it is not "add
more" — diluting it with other ingredients can push it back out of the window.

### Mixing

An unmixed batch keeps only about a third of what the ingredients could give, and
every ingredient you add dilutes the mix so you have to work it in again. How hard it
is to mix depends on the material: a stiff slime fights the drag, a runny one gives way.

## The traders

```
Maya   collects anything that sparkles    pays extra for Sparkle
Alex   stretch tests everything           pays extra for Stretch
Liam   bounces them off the ceiling       pays extra for Bounce
Zoe    buys by the pound                  pays extra for Body
```

A glitter-heavy slime is worth roughly double to Maya and close to nothing to Alex.
You can **ask for more** — each trader has limited patience, and when it runs out they
lower the offer instead of raising it. Walking away costs nothing.

## Value

Value is not the sum of the stats. Specialism is easy; balance is not. A recipe built
from more distinct ingredients is worth more again, and **yield multiplies everything**
so a bigger batch of the same recipe earns more. Measured:

```
glue x2, borax x1                  cost ◈21   best offer ◈75    profit +54
+ soap                             cost ◈26   best offer ◈75    profit +49
+ shampoo                          cost ◈33   best offer ◈85    profit +52
+ toner                            cost ◈37   best offer ◈85    profit +48
+ glitter x2                       cost ◈57   best offer ◈130   profit +73
+ glitter x6                       cost ◈97   best offer ◈135   profit +38
```

Over-stacking one ingredient hits diminishing returns, so more is not automatically
better — but a bigger well-balanced batch is.

Progress saves to browser storage and survives a reload.

## What was wrong with the first version

```
the mix meter        present in the markup, never written to by any code
"drag/swipe to mix"  promised in the UI, no input handler existed anywhere
state.firm           incremented on every ingredient, never read by anything
the colour argument  add() took a hex value and ignored it
saving               "Save to Inventory" persisted nothing; a reload lost everything
the traders          no preferences at all. every trade was a coin flip
the slime itself     a CSS circle. the recipe only changed its colour
```

## Verify it yourself

```
node test_model.js     # 49 checks: the matrix, the activation window, every
                       #            ingredient's claimed effect and its size,
                       #            valuation, traders, persistence
node test_physics.js   # 21 checks: runs the simulation headlessly and MEASURES it -
                       #            settling, volume, stability, and that the material
                       #            really does change how it moves
node test_game.js      # 36 checks: drives the BUILT page - buy, mix, save, sell,
                       #            counter, reload
python3 build_game.py
```

`test_physics.js` is the one that matters for the simulation: the renderer cannot be
seen from a terminal, so it steps the soft body and measures volume, drift, stability
and the physical difference between recipes.

## Files

```
Slime Game.exe                    the game, self-contained
LAUNCHER.bat                      opens it in a browser instead, if you prefer
slime_game.html                   the built game
slime_model.js                    the rules and the mix matrix, DOM-free and testable
slime_game_v2.html                the page template (build_game.py fills in the model)
build_game.py                     inlines the model into the page
test_model.js test_physics.js test_game.js    the test suites
legacy/                           the earlier, simpler model and its tests
slime_game_original_backup.html   your first version, untouched
```
