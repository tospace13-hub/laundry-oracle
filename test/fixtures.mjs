// Shared test fixture: a 7-day forecast in Open-Meteo's response format.
// `day(d, h)` returns the hour's weather for day d, hour h.
export function forecast(start, day) {
  const time = [];
  const keys = ['temperature_2m', 'relative_humidity_2m', 'precipitation_probability', 'precipitation', 'cloud_cover',
    'wind_speed_10m', 'global_tilted_irradiance', 'et0_fao_evapotranspiration', 'vapour_pressure_deficit', 'is_day'];
  const hourly = Object.fromEntries(keys.map((k) => [k, []]));
  const daily = { time: [], sunrise: [], sunset: [] };
  const base = new Date(`${start}T12:00:00Z`);
  for (let d = 0; d < 7; d++) {
    const date = new Date(base.getTime() + d * 86400000).toISOString().slice(0, 10);
    daily.time.push(date);
    daily.sunrise.push(`${date}T07:30`);
    daily.sunset.push(`${date}T19:00`);
    for (let h = 0; h < 24; h++) {
      time.push(`${date}T${String(h).padStart(2, '0')}:00`);
      const w = day(d, h);
      for (const k of keys) hourly[k].push(w[k] === undefined ? null : w[k]);
    }
  }
  return { latitude: 51.98, longitude: 5.9, timezone: 'Europe/Amsterdam', hourly: { time, ...hourly }, daily };
}
