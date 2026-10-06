# Laundry Oracle

Pick a **textile**, a **colour** and a **stain**. The oracle tells you how to get it out without ruining the fabric.

It is part of the [NewTexEco Care & Repair](https://newtexeco.nl/en/projecten/care-repair/) project.

**Live:** https://tospace13-hub.github.io/laundry-oracle/

## What it covers

- **13 textiles:** cotton, linen, denim, viscose/modal/lyocell, acetate, polyester, nylon, acrylic, sportswear (elastane), wool, cashmere, silk, and "not sure", which is the most cautious option.
- **5 colours:** white, light/pastel, bright, dark, and print/multicolour.
- **21 stains**, grouped by chemistry: protein, tannin, oil & grease, dye & pigment, combination, wax & gum, and other.

Each reading gives you:
- first aid
- ordered treatment steps
- what the oracle forbids
- wash & dry settings, with ISO 3758 care-label symbols
- the kit you need
- a tip for that fibre

## How it works

There is no backend and no AI. The advice is put together from rules in [`oracle.js`](oracle.js):

| Table      | Holds |
|------------|-------|
| `TEXTILES` | What each fibre tolerates: max wash temperature, enzymes, alkali, oxygen/chlorine bleach, acetone, alcohol, sun, tumble, iron setting |
| `COLOURS`  | What each colour tolerates: temperature cap, bleach, sun, boiling-water pour |
| `STAINS`   | Ordered steps. Each step declares the methods it `needs` and can carry a `fallback` |

`consult(textile, colour, stain)` handles each step in turn:
- It **keeps** a step when the fibre and colour allow every method the step needs.
- It **swaps in the fallback** when they don't.
- It **drops** the step when there is no allowed fallback.
- It marks "allowed after a test" steps with **Test first**.
- It fills in temperatures (always within both the fibre and colour limits) and the fibre's handling.

Some fibre/stain combinations are flagged *Take it to a pro*. Examples are nail polish on acetate, and rust or grease on silk.

## Run it

Open `index.html` in a browser. There is no build step.

## Test it

```sh
node --test
```

The tests go through all 1,365 combinations and check these safety rules:
- no chlorine unless the item is white cotton or linen
- no enzymes, oxygen bleach or alkali on wool, silk or cashmere
- no acetone on acetate or acrylic
- no hot water for protein stains
- no bleach on darks
- every temperature within the limits
- no empty or unfilled text

## Add a stain or textile

1. Add an entry to `STAINS` or `TEXTILES` in `oracle.js`, following the existing ones.
2. For a step that uses a method only some fibres tolerate, list it in `needs` and give a gentler `fallback`.
3. Run `node --test`.

## Disclaimer

Your care label wins. Always test on a hidden seam first. This is general advice for home laundry. Valuable, vintage or dry-clean-only pieces belong with a professional.
