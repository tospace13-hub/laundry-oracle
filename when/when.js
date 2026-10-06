/*
 * When to Wash: planner engine.
 *
 * No DOM in here, so it runs in the browser (window.WhenToWash) and in Node (module.exports).
 *
 * plan() looks at every half hour in the coming week and keeps the starts that fit the household:
 * quiet hours, someone home to load and unload, "done when I get home". It scores what is left on
 * solar power, line drying, off-peak hours and convenience, and picks the loads.
 *
 * Weather comes from the Open-Meteo forecast API (CC BY 4.0). Drying speed uses its FAO-56
 * reference evaporation (ET0), which already combines sun, temperature, humidity and wind.
 */
(function (root) {
  'use strict';

  // ---- Places ----
  const CITIES = [
    ['Alkmaar', 52.632, 4.749], ['Almere', 52.371, 5.222], ['Amersfoort', 52.156, 5.388], ['Amsterdam', 52.373, 4.893],
    ['Apeldoorn', 52.211, 5.969], ['Arnhem', 51.985, 5.899], ['Assen', 52.993, 6.564], ['Bergen op Zoom', 51.495, 4.292],
    ['Breda', 51.589, 4.776], ['Delft', 52.012, 4.357], ['Den Haag', 52.078, 4.288], ['Den Helder', 52.959, 4.760],
    ['Deventer', 52.255, 6.163], ['Doetinchem', 51.965, 6.289], ['Dordrecht', 51.813, 4.690], ['Ede', 52.040, 5.665],
    ['Eindhoven', 51.441, 5.470], ['Emmen', 52.786, 6.897], ['Enschede', 52.221, 6.894], ['Gouda', 52.012, 4.711],
    ['Groningen', 53.219, 6.567], ['Haarlem', 52.387, 4.646], ['Harderwijk', 52.342, 5.620], ['Heerlen', 50.888, 5.981],
    ['Helmond', 51.481, 5.661], ['Hilversum', 52.223, 5.176], ['Hoorn', 52.643, 5.060], ['Kampen', 52.555, 5.911],
    ['Leeuwarden', 53.201, 5.799], ['Leiden', 52.160, 4.497], ['Lelystad', 52.518, 5.471], ['Maastricht', 50.851, 5.691],
    ['Middelburg', 51.499, 3.611], ['Nijmegen', 51.842, 5.853], ['Oss', 51.765, 5.518], ['Roermond', 51.194, 5.987],
    ['Rotterdam', 51.922, 4.479], ["'s-Hertogenbosch", 51.697, 5.304], ['Sneek', 53.033, 5.659], ['Terneuzen', 51.335, 3.828],
    ['Tilburg', 51.560, 5.091], ['Utrecht', 52.091, 5.122], ['Venlo', 51.370, 6.172], ['Vlissingen', 51.443, 3.574],
    ['Wageningen', 51.965, 5.663], ['Winterswijk', 51.972, 6.720], ['Zaandam', 52.438, 4.826], ['Zoetermeer', 52.057, 4.493],
    ['Zutphen', 52.138, 6.201], ['Zwolle', 52.512, 6.094],
  ].map(([name, lat, lon]) => ({ name, lat, lon }));
  const HOME_CITY = CITIES.find((c) => c.name === 'Arnhem');

  function distanceKm(a, b) {
    const r = (d) => (d * Math.PI) / 180;
    const dLat = r(b.lat - a.lat);
    const dLon = r(b.lon - a.lon);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(dLon / 2) ** 2;
    return 2 * 6371 * Math.asin(Math.sqrt(h));
  }
  function nearestCity(lat, lon) {
    let best = CITIES[0];
    let km = Infinity;
    for (const c of CITIES) {
      const d = distanceKm({ lat, lon }, c);
      if (d < km) { km = d; best = c; }
    }
    return { city: best, km };
  }

  // ---- Assumptions, named so the page can explain them ----
  const DRY_MM = 1.0; // summed reference evaporation (mm) for a load to be line-dry
  const RAIN_PROB = 40; // % chance of rain that counts as a wet hour
  const RAIN_MM = 0.1; // mm in an hour that counts as rain
  const PANEL_KWP = 0.4; // one modern panel
  const SYSTEM_LOSS = 0.85; // inverter, wiring, dirt, heat
  const BASE_LOAD_KW = 0.3; // fridge, router and the rest of the house, always on
  const MAX_WET_WAIT_MIN = 120; // wet laundry should not sit in the drum longer than this
  const DONE_WHEN_HOME_MIN = 60; // with "done when I get home": finished at most this long before arrival
  const DELAY_MAX_MIN = 24 * 60; // Miele Delay start goes up to 24 h
  const GAP_MIN = 15; // unload and reload between two loads
  const AWAKE = { from: 6 * 60 + 30, to: 22 * 60 + 30 }; // loading, unloading and hanging out happen while people are up
  const STEP_MIN = 30;
  const DRYER_KWH = { heatpump: 1.5, condenser: 3.5 };
  const QUIET = { from: 22, to: 7 };
  const OFF_PEAK = { from: 23, to: 7 }; // weekdays; all weekend is off-peak too

  // Which way the panels face, as Open-Meteo tilt/azimuth (azimuth 0 = south, -90 = east, 90 = west).
  const FACINGS = {
    N: { name: 'North', tilt: 35, azimuth: 180 }, NE: { name: 'North-east', tilt: 35, azimuth: -135 },
    E: { name: 'East', tilt: 35, azimuth: -90 }, SE: { name: 'South-east', tilt: 35, azimuth: -45 },
    S: { name: 'South', tilt: 35, azimuth: 0 }, SW: { name: 'South-west', tilt: 35, azimuth: 45 },
    W: { name: 'West', tilt: 35, azimuth: 90 }, NW: { name: 'North-west', tilt: 35, azimuth: 135 },
    flat: { name: 'Flat roof', tilt: 10, azimuth: 0 },
  };

  const range24 = (fn) => Array.from({ length: 24 }, (_, h) => fn(h));
  const DEFAULTS = {
    lat: HOME_CITY.lat,
    lon: HOME_CITY.lon,
    people: 2,
    loads: { per: 'week', count: null }, // null = suggested from people
    home: {
      weekday: range24((h) => h < 8 || h >= 17), // away 08:00–17:00
      weekend: range24(() => true),
    },
    doneWhenHome: false,
    solar: { on: false, panels: 10, facing: 'S' },
    dal: false,
    quiet: false,
    drying: { line: true, rack: true, dryer: 'none' },
    programme: { name: 'ECO 40-60', minutes: 168, kwh: 0.32 },
  };

  function suggestedLoadsPerWeek(people) {
    return Math.max(2, Math.round(1.6 * people + 0.5));
  }

  // ---- Forecast ----
  function forecastUrl(lat, lon, facing = 'S') {
    const f = FACINGS[facing] || FACINGS.S;
    const hourly = ['temperature_2m', 'relative_humidity_2m', 'precipitation_probability', 'precipitation', 'cloud_cover',
      'wind_speed_10m', 'global_tilted_irradiance', 'et0_fao_evapotranspiration', 'vapour_pressure_deficit', 'is_day'].join(',');
    return 'https://api.open-meteo.com/v1/forecast'
      + `?latitude=${lat.toFixed(2)}&longitude=${lon.toFixed(2)}`
      + `&hourly=${hourly}&daily=sunrise,sunset&tilt=${f.tilt}&azimuth=${f.azimuth}`
      + '&wind_speed_unit=ms&timezone=Europe%2FAmsterdam&forecast_days=7';
  }

  const num = (v, fallback = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);
  const toMin = (iso) => Number(iso.slice(11, 13)) * 60 + Number(iso.slice(14, 16));
  const dowOf = (date) => new Date(`${date}T12:00:00Z`).getUTCDay();

  function parseForecast(json) {
    if (!json || !json.hourly || !Array.isArray(json.hourly.time) || !json.hourly.time.length) {
      throw new Error('Forecast has no hourly data');
    }
    const h = json.hourly;
    const pick = (key, i, fb) => num(h[key] && h[key][i], fb);
    const parsed = h.time.map((t, i) => ({
      t,
      date: t.slice(0, 10),
      hour: Number(t.slice(11, 13)),
      dow: dowOf(t.slice(0, 10)),
      temp: pick('temperature_2m', i, 12),
      rh: pick('relative_humidity_2m', i, 80),
      pop: pick('precipitation_probability', i, 0),
      rain: pick('precipitation', i, 0),
      cloud: pick('cloud_cover', i, 50),
      wind: pick('wind_speed_10m', i, 2),
      gti: Math.max(0, pick('global_tilted_irradiance', i, 0)),
      et0: Math.max(0, pick('et0_fao_evapotranspiration', i, 0)),
      vpd: pick('vapour_pressure_deficit', i, 0),
      isDay: pick('is_day', i, 0) === 1,
    }));
    // Exactly 24 hours a day, even when clocks change (a repeated 02:00 in October, a missing one in March).
    const byKey = new Map();
    for (const x of parsed) if (!byKey.has(`${x.date}|${x.hour}`)) byKey.set(`${x.date}|${x.hour}`, x);
    const dates = [...new Set(parsed.map((x) => x.date))];
    const hours = [];
    for (const date of dates) {
      for (let hr = 0; hr < 24; hr++) {
        const x = byKey.get(`${date}|${hr}`) || hours[hours.length - 1] || parsed[0];
        hours.push({ ...x, date, hour: hr, dow: dowOf(date), t: `${date}T${String(hr).padStart(2, '0')}:00` });
      }
    }
    const d = json.daily || {};
    const days = (d.time || []).map((date, i) => ({
      date,
      dow: dowOf(date),
      sunrise: d.sunrise && d.sunrise[i] ? toMin(d.sunrise[i]) : 7 * 60,
      sunset: d.sunset && d.sunset[i] ? toMin(d.sunset[i]) : 19 * 60,
    }));
    return { hours, days, weather: true };
  }

  // A forecast-shaped week with no weather, so the household side still plans when the fetch fails.
  function blankForecast(startDate, daysCount = 7) {
    const start = new Date(`${startDate}T12:00:00Z`);
    const days = [];
    const hours = [];
    for (let d = 0; d < daysCount; d++) {
      const date = new Date(start.getTime() + d * 86400000).toISOString().slice(0, 10);
      days.push({ date, dow: dowOf(date), sunrise: 7 * 60, sunset: 19 * 60 });
      for (let hr = 0; hr < 24; hr++) {
        hours.push({ t: `${date}T${String(hr).padStart(2, '0')}:00`, date, hour: hr, dow: dowOf(date), temp: 12, rh: 80, pop: 0, rain: 0, cloud: 50, wind: 2, gti: 0, et0: 0, vpd: 0, isDay: hr >= 7 && hr < 19 });
      }
    }
    return { hours, days, weather: false };
  }

  // ---- Time helpers: minutes since 00:00 on the forecast's first day ----
  const isWeekend = (dow) => dow === 0 || dow === 6;
  const hhmm = (minOfDay) => {
    const m = ((Math.round(minOfDay) % 1440) + 1440) % 1440;
    return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
  };

  function context(input, fc) {
    const horizon = fc.days.length * 1440;
    const dayOf = (m) => fc.days[Math.min(fc.days.length - 1, Math.max(0, Math.floor(m / 1440)))];
    const hourAt = (m) => fc.hours[Math.min(fc.hours.length - 1, Math.max(0, Math.floor(m / 60)))];
    const homeAt = (m) => {
      const day = dayOf(m);
      const ring = isWeekend(day.dow) ? input.home.weekend : input.home.weekday;
      return !!ring[Math.floor((((m % 1440) + 1440) % 1440) / 60)];
    };
    const quietAt = (m) => {
      const h = Math.floor((((m % 1440) + 1440) % 1440) / 60);
      return h >= QUIET.from || h < QUIET.to;
    };
    const offPeakAt = (m) => {
      if (isWeekend(dayOf(m).dow)) return true;
      const h = Math.floor((((m % 1440) + 1440) % 1440) / 60);
      return h >= OFF_PEAK.from || h < OFF_PEAK.to;
    };
    const awakeAt = (m) => {
      const mod = ((m % 1440) + 1440) % 1440;
      return mod >= AWAKE.from && mod <= AWAKE.to;
    };
    const handsAt = (m) => homeAt(m) && awakeAt(m);
    const wetAt = (m) => {
      const h = hourAt(m);
      return h.pop >= RAIN_PROB || h.rain >= RAIN_MM;
    };
    const kwp = input.solar.on ? input.solar.panels * PANEL_KWP : 0;
    const surplusAt = (m) => Math.max(0, kwp * (hourAt(m).gti / 1000) * SYSTEM_LOSS - BASE_LOAD_KW);
    return { horizon, dayOf, hourAt, homeAt, handsAt, quietAt, offPeakAt, wetAt, surplusAt, kwp };
  }

  // Arrivals: the minutes when an away stretch ends on a given day.
  function arrivalsOn(input, dow) {
    const ring = isWeekend(dow) ? input.home.weekend : input.home.weekday;
    const out = [];
    for (let h = 1; h < 24; h++) if (ring[h] && !ring[h - 1]) out.push(h * 60);
    return out;
  }

  // ---- One candidate start ----
  function evaluate(input, fc, cx, start, now) {
    const D = input.programme.minutes;
    const end = start + D;
    if (start < now || end > cx.horizon) return null;

    // Quiet hours: the machine may not run (or spin) during them.
    if (input.quiet) {
      for (let m = start; m < end; m += 15) if (cx.quietAt(m)) return null;
    }

    // Loading: someone is home and up at the start, or was within Delay start's reach before it.
    let loadAt = null;
    for (let m = start; m >= Math.max(0, start - DELAY_MAX_MIN, now); m -= 15) {
      if (cx.handsAt(m)) { loadAt = m; break; }
    }
    if (loadAt === null) return null;
    // If you load and then go out, the deadline is when you leave.
    let loadBy = loadAt;
    if (loadAt < start) {
      for (let m = Math.floor(loadAt / 60) * 60 + 60; m <= start; m += 60) {
        if (!cx.handsAt(m)) { loadBy = m; break; }
      }
    }

    // Unloading: someone home within the wait limit after the end.
    const homeAtEnd = cx.handsAt(end);
    let unloadAt = homeAtEnd ? end : null;
    const wait = input.doneWhenHome ? DONE_WHEN_HOME_MIN : MAX_WET_WAIT_MIN;
    if (unloadAt === null) {
      // Home and awake hours change on the hour: check each hour boundary after the end.
      for (let m = Math.ceil(end / 60) * 60; m <= end + wait; m += 60) if (cx.handsAt(m)) { unloadAt = m; break; }
    }
    if (unloadAt === null) return null;

    // "Done when I get home": if it finishes while you are out, it finishes just before you arrive.
    const dayIdx = Math.floor(end / 1440);
    const endDay = cx.dayOf(end);
    let arrivalHit = false;
    if (!homeAtEnd) {
      const arrivals = arrivalsOn(input, endDay.dow).map((a) => dayIdx * 1440 + a);
      arrivalHit = arrivals.some((a) => end <= a && a - end <= DONE_WHEN_HOME_MIN);
      if (input.doneWhenHome && !arrivalHit) return null;
    }

    // Energy: about 70 % of a wash's electricity goes into heating water in the first 30 % of the cycle.
    const segs = 10;
    const segMin = D / segs;
    let solarKWh = 0;
    let offPeakMin = 0;
    for (let i = 0; i < segs; i++) {
      const m = start + i * segMin + segMin / 2;
      const need = input.programme.kwh * (i < 3 ? 0.7 / 3 : 0.3 / 7);
      solarKWh += Math.min(need, cx.surplusAt(m) * (segMin / 60));
      if (cx.offPeakAt(m)) offPeakMin += segMin;
    }
    const solarShare = input.programme.kwh > 0 ? solarKWh / input.programme.kwh : 0;
    const offPeakShare = offPeakMin / D;

    // Drying outside: from hanging out until it is dry, dark (sunset + 1 h) or raining.
    const drying = dryingFrom(input, fc, cx, unloadAt);

    // Convenience: finish while someone is home, not overnight, and right on arrival if asked.
    const endMinOfDay = ((end % 1440) + 1440) % 1440;
    let convenience = homeAtEnd ? 1 : 0.7;
    if (arrivalHit) convenience = input.doneWhenHome ? 1 : 0.85;
    if (endMinOfDay >= 22 * 60 || endMinOfDay < 7 * 60) convenience -= 0.4;
    if (loadAt < start) convenience -= 0.1;

    return {
      start, end, loadAt, loadBy, unloadAt, homeAtEnd, arrivalHit,
      solarKWh, solarShare, offPeakShare, drying,
      parts: {
        solar: solarShare,
        drying: drying.fraction,
        offPeak: offPeakShare,
        convenience: Math.max(0, Math.min(1, convenience)),
      },
    };
  }

  function dryingFrom(input, fc, cx, hangAt) {
    const none = { method: input.drying.dryer !== 'none' ? 'dryer' : 'inside', fraction: 0, hangAt, dryBy: null, mm: 0 };
    if (!fc.weather || !input.drying.line) return none;
    const day = cx.dayOf(hangAt);
    const dayStart = Math.floor(hangAt / 1440) * 1440;
    const light = dayStart + day.sunset + 60;
    if (hangAt < dayStart + day.sunrise - 15 || hangAt >= dayStart + day.sunset - 60) return { ...none, reason: 'dark' };
    let mm = 0;
    let dryBy = null;
    let stop = 'dark';
    for (let m = hangAt; m < light; m += 15) {
      if (cx.wetAt(m)) { stop = 'rain'; break; }
      mm += cx.hourAt(m).et0 / 4;
      if (mm >= DRY_MM) { dryBy = m + 15; stop = 'dry'; break; }
    }
    const fraction = Math.min(1, mm / DRY_MM);
    let method = 'outside';
    if (fraction < 1) method = fraction >= 0.6 ? 'outside-then-inside' : (input.drying.dryer !== 'none' ? 'dryer' : 'inside');
    return { method, fraction, hangAt, dryBy, mm, reason: stop };
  }

  function weightsFor(input, fc) {
    const w = { convenience: 0.15 };
    if (input.solar.on && fc.weather) w.solar = 0.4;
    if (input.drying.line && fc.weather) w.drying = 0.35;
    if (input.dal) w.offPeak = 0.25;
    const sum = Object.values(w).reduce((a, b) => a + b, 0);
    for (const k of Object.keys(w)) w[k] /= sum;
    return w;
  }

  function daySummary(input, fc, cx, dayIndex) {
    const day = fc.days[dayIndex];
    const hours = fc.hours.filter((h) => h.date === day.date);
    const daylight = hours.filter((h) => h.hour * 60 >= day.sunrise && h.hour * 60 < day.sunset);
    const rainHours = daylight.filter((h) => h.pop >= RAIN_PROB || h.rain >= RAIN_MM).length;
    const sunHours = daylight.filter((h) => h.cloud < 50).length;
    const dryMm = daylight.filter((h) => !(h.pop >= RAIN_PROB || h.rain >= RAIN_MM)).reduce((s, h) => s + h.et0, 0);
    const peakPv = cx.kwp ? Math.max(0, ...hours.map((h) => cx.kwp * (h.gti / 1000) * SYSTEM_LOSS)) : 0;
    let verdict = 'unknown';
    if (fc.weather) verdict = dryMm >= 1.5 && rainHours <= 1 ? 'great' : dryMm >= DRY_MM * 0.8 && rainHours <= 3 ? 'ok' : 'indoor';
    return {
      date: day.date, dow: day.dow, sunrise: day.sunrise, sunset: day.sunset,
      rainHours, sunHours, dryMm: Math.round(dryMm * 100) / 100, peakPv: Math.round(peakPv * 10) / 10,
      verdict, maxTemp: Math.round(Math.max(...hours.map((h) => h.temp))),
    };
  }

  function loadsWanted(input, days) {
    const perWeek = input.loads.count == null ? suggestedLoadsPerWeek(input.people) : input.loads.count;
    if (input.loads.per === 'day') return { per: 'day', count: Math.max(1, input.loads.count || 1) };
    return { per: 'week', count: Math.max(1, Math.round((perWeek * days) / 7)) };
  }

  function describe(input, fc, cx, c, weights) {
    const dayIndex = Math.floor(c.start / 1440);
    const why = [];
    if (weights.solar && c.solarShare >= 0.5) why.push(`${Math.round(c.solarShare * 100)}% of the wash runs on your own panels.`);
    if (weights.offPeak && c.offPeakShare >= 0.5) why.push(`${Math.round(c.offPeakShare * 100)}% of it falls in off-peak hours.`);
    if (c.drying.method === 'outside') why.push(`Dry, ${cx.hourAt(c.drying.hangAt).wind >= 3 ? 'breezy ' : ''}weather to dry it outside${c.drying.dryBy != null ? ` by about ${hhmm(c.drying.dryBy)}` : ''}.`);
    if (c.drying.method === 'outside-then-inside') why.push('It mostly dries outside before it gets dark; bring it in to finish.');
    if (c.arrivalHit) why.push('It finishes just before you get home.');
    else if (c.homeAtEnd) why.push('Someone is home when it finishes.');
    if (input.quiet) why.push('It stays clear of quiet hours.');
    const dryerSaved = input.drying.dryer !== 'none' && (c.drying.method === 'outside') ? DRYER_KWH[input.drying.dryer] : 0;
    return {
      dayIndex,
      date: fc.days[dayIndex].date,
      dow: fc.days[dayIndex].dow,
      start: c.start,
      end: c.end,
      startLabel: hhmm(c.start),
      endLabel: hhmm(c.end),
      loadAt: c.loadAt,
      loadBy: c.loadBy,
      loadLabel: hhmm(c.loadBy),
      delayMin: c.start - c.loadAt,
      startsInMin: c.start - c.loadBy,
      unloadLabel: hhmm(c.unloadAt),
      solarShare: c.solarShare,
      solarKWh: Math.round(c.solarKWh * 100) / 100,
      offPeakShare: c.offPeakShare,
      drying: { ...c.drying, hangLabel: hhmm(c.drying.hangAt), dryByLabel: c.drying.dryBy != null ? hhmm(c.drying.dryBy) : null },
      dryerSavedKWh: dryerSaved,
      score: c.score,
      parts: c.parts,
      why,
    };
  }

  function plan(rawInput, fc, now = 0) {
    const input = {
      ...DEFAULTS,
      ...rawInput,
      home: { ...DEFAULTS.home, ...(rawInput && rawInput.home) },
      solar: { ...DEFAULTS.solar, ...(rawInput && rawInput.solar) },
      drying: { ...DEFAULTS.drying, ...(rawInput && rawInput.drying) },
      loads: { ...DEFAULTS.loads, ...(rawInput && rawInput.loads) },
      programme: { ...DEFAULTS.programme, ...(rawInput && rawInput.programme) },
    };
    const cx = context(input, fc);
    const weights = weightsFor(input, fc);
    const first = Math.ceil(now / STEP_MIN) * STEP_MIN;

    const cands = [];
    for (let s = first; s + input.programme.minutes <= cx.horizon; s += STEP_MIN) {
      const c = evaluate(input, fc, cx, s, now);
      if (!c) continue;
      c.score = Object.keys(weights).reduce((sum, k) => sum + weights[k] * c.parts[k], 0);
      cands.push(c);
    }

    const firstDay = Math.floor(first / 1440);
    const daysLeft = fc.days.length - firstDay;
    const wanted = loadsWanted(input, daysLeft);
    const picked = [];
    const clash = (c) => picked.some((p) => c.start < p.end + GAP_MIN && p.start < c.end + GAP_MIN);
    const warnings = [];

    if (wanted.per === 'day') {
      for (let d = firstDay; d < fc.days.length; d++) {
        const own = cands.filter((c) => Math.floor(c.start / 1440) === d).sort((a, b) => b.score - a.score);
        let n = 0;
        for (const c of own) {
          if (n === wanted.count) break;
          if (clash(c)) continue;
          picked.push(c);
          n++;
        }
        if (n < wanted.count && d > firstDay) warnings.push({ dayIndex: d, text: `Only ${n} of ${wanted.count} loads fit on this day with your rhythm${input.quiet ? ' and quiet hours' : ''}.` });
      }
    } else {
      // Spread the week's loads: the best slot on each day first, a second one on a day only if needed.
      const perDay = {};
      const sorted = cands.slice().sort((a, b) => b.score - a.score);
      for (const round of [1, 2]) {
        for (const c of sorted) {
          if (picked.length === wanted.count) break;
          const d = Math.floor(c.start / 1440);
          if ((perDay[d] || 0) >= round || clash(c)) continue;
          picked.push(c);
          perDay[d] = (perDay[d] || 0) + 1;
        }
      }
      if (picked.length < wanted.count) warnings.push({ dayIndex: null, text: `Only ${picked.length} of ${wanted.count} loads fit this week with your rhythm${input.quiet ? ' and quiet hours' : ''}.` });
    }
    if (!cands.length) warnings.push({ dayIndex: null, text: 'Nothing fits: nobody is home to load or unload at a time the machine may run. Mark more hours at home or switch off quiet hours.' });

    picked.sort((a, b) => a.start - b.start);
    const days = fc.days.map((_, i) => daySummary(input, fc, cx, i));
    return {
      input,
      weather: fc.weather,
      weights,
      wanted,
      loads: picked.map((c) => describe(input, fc, cx, c, weights)),
      days,
      warnings,
      candidates: cands.length,
      kwp: cx.kwp,
      hourly: fc.hours.map((h) => ({
        pv: cx.kwp ? Math.round(cx.kwp * (h.gti / 1000) * SYSTEM_LOSS * 100) / 100 : 0,
        wet: h.pop >= RAIN_PROB || h.rain >= RAIN_MM,
        et0: h.et0,
        cloud: h.cloud,
        isDay: h.isDay,
      })),
    };
  }

  const api = {
    CITIES, HOME_CITY, FACINGS, DEFAULTS, DRY_MM, RAIN_PROB, RAIN_MM, PANEL_KWP, SYSTEM_LOSS, BASE_LOAD_KW,
    MAX_WET_WAIT_MIN, DONE_WHEN_HOME_MIN, DELAY_MAX_MIN, DRYER_KWH, QUIET, OFF_PEAK, AWAKE,
    distanceKm, nearestCity, suggestedLoadsPerWeek, forecastUrl, parseForecast, blankForecast,
    arrivalsOn, plan, hhmm, isWeekend,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.WhenToWash = api;
})(typeof window !== 'undefined' ? window : globalThis);
