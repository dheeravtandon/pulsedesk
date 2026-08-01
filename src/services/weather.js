'use strict';

const { getJSON, cachedJSON, pool, settled } = require('./http');

const CODES = {
  0: ['Clear sky', '☀️'], 1: ['Mainly clear', '🌤️'], 2: ['Partly cloudy', '⛅'], 3: ['Overcast', '☁️'],
  45: ['Fog', '🌫️'], 48: ['Rime fog', '🌫️'], 51: ['Light drizzle', '🌦️'], 53: ['Drizzle', '🌦️'],
  55: ['Heavy drizzle', '🌧️'], 56: ['Freezing drizzle', '🌧️'], 57: ['Freezing drizzle', '🌧️'],
  61: ['Light rain', '🌦️'], 63: ['Rain', '🌧️'], 65: ['Heavy rain', '⛈️'], 66: ['Freezing rain', '🌧️'],
  67: ['Freezing rain', '🌧️'], 71: ['Light snow', '🌨️'], 73: ['Snow', '🌨️'], 75: ['Heavy snow', '❄️'],
  77: ['Snow grains', '❄️'], 80: ['Rain showers', '🌦️'], 81: ['Rain showers', '🌧️'],
  82: ['Violent showers', '⛈️'], 85: ['Snow showers', '🌨️'], 86: ['Snow showers', '🌨️'],
  95: ['Thunderstorm', '⛈️'], 96: ['Storm + hail', '⛈️'], 99: ['Severe storm', '⛈️']
};

async function locate(manual) {
  // isFinite(null) is true, so null coordinates must be rejected explicitly.
  const has = (v) => v != null && v !== '' && isFinite(Number(v));
  if (manual && has(manual.lat) && has(manual.lon)) {
    return { ...manual, lat: Number(manual.lat), lon: Number(manual.lon) };
  }
  const a = await settled(cachedJSON('geo:ipapi', 'https://ipapi.co/json/', 6 * 60 * 60 * 1000));
  if (a && a.latitude) {
    return { lat: a.latitude, lon: a.longitude, city: a.city, region: a.region, country: a.country_name, tz: a.timezone };
  }
  const b = await settled(cachedJSON('geo:ipwho', 'https://ipwho.is/', 6 * 60 * 60 * 1000));
  if (b && b.latitude) {
    return { lat: b.latitude, lon: b.longitude, city: b.city, region: b.region, country: b.country, tz: b.timezone && b.timezone.id };
  }
  return { lat: 28.6139, lon: 77.209, city: 'New Delhi', region: 'DL', country: 'India', tz: 'Asia/Kolkata' };
}

function aqiBand(v) {
  if (v == null) return null;
  if (v <= 50) return 'Good';
  if (v <= 100) return 'Moderate';
  if (v <= 150) return 'Unhealthy (sensitive)';
  if (v <= 200) return 'Unhealthy';
  if (v <= 300) return 'Very unhealthy';
  return 'Hazardous';
}

async function today(manual) {
  const loc = await locate(manual);
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${loc.lat}&longitude=${loc.lon}` +
    '&current=temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,weather_code,wind_speed_10m,surface_pressure' +
    '&hourly=temperature_2m,precipitation_probability,weather_code' +
    '&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,sunrise,sunset,uv_index_max' +
    '&timezone=auto&forecast_days=3';

  const w = await getJSON(url, { timeout: 12000 });
  const air = await settled(
    getJSON(
      `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${loc.lat}&longitude=${loc.lon}&current=us_aqi,pm2_5&timezone=auto`,
      { timeout: 10000 }
    )
  );

  const c = w.current || {};
  const d = w.daily || {};
  const [desc, icon] = CODES[c.weather_code] || ['—', '🌡️'];
  const nowIso = (w.hourly && w.hourly.time ? w.hourly.time : []).findIndex((t) => new Date(t) >= new Date(c.time));
  const start = nowIso < 0 ? 0 : nowIso;

  return {
    city: [loc.city, loc.country].filter(Boolean).join(', ') || `${Number(loc.lat).toFixed(2)}, ${Number(loc.lon).toFixed(2)}`,
    tempC: c.temperature_2m,
    feelsC: c.apparent_temperature,
    humidity: c.relative_humidity_2m,
    windKph: c.wind_speed_10m,
    pressure: c.surface_pressure,
    isDay: c.is_day === 1,
    desc,
    icon,
    maxC: d.temperature_2m_max && d.temperature_2m_max[0],
    minC: d.temperature_2m_min && d.temperature_2m_min[0],
    rainChance: d.precipitation_probability_max && d.precipitation_probability_max[0],
    uv: d.uv_index_max && d.uv_index_max[0],
    sunrise: d.sunrise && d.sunrise[0],
    sunset: d.sunset && d.sunset[0],
    aqi: air && air.current ? air.current.us_aqi : null,
    aqiBand: aqiBand(air && air.current ? air.current.us_aqi : null),
    pm25: air && air.current ? air.current.pm2_5 : null,
    hourly: (w.hourly ? w.hourly.time : []).slice(start, start + 8).map((t, i) => ({
      time: t,
      temp: w.hourly.temperature_2m[start + i],
      rain: w.hourly.precipitation_probability ? w.hourly.precipitation_probability[start + i] : null,
      icon: (CODES[w.hourly.weather_code[start + i]] || ['', '🌡️'])[1]
    })),
    days: (d.time || []).slice(0, 3).map((t, i) => ({
      date: t,
      icon: (CODES[d.weather_code[i]] || ['', '🌡️'])[1],
      max: d.temperature_2m_max[i],
      min: d.temperature_2m_min[i],
      rain: d.precipitation_probability_max ? d.precipitation_probability_max[i] : null
    }))
  };
}

/** Fixed set of major financial hubs — independent of the user's own location. */
const FIN_CITIES = [
  { key: 'MUM', name: 'Mumbai', flag: '🇮🇳', lat: 19.076, lon: 72.8777 },
  { key: 'NYC', name: 'New York', flag: '🇺🇸', lat: 40.7128, lon: -74.006 },
  { key: 'LON', name: 'London', flag: '🇬🇧', lat: 51.5072, lon: -0.1276 },
  { key: 'TOK', name: 'Tokyo', flag: '🇯🇵', lat: 35.6762, lon: 139.6503 },
  { key: 'HKG', name: 'Hong Kong', flag: '🇭🇰', lat: 22.3193, lon: 114.1694 },
  { key: 'FRA', name: 'Frankfurt', flag: '🇩🇪', lat: 50.1109, lon: 8.6821 }
];

async function financial() {
  return pool(FIN_CITIES, 6, async (c) => {
    try {
      const w = await cachedJSON(
        `wx:fin:${c.key}`,
        `https://api.open-meteo.com/v1/forecast?latitude=${c.lat}&longitude=${c.lon}&current=temperature_2m,weather_code,is_day&timezone=auto`,
        20 * 60 * 1000,
        { timeout: 10000 }
      );
      const cur = w.current || {};
      const [desc, icon] = CODES[cur.weather_code] || ['—', '🌡️'];
      return { key: c.key, name: c.name, flag: c.flag, tempC: cur.temperature_2m, desc, icon, isDay: cur.is_day === 1 };
    } catch {
      return { key: c.key, name: c.name, flag: c.flag, tempC: null, desc: '—', icon: '🌡️', isDay: true };
    }
  });
}

module.exports = { today, locate, financial, FIN_CITIES };
