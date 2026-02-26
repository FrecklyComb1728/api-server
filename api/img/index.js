const express = require('express');
const axios = require('axios');
const path = require('path');
const HttpClient = require('../../utils/httpClient');

const router = express.Router();
const config = require(path.join(__dirname, 'config.json'));

const http = new HttpClient({ timeout: Number(config?.timeout_ms) || 10000 });

const caches = {
  horizontal: { items: [], urls: [], fetchedAt: 0, baseUrl: '' },
  vertical: { items: [], urls: [], fetchedAt: 0, baseUrl: '' }
};
const inflights = { horizontal: null, vertical: null };

router.use((req, res, next) => {
  res.set('Cache-Control', 'no-store, no-cache, max-age=0, must-revalidate, proxy-revalidate');
  next();
});

function normalizeBaseUrl(value) {
  const s = String(value ?? '').trim();
  if (!s) return '';
  return s.replace(/\/+$/g, '');
}

function normalizePath(value) {
  const s = String(value ?? '').trim();
  if (!s) return '';
  return s.startsWith('/') ? s : `/${s}`;
}

function normalizeOrientation(value) {
  const s = String(value ?? '').trim().toLowerCase();
  if (s === 'v' || s === 'vertical') return 'vertical';
  return 'horizontal';
}

function isVerticalByUserAgent(ua) {
  const s = String(ua ?? '');
  if (!s) return false;
  return /(Mobile|Android|iPhone|iPad|iPod|HarmonyOS|Windows Phone)/i.test(s);
}

function pickOrientationByReq(req) {
  const ua = req?.headers?.['user-agent'];
  return isVerticalByUserAgent(ua) ? 'vertical' : 'horizontal';
}

function extractList(data) {
  function getByPath(obj, keys) {
    let cur = obj;
    for (const k of keys) {
      if (!cur || typeof cur !== 'object') return undefined;
      cur = cur[k];
    }
    return cur;
  }

  function findArray(node, depth) {
    if (Array.isArray(node)) return node;
    if (!node || typeof node !== 'object') return null;

    const preferredPaths = [
      ['items'],
      ['list'],
      ['images'],
      ['result'],
      ['data'],
      ['data', 'items'],
      ['data', 'list'],
      ['data', 'images'],
      ['data', 'result']
    ];
    for (const p of preferredPaths) {
      const v = getByPath(node, p);
      if (Array.isArray(v)) return v;
    }

    if (depth >= 3) return null;
    for (const v of Object.values(node)) {
      const r = findArray(v, depth + 1);
      if (Array.isArray(r)) return r;
    }
    return null;
  }

  return findArray(data, 0) || [];
}

function ttlMs() {
  const v = Number(config?.cache_ttl);
  if (!Number.isFinite(v) || v <= 0) return 0;
  return v * 1000;
}

function isCacheFresh(orientation, now) {
  const ttl = ttlMs();
  if (ttl <= 0) return false;
  const c = caches[normalizeOrientation(orientation)];
  if (!c || !c.items || c.items.length === 0) return false;
  return now - (c.fetchedAt || 0) < ttl;
}

function getLegacyUpstreamUrl(pathValue) {
  const base = String(config?.upstream_url || '').trim();
  if (!base) return '';
  try {
    const u = new URL(base);
    const p = String(pathValue ?? '').trim() || '/background';
    u.searchParams.set('path', p);
    return u.toString();
  } catch {
    return '';
  }
}

function getUpstreamUrl(orientation) {
  const o = normalizeOrientation(orientation);
  const upstream = config?.upstream && typeof config.upstream === 'object' ? config.upstream : null;
  const fromNew = upstream ? String(upstream[o] || '').trim() : '';
  if (fromNew) return fromNew;

  const legacyPath = String(config?.upstream_path || '/background').trim() || '/background';
  if (o === 'horizontal') return getLegacyUpstreamUrl(legacyPath);
  const derived = legacyPath === '/background' ? '/background-phone' : legacyPath.replace(/\/background$/g, '/background-phone');
  return getLegacyUpstreamUrl(derived || '/background-phone');
}

function getUpstreamHeaders(orientation) {
  const o = normalizeOrientation(orientation);
  const base = config?.upstream_headers && typeof config.upstream_headers === 'object' ? config.upstream_headers : null;
  const h =
    o === 'vertical'
      ? (config?.upstream_headers_vertical && typeof config.upstream_headers_vertical === 'object' ? config.upstream_headers_vertical : null)
      : (config?.upstream_headers_horizontal && typeof config.upstream_headers_horizontal === 'object' ? config.upstream_headers_horizontal : null);
  return { ...(base || {}), ...(h || {}) };
}

function startRefresh(orientation) {
  const o = normalizeOrientation(orientation);
  if (inflights[o]) return inflights[o];

  inflights[o] = (async () => {
    const baseUrl = normalizeBaseUrl(config?.url);
    if (!baseUrl) {
      const err = new Error('配置缺少url');
      err.statusCode = 500;
      throw err;
    }

    const upstreamUrl = getUpstreamUrl(o);
    if (!upstreamUrl) {
      const err = new Error('配置缺少upstream');
      err.statusCode = 500;
      throw err;
    }

    const headers = getUpstreamHeaders(o);
    const raw = await http.get(upstreamUrl, {}, { headers });
    const list = extractList(raw);

    const items = [];
    const urls = [];
    for (const it of list) {
      if (!it || typeof it !== 'object') continue;
      const p = normalizePath(it.path);
      if (!p) continue;
      const name = String(it.name ?? '').trim();
      items.push({ name, path: p });
      urls.push(`${baseUrl}${p}`);
    }

    caches[o] = {
      items,
      urls,
      fetchedAt: Date.now(),
      baseUrl
    };
    return caches[o];
  })().finally(() => {
    inflights[o] = null;
  });

  return inflights[o];
}

async function getCacheNonBlocking(orientation) {
  const o = normalizeOrientation(orientation);
  const now = Date.now();
  if (isCacheFresh(o, now)) return caches[o];

  if (caches[o] && caches[o].items && caches[o].items.length > 0) {
    startRefresh(o).catch(() => {});
    return caches[o];
  }

  return startRefresh(o);
}

function warmUp() {
  const jitter = () => Math.floor(Math.random() * 2000);
  setTimeout(() => startRefresh('horizontal').catch(() => {}), jitter());
  setTimeout(() => startRefresh('vertical').catch(() => {}), jitter());
}

warmUp();

function getType(value, defaultValue) {
  const s = String(value ?? '').trim().toLowerCase();
  return s || defaultValue;
}

function buildListResponseData(c) {
  return c.items.map((it, idx) => ({
    id: String(idx + 1),
    name: it.name,
    url: c.baseUrl,
    path: it.path
  }));
}

async function sendRandom(req, res, mode) {
  const type = getType(req.query.type, '302');
  const orientation = mode === 'ua' ? pickOrientationByReq(req) : normalizeOrientation(mode);

  let c = null;
  try {
    c = await getCacheNonBlocking(orientation);
  } catch (e) {
    if (caches[orientation] && caches[orientation].items && caches[orientation].items.length > 0) c = caches[orientation];
    else {
      const code = Number(e?.statusCode) || 502;
      return res.status(code).json({ status: 'error', time: Date.now(), message: String(e?.message || e) });
    }
  }

  if (!c || c.urls.length === 0) {
    return res.status(502).json({ status: 'error', time: Date.now(), message: '未获取到图片列表' });
  }

  const idx = Math.floor(Math.random() * c.urls.length);
  const fullUrl = c.urls[idx];
  const it = c.items[idx] || { name: '', path: '' };
  const data = {
    id: String(idx + 1),
    name: it.name,
    url: c.baseUrl,
    path: it.path,
    fullUrl
  };

  if (type === '302') {
    return res.redirect(302, fullUrl);
  }
  if (type === 'img') {
    try {
      const timeout = Number(config?.timeout_ms) || 10000;
      const r = await axios.get(fullUrl, {
        responseType: 'stream',
        timeout,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36 Edg/141.0.0.0',
          'Accept': 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8'
        },
        validateStatus: () => true
      });

      if (!r || !r.data) {
        return res.status(502).json({ status: 'error', time: Date.now(), message: '图片响应为空' });
      }

      const status = Number(r.status) || 502;
      res.status(status);
      if (r.headers && r.headers['content-type']) res.set('Content-Type', String(r.headers['content-type']));
      if (r.headers && r.headers['content-length']) res.set('Content-Length', String(r.headers['content-length']));
      if (r.headers && r.headers['etag']) res.set('ETag', String(r.headers['etag']));

      r.data.on('error', e => {
        if (!res.headersSent) res.status(502).end(String(e?.message || e));
        else res.end();
      });

      r.data.pipe(res);
      return;
    } catch (e) {
      return res.status(502).json({ status: 'error', time: Date.now(), message: String(e?.message || e) });
    }
  }
  if (type === 'text') {
    res.type('text/plain; charset=utf-8');
    return res.send(fullUrl);
  }
  if (type === 'json') {
    return res.json({ status: 'success', time: Date.now(), data });
  }

  return res.status(400).json({ status: 'error', time: Date.now(), message: 'type仅支持text/json/302/img' });
}

async function sendList(req, res, mode) {
  const type = getType(req.query.type, 'json');
  const orientation = mode === 'ua' ? pickOrientationByReq(req) : normalizeOrientation(mode);

  let c = null;
  try {
    c = await getCacheNonBlocking(orientation);
  } catch (e) {
    if (caches[orientation] && caches[orientation].items && caches[orientation].items.length > 0) c = caches[orientation];
    else {
      const code = Number(e?.statusCode) || 502;
      return res.status(code).json({ status: 'error', time: Date.now(), message: String(e?.message || e) });
    }
  }

  if (!c || c.urls.length === 0) {
    return res.status(502).json({ status: 'error', time: Date.now(), message: '未获取到图片列表' });
  }

  if (type === 'text') {
    res.type('text/plain; charset=utf-8');
    return res.send(c.urls.join('\n'));
  }
  if (type === 'json') {
    const data = buildListResponseData(c);
    return res.json({ status: 'success', total: data.length, time: Date.now(), data });
  }

  return res.status(400).json({ status: 'error', time: Date.now(), message: 'type仅支持text/json' });
}

router.get('/', (req, res) => sendRandom(req, res, 'ua'));
router.get('/ua', (req, res) => sendRandom(req, res, 'ua'));
router.get('/h', (req, res) => sendRandom(req, res, 'horizontal'));
router.get('/v', (req, res) => sendRandom(req, res, 'vertical'));

router.get('/list', (req, res) => sendList(req, res, 'ua'));
router.get('/list/h', (req, res) => sendList(req, res, 'horizontal'));
router.get('/list/v', (req, res) => sendList(req, res, 'vertical'));

module.exports = router;
