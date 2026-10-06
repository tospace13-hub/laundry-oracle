# Laundry Oracle

Two tools from the [NewTexEco Care & Repair](https://newtexeco.nl/en/projecten/care-repair/) project:

- **Stain Oracle** (https://tospace13-hub.github.io/laundry-oracle/): pick a **textile**, a **colour** and a **stain**, and it tells you how to get the stain out without ruining the fabric.
- **Washing Oracle** (https://tospace13-hub.github.io/laundry-oracle/washing/): say what matters to you and what is in the drum, and it shows which **programme, temperature, spin, extras and detergent** to use on a Miele washing machine, button by button.

- **When to Wash** (https://tospace13-hub.github.io/laundry-oracle/when/): reads the weather for your location and plans your loads around your week. It looks for sun on your solar panels, dry hours to hang laundry outside, off-peak hours and quiet hours, and finishes when someone is home.

The pages link to each other. Fabric and colour carry over between the Stain and Washing Oracles, and When to Wash plans with the programme you chose in the Washing Oracle.

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

## When to Wash

### Inputs

Every control is round or polygonal.

- **Where:** a vector map of the Netherlands. Drag the round pin, tap the map, pick the closest of 50 Dutch cities, or use your location (website only). The default is Arnhem.
- **When someone is home:** two 24-hour clock rings, one for weekdays and one for the weekend. Tap or drag to mark the hours.
  - "Done when I get home" makes a wash that runs while you're out finish within an hour before you arrive.
- **Household:** a ring of people (1–10) and a round stepper for loads a week or a day. A week's loads are suggested from household size; "2 a day" handles big families.
- **Energy and neighbours:**
  - solar panels: count, plus a compass dial for which way they face
  - double meter (dal: 23:00–07:00 and weekends)
  - quiet hours (22:00–07:00)
- **Drying:** line outside, rack inside, and a heat pump or condenser dryer.

### How it works

[`when/when.js`](when/when.js) tries every half-hour start in the coming week. It keeps only the starts where:
- someone is home and up (06:30–22:30) to load the machine. Delay start reaches up to 24 h ahead, so you can load before you leave.
- someone is home to unload within 2 hours of the end
- the machine stays out of quiet hours
- with "done when I get home", the wash finishes just before you arrive

It then scores what's left on:
- **Solar:** the share of the wash's electricity your panels cover. About 70% of it goes into heating water at the start.
- **Line drying:** whether the load dries outside before dark and before rain.
- **Off-peak:** the share of the wash in dal hours.
- **Convenience:** finishing while someone is home, and not overnight.

Loads are spread over the week: the best slot on each day first.

**Weather** comes from the [Open-Meteo](https://open-meteo.com/) forecast API, called directly from the browser. It's free for non-commercial use under CC BY 4.0, needs no key and is cached for an hour. The page uses:
- **tilted solar irradiance** for your panels
- **FAO-56 reference evaporation (ET0)** as drying speed. ET0 already combines sun, temperature, humidity and wind. A load counts as dry after about 1 mm.
- **rain probability**, plus sunrise and sunset

If the weather service doesn't answer, the plan still fits your week, tariff and quiet hours. It says so and offers a retry.

Only the coordinates, rounded to 2 decimals, leave the browser. Everything else stays in `localStorage`.

**Map:** Natural Earth outlines (public domain): 1:10m countries from `world-atlas`, and 1:50m lakes and rivers from `sane-topojson`. They're converted once by [`tools/build-nl-map.mjs`](tools/build-nl-map.mjs) into `when/nl-map.js`. That script documents the steps.

When to Wash runs on the website only: Claude Artifacts can't fetch live weather.

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
