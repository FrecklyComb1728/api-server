const express = require('express');
const fs = require('fs');
const path = require('path');
const HttpClient = require('../../utils/httpClient');
const { queryIpInfoWithRetry, getClientIp } = require('../ipinfo');

const router = express.Router();

function readJsonFile(filePath) {
  const raw = fs.readFileSync(filePath, 'utf-8');
  return JSON.parse(raw);
}

function findFirstExistingPath(candidates) {
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

const configPath = findFirstExistingPath([
  path.join(__dirname, 'config.json'),
  path.join(process.cwd(), 'temp', 'api', 'weather', 'config.json')
]);

const config = configPath ? readJsonFile(configPath) : {};

const cityIdPath = findFirstExistingPath([
  path.join(__dirname, 'week', 'city_id.json'),
  path.join(process.cwd(), 'temp', 'api', 'weather', 'week', 'city_id.json')
]);

const cmoIdPath = findFirstExistingPath([
  path.join(__dirname, 'week', 'cmo_id.json'),
  path.join(process.cwd(), 'temp', 'api', 'weather', 'week', 'cmo_id.json')
]);

const cityIdList = cityIdPath ? readJsonFile(cityIdPath) : [];
const cmoIdList = cmoIdPath ? readJsonFile(cmoIdPath) : [];

const cityIdMap = new Map(cityIdList.map(item => [String(item.name || ''), String(item.city_code || '')]));
const cmoIdMap = new Map(cmoIdList.map(item => [String(item.name || ''), String(item.id || '')]));

function pad2(n) {
  return String(n).padStart(2, '0');
}

function formatDate(d) {
  return `${d.getFullYear()}/${pad2(d.getMonth() + 1)}/${pad2(d.getDate())}`;
}

function formatTime(d) {
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
}

function formatWeekday(dateStr) {
  const parts = String(dateStr).split('/').map(v => Number(v));
  if (parts.length !== 3 || parts.some(n => Number.isNaN(n))) return '';
  const d = new Date(parts[0], parts[1] - 1, parts[2]);
  const map = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
  return map[d.getDay()] || '';
}

function digitsOnly(value) {
  const s = String(value ?? '');
  const m = s.match(/\d+/g);
  return m ? m.join('') : '';
}

function normalizeCityForMatch(value) {
  return String(value ?? '').trim().replace(/[\s,，]/g, '').replace(/[省市]/g, '');
}

function findIdByTailMatch(name, lookupMap) {
  const raw = String(name ?? '').trim();
  if (!raw) return '';

  const base1 = raw;
  const base2 = normalizeCityForMatch(raw);
  const base3 = base2.replace(/区$/g, '').replace(/市$/g, '');
  const bases = [base1, base2, base3].filter(Boolean);

  for (const base of bases) {
    if (lookupMap.has(base)) return lookupMap.get(base);
  }

  for (const base of bases) {
    const maxLen = Math.min(4, base.length);
    for (let len = 2; len <= maxLen; len++) {
      const cand = base.slice(-len);
      if (lookupMap.has(cand)) return lookupMap.get(cand);
    }
  }

  for (const base of bases) {
    for (const [k, v] of lookupMap.entries()) {
      if (k && base.endsWith(k)) return v;
    }
  }

  return '';
}

function applyTemplate(url, values) {
  let out = String(url);
  for (const [k, v] of Object.entries(values)) {
    out = out.replaceAll(`{${k}}`, v);
  }
  return out;
}

let lastVmyRequestAt = 0;
async function throttleVmy() {
  const now = Date.now();
  const wait = Math.max(0, 1000 - (now - lastVmyRequestAt));
  if (wait > 0) {
    await new Promise(resolve => setTimeout(resolve, wait));
  }
  lastVmyRequestAt = Date.now();
}

async function resolveCityFromIp(ip) {
  const result = await queryIpInfoWithRetry(ip);
  const city = result?.data?.city ? String(result.data.city) : '';
  return city.replace(/[省]/g, '').trim();
}

function pickCityDisplay(city) {
  const c = String(city ?? '').trim();
  if (!c) return '';
  const normalized = c.replace(/,/g, '');
  const parts = normalized.split(/\s+/).filter(Boolean);
  const last = parts[parts.length - 1] || normalized;
  const clean = last.replace(/[省]/g, '').trim();
  return clean.replace(/市$/g, '');
}

function normalizeHumidity(value) {
  const s = String(value ?? '').trim();
  if (!s) return '';
  const v = s.replace(/%/g, '');
  const d = digitsOnly(v);
  return d ? `${d}%` : '';
}

function normalizeVisibility(value) {
  if (value === undefined || value === null) return '';
  const s = String(value).trim();
  if (!s) return '';
  const d = digitsOnly(s);
  if (!d) return '';
  if (s.toLowerCase().includes('km')) return `${d}km`;
  return `${d}km`;
}

async function fetchBingMsnRealtime(http, cityQuery) {
  if (!config?.bing?.enabled || !config?.msn?.enabled) return null;
  const bingUrl = applyTemplate(config.bing.url, { city: encodeURIComponent(cityQuery) });
  const bingData = await http.get(bingUrl);
  const first = Array.isArray(bingData?.value) ? bingData.value[0] : null;
  const lat = first?.geo?.latitude;
  const lon = first?.geo?.longitude;
  if (lat === undefined || lon === undefined) return null;

  const msnUrl = applyTemplate(config.msn.url, {
    'value.geo.latitude,value.geo.longitude': `${lat},${lon}`
  });

  const msnData = await http.get(msnUrl);
  const current = msnData?.responses?.[0]?.weather?.[0]?.current;
  const locationName = msnData?.responses?.[0]?.weather?.[0]?.source?.location?.Name;
  if (!current) return null;

  const temp = digitsOnly(current.temp);
  const weather = String(current.pvdrCap || current.cap || '').trim();
  const wind = String(current.pvdrWindDir || '').trim();
  const windSpeed = String(current.pvdrWindSpd || '').trim();
  const humidity = normalizeHumidity(current.rh);
  const visibility = normalizeVisibility(current.vis);

  return {
    provider: 'msn',
    city: String(locationName || '').trim(),
    temperature: temp,
    high: temp,
    low: temp,
    weather,
    wind,
    windSpeed,
    visibility,
    humidity
  };
}

async function fetchAmapRealtime(http, cityQuery) {
  if (!config?.amap?.enabled) return null;
  const url = applyTemplate(config.amap.url, { city: encodeURIComponent(cityQuery) });
  const data = await http.get(url);
  const live = Array.isArray(data?.lives) ? data.lives[0] : null;
  if (!live) return null;

  const temp = digitsOnly(live.temperature);
  const weather = String(live.weather || '').trim();
  const wind = String(live.winddirection || '').trim();
  const windSpeed = String(live.windpower || '').trim();
  const humidity = normalizeHumidity(live.humidity);

  return {
    provider: 'amap',
    city: String(live.city || '').trim(),
    temperature: temp,
    high: temp,
    low: temp,
    weather,
    wind: wind ? `${wind}风` : '',
    windSpeed,
    visibility: '',
    humidity
  };
}

async function fetchVmyRealtime(http, cityQuery) {
  if (!config?.vmy?.enabled) return null;
  await throttleVmy();
  const url = applyTemplate(config.vmy.url, { city: encodeURIComponent(cityQuery) });
  const data = await http.get(url);

  const current = data?.data?.current || data?.current || data?.data || null;
  const city = data?.data?.city || data?.city || current?.city || '';
  const temperature = digitsOnly(current?.temp ?? current?.wendu ?? current?.temperature ?? data?.data?.wendu);
  const weather = String(current?.weather || current?.cap || current?.type || '').trim();
  const wind = String(current?.wind || current?.windDirection || '').trim();
  const windSpeed = String(current?.windSpeed || current?.windpower || '').trim();
  const humidity = normalizeHumidity(current?.humidity);
  const visibility = normalizeVisibility(current?.visibility);

  if (!temperature && !weather) return null;

  return {
    provider: 'vmy',
    city: String(city || '').trim(),
    temperature,
    high: temperature,
    low: temperature,
    weather,
    wind,
    windSpeed,
    visibility,
    humidity
  };
}

async function fetchSuyanRealtime(http, cityQuery) {
  if (!config?.suyan?.enabled) return null;
  const url = applyTemplate(config.suyan.url, { city: encodeURIComponent(cityQuery) });
  const data = await http.get(url);
  const current = data?.data?.current || data?.current || null;
  const base = data?.data || data;

  const city = base?.city || '';
  const temperature = digitsOnly(current?.temp ?? base?.temp);
  const weather = String(current?.weather || base?.weather || '').trim();
  const wind = String(current?.wind || base?.wind || '').trim();
  const windSpeed = String(current?.windSpeed || base?.windSpeed || '').trim();
  const visibility = normalizeVisibility(current?.visibility);
  const humidity = normalizeHumidity(current?.humidity);

  if (!temperature && !weather) return null;

  return {
    provider: 'suyan',
    city: String(city || '').trim(),
    temperature,
    high: temperature,
    low: temperature,
    weather,
    wind,
    windSpeed,
    visibility,
    humidity
  };
}

async function buildRealtime(req, cityQuery) {
  const http = new HttpClient({ timeout: 10000 });
  const now = new Date();

  const ip = req.query.ip ? String(req.query.ip) : getClientIp(req);
  const city = pickCityDisplay(cityQuery);

  const providers = [
    () => fetchBingMsnRealtime(http, cityQuery),
    () => fetchAmapRealtime(http, cityQuery),
    () => fetchVmyRealtime(http, cityQuery),
    () => fetchSuyanRealtime(http, cityQuery)
  ];

  let result = null;
  for (const fn of providers) {
    try {
      result = await fn();
      if (result) break;
    } catch {
    }
  }

  if (!result) {
    return null;
  }

  return {
    ip,
    city: pickCityDisplay(result.city) || city,
    high: String(result.high || ''),
    low: String(result.low || ''),
    temperature: String(result.temperature || ''),
    weather: String(result.weather || ''),
    wind: String(result.wind || ''),
    windSpeed: String(result.windSpeed || ''),
    visibility: String(result.visibility || ''),
    humidity: String(result.humidity || ''),
    time: formatTime(now),
    date: formatDate(now)
  };
}

async function fetchCmaWeek(http, stationId) {
  if (!config?.cma?.enabled) return null;
  const url = applyTemplate(config.cma.url, { cmo_id: stationId });
  const data = await http.get(url);
  const daily = Array.isArray(data?.data?.daily) ? data.data.daily : null;
  if (!daily) return null;

  const week = daily.slice(0, 7).map(item => {
    const date = String(item.date || '').trim();
    const dayWind = String(item.dayWindDirection || '').trim();
    const nightWind = String(item.nightWindDirection || '').trim();
    const wind = dayWind && nightWind && dayWind !== nightWind ? `${dayWind}转${nightWind}` : (dayWind || nightWind);

    const dayScale = String(item.dayWindScale || '').trim();
    const nightScale = String(item.nightWindScale || '').trim();
    const windSpeed = dayScale && nightScale && dayScale !== nightScale ? `${dayScale}转${nightScale}` : (dayScale || nightScale);

    const dayText = String(item.dayText || '').trim();
    const nightText = String(item.nightText || '').trim();
    const weather = dayText && nightText && dayText !== nightText ? `${dayText}转${nightText}` : (dayText || nightText);

    const high = item.high;
    const low = item.low;
    const avg = (typeof high === 'number' && typeof low === 'number') ? Math.round((high + low) / 2) : null;
    const temperature = avg !== null ? `${avg}℃` : '';

    return {
      date,
      wind,
      windSpeed,
      weather,
      temperature,
      week: formatWeekday(date)
    };
  });

  return week;
}

async function fetchSojsonWeek(http, cityId) {
  if (!config?.sojson?.enabled) return null;
  const url = applyTemplate(config.sojson.url, { city_id: cityId });
  const data = await http.get(url);
  const forecast = Array.isArray(data?.data?.forecast) ? data.data.forecast : null;
  if (!forecast) return null;

  return forecast.slice(0, 7).map(item => {
    const date = String(item.ymd || '').trim().replaceAll('-', '/');
    const high = Number(digitsOnly(item.high));
    const low = Number(digitsOnly(item.low));
    const temperature = Number.isFinite(high) && Number.isFinite(low) ? `${Math.round((high + low) / 2)}℃` : '';

    return {
      date,
      wind: String(item.fx || '').trim(),
      windSpeed: String(item.fl || '').trim(),
      weather: String(item.type || '').trim(),
      temperature,
      week: String(item.week || '').trim()
    };
  });
}

async function buildWeek(cityQuery) {
  const http = new HttpClient({ timeout: 10000 });
  const city = pickCityDisplay(cityQuery);

  const stationId = findIdByTailMatch(cityQuery, cmoIdMap) || findIdByTailMatch(city, cmoIdMap);
  if (stationId) {
    const week = await fetchCmaWeek(http, stationId);
    if (week) return week;
  }

  const sojsonCityId = findIdByTailMatch(cityQuery, cityIdMap) || findIdByTailMatch(city, cityIdMap);
  if (sojsonCityId) {
    const week = await fetchSojsonWeek(http, sojsonCityId);
    if (week) return week;
  }

  return null;
}

async function resolveCityQuery(req) {
  const queryCity = req.query.city ? String(req.query.city) : '';
  if (queryCity) return queryCity;

  const queryIp = req.query.ip ? String(req.query.ip) : '';
  const ip = queryIp || getClientIp(req);
  const city = await resolveCityFromIp(ip);
  return pickCityDisplay(city) || city;
}

async function buildBoth(req, cityQuery) {
  const [realtime, week] = await Promise.all([
    buildRealtime(req, cityQuery),
    buildWeek(cityQuery)
  ]);
  return {
    realtime: realtime || null,
    week: week || []
  };
}

router.get('/realtime', async (req, res) => {
  try {
    const cityQuery = await resolveCityQuery(req);
    if (!cityQuery) {
      return res.status(400).json({ success: false, message: '缺少city或无法通过IP解析城市' });
    }
    const realtime = await buildRealtime(req, cityQuery);
    if (!realtime) {
      return res.status(502).json({ success: false, message: '上游天气接口不可用' });
    }
    res.json({ success: true, data: { realtime } });
  } catch (e) {
    res.status(500).json({ success: false, message: String(e?.message || e) });
  }
});

router.get('/week', async (req, res) => {
  try {
    const cityQuery = await resolveCityQuery(req);
    if (!cityQuery) {
      return res.status(400).json({ success: false, message: '缺少city或无法通过IP解析城市' });
    }
    const week = await buildWeek(cityQuery);
    if (!week || week.length === 0) {
      return res.status(404).json({ success: false, message: '未找到城市ID或上游不可用' });
    }
    res.json({ success: true, data: { week } });
  } catch (e) {
    res.status(500).json({ success: false, message: String(e?.message || e) });
  }
});

router.get('/', async (req, res) => {
  try {
    const cityQuery = await resolveCityQuery(req);
    if (!cityQuery) {
      return res.status(400).json({ success: false, message: '缺少city或无法通过IP解析城市' });
    }
    const data = await buildBoth(req, cityQuery);
    if (!data.realtime && (!data.week || data.week.length === 0)) {
      return res.status(502).json({ success: false, message: '上游天气接口不可用' });
    }
    res.json({ success: true, data });
  } catch (e) {
    res.status(500).json({ success: false, message: String(e?.message || e) });
  }
});

module.exports = router;

