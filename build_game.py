"""
Builds the single-file game: the model is inlined into the page template.

The model is inlined VERBATIM, so the code the browser runs is exactly the code the
test suite exercises. A `CORE` namespace is added because the model is written as a
plain module.

Idempotent on purpose: the template is looked for under several names, and if none is
found the built page is re-used as its own template when it still carries the slot. A
missing template once failed silently and produced a page with an unfilled slot - a
game that boots to nothing.

RUN
    python3 build_game.py
"""
import re
from pathlib import Path

HERE = Path(__file__).resolve().parent
OUT = HERE / "slime_game.html"
MODEL = HERE / "slime_model.js"

# newest template first; the built page itself is the last resort
TEMPLATES = ["slime_game_v2.html", "slime_game_new.html", "slime_game.html"]
SLOTS = ("/*__MODEL__*/", "/*__CORE__*/")

NAMESPACE = """
/* ---- namespace so the game can call into the tested model ---- */
const CORE = {
  INGREDIENTS, INGREDIENT_ORDER, MATERIALS, MATERIAL_LABEL, STATS, STAT_LABEL,
  RANGES, TRADERS,
  rawMaterial, activation, mixQuality, materialFromRecipe, statsFromMaterial,
  simParams, computeStats, computeColour, valueOf, traderOffer, acceptsCounter,
  makeIncoming, mulberry, round2, describeMaterial, nameFromRecipe,
  serialise, deserialise, clamp,
};
"""


def find_template():
    """Return (path, text, slot) for the first file that still has an injection slot."""
    for name in TEMPLATES:
        p = HERE / name
        if not p.exists():
            continue
        text = p.read_text(encoding="utf-8")
        for slot in SLOTS:
            if slot in text:
                return p, text, slot
    raise SystemExit(
        "  ERROR: no template containing an injection slot.\n"
        f"  Looked for {SLOTS} in: {', '.join(TEMPLATES)}\n"
        "  Restore one of those files, or the page cannot be built."
    )


def main():
    tpl_path, html, slot = find_template()
    model = MODEL.read_text(encoding="utf-8")

    # the model must be the same text the tests run
    assert "function materialFromRecipe" in model, "slime_model.js looks wrong"
    assert "function simParams" in model, "slime_model.js is missing simParams"
    html = html.replace(slot, model + NAMESPACE, 1)

    # a page that still carries a slot would boot to nothing - refuse to ship it
    for leftover in SLOTS:
        assert leftover not in html, f"the slot {leftover} was not filled"
    assert "const CORE = {" in html, "the namespace was not added"

    ext = re.findall(r'(?:src|href)\s*=\s*["\'](?:https?:)?//[^"\']+', html)
    assert not ext, f"external references remain: {ext}"

    OUT.write_text(html, encoding="utf-8")

    scripts = re.findall(r"<script>(.*?)</script>", html, re.S)
    print(f"  template      {tpl_path.name}   slot {slot}")
    print(f"  model         {MODEL.name}  ({len(model):,} bytes)")
    print(f"  wrote         {OUT.name}  ({OUT.stat().st_size:,} bytes)")
    print(f"  script blocks {len(scripts)}  "
          f"(model {len(scripts[0]):,}, game {len(scripts[1]):,})")
    print(f"  model inlined {'function simParams' in scripts[0]}")
    print(f"  external refs {len(ext)}")
    return OUT


if __name__ == "__main__":
    main()
