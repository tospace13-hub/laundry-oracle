# Laundry Oracle

Two tools from the [NewTexEco Care & Repair](https://newtexeco.nl/en/projecten/care-repair/) project:

- **Stain Oracle** (https://tospace13-hub.github.io/laundry-oracle/): pick a **textile**, a **colour** and a **stain**, and it tells you how to get the stain out without ruining the fabric.
- **Washing Oracle** (https://tospace13-hub.github.io/laundry-oracle/washing/): say what matters to you and what is in the drum, and it shows which **programme, temperature, spin, extras and detergent** to use on a Miele washing machine, button by button.

Each page links to the other. Your fabric and colour carry over when you switch.

## Stain Oracle

### What it covers

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

### How it works

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

## Washing Oracle

### Inputs

Every control is round or polygonal, like the machine itself. There are no sliders.

- **What matters most:** a hexagonal **balance pad** with six corners: Quick, Clean, Hygiene, Sustainable, Gentle (make it last) and Fewer creases. Drag the point towards what matters. In the centre, everything counts the same. The pad is built from `METRICS`, so adding a metric adds a corner.
- **Fabric:** a rotary dial with the Stain Oracle's 13 fabrics.
- **Colour:** round swatches around a porthole.
- **How dirty:** a three-position knob.
- **How full:** a drum you fill by tapping.
- **Your machine** (bottom of the page): pick the control panel that looks like yours. The choice is remembered in a cookie (`washing_machine`), with `localStorage` as a fallback.
  - Dial + small digit display (WSA, WEA, WCA Active)
  - Dial + digit display, values to touch (WEB, WED, WEK, WWB/WWD/WWE 380)
  - Same with TwinDos and steam (WEG, WEE)
  - Dial + one line of text (WCI/WCG 860/360, WWG/WWE 360, WWH/WWI 860)
  - Colour touchscreen (M Touch)
  - W2 Nova Edition
  - Not sure

Defaults are "average", because most people won't change them:
- balanced priorities
- cotton, bright colours
- normal soiling, half a drum
- machine: Not sure

### How it works

[`washing/washing.js`](washing/washing.js) builds every candidate setting the machine offers for that fabric and load: programme × temperature × extras. It then:
- scores each candidate on the six metrics (time, kWh and litres per kg, cleaning, hygiene, gentleness, creasing)
- weights the scores by the pad
- returns the best candidate plus two alternatives that trade differently ("Fastest", "Greenest" and so on)

**Hard rules:**
- temperature within the fabric, colour and programme limits
- wool and silk only in Woollens or Silks
- Express 20 only for small, not heavily soiled loads
- extras only where Miele offers them
- spin within the programme, fabric and machine limits
- TwinDos and CapDosing only on machines that have them
- loads over a programme's maximum get a "split this load" warning

**Where the data comes from:**
- Programme limits, consumption figures (kWh, litres, time), option rules and panel symbols come from Miele en-GB operating instructions: WCI 860, WSA123, WEB365 and WEG885.
- Figures that were interpolated, or taken from product sheets rather than a manual page, are flagged `approx` and shown as **Approximate**.
- Icons are drawn after Miele's panel symbols. This is an independent tool, not affiliated with Miele.

### Files

| File | What |
|------|------|
| `washing/washing.js` | Knowledge base and the pure `advise()` engine. Runs in Node and the browser. |
| `washing/icons.js` | 48×48 line icons: Miele-style panel symbols and programme pictograms |
| `washing/washing-app.js` | The page: balance pad, dial, knobs, settings, panel drawings, machine picker |
| `washing/washing.css` | Page styles on top of `style.css` |

## Run it

Open `index.html` in a browser, or serve the folder (`python3 -m http.server`) and open `/washing/`. There is no build step.

## Test it

```sh
node --test
```

`test/oracle.test.mjs` goes through all 1,365 stain combinations and checks these safety rules:
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
