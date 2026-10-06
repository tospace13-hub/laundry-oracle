/*
 * Laundry Oracle: knowledge base and rule engine.
 *
 * No DOM in here, so the same file runs in the browser (window.LaundryOracle)
 * and in Node (module.exports) for the tests.
 *
 * Advice is assembled from three tables instead of being written per combination:
 *   TEXTILES  what each fibre tolerates (temperature, bleach, solvents, enzymes, heat)
 *   COLOURS   what each colour tolerates (bleach, sun, temperature cap)
 *   STAINS    what each stain needs, as ordered steps that declare the methods they use
 * consult() keeps a step when the fibre and colour allow every method it needs,
 * swaps in its fallback when they don't, and fills in temperatures and handling.
 */
(function (root) {
  'use strict';

  // Permission levels: false = forbidden, 'test' = allowed after a hidden-seam test, true = fine.
  const TEST = 'test';

  // ISO 3758 iron settings: dots on the care label and the sole-plate maximum.
  const IRON = {
    0: { label: 'Do not iron', dots: 0 },
    1: { label: 'low (1 dot, max 110 °C)', dots: 1, max: 110 },
    2: { label: 'medium (2 dots, max 150 °C)', dots: 2, max: 150 },
    3: { label: 'hot (3 dots, max 200 °C)', dots: 3, max: 200 },
  };

  const TEXTILES = [
    {
      id: 'cotton', name: 'Cotton', phrase: 'cotton', family: 'plant',
      maxTemp: 60, gentle: 0, hand: false, tumble: 2, iron: 3, risk: 0,
      enzymes: true, alkali: true, oxygenBleach: true, chlorine: true, acetone: true, alcohol: true, sun: true,
      rub: 'firm', oily: false,
      handling: 'Cotton is strong when wet, so you can work the stain between your thumbs.',
    },
    {
      id: 'linen', name: 'Linen', phrase: 'linen', family: 'plant',
      maxTemp: 60, gentle: 0, hand: false, tumble: 1, iron: 3, risk: 0,
      enzymes: true, alkali: true, oxygenBleach: true, chlorine: true, acetone: true, alcohol: true, sun: true,
      rub: 'gentle', oily: false,
      handling: 'Linen fibres crack along sharp folds. Work the stain flat and never wring it.',
    },
    {
      id: 'denim', name: 'Denim', phrase: 'denim', family: 'plant',
      maxTemp: 40, gentle: 0, hand: false, tumble: 1, iron: 3, risk: 0,
      enzymes: true, alkali: true, oxygenBleach: true, chlorine: false, acetone: true, alcohol: true, sun: false,
      rub: 'gentle', oily: false,
      handling: 'Indigo rubs off. Blot rather than scrub, or you will leave a pale patch.',
    },
    {
      id: 'viscose', name: 'Viscose / modal / lyocell', phrase: 'viscose', family: 'regenerated',
      maxTemp: 30, gentle: 1, hand: false, tumble: 0, iron: 2, risk: 1,
      enzymes: true, alkali: true, oxygenBleach: true, chlorine: false, acetone: true, alcohol: true, sun: false,
      rub: 'dab', oily: false,
      handling: 'Viscose loses up to half its strength when wet. Dab, never scrub or wring.',
    },
    {
      id: 'acetate', name: 'Acetate (linings)', phrase: 'acetate', family: 'regenerated',
      maxTemp: 30, gentle: 2, hand: true, tumble: 0, iron: 1, risk: 2,
      enzymes: true, alkali: true, oxygenBleach: true, chlorine: false, acetone: false, alcohol: TEST, sun: false,
      rub: 'dab', oily: false,
      handling: 'Acetate, the shiny lining in jackets and dresses, puckers with heat and dissolves in acetone. Cool water, dab only.',
    },
    {
      id: 'polyester', name: 'Polyester', phrase: 'polyester', family: 'synthetic',
      maxTemp: 40, gentle: 1, hand: false, tumble: 1, iron: 2, risk: 0,
      enzymes: true, alkali: true, oxygenBleach: true, chlorine: false, acetone: true, alcohol: true, sun: false,
      rub: 'firm', oily: true,
      handling: 'Polyester attracts oil and holds on to it, which is why greasy marks come back after a wash. Degrease before you wash.',
    },
    {
      id: 'nylon', name: 'Nylon / polyamide', phrase: 'nylon', family: 'synthetic',
      maxTemp: 40, gentle: 1, hand: false, tumble: 1, iron: 1, risk: 0,
      enzymes: true, alkali: true, oxygenBleach: true, chlorine: false, acetone: true, alcohol: true, sun: false,
      rub: 'gentle', oily: true,
      handling: 'Nylon yellows with heat, sunlight and chlorine. Keep it cool.',
    },
    {
      id: 'acrylic', name: 'Acrylic', phrase: 'acrylic', family: 'synthetic',
      maxTemp: 30, gentle: 1, hand: false, tumble: 1, iron: 1, risk: 1,
      enzymes: true, alkali: true, oxygenBleach: true, chlorine: false, acetone: false, alcohol: true, sun: false,
      rub: 'gentle', oily: true,
      handling: 'Acrylic knits stretch out of shape when warm and wet. Keep the heat low and dry flat.',
    },
    {
      id: 'sportswear', name: 'Sportswear (with elastane)', phrase: 'sportswear', family: 'synthetic',
      maxTemp: 30, gentle: 1, hand: false, tumble: 0, iron: 0, risk: 0,
      enzymes: true, alkali: true, oxygenBleach: true, chlorine: false, acetone: false, alcohol: true, sun: false,
      rub: 'gentle', oily: true,
      handling: 'Elastane breaks down with heat. Wash cool, skip fabric softener (it clogs the wicking fibres) and air-dry.',
    },
    {
      id: 'wool', name: 'Wool', phrase: 'wool', family: 'animal',
      maxTemp: 30, gentle: 2, hand: true, tumble: 0, iron: 2, risk: 1,
      enzymes: false, alkali: false, oxygenBleach: false, chlorine: false, acetone: TEST, alcohol: TEST, sun: false,
      rub: 'dab', oily: false,
      handling: 'Wool felts with heat, friction and sudden temperature changes. Keep the water the same temperature throughout, never rub or wring, and roll it in a towel to dry flat.',
    },
    {
      id: 'cashmere', name: 'Cashmere / alpaca', phrase: 'cashmere', family: 'animal',
      maxTemp: 30, gentle: 2, hand: true, tumble: 0, iron: 1, risk: 2,
      enzymes: false, alkali: false, oxygenBleach: false, chlorine: false, acetone: TEST, alcohol: TEST, sun: false,
      rub: 'dab', oily: false,
      handling: 'Cashmere is even more fragile than wool. Support its weight when wet, press the water out and dry it flat away from heat.',
    },
    {
      id: 'silk', name: 'Silk', phrase: 'silk', family: 'animal',
      maxTemp: 30, gentle: 2, hand: true, tumble: 0, iron: 1, risk: 2,
      enzymes: false, alkali: false, oxygenBleach: false, chlorine: false, acetone: TEST, alcohol: TEST, sun: false,
      rub: 'dab', oily: false,
      handling: 'Silk water-spots and loses its sheen when rubbed. Dab only, dampen the whole panel evenly so no ring forms, and never wring.',
    },
    {
      id: 'unknown', name: 'Not sure / mixed', phrase: 'mystery fabric', family: 'unknown',
      maxTemp: 30, gentle: 2, hand: true, tumble: 0, iron: 1, risk: 1,
      enzymes: false, alkali: false, oxygenBleach: false, chlorine: false, acetone: false, alcohol: TEST, sun: false,
      rub: 'dab', oily: false,
      handling: 'When the fibre is unknown, the oracle treats it as the most delicate one: cool water, no bleach, nothing strong without a test.',
    },
  ];

  const FAMILY_LABEL = {
    plant: 'Plant fibre',
    regenerated: 'Regenerated',
    synthetic: 'Synthetic',
    animal: 'Animal fibre',
    unknown: 'Cautious mode',
  };

  const COLOURS = [
    {
      id: 'white', name: 'White', phrase: 'white', swatch: '#FFFFFF',
      cap: 90, oxygenBleach: true, chlorine: true, alcohol: true, hotPour: true, sun: true,
      load: 'with whites only',
    },
    {
      id: 'light', name: 'Light / pastel', phrase: 'pastel', swatch: '#F6D3E2',
      cap: 60, oxygenBleach: TEST, chlorine: false, alcohol: true, hotPour: false, sun: false,
      load: 'with light colours',
    },
    {
      id: 'bright', name: 'Bright', phrase: 'bright', swatch: '#F15A24',
      cap: 40, oxygenBleach: TEST, chlorine: false, alcohol: TEST, hotPour: false, sun: false,
      load: 'inside out, with similar colours',
    },
    {
      id: 'dark', name: 'Dark (black, navy)', phrase: 'dark', swatch: '#1F2340',
      cap: 30, oxygenBleach: false, chlorine: false, alcohol: TEST, hotPour: false, sun: false,
      load: 'inside out, with other darks',
    },
    {
      id: 'print', name: 'Print / multicolour', phrase: 'printed', swatch: 'print',
      cap: 30, oxygenBleach: TEST, chlorine: false, alcohol: TEST, hotPour: false, sun: false,
      load: 'inside out, with a colour-catcher sheet the first time',
    },
  ];

  const STAIN_FAMILIES = [
    { id: 'protein', name: 'Protein', note: 'Cold water only: heat cooks protein into the fibre.' },
    { id: 'tannin', name: 'Tannin', note: 'Plant colour. Soap sets it, detergent lifts it.' },
    { id: 'oil', name: 'Oil & grease', note: 'Water alone spreads it. Degrease first.' },
    { id: 'dye', name: 'Dye & pigment', note: 'Lift the colour with a solvent before washing.' },
    { id: 'combo', name: 'Combination', note: 'Several stain types at once. Treat them in order.' },
    { id: 'wax', name: 'Wax & gum', note: 'Harden it, scrape it, then deal with the residue.' },
    { id: 'other', name: 'Other', note: 'Chemistry of its own.' },
  ];

  // Reusable steps. Tokens in {braces} are filled in per textile and colour.
  const S = {
    flushCold: { text: 'Hold the stain face-down under a cold tap so the water pushes it back out the way it came in.', kit: ['Cold water'] },
    dishSoap: { text: 'Put a drop of washing-up liquid on the stain and {apply}. It is made to break up grease.', kit: ['Washing-up liquid'] },
    detergentWork: {
      text: 'Put a little {detergent} on the stain and {apply}. Leave it 15 minutes.', needs: ['enzymes'], kit: ['{detergentName}'],
      fallback: { text: 'Dab on cold water with a few drops of wool & silk detergent and leave it 10 minutes.', kit: ['Wool & silk detergent'] },
    },
    oxygenSoak: {
      text: 'For any shadow that is left, soak 1 hour in water at {soak} with oxygen bleach (sodium percarbonate), dosed as the pack says.',
      needs: ['oxygenBleach'], kit: ['Oxygen bleach'],
    },
    vinegarDab: { text: 'Dab with 1 part white vinegar to 2 parts cool water, leave 10 minutes, then rinse.', kit: ['White vinegar'] },
  };

  const STAINS = [
    // ---- Protein ----
    {
      id: 'blood', name: 'Blood', phrase: 'blood', family: 'protein', difficulty: 1, washCap: 30,
      firstAid: ['Rinse from the back with cold water as soon as you can.', 'Keep it away from warm water until it is gone.'],
      steps: [
        S.flushCold,
        {
          text: 'Soak 30 minutes in cold water with a spoonful of {detergent}. The enzymes digest the blood proteins.',
          needs: ['enzymes'], kit: ['{detergentName}'],
          fallback: { text: 'Dab on a paste of cold water and table salt, leave 10 minutes and rinse cold.', kit: ['Table salt'] },
        },
        {
          text: 'If a shadow remains, dab on 3% hydrogen peroxide. It fizzes as it lifts the blood. Rinse cold after 5 minutes.',
          needs: ['oxygenBleach'], kit: ['3% hydrogen peroxide'],
        },
      ],
      never: ['Hot water or a hot wash before the stain is out: it sets blood permanently.'],
      dried: 'Dried blood needs time: soak it overnight in cold water (with enzyme detergent if your fibre allows it), then start at step 2.',
    },
    {
      id: 'sweat', name: 'Sweat & deodorant', phrase: 'sweat stains', family: 'protein', difficulty: 2, washCap: 40,
      firstAid: ['Turn the garment inside out: underarm stains build up on the inside.', 'Keep it out of the dryer until it is gone.'],
      steps: [
        {
          text: 'Mix 2 tablespoons of baking soda with a little cool water, spread the paste on the yellowed area and leave it 30 minutes.',
          needs: ['alkali'], kit: ['Baking soda'],
          fallback: { text: 'Dab on 1 part white vinegar to 4 parts cool water and leave it 15 minutes. The acid breaks down deodorant salts.', kit: ['White vinegar'] },
        },
        S.detergentWork,
        {
          text: 'For yellowed underarms, soak 1 to 6 hours in water at {soak} with oxygen bleach, dosed as the pack says.',
          needs: ['oxygenBleach'], kit: ['Oxygen bleach'],
        },
      ],
      never: ['Chlorine bleach: it reacts with the proteins in sweat and turns the yellow darker.'],
      dried: 'Old deodorant build-up can take two or three rounds. Repeat the soak before each wash rather than scrubbing harder.',
    },
    {
      id: 'egg', name: 'Egg & dairy', phrase: 'egg or dairy', family: 'protein', difficulty: 1, washCap: 40,
      firstAid: ['Scrape off the excess with a spoon or a blunt knife.', 'Rinse from the back with cold water.'],
      steps: [
        S.flushCold,
        S.detergentWork,
        { text: 'For the fatty part (butter, yolk, cream), put a drop of washing-up liquid on the stain and {apply}, then rinse cold.', kit: ['Washing-up liquid'] },
      ],
      never: ['Warm water before the stain is out: egg cooks onto the fibre.'],
      dried: 'Dried egg or milk goes stiff. Soften it with a cold soak for an hour before you start.',
    },

    // ---- Tannin ----
    {
      id: 'coffee', name: 'Coffee', phrase: 'coffee', family: 'tannin', difficulty: 1,
      firstAid: ['Blot with a dry towel. Press, don’t rub.', 'Rinse from the back with cool water.'],
      steps: [
        S.flushCold,
        { text: 'Put a drop of liquid detergent on the stain and {apply}. Leave it 10 minutes.', kit: ['Liquid detergent'] },
        { ...S.oxygenSoak, fallback: S.vinegarDab },
      ],
      never: ['Bar soap or soap flakes: real soap sets tannin stains.'],
      dried: 'Rehydrate an old coffee stain with a few drops of glycerin for 30 minutes, then start at step 1.',
    },
    {
      id: 'tea', name: 'Tea', phrase: 'tea', family: 'tannin', difficulty: 1,
      firstAid: ['Blot with a dry towel.', 'Rinse from the back with cool water.'],
      steps: [
        S.flushCold,
        { text: 'Soak 15 minutes in cool water with a spoonful of liquid detergent.', kit: ['Liquid detergent'] },
        { ...S.oxygenSoak, fallback: S.vinegarDab },
        {
          text: 'On white cotton or linen, a squeeze of lemon juice and an hour in the sun fades the last brown trace.',
          needs: ['sun'], kit: ['Lemon'],
        },
      ],
      never: ['Bar soap: it fixes the tannin into the fibre.'],
      dried: 'Old tea stains respond to glycerin: work a few drops in, wait 30 minutes, then start at step 1.',
    },
    {
      id: 'wine', name: 'Red wine', phrase: 'red wine', family: 'tannin', difficulty: 2,
      firstAid: ['Blot straight away with a dry towel. Press, don’t rub.', 'Flush from the back with cold water.'],
      steps: [
        { text: 'Stretch the stained area over a bowl and pour cold water through it from the back.', kit: ['A bowl'] },
        {
          text: 'Now pour just-boiled water through the stain from about 30 cm high. The heat and force push the pigment out. White cotton and linen only.',
          needs: ['hotPour'], kit: ['Kettle'],
          fallback: { text: 'Put a drop of washing-up liquid on the stain and {apply}, then rinse cold.', kit: ['Washing-up liquid'] },
        },
        {
          text: 'Dab on a mix of 3% hydrogen peroxide and washing-up liquid (1:1), leave 20 minutes and rinse.',
          needs: ['oxygenBleach'], kit: ['3% hydrogen peroxide'],
          fallback: S.vinegarDab,
        },
        {
          text: 'Still pink on white cotton or linen? Soak 30 minutes in 1 tablespoon of chlorine bleach per litre of cold water as a last resort, then rinse well.',
          needs: ['chlorine'], kit: ['Chlorine bleach'],
        },
      ],
      never: ['Rubbing: it drives the dye deeper and widens the ring.', 'White wine or soda tricks: they dilute the stain but do not remove it.'],
      dried: 'An old wine stain needs rehydrating first: a few drops of glycerin for 30 minutes, then start at step 1.',
    },
    {
      id: 'berries', name: 'Berries & fruit juice', phrase: 'berry juice', family: 'tannin', difficulty: 2,
      firstAid: ['Scrape off any fruit pulp.', 'Flush from the back with cold water.'],
      steps: [
        { text: 'Stretch the stained area over a bowl and pour cold water through it from the back.', kit: ['A bowl'] },
        {
          text: 'Now pour just-boiled water through the stain from about 30 cm high. Fruit colour lets go with heat and force. White cotton and linen only.',
          needs: ['hotPour'], kit: ['Kettle'],
          fallback: { text: 'Put a drop of liquid detergent on the stain and {apply}. Leave it 10 minutes.', kit: ['Liquid detergent'] },
        },
        { ...S.oxygenSoak, fallback: S.vinegarDab },
        {
          text: 'On white cotton or linen, lemon juice and an hour of sunshine bleach out the last purple tint.',
          needs: ['sun'], kit: ['Lemon'],
        },
      ],
      never: ['Soap: it sets fruit stains.', 'Ironing over a faint mark: it caramelises the sugar into a brown stain.'],
      dried: 'Old fruit stains can turn brown. Soak in cool water with liquid detergent overnight before step 2.',
    },

    // ---- Oil & grease ----
    {
      id: 'oil', name: 'Cooking oil & butter', phrase: 'cooking oil', family: 'oil', difficulty: 2,
      firstAid: ['Blot off what you can with kitchen paper.', 'Cover it with cornstarch or talc to draw the oil out.'],
      steps: [
        { text: 'Cover the stain with cornstarch or talc, leave it 15 to 30 minutes, then brush it off.', kit: ['Cornstarch or talc'] },
        S.dishSoap,
        { text: 'Leave it 15 minutes, then rinse with water as warm as the fabric allows ({wash}).' },
      ],
      never: ['Water on its own: oil and water don’t mix, so you only spread the ring.'],
      dried: 'Old oil oxidises and turns yellow. Repeat the washing-up liquid step two or three times before washing.',
    },
    {
      id: 'grease', name: 'Bike & engine grease', phrase: 'bike grease', family: 'oil', difficulty: 3,
      firstAid: ['Scrape off thick grease with a blunt knife.', 'Keep it dry: water makes grease spread.'],
      steps: [
        { text: 'Put a dab of heavy-duty washing-up liquid or citrus hand degreaser on the dry stain and {apply}. Leave it 15 minutes.', kit: ['Washing-up liquid or citrus degreaser'] },
        { text: 'Rinse with water as warm as the fabric allows ({wash}).' },
        {
          text: 'For a grey shadow, put kitchen paper underneath and dab with isopropyl alcohol on a cotton pad.',
          needs: ['alcohol'], kit: ['Isopropyl alcohol', 'Cotton pads', 'Kitchen paper'],
        },
      ],
      never: ['Petrol, white spirit or other fuels: fire risk, and they leave an oily ring of their own.'],
      dried: 'Set-in grease may need the degreaser step three or four times. Let each round sit before rinsing.',
    },
    {
      id: 'makeup', name: 'Makeup & lipstick', phrase: 'makeup', family: 'oil', difficulty: 2,
      firstAid: ['Lift off the excess with a tissue. Don’t smear it.'],
      steps: [
        { text: 'Dab with micellar water or an oil-free makeup remover on a cotton pad. Foundation is made to come off with it.', kit: ['Micellar water', 'Cotton pads'] },
        {
          text: 'For lipstick colour, dab with isopropyl alcohol and switch to a clean pad as the colour transfers.',
          needs: ['alcohol'], kit: ['Isopropyl alcohol'],
        },
        S.dishSoap,
      ],
      never: ['Scrubbing with a wet cloth: it spreads the pigment into a bigger smear.'],
      dried: 'Dried foundation lifts better after 10 minutes under a damp layer of micellar water.',
    },

    // ---- Dye & pigment ----
    {
      id: 'ink', name: 'Ballpoint ink', phrase: 'ballpoint ink', family: 'dye', difficulty: 2,
      firstAid: ['Put kitchen paper under the stain.', 'Don’t wet it: water spreads ink.'],
      steps: [
        {
          text: 'Lay the stain face-down on kitchen paper and dab the back with isopropyl alcohol or hand-sanitiser gel. Move to a clean part of the paper as the ink transfers.',
          needs: ['alcohol'], kit: ['Isopropyl alcohol', 'Kitchen paper'],
          fallback: { text: 'Dab on a few drops of glycerin and leave 30 minutes to loosen the ink, then blot with kitchen paper.', kit: ['Glycerin', 'Kitchen paper'] },
        },
        S.dishSoap,
        { text: 'Rinse with cool water.' },
      ],
      never: ['Hairspray: modern ones contain little alcohol and leave a sticky film.'],
      dried: 'Ink that has been washed in is often permanent. The alcohol step can still lighten it.',
    },
    {
      id: 'curry', name: 'Curry & turmeric', phrase: 'curry', family: 'dye', difficulty: 3,
      firstAid: ['Scrape off the sauce.', 'Rinse from the back with cold water.'],
      steps: [
        { text: 'Put a drop of washing-up liquid on the stain and {apply}. The oil in curry carries the turmeric, so degrease first.', kit: ['Washing-up liquid'] },
        {
          text: 'Dab the yellow with isopropyl alcohol on a cotton pad.',
          needs: ['alcohol'], kit: ['Isopropyl alcohol'],
        },
        S.oxygenSoak,
        {
          text: 'Dry it in direct sunlight. Curcumin, the yellow in turmeric, breaks down in UV light, and the last trace often simply fades.',
          needs: ['sun'],
        },
      ],
      never: ['Baking soda or other alkaline cleaners: turmeric is a natural pH indicator and turns bright red.'],
      dried: 'Washed-in turmeric often fades over several sunny days on the line. Repeat the alcohol step in between.',
    },
    {
      id: 'grass', name: 'Grass', phrase: 'grass', family: 'dye', difficulty: 2,
      firstAid: ['Don’t rub: grass stains smear.'],
      steps: [
        {
          text: 'Put {detergent} on the stain and {apply}. Leave it 30 minutes. Enzymes break down the plant proteins.',
          needs: ['enzymes'], kit: ['{detergentName}'],
          fallback: { text: 'Dab on cool water with a few drops of wool & silk detergent and leave it 15 minutes.', kit: ['Wool & silk detergent'] },
        },
        {
          text: 'Dab the green with isopropyl alcohol to dissolve the chlorophyll, then rinse.',
          needs: ['alcohol'], kit: ['Isopropyl alcohol'],
        },
        S.oxygenSoak,
      ],
      never: ['Hot water before treating: it sets the green.'],
      dried: 'Old grass stains need a longer first step: leave the detergent on for a few hours.',
    },

    // ---- Combination ----
    {
      id: 'chocolate', name: 'Chocolate', phrase: 'chocolate', family: 'combo', difficulty: 2, washCap: 40,
      firstAid: ['Let it harden (or chill it), then scrape it off.', 'Rinse from the back with cold water.'],
      steps: [
        S.flushCold,
        { text: 'Put a drop of washing-up liquid on the stain and {apply} to lift the cocoa butter.', kit: ['Washing-up liquid'] },
        S.detergentWork,
        S.oxygenSoak,
      ],
      never: ['Hot water first: it melts the fat deeper and sets the milk.'],
      dried: 'Dried chocolate: scrape, then soften with a cold soak for 30 minutes before step 1.',
    },
    {
      id: 'tomato', name: 'Tomato sauce', phrase: 'tomato sauce', family: 'combo', difficulty: 2,
      firstAid: ['Scrape, don’t wipe.', 'Rinse from the back with cold water.'],
      steps: [
        S.flushCold,
        S.dishSoap,
        S.vinegarDab,
        S.oxygenSoak,
        {
          text: 'Dry it in the sun. Lycopene, the red in tomato, fades in UV light.',
          needs: ['sun'],
        },
      ],
      never: ['Hot water: it sets the tomato pigment orange.'],
      dried: 'An old tomato stain usually needs the washing-up liquid and vinegar steps twice.',
    },
    {
      id: 'mud', name: 'Mud', phrase: 'mud', family: 'combo', difficulty: 1,
      firstAid: ['Let it dry completely.', 'Don’t wipe wet mud: it pushes the clay into the weave.'],
      steps: [
        { text: 'Once it is bone dry, brush off as much as you can with a {brush}.', kit: ['Clothes brush'] },
        { text: 'Put a drop of liquid detergent on the stain and {apply}. Leave it 15 minutes.', kit: ['Liquid detergent'] },
        { text: 'Rinse from the back with cool water.' },
      ],
      never: ['Rubbing wet mud: it grinds the clay particles into the fibres.'],
      dried: 'Mud is easiest dry, so an old stain is good news. Brush well before you wet it.',
    },

    // ---- Wax & gum ----
    {
      id: 'wax', name: 'Candle wax', phrase: 'candle wax', family: 'wax', difficulty: 2,
      firstAid: ['Let it harden. Don’t pull at warm wax.', 'Scrape it off with a blunt knife.'],
      steps: [
        { text: 'Harden the wax with an ice cube in a bag (or 30 minutes in the freezer), then crack and scrape it off with a blunt knife.', kit: ['Ice cubes', 'Blunt knife'] },
        {
          text: 'Sandwich the spot between sheets of kitchen paper and press with an iron on {ironSetting}, no steam. Move to clean paper as the wax melts into it.',
          needs: ['iron'], kit: ['Iron', 'Kitchen paper'], id: 'iron',
          fallback: {
            text: 'Dab the remaining wax film with isopropyl alcohol on a cotton pad.',
            needs: ['alcohol'], kit: ['Isopropyl alcohol'],
          },
        },
        S.dishSoap,
        {
          text: 'Coloured wax leaves dye behind. Dab it with isopropyl alcohol.',
          needs: ['alcohol'], kit: ['Isopropyl alcohol'],
        },
      ],
      never: ['A hot iron straight on the wax: it melts it deeper and can scorch the fabric.'],
      dried: 'Wax doesn’t really age. If it went through a wash, the oily shadow responds to the washing-up liquid step.',
    },
    {
      id: 'gum', name: 'Chewing gum', phrase: 'chewing gum', family: 'wax', difficulty: 2,
      firstAid: ['Don’t pull at soft gum.', 'Freeze it: an ice cube in a bag, or the whole garment in the freezer for an hour.'],
      steps: [
        { text: 'Freeze the gum with an ice cube in a plastic bag (or put the garment in the freezer for an hour) and pick it off while it is brittle.', kit: ['Ice cubes', 'Plastic bag'] },
        {
          text: 'Dab what is left with isopropyl alcohol to soften it, then lift it off with a blunt knife.',
          needs: ['alcohol'], kit: ['Isopropyl alcohol', 'Blunt knife'],
          fallback: { text: 'Freeze it again and gently pick off the residue with a fingernail.' },
        },
        S.dishSoap,
      ],
      never: ['Scraping soft gum: it spreads into the fibres.'],
      dried: 'Gum that went through the dryer melts into the fabric. Freeze and pick, then repeat; it can take a few rounds.',
    },

    // ---- Other ----
    {
      id: 'polish', name: 'Nail polish', phrase: 'nail polish', family: 'other', difficulty: 3,
      proFor: ['acetate'],
      firstAid: ['Blot wet polish with kitchen paper. Don’t wipe it.', 'Check the fibre first: acetone dissolves acetate and some acrylics.'],
      steps: [
        {
          text: 'Lay the stain face-down on kitchen paper and dab the back with acetone nail-polish remover on a cotton pad. Change paper and pads often.',
          needs: ['acetone'], kit: ['Acetone nail-polish remover', 'Cotton pads', 'Kitchen paper'],
          fallback: { text: 'Use an acetone-free nail-polish remover on a cotton pad, with kitchen paper underneath, and dab from the back.', caution: true, kit: ['Acetone-free remover', 'Cotton pads', 'Kitchen paper'] },
        },
        {
          text: 'Dab the remaining colour with isopropyl alcohol.',
          needs: ['alcohol'], kit: ['Isopropyl alcohol'],
        },
        S.dishSoap,
      ],
      never: ['Acetone on acetate, triacetate or modacrylic: it dissolves the fabric and leaves a hole.'],
      dried: 'Dried polish is a hard film. Soften it with remover for a few minutes before dabbing, and expect several rounds.',
    },
    {
      id: 'rust', name: 'Rust', phrase: 'rust', family: 'other', difficulty: 3,
      proFor: ['silk', 'wool', 'cashmere', 'acetate'],
      firstAid: ['Find the source (a zip, a hanger, a washer) so it doesn’t happen again.', 'Keep it away from chlorine bleach.'],
      steps: [
        {
          text: 'Squeeze lemon juice on the spot, sprinkle it with salt and leave it in the sun for an hour or two. Rinse.',
          needs: ['sun'], kit: ['Lemon', 'Table salt'],
          fallback: { text: 'Use a rust remover based on oxalic acid, following the label.', caution: true, kit: ['Rust remover (oxalic acid)'] },
        },
        { text: 'Rinse thoroughly with cool water.' },
      ],
      never: ['Chlorine bleach: it reacts with iron and makes rust stains permanent.'],
      dried: 'Rust doesn’t set with age, but every wash spreads it a little. Treat it before the next wash.',
    },
    {
      id: 'mildew', name: 'Mildew', phrase: 'mildew', family: 'other', difficulty: 3,
      firstAid: ['Take it outside and brush off the spores. Wear a mask if you are sensitive.', 'Don’t leave it damp or bundled up.'],
      steps: [
        { text: 'Brush off loose mildew outdoors with a {brush}.', kit: ['Clothes brush'] },
        { text: 'Soak 1 hour in 1 part white vinegar to 4 parts cool water.', kit: ['White vinegar'] },
        S.oxygenSoak,
        {
          text: 'Dry it in sunlight. UV kills the remaining spores.',
          needs: ['sun'],
          fallback: { text: 'Dry it completely in a well-ventilated place before you put it away.' },
        },
      ],
      never: ['Putting it away damp: mildew grows back and rots the fibres.'],
      dried: 'Old mildew leaves dark spots that may be permanent, but the vinegar soak stops it spreading and kills the smell.',
    },
  ];

  const DIFFICULTY = {
    1: { label: 'Easy rescue', omen: 'Fear not. This one comes out.' },
    2: { label: 'Takes patience', omen: 'It will come out if you go step by step.' },
    3: { label: 'Stubborn', omen: 'A stubborn spirit. Follow every step.' },
    4: { label: 'Take it to a pro', omen: 'Beyond home remedies. Seek a dry cleaner.' },
  };

  const byId = (list) => Object.fromEntries(list.map((x) => [x.id, x]));
  const T = byId(TEXTILES);
  const C = byId(COLOURS);
  const ST = byId(STAINS);

  // Lowest of two permission levels.
  function lower(a, b) {
    const rank = (v) => (v === true ? 2 : v === TEST ? 1 : 0);
    const r = Math.min(rank(a), rank(b));
    return r === 2 ? true : r === 1 ? TEST : false;
  }

  function permissions(t, c) {
    return {
      enzymes: t.enzymes,
      alkali: t.alkali,
      oxygenBleach: lower(t.oxygenBleach, c.oxygenBleach),
      chlorine: t.chlorine && c.chlorine,
      acetone: t.acetone,
      alcohol: lower(t.alcohol, c.alcohol),
      hotPour: t.maxTemp >= 60 && c.hotPour,
      sun: t.sun && c.sun,
      iron: t.iron > 0,
    };
  }

  // Combined permission for everything a step needs: false, 'test' or true.
  function allowed(step, perms) {
    return (step.needs || []).reduce((acc, need) => lower(acc, perms[need]), true);
  }

  const capFirst = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  const deg = (n) => `${n} °C`;

  function fill(text, ctx) {
    return text.replace(/\{(\w+)\}/g, (m, key) => (key in ctx ? ctx[key] : m));
  }

  function consult(textileId, colourId, stainId) {
    const t = T[textileId];
    const c = C[colourId];
    const s = ST[stainId];
    if (!t || !c || !s) throw new Error(`Unknown choice: ${textileId}/${colourId}/${stainId}`);

    const perms = permissions(t, c);
    const washTemp = Math.min(t.maxTemp, c.cap, s.washCap || 90);
    const soakTemp = Math.min(40, washTemp);
    const ctx = {
      wash: deg(washTemp),
      soak: deg(soakTemp),
      apply: {
        firm: 'work it in with your fingertips',
        gentle: 'massage it in gently with your fingertips',
        dab: 'dab it in with a clean white cloth, without rubbing',
      }[t.rub],
      brush: t.rub === 'dab' ? 'soft brush' : 'stiff brush',
      detergent: t.enzymes ? 'enzyme (bio) detergent' : 'wool & silk detergent',
      detergentName: t.enzymes ? 'Enzyme (bio) detergent' : 'Wool & silk detergent',
      ironSetting: IRON[t.iron].label,
    };

    const pro = (s.proFor || []).includes(t.id) || (t.risk >= 2 && s.difficulty >= 3);
    const difficulty = pro ? 4 : Math.min(3, s.difficulty + (t.risk >= 2 ? 1 : 0));

    // Resolve each step against the permissions: keep it, swap in its fallback, or drop it.
    const steps = [];
    const kit = [];
    const addKit = (items) => (items || []).forEach((k) => {
      const name = fill(k, ctx);
      if (!kit.includes(name)) kit.push(name);
    });

    if (pro) {
      steps.push(
        { text: 'Don’t try solvents, bleach or heat at home: on this fibre they are likely to do more harm than the stain.', caution: false },
        { text: `Take it to a dry cleaner within a few days. Point out the stain and tell them it is ${s.phrase} on ${t.phrase}.`, caution: false },
        { text: 'Until then, keep it flat, dry and away from heat.', caution: false },
      );
      addKit(['Kitchen paper, to blot', 'A dry cleaner you trust']);
    } else {
      for (const original of s.steps) {
        let step = original;
        let level = allowed(step, perms);
        if (level === false && step.fallback) {
          step = step.fallback;
          level = allowed(step, perms);
        }
        if (level === false) continue;
        steps.push({
          id: step.id || null,
          text: fill(step.text, ctx),
          caution: level === TEST || !!step.caution,
        });
        addKit(step.kit);
      }
      if (s.family === 'oil' && t.oily) {
        steps.push({ text: `${capFirst(t.phrase)} holds on to oil. Repeat the washing-up liquid step once more before washing.`, caution: false });
      }
      const cycle = t.hand
        ? `by hand at max ${ctx.wash}, or on the wool / hand-wash programme`
        : t.gentle === 2
          ? `at ${ctx.wash} on a delicates programme`
          : t.gentle === 1
            ? `at ${ctx.wash} on a synthetics / easy-care programme`
            : `at ${ctx.wash}`;
      steps.push({
        text: `Wash ${cycle}, ${c.load}. Check the spot before drying: heat from a dryer or iron sets whatever is left.`,
        caution: false,
      });
      addKit([t.hand || !t.enzymes ? 'Wool & silk detergent' : 'Liquid detergent']);
    }

    // Never list: the stain's own warnings, then fibre and colour warnings.
    const never = [...s.never];
    if (t.family === 'animal') never.push('Chlorine bleach on wool, silk or cashmere: it dissolves animal fibres.');
    else if (t.id === 'sportswear') never.push('Chlorine bleach or fabric softener: they destroy elastane and wicking.');
    if (c.id === 'dark') never.push('Any bleach on dark colours: it strips the dye and leaves a pale patch.');
    if (t.tumble === 0) {
      const harm = t.id === 'silk' ? 'weakens and loses its sheen' : t.family === 'animal' ? 'felts and shrinks' : 'shrinks or loses its shape';
      never.push(`The tumble dryer: ${t.phrase} ${harm}.`);
    }
    never.push('Drying or ironing before the stain is completely gone: heat sets it for good.');

    // Care-label summary (ISO 3758 symbols are drawn from this in the UI).
    const bleach = perms.chlorine ? 'any' : perms.oxygenBleach ? 'oxygen' : 'none';
    const care = {
      wash: { temp: washTemp, hand: t.hand, gentle: t.gentle },
      bleach,
      tumble: t.tumble,
      iron: t.iron,
      professional: pro,
      lines: [
        t.hand ? `Hand wash, max ${ctx.wash}` : `Machine wash, max ${ctx.wash}`,
        { any: 'Any bleach allowed (chlorine only as a last resort)', oxygen: perms.oxygenBleach === TEST ? 'Oxygen bleach only, after a colourfastness test' : 'Oxygen bleach only', none: 'No bleach' }[bleach],
        t.tumble === 0
          ? (t.family === 'animal' || t.id === 'unknown' ? 'No tumble dryer. Dry flat on a towel' : 'No tumble dryer. Line dry')
          : t.tumble === 1 ? 'Tumble dry on low, or line dry' : 'Tumble dry on normal heat',
        perms.sun ? 'Dry outside: sunlight helps keep whites white' : 'Dry in the shade: sunlight fades colours and weakens fibres',
        t.iron === 0 ? 'Do not iron' : `Iron on ${IRON[t.iron].label}${t.family === 'animal' ? ', with a damp cloth between' : ''}`,
      ],
    };

    return {
      textile: t,
      colour: c,
      stain: s,
      family: STAIN_FAMILIES.find((f) => f.id === s.family),
      prophecy: `The oracle sees ${s.phrase} on ${c.phrase} ${t.phrase}…`,
      difficulty,
      difficultyLabel: DIFFICULTY[difficulty].label,
      omen: DIFFICULTY[difficulty].omen,
      firstAid: s.firstAid.slice(),
      steps,
      never,
      kit,
      care,
      handling: t.handling,
      dried: s.dried,
      temps: { wash: washTemp, soak: soakTemp, cap: Math.min(t.maxTemp, c.cap) },
      permissions: perms,
    };
  }

  // Plain-text version for the copy button.
  function toText(r) {
    const lines = [
      `LAUNDRY ORACLE: ${r.stain.name} on ${r.colour.phrase} ${r.textile.phrase}`,
      `${r.difficultyLabel}. ${r.omen}`,
      '',
      'ACT NOW',
      ...r.firstAid.map((x) => `- ${x}`),
      '',
      'TREATMENT',
      ...r.steps.map((x, i) => `${i + 1}. ${x.caution ? '(Test on a hidden seam first.) ' : ''}${x.text}`),
      '',
      'NEVER',
      ...r.never.map((x) => `- ${x}`),
      '',
      'WASH & DRY',
      ...r.care.lines.map((x) => `- ${x}`),
      '',
      `YOU'LL NEED: ${r.kit.join(', ')}`,
      '',
      `Fibre tip: ${r.handling}`,
      'Your care label wins. Test on a hidden seam first.',
    ];
    return lines.join('\n');
  }

  const api = { TEXTILES, COLOURS, STAINS, STAIN_FAMILIES, FAMILY_LABEL, DIFFICULTY, IRON, TEST, consult, toText };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.LaundryOracle = api;
})(typeof window !== 'undefined' ? window : globalThis);
